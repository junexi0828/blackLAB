from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass, field
from fnmatch import fnmatch
from pathlib import Path
from urllib.parse import urlparse, unquote

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

TEXT_VALIDATION_SUFFIXES = {
    ".css",
    ".csv",
    ".html",
    ".htm",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".svg",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}

HTML_REFERENCE_PATTERNS = (
    re.compile(r"<script[^>]+src=[\"']([^\"']+)[\"']", re.IGNORECASE),
    re.compile(r"<link[^>]+href=[\"']([^\"']+)[\"']", re.IGNORECASE),
    re.compile(r"<img[^>]+src=[\"']([^\"']+)[\"']", re.IGNORECASE),
    re.compile(r"<source[^>]+src=[\"']([^\"']+)[\"']", re.IGNORECASE),
)
CSS_URL_PATTERN = re.compile(r"url\(([^)]+)\)", re.IGNORECASE)
JS_IMPORT_PATTERN = re.compile(
    r"""(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']""",
    re.IGNORECASE,
)
MARKDOWN_REFERENCE_PATTERN = re.compile(r"""!?\[[^\]]*\]\(([^)]+)\)""")
WINDOWS_ABSOLUTE_PATH_PATTERN = re.compile(r"\b[A-Za-z]:\\")
PACKAGE_HANDOFF_SECTION_PATTERN = re.compile(
    r"(?ms)^##\s+Package Handoff\s*$\n(.*?)(?=^##\s+|\Z)"
)
PACKAGE_HANDOFF_BLOCK_PATTERN = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


@dataclass
class ReleaseSelection:
    included: list[Path]
    excluded: list[str]


@dataclass
class PackageHandoff:
    delivery_type: str | None = None
    primary_path: str | None = None
    launch_instructions: str | None = None
    validation_target: str | None = None
    must_include: list[str] = field(default_factory=list)
    allowed_external_dependencies: list[str] = field(default_factory=list)
    forbidden_local_dependencies: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    extras: dict[str, object] = field(default_factory=dict)

    @classmethod
    def from_payload(cls, payload: object) -> PackageHandoff:
        if not isinstance(payload, dict):
            raise RuntimeError("Package Handoff must be a JSON object.")
        known_keys = {
            "delivery_type",
            "primary_path",
            "launch_instructions",
            "validation_target",
            "must_include",
            "allowed_external_dependencies",
            "forbidden_local_dependencies",
            "notes",
        }
        extras = {key: value for key, value in payload.items() if key not in known_keys}
        return cls(
            delivery_type=_normalize_optional_string(payload.get("delivery_type")),
            primary_path=_normalize_relative_path(payload.get("primary_path")),
            launch_instructions=_normalize_optional_string(payload.get("launch_instructions")),
            validation_target=_normalize_optional_string(payload.get("validation_target")),
            must_include=_normalize_path_list(payload.get("must_include")),
            allowed_external_dependencies=_normalize_string_list(payload.get("allowed_external_dependencies")),
            forbidden_local_dependencies=_normalize_string_list(payload.get("forbidden_local_dependencies")),
            notes=_normalize_string_list(payload.get("notes")),
            extras=extras,
        )

    def to_manifest_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "delivery_type": self.delivery_type,
            "primary_path": self.primary_path,
            "launch_instructions": self.launch_instructions,
            "validation_target": self.validation_target,
            "must_include": self.must_include,
            "allowed_external_dependencies": self.allowed_external_dependencies,
            "forbidden_local_dependencies": self.forbidden_local_dependencies,
            "notes": self.notes,
        }
        payload.update(self.extras)
        return payload


