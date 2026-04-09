from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from .agents import MockDepartmentExecutor, OpenAIDepartmentExecutor
from .models import (
    ArtifactRecord,
    DepartmentStage,
    DepartmentStatus,
    DecisionRecord,
    FactoryConfig,
    RiskRecord,
    RunMetrics,
    RunState,
    RunStatus,
)
from .storage import RunStorage


class FactoryRunner:
    def __init__(
        self,
        config: FactoryConfig,
        storage: RunStorage,
        mode: str = "mock",
        model: str = "gpt-4.1-mini",
        pause_between_departments: int = 0,
    ) -> None:
        self.config = config
        self.storage = storage
        self.mode = mode
        self.model = model
        self.pause_between_departments = pause_between_departments

    async def run(self, mission: str) -> RunState:
        now = datetime.now(timezone.utc)
        run_state = RunState(
            run_id=uuid4().hex[:12],
            mission=mission,
            mode=self.mode,
            status=RunStatus.IN_PROGRESS,
            created_at=now,
            updated_at=now,
            departments=[
                DepartmentStage(
                    name=department.name,
                    role=department.role,
                    goal=department.goal,
                )
                for department in self.config.departments
            ],
            metrics=RunMetrics(total_departments=len(self.config.departments)),
        )
        self.storage.save_state(run_state)

        executor = self._resolve_executor()

        try:
            for index, department in enumerate(self.config.departments):
                next_department = (
                    self.config.departments[index + 1].name
                    if index + 1 < len(self.config.departments)
                    else None
                )
                stage = run_state.departments[index]
                stage.status = DepartmentStatus.IN_PROGRESS
                stage.started_at = datetime.now(timezone.utc)
                run_state.current_department = department.name
                run_state.updated_at = stage.started_at
                self.storage.save_state(run_state)

                result = await executor.run(mission, department, run_state)
                artifact_path = self.storage.write_artifact(
                    run_state.run_id,
                    department.name,
                    department.artifact_name,
                    result.artifact_markdown,
                )

                finished_at = datetime.now(timezone.utc)
                stage.status = DepartmentStatus.COMPLETED
                stage.completed_at = finished_at
                stage.summary = result.summary
                stage.handoff_to = next_department
                stage.artifact_path = str(artifact_path)

                run_state.artifacts.append(
                    ArtifactRecord(
                        department=department.name,
                        title=department.artifact_name,
                        path=str(artifact_path),
                        summary=result.summary,
                        created_at=finished_at,
                    )
                )
                run_state.decisions.append(
                    DecisionRecord(
                        department=department.name,
                        summary=result.decision,
                        rationale=result.rationale,
                        created_at=finished_at,
                    )
                )
                run_state.risks.extend(
                    RiskRecord(
                        label=f"{department.name} risk {risk_index}",
                        severity="medium",
                        summary=risk,
                        created_at=finished_at,
                    )
                    for risk_index, risk in enumerate(result.risks, start=1)
                )
                run_state.next_actions = _merge_next_actions(
                    run_state.next_actions,
                    result.next_actions,
                )
                run_state.updated_at = finished_at
                run_state.metrics = _compute_metrics(run_state)
                self.storage.save_state(run_state)

                if self.pause_between_departments > 0 and next_department:
                    await asyncio.sleep(self.pause_between_departments)

            run_state.status = RunStatus.COMPLETED
            run_state.current_department = None
            run_state.updated_at = datetime.now(timezone.utc)
            run_state.metrics = _compute_metrics(run_state)
            self.storage.save_state(run_state)
            return run_state
        except Exception as exc:
            failed_at = datetime.now(timezone.utc)
            run_state.status = RunStatus.FAILED
            run_state.updated_at = failed_at
            run_state.risks.append(
                RiskRecord(
                    label="runtime-failure",
                    severity="high",
                    summary=str(exc),
                    created_at=failed_at,
                )
            )
            run_state.metrics = _compute_metrics(run_state)
            self.storage.save_state(run_state)
            raise

    def _resolve_executor(self) -> MockDepartmentExecutor | OpenAIDepartmentExecutor:
        if self.mode == "openai":
            return OpenAIDepartmentExecutor(model=self.model)
        return MockDepartmentExecutor()


def _compute_metrics(run_state: RunState) -> RunMetrics:
    total_departments = len(run_state.departments)
    completed = sum(
        1 for stage in run_state.departments if stage.status == DepartmentStatus.COMPLETED
    )
    open_risks = sum(1 for risk in run_state.risks if risk.status == "open")
    progress = int((completed / total_departments) * 100) if total_departments else 0
    return RunMetrics(
        progress_percent=progress,
        artifact_count=len(run_state.artifacts),
        open_risk_count=open_risks,
        completed_departments=completed,
        total_departments=total_departments,
    )


def _merge_next_actions(existing: list[str], new_items: list[str], limit: int = 8) -> list[str]:
    merged = existing + new_items
    deduped: list[str] = []
    for item in merged:
        if item not in deduped:
            deduped.append(item)
    return deduped[-limit:]
