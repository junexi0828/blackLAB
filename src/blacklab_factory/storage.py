from __future__ import annotations

import re
from datetime import timedelta
from pathlib import Path

from pydantic import ValidationError

from blacklab_factory.models import (
    ArtifactRecord,
    LoopState,
    OperatorChatMessage,
    OperatorChatState,
    OperatorProfile,
    RunSettings,
    RunState,
    StepRecord,
    utc_now,
)


def slugify(value: str) -> str:
    lowered = value.lower().strip()
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
    return lowered.strip("-") or "artifact"


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
        self.save_state(state)
        return state

    def run_dir(self, run_id: str) -> Path:
        return self.runs_dir / run_id

    def state_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "state.json"

    def artifacts_dir(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "artifacts"

    def log_path(self, run_id: str) -> Path:
        return self.run_dir(run_id) / "run.log"

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

    def list_runs(self) -> list[RunState]:
        states: list[RunState] = []
        for path in sorted(self.runs_dir.glob("*/state.json"), reverse=True):
            try:
                state = RunState.model_validate_json(path.read_text(encoding="utf-8"))
                states.append(self._mark_stale_if_needed(state))
            except ValidationError:
                continue
        return states

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

    def _mark_stale_if_needed(self, state: RunState) -> RunState:
        if state.status != "running":
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


class LoopStorage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.loops_dir = self.root / "loops"
        self.loops_dir.mkdir(parents=True, exist_ok=True)

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

    def save_state(self, state: LoopState) -> None:
        state.updated_at = utc_now()
        self.state_path(state.loop_id).write_text(
            state.model_dump_json(indent=2),
            encoding="utf-8",
        )

    def load_state(self, loop_id: str) -> LoopState:
        return LoopState.model_validate_json(self.state_path(loop_id).read_text(encoding="utf-8"))

    def list_loops(self) -> list[LoopState]:
        loops: list[LoopState] = []
        for path in sorted(self.loops_dir.glob("*/state.json"), reverse=True):
            try:
                loops.append(LoopState.model_validate_json(path.read_text(encoding="utf-8")))
            except ValidationError:
                continue
        return loops

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

    def _next_available_id(self, stamp: str, slug: str, root: Path) -> str:
        candidate = f"{stamp}-{slug}"
        if not (root / candidate).exists():
            return candidate
        counter = 2
        while (root / f"{candidate}-{counter:02d}").exists():
            counter += 1
        return f"{candidate}-{counter:02d}"


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
