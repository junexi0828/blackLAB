from __future__ import annotations

import json
from pathlib import Path

import typer
import uvicorn

from blacklab_factory.autopilot import AutopilotSupervisor, LoopRunRequest
from blacklab_factory.factory import FactoryRunner
from blacklab_factory.launcher import launch_detached_loop, launch_detached_release, launch_detached_run
from blacklab_factory.models import (
    DEFAULT_CORE_CODEX_MODEL,
    DEFAULT_REVIEW_CODEX_AUTONOMY,
    DEFAULT_REVIEW_CODEX_MODEL,
    RunSettings,
)
from blacklab_factory.release_ops import ReleaseManager
from blacklab_factory.service import (
    DEFAULT_AUTOPILOT_LABEL,
    DEFAULT_DASHBOARD_LABEL,
    LaunchdServiceManager,
)
from blacklab_factory.web import create_app

app = typer.Typer(add_completion=False, help="Run and inspect the blackLAB multi-agent factory.")
autopilot_app = typer.Typer(add_completion=False, help="Run the factory in a continuous background loop.")
release_app = typer.Typer(add_completion=False, help="Package a project into a downloadable release bundle.")
service_app = typer.Typer(add_completion=False, help="Install macOS launchd services for 24/7 operation.")
app.add_typer(autopilot_app, name="autopilot")
app.add_typer(release_app, name="release")
app.add_typer(service_app, name="service")


@app.command()
def run(
    mission: str = typer.Argument(..., help="What the AI company should pursue."),
    mode: str = typer.Option("codex", "--mode", "-m", help="Execution mode: mock, codex, or openai."),
    pause_between_departments: float = typer.Option(
        0,
        "--pause-between-departments",
        help="Seconds to wait between departments so you can inspect a live run.",
    ),
    max_parallel_departments: int = typer.Option(
        0,
        "--max-parallel-departments",
        help="Maximum number of departments to run in parallel. 0 uses config default.",
    ),
    codex_model: str = typer.Option(
        DEFAULT_CORE_CODEX_MODEL,
        "--codex-model",
        help="Codex model for core planning, design, and implementation departments.",
    ),
    codex_autonomy: str = typer.Option(
        "read_only",
        "--codex-autonomy",
        help="Codex autonomy for core departments: read_only, full_auto, yolo.",
    ),
    codex_review_model: str = typer.Option(
        DEFAULT_REVIEW_CODEX_MODEL,
        "--codex-review-model",
        help="Codex model for review, testing, and validation departments.",
    ),
    codex_review_autonomy: str = typer.Option(
        DEFAULT_REVIEW_CODEX_AUTONOMY,
        "--codex-review-autonomy",
        help="Codex autonomy for review departments: read_only, full_auto, yolo.",
    ),
    project_slug: str | None = typer.Option(
        None,
        "--project-slug",
        help="Optional persistent project slug to attach this run to.",
    ),
    active_departments: str | None = typer.Option(
        None,
        "--active-departments",
        help="Comma-separated department keys to activate for this run.",
    ),
    detach: bool = typer.Option(
        False,
        "--detach",
        help="Launch the run in the background and return immediately.",
    ),
    storage_root: Path | None = typer.Option(
        None,
        "--storage-root",
        help="Override storage path.",
        hidden=True,
    ),
    run_id_file: Path | None = typer.Option(
        None,
        "--run-id-file",
        help="Internal handoff file for detached launches.",
        hidden=True,
    ),
) -> None:
    run_settings = RunSettings(
        codex_model=codex_model,
        codex_autonomy=codex_autonomy,  # type: ignore[arg-type]
        codex_review_model=codex_review_model,
        codex_review_autonomy=codex_review_autonomy,  # type: ignore[arg-type]
        detached=detach,
        max_parallel_departments=max_parallel_departments or None,
        active_department_keys=[item.strip() for item in active_departments.split(",") if item.strip()] if active_departments else None,
    )
    if detach:
        launch = launch_detached_run(
            mission=mission,
            project_slug=project_slug,
            mode=mode,
            pause_between_departments=pause_between_departments,
            max_parallel_departments=max_parallel_departments or None,
            active_department_keys=run_settings.active_department_keys,
            storage_root=storage_root or FactoryRunner().storage.root,
            codex_model=codex_model,
            codex_autonomy=codex_autonomy,
            codex_review_model=codex_review_model,
            codex_review_autonomy=codex_review_autonomy,
        )
        typer.echo(f"run_id={launch.entity_id}")
        typer.echo("status=detached")
        typer.echo(f"pid={launch.pid}")
        typer.echo(f"log={launch.log_path}")
        typer.echo("dashboard=http://127.0.0.1:8000")
        return

    runner = FactoryRunner(storage_root=storage_root)
    state = runner.start(
        mission=mission,
        mode=mode,  # type: ignore[arg-type]
        pause_between_departments=pause_between_departments,
        max_parallel_departments=max_parallel_departments or None,
        run_settings=run_settings,
        project_slug=project_slug,
        on_run_created=_build_run_created_callback(run_id_file),
    )
    typer.echo(f"run_id={state.run_id}")
    typer.echo(f"status={state.status}")
    typer.echo(f"artifacts={len(state.artifacts)}")
    typer.echo("dashboard=http://127.0.0.1:8000")


