from pathlib import Path

from fastapi.testclient import TestClient

from blacklab_factory.factory import FactoryRunner
from blacklab_factory.web import create_app


def test_dashboard_routes_render(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.start("Launch a niche AI service for finance teams", mode="mock")
    client = TestClient(create_app(storage_root=tmp_path))

    index_response = client.get("/")
    assert index_response.status_code == 200
    assert "blackLAB Factory" in index_response.text
    assert "Operator Overview" in index_response.text
    assert "Current Run Reports" in index_response.text

    launch_page = client.get("/launch")
    assert launch_page.status_code == 200
    assert "Mission Control" in launch_page.text

    autopilot_page = client.get("/autopilot")
    assert autopilot_page.status_code == 200
    assert "Autopilot Control Room" in autopilot_page.text

    runs_page = client.get("/runs")
    assert runs_page.status_code == 200
    assert "Run Ledger" in runs_page.text

    loops_page = client.get("/loops")
    assert loops_page.status_code == 200
    assert "Loop Ledger" in loops_page.text

    settings_page = client.get("/settings")
    assert settings_page.status_code == 200
    assert "Runtime Settings" in settings_page.text

    detail_response = client.get(f"/runs/{state.run_id}")
    assert detail_response.status_code == 200
    assert "Operator Report" in detail_response.text

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
