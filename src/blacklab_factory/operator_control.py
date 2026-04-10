from __future__ import annotations

import re
from pathlib import Path

from blacklab_factory.autopilot import AutopilotSupervisor
from blacklab_factory.config import load_company_config
from blacklab_factory.launcher import launch_detached_loop, launch_detached_run
from blacklab_factory.models import (
    DEFAULT_CORE_CODEX_MODEL,
    DEFAULT_REVIEW_CODEX_MODEL,
    CompanyConfig,
    OperatorProfile,
)
from blacklab_factory.storage import OperatorStorage, RunStorage

KNOWN_MODELS = [
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex",
]
KNOWN_AUTONOMY = ["read_only", "full_auto", "yolo"]
LOOP_ID_PATTERN = re.compile(r"\d{8}T\d{6}Z-[a-z0-9-]+")
PROJECT_SLUG_PATTERN = re.compile(r"(?:project(?:[_\\s-]?slug)?|프로젝트)\s*[:=]?\s*([a-z0-9][a-z0-9-]{1,63})", re.IGNORECASE)


class OperatorCommander:
    def __init__(self, storage_root: Path) -> None:
        self.storage_root = storage_root
        self.config = load_company_config()
        self.run_storage = RunStorage(storage_root)
        self.loop_supervisor = AutopilotSupervisor(storage_root=storage_root)
        self.operator_storage = OperatorStorage(storage_root)

    def load_profile(self) -> OperatorProfile:
        return seed_operator_profile(self.operator_storage.load_profile(), self.config)

    def save_profile(self, profile: OperatorProfile) -> OperatorProfile:
        return self.operator_storage.save_profile(seed_operator_profile(profile, self.config))

    def load_chat_history(self):
        return self.operator_storage.load_chat().messages

    def handle_message(self, raw_message: str) -> dict[str, object]:
        message = raw_message.strip()
        if not message:
            raise ValueError("Message is empty.")

        self.operator_storage.append_chat_message("user", message)
        reply, action = self._dispatch(message)
        chat_state = self.operator_storage.append_chat_message("assistant", reply)
        return {
            "reply": reply,
            "action": action,
            "messages": [item.model_dump(mode="json") for item in chat_state.messages],
        }

    def _dispatch(self, message: str) -> tuple[str, dict[str, object]]:
        lowered = message.lower()

        if self._looks_like_status(lowered):
            return self._status_reply(), {"type": "status"}

        if self._looks_like_stop(lowered):
            return self._stop_loop(message)

        updated = self._update_profile_from_message(message, lowered)
        if updated:
            return updated

        if self._looks_like_loop_launch(lowered):
            return self._launch_loop(message)

        if self._looks_like_run_launch(lowered):
            return self._launch_run(message)

        directive = self._send_live_directive(message)
        if directive is not None:
            return directive

        return (
            "이 채팅은 메인 제어면이자 live directive 채널입니다. 활성 run/loop가 있으면 기본적으로 그 인스턴스에 지시를 전달합니다. 가능한 작업은 현재 상태 요약, 새 런 시작, 24/7 루프 시작, 루프 중지, core/review 모델과 자율도 변경입니다.",
            {"type": "help"},
        )

    def _status_reply(self) -> str:
        runs = self.run_storage.list_runs()
        loops = self.loop_supervisor.loop_storage.list_loops()
        active_runs = [run for run in runs if run.status == "running"]
        active_loops = [loop for loop in loops if loop.status in {"running", "stopping"}]
        latest_run = runs[0] if runs else None
        latest_loop = loops[0] if loops else None

        parts = [
            f"활성 런 {len(active_runs)}개, 활성 루프 {len(active_loops)}개입니다.",
        ]
        if latest_run is not None:
            parts.append(
                f"최근 런은 {latest_run.run_id}이고 상태는 {latest_run.status}입니다."
            )
        if latest_loop is not None:
            parts.append(
                f"최근 루프는 {latest_loop.loop_id}이고 상태는 {latest_loop.status}입니다."
            )
        return " ".join(parts)

    def _launch_run(self, message: str) -> tuple[str, dict[str, object]]:
        profile = self.load_profile()
        project_slug = self._extract_project_slug(message) or profile.launch.project_slug
        cleaned_message = self._strip_project_directive(message)
        mission = self._extract_payload(
            cleaned_message,
            [
                "launch run",
                "start run",
                "run:",
                "mission:",
                "런 시작",
                "새 런",
                "미션:",
            ],
        )
        if not mission:
            mission = "Drive the current highest-priority company objective."

        launch = launch_detached_run(
            mission=mission,
            project_slug=project_slug,
            mode=profile.launch.mode,
            pause_between_departments=profile.launch.pause_between_departments,
            max_parallel_departments=profile.launch.run_settings.max_parallel_departments,
            active_department_keys=profile.roster.active_department_keys,
            storage_root=self.storage_root,
            codex_model=profile.launch.run_settings.codex_model,
            codex_autonomy=profile.launch.run_settings.codex_autonomy,
            codex_review_model=profile.launch.run_settings.codex_review_model,
            codex_review_autonomy=profile.launch.run_settings.codex_review_autonomy,
        )
        return (
            (
                f"새 런 {launch.entity_id}를 시작했습니다. 미션은 '{mission}' 입니다."
                + (f" 프로젝트는 '{project_slug}' 입니다." if project_slug else "")
            ),
            {"type": "run_launch", "run_id": launch.entity_id, "pid": launch.pid, "project_slug": project_slug},
        )

    def _launch_loop(self, message: str) -> tuple[str, dict[str, object]]:
        profile = self.load_profile()
        project_slug = self._extract_project_slug(message) or profile.autopilot.project_slug
        cleaned_message = self._strip_project_directive(message)
        objective = self._extract_payload(
            cleaned_message,
            [
                "start loop",
                "launch loop",
                "autopilot",
                "24/7",
                "always_on",
                "루프 시작",
                "오토파일럿",
            ],
        )
        if not objective:
            objective = "Operate the AI company continuously and improve the strongest revenue wedge."

        launch = launch_detached_loop(
            objective=objective,
            project_slug=project_slug,
            run_mode=profile.autopilot.run_mode,
            loop_mode=profile.autopilot.loop_mode,
            interval_seconds=profile.autopilot.interval_seconds,
            max_iterations=(
                profile.autopilot.max_iterations
                if profile.autopilot.loop_mode == "full_auto"
                else None
            ),
            pause_between_departments=profile.autopilot.pause_between_departments,
            max_parallel_departments=profile.autopilot.run_settings.max_parallel_departments,
            active_department_keys=profile.roster.active_department_keys,
            storage_root=self.storage_root,
            codex_model=profile.autopilot.run_settings.codex_model,
            codex_autonomy=profile.autopilot.run_settings.codex_autonomy,
            codex_review_model=profile.autopilot.run_settings.codex_review_model,
            codex_review_autonomy=profile.autopilot.run_settings.codex_review_autonomy,
        )
        return (
            (
                f"루프 {launch.entity_id}를 시작했습니다. 목표는 '{objective}' 입니다."
                + (f" 프로젝트는 '{project_slug}' 입니다." if project_slug else "")
            ),
            {"type": "loop_launch", "loop_id": launch.entity_id, "pid": launch.pid, "project_slug": project_slug},
        )

    def _stop_loop(self, message: str) -> tuple[str, dict[str, object]]:
        loop_id = self._extract_loop_id(message)
        if not loop_id:
            active_loops = [
                loop
                for loop in self.loop_supervisor.loop_storage.list_loops()
                if loop.status in {"running", "stopping"}
            ]
            if len(active_loops) == 1:
                loop_id = active_loops[0].loop_id
            elif not active_loops:
                return ("현재 중지할 활성 루프가 없습니다.", {"type": "loop_stop_none"})
            else:
                listed = ", ".join(loop.loop_id for loop in active_loops[:3])
                return (
                    f"활성 루프가 여러 개입니다. loop id를 지정해주세요: {listed}",
                    {"type": "loop_stop_ambiguous"},
                )

        loop_state = self.loop_supervisor.request_stop(loop_id)
        return (
            f"루프 {loop_state.loop_id}에 중지 요청을 넣었습니다.",
            {"type": "loop_stop", "loop_id": loop_state.loop_id},
        )

    def _send_live_directive(self, message: str) -> tuple[str, dict[str, object]] | None:
        directive = message.strip()
        if not directive:
            return None

        active_runs = [run for run in self.run_storage.list_runs() if run.status == "running"]
        if active_runs:
            targets = active_runs
            for run in targets:
                self.run_storage.append_directive(run.run_id, directive)
            if len(targets) == 1:
                run = targets[0]
                return (
                    f"활성 런 {run.run_id}에 지시를 전달했습니다. 다음 가능한 부서 wave부터 반영됩니다.",
                    {"type": "run_directive", "run_id": run.run_id},
                )
            return (
                f"활성 런 {len(targets)}개에 지시를 브로드캐스트했습니다. 다음 가능한 부서 wave부터 반영됩니다.",
                {"type": "run_directive_broadcast", "run_ids": [run.run_id for run in targets]},
            )

        active_loops = [
            loop for loop in self.loop_supervisor.loop_storage.list_loops()
            if loop.status in {"running", "stopping"}
        ]
        if active_loops:
            targets = active_loops
            for loop in targets:
                self.loop_supervisor.loop_storage.append_directive(loop.loop_id, directive)
            if len(targets) == 1:
                loop = targets[0]
                return (
                    f"활성 루프 {loop.loop_id}에 지시를 전달했습니다. 다음 iteration부터 반영됩니다.",
                    {"type": "loop_directive", "loop_id": loop.loop_id},
                )
            return (
                f"활성 루프 {len(targets)}개에 지시를 브로드캐스트했습니다. 다음 iteration부터 반영됩니다.",
                {"type": "loop_directive_broadcast", "loop_ids": [loop.loop_id for loop in targets]},
            )

        return None

    def _update_profile_from_message(
        self,
        message: str,
        lowered: str,
    ) -> tuple[str, dict[str, object]] | None:
        profile = self.load_profile()
        changed: list[str] = []

        model = self._extract_known_value(message, KNOWN_MODELS)
        autonomy = self._extract_known_value(lowered, KNOWN_AUTONOMY)
        project_slug = self._extract_project_slug(message)

        if ("core model" in lowered or "핵심 모델" in lowered) and model:
            profile.launch.run_settings.codex_model = model
            profile.autopilot.run_settings.codex_model = model
            changed.append(f"core model={model}")
        if ("review model" in lowered or "리뷰 모델" in lowered) and model:
            profile.launch.run_settings.codex_review_model = model
            profile.autopilot.run_settings.codex_review_model = model
            changed.append(f"review model={model}")
        if ("core autonomy" in lowered or "핵심 자율도" in lowered) and autonomy:
            profile.launch.run_settings.codex_autonomy = autonomy  # type: ignore[assignment]
            profile.autopilot.run_settings.codex_autonomy = autonomy  # type: ignore[assignment]
            changed.append(f"core autonomy={autonomy}")
        if ("review autonomy" in lowered or "리뷰 자율도" in lowered) and autonomy:
            profile.launch.run_settings.codex_review_autonomy = autonomy  # type: ignore[assignment]
            profile.autopilot.run_settings.codex_review_autonomy = autonomy  # type: ignore[assignment]
            changed.append(f"review autonomy={autonomy}")

        if "기본값" in lowered or "default" in lowered:
            if "24/7" in lowered or "always_on" in lowered:
                profile.autopilot.loop_mode = "always_on"
                changed.append("loop mode=always_on")
            if "full_auto" in lowered:
                profile.autopilot.loop_mode = "full_auto"
                changed.append("loop mode=full_auto")

        if project_slug and any(token in lowered for token in ["default project", "기본 프로젝트", "launch project", "autopilot project", "런 프로젝트", "루프 프로젝트"]):
            if "autopilot" in lowered or "루프" in lowered:
                profile.autopilot.project_slug = project_slug
                changed.append(f"autopilot project={project_slug}")
            elif "launch" in lowered or "run" in lowered or "런" in lowered:
                profile.launch.project_slug = project_slug
                changed.append(f"launch project={project_slug}")
            else:
                profile.launch.project_slug = project_slug
                profile.autopilot.project_slug = project_slug
                changed.append(f"default project={project_slug}")

        if not changed:
            return None

        self.save_profile(profile)
        return (
            "기본 제어 프로필을 업데이트했습니다: " + ", ".join(changed),
            {"type": "profile_update", "changes": changed},
        )

    def _looks_like_status(self, lowered: str) -> bool:
        return any(
            token in lowered
            for token in ["status", "state", "상태", "현황", "무슨 일", "what is running"]
        )

    def _looks_like_stop(self, lowered: str) -> bool:
        return any(
            token in lowered
            for token in ["stop loop", "stop autopilot", "루프 중지", "루프 멈춰", "중지"]
        )

    def _looks_like_run_launch(self, lowered: str) -> bool:
        return any(
            token in lowered
            for token in ["launch run", "start run", "run:", "mission:", "런 시작", "새 런", "미션:"]
        )

    def _looks_like_loop_launch(self, lowered: str) -> bool:
        return any(
            token in lowered
            for token in ["start loop", "launch loop", "autopilot", "24/7", "always_on", "루프 시작", "오토파일럿"]
        )

    def _extract_payload(self, message: str, markers: list[str]) -> str:
        for marker in markers:
            index = message.lower().find(marker.lower())
            if index < 0:
                continue
            payload = message[index + len(marker):].strip(" :\n\t")
            if payload:
                return payload
        return ""

    def _extract_loop_id(self, message: str) -> str | None:
        match = LOOP_ID_PATTERN.search(message.lower())
        return match.group(0) if match else None

    def _extract_known_value(self, message: str, known_values: list[str]) -> str | None:
        lowered = message.lower()
        for value in known_values:
            if value in lowered:
                return value
        return None

    def _extract_project_slug(self, message: str) -> str | None:
        match = PROJECT_SLUG_PATTERN.search(message)
        return match.group(1).lower() if match else None

    def _strip_project_directive(self, message: str) -> str:
        return PROJECT_SLUG_PATTERN.sub("", message).replace("  ", " ").strip()