@app.command()
def status(
    run_id: str | None = typer.Option(None, "--run-id", help="Specific run id."),
) -> None:
    runner = FactoryRunner()
    if run_id:
        state = runner.get_run(run_id)
        typer.echo(json.dumps(state.model_dump(mode="json"), indent=2))
        return

    runs = runner.list_runs()
    rows = [
        {
            "run_id": state.run_id,
            "status": state.status,
            "mode": state.mode,
            "mission": state.mission,
            "updated_at": state.updated_at.isoformat(),
        }
        for state in runs
    ]
    typer.echo(json.dumps(rows, indent=2))


@app.command()
def dashboard(
    host: str = typer.Option("127.0.0.1", help="Bind host."),
    port: int = typer.Option(8000, help="Bind port."),
    storage_root: Path | None = typer.Option(None, help="Override storage path."),
    access_log: bool = typer.Option(
        False,
        "--access-log/--no-access-log",
        envvar="BLACKLAB_ACCESS_LOG",
        help="Enable uvicorn per-request access logs.",
    ),
) -> None:
    app_instance = create_app(storage_root=storage_root)
    uvicorn.run(app_instance, host=host, port=port, log_level="info", access_log=access_log)


@autopilot_app.command("start")
def autopilot_start(
    objective: str = typer.Argument(..., help="Company objective to pursue continuously."),
    run_mode: str = typer.Option("codex", "--run-mode", help="Execution mode for each cycle."),
    loop_mode: str = typer.Option("full_auto", "--loop-mode", help="Loop mode: full_auto or always_on."),
    max_iterations: int = typer.Option(3, "--max-iterations", help="Iteration cap for full_auto mode."),
    interval_seconds: int = typer.Option(30, "--interval-seconds", help="Sleep between cycles."),
    pause_between_departments: float = typer.Option(0, "--pause-between-departments", help="Inspection pause inside each run."),
    max_parallel_departments: int = typer.Option(0, "--max-parallel-departments", help="Parallel department limit."),
    codex_model: str = typer.Option(DEFAULT_CORE_CODEX_MODEL, "--codex-model", help="Codex model for core departments in each cycle."),
    codex_autonomy: str = typer.Option("full_auto", "--codex-autonomy", help="Codex autonomy for core departments: read_only, full_auto, yolo."),
    codex_review_model: str = typer.Option(DEFAULT_REVIEW_CODEX_MODEL, "--codex-review-model", help="Codex model for review departments in each cycle."),
    codex_review_autonomy: str = typer.Option(DEFAULT_REVIEW_CODEX_AUTONOMY, "--codex-review-autonomy", help="Codex autonomy for review departments: read_only, full_auto, yolo."),
    project_slug: str | None = typer.Option(None, "--project-slug", help="Optional persistent project slug to attach this loop to."),
    active_departments: str | None = typer.Option(None, "--active-departments", help="Comma-separated department keys to activate for each run."),
    detach: bool = typer.Option(False, "--detach", help="Launch the autopilot loop in the background."),
    storage_root: Path | None = typer.Option(None, "--storage-root", hidden=True),
    loop_id_file: Path | None = typer.Option(None, "--loop-id-file", hidden=True),
) -> None:
    base_storage = storage_root or FactoryRunner().storage.root
    run_settings = RunSettings(
        codex_model=codex_model,
        codex_autonomy=codex_autonomy,  # type: ignore[arg-type]
        codex_review_model=codex_review_model,
        codex_review_autonomy=codex_review_autonomy,  # type: ignore[arg-type]
        detached=detach,
        max_parallel_departments=max_parallel_departments or None,
        active_department_keys=[item.strip() for item in active_departments.split(",") if item.strip()] if active_departments else None,
    )

    if detach:
        launch = launch_detached_loop(
            objective=objective,
            project_slug=project_slug,
            run_mode=run_mode,
            loop_mode=loop_mode,
            interval_seconds=interval_seconds,
            max_iterations=max_iterations if loop_mode == "full_auto" else None,
            pause_between_departments=pause_between_departments,
            max_parallel_departments=max_parallel_departments or None,
            active_department_keys=run_settings.active_department_keys,
            storage_root=base_storage,
            codex_model=codex_model,
            codex_autonomy=codex_autonomy,
            codex_review_model=codex_review_model,
            codex_review_autonomy=codex_review_autonomy,
        )
        typer.echo(f"loop_id={launch.entity_id}")
        typer.echo("status=detached")
        typer.echo(f"pid={launch.pid}")
        typer.echo(f"log={launch.log_path}")
        typer.echo("dashboard=http://127.0.0.1:8000")
        return

    supervisor = AutopilotSupervisor(storage_root=base_storage)
    request = LoopRunRequest(
        objective=objective,
        loop_mode=loop_mode,  # type: ignore[arg-type]
        run_mode=run_mode,  # type: ignore[arg-type]
        run_settings=run_settings,
        interval_seconds=interval_seconds,
        max_iterations=max_iterations if loop_mode == "full_auto" else None,
        pause_between_departments=pause_between_departments,
        max_parallel_departments=max_parallel_departments or None,
        project_slug=project_slug,
    )
    loop_state = supervisor.start_loop(request)
    callback = _build_loop_created_callback(loop_id_file)
    if callback:
        callback(loop_state.loop_id)
    loop_state = supervisor.run_loop(request, loop_id=loop_state.loop_id)
    typer.echo(f"loop_id={loop_state.loop_id}")
    typer.echo(f"status={loop_state.status}")
    typer.echo(f"iterations_completed={loop_state.iterations_completed}")


