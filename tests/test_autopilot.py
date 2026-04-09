from pathlib import Path

from blacklab_factory.autopilot import AutopilotSupervisor, LoopRunRequest
from blacklab_factory.models import RunSettings


def test_full_auto_loop_completes_configured_iterations(tmp_path: Path) -> None:
    supervisor = AutopilotSupervisor(storage_root=tmp_path)
    request = LoopRunRequest(
        objective="Operate a fully automatic AI company loop",
        loop_mode="full_auto",
        run_mode="mock",
        run_settings=RunSettings(
            codex_model="gpt-5.4",
            codex_autonomy="full_auto",
            codex_review_model="gpt-5.4-mini",
            codex_review_autonomy="read_only",
        ),
        interval_seconds=0,
        max_iterations=2,
        max_parallel_departments=7,
    )

    loop_state = supervisor.run_loop(request)

    assert loop_state.status == "completed"
    assert loop_state.iterations_completed == 2
    assert len(loop_state.runs) == 2
    assert all(record.run_id for record in loop_state.runs)
    assert loop_state.runs[0].run_id != loop_state.runs[1].run_id
    assert loop_state.run_settings.codex_review_model == "gpt-5.4-mini"