def seed_operator_profile(profile: OperatorProfile, company_config: CompanyConfig | None = None) -> OperatorProfile:
    if not profile.launch.run_settings.codex_model:
        profile.launch.run_settings.codex_model = DEFAULT_CORE_CODEX_MODEL
    if not profile.launch.run_settings.codex_review_model:
        profile.launch.run_settings.codex_review_model = DEFAULT_REVIEW_CODEX_MODEL
    if not profile.autopilot.run_settings.codex_model:
        profile.autopilot.run_settings.codex_model = DEFAULT_CORE_CODEX_MODEL
    if not profile.autopilot.run_settings.codex_review_model:
        profile.autopilot.run_settings.codex_review_model = DEFAULT_REVIEW_CODEX_MODEL
    if company_config is not None:
        all_department_keys = [
            department.key
            for department in [*company_config.departments, *company_config.review_departments]
        ]
        if company_config.enable_final_review:
            all_department_keys.append("board_review")
        if not profile.roster.active_department_keys:
            profile.roster.active_department_keys = all_department_keys
        else:
            allowed = set(all_department_keys)
            profile.roster.active_department_keys = [
                key for key in profile.roster.active_department_keys if key in allowed
            ]
        allowed_campus = set(all_department_keys + ["monument"])
        profile.roster.hidden_campus_items = [
            key for key in profile.roster.hidden_campus_items if key in allowed_campus
        ]
    return profile
