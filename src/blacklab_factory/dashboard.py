from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import markdown
from pydantic import BaseModel
from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.cors import CORSMiddleware

from .autopilot import AutopilotSupervisor
from .config import load_company_config, repo_root
from .launcher import launch_detached_loop, launch_detached_release, launch_detached_run, terminate_process_group
from .models import (
    DEFAULT_CORE_CODEX_MODEL,
    DEFAULT_REVIEW_CODEX_AUTONOMY,
    DEFAULT_REVIEW_CODEX_MODEL,
    EventEntry,
    OperatorProfile,
    ReleaseState,
    RunSettings,
)
from .operator_control import OperatorCommander
from .resources import RuntimeResourceManager
from .storage import LoopStorage, ProjectStorage, ReleaseStorage, RunStorage

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


def _collect_force_stop_candidates(*pids: int | None) -> list[int]:
    seen: set[int] = set()
    ordered: list[int] = []
    for pid in pids:
        if pid is None or pid <= 0 or pid in seen:
            continue
        seen.add(pid)
        ordered.append(pid)
    return ordered


def _force_stop_run_state(storage: RunStorage, run_id: str):
    run_state = storage.load_state(run_id)
    pid_candidates = _collect_force_stop_candidates(
        run_state.controller_pid,
        *(process.pid for process in run_state.current_processes),
    )
    if not pid_candidates:
        raise HTTPException(status_code=409, detail="No live controller or worker PID is registered for this run.")

    killed_any = False
    for pid in pid_candidates:
        killed_any = terminate_process_group(pid) or killed_any

    reason = (
        "Run force stopped by operator. Current in-flight work may be incomplete."
        if killed_any
        else "Force stop was requested, but no live process could be terminated. Current work may already have exited."
    )
    return storage.mark_force_stopped(run_id, reason)


def _force_stop_loop_state(loop_storage: LoopStorage, run_storage: RunStorage, loop_id: str):
    loop_state = loop_storage.load_state(loop_id)
    linked_run = None
    if loop_state.current_run_id:
        try:
            linked_run = run_storage.load_state(loop_state.current_run_id)
        except FileNotFoundError:
            linked_run = None

    pid_candidates = _collect_force_stop_candidates(
        loop_state.controller_pid,
        linked_run.controller_pid if linked_run else None,
        *(process.pid for process in linked_run.current_processes) if linked_run else (),
    )
    if not pid_candidates:
        raise HTTPException(status_code=409, detail="No live controller or worker PID is registered for this loop.")

    killed_any = False
    for pid in pid_candidates:
        killed_any = terminate_process_group(pid) or killed_any

    reason = (
        "Loop force stopped by operator. Current in-flight work may be incomplete."
        if killed_any
        else "Force stop was requested, but no live process could be terminated. Current work may already have exited."
    )
    if linked_run is not None:
        run_storage.mark_force_stopped(linked_run.run_id, "Run force stopped because its parent loop was force stopped.")
    return loop_storage.mark_force_stopped(loop_id, reason)


ORGANIZATION_GROUPS = {
    "headquarters": {
        "label": "Headquarters",
        "description": "Company leadership, planning, and final approval.",
        "order": 10,
    },
    "product_design": {
        "label": "Product & Design",
        "description": "Product planning, user experience, and product definition.",
        "order": 20,
    },
    "research_engineering": {
        "label": "Research & Engineering",
        "description": "Research, software delivery, and technical execution.",
        "order": 30,
    },
    "quality_testing": {
        "label": "Review & Release",
        "description": "Validation, testing, final review, and delivery packaging.",
        "order": 40,
    },
    "growth_marketing": {
        "label": "Growth & Marketing",
        "description": "Launch support, positioning, and audience growth.",
        "order": 50,
    },
}

SUPPORT_FACILITY_SPECS = {
    "release_center": {
        "public_name": "Release Center",
        "public_summary": "Packages the finished project into a downloadable delivery bundle using the latest package handoff when the operator requests it.",
        "group": "quality_testing",
        "reports_to": "board_review",
        "order": 140,
    },
}

