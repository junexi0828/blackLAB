import time
from pathlib import Path

import blacklab_factory.cli as cli_module
from blacklab_factory.factory import FactoryRunner
from blacklab_factory.launcher import launch_detached_run
from typer.testing import CliRunner


runner = CliRunner()


def test_detached_launch_returns_run_id_and_completes(tmp_path: Path) -> None:
    launch = launch_detached_run(
        mission="Run a detached mock factory",
        project_slug=None,
        mode="mock",
        pause_between_departments=0,
        max_parallel_departments=7,
        active_department_keys=None,
        storage_root=tmp_path,
        codex_model="gpt-5.4",
        codex_autonomy="read_only",
        codex_review_model="gpt-5.4-mini",
        codex_review_autonomy="read_only",
    )

    assert launch.entity_id
    assert launch.pid > 0
    assert launch.log_path.exists()

    runner = FactoryRunner(storage_root=tmp_path)
    deadline = time.monotonic() + 10
    state = None
    while time.monotonic() < deadline:
        try:
            state = runner.get_run(launch.entity_id)
        except FileNotFoundError:
            time.sleep(0.1)
            continue
        if state.status == "completed":
            break
        time.sleep(0.1)

    assert state is not None
    assert state.status == "completed"
    assert len(state.artifacts) == 13
    assert state.settings.codex_model == "gpt-5.4"
    assert state.settings.codex_review_model == "gpt-5.4-mini"


def test_dashboard_access_log_defaults_to_disabled(monkeypatch) -> None:
    captured: dict[str, object] = {}

    monkeypatch.setattr(cli_module, "create_app", lambda storage_root=None: object())

    def fake_run(app_instance, **kwargs):
        captured["app_instance"] = app_instance
        captured.update(kwargs)

    monkeypatch.setattr(cli_module.uvicorn, "run", fake_run)

    result = runner.invoke(cli_module.app, ["dashboard"])

    assert result.exit_code == 0
    assert captured["access_log"] is False


def test_dashboard_access_log_can_be_enabled_from_env(monkeypatch) -> None:
    captured: dict[str, object] = {}

    monkeypatch.setattr(cli_module, "create_app", lambda storage_root=None: object())

    def fake_run(app_instance, **kwargs):
        captured["app_instance"] = app_instance
        captured.update(kwargs)

    monkeypatch.setattr(cli_module.uvicorn, "run", fake_run)
    monkeypatch.setenv("BLACKLAB_ACCESS_LOG", "1")

    result = runner.invoke(cli_module.app, ["dashboard"])

    assert result.exit_code == 0
    assert captured["access_log"] is True
