import json
import os
from datetime import timedelta
from pathlib import Path

from blacklab_factory.factory import FactoryRunner
from blacklab_factory.models import CompanyConfig, DepartmentConfig, ProcessRecord, StepRecord, utc_now


def test_mock_run_creates_state_and_artifacts(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.start("Build an AI product for logistics teams", mode="mock")

    assert state.status == "completed"
    assert len(state.steps) == 13
    assert state.metrics["departments_completed"] == 13
    assert len(state.artifacts) == 13
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


def test_running_state_stays_live_when_worker_pid_is_still_alive(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    state = runner.start("Keep live worker detection honest", mode="mock")
    path = tmp_path / "runs" / state.run_id / "state.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["status"] = "running"
    payload["current_department"] = "test_lab"
    payload["updated_at"] = (utc_now() - timedelta(minutes=10)).isoformat()
    payload["current_processes"] = [
        ProcessRecord(
            label="Test Lab",
            pid=os.getpid(),
            command_preview="python -m live-worker",
        ).model_dump(mode="json")
    ]
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    refreshed = runner.get_run(state.run_id)

    assert refreshed.status == "running"
    assert refreshed.current_department == "test_lab"


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


def test_orchestrator_balances_strategy_and_delivery_lanes(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    workflow_departments = runner._build_workflow_departments()
    step_by_key = {
        department.key: StepRecord(
            department_key=department.key,
            department_label=department.label,
            purpose=department.purpose,
        )
        for department in workflow_departments
    }
    base_department_keys = {department.key for department in runner.config.departments}

    selected = runner._select_departments_for_launch(
        workflow_departments=workflow_departments,
        step_by_key=step_by_key,
        completed_keys=set(),
        base_department_keys=base_department_keys,
        active_departments=[],
        parallel_limit=4,
    )

    selected_keys = {department.key for department in selected}

    assert len(selected) == 4
    assert {"ceo", "research", "dev_1"}.issubset(selected_keys)


def test_project_memory_persists_across_runs(tmp_path: Path) -> None:
    runner = FactoryRunner(storage_root=tmp_path)
    project_slug = "REVENUE-LEAK-AUDITOR"

    first = runner.start("Run project memory seed", mode="mock", project_slug=project_slug)
    project_dir = tmp_path / "projects" / "revenue-leak-auditor"
    context_path = project_dir / "project.md"
    live_context_path = project_dir / "current.md"
    memory_path = project_dir / "memory.md"
    shared_workspace = project_dir / "workspace"

    assert first.project_slug == "revenue-leak-auditor"
    assert context_path.exists()
    assert live_context_path.exists()
    assert memory_path.exists()
    assert context_path.read_text(encoding="utf-8").strip()
    assert live_context_path.read_text(encoding="utf-8").strip()
    assert first.run_id in memory_path.read_text(encoding="utf-8")
    first_foundation = context_path.read_text(encoding="utf-8")
    first_live = live_context_path.read_text(encoding="utf-8")

    retained_file = shared_workspace / "shared-note.txt"
    retained_file.write_text("keep me across runs", encoding="utf-8")

    second = runner.start("Run project memory follow-up", mode="mock", project_slug=project_slug)

    memory_text = memory_path.read_text(encoding="utf-8")
    second_foundation = context_path.read_text(encoding="utf-8")
    second_live = live_context_path.read_text(encoding="utf-8")

    assert second.project_slug == "revenue-leak-auditor"
    assert retained_file.exists()
    assert first.run_id in memory_text
    assert second.run_id in memory_text
    assert first_foundation == second_foundation
    assert "Run project memory follow-up" in second_live
    assert first_live != second_live

    prompt_block = runner.projects.build_project_prompt_block(project_slug)
    assert "PROJECT FOUNDATION" in prompt_block
    assert "PROJECT LIVE CONTEXT" in prompt_block
    assert "PROJECT MEMORY" in prompt_block
