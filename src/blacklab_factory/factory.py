from __future__ import annotations

from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from threading import Lock
from typing import Callable
import time
from pathlib import Path

from blacklab_factory.agents import DepartmentRunHooks, build_agent
from blacklab_factory.config import load_company_config, repo_root
from blacklab_factory.models import CompanyConfig, DepartmentConfig, ProcessRecord, RunMode, RunSettings, RunState, StepRecord, utc_now
from blacklab_factory.storage import RunStorage


class FactoryRunner:
    def __init__(self, storage_root: Path | None = None, config: CompanyConfig | None = None) -> None:
        self.config = config or load_company_config()
        base = storage_root or (repo_root() / ".factory")
        self.storage = RunStorage(base)

    def start(
        self,
        mission: str,
        mode: RunMode | None = None,
        pause_between_departments: float = 0,
        max_parallel_departments: int | None = None,
        run_settings: RunSettings | None = None,
        on_run_created: Callable[[RunState], None] | None = None,
    ) -> RunState:
        selected_mode = mode or self.config.default_mode
        parallel_limit = max(1, max_parallel_departments or self.config.max_parallel_departments)
        effective_settings = (run_settings.model_copy(deep=True) if run_settings else RunSettings())
        effective_settings.max_parallel_departments = parallel_limit
        workflow_departments = self._build_workflow_departments()
        base_department_keys = {department.key for department in self.config.departments}
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
        state.status = "running"
        state.current_status = "Run queued and preparing the first execution wave."
        state.next_action = "The first ready departments are preparing their execution packets."
        self.storage.save_state(state)
        if on_run_created is not None:
            on_run_created(state)
        self.storage.append_log(state.run_id, f"Run started in {selected_mode} mode for mission: {mission}")

        agent = build_agent(selected_mode)
        step_by_key = {step.department_key: step for step in state.steps}
        completed_keys: set[str] = set()
        lock = Lock()
        active_step: StepRecord | None = None

        try:
            with ThreadPoolExecutor(max_workers=parallel_limit) as executor:
                futures: dict[Future, tuple[StepRecord, object]] = {}

                while len(completed_keys) < len(workflow_departments):
                    for department in workflow_departments:
                        step = step_by_key[department.key]
                        if step.status != "pending":
                            continue
                        if len(futures) >= parallel_limit:
                            break
                        if not self._department_is_runnable(
                            department=department,
                            completed_keys=completed_keys,
                            base_department_keys=base_department_keys,
                        ):
                            continue

                        step.status = "running"
                        step.started_at = utc_now()
                        self._refresh_runtime_snapshot(state)
                        state.current_status = f"{department.label} is preparing its execution packet."
                        state.next_action = f"{department.label} is generating {department.output_title}."
                        self.storage.save_state(state)
                        self.storage.append_log(state.run_id, f"{department.label} started.")

                        hooks = self._build_hooks(state=state, department_label=department.label, lock=lock)
                        snapshot = state.model_copy(deep=True)
                        future = executor.submit(agent.run, self.config, department, snapshot, hooks)
                        futures[future] = (step, department)

                    if not futures:
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

                    if pause_between_departments > 0 and len(completed_keys) < len(workflow_departments):
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
        state.current_status = "Run completed."
        state.next_action = "Inspect dashboard, decide whether to launch another run, or tighten the company config."
        self.storage.save_state(state)
        self.storage.append_log(state.run_id, "Run completed.")
        return state

    def list_runs(self) -> list[RunState]:
        return self.storage.list_runs()

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

    def _build_workflow_departments(self) -> list[DepartmentConfig]:
        workflow_departments = list(self.config.departments)
        review_departments = list(self.config.review_departments)
        workflow_departments.extend(review_departments)
        if not self.config.enable_final_review:
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
