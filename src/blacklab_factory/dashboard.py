from __future__ import annotations

import json
from pathlib import Path

import markdown
from pydantic import BaseModel
from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.cors import CORSMiddleware

from .autopilot import AutopilotSupervisor
from .config import load_company_config, repo_root
from .launcher import launch_detached_loop, launch_detached_run
from .models import (
    DEFAULT_CORE_CODEX_MODEL,
    DEFAULT_REVIEW_CODEX_AUTONOMY,
    DEFAULT_REVIEW_CODEX_MODEL,
    EventEntry,
    OperatorProfile,
    RunSettings,
)
from .operator_control import OperatorCommander
from .resources import RuntimeResourceManager
from .storage import RunStorage

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
STATIC_DIR = Path(__file__).resolve().parent / "static"
FRONTEND_DIST_DIR = repo_root() / "frontend" / "dist"
CAMPUS_LAYOUT_PATH = repo_root() / "frontend" / "src" / "config" / "campus-layout.json"


class RunLaunchPayload(BaseModel):
    mission: str
    project_slug: str | None = None
    mode: str = "codex"
    codex_model: str = DEFAULT_CORE_CODEX_MODEL
    codex_autonomy: str = "read_only"
    codex_review_model: str = DEFAULT_REVIEW_CODEX_MODEL
    codex_review_autonomy: str = DEFAULT_REVIEW_CODEX_AUTONOMY
    max_parallel_departments: int = 9
    pause_between_departments: float = 0


class LoopLaunchPayload(BaseModel):
    objective: str
    project_slug: str | None = None
    run_mode: str = "codex"
    loop_mode: str = "full_auto"
    codex_model: str = DEFAULT_CORE_CODEX_MODEL
    codex_autonomy: str = "full_auto"
    codex_review_model: str = DEFAULT_REVIEW_CODEX_MODEL
    codex_review_autonomy: str = DEFAULT_REVIEW_CODEX_AUTONOMY
    max_parallel_departments: int = 9
    pause_between_departments: float = 0
    interval_seconds: int = 30
    max_iterations: int = 3


class OperatorChatPayload(BaseModel):
    message: str


class CampusBuildingPayload(BaseModel):
    position: list[float]
    shape: str
    color: str


class CampusMonumentPayload(BaseModel):
    position: list[float]
    baseInnerRadius: float
    baseOuterRadius: float
    ringInnerRadius: float
    ringOuterRadius: float
    torusRadius: float
    torusTube: float
    orbRadius: float
    torusHeight: float
    orbHeight: float


class CampusLayoutPayload(BaseModel):
    buildings: dict[str, CampusBuildingPayload]
    monument: CampusMonumentPayload


