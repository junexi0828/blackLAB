from __future__ import annotations

from datetime import timedelta
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

import blacklab_factory.dashboard as dashboard_module
from blacklab_factory.launcher import DetachedLaunch
from blacklab_factory.release_ops import ReleaseManager
from blacklab_factory.storage import ProjectStorage, ReleaseStorage
from blacklab_factory.web import create_app


def _seed_project_workspace(root: Path, slug: str = "train") -> Path:
    projects = ProjectStorage(root)
    projects.create_project(slug=slug, name="Train")
    workspace = projects.workspace_dir(slug)
    (workspace / "index.html").write_text("<!doctype html><title>demo</title>", encoding="utf-8")
    (workspace / "main.js").write_text("console.log('demo')", encoding="utf-8")
    (workspace / "style.css").write_text("body { background: #000; }", encoding="utf-8")
    (workspace / ".test_lab_server.log").write_text("ignore", encoding="utf-8")
    (workspace / "validation_smoke.sh").write_text("#!/bin/sh\necho smoke\n", encoding="utf-8")
    (workspace / "notes_ARTIFACT.md").write_text("internal", encoding="utf-8")
    test_results = workspace / "test-results"
    test_results.mkdir(parents=True, exist_ok=True)
    (test_results / "report.txt").write_text("ignore", encoding="utf-8")
    return workspace


def test_release_manager_builds_clean_bundle(tmp_path: Path) -> None:
    _seed_project_workspace(tmp_path)
    manager = ReleaseManager(tmp_path)

    release = manager.start_build("train")

    assert release.status == "completed"
    assert release.release_type == "web_demo"
    assert release.download_path is not None
    assert Path(release.download_path).exists()
    assert any(file.role == "primary" and file.path == "index.html" for file in release.included_files)
    assert ".test_lab_server.log" in release.excluded_files
    assert "validation_smoke.sh" in release.excluded_files
    assert "notes_ARTIFACT.md" in release.excluded_files

    with zipfile.ZipFile(release.download_path) as archive:
        names = set(archive.namelist())

    assert "index.html" in names
    assert "main.js" in names
    assert "style.css" in names
    assert "manifest.json" in names
    assert ".test_lab_server.log" not in names
    assert "validation_smoke.sh" not in names
    assert "notes_ARTIFACT.md" not in names
    assert "test-results/report.txt" not in names


def test_release_api_lists_and_downloads_completed_release(tmp_path: Path) -> None:
    _seed_project_workspace(tmp_path, slug="artifact")
    manager = ReleaseManager(tmp_path)
    release = manager.start_build("artifact")

    client = TestClient(create_app(storage_root=tmp_path))

    projects_response = client.get("/api/projects")
    assert projects_response.status_code == 200
    projects_payload = projects_response.json()["projects"]
    artifact_project = next(project for project in projects_payload if project["slug"] == "artifact")
    assert artifact_project["latest_release"]["release_id"] == release.release_id
    assert artifact_project["latest_release"]["status"] == "completed"
    assert artifact_project["latest_release"]["status_label"] == "Ready"
    assert artifact_project["latest_release"]["action_label"] == "Rebuild Release"

    list_response = client.get("/api/releases", params={"project_slug": "artifact"})
    assert list_response.status_code == 200
    releases_payload = list_response.json()["releases"]
    assert len(releases_payload) == 1
    assert releases_payload[0]["release_id"] == release.release_id

    download_response = client.get(f"/api/releases/{release.release_id}/download")
    assert download_response.status_code == 200
    assert download_response.headers["content-type"] == "application/zip"
    assert len(download_response.content) > 0


def test_release_storage_recovers_completed_archive_after_controller_exit(tmp_path: Path) -> None:
    _seed_project_workspace(tmp_path, slug="recover")
    storage = ReleaseStorage(tmp_path)
    release = storage.create_release(project_slug="recover", project_name="Recover")
    release.status = "running"
    release.current_status = "Release Center is copying deliverables into the bundle."
    release.updated_at = release.updated_at - timedelta(minutes=10)
    bundle_dir = storage.bundle_dir(release.release_id)
    (bundle_dir / "manifest.json").write_text("{}", encoding="utf-8")
    archive_path = storage.release_dir(release.release_id) / f"{release.project_slug}-{release.release_id}.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("manifest.json", "{}")
    storage.state_path(release.release_id).write_text(release.model_dump_json(indent=2), encoding="utf-8")

    recovered = storage.load_state(release.release_id)

    assert recovered.status == "completed"
    assert recovered.download_path == str(archive_path)
    assert recovered.current_status == "Release bundle recovered after the packaging controller exited."


def test_release_build_api_starts_detached_release(tmp_path: Path, monkeypatch) -> None:
    _seed_project_workspace(tmp_path, slug="bundle")

    def fake_launch_detached_release(project_slug: str, storage_root: Path) -> DetachedLaunch:
        storage = ReleaseStorage(storage_root)
        state = storage.create_release(
            project_slug=project_slug,
            project_name="Bundle",
            requested_by="operator",
        )
        return DetachedLaunch(
            entity_id=state.release_id,
            pid=42424,
            log_path=storage_root / "launchers" / "fake.release.log",
        )

    monkeypatch.setattr(dashboard_module, "launch_detached_release", fake_launch_detached_release)
    client = TestClient(create_app(storage_root=tmp_path))

    response = client.post("/api/projects/bundle/releases")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "detached"
    release_state = ReleaseStorage(tmp_path).load_state(payload["release_id"])
    assert release_state.controller_pid == 42424
