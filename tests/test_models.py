from blacklab_factory.models import RunSettings


def test_run_settings_route_core_and_review_profiles_independently() -> None:
    settings = RunSettings(
        codex_model="gpt-5.4",
        codex_autonomy="full_auto",
        codex_review_model="gpt-5.4-mini",
        codex_review_autonomy="read_only",
    )

    assert settings.model_for_tier("core") == "gpt-5.4"
    assert settings.autonomy_for_tier("core") == "full_auto"
    assert settings.model_for_tier("review") == "gpt-5.4-mini"
    assert settings.autonomy_for_tier("review") == "read_only"
