from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import Path

from blacklab_factory.models import ReleaseFileRecord, ReleaseState
from blacklab_factory.storage import ProjectStorage, ReleaseStorage


EXCLUDED_DIR_NAMES = {
    "__pycache__",
    ".git",
    "node_modules",
    "test-results",
}

EXCLUDED_FILE_PATTERNS = (
    ".*",
    "*.log",
    "*_ARTIFACT.md",
    "*_department.md",
    "*_PROOF.*",
    "*.spec.js",
    "validation_smoke.sh",
)

PRIMARY_KIND_BY_SUFFIX = {
    ".html": "web_demo",
    ".pdf": "report_pdf",
    ".pptx": "presentation",
    ".ppt": "presentation",
    ".docx": "document",
    ".xlsx": "spreadsheet",
    ".csv": "dataset",
    ".png": "image_asset",
    ".jpg": "image_asset",
    ".jpeg": "image_asset",
    ".svg": "image_asset",
    ".zip": "archive",
}


@dataclass
class ReleaseSelection:
    included: list[Path]
    excluded: list[str]


class ReleaseManager:
    def __init__(self, storage_root: Path) -> None:
        self.storage_root = storage_root
        self.project_storage = ProjectStorage(storage_root)
        self.release_storage = ReleaseStorage(storage_root)

    def start_build(
        self,
        project_slug: str,
        *,
        requested_by: str = "operator",
        source_run_id: str | None = None,
        on_release_created=None,
    ) -> ReleaseState:
        record = self.project_storage.get_project(project_slug)
        if record is None:
            raise FileNotFoundError(f"Project {project_slug} not found.")

        release_state = self.release_storage.create_release(
            project_slug=record.slug,
            project_name=record.name or record.slug.replace("-", " ").title(),
            requested_by=requested_by,
            source_run_id=source_run_id or record.last_run_id,
        )
        if on_release_created is not None:
            on_release_created(release_state)

        release_state.status = "running"
        release_state.current_status = "Release Center is collecting final delivery files."
        release_state.next_action = "Inspect the shared workspace and assemble a clean release bundle."
        self.release_storage.save_state(release_state)
        self.release_storage.append_log(release_state.release_id, f"Release packaging started for project {record.slug}.")

        try:
            return self._build_release(release_state)
        except Exception as exc:
            release_state.status = "failed"
            release_state.current_status = "Release packaging failed."
            release_state.next_action = "Inspect the release log and start a fresh release build."
            release_state.summary = str(exc)
            self.release_storage.save_state(release_state)
            self.release_storage.append_log(release_state.release_id, f"Release packaging failed: {exc}")
            return release_state

    def _build_release(self, state: ReleaseState) -> ReleaseState:
        workspace_dir = self.project_storage.workspace_dir(state.project_slug)
        selection = select_release_files(workspace_dir)
        if not selection.included:
            raise RuntimeError("No deliverable files were found in the project workspace.")

        release_dir = self.release_storage.release_dir(state.release_id)
        bundle_dir = self.release_storage.bundle_dir(state.release_id)
        _reset_directory(bundle_dir)

        state.current_status = "Release Center is copying deliverables into the bundle."
        state.next_action = "Normalize the folder structure and prepare the downloadable archive."
        state.excluded_files = selection.excluded
        self.release_storage.save_state(state)

        copied_files: list[ReleaseFileRecord] = []
        for source_path in selection.included:
            relative_path = source_path.relative_to(workspace_dir)
            destination_path = bundle_dir / relative_path
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, destination_path)
            copied_files.append(
                ReleaseFileRecord(
                    path=str(relative_path),
                    size_bytes=destination_path.stat().st_size,
                    role="support",
                )
            )

        release_type, primary_path = determine_release_type(bundle_dir, copied_files)
        for file_record in copied_files:
            if file_record.path == primary_path:
                file_record.role = "primary"

        manifest = {
            "release_id": state.release_id,
            "project_slug": state.project_slug,
            "project_name": state.project_name,
            "release_type": release_type,
            "primary_path": primary_path,
            "source_run_id": state.source_run_id,
            "generated_at": state.updated_at.isoformat(),
            "requested_by": state.requested_by,
            "files": [file.model_dump(mode="json") for file in copied_files],
            "excluded_files": selection.excluded,
        }
        manifest_path = bundle_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        copied_files.append(
            ReleaseFileRecord(
                path=manifest_path.relative_to(bundle_dir).as_posix(),
                size_bytes=manifest_path.stat().st_size,
                role="manifest",
            )
        )

        archive_base = release_dir / f"{state.project_slug}-{state.release_id}"
        archive_path = Path(shutil.make_archive(str(archive_base), "zip", root_dir=bundle_dir))
        copied_files.append(
            ReleaseFileRecord(
                path=archive_path.name,
                size_bytes=archive_path.stat().st_size,
                role="archive",
            )
        )

        state.status = "completed"
        state.release_type = release_type
        state.current_status = "Release bundle is ready for download."
        state.next_action = "Download the latest package from the Release Center."
        state.summary = f"Packaged {len(selection.included)} deliverable files into a {release_type.replace('_', ' ')} bundle."
        state.bundle_root = str(bundle_dir)
        state.manifest_path = str(manifest_path)
        state.download_path = str(archive_path)
        state.included_files = copied_files
        self.release_storage.save_state(state)
        self.release_storage.append_log(
            state.release_id,
            f"Release bundle completed: {archive_path.name} ({release_type}).",
        )
        return state


def select_release_files(workspace_dir: Path) -> ReleaseSelection:
    included: list[Path] = []
    excluded: list[str] = []

    for path in sorted(workspace_dir.rglob("*")):
        relative = path.relative_to(workspace_dir)
        if path.is_dir():
            if any(part in EXCLUDED_DIR_NAMES for part in relative.parts):
                excluded.append(str(relative))
            continue
        if should_exclude_file(relative):
            excluded.append(str(relative))
            continue
        included.append(path)

    return ReleaseSelection(included=included, excluded=excluded)


def should_exclude_file(relative_path: Path) -> bool:
    if any(part in EXCLUDED_DIR_NAMES for part in relative_path.parts[:-1]):
        return True
    name = relative_path.name
    for pattern in EXCLUDED_FILE_PATTERNS:
        if fnmatch(name, pattern):
            return True
    return False


def determine_release_type(bundle_dir: Path, copied_files: list[ReleaseFileRecord]) -> tuple[str, str | None]:
    bundled_paths = [bundle_dir / file.path for file in copied_files if file.role == "support"]

    index_path = bundle_dir / "index.html"
    if index_path.exists():
        return "web_demo", "index.html"

    ranked = sorted(
        bundled_paths,
        key=lambda path: (
            0 if path.suffix.lower() in PRIMARY_KIND_BY_SUFFIX else 1,
            path.name,
        ),
    )
    if not ranked:
        return "bundle", None

    primary = ranked[0]
    release_type = PRIMARY_KIND_BY_SUFFIX.get(primary.suffix.lower(), "bundle")
    return release_type, str(primary.relative_to(bundle_dir))


def _reset_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)