@dataclass
class PackageHandoffLoad:
    handoff: PackageHandoff | None
    source_name: str | None = None
    source_path: Path | None = None
    freshness: str = "missing"
    warning: str | None = None

    @property
    def effective_handoff(self) -> PackageHandoff | None:
        if self.freshness == "stale":
            return None
        return self.handoff


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
        if record.status == "archived":
            raise RuntimeError("Archived project must be restored before Release Center can package it.")

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
        package_handoff_load = load_package_handoff(
            self.project_storage,
            state.project_slug,
        )
        selection = select_release_files(workspace_dir)
        if not selection.included:
            raise RuntimeError("No deliverable files were found in the project workspace.")
        package_handoff_load = assess_package_handoff_freshness(
            package_handoff_load=package_handoff_load,
            included_files=selection.included,
            workspace_dir=workspace_dir,
        )
        if package_handoff_load.warning:
            self.release_storage.append_log(state.release_id, package_handoff_load.warning)
        validate_release_selection(
            selection=selection,
            workspace_dir=workspace_dir,
            package_handoff=package_handoff_load.effective_handoff,
        )

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

        release_type, primary_path = determine_release_type(
            bundle_dir,
            copied_files,
            package_handoff=package_handoff_load.effective_handoff,
        )
        validate_bundle_contents(
            bundle_dir=bundle_dir,
            primary_path=primary_path,
            package_handoff=package_handoff_load.effective_handoff,
            workspace_dir=workspace_dir,
            project_dir=self.project_storage.project_dir(state.project_slug),
        )
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
            "package_handoff": package_handoff_load.handoff.to_manifest_dict() if package_handoff_load.handoff else None,
            "package_handoff_source": package_handoff_load.source_name,
            "package_handoff_freshness": package_handoff_load.freshness,
            "package_handoff_warning": package_handoff_load.warning,
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


def load_package_handoff(
    project_storage: ProjectStorage,
    project_slug: str,
) -> PackageHandoffLoad:
    sources = (
        ("current.md", project_storage.live_context_path(project_slug), project_storage.read_live_context(project_slug)),
        ("project.md", project_storage.context_path(project_slug), project_storage.read_context(project_slug)),
    )
    for source_name, source_path, content in sources:
        if not content.strip():
            continue
        handoff = parse_package_handoff(content)
        if handoff is not None:
            return PackageHandoffLoad(
                handoff=handoff,
                source_name=source_name,
                source_path=source_path,
                freshness="fresh",
            )
    return PackageHandoffLoad(handoff=None)


def assess_package_handoff_freshness(
    *,
    package_handoff_load: PackageHandoffLoad,
    included_files: list[Path],
    workspace_dir: Path,
) -> PackageHandoffLoad:
    if package_handoff_load.handoff is None or package_handoff_load.source_path is None:
        return package_handoff_load
    if not package_handoff_load.source_path.exists():
        package_handoff_load.freshness = "stale"
        package_handoff_load.warning = (
            f"Package Handoff source `{package_handoff_load.source_name}` is missing, so release packaging ignored it."
        )
        return package_handoff_load
    if not included_files:
        package_handoff_load.freshness = "fresh"
        return package_handoff_load

    source_mtime = package_handoff_load.source_path.stat().st_mtime
    latest_included = max(included_files, key=lambda path: path.stat().st_mtime)
    latest_mtime = latest_included.stat().st_mtime
    if latest_mtime <= source_mtime + 1.0:
        package_handoff_load.freshness = "fresh"
        return package_handoff_load

    package_handoff_load.freshness = "stale"
    package_handoff_load.warning = (
        "Workspace files are newer than the latest Package Handoff, so release packaging ignored the stale handoff "
        f"from `{package_handoff_load.source_name}`. Newer file: `{latest_included.relative_to(workspace_dir).as_posix()}`."
    )
    return package_handoff_load


def parse_package_handoff(markdown: str) -> PackageHandoff | None:
    section_match = PACKAGE_HANDOFF_SECTION_PATTERN.search(markdown)
    if section_match is None:
        return None
    block_match = PACKAGE_HANDOFF_BLOCK_PATTERN.search(section_match.group(1))
    if block_match is None:
        raise RuntimeError("Package Handoff must contain a fenced JSON object.")
    try:
        payload = json.loads(block_match.group(1))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Package Handoff JSON is invalid: {exc.msg}") from exc
    return PackageHandoff.from_payload(payload)