@autopilot_app.command("stop")
def autopilot_stop(
    loop_id: str = typer.Argument(..., help="Loop id to stop."),
    storage_root: Path | None = typer.Option(None, "--storage-root", hidden=True),
) -> None:
    supervisor = AutopilotSupervisor(storage_root=storage_root or FactoryRunner().storage.root)
    loop_state = supervisor.request_stop(loop_id)
    typer.echo(f"loop_id={loop_state.loop_id}")
    typer.echo(f"status={loop_state.status}")
    typer.echo(f"latest_note={loop_state.latest_note}")


@autopilot_app.command("status")
def autopilot_status(
    loop_id: str | None = typer.Option(None, "--loop-id", help="Specific loop id."),
    storage_root: Path | None = typer.Option(None, "--storage-root", hidden=True),
) -> None:
    supervisor = AutopilotSupervisor(storage_root=storage_root or FactoryRunner().storage.root)
    if loop_id:
        loop_state = supervisor.loop_storage.load_state(loop_id)
        typer.echo(json.dumps(loop_state.model_dump(mode="json"), indent=2))
        return

    loops, _ = supervisor.loop_storage.list_loops()
    typer.echo(json.dumps([loop.model_dump(mode="json") for loop in loops], indent=2))


@release_app.command("build")
def release_build(
    project_slug: str = typer.Argument(..., help="Saved project slug to package."),
    detach: bool = typer.Option(False, "--detach", help="Launch release packaging in the background."),
    storage_root: Path | None = typer.Option(None, "--storage-root", hidden=True),
    release_id_file: Path | None = typer.Option(None, "--release-id-file", hidden=True),
) -> None:
    base_storage = storage_root or FactoryRunner().storage.root
    if detach:
        launch = launch_detached_release(
            project_slug=project_slug,
            storage_root=base_storage,
        )
        typer.echo(f"release_id={launch.entity_id}")
        typer.echo("status=detached")
        typer.echo(f"pid={launch.pid}")
        typer.echo(f"log={launch.log_path}")
        typer.echo("dashboard=http://127.0.0.1:8000")
        return

    manager = ReleaseManager(storage_root=base_storage)
    state = manager.start_build(
        project_slug=project_slug,
        on_release_created=_build_release_created_callback(release_id_file),
    )
    typer.echo(f"release_id={state.release_id}")
    typer.echo(f"status={state.status}")
    if state.download_path:
        typer.echo(f"download={state.download_path}")


