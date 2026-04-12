from __future__ import annotations

import os
import re
from datetime import timedelta
from pathlib import Path

from pydantic import ValidationError

from blacklab_factory.models import (
    ArtifactRecord,
    LoopState,
    OperatorDirectiveInbox,
    OperatorDirectiveRecord,
    OperatorChatMessage,
    OperatorChatState,
    OperatorProfile,
    ProjectRecord,
    ProcessRecord,
    RunSettings,
    RunState,
    StepRecord,
    utc_now,
)


def slugify(value: str) -> str:
    lowered = value.lower().strip()
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
    return lowered.strip("-") or "artifact"


def _pid_is_alive(pid: int | None) -> bool:
    if pid is None or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _has_live_runtime_pid(controller_pid: int | None, process_records: list[ProcessRecord]) -> bool:
    if _pid_is_alive(controller_pid):
        return True
    return any(
        process.status == "running" and _pid_is_alive(process.pid)
        for process in process_records
    )


class RunStorage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.runs_dir = self.root / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.stale_after = timedelta(minutes=2)

    def create_run(
        self,
        mission: str,
        company_name: str,
        mode: str,
        steps: list[StepRecord],
        settings: RunSettings | None = None,
    ) -> RunState:
        stamp = utc_now().strftime("%Y%m%dT%H%M%SZ")
        run_id = self._next_available_id(stamp=stamp, slug=slugify(mission)[:40], root=self.runs_dir)
        state = RunState(
            run_id=run_id,
            mission=mission,
            company_name=company_name,
            mode=mode,
            status="queued",
            steps=steps,
            settings=settings or RunSettings(),
            metrics={
                "departments_total": len(steps),
                "departments_completed": 0,
                "artifacts_created": 0,
                "open_risks": 0,
                "progress_percent": 0,
                "artifact_count": 0,
                "open_risk_count": 0,
            },
        )
        self.run_dir(run_id).mkdir(parents=True, exist_ok=True)
        self.artifacts_dir(run_id).mkdir(parents=True, exist_ok=True)
        self.workspace_dir(run_id)  # ensure run-isolated sandbox exists from the start
        self.save_state(state)
        return state

    def run_dir(self, run_id: str) -> Path:
        return self.runs_dir / run_id

    def state_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "state.json"

    def artifacts_dir(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "artifacts"

    def workspace_dir(self, run_id: str) -> Path:
        """Isolated sandbox directory for AI-generated files within this run.

        All code, configs, and deliverables produced by the AI agents MUST be
        written inside this folder only.  The main blackLAB source tree
        (``src/``, ``frontend/``, etc.) is never touched by agent workers.
        """
        path = self.run_dir(run_id) / "workspace"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def log_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "run.log"

    def directives_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "directives.json"

    def save_state(self, state: RunState) -> None:
        state.updated_at = utc_now()
        self.state_path(state.run_id).write_text(
            state.model_dump_json(indent=2),
            encoding="utf-8",
        )

    def load_state(self, run_id: str) -> RunState:
        payload = self.state_path(run_id).read_text(encoding="utf-8")
        state = RunState.model_validate_json(payload)
        return self._mark_stale_if_needed(state)

    def list_runs(self, limit: int | None = None, offset: int = 0) -> tuple[list[RunState], int]:
        all_paths = sorted(self.runs_dir.glob("*/state.json"), reverse=True)
        total_count = len(all_paths)
        
        target_paths = all_paths[offset : offset + limit] if limit is not None else all_paths[offset:]
        
        states: list[RunState] = []
        for path in target_paths:
            try:
                state = RunState.model_validate_json(path.read_text(encoding="utf-8"))
                states.append(self._mark_stale_if_needed(state))
            except ValidationError:
                continue
        return states, total_count

    def save_artifact(self, state: RunState, department_key: str, title: str, content: str) -> ArtifactRecord:
        filename = f"{department_key}-{slugify(title)}.md"
        artifact_path = self.artifacts_dir(state.run_id) / filename
        artifact_path.write_text(content, encoding="utf-8")
        preview = "\n".join(content.splitlines()[:8]).strip()
        artifact = ArtifactRecord(
            department_key=department_key,
            title=title,
            path=str(artifact_path),
            preview=preview,
        )
        state.artifacts.append(artifact)
        state.metrics["artifacts_created"] = len(state.artifacts)
        state.metrics["artifact_count"] = len(state.artifacts)
        return artifact

    def read_artifact(self, path: str | Path) -> str:
        return Path(path).read_text(encoding="utf-8")

    def append_log(self, run_id: str, message: str) -> None:
        with self.log_path(run_id).open("a", encoding="utf-8") as handle:
            for raw_line in message.splitlines() or [""]:
                cleaned = raw_line.strip()
                if not cleaned:
                    continue
                handle.write(f"[{utc_now().isoformat()}] {cleaned}\n")

    def read_log_tail(self, run_id: str, limit: int = 120) -> str:
        path = self.log_path(run_id)
        if not path.exists():
            return ""
        lines = path.read_text(encoding="utf-8").splitlines()
        return "\n".join(lines[-limit:])

    def append_directive(self, run_id: str, content: str) -> OperatorDirectiveRecord:
        inbox = self._load_inbox(self.directives_path(run_id))
        record = OperatorDirectiveRecord(
            directive_id=self._directive_id(prefix="run"),
            target_type="run",
            target_id=run_id,
            content=content.strip(),
        )
        inbox.directives.append(record)
        self._save_inbox(self.directives_path(run_id), inbox)
        self.append_log(run_id, f"Operator directive queued: {content.strip()}")
        return record

    def consume_directives(self, run_id: str) -> list[OperatorDirectiveRecord]:
        path = self.directives_path(run_id)
        inbox = self._load_inbox(path)
        pending = [directive for directive in inbox.directives if directive.consumed_at is None]
        if not pending:
            return []
        consumed_at = utc_now()
        for directive in pending:
            directive.consumed_at = consumed_at
        self._save_inbox(path, inbox)
        return pending

    def request_stop(self, run_id: str) -> RunState:
        state = self.load_state(run_id)
        state.stop_requested = True
        if state.status == "running":
            state.status = "stopping"
        state.current_status = "Operator requested the run to stop after the current department wave."
        state.next_action = "No new departments will be launched. The current wave will finish first."
        self.save_state(state)
        self.append_log(run_id, "Run stop requested.")
        return state

    def attach_controller_pid(self, run_id: str, pid: int) -> RunState:
        state = self.load_state(run_id)
        state.controller_pid = pid
        self.save_state(state)
        self.append_log(run_id, f"Run controller pid registered: {pid}")
        return state

    def mark_force_stopped(self, run_id: str, reason: str) -> RunState:
        state = self.load_state(run_id)
        state.stop_requested = True
        state.status = "failed"
        state.current_department = None
        state.current_processes = []
        state.current_status = "Run force stopped by operator."
        state.next_action = "Current work may be incomplete. Inspect partial artifacts or start a fresh run."
        state.summary = reason
        if reason not in state.risks:
            state.risks.append(reason)
        state.metrics["open_risks"] = len(state.risks)
        state.metrics["open_risk_count"] = len(state.risks)
        self.save_state(state)
        self.append_log(run_id, reason)
        return state

    def _mark_stale_if_needed(self, state: RunState) -> RunState:
        if state.status not in {"running", "stopping"}:
            return state
        if _has_live_runtime_pid(state.controller_pid, state.current_processes):
            return state
        if utc_now() - state.updated_at <= self.stale_after:
            return state
        state.status = "stale"
        state.current_department = None
        state.current_processes = []
        state.current_status = "No live worker heartbeat is being received."
        state.next_action = "This run no longer has a live heartbeat. Start a fresh run or inspect the last artifact."
        if "Run heartbeat expired." not in state.risks:
            state.risks.append("Run heartbeat expired.")
        state.metrics["open_risks"] = len(state.risks)
        state.metrics["open_risk_count"] = len(state.risks)
        return state

    def _next_available_id(self, stamp: str, slug: str, root: Path) -> str:
        candidate = f"{stamp}-{slug}"
        if not (root / candidate).exists():
            return candidate
        counter = 2
        while (root / f"{candidate}-{counter:02d}").exists():
            counter += 1
        return f"{candidate}-{counter:02d}"

    def _load_inbox(self, path: Path) -> OperatorDirectiveInbox:
        if not path.exists():
            inbox = OperatorDirectiveInbox()
            self._save_inbox(path, inbox)
            return inbox
        return OperatorDirectiveInbox.model_validate_json(path.read_text(encoding="utf-8"))

    def _save_inbox(self, path: Path, inbox: OperatorDirectiveInbox) -> None:
        path.write_text(inbox.model_dump_json(indent=2), encoding="utf-8")

    def _directive_id(self, prefix: str) -> str:
        return f"{prefix}-{utc_now().strftime('%Y%m%dT%H%M%S%fZ')}"


class LoopStorage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.loops_dir = self.root / "loops"
        self.loops_dir.mkdir(parents=True, exist_ok=True)
        self.stale_after = timedelta(minutes=3)

    def create_loop(
        self,
        objective: str,
        loop_mode: str,
        run_mode: str,
        run_settings: RunSettings,
        interval_seconds: int,
        max_iterations: int | None,
    ) -> LoopState:
        stamp = utc_now().strftime("%Y%m%dT%H%M%SZ")
        loop_id = self._next_available_id(stamp=stamp, slug=slugify(objective)[:40], root=self.loops_dir)
        state = LoopState(
            loop_id=loop_id,
            objective=objective,
            loop_mode=loop_mode,
            run_mode=run_mode,
            interval_seconds=interval_seconds,
            max_iterations=max_iterations,
            run_settings=run_settings,
        )
        self.loop_dir(loop_id).mkdir(parents=True, exist_ok=True)
        self.save_state(state)
        return state

    def loop_dir(self, loop_id: str) -> Path:
        return self.loops_dir / loop_id

    def state_path(self, loop_id: str) -> Path:
        return self.loop_dir(loop_id) / "state.json"

    def log_path(self, loop_id: str) -> Path:
        return self.loop_dir(loop_id) / "loop.log"

    def directives_path(self, loop_id: str) -> Path:
        return self.loop_dir(loop_id) / "directives.json"

    def save_state(self, state: LoopState) -> None:
        state.updated_at = utc_now()
        self.state_path(state.loop_id).write_text(
            state.model_dump_json(indent=2),
            encoding="utf-8",
        )

    def load_state(self, loop_id: str) -> LoopState:
        state = LoopState.model_validate_json(self.state_path(loop_id).read_text(encoding="utf-8"))
        return self._mark_inactive_if_needed(state)

    def list_loops(self, limit: int | None = None, offset: int = 0) -> tuple[list[LoopState], int]:
        all_paths = sorted(self.loops_dir.glob("*/state.json"), reverse=True)
        total_count = len(all_paths)
        
        target_paths = all_paths[offset : offset + limit] if limit is not None else all_paths[offset:]
        
        loops: list[LoopState] = []
        for path in target_paths:
            try:
                state = LoopState.model_validate_json(path.read_text(encoding="utf-8"))
                loops.append(self._mark_inactive_if_needed(state))
            except ValidationError:
                continue
        return loops, total_count

    def append_log(self, loop_id: str, message: str) -> None:
        with self.log_path(loop_id).open("a", encoding="utf-8") as handle:
            for raw_line in message.splitlines() or [""]:
                cleaned = raw_line.strip()
                if not cleaned:
                    continue
                handle.write(f"[{utc_now().isoformat()}] {cleaned}\n")

    def read_log_tail(self, loop_id: str, limit: int = 120) -> str:
        path = self.log_path(loop_id)
        if not path.exists():
            return ""
        lines = path.read_text(encoding="utf-8").splitlines()
        return "\n".join(lines[-limit:])

    def append_directive(self, loop_id: str, content: str) -> OperatorDirectiveRecord:
        inbox = self._load_inbox(self.directives_path(loop_id))
        record = OperatorDirectiveRecord(
            directive_id=self._directive_id(prefix="loop"),
            target_type="loop",
            target_id=loop_id,
            content=content.strip(),
        )
        inbox.directives.append(record)
        self._save_inbox(self.directives_path(loop_id), inbox)
        self.append_log(loop_id, f"Operator directive queued: {content.strip()}")
        return record

    def consume_directives(self, loop_id: str) -> list[OperatorDirectiveRecord]:
        path = self.directives_path(loop_id)
        inbox = self._load_inbox(path)
        pending = [directive for directive in inbox.directives if directive.consumed_at is None]
        if not pending:
            return []
        consumed_at = utc_now()
        for directive in pending:
            directive.consumed_at = consumed_at
        self._save_inbox(path, inbox)
        return pending

    def attach_controller_pid(self, loop_id: str, pid: int) -> LoopState:
        state = self.load_state(loop_id)
        state.controller_pid = pid
        self.save_state(state)
        self.append_log(loop_id, f"Loop controller pid registered: {pid}")
        return state

    def request_stop(self, loop_id: str) -> LoopState:
        state = self.load_state(loop_id)
        state.stop_requested = True
        if state.status == "running":
            state.status = "stopping"
        state.latest_note = "Operator requested the loop to stop after the current cycle."
        self.save_state(state)
        self.append_log(loop_id, "Stop requested.")
        return state

    def mark_force_stopped(self, loop_id: str, reason: str) -> LoopState:
        state = self.load_state(loop_id)
        state.stop_requested = True
        state.status = "failed"
        state.current_run_id = None
        state.latest_note = "Loop force stopped by operator. Current work may be incomplete."
        state.summary = reason
        self.save_state(state)
        self.append_log(loop_id, reason)
        return state

    def _mark_inactive_if_needed(self, state: LoopState) -> LoopState:
        if state.status not in {"running", "stopping"}:
            return state

        if _pid_is_alive(state.controller_pid):
            return state

        grace = max(self.stale_after, timedelta(seconds=max(180, state.interval_seconds + 90)))
        if utc_now() - state.updated_at <= grace:
            return state

        active_run = None
        if state.current_run_id:
            try:
                active_run = RunStorage(self.root).load_state(state.current_run_id)
            except FileNotFoundError:
                active_run = None

        if active_run is not None and active_run.status in {"running", "stopping"}:
            return state

        if state.stop_requested:
            state.status = "completed"
            state.latest_note = "Loop stop request was finalized after the active cycle ended."
            self.append_log(state.loop_id, "Loop finalized from stopping to completed after heartbeat expiry.")
        else:
            state.status = "failed"
            state.latest_note = "Loop heartbeat expired and no live run remains."
            self.append_log(state.loop_id, "Loop marked failed because no live run remained after heartbeat expiry.")
        state.current_run_id = None
        self.save_state(state)
        return state

    def _next_available_id(self, stamp: str, slug: str, root: Path) -> str:
        candidate = f"{stamp}-{slug}"
        if not (root / candidate).exists():
            return candidate
        counter = 2
        while (root / f"{candidate}-{counter:02d}").exists():
            counter += 1
        return f"{candidate}-{counter:02d}"

    def _load_inbox(self, path: Path) -> OperatorDirectiveInbox:
        if not path.exists():
            inbox = OperatorDirectiveInbox()
            self._save_inbox(path, inbox)
            return inbox
        return OperatorDirectiveInbox.model_validate_json(path.read_text(encoding="utf-8"))

    def _save_inbox(self, path: Path, inbox: OperatorDirectiveInbox) -> None:
        path.write_text(inbox.model_dump_json(indent=2), encoding="utf-8")

    def _directive_id(self, prefix: str) -> str:
        return f"{prefix}-{utc_now().strftime('%Y%m%dT%H%M%S%fZ')}"


class OperatorStorage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.operator_dir = self.root / "operator"
        self.operator_dir.mkdir(parents=True, exist_ok=True)

    def profile_path(self) -> Path:
        return self.operator_dir / "profile.json"

    def chat_path(self) -> Path:
        return self.operator_dir / "chat.json"

    def load_profile(self) -> OperatorProfile:
        path = self.profile_path()
        if not path.exists():
            profile = OperatorProfile()
            self.save_profile(profile)
            return profile
        profile = OperatorProfile.model_validate_json(path.read_text(encoding="utf-8"))
        self.save_profile(profile)
        return profile

    def save_profile(self, profile: OperatorProfile) -> OperatorProfile:
        self.profile_path().write_text(
            profile.model_dump_json(indent=2),
            encoding="utf-8",
        )
        return profile

    def load_chat(self) -> OperatorChatState:
        path = self.chat_path()
        if not path.exists():
            state = OperatorChatState()
            self.save_chat(state)
            return state
        return OperatorChatState.model_validate_json(path.read_text(encoding="utf-8"))

    def save_chat(self, chat_state: OperatorChatState) -> OperatorChatState:
        self.chat_path().write_text(
            chat_state.model_dump_json(indent=2),
            encoding="utf-8",
        )
        return chat_state

    def append_chat_message(self, role: str, content: str, limit: int = 80) -> OperatorChatState:
        chat_state = self.load_chat()
        chat_state.messages.append(
            OperatorChatMessage(role=role, content=content)
        )
        chat_state.messages = chat_state.messages[-limit:]
        return self.save_chat(chat_state)


class ProjectStorage:
    """Manages persistent projects: foundation context + live context + memory."""

    MEMORY_ENTRY_LIMIT = 20  # maximum entries kept in memory.md

    def __init__(self, root: Path) -> None:
        self.root = root
        self.projects_dir = self.root / "projects"
        self.projects_dir.mkdir(parents=True, exist_ok=True)

    def normalize_slug(self, slug: str) -> str:
        return slugify(slug)

    # ── paths ────────────────────────────────────────────────────────────────

    def project_dir(self, slug: str) -> Path:
        normalized = self.normalize_slug(slug)
        direct = self.projects_dir / normalized
        if direct.exists():
            return direct
        for candidate in self.projects_dir.iterdir():
            if candidate.is_dir() and candidate.name.lower() == normalized.lower():
                return candidate
        return direct

    def meta_path(self, slug: str) -> Path:
        return self.project_dir(slug) / "project_meta.json"

    def context_path(self, slug: str) -> Path:
        """project.md — stable project foundation, seeded once then preserved."""
        return self.project_dir(slug) / "project.md"

    def live_context_path(self, slug: str) -> Path:
        """current.md — latest authoritative context refreshed after successful runs."""
        return self.project_dir(slug) / "current.md"

    def context_versions_dir(self, slug: str) -> Path:
        path = self.project_dir(slug) / "context_versions"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def memory_path(self, slug: str) -> Path:
        """memory.md — auto-accumulated run summaries."""
        return self.project_dir(slug) / "memory.md"

    def workspace_dir(self, slug: str) -> Path:
        """Shared workspace across all Runs in this project."""
        path = self.project_dir(slug) / "workspace"
        path.mkdir(parents=True, exist_ok=True)
        return path

    # ── lifecycle ────────────────────────────────────────────────────────────

    def create_project(self, slug: str, name: str, brief: str = "") -> ProjectRecord:
        normalized = self.normalize_slug(slug)
        project_dir = self.project_dir(normalized)
        project_dir.mkdir(parents=True, exist_ok=True)
        record = ProjectRecord(slug=normalized, name=name, brief=brief)
        self._save_meta(record)
        # Initialise empty files so they always exist
        if not self.context_path(normalized).exists():
            self.context_path(normalized).write_text("", encoding="utf-8")
        if not self.live_context_path(normalized).exists():
            self.live_context_path(normalized).write_text("", encoding="utf-8")
        if not self.memory_path(normalized).exists():
            self.memory_path(normalized).write_text("", encoding="utf-8")
        self.context_versions_dir(normalized)
        return record

    def get_project(self, slug: str) -> ProjectRecord | None:
        path = self.meta_path(self.normalize_slug(slug))
        if not path.exists():
            return None
        try:
            return ProjectRecord.model_validate_json(path.read_text(encoding="utf-8"))
        except Exception:
            return None

    def list_projects(self) -> list[ProjectRecord]:
        records: list[ProjectRecord] = []
        for meta in sorted(self.projects_dir.glob("*/project_meta.json"), reverse=True):
            try:
                records.append(ProjectRecord.model_validate_json(meta.read_text(encoding="utf-8")))
            except Exception:
                continue
        return records

    def _save_meta(self, record: ProjectRecord) -> None:
        record.updated_at = utc_now()
        self.meta_path(record.slug).write_text(record.model_dump_json(indent=2), encoding="utf-8")

    # ── context: project.md ──────────────────────────────────────────────────

    def write_context(self, slug: str, content: str) -> None:
        """Overwrite the stable project foundation context."""
        normalized = self.normalize_slug(slug)
        self.context_path(normalized).write_text(content.strip() + "\n", encoding="utf-8")
        # Update brief from first non-empty line
        record = self.get_project(normalized)
        if record:
            for line in content.splitlines():
                stripped = line.strip().lstrip("#").strip()
                if stripped:
                    record.brief = stripped[:200]
                    break
            self._save_meta(record)

    def read_context(self, slug: str) -> str:
        path = self.context_path(self.normalize_slug(slug))
        return path.read_text(encoding="utf-8").strip() if path.exists() else ""

    def write_live_context(self, slug: str, run_id: str, title: str, content: str) -> None:
        """Refresh the latest authoritative context after a successful run."""
        normalized = self.normalize_slug(slug)
        cleaned = content.strip() + "\n"
        self.live_context_path(normalized).write_text(cleaned, encoding="utf-8")
        version_name = f"{run_id}-{slugify(title)[:40]}.md"
        (self.context_versions_dir(normalized) / version_name).write_text(cleaned, encoding="utf-8")

    def read_live_context(self, slug: str) -> str:
        path = self.live_context_path(self.normalize_slug(slug))
        return path.read_text(encoding="utf-8").strip() if path.exists() else ""

    # ── memory: memory.md ────────────────────────────────────────────────────

    def append_memory(self, slug: str, run_id: str, mission: str, run_summary: str, decisions: list[str], next_run_hint: str, risks: list[str]) -> None:
        """Called automatically when a Run completes. Appends a structured entry to memory.md."""
        normalized = self.normalize_slug(slug)
        now = utc_now()
        date_str = now.strftime("%Y-%m-%d %H:%M UTC")
        decision_bullets = "\n".join(f"  - {d}" for d in decisions[:6]) or "  - (none recorded)"
        risk_bullets = "\n".join(f"  - {r}" for r in risks[:3]) or "  - (none)"
        entry = (
            f"\n## Run: {date_str} — {mission[:120]}\n"
            f"**Run ID**: `{run_id}`\n\n"
            f"**Summary**: {run_summary[:300]}\n\n"
            f"**Key Decisions**:\n{decision_bullets}\n\n"
            f"**Open Risks**:\n{risk_bullets}\n\n"
            f"**Next Run Hint**: {next_run_hint[:300]}\n\n"
            f"---"
        )
        path = self.memory_path(normalized)
        existing = path.read_text(encoding="utf-8") if path.exists() else ""
        path.write_text(existing + entry + "\n", encoding="utf-8")
        # trim to last MEMORY_ENTRY_LIMIT entries
        self._trim_memory(normalized)
        # update meta
        record = self.get_project(normalized)
        if record:
            record.run_count += 1
            record.last_run_id = run_id
            record.last_run_at = now
            self._save_meta(record)

    def read_memory(self, slug: str, last_n: int = 5) -> str:
        """Return the last N memory entries."""
        path = self.memory_path(self.normalize_slug(slug))
        if not path.exists():
            return ""
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            return ""
        # Split on hr separator
        entries = [e.strip() for e in text.split("---") if e.strip()]
        recent = entries[-last_n:]
        return "\n\n---\n\n".join(recent)

    def read_latest_memory_snapshot(self, slug: str) -> dict[str, object] | None:
        """Return parsed fields from the latest memory entry for quick dashboard display."""
        entry = self.read_memory(slug, last_n=1).strip()
        if not entry:
            return None

        run_id_match = re.search(r"\*\*Run ID\*\*: `([^`]+)`", entry)
        summary_match = re.search(r"\*\*Summary\*\*: (.+)", entry)
        next_hint_match = re.search(r"\*\*Next Run Hint\*\*: (.+)", entry)
        risks_match = re.search(r"\*\*Open Risks\*\*:\n(.*?)(?:\n\n\*\*Next Run Hint\*\*:|\Z)", entry, re.DOTALL)

        risks: list[str] = []
        if risks_match:
            risks = [
                line.strip()[2:].strip()
                for line in risks_match.group(1).splitlines()
                if line.strip().startswith("- ")
            ]

        return {
            "run_id": run_id_match.group(1).strip() if run_id_match else None,
            "summary": summary_match.group(1).strip() if summary_match else "",
            "next_run_hint": next_hint_match.group(1).strip() if next_hint_match else "",
            "risks": risks,
        }

    def _trim_memory(self, slug: str) -> None:
        path = self.memory_path(self.normalize_slug(slug))
        if not path.exists():
            return
        text = path.read_text(encoding="utf-8").strip()
        entries = [e.strip() for e in text.split("---") if e.strip()]
        if len(entries) > self.MEMORY_ENTRY_LIMIT:
            kept = entries[-self.MEMORY_ENTRY_LIMIT:]
            path.write_text("\n\n---\n\n".join(kept) + "\n\n---\n", encoding="utf-8")

    # ── combined prompt payload ──────────────────────────────────────────────

    def build_project_prompt_block(self, slug: str) -> str:
        """Returns the full text block injected at the top of every AI prompt."""
        foundation = self.read_context(slug)
        live_context = self.read_live_context(slug)
        memory = self.read_memory(slug, last_n=5)
        parts: list[str] = []
        if foundation:
            parts.append(
                "══════════════════════════════════════════════════\n"
                "PROJECT FOUNDATION  (stable project identity and baseline)\n"
                "══════════════════════════════════════════════════\n"
                + foundation
            )
        if live_context and live_context != foundation:
            parts.append(
                "══════════════════════════════════════════════════\n"
                "PROJECT LIVE CONTEXT  (latest authoritative state from the most recent successful run)\n"
                "══════════════════════════════════════════════════\n"
                + live_context
            )
        if memory:
            parts.append(
                "══════════════════════════════════════════════════\n"
                "PROJECT MEMORY  (what happened in previous runs — do not repeat finished work)\n"
                "══════════════════════════════════════════════════\n"
                + memory
            )
        if not parts:
            return ""
        return "\n\n".join(parts) + "\n\n"
