from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re
from typing import Literal

from pydantic import BaseModel, Field


RunMode = Literal["mock", "codex", "openai"]
StepStatus = Literal["pending", "running", "completed", "failed"]
RunStatus = Literal["queued", "running", "stopping", "completed", "failed", "stale"]
ProcessStatus = Literal["running", "completed", "failed"]
ParallelStrategy = Literal["dependency_graph", "full_parallel"]
CodexAutonomyMode = Literal["read_only", "full_auto", "yolo"]
CodexRuntimeTier = Literal["core", "review"]
OrchestrationLane = Literal["strategy", "delivery", "review"]
LoopMode = Literal["full_auto", "always_on"]
LoopStatus = Literal["queued", "running", "stopping", "completed", "failed"]
ChatRole = Literal["user", "assistant"]
ProjectStatus = Literal["active", "paused", "archived"]

DEFAULT_CORE_CODEX_MODEL = "gpt-5.4"
DEFAULT_REVIEW_CODEX_MODEL = "gpt-5.4-mini"
DEFAULT_REVIEW_CODEX_AUTONOMY: CodexAutonomyMode = "read_only"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_text(value: str) -> str:
    return " ".join(value.split()).strip()


def first_non_empty_line(value: str) -> str:
    for line in value.splitlines():
        cleaned = line.strip()
        if cleaned:
            return cleaned
    return ""


def compact_text(value: str, limit: int = 180) -> str:
    normalized = normalize_text(value)
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1].rstrip() + "…"


def sentence_preview(value: str, max_sentences: int = 2, fallback_limit: int = 220) -> str:
    normalized = normalize_text(value)
    if not normalized:
        return ""
    sentences = [segment.strip() for segment in re.split(r"(?<=[.!?])\s+", normalized) if segment.strip()]
    if len(sentences) <= max_sentences:
        return compact_text(normalized, limit=fallback_limit)
    preview = " ".join(sentences[:max_sentences]).strip()
    return compact_text(preview, limit=fallback_limit)


def should_collapse_text(value: str, max_sentences: int = 2) -> bool:
    normalized = normalize_text(value)
    if not normalized:
        return False
    sentences = [segment.strip() for segment in re.split(r"(?<=[.!?])\s+", normalized) if segment.strip()]
    return len(sentences) > max_sentences or len(normalized) > 220


def extract_autopilot_iteration(value: str) -> int | None:
    for line in value.splitlines():
        cleaned = line.strip()
        if cleaned.lower().startswith("autopilot iteration "):
            try:
                return int(cleaned.split()[2].rstrip("."))
            except (IndexError, ValueError):
                return None
    return None


class DepartmentConfig(BaseModel):
    key: str
    label: str
    purpose: str
    output_title: str
    temperature: float = 0.2
    runtime_tier: CodexRuntimeTier = "core"
    resource_lane: OrchestrationLane = "strategy"
    priority: int = 50
    depends_on: list[str] = Field(default_factory=list)
    requires_all_completed: bool = False


class CompanyConfig(BaseModel):
    company_name: str
    default_mode: RunMode = "mock"
    mission_style: str = "profit-first operator"
    parallel_strategy: ParallelStrategy = "dependency_graph"
    max_parallel_departments: int = 3
    enable_final_review: bool = True
    final_review_label: str = "Board Review"
    final_review_output_title: str = "Operator Briefing"
    codex_worker_timeout_seconds: int = 420
    codex_retry_attempts: int = 1
    departments: list[DepartmentConfig]
    review_departments: list[DepartmentConfig] = Field(default_factory=list)


class ArtifactRecord(BaseModel):
    department_key: str
    title: str
    path: str
    created_at: datetime = Field(default_factory=utc_now)
    preview: str

    @property
    def filename(self) -> str:
        return Path(self.path).name

    @property
    def department(self) -> str:
        return self.department_key


class StepRecord(BaseModel):
    department_key: str
    department_label: str
    purpose: str
    status: StepStatus = "pending"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    summary: str = ""
    artifact_filename: str | None = None

    @property
    def name(self) -> str:
        return self.department_label

    @property
    def goal(self) -> str:
        return self.purpose

    @property
    def handoff_to(self) -> str | None:
        return None


class ProcessRecord(BaseModel):
    label: str
    pid: int
    command_preview: str
    status: ProcessStatus = "running"
    started_at: datetime = Field(default_factory=utc_now)
    ended_at: datetime | None = None
    exit_code: int | None = None


class RunSettings(BaseModel):
    codex_model: str = DEFAULT_CORE_CODEX_MODEL
    codex_autonomy: CodexAutonomyMode = "read_only"
    codex_review_model: str = DEFAULT_REVIEW_CODEX_MODEL
    codex_review_autonomy: CodexAutonomyMode = DEFAULT_REVIEW_CODEX_AUTONOMY
    detached: bool = False
    max_parallel_departments: int | None = None
    active_department_keys: list[str] | None = None

    def model_for_tier(self, tier: CodexRuntimeTier) -> str:
        if tier == "review":
            return self.codex_review_model
        return self.codex_model

    def autonomy_for_tier(self, tier: CodexRuntimeTier) -> CodexAutonomyMode:
        if tier == "review":
            return self.codex_review_autonomy
        return self.codex_autonomy


