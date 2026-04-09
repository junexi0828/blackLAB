import time
from pathlib import Path

from blacklab_factory.factory import FactoryRunner
from blacklab_factory.launcher import launch_detached_run


def test_detached_launch_returns_run_id_and_completes(tmp_path: Path) -> None:
    launch = launch_detached_run(
        mission="Run a detached mock factory",
        project_slug=None,
        mode="mock",
        pause_between_departments=0,
        max_parallel_departments=7,
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
