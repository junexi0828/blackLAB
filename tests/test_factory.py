import json
from datetime import timedelta
from pathlib import Path

from blacklab_factory.factory import FactoryRunner
from blacklab_factory.models import CompanyConfig, DepartmentConfig, utc_now


def test_mock_run_creates_state_and_artifacts(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.start("Build an AI product for logistics teams", mode="mock")

    assert state.status == "completed"
    assert len(state.steps) == 11
    assert state.metrics["departments_completed"] == 11
    assert len(state.artifacts) == 11
    assert state.steps[-1].department_key == "board_review"
    assert (tmp_path / "runs" / state.run_id / "state.json").exists()
    assert (tmp_path / "runs" / state.run_id / "run.log").exists()
    assert "Run completed." in (tmp_path / "runs" / state.run_id / "run.log").read_text(encoding="utf-8")


def test_list_runs_skips_legacy_state_files(tmp_path: Path) -> None:
    legacy_run_dir = tmp_path / "runs" / "legacy-run"
    legacy_run_dir.mkdir(parents=True)
    (legacy_run_dir / "state.json").write_text('{"run_id":"legacy-run","status":"completed"}', encoding="utf-8")

    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.start("Launch an AI tool for retail operators", mode="mock")
    runs = runner.list_runs()

    assert [run.run_id for run in runs] == [state.run_id]


def test_running_state_becomes_stale_when_heartbeat_expires(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.start("Build an AI product for clinics", mode="mock")
    path = tmp_path / "runs" / state.run_id / "state.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["status"] = "running"
    payload["updated_at"] = (utc_now() - timedelta(minutes=10)).isoformat()
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    refreshed = runner.get_run(state.run_id)

    assert refreshed.status == "stale"
    assert refreshed.current_department is None
    assert refreshed.current_process is None


def test_full_parallel_run_waits_for_board_review_until_departments_finish(tmp_path: Path) -> None:
    config = CompanyConfig(
        company_name="blackLAB",
        default_mode="mock",
        mission_style="profit-first operator",
        parallel_strategy="full_parallel",
        max_parallel_departments=3,
        enable_final_review=True,
        departments=[
            DepartmentConfig(
                key="research",
                label="Research",
                purpose="Find demand.",
                output_title="Research Memo",
            ),
            DepartmentConfig(
                key="product",
                label="Product",
                purpose="Define the wedge.",
                output_title="Product Strategy",
            ),
        ],
    )
    runner = FactoryRunner(storage_root=tmp_path, config=config)

    state = runner.start("Build an AI wedge for operators", mode="mock", max_parallel_departments=3)
    log_text = (tmp_path / "runs" / state.run_id / "run.log").read_text(encoding="utf-8")

    assert "Research started." in log_text
    assert "Product started." in log_text
    assert "Board Review started." in log_text
    assert log_text.index("Research completed.") < log_text.index("Board Review started.")
    assert log_text.index("Product completed.") < log_text.index("Board Review started.")


def test_final_review_department_uses_review_runtime_tier(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)

    workflow_departments = runner._build_workflow_departments()

    assert workflow_departments[-1].key == "board_review"
    assert workflow_departments[-1].runtime_tier == "review"
    assert workflow_departments[-2].key == "quality_gate"


def test_review_departments_wait_for_core_wave_before_board_review(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)

    workflow_departments = runner._build_workflow_departments()
    review_keys = [department.key for department in workflow_departments if department.runtime_tier == "review"]
    board_review = workflow_departments[-1]

    assert {"validation", "test_lab", "quality_gate", "board_review"}.issubset(review_keys)
    assert board_review.depends_on == ["validation", "test_lab", "quality_gate"]