@service_app.command("install-dashboard")
def service_install_dashboard(
    host: str = typer.Option("127.0.0.1", help="Dashboard bind host."),
    port: int = typer.Option(8000, help="Dashboard bind port."),
    start: bool = typer.Option(True, "--start/--no-start", help="Bootstrap the launch agent immediately."),
    label: str = typer.Option(DEFAULT_DASHBOARD_LABEL, "--label", help="launchd label."),
    home_path: Path | None = typer.Option(None, "--home-path", hidden=True),
    project_root: Path | None = typer.Option(None, "--project-root", hidden=True),
) -> None:
    manager = LaunchdServiceManager(project_root=project_root, home_path=home_path)
    spec = manager.dashboard_spec(host=host, port=port, label=label)
    plist_path = manager.install(spec, start=start)
    typer.echo(f"label={label}")
    typer.echo(f"plist={plist_path}")
    typer.echo(f"loaded={start}")


@service_app.command("install-autopilot")
def service_install_autopilot(
    objective: str = typer.Argument(..., help="Persistent company objective."),
    run_mode: str = typer.Option("codex", "--run-mode", help="Execution mode for each cycle."),
    loop_mode: str = typer.Option("always_on", "--loop-mode", help="Loop mode: full_auto or always_on."),
    max_iterations: int = typer.Option(3, "--max-iterations", help="Iteration cap for full_auto mode."),
    interval_seconds: int = typer.Option(30, "--interval-seconds", help="Sleep between cycles."),
    pause_between_departments: float = typer.Option(0, "--pause-between-departments", help="Inspection pause inside each run."),
    max_parallel_departments: int = typer.Option(7, "--max-parallel-departments", help="Parallel department limit."),
    codex_model: str = typer.Option(DEFAULT_CORE_CODEX_MODEL, "--codex-model", help="Codex model for core departments in each cycle."),
    codex_autonomy: str = typer.Option("full_auto", "--codex-autonomy", help="Codex autonomy for core departments: read_only, full_auto, yolo."),
    codex_review_model: str = typer.Option(DEFAULT_REVIEW_CODEX_MODEL, "--codex-review-model", help="Codex model for review departments in each cycle."),
    codex_review_autonomy: str = typer.Option(DEFAULT_REVIEW_CODEX_AUTONOMY, "--codex-review-autonomy", help="Codex autonomy for review departments: read_only, full_auto, yolo."),
    start: bool = typer.Option(True, "--start/--no-start", help="Bootstrap the launch agent immediately."),
    label: str = typer.Option(DEFAULT_AUTOPILOT_LABEL, "--label", help="launchd label."),
    home_path: Path | None = typer.Option(None, "--home-path", hidden=True),
    project_root: Path | None = typer.Option(None, "--project-root", hidden=True),
) -> None:
    manager = LaunchdServiceManager(project_root=project_root, home_path=home_path)
    spec = manager.autopilot_spec(
        objective=objective,
        run_mode=run_mode,
        loop_mode=loop_mode,
        interval_seconds=interval_seconds,
        max_iterations=max_iterations if loop_mode == "full_auto" else None,
        pause_between_departments=pause_between_departments,
        max_parallel_departments=max_parallel_departments,
        codex_model=codex_model,
        codex_autonomy=codex_autonomy,
        codex_review_model=codex_review_model,
        codex_review_autonomy=codex_review_autonomy,
        label=label,
    )
    plist_path = manager.install(spec, start=start)
    typer.echo(f"label={label}")
    typer.echo(f"plist={plist_path}")
    typer.echo(f"loaded={start}")