def determine_release_type(
    bundle_dir: Path,
    copied_files: list[ReleaseFileRecord],
    *,
    package_handoff: PackageHandoff | None = None,
) -> tuple[str, str | None]:
    if package_handoff and package_handoff.primary_path:
        primary_path = package_handoff.primary_path
        if not (bundle_dir / primary_path).exists():
            raise RuntimeError(f"Package Handoff primary_path `{primary_path}` was not found in the bundle.")
        release_type = package_handoff.delivery_type or PRIMARY_KIND_BY_SUFFIX.get(
            Path(primary_path).suffix.lower(),
            "bundle",
        )
        return release_type, primary_path

    bundled_paths = [bundle_dir / file.path for file in copied_files if file.role == "support"]

    index_path = bundle_dir / "index.html"
    if index_path.exists():
        release_type = package_handoff.delivery_type if package_handoff else "web_demo"
        return release_type or "web_demo", "index.html"

    ranked = sorted(
        bundled_paths,
        key=lambda path: (
            0 if path.suffix.lower() in PRIMARY_KIND_BY_SUFFIX else 1,
            path.name,
        ),
    )
    if not ranked:
        return package_handoff.delivery_type if package_handoff else "bundle", None

    primary = ranked[0]
    inferred_release_type = PRIMARY_KIND_BY_SUFFIX.get(primary.suffix.lower(), "bundle")
    release_type = package_handoff.delivery_type if package_handoff else inferred_release_type
    return release_type, str(primary.relative_to(bundle_dir))


def validate_release_selection(
    *,
    selection: ReleaseSelection,
    workspace_dir: Path,
    package_handoff: PackageHandoff | None,
) -> None:
    if package_handoff is None:
        return
    included_paths = {
        source_path.relative_to(workspace_dir).as_posix()
        for source_path in selection.included
    }
    required_paths = []
    if package_handoff.primary_path:
        required_paths.append(package_handoff.primary_path)
    required_paths.extend(package_handoff.must_include)
    for relative_path in _unique_strings(required_paths):
        source_path = workspace_dir / relative_path
        if relative_path in included_paths:
            continue
        if source_path.exists():
            raise RuntimeError(
                f"Package Handoff requires `{relative_path}` but the current release rules excluded it."
            )
        raise RuntimeError(
            f"Package Handoff requires missing file `{relative_path}` in the project workspace."
        )


def validate_bundle_contents(
    *,
    bundle_dir: Path,
    primary_path: str | None,
    package_handoff: PackageHandoff | None,
    workspace_dir: Path,
    project_dir: Path,
) -> None:
    if primary_path and not (bundle_dir / primary_path).exists():
        raise RuntimeError(f"Release bundle primary_path `{primary_path}` does not exist.")

    for file_path in sorted(bundle_dir.rglob("*")):
        if not file_path.is_file() or file_path.suffix.lower() not in TEXT_VALIDATION_SUFFIXES:
            continue
        try:
            text = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        local_leaks = find_local_path_leaks(
            text=text,
            workspace_dir=workspace_dir,
            project_dir=project_dir,
        )
        if local_leaks:
            rel_path = file_path.relative_to(bundle_dir).as_posix()
            raise RuntimeError(
                f"Release bundle leaked local path dependency in `{rel_path}`: {', '.join(local_leaks[:3])}"
            )
        missing_refs = find_missing_local_references(
            bundle_dir=bundle_dir,
            file_path=file_path,
            text=text,
            package_handoff=package_handoff,
        )
        if missing_refs:
            rel_path = file_path.relative_to(bundle_dir).as_posix()
            raise RuntimeError(
                f"Release bundle references missing local file(s) from `{rel_path}`: {', '.join(missing_refs[:3])}"
            )


def find_local_path_leaks(
    *,
    text: str,
    workspace_dir: Path,
    project_dir: Path,
) -> list[str]:
    markers = [
        workspace_dir.resolve().as_posix(),
        project_dir.resolve().as_posix(),
        "file://",
        "/Users/",
    ]
    leaks = [marker for marker in _unique_strings(markers) if marker and marker in text]
    if WINDOWS_ABSOLUTE_PATH_PATTERN.search(text):
        leaks.append("windows-absolute-path")
    return _unique_strings(leaks)


