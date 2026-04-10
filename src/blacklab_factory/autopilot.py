from __future__ import annotations

from datetime import datetime, timedelta
import re
import time
from dataclasses import dataclass
from pathlib import Path

from blacklab_factory.factory import FactoryRunner
from blacklab_factory.models import (
    DEFAULT_REVIEW_CODEX_AUTONOMY,
    DEFAULT_REVIEW_CODEX_MODEL,
    RecoveryIncidentRecord,
    RunState,
    LoopIterationRecord,
    LoopMode,
    LoopState,
    RunMode,
    RunSettings,
)
from blacklab_factory.storage import LoopStorage, RunStorage


@dataclass
class LoopRunRequest:
    objective: str
    loop_mode: LoopMode
    run_mode: RunMode
    run_settings: RunSettings
    interval_seconds: int = 0
    max_iterations: int | None = None
    pause_between_departments: float = 0
    max_parallel_departments: int | None = None
    project_slug: str | None = None
    max_recovery_attempts: int = 3
    recovery_backoff_seconds: int = 5


class AutopilotSupervisor:
    def __init__(self, storage_root: Path | None = None) -> None:
        self.runner = FactoryRunner(storage_root=storage_root)
        self.loop_storage = LoopStorage(self.runner.storage.root)

    def start_loop(self, request: LoopRunRequest) -> LoopState:
        loop_state = self.loop_storage.create_loop(
            objective=request.objective,
            loop_mode=request.loop_mode,
            run_mode=request.run_mode,
            run_settings=request.run_settings,
            interval_seconds=request.interval_seconds,
            max_iterations=request.max_iterations,
        )
        loop_state.project_slug = request.project_slug
        loop_state.max_recovery_attempts = request.max_recovery_attempts
        
        # Optionally populate project_name if project exists
        if request.project_slug:
            project = self.runner.projects.get_project(request.project_slug)
            if project:
                loop_state.project_name = project.name
        
        self.loop_storage.append_log(loop_state.loop_id, "Autopilot loop created.")
        return loop_state

    def run_loop(self, request: LoopRunRequest, loop_id: str | None = None) -> LoopState:
        loop_state = self.loop_storage.load_state(loop_id) if loop_id else self.start_loop(request)
        loop_state.status = "running"
        loop_state.latest_note = "Autopilot loop is active."
        self.loop_storage.save_state(loop_state)
        self.loop_storage.append_log(loop_state.loop_id, "Autopilot loop started.")
        operator_directives: list[str] = []

        while True:
            loop_state = self.loop_storage.load_state(loop_state.loop_id)
            new_directives = self.loop_storage.consume_directives(loop_state.loop_id)
            if new_directives:
                operator_directives.extend(
                    directive.content for directive in new_directives if directive.content.strip()
                )
                latest_directive = new_directives[-1].content.strip()
                loop_state.latest_note = "Operator directive queued for the next iteration."
                self.loop_storage.save_state(loop_state)
                self.loop_storage.append_log(
                    loop_state.loop_id,
                    f"Operator directive queued for next iteration: {latest_directive}",
                )
            if loop_state.stop_requested:
                loop_state.status = "completed"
                loop_state.latest_note = "Autopilot stop request received."
                self.loop_storage.save_state(loop_state)
                self.loop_storage.append_log(loop_state.loop_id, "Autopilot loop stopped by operator request.")
                return loop_state

            if loop_state.loop_mode == "full_auto" and loop_state.max_iterations is not None:
                if loop_state.iterations_completed >= loop_state.max_iterations:
                    loop_state.status = "completed"
                    loop_state.latest_note = "Full auto loop reached its configured iteration limit."
                    self.loop_storage.save_state(loop_state)
                    self.loop_storage.append_log(loop_state.loop_id, "Autopilot loop completed.")
                    return loop_state

            iteration_number = loop_state.iterations_completed + 1
            mission = self._build_iteration_mission(
                loop_state,
                iteration_number,
                directive_context=self._build_directive_context(operator_directives),
            )
            loop_state.current_iteration = iteration_number
            loop_state.latest_note = f"Launching run {iteration_number}."
            loop_state.runs.append(LoopIterationRecord(iteration=iteration_number))
            self.loop_storage.save_state(loop_state)
            self.loop_storage.append_log(loop_state.loop_id, f"Launching run {iteration_number}.")

            effective_run_settings = self._build_iteration_run_settings(loop_state, request.run_settings)
            effective_parallel_limit = self._build_iteration_parallel_limit(
                loop_state=loop_state,
                requested_parallelism=request.max_parallel_departments,
            )
            run_state = self.runner.start(
                mission=mission,
                mode=request.run_mode,
                pause_between_departments=request.pause_between_departments,
                max_parallel_departments=effective_parallel_limit,
                run_settings=effective_run_settings,
                project_slug=request.project_slug,
            )

            loop_state = self.loop_storage.load_state(loop_state.loop_id)
            loop_state.current_run_id = run_state.run_id
            loop_state.iterations_completed = iteration_number
            loop_state.summary = run_state.summary
            loop_state.latest_note = f"Run {iteration_number} completed with status {run_state.status}."
            loop_state.runs[-1].run_id = run_state.run_id
            loop_state.runs[-1].status = run_state.status
            loop_state.runs[-1].summary = run_state.summary
            loop_state.runs[-1].completed_at = run_state.updated_at

            if run_state.status == "failed":
                incident = self._build_recovery_incident(loop_state, run_state)
                loop_state.incidents.append(incident)
                loop_state.incidents = loop_state.incidents[-12:]
                loop_state.total_recovery_activations += 1
                loop_state.summary = incident.headline
                self.loop_storage.save_state(loop_state)
                self.loop_storage.append_log(loop_state.loop_id, f"Run {iteration_number} failed.")
                self.loop_storage.append_log(
                    loop_state.loop_id,
                    f"Task Force: {incident.task_force}",
                )
                self.loop_storage.append_log(
                    loop_state.loop_id,
                    f"Rapid Response: {incident.rapid_response}",
                )
                self.loop_storage.append_log(
                    loop_state.loop_id,
                    f"Recovery Ops: {incident.recovery_ops}",
                )

                if loop_state.stop_requested:
                    loop_state.status = "completed"
                    loop_state.latest_note = "Loop stopped after a failed cycle and recovery was skipped by operator request."
                    self.loop_storage.save_state(loop_state)
                    self.loop_storage.append_log(loop_state.loop_id, "Recovery skipped because stop was requested.")
                    return loop_state

                if incident.failure_type == "usage_limit":
                    wait_seconds = incident.wait_seconds or max(request.recovery_backoff_seconds, 300)
                    wait_minutes = max(1, wait_seconds // 60)
                    loop_state.latest_note = (
                        f"Usage limit reached. Recovery is waiting about {wait_minutes} minutes "
                        "before the next rescue cycle."
                    )
                    self.loop_storage.save_state(loop_state)
                    self.loop_storage.append_log(
                        loop_state.loop_id,
                        f"Usage limit hold engaged for {wait_seconds}s before retry.",
                    )
                    self._sleep_recovery_backoff(loop_state, wait_seconds)
                    continue

                loop_state.consecutive_failures += 1
                loop_state.latest_note = (
                    f"Recovery team active after run {iteration_number} failed. "
                    f"Attempt {loop_state.consecutive_failures}/{loop_state.max_recovery_attempts}."
                )
                self.loop_storage.save_state(loop_state)

                if loop_state.consecutive_failures > loop_state.max_recovery_attempts:
                    loop_state.status = "failed"
                    loop_state.latest_note = "Autopilot loop stopped after exhausting recovery attempts."
                    self.loop_storage.save_state(loop_state)
                    self.loop_storage.append_log(loop_state.loop_id, "Recovery attempts exhausted.")
                    return loop_state

                self._sleep_recovery_backoff(loop_state, request.recovery_backoff_seconds)
                continue

            loop_state.consecutive_failures = 0
            self.loop_storage.save_state(loop_state)
            self.loop_storage.append_log(loop_state.loop_id, f"Run {iteration_number} completed: {run_state.run_id}.")

            if loop_state.loop_mode == "full_auto" and loop_state.max_iterations is not None:
                if loop_state.iterations_completed >= loop_state.max_iterations:
                    loop_state.status = "completed"
                    loop_state.latest_note = "Full auto loop reached its configured iteration limit."
                    self.loop_storage.save_state(loop_state)
                    self.loop_storage.append_log(loop_state.loop_id, "Autopilot loop completed.")
                    return loop_state

            self._sleep_between_cycles(loop_state)

    def request_stop(self, loop_id: str) -> LoopState:
        loop_state = self.loop_storage.load_state(loop_id)
        loop_state.stop_requested = True
        if loop_state.status == "running":
            loop_state.status = "stopping"
        loop_state.latest_note = "Operator requested the loop to stop after the current cycle."
        self.loop_storage.save_state(loop_state)
        self.loop_storage.append_log(loop_id, "Stop requested.")
        return loop_state

    def _build_iteration_mission(
        self,
        loop_state: LoopState,
        iteration_number: int,
        directive_context: str = "",
    ) -> str:
        directive_block = (
            "\nOperator directives for this cycle:\n"
            f"{directive_context}\n"
            if directive_context.strip()
            else ""
        )
        if loop_state.runs and loop_state.runs[-1].status == "failed" and loop_state.incidents:
            latest_incident = loop_state.incidents[-1]
            latest_successful_run = self._latest_successful_run(loop_state)
            last_artifact = (
                latest_successful_run.artifacts[-1].preview
                if latest_successful_run and latest_successful_run.artifacts
                else "No successful operator briefing is available yet."
            )
            return "\n".join(
                [
                    loop_state.objective,
                    "",
                    f"Recovery iteration {iteration_number}.",
                    "The previous run failed. Do not restart from scratch. Preserve validated decisions and recover the execution lane.",
                    "",
                    "Recovery Teams",
                    f"- Task Force: {latest_incident.task_force}",
                    f"- Rapid Response: {latest_incident.rapid_response}",
                    f"- Recovery Ops: {latest_incident.recovery_ops}",
                    "",
                    "Latest successful operator briefing excerpt:",
                    last_artifact,
                    directive_block.rstrip(),
                    "",
                    "Execution rule:",
                    "Keep the project wedge fixed, reuse validated conclusions, focus on the failed lane, and finish with an updated operator briefing.",
                ]
            )

        if not loop_state.runs or not loop_state.runs[-1].run_id:
            return (
                f"{loop_state.objective}\n\n"
                "Operate as a venture factory. Follow this loop inside the company run: "
                "plan -> design -> validate -> improve. Finish with one operator briefing."
            )

        previous_run = self.runner.get_run(loop_state.runs[-1].run_id)
        last_artifact = previous_run.artifacts[-1].preview if previous_run.artifacts else "No previous operator briefing."
        unresolved_risks = "\n".join(f"- {risk}" for risk in previous_run.risks[:5]) or "- No open risks recorded."
        return "\n".join(
            [
                loop_state.objective,
                "",
                f"Autopilot iteration {iteration_number}.",
                "Improve the system using the previous operator briefing and open risks.",
                "",
                "Previous operator briefing excerpt:",
                last_artifact,
                "",
                "Open risks to address:",
                unresolved_risks,
                directive_block.rstrip(),
                "",
                "Run the loop again and finish with a tighter operator briefing.",
            ]
        )

    def _build_directive_context(self, directives: list[str]) -> str:
        if not directives:
            return ""
        recent = directives[-6:]
        return "\n".join(f"- {directive}" for directive in recent)

    def _sleep_between_cycles(self, loop_state: LoopState) -> None:
        if loop_state.interval_seconds <= 0:
            return
        remaining = loop_state.interval_seconds
        while remaining > 0:
            current = self.loop_storage.load_state(loop_state.loop_id)
            if current.stop_requested:
                return
            if remaining == loop_state.interval_seconds or remaining <= 5 or remaining % 15 == 0:
                current.latest_note = f"Next cycle resumes in {remaining}s."
                self.loop_storage.save_state(current)
            time.sleep(1)
            remaining -= 1

    def _sleep_recovery_backoff(self, loop_state: LoopState, seconds: int) -> None:
        if seconds <= 0:
            return
        self.loop_storage.append_log(loop_state.loop_id, f"Recovery backoff for {seconds}s.")
        remaining = seconds
        while remaining > 0:
            current = self.loop_storage.load_state(loop_state.loop_id)
            if current.stop_requested:
                return
            if remaining == seconds or remaining <= 5 or remaining % 30 == 0:
                current.latest_note = f"Recovery hold active. Next rescue cycle in {remaining}s."
                self.loop_storage.save_state(current)
            time.sleep(1)
            remaining -= 1

    def _latest_successful_run(self, loop_state: LoopState) -> RunState | None:
        for record in reversed(loop_state.runs):
            if record.status != "completed" or not record.run_id:
                continue
            try:
                return self.runner.get_run(record.run_id)
            except FileNotFoundError:
                continue
        return None

    def _build_recovery_incident(self, loop_state: LoopState, run_state: RunState) -> RecoveryIncidentRecord:
        failure_text = f"{run_state.current_status}\n{run_state.summary}".lower()
        wait_seconds = None
        if "usage limit" in failure_text or "more credits" in failure_text:
            failure_type = "usage_limit"
            task_force = "Usage quota stopped the run before the board packet finished."
            rapid_response = "Keep core model quality, but force review lanes to lightweight defaults and avoid wasting compute on repeated review churn."
            recovery_ops = "Resume the same project with a rescue mission focused on synthesizing validated department work into one updated operator briefing."
            wait_seconds = self._usage_limit_wait_seconds(run_state)
        elif "timeout" in failure_text:
            failure_type = "timeout"
            task_force = "A worker timed out before completing its lane."
            rapid_response = "Reduce operational load and tighten the next cycle around the highest-value unfinished work."
            recovery_ops = "Retry with the same project context, lower effective concurrency pressure, and prioritize completion over breadth."
        else:
            failure_type = "runtime_failure"
            task_force = "The previous run failed inside the runtime and needs controlled recovery."
            rapid_response = "Preserve validated work, isolate the failed lane, and avoid broad rework."
            recovery_ops = "Launch a recovery cycle that keeps the wedge fixed and finishes with a board-ready packet."

        headline = (
            f"Recovery attempt {loop_state.consecutive_failures + 1} queued after {failure_type} "
            f"on run {run_state.run_id}."
        )
        return RecoveryIncidentRecord(
            attempt=loop_state.total_recovery_activations + 1,
            failed_run_id=run_state.run_id,
            failure_type=failure_type,
            headline=headline,
            task_force=task_force,
            rapid_response=rapid_response,
            recovery_ops=recovery_ops,
            wait_seconds=wait_seconds,
        )

    def _build_iteration_run_settings(self, loop_state: LoopState, base_settings: RunSettings) -> RunSettings:
        settings = base_settings.model_copy(deep=True)
        if loop_state.consecutive_failures <= 0:
            return settings
        settings.codex_review_model = DEFAULT_REVIEW_CODEX_MODEL
        settings.codex_review_autonomy = DEFAULT_REVIEW_CODEX_AUTONOMY
        return settings

    def _build_iteration_parallel_limit(self, loop_state: LoopState, requested_parallelism: int | None) -> int | None:
        if not requested_parallelism or loop_state.consecutive_failures <= 0:
            return requested_parallelism
        return max(1, requested_parallelism - min(loop_state.consecutive_failures, 2))

    def _usage_limit_wait_seconds(self, run_state: RunState) -> int | None:
        text = f"{run_state.current_status}\n{run_state.summary}"
        clock_match = re.search(r"try again at\s+(\d{1,2}):(\d{2})\s*([AP]M)", text, re.IGNORECASE)
        if clock_match:
            hour = int(clock_match.group(1))
            minute = int(clock_match.group(2))
            meridiem = clock_match.group(3).upper()
            if meridiem == "PM" and hour != 12:
                hour += 12
            if meridiem == "AM" and hour == 12:
                hour = 0
            now = datetime.now().astimezone()
            target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if target <= now + timedelta(minutes=1):
                target += timedelta(days=1)
            return max(60, int((target - now).total_seconds()))

        relative_match = re.search(r"retry after\s+(\d+)\s*(second|minute|hour)", text, re.IGNORECASE)
        if relative_match:
            amount = int(relative_match.group(1))
            unit = relative_match.group(2).lower()
            if unit.startswith("hour"):
                return amount * 3600
            if unit.startswith("minute"):
                return amount * 60
            return amount

        return None
