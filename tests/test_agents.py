from blacklab_factory.agents import CodexDepartmentAgent
from blacklab_factory.models import DepartmentConfig, RunSettings


def test_codex_agent_resolves_review_profile_for_review_department() -> None:
    agent = CodexDepartmentAgent()
    settings = RunSettings(
        codex_model="gpt-5.4",
        codex_autonomy="full_auto",
        codex_review_model="gpt-5.4-mini",
        codex_review_autonomy="read_only",
    )
    department = DepartmentConfig(
        key="board_review",
        label="Board Review",
        purpose="Review all artifacts.",
        output_title="Operator Briefing",
        runtime_tier="review",
    )

    profile = agent._resolve_runtime_profile(department=department, settings=settings)

    assert profile.tier == "review"
    assert profile.model == "gpt-5.4-mini"
    assert profile.autonomy == "read_only"


def test_codex_agent_resolves_core_profile_for_core_department() -> None:
    agent = CodexDepartmentAgent()
    settings = RunSettings(
        codex_model="gpt-5.4",
        codex_autonomy="yolo",
        codex_review_model="gpt-5.4-mini",
        codex_review_autonomy="read_only",
    )
    department = DepartmentConfig(
        key="engineering",
        label="Engineering",
        purpose="Ship the system.",
        output_title="Delivery Plan",
    )

    profile = agent._resolve_runtime_profile(department=department, settings=settings)

    assert profile.tier == "core"
    assert profile.model == "gpt-5.4"
    assert profile.autonomy == "yolo"
