from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from blacklab_factory.config import repo_root
from blacklab_factory.storage import slugify


@dataclass
class DetachedLaunch:
    entity_id: str
    pid: int
    log_path: Path


def launch_detached_run(
    mission: str,
    project_slug: str | None,
    mode: str,
    pause_between_departments: float,
    max_parallel_departments: int | None,
    active_department_keys: list[str] | None,
    storage_root: Path,
    codex_model: str,
    codex_autonomy: str,
    codex_review_model: str,
    codex_review_autonomy: str,
) -> DetachedLaunch:
    launcher_dir = storage_root / "launchers"
    launcher_dir.mkdir(parents=True, exist_ok=True)

    stamp = time.strftime("%Y%m%dT%H%M%S")
    slug = slugify(mission)[:40]
    handoff_path = launcher_dir / f"{stamp}-{slug}.run-id"
    log_path = launcher_dir / f"{stamp}-{slug}.log"

    command = [
        sys.executable,
        "-m",
        "blacklab_factory.cli",
        "run",
        mission,
        "--mode",
        mode,
        "--storage-root",
        str(storage_root),
        "--run-id-file",
        str(handoff_path),
        "--codex-model",
        codex_model,
        "--codex-autonomy",
        codex_autonomy,
        "--codex-review-model",
        codex_review_model,
        "--codex-review-autonomy",
        codex_review_autonomy,
    ]
    if pause_between_departments > 0:
        command.extend(["--pause-between-departments", str(pause_between_departments)])
    if max_parallel_departments:
        command.extend(["--max-parallel-departments", str(max_parallel_departments)])
    if project_slug:
        command.extend(["--project-slug", project_slug])
    if active_department_keys:
        command.extend(["--active-departments", ",".join(active_department_keys)])

    process = _spawn(command=command, log_path=log_path)
    return DetachedLaunch(
        entity_id=_wait_for_handoff(handoff_path=handoff_path, log_path=log_path, process=process, label="run_id"),
        pid=process.pid,
        log_path=log_path,
    )


def launch_detached_loop(
    objective: str,
    project_slug: str | None,
    run_mode: str,
    loop_mode: str,
    interval_seconds: int,
    max_iterations: int | None,
    pause_between_departments: float,
    max_parallel_departments: int | None,
    active_department_keys: list[str] | None,
    storage_root: Path,
    codex_model: str,
    codex_autonomy: str,
    codex_review_model: str,
    codex_review_autonomy: str,
) -> DetachedLaunch:
    launcher_dir = storage_root / "launchers"
    launcher_dir.mkdir(parents=True, exist_ok=True)

    stamp = time.strftime("%Y%m%dT%H%M%S")
    slug = slugify(objective)[:40]
    handoff_path = launcher_dir / f"{stamp}-{slug}.loop-id"
    log_path = launcher_dir / f"{stamp}-{slug}.autopilot.log"

    command = [
        sys.executable,
        "-m",
        "blacklab_factory.cli",
        "autopilot",
        "start",
        objective,
        "--run-mode",
        run_mode,
        "--loop-mode",
        loop_mode,
        "--storage-root",
        str(storage_root),
        "--loop-id-file",
        str(handoff_path),
        "--codex-model",
        codex_model,
        "--codex-autonomy",
        codex_autonomy,
        "--codex-review-model",
        codex_review_model,
        "--codex-review-autonomy",
        codex_review_autonomy,
        "--interval-seconds",
        str(interval_seconds),
    ]
    if max_iterations is not None:
        command.extend(["--max-iterations", str(max_iterations)])
    if pause_between_departments > 0:
        command.extend(["--pause-between-departments", str(pause_between_departments)])
    if max_parallel_departments:
        command.extend(["--max-parallel-departments", str(max_parallel_departments)])
    if project_slug:
        command.extend(["--project-slug", project_slug])
    if active_department_keys:
        command.extend(["--active-departments", ",".join(active_department_keys)])

    process = _spawn(command=command, log_path=log_path)
    return DetachedLaunch(
        entity_id=_wait_for_handoff(handoff_path=handoff_path, log_path=log_path, process=process, label="loop_id"),
        pid=process.pid,
        log_path=log_path,
    )


def launch_detached_release(
    project_slug: str,
    storage_root: Path,
) -> DetachedLaunch:
    launcher_dir = storage_root / "launchers"
    launcher_dir.mkdir(parents=True, exist_ok=True)

    stamp = time.strftime("%Y%m%dT%H%M%S")
    slug = slugify(project_slug)[:40]
    handoff_path = launcher_dir / f"{stamp}-{slug}.release-id"
    log_path = launcher_dir / f"{stamp}-{slug}.release.log"

    command = [
        sys.executable,
        "-m",
        "blacklab_factory.cli",
        "release",
        "build",
        project_slug,
        "--storage-root",
        str(storage_root),
        "--release-id-file",
        str(handoff_path),
    ]

    process = _spawn(command=command, log_path=log_path)
    return DetachedLaunch(
        entity_id=_wait_for_handoff(handoff_path=handoff_path, log_path=log_path, process=process, label="release_id"),
        pid=process.pid,
        log_path=log_path,
    )


def _spawn(command: list[str], log_path: Path) -> subprocess.Popen:
    with log_path.open("w", encoding="utf-8") as log_handle:
        return subprocess.Popen(
            command,
            cwd=str(repo_root()),
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            text=True,
        )


def _wait_for_handoff(handoff_path: Path, log_path: Path, process: subprocess.Popen, label: str) -> str:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if handoff_path.exists():
            value = handoff_path.read_text(encoding="utf-8").strip()
            if value:
                return value
        if process.poll() is not None:
            break
        time.sleep(0.1)

    log_tail = log_path.read_text(encoding="utf-8")[-2000:] if log_path.exists() else ""
    raise RuntimeError(
        f"Detached launch failed before publishing a {label}."
        f"{' Recent log: ' + log_tail if log_tail else ''}"
    )


def _resolve_process_group_id(pid: int) -> int | None:
    try:
        return os.getpgid(pid)
    except ProcessLookupError:
        return None
    except PermissionError:
        return pid


def terminate_process_group(pid: int, grace_seconds: float = 2.5) -> bool:
    process_group_id = _resolve_process_group_id(pid)
    if process_group_id is None:
        return False

    try:
        os.killpg(process_group_id, signal.SIGTERM)
    except ProcessLookupError:
        return False

    deadline = time.monotonic() + grace_seconds
    while time.monotonic() < deadline:
        if not _is_process_alive(pid):
            return True
        time.sleep(0.1)

    try:
        os.killpg(process_group_id, signal.SIGKILL)
    except ProcessLookupError:
        return True

    deadline = time.monotonic() + 1.0
    while time.monotonic() < deadline:
        if not _is_process_alive(pid):
            return True
        time.sleep(0.05)

    return not _is_process_alive(pid)


def _is_process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