ORGANIZATION_TEAM_SPECS = {
    "ceo": {
        "public_name": "CEO Office",
        "public_summary": "Leads the company and coordinates the major team leads.",
        "group": "headquarters",
        "reports_to": None,
        "order": 10,
    },
    "board_review": {
        "public_name": "Executive Review Board",
        "public_summary": "Reviews the final package before the operator update goes out.",
        "group": "headquarters",
        "reports_to": "ceo",
        "order": 20,
    },
    "finance": {
        "public_name": "Strategy & Finance Team",
        "public_summary": "Handles planning, budgets, and business-level operating priorities.",
        "group": "headquarters",
        "reports_to": "ceo",
        "order": 30,
    },
    "product": {
        "public_name": "Product Planning Team",
        "public_summary": "Defines what gets built, why it matters, and what ships next.",
        "group": "product_design",
        "reports_to": "ceo",
        "order": 40,
    },
    "design": {
        "public_name": "Design Team",
        "public_summary": "Shapes the interface, user flows, and launch presentation.",
        "group": "product_design",
        "reports_to": "product",
        "order": 50,
    },
    "research": {
        "public_name": "Research Lab",
        "public_summary": "Studies user needs, market timing, and technical directions before build-out.",
        "group": "research_engineering",
        "reports_to": "ceo",
        "order": 60,
    },
    "dev_1": {
        "public_name": "Development Team 1",
        "public_summary": "Builds core systems, backend services, and production foundations.",
        "group": "research_engineering",
        "reports_to": "research",
        "order": 70,
    },
    "dev_2": {
        "public_name": "Development Team 2",
        "public_summary": "Builds product features, operator screens, and delivery details.",
        "group": "research_engineering",
        "reports_to": "research",
        "order": 80,
    },
    "dev_3": {
        "public_name": "Development Team 3",
        "public_summary": "Owns integrations, automation, and cross-system connections.",
        "group": "research_engineering",
        "reports_to": "research",
        "order": 90,
    },
    "quality_gate": {
        "public_name": "Quality Assurance Team",
        "public_summary": "Checks release readiness and blocks weak output before sign-off.",
        "group": "quality_testing",
        "reports_to": "ceo",
        "order": 100,
    },
    "validation": {
        "public_name": "Validation Team",
        "public_summary": "Confirms the plan is measurable, realistic, and aligned with the brief.",
        "group": "quality_testing",
        "reports_to": "quality_gate",
        "order": 110,
    },
    "test_lab": {
        "public_name": "Test Team",
        "public_summary": "Stress-tests scenarios, edge cases, and rollout risks before release.",
        "group": "quality_testing",
        "reports_to": "quality_gate",
        "order": 120,
    },
    "growth": {
        "public_name": "Growth Marketing Team",
        "public_summary": "Plans positioning, launch support, and post-release audience growth.",
        "group": "growth_marketing",
        "reports_to": "ceo",
        "order": 130,
    },
}


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
    project_storage = ProjectStorage(base_root)
    release_storage = ReleaseStorage(base_root)
    company_config = load_company_config()
    operator = OperatorCommander(base_root)
    resource_manager = RuntimeResourceManager()

    def format_exact_timestamp(value: datetime | None) -> str:
        if value is None:
            return "-"
        return value.astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")

    def format_relative_timestamp(value: datetime | None) -> str:
        if value is None:
            return "-"
        now = datetime.now(timezone.utc)
        delta = now - value.astimezone(timezone.utc)
        seconds = max(0, int(delta.total_seconds()))
        if seconds < 60:
            return "just now"
        if seconds < 3600:
            minutes = seconds // 60
            return f"{minutes} min ago"
        if seconds < 86400:
            hours = seconds // 3600
            return f"{hours} hr ago"
        days = seconds // 86400
        return f"{days} day ago" if days == 1 else f"{days} days ago"

    templates.env.globals["format_exact_timestamp"] = format_exact_timestamp
    templates.env.globals["format_relative_timestamp"] = format_relative_timestamp

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

    def summarize_release_state(release_state: ReleaseState) -> dict:
        status_label = {
            "running": "Packaging",
            "completed": "Ready",
            "failed": "Failed",
            "stale": "Attention",
            "queued": "Queued",
        }.get(release_state.status, release_state.status.title())
        action_label = {
            "completed": "Rebuild Release",
            "failed": "Retry Release",
            "stale": "Rebuild Release",
        }.get(release_state.status, "Build Release")
        return {
            "release_id": release_state.release_id,
            "status": release_state.status,
            "status_label": status_label,
            "created_at": release_state.created_at.isoformat(),
            "updated_at": release_state.updated_at.isoformat(),
            "summary": release_state.summary,
            "current_status": release_state.current_status,
            "release_type": release_state.release_type,
            "action_label": action_label,
            "download_url": (
                f"/api/releases/{release_state.release_id}/download"
                if release_state.status == "completed" and release_state.download_path
                else None
            ),
            "download_filename": Path(release_state.download_path).name if release_state.download_path else None,
        }

    def build_release_events(release_state: ReleaseState) -> list[EventEntry]:
        if release_state.status not in {"running", "completed", "failed", "stale"}:
            return []
        title_suffix = {
            "running": "packaging",
            "completed": "ready",
            "failed": "failed",
            "stale": "stale",
        }.get(release_state.status, release_state.status)
        message = release_state.current_status or release_state.summary or "Release Center updated the delivery bundle."
        return [
            EventEntry(
                event_id=f"{release_state.release_id}:release:{release_state.status}:{release_state.updated_at.isoformat()}",
                scope="release",
                title=f"Release Center {title_suffix}",
                message=message,
                status=release_state.status,
                timestamp=release_state.updated_at,
                department_key="release_center",
                department_label=SUPPORT_FACILITY_SPECS["release_center"]["public_name"],
                is_live=release_state.status == "running",
            )
        ]

    def build_release_maps(releases: list[ReleaseState]) -> tuple[dict[str, ReleaseState], dict[str, ReleaseState]]:
        latest_by_project: dict[str, ReleaseState] = {}
        active_by_project: dict[str, ReleaseState] = {}
        for release_state in releases:
            latest_by_project.setdefault(release_state.project_slug, release_state)
            if release_state.status == "running":
                active_by_project.setdefault(release_state.project_slug, release_state)
        return latest_by_project, active_by_project

    def build_operator_feed(runs, loops, releases, limit: int | None = 18) -> list[EventEntry]:
        feed: list[EventEntry] = []
        for run in runs[:6]:
            feed.extend(build_run_events(run)[:12])
        for loop_state in loops[:4]:
            feed.extend(build_loop_events(loop_state))
        for release_state in releases[:6]:
            feed.extend(build_release_events(release_state))
        feed.sort(key=lambda event: event.timestamp, reverse=True)
        if limit is None:
            return feed
        return feed[:limit]

    def build_latest_decisions(runs, limit: int = 8) -> list[dict]:
        updates = [
            {
                "run_id": run.run_id,
                "department": step.department_label,
                "summary": step.summary or step.purpose,
                "timestamp": step.completed_at or run.updated_at,
            }
            for run in runs
            for step in run.steps
            if step.status == "completed" and (step.summary or step.purpose)
        ]
        updates.sort(key=lambda item: item["timestamp"], reverse=True)
        return updates[:limit]

    def build_top_risks(runs, limit: int = 8) -> list[dict]:
        risks = [
            {
                "run_id": run.run_id,
                "summary": risk,
                "timestamp": run.updated_at,
            }
            for run in runs
            for risk in run.risks
        ]
        risks.sort(key=lambda item: item["timestamp"], reverse=True)
        return risks[:limit]

    def build_department_bubbles(runs, releases) -> dict[str, EventEntry]:
        bubbles: dict[str, EventEntry] = {}
        max_departments = len(company_config.departments) + len(company_config.review_departments) + 1 + len(SUPPORT_FACILITY_SPECS)
        for run in runs:
            for event in build_run_events(run):
                if not event.department_key or event.department_key in bubbles:
                    continue
                if event.status not in {"running", "completed", "failed"}:
                    continue
                bubbles[event.department_key] = event
            if len(bubbles) >= max_departments:
                break
        for release_state in releases:
            for event in build_release_events(release_state):
                if not event.department_key or event.department_key in bubbles:
                    continue
                bubbles[event.department_key] = event
            if len(bubbles) >= max_departments:
                break
        return bubbles

    def build_run_report(run) -> dict:
        headline: str
        if run.status == "running":
            headline = f"Working in {run.current_department or 'the next team'} right now."
        elif run.status == "completed":
            headline = f"Finished {run.completed_departments_count} team steps."
        elif run.status == "failed":
            headline = "This run stopped with an issue. Check the summary and log below."
        elif run.status == "stale":
            headline = "This run may have stopped unexpectedly."
        else:
            headline = "This run is waiting to start."

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
            headline = f"Cycle {loop_state.current_iteration} is in progress."
        elif loop_state.status == "completed":
            headline = f"Finished {loop_state.iterations_completed} cycles."
        elif loop_state.status == "failed":
            headline = "This loop stopped with an issue. Check the latest note and linked run."
        else:
            headline = "This loop is waiting to start."

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
            spec = ORGANIZATION_TEAM_SPECS.get(
                department.key,
                {
                    "public_name": department.label,
                    "public_summary": department.purpose,
                    "group": "research_engineering",
                    "reports_to": "ceo",
                    "order": 999,
                },
            )
            group = ORGANIZATION_GROUPS.get(spec["group"], ORGANIZATION_GROUPS["research_engineering"])
            catalog.append(
                {
                    "key": department.key,
                    "label": department.label,
                    "purpose": department.purpose,
                    "output_title": department.output_title,
                    "resource_lane": department.resource_lane,
                    "priority": department.priority,
                    "runtime_tier": department.runtime_tier,
                    "public_name": spec["public_name"],
                    "public_summary": spec["public_summary"],
                    "group_label": group["label"],
                    "reports_to": spec["reports_to"],
                    "display_order": spec["order"],
                    "is_active": department.key in active_keys,
                    "is_visible_on_campus": department.key not in hidden_campus and department.key in active_keys,
                }
            )
        if company_config.enable_final_review:
            spec = ORGANIZATION_TEAM_SPECS["board_review"]
            group = ORGANIZATION_GROUPS[spec["group"]]
            catalog.append(
                {
                    "key": "board_review",
                    "label": company_config.final_review_label,
                    "purpose": "Synthesize all department outputs into one operator briefing.",
                    "output_title": company_config.final_review_output_title,
                    "resource_lane": "review",
                    "priority": 40,
                    "runtime_tier": "review",
                    "public_name": spec["public_name"],
                    "public_summary": spec["public_summary"],
                    "group_label": group["label"],
                    "reports_to": spec["reports_to"],
                    "display_order": spec["order"],
                    "is_active": "board_review" in active_keys,
                    "is_visible_on_campus": "board_review" not in hidden_campus and "board_review" in active_keys,
                }
            )
        return sorted(catalog, key=lambda item: item["display_order"])

    def build_support_facility_catalog(operator_profile: OperatorProfile) -> list[dict]:
        hidden_campus = set(operator_profile.roster.hidden_campus_items)
        facilities = []
        for key, spec in SUPPORT_FACILITY_SPECS.items():
            group = ORGANIZATION_GROUPS.get(spec["group"], ORGANIZATION_GROUPS["quality_testing"])
            facilities.append(
                {
                    "key": key,
                    "label": spec["public_name"],
                    "purpose": spec["public_summary"],
                    "output_title": "Downloadable Release Bundle",
                    "resource_lane": "review",
                    "priority": spec["order"],
                    "runtime_tier": "review",
                    "public_name": spec["public_name"],
                    "public_summary": spec["public_summary"],
                    "group_label": group["label"],
                    "reports_to": spec["reports_to"],
                    "display_order": spec["order"],
                    "is_active": False,
                    "is_visible_on_campus": key not in hidden_campus,
                }
            )
        return facilities

    def build_organization_chart(operator_profile: OperatorProfile) -> list[dict]:
        active_teams = {
            item["key"]: item
            for item in [*build_department_catalog(operator_profile), *build_support_facility_catalog(operator_profile)]
        }
        nodes = {}
        for key, item in active_teams.items():
            nodes[key] = {
                "key": key,
                "public_name": item["public_name"],
                "public_summary": item["public_summary"],
                "group_label": item["group_label"],
                "display_order": item["display_order"],
                "children": [],
            }

        roots: list[dict] = []
        for key, item in active_teams.items():
            node = nodes[key]
            parent_key = item["reports_to"]
            if parent_key and parent_key in nodes:
                nodes[parent_key]["children"].append(node)
            else:
                roots.append(node)

        def sort_nodes(items: list[dict]) -> None:
            items.sort(key=lambda item: item["display_order"])
            for item in items:
                sort_nodes(item["children"])

        sort_nodes(roots)
        return roots

    def build_organization_directory(operator_profile: OperatorProfile) -> list[dict]:
        catalog = [*build_department_catalog(operator_profile), *build_support_facility_catalog(operator_profile)]
        groups = []
        for key, group in sorted(ORGANIZATION_GROUPS.items(), key=lambda entry: entry[1]["order"]):
            teams = [
                item
                for item in catalog
                if (
                    ORGANIZATION_TEAM_SPECS.get(item["key"], SUPPORT_FACILITY_SPECS.get(item["key"], {})).get(
                        "group",
                        "research_engineering",
                    )
                    == key
                )
            ]
            if not teams:
                continue
            groups.append(
                {
                    "key": key,
                    "label": group["label"],
                    "description": group["description"],
                    "teams": teams,
                }
            )
        return groups

    def build_project_library(*, include_archived: bool = False) -> list[dict]:
        latest_release_by_project, active_release_by_project = build_release_maps(release_storage.list_releases())
        projects = sorted(
            [
                record
                for record in project_storage.list_projects()
                if include_archived or record.status != "archived"
            ],
            key=lambda record: (record.status == "archived", -(record.last_run_at or record.updated_at).timestamp()),
        )
        return [
            {
                "slug": record.slug,
                "name": record.name or record.slug.replace("-", " ").title(),
                "status": record.status,
                "brief": record.brief,
                "run_count": record.run_count,
                "last_run_id": record.last_run_id,
                "latest_release": (
                    summarize_release_state(latest_release_by_project[record.slug])
                    if record.slug in latest_release_by_project
                    else None
                ),
                "active_release": (
                    summarize_release_state(active_release_by_project[record.slug])
                    if record.slug in active_release_by_project
                    else None
                ),
            }
            for record in projects
        ]

    def build_current_project_memory(current_project: dict | None) -> dict | None:
        if not current_project:
            return None
        slug = current_project.get("slug")
        if not slug:
            return None

        record = project_storage.get_project(slug)
        snapshot = project_storage.read_latest_memory_snapshot(slug)
        if not record and not snapshot:
            return None

        if snapshot and snapshot.get("summary"):
            sentence = snapshot["summary"].strip()
            next_hint = str(snapshot.get("next_run_hint") or "").strip()
            summary = f"The project is now at: {sentence}"
            if next_hint:
                summary = f"{summary} Next up: {next_hint}"
        else:
            summary = "No saved run summary yet. Start a run to build project memory."

        return {
            "slug": slug,
            "name": (record.name if record and record.name else current_project.get("name") or slug),
            "run_id": snapshot.get("run_id") if snapshot else (record.last_run_id if record else None),
            "summary": summary,
            "risk_count": len(snapshot.get("risks", [])) if snapshot else 0,
            "last_run_at": record.last_run_at if record else None,
        }

    def build_overview_context(activity_page: int = 1) -> dict:
        runs, _ = storage.list_runs()
        loops, _ = loop_storage.list_loops()
        releases = release_storage.list_releases()
        operator_profile = operator.load_profile()
        if activity_page < 1:
            activity_page = 1
        activity_page_size = 8
        all_operator_feed = build_operator_feed(runs, loops, releases, limit=None)
        activity_total_count = len(all_operator_feed)
        activity_total_pages = max(1, (activity_total_count + activity_page_size - 1) // activity_page_size)
        if activity_page > activity_total_pages:
            activity_page = activity_total_pages
        activity_offset = (activity_page - 1) * activity_page_size
        operator_feed = all_operator_feed[activity_offset : activity_offset + activity_page_size]
        resource_snapshot = resource_manager.snapshot(company_config.max_parallel_departments)
        active_runs = [run for run in runs if run.status == "running"]
        blocked_runs = [run for run in runs if run.status in {"failed", "stale"}]
        completed_runs = [run for run in runs if run.status == "completed"]
        active_loops = [loop for loop in loops if loop.status in {"running", "stopping"}]
        operator_route = build_operator_route(active_runs, active_loops)
        project_library = build_project_library()
        latest_decisions = build_latest_decisions(runs)
        top_risks = build_top_risks(runs)
        current_project = build_current_project(runs, loops, releases, operator_profile)
        current_project_memory = build_current_project_memory(current_project)
        current_project_release = next(
            (
                {
                    "latest_release": project["latest_release"],
                    "active_release": project["active_release"],
                }
                for project in project_library
                if current_project and project["slug"] == current_project["slug"]
            ),
            {"latest_release": None, "active_release": None},
        )
        return {
            "runs": runs,
            "loops": loops,
            "releases": releases,
            "operator_feed": operator_feed,
            "bubble_events": build_department_bubbles(runs, releases),
            "recent_run_reports": [build_run_report(run) for run in runs[:6]],
            "recent_loop_reports": [build_loop_report(loop) for loop in loops[:4]],
            "active_runs": active_runs,
            "blocked_runs": blocked_runs,
            "completed_runs": completed_runs,
            "active_loops": active_loops,
            "latest_decisions": latest_decisions,
            "top_risks": top_risks,
            "stale_runs": [run for run in runs if run.status == "stale"],
            "default_settings": RunSettings(),
            "operator_profile": operator_profile,
            "department_catalog": build_department_catalog(operator_profile),
            "project_library": project_library,
            "recent_projects": project_library[:3],
            "resource_snapshot": resource_snapshot,
            "current_project": current_project,
            "current_project_memory": current_project_memory,
            "current_project_release": current_project_release,
            "operator_route": operator_route,
            "activity_current_page": activity_page,
            "activity_total_pages": activity_total_pages,
        }

    def build_operator_route(active_runs, active_loops) -> dict:
        if active_runs:
            if len(active_runs) == 1:
                run = active_runs[0]
                return {
                    "mode": "live_run",
                    "label": "Current run",
                    "detail": f"Your next message will go to run {run.run_id}.",
                }
            return {
                "mode": "run_broadcast",
                "label": "All running runs",
                "detail": f"Your next message will go to {len(active_runs)} running runs.",
            }
        if active_loops:
            if len(active_loops) == 1:
                loop_state = active_loops[0]
                return {
                    "mode": "live_loop",
                    "label": "Current loop",
                    "detail": f"Your next message will go to loop {loop_state.loop_id}.",
                }
            return {
                "mode": "loop_broadcast",
                "label": "All running loops",
                "detail": f"Your next message will go to {len(active_loops)} running loops.",
            }
        return {
            "mode": "control_plane",
            "label": "No live work",
            "detail": "Nothing is running right now. You can ask for status, launch new work, or start a loop.",
        }

    def project_source_label(source: str) -> str:
        labels = {
            "active run": "Current run",
            "active loop": "Current loop",
            "release center": "Release Center",
            "listed run": "Run on this page",
            "listed loop": "Loop on this page",
            "recent run": "Recent run",
            "recent loop": "Recent loop",
            "launch default": "Saved for launch",
            "autopilot default": "Saved for autopilot",
            "current run": "Current run",
            "current loop": "Current loop",
        }
        return labels.get(source, source.replace("_", " ").title())

    def current_project_payload(
        *,
        slug: str,
        name: str | None,
        source: str,
        entity_id: str | None,
        reference_label: str | None = None,
    ) -> dict:
        return {
            "slug": slug,
            "name": name or slug,
            "source": project_source_label(source),
            "entity_id": entity_id,
            "reference_label": reference_label or entity_id or default_project_reference_label(source),
        }

    def default_project_reference_label(source: str) -> str:
        labels = {
            "launch default": "Launch preset",
            "autopilot default": "Autopilot preset",
        }
        return labels.get(source, "Operator preset")

    def build_default_project_payload(slug: str | None, source: str) -> dict | None:
        if not slug:
            return None
        record = project_storage.get_project(slug)
        if record and record.status == "archived":
            return None
        return current_project_payload(
            slug=slug,
            name=record.name if record else slug.replace("-", " ").title(),
            source=source,
            entity_id=None,
        )

    def project_is_operational(slug: str | None) -> bool:
        if not slug:
            return False
        record = project_storage.get_project(slug)
        return not (record and record.status == "archived")

    def build_list_page_current_project(*, runs=None, loops=None, default_slug: str | None = None, default_source: str | None = None) -> dict | None:
        runs = runs or []
        loops = loops or []

        for run in runs:
            if run.status == "running" and project_is_operational(run.project_slug):
                return current_project_payload(
                    slug=run.project_slug,
                    name=run.project_name,
                    source="active run",
                    entity_id=run.run_id,
                )
        for loop_state in loops:
            if loop_state.status in {"running", "stopping"} and project_is_operational(loop_state.project_slug):
                return current_project_payload(
                    slug=loop_state.project_slug,
                    name=loop_state.project_name,
                    source="active loop",
                    entity_id=loop_state.loop_id,
                )
        for run in runs:
            if project_is_operational(run.project_slug):
                return current_project_payload(
                    slug=run.project_slug,
                    name=run.project_name,
                    source="listed run",
                    entity_id=run.run_id,
                )
        for loop_state in loops:
            if project_is_operational(loop_state.project_slug):
                return current_project_payload(
                    slug=loop_state.project_slug,
                    name=loop_state.project_name,
                    source="listed loop",
                    entity_id=loop_state.loop_id,
                )
        if default_slug and default_source:
            return build_default_project_payload(default_slug, default_source)
        return None

    def build_current_project(runs, loops, releases, operator_profile) -> dict | None:
        for run in runs:
            if run.status == "running" and project_is_operational(run.project_slug):
                return current_project_payload(
                    slug=run.project_slug,
                    name=run.project_name,
                    source="active run",
                    entity_id=run.run_id,
                )
        for loop_state in loops:
            if loop_state.status in {"running", "stopping"} and project_is_operational(loop_state.project_slug):
                return current_project_payload(
                    slug=loop_state.project_slug,
                    name=loop_state.project_name,
                    source="active loop",
                    entity_id=loop_state.loop_id,
                )
        for release_state in releases:
            if release_state.status == "running" and project_is_operational(release_state.project_slug):
                return current_project_payload(
                    slug=release_state.project_slug,
                    name=release_state.project_name,
                    source="release center",
                    entity_id=release_state.release_id,
                    reference_label=release_state.release_id,
                )
        for run in runs:
            if project_is_operational(run.project_slug):
                return current_project_payload(
                    slug=run.project_slug,
                    name=run.project_name,
                    source="recent run",
                    entity_id=run.run_id,
                )
        for loop_state in loops:
            if project_is_operational(loop_state.project_slug):
                return current_project_payload(
                    slug=loop_state.project_slug,
                    name=loop_state.project_name,
                    source="recent loop",
                    entity_id=loop_state.loop_id,
                )
        if operator_profile.launch.project_slug:
            slug = operator_profile.launch.project_slug
            return current_project_payload(
                slug=slug,
                name=slug.replace("-", " ").title(),
                source="launch default",
                entity_id=None,
            )
        if operator_profile.autopilot.project_slug:
            slug = operator_profile.autopilot.project_slug
            return current_project_payload(
                slug=slug,
                name=slug.replace("-", " ").title(),
                source="autopilot default",
                entity_id=None,
            )
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

    @app.get("/favicon.ico", include_in_schema=False)
    def frontend_favicon_legacy():
        favicon = FRONTEND_DIST_DIR / "favicon.svg"
        if not favicon.exists():
            raise HTTPException(status_code=404, detail="Asset not found")
        return FileResponse(favicon, media_type="image/svg+xml")

    @app.get("/icons.svg")
    def frontend_icons():
        icons = FRONTEND_DIST_DIR / "icons.svg"
        if not icons.exists():
            raise HTTPException(status_code=404, detail="Asset not found")
        return FileResponse(icons)

    @app.get("/")
    def index(request: Request, activity_page: int = 1):
        return templates.TemplateResponse(
            name="index.html",
            request=request,
            context=build_overview_context(activity_page=activity_page),
        )

    @app.get("/launch")
    def launch_page(request: Request):
        context = build_overview_context()
        context["recent_runs"] = context["runs"][:10]
        context["company_config"] = company_config
        context["current_project"] = build_default_project_payload(
            context["operator_profile"].launch.project_slug,
            "launch default",
        ) or context.get("current_project")
        return templates.TemplateResponse(
            name="launch.html",
            request=request,
            context=context,
        )

    @app.get("/autopilot")
    def autopilot_page(request: Request):
        context = build_overview_context()
        context["company_config"] = company_config
        context["current_project"] = build_default_project_payload(
            context["operator_profile"].autopilot.project_slug,
            "autopilot default",
        ) or context.get("current_project")
        return templates.TemplateResponse(
            name="autopilot.html",
            request=request,
            context=context,
        )

    @app.get("/runs")
    def runs_page(request: Request, page: int = 1):
        if page < 1:
            page = 1
        page_size = 15
        offset = (page - 1) * page_size
        runs, total_count = storage.list_runs(limit=page_size, offset=offset)
        total_pages = (total_count + page_size - 1) // page_size
        
        context = build_overview_context()
        context.update({
            "runs": runs,
            "current_page": page,
            "total_pages": total_pages,
            "total_count": total_count,
        })
        context["current_project"] = build_list_page_current_project(
            runs=runs,
            default_slug=context["operator_profile"].launch.project_slug,
            default_source="launch default",
        )

        return templates.TemplateResponse(
            name="runs.html",
            request=request,
            context=context,
        )

    @app.get("/loops")
    def loops_page(request: Request, page: int = 1):
        if page < 1:
            page = 1
        page_size = 15
        offset = (page - 1) * page_size
        loops, total_count = loop_storage.list_loops(limit=page_size, offset=offset)
        total_pages = (total_count + page_size - 1) // page_size

        context = build_overview_context()
        current_loop_card = None
        if context["active_loops"]:
            active_loop = context["active_loops"][0]
            current_loop_card = build_loop_report(active_loop)
        elif context["recent_loop_reports"]:
            current_loop_card = context["recent_loop_reports"][0]
        context.update({
            "loops": loops,
            "current_page": page,
            "total_pages": total_pages,
            "total_count": total_count,
            "current_loop_card": current_loop_card,
        })
        context["current_project"] = (
            current_project_payload(
                slug=current_loop_card["project_slug"],
                name=current_loop_card.get("project_name"),
                source="current loop",
                entity_id=current_loop_card["loop_id"],
            )
            if current_loop_card and current_loop_card.get("project_slug")
            else build_list_page_current_project(
                loops=loops,
                default_slug=context["operator_profile"].autopilot.project_slug,
                default_source="autopilot default",
            )
        )

        return templates.TemplateResponse(
            name="loops.html",
            request=request,
            context=context,
        )

    @app.get("/loops/{loop_id}")
    def loop_detail(request: Request, loop_id: str, cycles_page: int = 1):
        try:
            loop_state = loop_storage.load_state(loop_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Loop not found") from exc

        if cycles_page < 1:
            cycles_page = 1

        all_linked_runs = []
        linked_run_states = []
        for iteration in reversed(loop_state.runs):
            if not iteration.run_id:
                all_linked_runs.append((iteration, None))
                continue
            try:
                linked_run = storage.load_state(iteration.run_id)
                all_linked_runs.append((iteration, linked_run))
                linked_run_states.append(linked_run)
            except FileNotFoundError:
                all_linked_runs.append((iteration, None))

        cycles_page_size = 18
        cycles_total_count = len(all_linked_runs)
        cycles_total_pages = max(1, (cycles_total_count + cycles_page_size - 1) // cycles_page_size)
        if cycles_page > cycles_total_pages:
            cycles_page = cycles_total_pages
        cycles_offset = (cycles_page - 1) * cycles_page_size
        linked_runs = all_linked_runs[cycles_offset : cycles_offset + cycles_page_size]

        return templates.TemplateResponse(
            name="loop_detail.html",
            request=request,
            context={
                "loop_state": loop_state,
                "linked_runs": linked_runs,
                "cycles_current_page": cycles_page,
                "cycles_total_pages": cycles_total_pages,
                "log_tail": loop_storage.read_log_tail(loop_id),
                "loop_report": build_loop_report(loop_state),
                "event_feed": build_operator_feed(linked_run_states, [loop_state], []),
                "current_project": (
                    {
                        "slug": loop_state.project_slug,
                        "name": loop_state.project_name or loop_state.project_slug,
                        "source": "current loop",
                        "entity_id": loop_state.loop_id,
                        "reference_label": loop_state.loop_id,
                    }
                    if loop_state.project_slug
                    else build_default_project_payload(
                        build_overview_context()["operator_profile"].autopilot.project_slug,
                        "autopilot default",
                    )
                ),
            },
        )

    @app.get("/settings")
    def settings_page(request: Request):
        context = build_overview_context()
        context["company_config"] = company_config
        context["project_library"] = build_project_library(include_archived=True)
        context["department_catalog"] = build_department_catalog(context["operator_profile"])
        context["organization_chart"] = build_organization_chart(context["operator_profile"])
        context["organization_groups"] = build_organization_directory(context["operator_profile"])
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
                        "reference_label": run.run_id,
                    }
                    if run.project_slug
                    else build_default_project_payload(
                        build_overview_context()["operator_profile"].launch.project_slug,
                        "launch default",
                    )
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
        runs, _ = storage.list_runs()
        runs_json = [run.model_dump(mode="json") for run in runs]
        return JSONResponse({"runs": runs_json})

    @app.get("/api/loops")
    def list_loops_api():
        loops, _ = loop_storage.list_loops()
        loops_json = [loop.model_dump(mode="json") for loop in loops]
        return JSONResponse({"loops": loops_json})

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
        runs, _ = storage.list_runs()
        loops, _ = loop_storage.list_loops()
        releases = release_storage.list_releases()
        feed = build_operator_feed(runs, loops, releases)
        bubbles = build_department_bubbles(runs, releases)
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

    def get_project_or_404(project_slug: str):
        normalized_slug = project_storage.normalize_slug(project_slug)
        project = project_storage.get_project(normalized_slug)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    def ensure_project_not_active(project_slug: str) -> None:
        runs, _ = storage.list_runs()
        active_run = next(
            (run for run in runs if run.project_slug == project_slug and run.status in {"running", "stopping"}),
            None,
        )
        if active_run is not None:
            raise HTTPException(status_code=409, detail=f"Project has an active run: {active_run.run_id}")

        loops, _ = loop_storage.list_loops()
        active_loop = next(
            (loop for loop in loops if loop.project_slug == project_slug and loop.status in {"running", "stopping"}),
            None,
        )
        if active_loop is not None:
            raise HTTPException(status_code=409, detail=f"Project has an active loop: {active_loop.loop_id}")

        active_release = next(
            (release for release in release_storage.list_releases(project_slug=project_slug) if release.status == "running"),
            None,
        )
        if active_release is not None:
            raise HTTPException(status_code=409, detail=f"Project has an active release build: {active_release.release_id}")

    def archive_project(project_slug: str) -> dict:
        project = get_project_or_404(project_slug)
        ensure_project_not_active(project.slug)
        archived = project if project.status == "archived" else project_storage.archive_project(project.slug)
        return {
            "project_slug": archived.slug,
            "status": archived.status,
            "message": f"{archived.name} archived.",
        }

    def restore_project(project_slug: str) -> dict:
        project = get_project_or_404(project_slug)
        restored = project if project.status != "archived" else project_storage.restore_project(project.slug)
        return {
            "project_slug": restored.slug,
            "status": restored.status,
            "message": f"{restored.name} restored.",
        }

    def delete_project(project_slug: str) -> dict:
        project = get_project_or_404(project_slug)
        ensure_project_not_active(project.slug)
        deleted_run_ids = storage.delete_runs_for_project(project.slug)
        deleted_loop_ids = loop_storage.delete_loops_for_project(project.slug)
        deleted_release_ids = release_storage.delete_releases_for_project(project.slug)
        deleted = project_storage.delete_project(project.slug)
        profile = operator.load_profile()
        changed = False
        if profile.launch.project_slug == deleted.slug:
            profile.launch.project_slug = None
            changed = True
        if profile.autopilot.project_slug == deleted.slug:
            profile.autopilot.project_slug = None
            changed = True
        if changed:
            operator.save_profile(profile)
        return {
            "project_slug": deleted.slug,
            "status": "deleted",
            "deleted_runs": len(deleted_run_ids),
            "deleted_loops": len(deleted_loop_ids),
            "deleted_releases": len(deleted_release_ids),
            "message": f"{deleted.name} deleted with its saved workspace and related records.",
        }

    @app.get("/api/projects")
    def projects_api():
        runs, _ = storage.list_runs()
        loops, _ = loop_storage.list_loops()
        releases = release_storage.list_releases()
        operator_profile = operator.load_profile()
        return JSONResponse(
            {
                "projects": build_project_library(),
                "current_project": build_current_project(runs, loops, releases, operator_profile),
            }
        )

    @app.post("/api/projects/{project_slug}/archive")
    def archive_project_api(project_slug: str):
        return JSONResponse(archive_project(project_slug))

    @app.post("/api/projects/{project_slug}/restore")
    def restore_project_api(project_slug: str):
        return JSONResponse(restore_project(project_slug))

    @app.delete("/api/projects/{project_slug}")
    def delete_project_api(project_slug: str):
        return JSONResponse(delete_project(project_slug))

    @app.post("/projects/{project_slug}/archive", include_in_schema=False)
    def archive_project_redirect(project_slug: str, request: Request):
        archive_project(project_slug)
        return RedirectResponse(url=request.headers.get("referer") or "/settings", status_code=303)

    @app.post("/projects/{project_slug}/restore", include_in_schema=False)
    def restore_project_redirect(project_slug: str, request: Request):
        restore_project(project_slug)
        return RedirectResponse(url=request.headers.get("referer") or "/settings", status_code=303)

    @app.post("/projects/{project_slug}/delete", include_in_schema=False)
    def delete_project_redirect(project_slug: str, request: Request):
        delete_project(project_slug)
        return RedirectResponse(url=request.headers.get("referer") or "/settings", status_code=303)

    @app.get("/api/releases")
    def releases_api(project_slug: str | None = None):
        releases = release_storage.list_releases(project_slug=project_slug)
        return JSONResponse({"releases": [release.model_dump(mode="json") for release in releases]})

    @app.get("/api/releases/{release_id}")
    def release_detail_api(release_id: str):
        try:
            release_state = release_storage.load_state(release_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Release not found") from exc
        return JSONResponse(release_state.model_dump(mode="json"))

    def start_release_build(project_slug: str) -> dict:
        normalized_slug = project_storage.normalize_slug(project_slug)
        project = project_storage.get_project(normalized_slug)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        if project.status == "archived":
            raise HTTPException(status_code=409, detail="Archived project must be restored before Release Center can package it.")
        active_release = next(
            (
                release
                for release in release_storage.list_releases(project_slug=normalized_slug)
                if release.status == "running"
            ),
            None,
        )
        if active_release is not None:
            return {
                "release_id": active_release.release_id,
                "pid": active_release.controller_pid,
                "status": "running",
                "download_path": active_release.download_path,
            }
        launch = launch_detached_release(
            project_slug=normalized_slug,
            storage_root=base_root,
        )
        release_storage.attach_controller_pid(launch.entity_id, launch.pid)
        return {
            "release_id": launch.entity_id,
            "pid": launch.pid,
            "log_path": str(launch.log_path),
            "status": "detached",
        }

    @app.post("/api/projects/{project_slug}/releases")
    def build_release_api(project_slug: str):
        return JSONResponse(start_release_build(project_slug))

    @app.post("/projects/{project_slug}/releases", include_in_schema=False)
    def build_release_redirect(project_slug: str, request: Request):
        start_release_build(project_slug)
        return RedirectResponse(url=request.headers.get("referer") or "/", status_code=303)

    @app.get("/api/releases/{release_id}/download")
    def download_release_api(release_id: str):
        try:
            release_state = release_storage.load_state(release_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Release not found") from exc
        if release_state.status != "completed" or not release_state.download_path:
            raise HTTPException(status_code=409, detail="Release package is not ready for download.")
        download_path = Path(release_state.download_path)
        if not download_path.exists():
            raise HTTPException(status_code=404, detail="Release archive not found")
        return FileResponse(download_path, filename=download_path.name, media_type="application/zip")

    def delete_release(release_id: str) -> dict:
        try:
            release_state = release_storage.load_state(release_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Release not found") from exc
        if release_state.status == "running":
            raise HTTPException(status_code=409, detail="Active release build cannot be deleted.")
        deleted = release_storage.delete_release(release_id)
        return {
            "release_id": deleted.release_id,
            "project_slug": deleted.project_slug,
            "status": "deleted",
            "message": f"Release {deleted.release_id} deleted.",
        }

    @app.delete("/api/releases/{release_id}")
    def delete_release_api(release_id: str):
        return JSONResponse(delete_release(release_id))

    @app.post("/releases/{release_id}/delete", include_in_schema=False)
    def delete_release_redirect(release_id: str, request: Request):
        delete_release(release_id)
        return RedirectResponse(url=request.headers.get("referer") or "/settings", status_code=303)

    @app.post("/api/operator/profile")
    def save_operator_profile_api(profile: OperatorProfile = Body(...)):
        if profile.launch.project_slug:
            profile.launch.project_slug = project_storage.normalize_slug(profile.launch.project_slug)
        if profile.autopilot.project_slug:
            profile.autopilot.project_slug = project_storage.normalize_slug(profile.autopilot.project_slug)
        saved = operator.save_profile(profile)
        return JSONResponse(saved.model_dump(mode="json"))

    @app.post("/api/operator/chat")
    def operator_chat_api(payload: OperatorChatPayload = Body(...)):
        return JSONResponse(operator.handle_message(payload.message))

    @app.post("/api/launch/run")
    def launch_run_api(payload: RunLaunchPayload = Body(...)):
        operator_profile = operator.load_profile()
        project_slug = project_storage.normalize_slug(payload.project_slug) if payload.project_slug else None
        if project_slug:
            project = get_project_or_404(project_slug)
            if project.status == "archived":
                raise HTTPException(status_code=409, detail="Archived project must be restored before starting a new run.")
        launch = launch_detached_run(
            mission=payload.mission,
            project_slug=project_slug,
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
        storage.attach_controller_pid(launch.entity_id, launch.pid)
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

    @app.post("/api/runs/{run_id}/force-stop")
    def force_stop_run_api(run_id: str):
        run_state = _force_stop_run_state(storage, run_id)
        return JSONResponse(run_state.model_dump(mode="json"))

    @app.post("/api/launch/loop")
    def launch_loop_api(payload: LoopLaunchPayload = Body(...)):
        operator_profile = operator.load_profile()
        project_slug = project_storage.normalize_slug(payload.project_slug) if payload.project_slug else None
        if project_slug:
            project = get_project_or_404(project_slug)
            if project.status == "archived":
                raise HTTPException(status_code=409, detail="Archived project must be restored before starting a new loop.")
        launch = launch_detached_loop(
            objective=payload.objective,
            project_slug=project_slug,
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
        loop_storage.attach_controller_pid(launch.entity_id, launch.pid)
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

    @app.post("/api/loops/{loop_id}/force-stop")
    def force_stop_loop_api(loop_id: str):
        loop_state = _force_stop_loop_state(loop_storage, storage, loop_id)
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