def create_app(storage: RunStorage) -> FastAPI:
    app = FastAPI(title="BlackLAB Factory Dashboard")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    frontend_enabled = FRONTEND_DIST_DIR.exists()
    if frontend_enabled:
        assets_dir = FRONTEND_DIST_DIR / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")
    base_root = storage.root
    loop_storage = AutopilotSupervisor(storage_root=base_root).loop_storage
    company_config = load_company_config()
    operator = OperatorCommander(base_root)
    resource_manager = RuntimeResourceManager()

    def load_campus_layout() -> dict:
        if not CAMPUS_LAYOUT_PATH.exists():
            raise HTTPException(status_code=404, detail="Campus layout not found")
        return json.loads(CAMPUS_LAYOUT_PATH.read_text(encoding="utf-8"))

    def save_campus_layout(payload: CampusLayoutPayload) -> dict:
        data = payload.model_dump(mode="json")
        CAMPUS_LAYOUT_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return data

    def _running_message(run, department_label: str, department_purpose: str) -> str:
        current_status = (run.current_status or "").strip()
        if current_status and department_label.lower() in current_status.lower():
            return current_status
        return f"{department_label} is actively working. {department_purpose}"

    def build_run_events(run) -> list[EventEntry]:
        events: list[EventEntry] = []
        for step in run.steps:
            timestamp = step.completed_at or step.started_at
            if timestamp is None or step.status == "pending":
                continue

            if step.status == "completed":
                title = f"{step.department_label} completed"
                message = step.summary or step.purpose
                is_live = False
            elif step.status == "running":
                title = f"{step.department_label} running"
                message = _running_message(run, step.department_label, step.purpose)
                is_live = True
            elif step.status == "failed":
                title = f"{step.department_label} failed"
                message = step.summary or f"{step.department_label} failed during execution."
                is_live = False
            else:
                continue

            events.append(
                EventEntry(
                    event_id=f"{run.run_id}:{step.department_key}:{step.status}:{timestamp.isoformat()}",
                    scope="department",
                    title=title,
                    message=message,
                    status=step.status,
                    timestamp=timestamp,
                    run_id=run.run_id,
                    department_key=step.department_key,
                    department_label=step.department_label,
                    is_live=is_live,
                )
            )

        if run.status in {"failed", "completed", "stale"}:
            events.append(
                EventEntry(
                    event_id=f"{run.run_id}:run:{run.status}:{run.updated_at.isoformat()}",
                    scope="run",
                    title=f"Run {run.status}",
                    message=run.current_status,
                    status=run.status,
                    timestamp=run.updated_at,
                    run_id=run.run_id,
                )
            )

        return sorted(events, key=lambda event: event.timestamp, reverse=True)

    def build_loop_events(loop_state) -> list[EventEntry]:
        return [
            EventEntry(
                event_id=f"{loop_state.loop_id}:loop:{loop_state.status}:{loop_state.updated_at.isoformat()}",
                scope="loop",
                title=f"Loop {loop_state.status}",
                message=loop_state.latest_note,
                status=loop_state.status,
                timestamp=loop_state.updated_at,
                loop_id=loop_state.loop_id,
                is_live=loop_state.status in {"running", "stopping"},
            )
        ]

    def build_operator_feed(runs, loops, limit: int = 18) -> list[EventEntry]:
        feed: list[EventEntry] = []
        for run in runs[:6]:
            feed.extend(build_run_events(run)[:12])
        for loop_state in loops[:4]:
            feed.extend(build_loop_events(loop_state))
        feed.sort(key=lambda event: event.timestamp, reverse=True)
        return feed[:limit]

    def build_department_bubbles(runs) -> dict[str, EventEntry]:
        bubbles: dict[str, EventEntry] = {}
        max_departments = len(company_config.departments) + len(company_config.review_departments) + 1
        for run in runs:
            for event in build_run_events(run):
                if not event.department_key or event.department_key in bubbles:
                    continue
                if event.status not in {"running", "completed", "failed"}:
                    continue
                bubbles[event.department_key] = event
            if len(bubbles) >= max_departments:
                break
        return bubbles

    def build_run_report(run) -> dict:
        headline: str
        if run.status == "running":
            headline = f"현재 {run.current_department or '대기 상태'}에서 작업 중입니다."
        elif run.status == "completed":
            headline = f"전체 {run.completed_departments_count}개 부서를 완료했습니다."
        elif run.status == "failed":
            headline = "실패한 run입니다. 아래 상태와 로그를 확인해야 합니다."
        elif run.status == "stale":
            headline = "워커 heartbeat가 끊긴 run입니다."
        else:
            headline = "실행 대기 중인 run입니다."

        updates = []
        for step in run.steps:
            if step.status == "completed":
                updates.append(
                    {
                        "department": step.department_label,
                        "status": step.status,
                        "summary": step.summary or step.purpose,
                    }
                )

        return {
            "run_id": run.run_id,
            "project_slug": getattr(run, "project_slug", None),
            "project_name": getattr(run, "project_name", None),
            "title": run.display_title,
            "status": run.status,
            "headline": headline,
            "next_action": run.next_action,
            "current_status": run.current_status,
            "current_department": run.current_department,
            "last_completed_department": run.last_completed_department,
            "completed_departments_count": run.completed_departments_count,
            "total_departments_count": run.total_departments_count,
            "artifact_count": run.metrics.get("artifact_count", len(run.artifacts)),
            "risk_count": run.metrics.get("open_risk_count", len(run.risks)),
            "updates": list(reversed(updates[-4:])),
            "events": build_run_events(run)[:12],
        }

    def build_loop_report(loop_state) -> dict:
        if loop_state.status in {"running", "stopping"}:
            headline = f"현재 iteration {loop_state.current_iteration}을 기준으로 루프가 작동 중입니다."
        elif loop_state.status == "completed":
            headline = f"총 {loop_state.iterations_completed}회 iteration을 완료했습니다."
        elif loop_state.status == "failed":
            headline = "실패한 loop입니다. 마지막 note와 연결된 run을 확인해야 합니다."
        else:
            headline = "루프 대기 상태입니다."

        return {
            "loop_id": loop_state.loop_id,
            "project_slug": getattr(loop_state, "project_slug", None),
            "project_name": getattr(loop_state, "project_name", None),
            "title": loop_state.display_title,
            "status": loop_state.status,
            "headline": headline,
            "current_run_id": loop_state.current_run_id,
            "latest_note": loop_state.latest_note,
            "iterations_completed": loop_state.iterations_completed,
            "current_iteration": loop_state.current_iteration,
            "events": build_loop_events(loop_state),
        }

    def build_department_packets(run) -> list[dict]:
        artifacts_by_key = {artifact.department_key: artifact for artifact in run.artifacts}
        packets: list[dict] = []
        for step in run.steps:
            artifact = artifacts_by_key.get(step.department_key)
            packets.append(
                {
                    "department_key": step.department_key,
                    "department_label": step.department_label,
                    "status": step.status,
                    "summary": step.summary or step.purpose,
                    "artifact_title": artifact.title if artifact else None,
                    "artifact_filename": artifact.filename if artifact else None,
                    "artifact_preview": artifact.preview if artifact else None,
                    "is_final": step.department_key == "board_review",
                }
            )
        return packets

    def build_department_catalog(operator_profile: OperatorProfile) -> list[dict]:
        active_keys = set(operator_profile.roster.active_department_keys)
        hidden_campus = set(operator_profile.roster.hidden_campus_items)
        catalog = []
        for department in [*company_config.departments, *company_config.review_departments]:
            catalog.append(
                {
                    "key": department.key,
                    "label": department.label,
                    "purpose": department.purpose,
                    "output_title": department.output_title,
                    "resource_lane": department.resource_lane,
                    "priority": department.priority,
                    "runtime_tier": department.runtime_tier,
                    "is_active": department.key in active_keys,
                    "is_visible_on_campus": department.key not in hidden_campus and department.key in active_keys,
                }
            )
        if company_config.enable_final_review:
            catalog.append(
                {
                    "key": "board_review",
                    "label": company_config.final_review_label,
                    "purpose": "Synthesize all department outputs into one operator briefing.",
                    "output_title": company_config.final_review_output_title,
                    "resource_lane": "review",
                    "priority": 40,
                    "runtime_tier": "review",
                    "is_active": "board_review" in active_keys,
                    "is_visible_on_campus": "board_review" not in hidden_campus and "board_review" in active_keys,
                }
            )
        return catalog

    def build_overview_context() -> dict:
        runs = storage.list_runs()
        loops = loop_storage.list_loops()
        operator_profile = operator.load_profile()
        operator_feed = build_operator_feed(runs, loops)
        resource_snapshot = resource_manager.snapshot(company_config.max_parallel_departments)
        active_runs = [run for run in runs if run.status == "running"]
        blocked_runs = [run for run in runs if run.status in {"failed", "stale"}]
        completed_runs = [run for run in runs if run.status == "completed"]
        active_loops = [loop for loop in loops if loop.status in {"running", "stopping"}]
        operator_route = build_operator_route(active_runs, active_loops)
        latest_decisions = [
            {"department": step.department_label, "summary": step.summary}
            for run in runs
            for step in run.steps
            if step.summary
        ][-8:]
        top_risks = [
            {"severity": "medium", "summary": risk}
            for run in runs
            for risk in run.risks
        ][-8:]
        current_project = build_current_project(runs, loops, operator_profile)
        return {
            "runs": runs,
            "loops": loops,
            "operator_feed": operator_feed,
            "bubble_events": build_department_bubbles(runs),
            "recent_run_reports": [build_run_report(run) for run in runs[:6]],
            "recent_loop_reports": [build_loop_report(loop) for loop in loops[:4]],
            "active_runs": active_runs,
            "blocked_runs": blocked_runs,
            "completed_runs": completed_runs,
            "active_loops": active_loops,
            "latest_decisions": list(reversed(latest_decisions)),
            "top_risks": list(reversed(top_risks)),
            "stale_runs": [run for run in runs if run.status == "stale"],
            "default_settings": RunSettings(),
            "operator_profile": operator_profile,
            "department_catalog": build_department_catalog(operator_profile),
            "resource_snapshot": resource_snapshot,
            "current_project": current_project,
            "operator_route": operator_route,
        }

    def build_operator_route(active_runs, active_loops) -> dict:
        if active_runs:
            if len(active_runs) == 1:
                run = active_runs[0]
                return {
                    "mode": "live_run",
                    "label": "Live Run Channel",
                    "detail": f"Messages route into run {run.run_id} and apply on the next available department wave.",
                }
            return {
                "mode": "run_broadcast",
                "label": "Run Broadcast Channel",
                "detail": f"Messages broadcast to {len(active_runs)} active runs and apply on their next available department waves.",
            }
        if active_loops:
            if len(active_loops) == 1:
                loop_state = active_loops[0]
                return {
                    "mode": "live_loop",
                    "label": "Live Loop Channel",
                    "detail": f"Messages route into loop {loop_state.loop_id} and apply on the next iteration.",
                }
            return {
                "mode": "loop_broadcast",
                "label": "Loop Broadcast Channel",
                "detail": f"Messages broadcast to {len(active_loops)} active loops and apply on their next iterations.",
            }
        return {
            "mode": "control_plane",
            "label": "Control Plane Only",
            "detail": "No live run or loop is active. Messages act as orchestration commands unless they explicitly launch new work.",
        }

    def build_current_project(runs, loops, operator_profile) -> dict | None:
        for run in runs:
            if run.status == "running" and run.project_slug:
                return {
                    "slug": run.project_slug,
                    "name": run.project_name or run.project_slug,
                    "source": "active run",
                    "entity_id": run.run_id,
                }
        for loop_state in loops:
            if loop_state.status in {"running", "stopping"} and loop_state.project_slug:
                return {
                    "slug": loop_state.project_slug,
                    "name": loop_state.project_name or loop_state.project_slug,
                    "source": "active loop",
                    "entity_id": loop_state.loop_id,
                }
        for run in runs:
            if run.project_slug:
                return {
                    "slug": run.project_slug,
                    "name": run.project_name or run.project_slug,
                    "source": "recent run",
                    "entity_id": run.run_id,
                }
        for loop_state in loops:
            if loop_state.project_slug:
                return {
                    "slug": loop_state.project_slug,
                    "name": loop_state.project_name or loop_state.project_slug,
                    "source": "recent loop",
                    "entity_id": loop_state.loop_id,
                }
        if operator_profile.launch.project_slug:
            slug = operator_profile.launch.project_slug
            return {
                "slug": slug,
                "name": slug.replace("-", " ").title(),
                "source": "launch default",
                "entity_id": None,
            }
        if operator_profile.autopilot.project_slug:
            slug = operator_profile.autopilot.project_slug
            return {
                "slug": slug,
                "name": slug.replace("-", " ").title(),
                "source": "autopilot default",
                "entity_id": None,
            }
        return None

    def frontend_index_response() -> HTMLResponse:
        index_path = FRONTEND_DIST_DIR / "index.html"
        if not index_path.exists():
            raise HTTPException(status_code=503, detail="Frontend build not found")
        return HTMLResponse(index_path.read_text(encoding="utf-8"))

    @app.get("/favicon.svg")
    def frontend_favicon():
        favicon = FRONTEND_DIST_DIR / "favicon.svg"
        if not favicon.exists():
            raise HTTPException(status_code=404, detail="Asset not found")
        return FileResponse(favicon)

    @app.get("/icons.svg")
    def frontend_icons():
        icons = FRONTEND_DIST_DIR / "icons.svg"
        if not icons.exists():
            raise HTTPException(status_code=404, detail="Asset not found")
        return FileResponse(icons)

    @app.get("/")
    def index(request: Request):
        return templates.TemplateResponse(
            name="index.html",
            request=request,
            context=build_overview_context(),
        )

    @app.get("/launch")
    def launch_page(request: Request):
        context = build_overview_context()
        context["recent_runs"] = context["runs"][:10]
        context["company_config"] = company_config
        return templates.TemplateResponse(
            name="launch.html",
            request=request,
            context=context,
        )

    @app.get("/autopilot")
    def autopilot_page(request: Request):
        context = build_overview_context()
        context["company_config"] = company_config
        return templates.TemplateResponse(
            name="autopilot.html",
            request=request,
            context=context,
        )

    @app.get("/runs")
    def runs_page(request: Request):
        context = build_overview_context()
        return templates.TemplateResponse(
            name="runs.html",
            request=request,
            context=context,
        )

    @app.get("/loops")
    def loops_page(request: Request):
        context = build_overview_context()
        return templates.TemplateResponse(
            name="loops.html",
            request=request,
            context=context,
        )

    @app.get("/loops/{loop_id}")
    def loop_detail(request: Request, loop_id: str):
        try:
            loop_state = loop_storage.load_state(loop_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Loop not found") from exc

        linked_runs = []
        for iteration in loop_state.runs:
            if not iteration.run_id:
                linked_runs.append((iteration, None))
                continue
            try:
                linked_runs.append((iteration, storage.load_state(iteration.run_id)))
            except FileNotFoundError:
                linked_runs.append((iteration, None))

        return templates.TemplateResponse(
            name="loop_detail.html",
            request=request,
            context={
                "loop_state": loop_state,
                "linked_runs": linked_runs,
                "log_tail": loop_storage.read_log_tail(loop_id),
                "loop_report": build_loop_report(loop_state),
                "event_feed": build_operator_feed(storage.list_runs(), loop_storage.list_loops()),
                "current_project": (
                    {
                        "slug": loop_state.project_slug,
                        "name": loop_state.project_name or loop_state.project_slug,
                        "source": "current loop",
                        "entity_id": loop_state.loop_id,
                    }
                    if loop_state.project_slug
                    else build_overview_context().get("current_project")
                ),
            },
        )

    @app.get("/settings")
    def settings_page(request: Request):
        context = build_overview_context()
        context["company_config"] = company_config
        context["department_catalog"] = build_department_catalog(context["operator_profile"])
        context["runtime_profiles"] = [
            {
                "label": "Read Only",
                "value": "read_only",
                "codex_flag": "-s read-only",
                "description": "Safer research and strategy mode. No file writes.",
            },
            {
                "label": "Full Auto",
                "value": "full_auto",
                "codex_flag": "--full-auto",
                "description": "Automatic sandboxed execution for faster iteration.",
            },
            {
                "label": "YOLO",
                "value": "yolo",
                "codex_flag": "--dangerously-bypass-approvals-and-sandbox",
                "description": "Highest autonomy. Use only when the surrounding environment is trusted.",
            },
        ]
        return templates.TemplateResponse(
            name="settings.html",
            request=request,
            context=context,
        )

    @app.get("/operator")
    def operator_page(request: Request):
        context = build_overview_context()
        context["chat_messages"] = operator.load_chat_history()
        return templates.TemplateResponse(
            name="operator.html",
            request=request,
            context=context,
        )

    @app.get("/runs/{run_id}")
    def run_detail(request: Request, run_id: str):
        try:
            run = storage.load_state(run_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Run not found") from exc

        selected_artifact = next(
            (artifact for artifact in reversed(run.artifacts) if artifact.department_key == "board_review"),
            run.artifacts[-1] if run.artifacts else None,
        )
        preview_html = ""
        if selected_artifact:
            preview_html = markdown.markdown(
                storage.read_artifact(selected_artifact.path),
                extensions=["extra"],
            )

        return templates.TemplateResponse(
            name="run_detail.html",
            request=request,
            context={
                "run": run,
                "run_report": build_run_report(run),
                "selected_artifact": selected_artifact,
                "department_packets": build_department_packets(run),
                "preview_html": preview_html,
                "log_tail": storage.read_log_tail(run_id),
                "event_feed": build_run_events(run)[:12],
                "current_project": (
                    {
                        "slug": run.project_slug,
                        "name": run.project_name or run.project_slug,
                        "source": "current run",
                        "entity_id": run.run_id,
                    }
                    if run.project_slug
                    else build_overview_context().get("current_project")
                ),
            },
        )

    def operator_shell() -> HTMLResponse:
        if frontend_enabled:
            return frontend_index_response()
        raise HTTPException(status_code=503, detail="Frontend build not found")

    @app.get("/console", include_in_schema=False)
    def operator_home():
        return operator_shell()

    @app.get("/console/launch", include_in_schema=False)
    def operator_launch():
        return operator_shell()

    @app.get("/console/autopilot", include_in_schema=False)
    def operator_autopilot():
        return operator_shell()

    @app.get("/console/runs", include_in_schema=False)
    def operator_runs():
        return operator_shell()

    @app.get("/console/runs/{run_id}", include_in_schema=False)
    def operator_run_detail(run_id: str):
        return operator_shell()

    @app.get("/console/loops", include_in_schema=False)
    def operator_loops():
        return operator_shell()

    @app.get("/console/loops/{loop_id}", include_in_schema=False)
    def operator_loop_detail(loop_id: str):
        return operator_shell()

    @app.get("/console/settings", include_in_schema=False)
    def operator_settings():
        return operator_shell()

    @app.get("/api/runs")
    def list_runs_api():
        runs = [run.model_dump(mode="json") for run in storage.list_runs()]
        return JSONResponse({"runs": runs})

    @app.get("/api/loops")
    def list_loops_api():
        loops = [loop.model_dump(mode="json") for loop in loop_storage.list_loops()]
        return JSONResponse({"loops": loops})

    @app.get("/api/runs/{run_id}")
    def run_detail_api(run_id: str):
        try:
            run = storage.load_state(run_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Run not found") from exc
        return JSONResponse(run.model_dump(mode="json"))

    @app.get("/api/loops/{loop_id}")
    def loop_detail_api(loop_id: str):
        try:
            loop_state = loop_storage.load_state(loop_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Loop not found") from exc
        return JSONResponse(loop_state.model_dump(mode="json"))

    @app.get("/api/settings")
    def settings_api():
        return JSONResponse(
            {
                **company_config.model_dump(mode="json"),
                "default_run_settings": RunSettings().model_dump(mode="json"),
                "operator_profile": operator.load_profile().model_dump(mode="json"),
                "resource_snapshot": resource_manager.snapshot(company_config.max_parallel_departments).model_dump(mode="json"),
            }
        )

    @app.get("/api/feed")
    def operator_feed_api():
        runs = storage.list_runs()
        loops = loop_storage.list_loops()
        feed = build_operator_feed(runs, loops)
        bubbles = build_department_bubbles(runs)
        return JSONResponse(
            {
                "events": [event.model_dump(mode="json") for event in feed],
                "bubbles": {key: event.model_dump(mode="json") for key, event in bubbles.items()},
            }
        )

    @app.get("/api/campus-layout")
    def campus_layout_api():
        return JSONResponse(load_campus_layout())

    @app.post("/api/campus-layout")
    def save_campus_layout_api(payload: CampusLayoutPayload = Body(...)):
        return JSONResponse(save_campus_layout(payload))

    @app.get("/api/operator/profile")
    def operator_profile_api():
        return JSONResponse(operator.load_profile().model_dump(mode="json"))

    @app.post("/api/operator/profile")
    def save_operator_profile_api(profile: OperatorProfile = Body(...)):
        saved = operator.save_profile(profile)
        return JSONResponse(saved.model_dump(mode="json"))

    @app.post("/api/operator/chat")
    def operator_chat_api(payload: OperatorChatPayload = Body(...)):
        return JSONResponse(operator.handle_message(payload.message))

    @app.post("/api/launch/run")
    def launch_run_api(payload: RunLaunchPayload = Body(...)):
        operator_profile = operator.load_profile()
        launch = launch_detached_run(
            mission=payload.mission,
            project_slug=payload.project_slug,
            mode=payload.mode,
            pause_between_departments=payload.pause_between_departments,
            max_parallel_departments=payload.max_parallel_departments,
            active_department_keys=operator_profile.roster.active_department_keys,
            storage_root=base_root,
            codex_model=payload.codex_model,
            codex_autonomy=payload.codex_autonomy,
            codex_review_model=payload.codex_review_model,
            codex_review_autonomy=payload.codex_review_autonomy,
        )
        return JSONResponse(
            {
                "run_id": launch.entity_id,
                "pid": launch.pid,
                "log_path": str(launch.log_path),
                "status": "detached",
            }
        )

    @app.post("/api/runs/{run_id}/stop")
    def stop_run_api(run_id: str):
        run_state = storage.request_stop(run_id)
        return JSONResponse(run_state.model_dump(mode="json"))

    @app.post("/api/launch/loop")
    def launch_loop_api(payload: LoopLaunchPayload = Body(...)):
        operator_profile = operator.load_profile()
        launch = launch_detached_loop(
            objective=payload.objective,
            project_slug=payload.project_slug,
            run_mode=payload.run_mode,
            loop_mode=payload.loop_mode,
            interval_seconds=payload.interval_seconds,
            max_iterations=payload.max_iterations if payload.loop_mode == "full_auto" else None,
            pause_between_departments=payload.pause_between_departments,
            max_parallel_departments=payload.max_parallel_departments,
            active_department_keys=operator_profile.roster.active_department_keys,
            storage_root=base_root,
            codex_model=payload.codex_model,
            codex_autonomy=payload.codex_autonomy,
            codex_review_model=payload.codex_review_model,
            codex_review_autonomy=payload.codex_review_autonomy,
        )
        return JSONResponse(
            {
                "loop_id": launch.entity_id,
                "pid": launch.pid,
                "log_path": str(launch.log_path),
                "status": "detached",
            }
        )

    @app.post("/api/loops/{loop_id}/stop")
    def stop_loop_api(loop_id: str):
        supervisor = AutopilotSupervisor(storage_root=base_root)
        loop_state = supervisor.request_stop(loop_id)
        return JSONResponse(loop_state.model_dump(mode="json"))

    @app.get("/runs/{run_id}/artifacts/{filename}")
    def artifact_detail(run_id: str, filename: str):
        artifact_path = storage.artifacts_dir(run_id) / filename
        if not artifact_path.exists():
            raise HTTPException(status_code=404, detail="Artifact not found")
        return PlainTextResponse(artifact_path.read_text(encoding="utf-8"))

    @app.get("/runs/{run_id}/log")
    def run_log_detail(run_id: str):
        return PlainTextResponse(storage.read_log_tail(run_id, limit=500))

    @app.get("/loops/{loop_id}/log")
    def loop_log_detail(loop_id: str):
        return PlainTextResponse(loop_storage.read_log_tail(loop_id, limit=500))

    return app
