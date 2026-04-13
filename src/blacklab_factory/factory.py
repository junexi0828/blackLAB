from __future__ import annotations

from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from collections import Counter
from threading import Lock
from typing import Callable
import time
from pathlib import Path

from blacklab_factory.agents import DepartmentRunHooks, build_agent
from blacklab_factory.config import load_company_config, repo_root
from blacklab_factory.models import CompanyConfig, DepartmentConfig, ProcessRecord, RunMode, RunSettings, RunState, StepRecord, utc_now
from blacklab_factory.resources import RuntimeResourceManager
from blacklab_factory.storage import ProjectStorage, RunStorage


class FactoryRunner:
    def __init__(self, storage_root: Path | None = None, config: CompanyConfig | None = None) -> None:
        self.config = config or load_company_config()
        base = storage_root or (repo_root() / ".factory")
        self.storage = RunStorage(base)
        self.projects = ProjectStorage(base)
        self.resource_manager = RuntimeResourceManager()

    def start(
        self,
        mission: str,
        mode: RunMode | None = None,
        pause_between_departments: float = 0,
        max_parallel_departments: int | None = None,
        run_settings: RunSettings | None = None,
        on_run_created: Callable[[RunState], None] | None = None,
        project_slug: str | None = None,
    ) -> RunState:
        normalized_project_slug = self.projects.normalize_slug(project_slug) if project_slug else None
        existing_project = self.projects.get_project(normalized_project_slug) if normalized_project_slug else None
        if existing_project and existing_project.status == "archived":
            raise RuntimeError(
                f"Project '{normalized_project_slug}' is archived and must be restored before starting a new run."
            )
        selected_mode = mode or self.config.default_mode
        parallel_limit = max(1, max_parallel_departments or self.config.max_parallel_departments)
        effective_settings = (run_settings.model_copy(deep=True) if run_settings else RunSettings())
        effective_settings.max_parallel_departments = parallel_limit
        workflow_departments = self._build_workflow_departments(effective_settings.active_department_keys)
        base_department_keys = {
            department.key
            for department in workflow_departments
            if department.runtime_tier == "core"
        }
        steps = [
            StepRecord(
                department_key=department.key,
                department_label=department.label,
                purpose=department.purpose,
            )
            for department in workflow_departments
        ]
        state = self.storage.create_run(
            mission=mission,
            company_name=self.config.company_name,
            mode=selected_mode,
            steps=steps,
            settings=effective_settings,
        )
        state.project_slug = normalized_project_slug
        state.status = "running"
        state.current_status = "Run queued and preparing the first execution wave."
        state.next_action = "The first ready departments are preparing their execution packets."
        state.metrics["requested_parallel_departments"] = parallel_limit
        self.storage.save_state(state)
        if on_run_created is not None:
            on_run_created(state)
        self.storage.append_log(state.run_id, f"Run started in {selected_mode} mode for mission: {mission}")

        # ── Project: load context + memory and ensure project exists ────────
        project_context = ""
        if normalized_project_slug:
            # Auto-create the project record if it doesn't exist yet
            if not existing_project:
                self.projects.create_project(
                    slug=normalized_project_slug,
                    name=normalized_project_slug.replace("-", " ").title(),
                )
            project = self.projects.get_project(normalized_project_slug)
            if project:
                state.project_name = project.name
            project_context = self.projects.build_project_prompt_block(normalized_project_slug)
            self.storage.append_log(
                state.run_id,
                f"Project '{normalized_project_slug}' context loaded ({len(project_context)} chars).",
            )

        agent = build_agent(selected_mode)
        step_by_key = {step.department_key: step for step in state.steps}
        completed_keys: set[str] = set()
        lock = Lock()
        active_step: StepRecord | None = None
        last_effective_parallel_limit: int | None = None
        operator_directives: list[str] = []

        try:
            with ThreadPoolExecutor(max_workers=parallel_limit) as executor:
                futures: dict[Future, tuple[StepRecord, object]] = {}

                while len(completed_keys) < len(workflow_departments):
                    persisted_state = self.storage.load_state(state.run_id)
                    if persisted_state.stop_requested and not state.stop_requested:
                        state.stop_requested = True
                        state.status = "stopping"
                        state.current_status = "Stop requested. Finishing the current department wave before ending the run."
                        state.next_action = "No new departments will be launched."
                        self.storage.save_state(state)

                    new_directives = self.storage.consume_directives(state.run_id)
                    if new_directives:
                        operator_directives.extend(
                            directive.content for directive in new_directives if directive.content.strip()
                        )
                        latest_directive = new_directives[-1].content.strip()
                        state.current_status = "Operator directive received and queued for the next available department wave."
                        state.next_action = latest_directive
                        self.storage.save_state(state)
                        self.storage.append_log(
                            state.run_id,
                            f"Operator directive applied to next wave: {latest_directive}",
                        )

                    resource_snapshot = self.resource_manager.snapshot(
                        requested_parallelism=parallel_limit,
                        active_workers=len(futures),
                    )
                    state.metrics["effective_parallel_departments"] = resource_snapshot.effective_parallelism
                    state.metrics["resource_cpu_count"] = resource_snapshot.cpu_count
                    state.metrics["resource_load_ratio"] = resource_snapshot.load_ratio or 0
                    state.metrics["resource_memory_available_mb"] = resource_snapshot.memory_available_mb or 0
                    state.metrics["resource_memory_total_mb"] = resource_snapshot.memory_total_mb or 0
                    state.metrics["resource_memory_available_ratio"] = resource_snapshot.memory_available_ratio or 0
                    state.metrics["resource_governor_reason"] = resource_snapshot.reason
                    if last_effective_parallel_limit != resource_snapshot.effective_parallelism:
                        self.storage.append_log(
                            state.run_id,
                            (
                                "Orchestrator adjusted effective parallelism to "
                                f"{resource_snapshot.effective_parallelism}/{parallel_limit}. "
                                f"{resource_snapshot.reason}"
                            ),
                        )
                        last_effective_parallel_limit = resource_snapshot.effective_parallelism

                    if not state.stop_requested:
                        active_departments = [department for _, department in futures.values()]
                        launch_wave = self._select_departments_for_launch(
                            workflow_departments=workflow_departments,
                            step_by_key=step_by_key,
                            completed_keys=completed_keys,
                            base_department_keys=base_department_keys,
                            active_departments=active_departments,
                            parallel_limit=resource_snapshot.effective_parallelism,
                        )
                        for department in launch_wave:
                            step = step_by_key[department.key]

                            step.status = "running"
                            step.started_at = utc_now()
                            self._refresh_runtime_snapshot(state)
                            state.current_status = f"{department.label} is preparing its execution packet."
                            state.next_action = f"{department.label} is generating {department.output_title}."
                            self.storage.save_state(state)
                            self.storage.append_log(state.run_id, f"{department.label} started.")

                            hooks = self._build_hooks(state=state, department_label=department.label, lock=lock)
                            snapshot = state.model_copy(deep=True)
                            # Use project shared workspace if project_slug is set;
                            # otherwise fall back to the run-scoped sandbox.
                            if normalized_project_slug:
                                workspace = self.projects.workspace_dir(normalized_project_slug)
                            else:
                                workspace = self.storage.workspace_dir(state.run_id)
                            future = executor.submit(
                                agent.run,
                                self.config,
                                department,
                                snapshot,
                                hooks,
                                workspace,
                                project_context,
                                self._build_directive_context(operator_directives),
                            )
                            futures[future] = (step, department)
                    else:
                        state.current_status = "Stop requested. Waiting for the current department wave to finish."
                        state.next_action = "The run will close once the active workers finish."
                        self.storage.save_state(state)

                    if not futures:
                        if state.stop_requested:
                            break
                        unresolved = [dep.key for dep in workflow_departments if step_by_key[dep.key].status == "pending"]
                        raise RuntimeError(f"No runnable departments remain. Check dependencies: {', '.join(unresolved)}")

                    done, _ = wait(futures.keys(), return_when=FIRST_COMPLETED)
                    for future in done:
                        step, department = futures.pop(future)
                        active_step = step
                        result = future.result()

                        with lock:
                            artifact = self.storage.save_artifact(
                                state=state,
                                department_key=department.key,
                                title=department.output_title,
                                content=result.artifact_body,
                            )

                            step.status = "completed"
                            step.completed_at = utc_now()
                            step.summary = result.summary
                            step.artifact_filename = artifact.filename
                            state.summary = result.summary
                            state.risks = sorted({*state.risks, *result.risks})
                            completed_keys.add(department.key)
                            self._refresh_runtime_snapshot(state)
                            completed = len(completed_keys)
                            state.metrics["departments_completed"] = completed
                            state.metrics["open_risks"] = len(state.risks)
                            state.metrics["progress_percent"] = int((completed / max(len(workflow_departments), 1)) * 100)
                            state.metrics["artifact_count"] = len(state.artifacts)
                            state.metrics["open_risk_count"] = len(state.risks)
                            state.current_status = f"{department.label} completed."
                            state.next_action = result.next_action
                            self.storage.save_state(state)
                            self.storage.append_log(state.run_id, f"{department.label} completed. Artifact: {artifact.filename}")
                        active_step = None

                    if pause_between_departments > 0 and len(completed_keys) < len(workflow_departments) and not state.stop_requested:
                        state.current_status = "Paused for operator inspection before launching the next ready department."
                        self.storage.save_state(state)
                        time.sleep(pause_between_departments)
        except Exception as exc:
            if active_step is not None:
                active_step.status = "failed"
            state.status = "failed"
            state.current_processes = []
            self._refresh_runtime_snapshot(state)
            state.current_status = f"Run failed: {exc}"
            state.summary = str(exc)
            state.risks = sorted({*state.risks, f"Factory runtime failure: {exc}"})
            state.metrics["open_risks"] = len(state.risks)
            state.metrics["open_risk_count"] = len(state.risks)
            self.storage.save_state(state)
            self.storage.append_log(state.run_id, f"Run failed: {exc}")
            raise

        state.status = "completed"
        state.current_processes = []
        self._refresh_runtime_snapshot(state)
        if state.stop_requested:
            state.current_status = "Run stopped by operator request."
            state.next_action = "Inspect the completed artifacts so far or launch a fresh run."
            self.storage.append_log(state.run_id, "Run stopped by operator request.")
        else:
            state.current_status = "Run completed."
            state.next_action = "Inspect dashboard, decide whether to launch another run, or tighten the company config."
            self.storage.append_log(state.run_id, "Run completed.")
        self.storage.save_state(state)

        # ── Project: seed foundation once, refresh live context every run, append memory ─
        if normalized_project_slug:
            board_artifact = next(
                (a for a in state.artifacts if "board" in a.department_key.lower()),
                None,
            )
            foundation_source = board_artifact or next(
                (a for a in state.artifacts if "ceo" in a.department_key.lower()),
                state.artifacts[-1] if state.artifacts else None,
            )
            existing_ctx = self.projects.read_context(normalized_project_slug)
            if not existing_ctx.strip() and foundation_source:
                raw = self.storage.read_artifact(foundation_source.path)
                self.projects.write_context(normalized_project_slug, raw)
                self.storage.append_log(
                    state.run_id,
                    f"Project '{normalized_project_slug}' foundation seeded from {foundation_source.title}.",
                )
            if foundation_source:
                live_raw = self.storage.read_artifact(foundation_source.path)
                self.projects.write_live_context(
                    normalized_project_slug,
                    run_id=state.run_id,
                    title=foundation_source.title,
                    content=live_raw,
                )
                self.storage.append_log(
                    state.run_id,
                    f"Project '{normalized_project_slug}' live context refreshed from {foundation_source.title}.",
                )
            # Always append this run's summary to memory.md
            decisions = [s.summary for s in state.steps if s.summary][:6]
            self.projects.append_memory(
                slug=normalized_project_slug,
                run_id=state.run_id,
                mission=state.mission,
                run_summary=state.summary or "Run completed.",
                decisions=decisions,
                next_run_hint=state.next_action,
                risks=list(state.risks)[:3],
            )
            self.storage.append_log(state.run_id, f"Project '{normalized_project_slug}' memory updated.")

        return state

    def _build_directive_context(self, directives: list[str]) -> str:
        if not directives:
            return ""
        recent = directives[-6:]
        lines = [
            "- Apply these live operator directives unless they would violate project safety constraints or validated hard requirements.",
        ]
        lines.extend(f"- {directive}" for directive in recent)
        return "\n".join(lines)

    def list_runs(self) -> list[RunState]:
        runs, _ = self.storage.list_runs()
        return runs

    def get_run(self, run_id: str) -> RunState:
        return self.storage.load_state(run_id)

    def _build_hooks(self, state: RunState, department_label: str, lock: Lock) -> DepartmentRunHooks:
        def on_status(message: str) -> None:
            with lock:
                state.current_status = message
                self.storage.save_state(state)

        def on_process_start(pid: int, command_preview: str) -> None:
            with lock:
                state.current_processes.append(
                    ProcessRecord(
                        label=department_label,
                        pid=pid,
                        command_preview=command_preview,
                        status="running",
                    )
                )
                self._refresh_runtime_snapshot(state)
                self.storage.save_state(state)
                self.storage.append_log(state.run_id, f"{department_label}: worker pid {pid} started.")

        def on_process_finish(pid: int, exit_code: int) -> None:
            with lock:
                for index, process in enumerate(state.current_processes):
                    if process.pid != pid:
                        continue
                    process.status = "completed" if exit_code == 0 else "failed"
                    process.ended_at = utc_now()
                    process.exit_code = exit_code
                    state.process_history.append(process.model_copy(deep=True))
                    state.process_history = state.process_history[-20:]
                    state.current_processes.pop(index)
                    break
                self._refresh_runtime_snapshot(state)
                self.storage.save_state(state)
                self.storage.append_log(state.run_id, f"{department_label}: worker pid {pid} exited with code {exit_code}.")

        def on_log(message: str) -> None:
            with lock:
                self.storage.append_log(state.run_id, message)

        return DepartmentRunHooks(
            on_status=on_status,
            on_process_start=on_process_start,
            on_process_finish=on_process_finish,
            on_log=on_log,
        )

    def _refresh_runtime_snapshot(self, state: RunState) -> None:
        active_departments = [step.department_label for step in state.steps if step.status == "running"]
        state.current_department = ", ".join(active_departments) if active_departments else None
        state.metrics["active_workers"] = len(state.current_processes)

    def _build_workflow_departments(self, active_department_keys: list[str] | None = None) -> list[DepartmentConfig]:
        allowed_keys = set(active_department_keys or [])
        if not allowed_keys:
            allowed_keys = {
                department.key for department in self.config.departments + self.config.review_departments
            }
            if self.config.enable_final_review:
                allowed_keys.add("board_review")

        workflow_departments = [
            department
            for department in self.config.departments
            if department.key in allowed_keys
        ]
        review_departments = [
            department
            for department in self.config.review_departments
            if department.key in allowed_keys
        ]
        workflow_departments.extend(review_departments)
        if not self.config.enable_final_review or "board_review" not in allowed_keys or not workflow_departments:
            return workflow_departments
        review_keys = [department.key for department in review_departments]
        workflow_departments.append(
            DepartmentConfig(
                key="board_review",
                label=self.config.final_review_label,
                purpose=(
                    "Synthesize all department outputs, resolve contradictions, "
                    "and publish one operator-ready execution brief."
                ),
                output_title=self.config.final_review_output_title,
                temperature=0.1,
                runtime_tier="review",
                resource_lane="review",
                priority=40,
                depends_on=review_keys,
                requires_all_completed=not review_keys,
            )
        )
        return workflow_departments

    def _department_is_runnable(
        self,
        department: DepartmentConfig,
        completed_keys: set[str],
        base_department_keys: set[str],
    ) -> bool:
        if department.requires_all_completed:
            return base_department_keys.issubset(completed_keys)
        if department.depends_on:
            return all(dep in completed_keys for dep in department.depends_on)
        if self.config.parallel_strategy == "full_parallel":
            return True
        return True

    def _select_departments_for_launch(
        self,
        workflow_departments: list[DepartmentConfig],
        step_by_key: dict[str, StepRecord],
        completed_keys: set[str],
        base_department_keys: set[str],
        active_departments: list[DepartmentConfig],
        parallel_limit: int,
    ) -> list[DepartmentConfig]:
        available_slots = max(0, parallel_limit - len(active_departments))
        if available_slots == 0:
            return []

        ready_departments = [
            department
            for department in workflow_departments
            if step_by_key[department.key].status == "pending"
            and self._department_is_runnable(
                department=department,
                completed_keys=completed_keys,
                base_department_keys=base_department_keys,
            )
        ]
        if not ready_departments:
            return []

        lane_limits = self._lane_limits(
            parallel_limit=parallel_limit,
            present_departments=ready_departments + active_departments,
        )
        lane_usage = Counter(department.resource_lane for department in active_departments)
        ordered_ready = sorted(
            ready_departments,
            key=lambda department: (department.priority, department.label),
        )

        selected: list[DepartmentConfig] = []
        for department in ordered_ready:
            lane = department.resource_lane
            if lane_usage[lane] >= lane_limits.get(lane, parallel_limit):
                continue
            selected.append(department)
            lane_usage[lane] += 1
            if len(selected) >= available_slots:
                return selected

        # If a lane budget leaves capacity unused, let the orchestrator spill
        # remaining slots to the highest-priority ready departments.
        for department in ordered_ready:
            if department in selected:
                continue
            selected.append(department)
            if len(selected) >= available_slots:
                break

        return selected

    def _lane_limits(
        self,
        parallel_limit: int,
        present_departments: list[DepartmentConfig],
    ) -> dict[str, int]:
        hard_caps = {
            "strategy": 4,
            "delivery": 3,
            "review": 2,
        }
        weights = {
            "strategy": 4,
            "delivery": 3,
            "review": 2,
        }
        present_lanes = {department.resource_lane for department in present_departments}
        if not present_lanes:
            return {}

        limits = {lane: 0 for lane in present_lanes}
        remaining = parallel_limit

        for lane in sorted(present_lanes, key=lambda lane: -weights[lane]):
            if remaining <= 0:
                break
            limits[lane] = 1
            remaining -= 1

        while remaining > 0:
            candidates = [lane for lane in present_lanes if limits[lane] < hard_caps[lane]]
            if not candidates:
                break
            lane = max(
                candidates,
                key=lambda candidate: (weights[candidate] - limits[candidate], weights[candidate], -limits[candidate]),
            )
            limits[lane] += 1
            remaining -= 1

        return limits