def find_missing_local_references(
    *,
    bundle_dir: Path,
    file_path: Path,
    text: str,
    package_handoff: PackageHandoff | None,
) -> list[str]:
    missing: list[str] = []
    for reference in extract_local_references(file_path=file_path, text=text):
        if is_allowed_external_reference(reference=reference, package_handoff=package_handoff):
            continue
        target = resolve_local_reference(bundle_dir=bundle_dir, file_path=file_path, reference=reference)
        if target is None or target.exists():
            continue
        missing.append(reference)
    return _unique_strings(missing)


def extract_local_references(*, file_path: Path, text: str) -> list[str]:
    suffix = file_path.suffix.lower()
    references: list[str] = []

    if suffix in {".html", ".htm"}:
        for pattern in HTML_REFERENCE_PATTERNS:
            references.extend(match.group(1) for match in pattern.finditer(text))
    if suffix == ".css":
        references.extend(match.group(1) for match in CSS_URL_PATTERN.finditer(text))
    if suffix in {".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"}:
        for match in JS_IMPORT_PATTERN.finditer(text):
            candidate = match.group(1).strip()
            if candidate.startswith(("./", "../", "/")):
                references.append(candidate)
    if suffix == ".md":
        references.extend(match.group(1) for match in MARKDOWN_REFERENCE_PATTERN.finditer(text))

    return [
        candidate
        for candidate in references
        if is_local_package_reference(candidate)
    ]


def resolve_local_reference(*, bundle_dir: Path, file_path: Path, reference: str) -> Path | None:
    parsed = urlparse(reference)
    normalized = unquote(parsed.path.strip())
    if not normalized:
        return None
    if normalized.startswith("/"):
        return bundle_dir / normalized.lstrip("/")
    return file_path.parent / normalized


def is_local_package_reference(reference: str) -> bool:
    candidate = reference.strip().strip("\"' ")
    if not candidate:
        return False
    parsed = urlparse(candidate)
    if parsed.scheme or candidate.startswith(("//", "#")):
        return False
    return True


def is_allowed_external_reference(
    *,
    reference: str,
    package_handoff: PackageHandoff | None,
) -> bool:
    candidate = reference.strip().strip("\"' ")
    if not candidate:
        return False
    if is_probable_runtime_route(candidate):
        return True
    if package_handoff is None:
        return False
    for allowed in package_handoff.allowed_external_dependencies:
        rule = allowed.strip()
        if not rule:
            continue
        if candidate == rule:
            return True
        if rule.endswith("/") and candidate.startswith(rule):
            return True
        if candidate.startswith(rule):
            return True
    return False


def is_probable_runtime_route(reference: str) -> bool:
    parsed = urlparse(reference)
    path = unquote(parsed.path.strip())
    if not path.startswith("/"):
        return False
    last_segment = path.rstrip("/").split("/")[-1]
    if not last_segment:
        return True
    return "." not in last_segment


def _normalize_optional_string(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_string_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return _unique_strings(str(item).strip() for item in value if str(item).strip())
    text = str(value).strip()
    return [text] if text else []


def _normalize_path_list(value: object) -> list[str]:
    return _unique_strings(_normalize_relative_path(item) for item in _normalize_string_list(value) if item)


def _normalize_relative_path(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip().replace("\\", "/")
    if not text:
        return None
    if text.startswith("/"):
        raise RuntimeError("Package Handoff paths must stay inside the package root and cannot be absolute.")
    if WINDOWS_ABSOLUTE_PATH_PATTERN.match(text):
        raise RuntimeError("Package Handoff paths must stay inside the package root and cannot use drive-letter absolute paths.")

    parts: list[str] = []
    for raw_part in text.split("/"):
        part = raw_part.strip()
        if not part or part == ".":
            continue
        if part == "..":
            if not parts:
                raise RuntimeError("Package Handoff paths must not escape above the package root.")
            parts.pop()
            continue
        parts.append(part)

    normalized = "/".join(parts).strip()
    return normalized or None


def _unique_strings(values) -> list[str]:
    ordered: list[str] = []
    for value in values:
        if not value:
            continue
        if value not in ordered:
            ordered.append(value)
    return ordered


def _reset_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)
