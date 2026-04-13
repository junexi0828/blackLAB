import time
from pathlib import Path

from fastapi.testclient import TestClient

from blacklab_factory.autopilot import AutopilotSupervisor, LoopRunRequest
from blacklab_factory.factory import FactoryRunner
from blacklab_factory.models import RunSettings, StepRecord
from blacklab_factory.operator_control import OperatorCommander
from blacklab_factory.storage import OperatorStorage, ProjectStorage, RunStorage
from blacklab_factory.web import create_app


def test_operator_page_and_chat_control_work_from_web(tmp_path: Path) -> None:
    client = TestClient(create_app(storage_root=tmp_path))

    operator_page = client.get("/operator")
    assert operator_page.status_code == 200
    assert "Live Chat" in operator_page.text
    assert "Saved Setup" in operator_page.text
    assert "Active Runs" in operator_page.text
    assert "Active Loops" in operator_page.text

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


def test_operator_profile_persists_roster_selection(tmp_path: Path) -> None:
    client = TestClient(create_app(storage_root=tmp_path))

    payload = {
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
        "roster": {
            "active_department_keys": ["ceo", "product", "dev_1", "board_review"],
            "hidden_campus_items": ["monument"],
        },
    }

    save_response = client.post("/api/operator/profile", json=payload)
    assert save_response.status_code == 200
    assert save_response.json()["roster"]["active_department_keys"] == [
        "ceo",
        "product",
        "dev_1",
        "board_review",
    ]
    assert save_response.json()["roster"]["hidden_campus_items"] == ["monument"]

    load_response = client.get("/api/operator/profile")
    assert load_response.status_code == 200
    assert load_response.json()["roster"]["active_department_keys"] == [
        "ceo",
        "product",
        "dev_1",
        "board_review",
    ]
    assert load_response.json()["roster"]["hidden_campus_items"] == ["monument"]


def test_operator_profile_recovers_from_empty_json_file(tmp_path: Path) -> None:
    storage = OperatorStorage(tmp_path)
    storage.profile_path().write_text("", encoding="utf-8")

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.get("/api/operator/profile")

    assert response.status_code == 200
    payload = response.json()
    assert "launch" in payload
    assert "autopilot" in payload
    assert storage.profile_path().read_text(encoding="utf-8").strip().startswith("{")


def test_operator_profile_clears_archived_default_projects(tmp_path: Path) -> None:
    projects = ProjectStorage(tmp_path)
    projects.create_project(slug="retired-project", name="Retired Project")
    projects.archive_project("retired-project")

    storage = OperatorStorage(tmp_path)
    profile = storage.load_profile()
    profile.launch.project_slug = "retired-project"
    profile.autopilot.project_slug = "retired-project"
    storage.save_profile(profile)

    client = TestClient(create_app(storage_root=tmp_path))
    response = client.get("/api/operator/profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["launch"]["project_slug"] is None
    assert payload["autopilot"]["project_slug"] is None


def test_operator_chat_routes_directive_to_active_run(tmp_path: Path) -> None:
    run_storage = RunStorage(tmp_path)
    state = run_storage.create_run(
        mission="Live run directive test",
        company_name="blackLAB",
        mode="mock",
        steps=[
            StepRecord(
                department_key="ceo",
                department_label="CEO",
                purpose="Own the direction.",
            )
        ],
        settings=RunSettings(),
    )
    state.status = "running"
    run_storage.save_state(state)

    commander = OperatorCommander(tmp_path)
    result = commander.handle_message("dev_1에 집중하고 디자인은 보류해")

    assert result["action"]["type"] == "run_directive"
    queued = run_storage.consume_directives(state.run_id)
    assert len(queued) == 1
    assert queued[0].content == "dev_1에 집중하고 디자인은 보류해"


def test_operator_chat_routes_directive_to_active_loop_when_no_run(tmp_path: Path) -> None:
    supervisor = AutopilotSupervisor(storage_root=tmp_path)
    loop_state = supervisor.start_loop(
        LoopRunRequest(
            objective="Loop directive test",
            loop_mode="always_on",
            run_mode="mock",
            run_settings=RunSettings(),
            interval_seconds=30,
        )
    )
    loop_state.status = "running"
    supervisor.loop_storage.save_state(loop_state)

    commander = OperatorCommander(tmp_path)
    result = commander.handle_message("다음 iteration에서는 pricing proof부터 확인해")

    assert result["action"]["type"] == "loop_directive"
    queued = supervisor.loop_storage.consume_directives(loop_state.loop_id)
    assert len(queued) == 1
    assert queued[0].content == "다음 iteration에서는 pricing proof부터 확인해"