@service_app.command("status")
def service_status(
    home_path: Path | None = typer.Option(None, "--home-path", hidden=True),
    project_root: Path | None = typer.Option(None, "--project-root", hidden=True),
) -> None:
    manager = LaunchdServiceManager(project_root=project_root, home_path=home_path)
    rows = [
        manager.status(DEFAULT_DASHBOARD_LABEL),
        manager.status(DEFAULT_AUTOPILOT_LABEL),
    ]
    typer.echo(json.dumps(rows, indent=2))


@service_app.command("uninstall")
def service_uninstall(
    target: str = typer.Argument(..., help="dashboard, autopilot, or all"),
    stop: bool = typer.Option(True, "--stop/--no-stop", help="Attempt to unload the launch agent before removing the plist."),
    home_path: Path | None = typer.Option(None, "--home-path", hidden=True),
    project_root: Path | None = typer.Option(None, "--project-root", hidden=True),
) -> None:
    manager = LaunchdServiceManager(project_root=project_root, home_path=home_path)
    labels: list[str]
    if target == "dashboard":
        labels = [DEFAULT_DASHBOARD_LABEL]
    elif target == "autopilot":
        labels = [DEFAULT_AUTOPILOT_LABEL]
    elif target == "all":
        labels = [DEFAULT_DASHBOARD_LABEL, DEFAULT_AUTOPILOT_LABEL]
    else:
        raise typer.BadParameter("target must be one of: dashboard, autopilot, all")

    for label in labels:
        plist_path = manager.uninstall(label, stop=stop)
        typer.echo(f"label={label}")
        typer.echo(f"plist={plist_path}")
        typer.echo("removed=true")


def _build_run_created_callback(run_id_file: Path | None):
    if run_id_file is None:
        return None

    def _callback(state) -> None:
        run_id_file.parent.mkdir(parents=True, exist_ok=True)
        run_id_file.write_text(state.run_id, encoding="utf-8")

    return _callback


def _build_loop_created_callback(loop_id_file: Path | None):
    if loop_id_file is None:
        return None

    def _callback(loop_id: str) -> None:
        loop_id_file.parent.mkdir(parents=True, exist_ok=True)
        loop_id_file.write_text(loop_id, encoding="utf-8")

    return _callback


def _build_release_created_callback(release_id_file: Path | None):
    if release_id_file is None:
        return None

    def _callback(state) -> None:
        release_id_file.parent.mkdir(parents=True, exist_ok=True)
        release_id_file.write_text(state.release_id, encoding="utf-8")

    return _callback


if __name__ == "__main__":
    app()
