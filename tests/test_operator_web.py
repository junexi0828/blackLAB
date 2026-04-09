import time
from pathlib import Path

from fastapi.testclient import TestClient

from blacklab_factory.factory import FactoryRunner
from blacklab_factory.web import create_app


def test_operator_page_and_chat_control_work_from_web(tmp_path: Path) -> None:
    client = TestClient(create_app(storage_root=tmp_path))

    operator_page = client.get("/operator")
    assert operator_page.status_code == 200
    assert "Operator Chat" in operator_page.text
    assert "Launch Project" in operator_page.text
    assert "Autopilot Project" in operator_page.text

    profile_response = client.post(
        "/api/operator/profile",
        json={
            "launch": {
                "mode": "mock",
                "project_slug": "revenue-leak-auditor",
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
                "project_slug": "revenue-leak-auditor",
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
    assert profile_response.json()["launch"]["mode"] == "mock"

    chat_response = client.post(
        "/api/operator/chat",
        json={"message": "launch run: project: REVENUE-LEAK-AUDITOR Web operator mission"},
    )
    assert chat_response.status_code == 200
    assert chat_response.json()["action"]["type"] == "run_launch"
    run_id = chat_response.json()["action"]["run_id"]

    runner = FactoryRunner(storage_root=tmp_path)
    deadline = time.monotonic() + 10
    run_state = None
    while time.monotonic() < deadline:
        try:
            run_state = runner.get_run(run_id)
        except FileNotFoundError:
            time.sleep(0.1)
            continue
        if run_state.status == "completed":
            break
        time.sleep(0.1)

    assert run_state is not None
    assert run_state.status == "completed"
    assert run_state.project_slug == "revenue-leak-auditor"
    assert (tmp_path / "projects" / "revenue-leak-auditor" / "project.md").exists()
    assert (tmp_path / "projects" / "revenue-leak-auditor" / "memory.md").exists()

    status_response = client.post(
        "/api/operator/chat",
        json={"message": "상태 알려줘"},
    )
    assert status_response.status_code == 200
    assert "활성 런" in status_response.json()["reply"]
