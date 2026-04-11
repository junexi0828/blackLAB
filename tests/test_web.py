from pathlib import Path

from fastapi.testclient import TestClient

from blacklab_factory.autopilot import AutopilotSupervisor, LoopRunRequest
from blacklab_factory.factory import FactoryRunner
from blacklab_factory.models import RunSettings
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
    assert "Operator Overview" in index_response.text
    assert "Current Run Reports" in index_response.text

    launch_page = client.get("/launch")
    assert launch_page.status_code == 200
    assert "Mission Control" in launch_page.text
    assert "Project Name" in launch_page.text

    autopilot_page = client.get("/autopilot")
    assert autopilot_page.status_code == 200
    assert "Autopilot Control Room" in autopilot_page.text
    assert "Project Name" in autopilot_page.text

    runs_page = client.get("/runs")
    assert runs_page.status_code == 200
    assert "Run Ledger" in runs_page.text
    assert "PROJECT // Revenue Leak Auditor" in runs_page.text

    loops_page = client.get("/loops")
    assert loops_page.status_code == 200
    assert "Loop Ledger" in loops_page.text

    settings_page = client.get("/settings")
    assert settings_page.status_code == 200
    assert "Organization" in settings_page.text

    detail_response = client.get(f"/runs/{state.run_id}")
    assert detail_response.status_code == 200
    assert "Operator Report" in detail_response.text
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
    assert "Iterations" in loop_detail_page.text
    assert "Loop Status Report" in loop_detail_page.text

    loop_detail_response = client.get(f"/api/loops/{loop_id}")
    assert loop_detail_response.status_code == 200
    assert loop_detail_response.json()["loop_id"] == loop_id


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
    assert "Report" in response.text
    assert "Log" in response.text


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
    assert "current loop" in response.text
    assert "Current Loop" in response.text
    assert "All Loops" in response.text


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
    assert "recent run" not in response.text


def test_launch_page_sidebar_uses_launch_default_project_context(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    run_state = runner.storage.create_run(
        mission="Recent run should not own launch sidebar context",
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
    assert "launch default" in response.text
    assert "recent run" not in response.text


def test_loop_detail_sidebar_falls_back_to_autopilot_default(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    run_state = runner.storage.create_run(
        mission="Recent run should not override loop detail sidebar",
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
    assert "autopilot default" in response.text
    assert "configured default" in response.text
    assert "recent run" not in response.text
