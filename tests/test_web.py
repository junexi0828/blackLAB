from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

import blacklab_factory.dashboard as dashboard_module
from blacklab_factory.autopilot import AutopilotSupervisor, LoopRunRequest
from blacklab_factory.factory import FactoryRunner
from blacklab_factory.models import ArtifactRecord, LoopIterationRecord, RunSettings, StepRecord
from blacklab_factory.web import create_app


def test_dashboard_routes_render(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.start(
        "Launch a niche AI service for finance teams",
        mode="mock",
        project_slug="revenue-leak-auditor",
    )
    client = TestClient(create_app(storage_root=tmp_path))

    index_response = client.get("/")
    assert index_response.status_code == 200
    assert "blackLAB Factory" in index_response.text
    assert "Overview" in index_response.text
    assert "Recent Runs" in index_response.text
    assert "Project Progress" in index_response.text

    launch_page = client.get("/launch")
    assert launch_page.status_code == 200
    assert "New Run" in launch_page.text
    assert "Project" in launch_page.text
    assert 'data-draft-key="launch"' in launch_page.text

    autopilot_page = client.get("/autopilot")
    assert autopilot_page.status_code == 200
    assert "Start Autopilot" in autopilot_page.text
    assert "Project" in autopilot_page.text
    assert 'data-draft-key="autopilot"' in autopilot_page.text
    assert "data-toggle-refresh" not in autopilot_page.text

    runs_page = client.get("/runs")
    assert runs_page.status_code == 200
    assert "<h1>Runs</h1>" in runs_page.text
    assert "PROJECT // Revenue Leak Auditor" in runs_page.text

    loops_page = client.get("/loops")
    assert loops_page.status_code == 200
    assert "<h1>Loops</h1>" in loops_page.text

    settings_page = client.get("/settings")
    assert settings_page.status_code == 200
    assert "Organization" in settings_page.text

    detail_response = client.get(f"/runs/{state.run_id}")
    assert detail_response.status_code == 200
    assert "Run Summary" in detail_response.text
    assert 'id="open-issues"' in detail_response.text
    assert "PROJECT // Revenue Leak Auditor" in detail_response.text

    console_response = client.get("/console")
    assert console_response.status_code == 200
    assert "blackLAB Frontend Console" in console_response.text
    assert "/assets/" in console_response.text

    console_run_response = client.get(f"/console/runs/{state.run_id}")
    assert console_run_response.status_code == 200
    assert "blackLAB Frontend Console" in console_run_response.text

    artifact_response = client.get(f"/runs/{state.run_id}/artifacts/{state.artifacts[0].filename}")
    assert artifact_response.status_code == 200
    assert "Mission" in artifact_response.text

    log_response = client.get(f"/runs/{state.run_id}/log")
    assert log_response.status_code == 200
    assert "Run started" in log_response.text

    loops_response = client.get("/api/loops")
    assert loops_response.status_code == 200
    assert loops_response.json() == {"loops": []}

    settings_response = client.get("/api/settings")
    assert settings_response.status_code == 200
    assert settings_response.json()["company_name"] == "blackLAB"
    assert settings_response.json()["default_run_settings"]["codex_review_model"] == "gpt-5.4-mini"
    assert len(settings_response.json()["review_departments"]) == 3

    feed_response = client.get("/api/feed")
    assert feed_response.status_code == 200
    assert "events" in feed_response.json()
    assert isinstance(feed_response.json()["bubbles"], dict)

    launch_response = client.post(
        "/api/launch/run",
        json={
            "mission": "API detached mock run",
            "mode": "mock",
            "codex_model": "gpt-5.4",
            "codex_autonomy": "read_only",
            "codex_review_model": "gpt-5.4-mini",
            "codex_review_autonomy": "read_only",
            "max_parallel_departments": 7,
            "pause_between_departments": 0,
        },
    )
    assert launch_response.status_code == 200
    assert "run_id" in launch_response.json()

    loop_launch_response = client.post(
        "/api/launch/loop",
        json={
            "objective": "API loop launch",
            "run_mode": "mock",
            "loop_mode": "full_auto",
            "codex_model": "gpt-5.4",
            "codex_autonomy": "full_auto",
            "codex_review_model": "gpt-5.4-mini",
            "codex_review_autonomy": "read_only",
            "max_parallel_departments": 7,
            "pause_between_departments": 0,
            "interval_seconds": 0,
            "max_iterations": 1,
        },
    )
    assert loop_launch_response.status_code == 200
    loop_id = loop_launch_response.json()["loop_id"]

    loop_detail_page = client.get(f"/loops/{loop_id}")
    assert loop_detail_page.status_code == 200
    assert "Cycles" in loop_detail_page.text
    assert "Loop Summary" in loop_detail_page.text

    loop_detail_response = client.get(f"/api/loops/{loop_id}")
    assert loop_detail_response.status_code == 200
    assert loop_detail_response.json()["loop_id"] == loop_id


def test_launch_and_autopilot_allow_new_project_slugs(tmp_path: Path) -> None:
    client = TestClient(create_app(storage_root=tmp_path))

    launch_response = client.post(
        "/api/launch/run",
        json={
            "mission": "Start a brand new project from launch",
            "project_slug": "Brand New Launch Project",
            "mode": "mock",
            "codex_model": "gpt-5.4",
            "codex_autonomy": "read_only",
            "codex_review_model": "gpt-5.4-mini",
            "codex_review_autonomy": "read_only",
            "max_parallel_departments": 7,
            "pause_between_departments": 0,
        },
    )
    assert launch_response.status_code == 200
    assert "run_id" in launch_response.json()

    loop_launch_response = client.post(
        "/api/launch/loop",
        json={
            "objective": "Start a brand new project from autopilot",
            "project_slug": "Brand New Autopilot Project",
            "run_mode": "mock",
            "loop_mode": "full_auto",
            "codex_model": "gpt-5.4",
            "codex_autonomy": "full_auto",
            "codex_review_model": "gpt-5.4-mini",
            "codex_review_autonomy": "read_only",
            "max_parallel_departments": 7,
            "pause_between_departments": 0,
            "interval_seconds": 0,
            "max_iterations": 1,
        },
    )
    assert loop_launch_response.status_code == 200
    assert "loop_id" in loop_launch_response.json()


def test_loop_detail_cycles_are_paginated(tmp_path: Path) -> None:
    supervisor = AutopilotSupervisor(storage_root=tmp_path)
    loop_state = supervisor.start_loop(
        LoopRunRequest(
            objective="Paginate long-running loop cycles",
            loop_mode="always_on",
            run_mode="mock",
            run_settings=RunSettings(),
        )
    )
    base_time = datetime(2026, 4, 13, 0, 0, tzinfo=timezone.utc)
    loop_state.runs = [
        LoopIterationRecord(
            iteration=index,
            run_id=f"run-{index:02d}",
            status="completed",
            created_at=base_time + timedelta(minutes=index),
            completed_at=base_time + timedelta(minutes=index, seconds=30),
        )
        for index in range(1, 21)
    ]
    supervisor.loop_storage.save_state(loop_state)

    client = TestClient(create_app(storage_root=tmp_path))
    first_page = client.get(f"/loops/{loop_state.loop_id}")
    second_page = client.get(f"/loops/{loop_state.loop_id}?cycles_page=2")

    assert first_page.status_code == 200
    assert second_page.status_code == 200
    assert f'/loops/{loop_state.loop_id}?cycles_page=2' in first_page.text
    assert "run-20" in first_page.text
    assert "run-01" not in first_page.text
    assert "run-01" in second_page.text
    assert 'class="pagination-item is-active">2<' in second_page.text


def test_loop_detail_recent_updates_only_show_current_loop_activity(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)

    unrelated_run = runner.storage.create_run(
        mission="Unrelated run",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    unrelated_run.status = "completed"
    unrelated_run.steps = [
        StepRecord(
            department_key="finance",
            department_label="Finance",
            purpose="Review unrelated financials",
            status="completed",
            summary="Unrelated update",
            completed_at=datetime(2026, 4, 13, 0, 0, tzinfo=timezone.utc),
        )
    ]
    unrelated_run.current_status = "Unrelated run finished."
    unrelated_run.updated_at = datetime(2026, 4, 13, 0, 5, tzinfo=timezone.utc)
    runner.storage.save_state(unrelated_run)

    linked_run = runner.storage.create_run(
        mission="Linked loop run",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    linked_run.status = "completed"
    linked_run.steps = [
        StepRecord(
            department_key="product",
            department_label="Product",
            purpose="Refine the next iteration",
            status="completed",
            summary="Loop-linked update",
            completed_at=datetime(2026, 4, 13, 1, 0, tzinfo=timezone.utc),
        )
    ]
    linked_run.current_status = "Linked run finished."
    linked_run.updated_at = datetime(2026, 4, 13, 1, 5, tzinfo=timezone.utc)
    runner.storage.save_state(linked_run)

    supervisor = AutopilotSupervisor(storage_root=tmp_path)
    loop_state = supervisor.start_loop(
        LoopRunRequest(
            objective="Scope recent updates to the current loop",
            loop_mode="always_on",
            run_mode="mock",
            run_settings=RunSettings(),
        )
    )
    loop_state.status = "running"
    loop_state.latest_note = "Current loop is still iterating."
    loop_state.runs = [
        LoopIterationRecord(
            iteration=1,
            run_id=linked_run.run_id,
            status="completed",
            created_at=datetime(2026, 4, 13, 1, 0, tzinfo=timezone.utc),
            completed_at=datetime(2026, 4, 13, 1, 5, tzinfo=timezone.utc),
        )
    ]
    supervisor.loop_storage.save_state(loop_state)

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.get(f"/loops/{loop_state.loop_id}")

    assert response.status_code == 200
    assert "Loop-linked update" in response.text
    assert "Unrelated update" not in response.text


def test_run_stop_api_marks_run_stopping(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.storage.create_run(
        mission="Stop this mock run",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    state.status = "running"
    runner.storage.save_state(state)

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.post(f"/api/runs/{state.run_id}/stop")

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == state.run_id
    assert payload["status"] == "stopping"
    assert payload["stop_requested"] is True


def test_run_force_stop_api_marks_run_failed(tmp_path: Path, monkeypatch) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.storage.create_run(
        mission="Force stop this mock run",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    state.status = "running"
    state.controller_pid = 43210
    runner.storage.save_state(state)
    monkeypatch.setattr(dashboard_module, "terminate_process_group", lambda pid: True)

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.post(f"/api/runs/{state.run_id}/force-stop")

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == state.run_id
    assert payload["status"] == "failed"
    assert payload["stop_requested"] is True
    assert "force stopped" in payload["current_status"].lower()


def test_run_storage_preserves_controller_pid_across_subsequent_saves(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.storage.create_run(
        mission="Preserve detached controller pid",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    runner.storage.attach_controller_pid(state.run_id, 43210)

    stale_copy = runner.storage.load_state(state.run_id)
    stale_copy.controller_pid = None
    stale_copy.status = "running"
    stale_copy.current_status = "Still running."
    runner.storage.save_state(stale_copy)

    refreshed = runner.storage.load_state(state.run_id)
    assert refreshed.controller_pid == 43210


def test_loop_force_stop_api_marks_loop_failed(tmp_path: Path, monkeypatch) -> None:
    supervisor = AutopilotSupervisor(storage_root=tmp_path)
    loop_state = supervisor.loop_storage.create_loop(
        objective="Force stop this loop",
        loop_mode="full_auto",
        run_mode="mock",
        run_settings=RunSettings(),
        interval_seconds=0,
        max_iterations=1,
    )
    loop_state.status = "running"
    loop_state.controller_pid = 54321
    supervisor.loop_storage.save_state(loop_state)
    monkeypatch.setattr(dashboard_module, "terminate_process_group", lambda pid: True)

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.post(f"/api/loops/{loop_state.loop_id}/force-stop")

    assert response.status_code == 200
    payload = response.json()
    assert payload["loop_id"] == loop_state.loop_id
    assert payload["status"] == "failed"
    assert payload["stop_requested"] is True


def test_loop_storage_preserves_controller_pid_across_subsequent_saves(tmp_path: Path) -> None:
    supervisor = AutopilotSupervisor(storage_root=tmp_path)
    loop_state = supervisor.loop_storage.create_loop(
        objective="Preserve loop controller pid",
        loop_mode="full_auto",
        run_mode="mock",
        run_settings=RunSettings(),
        interval_seconds=0,
        max_iterations=1,
    )
    supervisor.loop_storage.attach_controller_pid(loop_state.loop_id, 54321)

    stale_copy = supervisor.loop_storage.load_state(loop_state.loop_id)
    stale_copy.controller_pid = None
    stale_copy.status = "running"
    stale_copy.latest_note = "Still iterating."
    supervisor.loop_storage.save_state(stale_copy)

    refreshed = supervisor.loop_storage.load_state(loop_state.loop_id)
    assert refreshed.controller_pid == 54321


def test_runs_page_shows_useful_action_links(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.storage.create_run(
        mission="Review action links",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    state.status = "completed"
    runner.storage.save_state(state)

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.get("/runs")

    assert response.status_code == 200
    assert f'href="/runs/{state.run_id}"' in response.text
    assert f'href="/runs/{state.run_id}/log"' in response.text
    assert "Details" in response.text
    assert "Log" in response.text


def test_overview_team_updates_use_existing_department_outputs(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.storage.create_run(
        mission="Show recent team work",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    state.status = "completed"
    state.project_slug = "revenue-leak-auditor"
    state.project_name = "Revenue Leak Auditor"
    state.steps = [
        StepRecord(
            department_key="product",
            department_label="Product Planning Team",
            purpose="Define what ships next.",
            status="completed",
            summary="Outlined the next pricing test for finance teams.",
            completed_at=datetime.now(timezone.utc),
        )
    ]
    state.artifacts = [
        ArtifactRecord(
            department_key="product",
            title="Pricing Test Plan",
            path="pricing-test-plan.md",
            preview="A practical pricing test plan for the next launch.",
        )
    ]
    runner.storage.save_state(state)

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.get("/")

    assert response.status_code == 200
    assert "Recent Team Updates" in response.text
    assert "Product Planning Team" in response.text
    assert "Outlined the next pricing test for finance teams." in response.text


def test_overview_project_progress_uses_saved_project_memory(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.storage.create_run(
        mission="Show project memory on overview",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    state.status = "completed"
    state.project_slug = "revenue-leak-auditor"
    state.project_name = "Revenue Leak Auditor"
    runner.storage.save_state(state)

    runner.projects.create_project("revenue-leak-auditor", "Revenue Leak Auditor")
    runner.projects.append_memory(
        slug="revenue-leak-auditor",
        run_id=state.run_id,
        mission=state.mission,
        run_summary="The pricing test is defined and the product direction is narrowed.",
        decisions=["Finance approved the target segment."],
        next_run_hint="Validate demand with live customer calls.",
        risks=["No direct customer proof yet."],
    )

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.get("/")

    assert response.status_code == 200
    assert "Project Progress" in response.text
    assert "Revenue Leak Auditor" in response.text
    assert "The project is now at: The pricing test is defined and the product direction is narrowed. Next up: Validate demand with live customer calls." in response.text
    assert state.run_id in response.text


def test_overview_recent_activity_is_paginated(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    base_time = datetime.now(timezone.utc)
    steps = []
    for index in range(10):
        steps.append(
            StepRecord(
                department_key=f"team_{index}",
                department_label=f"Team {index}",
                purpose=f"Purpose {index}",
                status="completed",
                summary=f"Update {index}",
                completed_at=base_time + timedelta(minutes=index),
            )
        )
    state = runner.storage.create_run(
        mission="Generate many recent activity items",
        company_name="blackLAB",
        mode="mock",
        steps=steps,
    )
    state.status = "completed"
    state.current_status = "Finished all work."
    runner.storage.save_state(state)

    client = TestClient(create_app(storage_root=tmp_path))
    first_page = client.get("/")
    second_page = client.get("/?activity_page=2")

    assert first_page.status_code == 200
    assert second_page.status_code == 200
    assert '/?activity_page=2' in first_page.text
    assert "Update 0" not in first_page.text
    assert "Update 0" in second_page.text
    assert 'class="pagination-item is-active">2<' in second_page.text


def test_overview_team_updates_and_issues_prefer_latest_runs(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)

    older = runner.storage.create_run(
        mission="Older run",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    older.status = "completed"
    older.updated_at = datetime(2026, 4, 11, 0, 0, tzinfo=timezone.utc)
    older.steps = [
        StepRecord(
            department_key="finance",
            department_label="Finance",
            purpose="Older purpose",
            status="completed",
            summary="Older team update",
            completed_at=datetime(2026, 4, 11, 0, 0, tzinfo=timezone.utc),
        )
    ]
    older.risks = ["Older issue"]
    runner.storage.save_state(older)

    newer = runner.storage.create_run(
        mission="Newer run",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    newer.status = "completed"
    newer.updated_at = datetime(2026, 4, 12, 0, 0, tzinfo=timezone.utc)
    newer.steps = [
        StepRecord(
            department_key="design",
            department_label="Design",
            purpose="Newer purpose",
            status="completed",
            summary="Newer team update",
            completed_at=datetime(2026, 4, 12, 0, 0, tzinfo=timezone.utc),
        )
    ]
    newer.risks = ["Newer issue"]
    runner.storage.save_state(newer)

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.get("/")

    assert response.status_code == 200
    assert response.text.index("Newer team update") < response.text.index("Older team update")
    assert response.text.index("Newer issue") < response.text.index("Older issue")


def test_loops_page_sidebar_uses_loop_project_context(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    run_state = runner.storage.create_run(
        mission="Live run should not override loop sidebar context",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    run_state.status = "running"
    run_state.project_slug = "run-project"
    run_state.project_name = "Run Project"
    runner.storage.save_state(run_state)

    supervisor = AutopilotSupervisor(storage_root=tmp_path)
    loop_state = supervisor.start_loop(
        LoopRunRequest(
            objective="Live loop should own the loop ledger sidebar",
            loop_mode="always_on",
            run_mode="mock",
            run_settings=RunSettings(),
            project_slug="loop-project",
        )
    )
    loop_state.status = "running"
    loop_state.project_name = "Loop Project"
    supervisor.loop_storage.save_state(loop_state)

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.get("/loops")

    assert response.status_code == 200
    assert "Current Project" in response.text
    assert "Loop Project" in response.text
    assert "Current loop" in response.text
    assert "Current Loop" in response.text
    assert "<h2>Loops</h2>" in response.text


def test_loops_page_sidebar_does_not_fall_back_to_recent_run_project(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    run_state = runner.storage.create_run(
        mission="Run project should stay scoped to runs page",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    run_state.status = "completed"
    run_state.project_slug = "run-project"
    run_state.project_name = "Run Project"
    runner.storage.save_state(run_state)

    supervisor = AutopilotSupervisor(storage_root=tmp_path)
    loop_state = supervisor.start_loop(
        LoopRunRequest(
            objective="Loop without linked project",
            loop_mode="always_on",
            run_mode="mock",
            run_settings=RunSettings(),
        )
    )
    loop_state.status = "completed"
    supervisor.loop_storage.save_state(loop_state)

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.get("/loops")

    assert response.status_code == 200
    assert "Current Loop" in response.text
    assert "Run Project" not in response.text
    assert "Recent run" not in response.text


def test_launch_page_sidebar_uses_launch_default_project_context(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    run_state = runner.storage.create_run(
        mission="Launch sidebar context check",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    run_state.status = "completed"
    run_state.project_slug = "recent-run-project"
    run_state.project_name = "Recent Run Project"
    runner.storage.save_state(run_state)

    client = TestClient(create_app(storage_root=tmp_path))
    profile_response = client.post(
        "/api/operator/profile",
        json={
            "launch": {
                "mode": "mock",
                "project_slug": "launch-project",
                "pause_between_departments": 0,
                "run_settings": {
                    "codex_model": "gpt-5.4",
                    "codex_autonomy": "read_only",
                    "codex_review_model": "gpt-5.4-mini",
                    "codex_review_autonomy": "read_only",
                    "detached": False,
                    "max_parallel_departments": 7,
                },
            },
            "autopilot": {
                "run_mode": "mock",
                "project_slug": None,
                "loop_mode": "full_auto",
                "interval_seconds": 0,
                "max_iterations": 1,
                "pause_between_departments": 0,
                "run_settings": {
                    "codex_model": "gpt-5.4",
                    "codex_autonomy": "full_auto",
                    "codex_review_model": "gpt-5.4-mini",
                    "codex_review_autonomy": "read_only",
                    "detached": False,
                    "max_parallel_departments": 7,
                },
            },
        },
    )
    assert profile_response.status_code == 200

    response = client.get("/launch")

    assert response.status_code == 200
    assert "Current Project" in response.text
    assert "Launch Project" in response.text
    assert "launch-project" in response.text
    assert "Saved for launch" in response.text
    assert "Launch preset" in response.text
    assert "Recent run" not in response.text


def test_loop_detail_sidebar_falls_back_to_autopilot_default(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    run_state = runner.storage.create_run(
        mission="Loop detail sidebar context check",
        company_name="blackLAB",
        mode="mock",
        steps=[],
    )
    run_state.status = "completed"
    run_state.project_slug = "recent-run-project"
    run_state.project_name = "Recent Run Project"
    runner.storage.save_state(run_state)

    supervisor = AutopilotSupervisor(storage_root=tmp_path)
    loop_state = supervisor.start_loop(
        LoopRunRequest(
            objective="Loop without linked project",
            loop_mode="always_on",
            run_mode="mock",
            run_settings=RunSettings(),
        )
    )
    loop_state.status = "completed"
    supervisor.loop_storage.save_state(loop_state)

    client = TestClient(create_app(storage_root=tmp_path))
    profile_response = client.post(
        "/api/operator/profile",
        json={
            "launch": {
                "mode": "mock",
                "project_slug": None,
                "pause_between_departments": 0,
                "run_settings": {
                    "codex_model": "gpt-5.4",
                    "codex_autonomy": "read_only",
                    "codex_review_model": "gpt-5.4-mini",
                    "codex_review_autonomy": "read_only",
                    "detached": False,
                    "max_parallel_departments": 7,
                },
            },
            "autopilot": {
                "run_mode": "mock",
                "project_slug": "loop-home",
                "loop_mode": "always_on",
                "interval_seconds": 0,
                "max_iterations": 1,
                "pause_between_departments": 0,
                "run_settings": {
                    "codex_model": "gpt-5.4",
                    "codex_autonomy": "full_auto",
                    "codex_review_model": "gpt-5.4-mini",
                    "codex_review_autonomy": "read_only",
                    "detached": False,
                    "max_parallel_departments": 7,
                },
            },
        },
    )
    assert profile_response.status_code == 200

    response = client.get(f"/loops/{loop_state.loop_id}")

    assert response.status_code == 200
    assert "Current Project" in response.text
    assert "Loop Home" in response.text
    assert "Saved for autopilot" in response.text
    assert "Autopilot preset" in response.text
    assert "Recent run" not in response.text
