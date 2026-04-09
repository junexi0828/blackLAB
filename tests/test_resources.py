from blacklab_factory.resources import RuntimeResourceManager


def test_resource_manager_keeps_requested_parallelism_when_machine_is_healthy(monkeypatch) -> None:
    manager = RuntimeResourceManager()
    monkeypatch.setattr(manager, "_cpu_load_snapshot", lambda cpu_count: (1.2, 0.2))
    monkeypatch.setattr(manager, "_memory_snapshot", lambda: (32000, 22000, 0.68))

    snapshot = manager.snapshot(requested_parallelism=6)

    assert snapshot.effective_parallelism == 6
    assert "safe" in snapshot.reason.lower()


def test_resource_manager_clamps_parallelism_when_machine_is_under_pressure(monkeypatch) -> None:
    manager = RuntimeResourceManager()
    monkeypatch.setattr(manager, "_cpu_load_snapshot", lambda cpu_count: (14.0, 1.4))
    monkeypatch.setattr(manager, "_memory_snapshot", lambda: (32000, 1800, 0.056))

    snapshot = manager.snapshot(requested_parallelism=9)

    assert snapshot.effective_parallelism == 1
    assert "critical" in snapshot.reason.lower()