class RunState(BaseModel):
    run_id: str
    project_slug: str | None = None
    project_name: str | None = None
    mission: str
    company_name: str
    mode: RunMode
    status: RunStatus = "queued"
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    stop_requested: bool = False
    current_department: str | None = None
    next_action: str = "Ready to start"
    current_status: str = "Waiting for first department."
    summary: str = ""
    risks: list[str] = Field(default_factory=list)
    settings: RunSettings = Field(default_factory=RunSettings)
    metrics: dict[str, int | float | str] = Field(default_factory=dict)
    steps: list[StepRecord] = Field(default_factory=list)
    artifacts: list[ArtifactRecord] = Field(default_factory=list)
    current_processes: list[ProcessRecord] = Field(default_factory=list)
    process_history: list["ProcessRecord"] = Field(default_factory=list)

    @property
    def departments(self) -> list[StepRecord]:
        return self.steps

    @property
    def current_process(self) -> ProcessRecord | None:
        return self.current_processes[-1] if self.current_processes else None

    @property
    def last_process(self) -> ProcessRecord | None:
        return self.process_history[-1] if self.process_history else None

    @property
    def display_title(self) -> str:
        return first_non_empty_line(self.mission) or self.run_id

    @property
    def mission_excerpt(self) -> str:
        return compact_text(self.mission, limit=220)

    @property
    def mission_preview(self) -> str:
        return sentence_preview(self.mission, max_sentences=2, fallback_limit=260)

    @property
    def mission_is_long(self) -> bool:
        return should_collapse_text(self.mission, max_sentences=2)

    @property
    def autopilot_iteration(self) -> int | None:
        return extract_autopilot_iteration(self.mission)

    @property
    def completed_departments_count(self) -> int:
        return len([step for step in self.steps if step.status == "completed"])

    @property
    def total_departments_count(self) -> int:
        return len(self.steps)

    @property
    def last_completed_department(self) -> str | None:
        completed_steps = [step for step in self.steps if step.status == "completed"]
        if not completed_steps:
            return None
        return completed_steps[-1].department_label


class LoopIterationRecord(BaseModel):
    iteration: int
    run_id: str | None = None
    status: RunStatus | None = None
    summary: str = ""
    created_at: datetime = Field(default_factory=utc_now)
    completed_at: datetime | None = None


class RecoveryIncidentRecord(BaseModel):
    attempt: int
    failed_run_id: str
    failure_type: str
    headline: str
    task_force: str
    rapid_response: str
    recovery_ops: str
    wait_seconds: int | None = None
    created_at: datetime = Field(default_factory=utc_now)


class LoopState(BaseModel):
    loop_id: str
    project_slug: str | None = None
    project_name: str | None = None
    objective: str
    loop_mode: LoopMode
    run_mode: RunMode
    status: LoopStatus = "queued"
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    current_run_id: str | None = None
    current_iteration: int = 0
    iterations_completed: int = 0
    max_iterations: int | None = None
    interval_seconds: int = 0
    stop_requested: bool = False
    summary: str = ""
    latest_note: str = "Waiting to launch the first cycle."
    run_settings: RunSettings = Field(default_factory=RunSettings)
    runs: list[LoopIterationRecord] = Field(default_factory=list)
    incidents: list[RecoveryIncidentRecord] = Field(default_factory=list)
    consecutive_failures: int = 0
    total_recovery_activations: int = 0
    max_recovery_attempts: int = 3

    @property
    def display_title(self) -> str:
        return first_non_empty_line(self.objective) or self.loop_id

    @property
    def objective_excerpt(self) -> str:
        return compact_text(self.objective, limit=220)

    @property
    def objective_preview(self) -> str:
        return sentence_preview(self.objective, max_sentences=2, fallback_limit=260)

    @property
    def objective_is_long(self) -> bool:
        return should_collapse_text(self.objective, max_sentences=2)


class ProjectRecord(BaseModel):
    """Persistent project that accumulates context and memory across many Runs."""
    slug: str
    name: str
    status: ProjectStatus = "active"
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    run_count: int = 0
    last_run_id: str | None = None
    last_run_at: datetime | None = None
    brief: str = ""  # first line of project.md, shown in dashboard lists


class EventEntry(BaseModel):
    event_id: str
    scope: str
    title: str
    message: str
    status: str
    timestamp: datetime
    run_id: str | None = None
    loop_id: str | None = None
    department_key: str | None = None
    department_label: str | None = None
    is_live: bool = False


class LaunchControlProfile(BaseModel):
    mode: RunMode = "codex"
    project_slug: str | None = None
    pause_between_departments: float = 0
    run_settings: RunSettings = Field(default_factory=RunSettings)


class AutopilotControlProfile(BaseModel):
    run_mode: RunMode = "codex"
    project_slug: str | None = None
    loop_mode: LoopMode = "always_on"
    interval_seconds: int = 30
    max_iterations: int = 3
    pause_between_departments: float = 0
    run_settings: RunSettings = Field(
        default_factory=lambda: RunSettings(codex_autonomy="full_auto")
    )


class RosterProfile(BaseModel):
    active_department_keys: list[str] = Field(default_factory=list)
    hidden_campus_items: list[str] = Field(default_factory=list)


class OperatorProfile(BaseModel):
    launch: LaunchControlProfile = Field(default_factory=LaunchControlProfile)
    autopilot: AutopilotControlProfile = Field(default_factory=AutopilotControlProfile)
    roster: RosterProfile = Field(default_factory=RosterProfile)


class OperatorChatMessage(BaseModel):
    role: ChatRole
    content: str
    created_at: datetime = Field(default_factory=utc_now)


class OperatorChatState(BaseModel):
    messages: list[OperatorChatMessage] = Field(default_factory=list)


DirectiveTarget = Literal["run", "loop"]


class OperatorDirectiveRecord(BaseModel):
    directive_id: str
    target_type: DirectiveTarget
    target_id: str
    content: str
    created_at: datetime = Field(default_factory=utc_now)
    consumed_at: datetime | None = None

    @property
    def is_pending(self) -> bool:
        return self.consumed_at is None


class OperatorDirectiveInbox(BaseModel):
    directives: list[OperatorDirectiveRecord] = Field(default_factory=list)
