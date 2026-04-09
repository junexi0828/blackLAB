from __future__ import annotations

import os
import plistlib
import shlex
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from blacklab_factory.config import repo_root
from blacklab_factory.models import (
    DEFAULT_CORE_CODEX_MODEL,
    DEFAULT_REVIEW_CODEX_AUTONOMY,
    DEFAULT_REVIEW_CODEX_MODEL,
)

DEFAULT_DASHBOARD_LABEL = "com.blacklab.dashboard"
DEFAULT_AUTOPILOT_LABEL = "com.blacklab.autopilot"


@dataclass(frozen=True)
class LaunchdServiceSpec:
    label: str
    shell_command: str
    working_directory: Path
    plist_path: Path
    stdout_path: Path
    stderr_path: Path
    keep_alive: bool = True


class LaunchdServiceManager:
    def __init__(self, project_root: Path | None = None, home_path: Path | None = None) -> None:
        self.project_root = (project_root or repo_root()).resolve()
        self.home_path = (home_path or Path.home()).resolve()
        self.launch_agents_dir = self.home_path / "Library" / "LaunchAgents"
        self.log_dir = self.project_root / ".factory" / "launchd"
        self.uv_bin = shutil.which("uv") or "uv"
        self.uid = os.getuid()

    def dashboard_spec(
        self,
        host: str = "127.0.0.1",
        port: int = 8000,
        label: str = DEFAULT_DASHBOARD_LABEL,
    ) -> LaunchdServiceSpec:
        command = self._shell_command(
            f"{shlex.quote(self.uv_bin)} run blacklab dashboard --host {shlex.quote(host)} --port {port}"
        )
        return self._build_spec(label=label, command=command)

    def autopilot_spec(
        self,
        objective: str,
        run_mode: str = "codex",
        loop_mode: str = "always_on",
        interval_seconds: int = 30,
        max_iterations: int | None = None,
        pause_between_departments: float = 0,
        max_parallel_departments: int = 7,
        codex_model: str = DEFAULT_CORE_CODEX_MODEL,
        codex_autonomy: str = "full_auto",
        codex_review_model: str = DEFAULT_REVIEW_CODEX_MODEL,
        codex_review_autonomy: str = DEFAULT_REVIEW_CODEX_AUTONOMY,
        label: str = DEFAULT_AUTOPILOT_LABEL,
    ) -> LaunchdServiceSpec:
        parts = [
            shlex.quote(self.uv_bin),
            "run",
            "blacklab",
            "autopilot",
            "start",
            shlex.quote(objective),
            "--run-mode",
            shlex.quote(run_mode),
            "--loop-mode",
            shlex.quote(loop_mode),
            "--interval-seconds",
            str(interval_seconds),
            "--pause-between-departments",
            str(pause_between_departments),
            "--max-parallel-departments",
            str(max_parallel_departments),
            "--codex-model",
            shlex.quote(codex_model),
            "--codex-autonomy",
            shlex.quote(codex_autonomy),
            "--codex-review-model",
            shlex.quote(codex_review_model),
            "--codex-review-autonomy",
            shlex.quote(codex_review_autonomy),
        ]
        if loop_mode == "full_auto" and max_iterations is not None:
            parts.extend(["--max-iterations", str(max_iterations)])

        command = self._shell_command(" ".join(parts))
        return self._build_spec(label=label, command=command)

    def install(self, spec: LaunchdServiceSpec, start: bool = True) -> Path:
        spec.plist_path.parent.mkdir(parents=True, exist_ok=True)
        spec.stdout_path.parent.mkdir(parents=True, exist_ok=True)
        spec.stderr_path.parent.mkdir(parents=True, exist_ok=True)
        spec.plist_path.write_bytes(self.render_plist(spec))
        if start:
            self._launchctl("bootout", f"gui/{self.uid}", str(spec.plist_path), check=False)
            self._launchctl("bootstrap", f"gui/{self.uid}", str(spec.plist_path))
            self._launchctl("kickstart", "-k", f"gui/{self.uid}/{spec.label}", check=False)
        return spec.plist_path

    def uninstall(self, label: str, stop: bool = True) -> Path:
        spec = self._build_spec(label=label, command="true")
        if stop and spec.plist_path.exists():
            self._launchctl("bootout", f"gui/{self.uid}", str(spec.plist_path), check=False)
        if spec.plist_path.exists():
            spec.plist_path.unlink()
        return spec.plist_path

    def status(self, label: str) -> dict[str, str | bool]:
        spec = self._build_spec(label=label, command="true")
        proc = self._launchctl("print", f"gui/{self.uid}/{label}", check=False)
        return {
            "label": label,
            "installed": spec.plist_path.exists(),
            "loaded": proc.returncode == 0,
            "plist_path": str(spec.plist_path),
        }

    def render_plist(self, spec: LaunchdServiceSpec) -> bytes:
        payload = {
            "Label": spec.label,
            "ProgramArguments": ["/bin/zsh", "-lc", spec.shell_command],
            "WorkingDirectory": str(spec.working_directory),
            "RunAtLoad": True,
            "KeepAlive": spec.keep_alive,
            "StandardOutPath": str(spec.stdout_path),
            "StandardErrorPath": str(spec.stderr_path),
            "EnvironmentVariables": {
                "PATH": os.environ.get("PATH", ""),
            },
        }
        return plistlib.dumps(payload, sort_keys=False)

    def _build_spec(self, label: str, command: str) -> LaunchdServiceSpec:
        return LaunchdServiceSpec(
            label=label,
            shell_command=command,
            working_directory=self.project_root,
            plist_path=self.launch_agents_dir / f"{label}.plist",
            stdout_path=self.log_dir / f"{label}.out.log",
            stderr_path=self.log_dir / f"{label}.err.log",
        )

    def _shell_command(self, inner_command: str) -> str:
        return f"cd {shlex.quote(str(self.project_root))} && {inner_command}"

    def _launchctl(self, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["launchctl", *args],
            check=check,
            capture_output=True,
            text=True,
        )
