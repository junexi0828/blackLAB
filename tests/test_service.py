from pathlib import Path

from typer.testing import CliRunner

from blacklab_factory.cli import app
from blacklab_factory.service import LaunchdServiceManager


def test_launchd_specs_render_expected_commands(tmp_path: Path) -> None:
    manager = LaunchdServiceManager(project_root=tmp_path, home_path=tmp_path / "home")

    dashboard_spec = manager.dashboard_spec(host="127.0.0.1", port=9000)
    dashboard_plist = manager.render_plist(dashboard_spec).decode("utf-8")
    assert "blacklab dashboard --host 127.0.0.1 --port 9000" in dashboard_plist
    assert "com.blacklab.dashboard" in dashboard_plist

    autopilot_spec = manager.autopilot_spec(
        objective="Operate a persistent AI company",
        loop_mode="always_on",
        interval_seconds=45,
        codex_autonomy="yolo",
        codex_review_model="gpt-5.4-mini",
        codex_review_autonomy="read_only",
    )
    autopilot_plist = manager.render_plist(autopilot_spec).decode("utf-8")
    assert "blacklab autopilot start 'Operate a persistent AI company'" in autopilot_plist
    assert "--loop-mode always_on" in autopilot_plist
    assert "--codex-autonomy yolo" in autopilot_plist
    assert "--codex-review-model gpt-5.4-mini" in autopilot_plist
    assert "--codex-review-autonomy read_only" in autopilot_plist


def test_service_cli_writes_plists_without_starting(tmp_path: Path) -> None:
    runner = CliRunner()
    home_path = tmp_path / "home"

    dashboard_result = runner.invoke(
        app,
        [
            "service",
            "install-dashboard",
            "--no-start",
            "--home-path",
            str(home_path),
            "--project-root",
            str(tmp_path),
        ],
    )
    assert dashboard_result.exit_code == 0
    assert (home_path / "Library" / "LaunchAgents" / "com.blacklab.dashboard.plist").exists()

    autopilot_result = runner.invoke(
        app,
        [
            "service",
            "install-autopilot",
            "Operate a 24-7 AI company",
            "--no-start",
            "--home-path",
            str(home_path),
            "--project-root",
            str(tmp_path),
        ],
    )
    assert autopilot_result.exit_code == 0
    assert (home_path / "Library" / "LaunchAgents" / "com.blacklab.autopilot.plist").exists()
