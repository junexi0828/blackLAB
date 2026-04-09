from pathlib import Path

from blacklab_factory.autopilot import AutopilotSupervisor, LoopRunRequest
from blacklab_factory.models import RunSettings, RunState


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


def test_loop_auto_recovers_after_failed_run(tmp_path: Path) -> None:
    supervisor = AutopilotSupervisor(storage_root=tmp_path)
    request = LoopRunRequest(
        objective="Operate a resilient AI company loop",
        loop_mode="full_auto",
        run_mode="mock",
        run_settings=RunSettings(
            codex_model="gpt-5.4",
            codex_autonomy="full_auto",
            codex_review_model="gpt-5.4",
            codex_review_autonomy="full_auto",
        ),
        interval_seconds=0,
        max_iterations=2,
        max_parallel_departments=5,
        max_recovery_attempts=2,
        recovery_backoff_seconds=0,
    )

    calls = {"count": 0}
    supervisor._sleep_recovery_backoff = lambda loop_state, seconds: None  # type: ignore[method-assign]

    def fake_start(*, mission, mode, pause_between_departments, max_parallel_departments, run_settings, project_slug):
        calls["count"] += 1
        if calls["count"] == 1:
            return RunState(
                run_id="failed-run-1",
                mission=mission,
                company_name="blackLAB",
                mode=mode,
                status="failed",
                current_status="Run failed: usage limit. Try again at 11:59 PM.",
                summary="usage limit",
                settings=run_settings,
            )
        return RunState(
            run_id="recovered-run-2",
            mission=mission,
            company_name="blackLAB",
            mode=mode,
            status="completed",
            current_status="Run completed.",
            summary="Recovered successfully.",
            settings=run_settings,
        )

    supervisor.runner.start = fake_start  # type: ignore[method-assign]

    loop_state = supervisor.run_loop(request)

    assert loop_state.status == "completed"
    assert loop_state.iterations_completed == 2
    assert len(loop_state.incidents) == 1
    assert loop_state.incidents[0].failure_type == "usage_limit"
    assert loop_state.incidents[0].wait_seconds is not None
    assert loop_state.total_recovery_activations == 1
    assert loop_state.consecutive_failures == 0
    assert loop_state.runs[0].status == "failed"
    assert loop_state.runs[1].status == "completed"
