from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from blacklab_factory.factory import FactoryRunner
from blacklab_factory.models import LoopIterationRecord, LoopMode, LoopState, RunMode, RunSettings
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
        self.loop_storage.append_log(loop_state.loop_id, "Autopilot loop created.")
        return loop_state

    def run_loop(self, request: LoopRunRequest, loop_id: str | None = None) -> LoopState:
        loop_state = self.loop_storage.load_state(loop_id) if loop_id else self.start_loop(request)
        loop_state.status = "running"
        loop_state.latest_note = "Autopilot loop is active."
        self.loop_storage.save_state(loop_state)
        self.loop_storage.append_log(loop_state.loop_id, "Autopilot loop started.")

        while True:
            loop_state = self.loop_storage.load_state(loop_state.loop_id)
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
            mission = self._build_iteration_mission(loop_state, iteration_number)
            loop_state.current_iteration = iteration_number
            loop_state.latest_note = f"Launching run {iteration_number}."
            loop_state.runs.append(LoopIterationRecord(iteration=iteration_number))
            self.loop_storage.save_state(loop_state)
            self.loop_storage.append_log(loop_state.loop_id, f"Launching run {iteration_number}.")

            run_state = self.runner.start(
                mission=mission,
                mode=request.run_mode,
                pause_between_departments=request.pause_between_departments,
                max_parallel_departments=request.max_parallel_departments,
                run_settings=request.run_settings,
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
                loop_state.status = "failed"
                loop_state.latest_note = "Autopilot loop stopped after a failed run."
                self.loop_storage.save_state(loop_state)
                self.loop_storage.append_log(loop_state.loop_id, f"Run {iteration_number} failed.")
                return loop_state

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

    def _build_iteration_mission(self, loop_state: LoopState, iteration_number: int) -> str:
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
                "",
                "Run the loop again and finish with a tighter operator briefing.",
            ]
        )

    def _sleep_between_cycles(self, loop_state: LoopState) -> None:
        if loop_state.interval_seconds <= 0:
            return
        remaining = loop_state.interval_seconds
        while remaining > 0:
            current = self.loop_storage.load_state(loop_state.loop_id)
            if current.stop_requested:
                return
            time.sleep(1)
            remaining -= 1
