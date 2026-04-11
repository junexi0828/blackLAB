from pathlib import Path

from blacklab_factory import agents as agents_module
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
        key="dev_1",
        label="Dev 1",
        purpose="Ship the backend system.",
        output_title="Backend Delivery Plan",
    )

    profile = agent._resolve_runtime_profile(department=department, settings=settings)

    assert profile.tier == "core"
    assert profile.model == "gpt-5.4"
    assert profile.autonomy == "yolo"


def test_codex_agent_resolves_common_homebrew_path_when_path_lookup_fails(monkeypatch) -> None:
    agent = CodexDepartmentAgent()
    monkeypatch.delenv("BLACKLAB_CODEX_BIN", raising=False)
    monkeypatch.delenv("CODEX_BIN", raising=False)
    monkeypatch.setattr(agents_module.shutil, "which", lambda _: None)

    real_exists = Path.exists

    def fake_exists(path: Path) -> bool:
        return str(path) == "/opt/homebrew/bin/codex" or real_exists(path)

    monkeypatch.setattr(Path, "exists", fake_exists)
    monkeypatch.setattr(agents_module.os, "access", lambda path, mode: str(path) == "/opt/homebrew/bin/codex")

    assert agent._resolve_codex_bin() == "/opt/homebrew/bin/codex"


def test_codex_agent_raises_clear_error_when_binary_cannot_be_resolved(monkeypatch) -> None:
    agent = CodexDepartmentAgent()
    monkeypatch.delenv("BLACKLAB_CODEX_BIN", raising=False)
    monkeypatch.delenv("CODEX_BIN", raising=False)
    monkeypatch.setenv("PATH", "/tmp/nowhere")
    monkeypatch.setattr(agents_module.shutil, "which", lambda _: None)
    monkeypatch.setattr(Path, "exists", lambda self: False)
    monkeypatch.setattr(agents_module.os, "access", lambda path, mode: False)

    try:
        agent._resolve_codex_bin()
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected RuntimeError")

    assert "BLACKLAB_CODEX_BIN" in message
    assert "PATH=/tmp/nowhere" in message
