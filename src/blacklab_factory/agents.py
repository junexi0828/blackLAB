from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from blacklab_factory.models import (
    CodexAutonomyMode,
    CodexRuntimeTier,
    CompanyConfig,
    DepartmentConfig,
    RunMode,
    RunSettings,
    RunState,
)


@dataclass
class DepartmentResult:
    summary: str
    artifact_body: str
    risks: list[str]
    next_action: str


@dataclass
class DepartmentRunHooks:
    on_status: Callable[[str], None] | None = None
    on_process_start: Callable[[int, str], None] | None = None
    on_process_finish: Callable[[int, int], None] | None = None
    on_log: Callable[[str], None] | None = None


@dataclass(frozen=True)
class CodexRuntimeProfile:
    tier: CodexRuntimeTier
    model: str
    autonomy: CodexAutonomyMode


class DepartmentAgent:
    def run(
        self,
        company: CompanyConfig,
        department: DepartmentConfig,
        state: RunState,
        hooks: DepartmentRunHooks | None = None,
        workspace_path: Path | None = None,
        project_context: str = "",
        directive_context: str = "",
    ) -> DepartmentResult:
        raise NotImplementedError


class MockDepartmentAgent(DepartmentAgent):
    def run(
        self,
        company: CompanyConfig,
        department: DepartmentConfig,
        state: RunState,
        hooks: DepartmentRunHooks | None = None,
        workspace_path: Path | None = None,
        project_context: str = "",
        directive_context: str = "",
    ) -> DepartmentResult:
        if hooks and hooks.on_log:
            hooks.on_log(f"{department.label}: generating deterministic mock artifact.")
        completed = [step.department_label for step in state.steps if step.status == "completed"]
        context_line = ", ".join(completed) if completed else "none"
        project_snapshot = project_context.strip()
        project_lines = (
            [
                "## Project Context Snapshot",
                project_snapshot,
                "",
            ]
            if project_snapshot
            else []
        )
        directive_snapshot = directive_context.strip()
        directive_lines = (
            [
                "## Operator Directives",
                directive_snapshot,
                "",
            ]
            if directive_snapshot
            else []
        )
        if department.key == "board_review":
            package_handoff = {
                "delivery_type": None,
                "primary_path": None,
                "must_include": [],
                "launch_instructions": None,
                "validation_target": None,
                "allowed_external_dependencies": [],
                "forbidden_local_dependencies": [
                    "machine-specific absolute paths",
                    "undeclared files outside the extracted package root",
                ],
                "notes": [
                    "Update this handoff before manual release packaging when a concrete delivery surface exists."
                ],
            }
            summary = f"{department.label} consolidated the company plan for: {state.mission}"
            body = "\n".join(
                [
                    f"# {department.output_title}",
                    "",
                    "## Mission",
                    state.mission,
                    "",
                    *project_lines,
                    *directive_lines,
                    "## Company Thesis",
                    "- Build the narrowest profitable wedge first, then expand only after proving retention.",
                    "",
                    "## Cross-Department Alignment",
                    f"- Reviewed departments: {context_line}.",
                    "- Keep pricing, scope, distribution, and delivery tied to one measurable customer outcome.",
                    "",
                    "## Contradictions To Resolve",
                    "- Validate whether distribution assumptions match the delivery capacity across the dev team plans.",
                    "- Tighten the handoff between product scope and pricing before launch.",
                    "",
                    "## Quality Gates",
                    "- A paying customer segment is named.",
                    "- A launch wedge and pricing hypothesis are both explicit.",
                    "- A 14-day execution sequence exists.",
                    "",
                    "## Immediate Actions",
                    "- Use this briefing as the operating document for the next run or human review.",
                    "- Reject any department artifact that cannot be tied to revenue within the first launch cycle.",
                    "",
                    "## Package Handoff",
                    "```json",
                    json.dumps(package_handoff, ensure_ascii=False, indent=2),
                    "```",
                ]
            )
            risks = [
                "Cross-department assumptions may still conflict under real customer feedback.",
                "The operating brief still needs validation against live demand signals.",
            ]
            next_action = "Inspect the Operator Briefing and decide whether to run another execution cycle."
            return DepartmentResult(summary=summary, artifact_body=body, risks=risks, next_action=next_action)

        if department.runtime_tier == "review":
            summary = f"{department.label} checked the company packet for: {state.mission}"
            body = "\n".join(
                [
                    f"# {department.output_title}",
                    "",
                    "## Mission",
                    state.mission,
                    "",
                    *project_lines,
                    *directive_lines,
                    "## Review Lens",
                    department.purpose,
                    "",
                    "## Findings",
                    f"- Reviewed departments: {context_line}.",
                    "- Revenue logic is present, but proof quality still depends on live customer signals.",
                    "",
                    "## Contradictions",
                    "- Validate that launch scope matches the actual development and support capacity.",
                    "- Confirm that pricing and rollout promises can be executed within the first customer cohort.",
                    "",
                    "## Quality Gates",
                    "- A measurable wedge exists.",
                    "- A launch sequence is explicit.",
                    "- Risks are concrete enough to hand to an operator.",
                    "",
                    "## Immediate Actions",
                    f"- Hand the {department.label} findings into Board Review.",
                ]
            )
            risks = [
                "Review-stage contradictions still need confirmation against real execution evidence.",
                "The current packet may overstate launch readiness without live user validation.",
            ]
            next_action = f"Fold {department.label} findings into the final operator briefing."
            return DepartmentResult(summary=summary, artifact_body=body, risks=risks, next_action=next_action)

        summary = f"{department.label} framed a profit-first move for: {state.mission}"
        body = "\n".join(
            [
                f"# {department.output_title}",
                "",
                "## Mission",
                state.mission,
                "",
                *project_lines,
                *directive_lines,
                "## Department Goal",
                department.purpose,
                "",
                "## Inputs Seen So Far",
                f"Completed departments: {context_line}.",
                "",
                "## Decision",
                f"- Primary angle: build a narrow wedge with fast validation owned by {department.label}.",
                f"- Company style: {company.mission_style}.",
                "",
                "## Revenue Logic",
                "- Prioritize recurring revenue over one-off service work.",
                "- Push toward a measurable workflow outcome the customer already budgets for.",
                "",
                "## Immediate Actions",
                f"- {department.label} should hand off a tighter execution packet to the next department.",
                "- Preserve all assumptions in writing so the dashboard shows why the company is moving.",
            ]
        )
        risks = [
            "Customer willingness to pay is still assumption-heavy.",
            "Distribution channel is not yet validated with real demand signals.",
        ]
        next_action = f"Hand off {department.label} output to the next department."
        return DepartmentResult(summary=summary, artifact_body=body, risks=risks, next_action=next_action)


class OpenAIDepartmentAgent(DepartmentAgent):
    def __init__(self) -> None:
        try:
            from agents import Agent, Runner
        except ImportError as exc:  # pragma: no cover - runtime-only guard
            raise RuntimeError(
                "openai mode requires the optional dependency set. Run `uv sync --extra openai`."
            ) from exc
        self._agent_cls = Agent
        self._runner = Runner

    def run(
        self,
        company: CompanyConfig,
        department: DepartmentConfig,
        state: RunState,
        hooks: DepartmentRunHooks | None = None,
        workspace_path: Path | None = None,
        project_context: str = "",
        directive_context: str = "",
    ) -> DepartmentResult:
        prior_summaries = "\n".join(
            f"- {step.department_label}: {step.summary}"
            for step in state.steps
            if step.summary
        ) or "- No prior summaries yet."
        workspace_note = (
            f"Workspace boundary: Use only {workspace_path} for any files or outputs."
            if workspace_path
            else ""
        )
        project_block = project_context.strip() + "\n\n" if project_context.strip() else ""
        directive_block = (
            "Operator directives:\n"
            f"{directive_context.strip()}\n\n"
            if directive_context.strip()
            else ""
        )
        package_handoff_requirement = (
            "\nIf you are the final board review, append a `## Package Handoff` section with a fenced JSON object "
            "containing delivery_type, primary_path, must_include, launch_instructions, validation_target, "
            "allowed_external_dependencies, forbidden_local_dependencies, and notes.\n"
            if department.key == "board_review"
            else ""
        )
        prompt = "\n".join(
            [
                project_block.rstrip(),
                directive_block.rstrip(),
                f"You are the {department.label} inside {company.company_name}.",
                f"Mission style: {company.mission_style}.",
                f"Department purpose: {department.purpose}",
                f"Mission: {state.mission}",
                "",
                "Prior department summaries:",
                prior_summaries,
                "",
                workspace_note,
                "",
                "Return plain markdown with these sections:",
                "1. Executive Summary",
                "2. Decision",
                "3. Revenue Logic",
                "4. Risks",
                "5. Next Action",
                "",
                package_handoff_requirement.rstrip(),
                "Keep it concrete and execution-oriented.",
            ]
        )
        agent = self._agent_cls(
            name=department.label,
            instructions=(
                "You are one department in an autonomous AI company. "
                "Make sharp decisions, write concise operating documents, and optimize for profitability."
            ),
        )
        result = self._runner.run_sync(agent, prompt)
        content = str(result.final_output).strip()
        lines = [line.strip("- ").strip() for line in content.splitlines() if line.strip()]
        summary = lines[1] if len(lines) > 1 else f"{department.label} completed its packet."
        risks = [line for line in lines if line.lower().startswith("risk")]
        if not risks:
            risks = ["OpenAI output did not isolate risks; inspect artifact for details."]
        next_action = f"Review {department.label} artifact and continue the pipeline."
        return DepartmentResult(summary=summary, artifact_body=content, risks=risks[:3], next_action=next_action)


class CodexDepartmentAgent(DepartmentAgent):
    def __init__(self, codex_bin: str = "codex") -> None:
        self.codex_bin = codex_bin

    def _resolve_codex_bin(self) -> str:
        explicit_override = os.environ.get("BLACKLAB_CODEX_BIN") or os.environ.get("CODEX_BIN")
        candidate = explicit_override or self.codex_bin

        if Path(candidate).expanduser().exists():
            resolved = str(Path(candidate).expanduser().resolve())
            if os.access(resolved, os.X_OK):
                return resolved

        discovered = shutil.which(candidate)
        if discovered:
            return discovered

        fallback_candidates = [
            "/opt/homebrew/bin/codex",
            "/usr/local/bin/codex",
            str(Path.home() / ".local" / "bin" / "codex"),
        ]
        for fallback in fallback_candidates:
            if Path(fallback).exists() and os.access(fallback, os.X_OK):
                return fallback

        path_value = os.environ.get("PATH", "")
        raise RuntimeError(
            "Codex CLI was not found. Install `codex`, add it to PATH, or set "
            "`BLACKLAB_CODEX_BIN` to the executable path. "
            f"PATH={path_value}"
        )

    def run(
        self,
        company: CompanyConfig,
        department: DepartmentConfig,
        state: RunState,
        hooks: DepartmentRunHooks | None = None,
        workspace_path: Path | None = None,
        project_context: str = "",
        directive_context: str = "",
    ) -> DepartmentResult:
        schema = {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "artifact_body": {"type": "string"},
                "risks": {"type": "array", "items": {"type": "string"}},
                "next_action": {"type": "string"},
            },
            "required": ["summary", "artifact_body", "risks", "next_action"],
            "additionalProperties": False,
        }

        # Each run gets its own isolated workspace so AI-generated files
        # never pollute the main blackLAB source tree.
        effective_workspace = workspace_path or Path(tempfile.mkdtemp(prefix="blacklab-ws-"))
        effective_workspace.mkdir(parents=True, exist_ok=True)

        prompt = self._build_prompt(
            company=company,
            department=department,
            state=state,
            workspace_path=effective_workspace,
            project_context=project_context,
            directive_context=directive_context,
        )
        runtime_profile = self._resolve_runtime_profile(department=department, settings=state.settings)
        max_attempts = max(1, company.codex_retry_attempts + 1)
        payload: dict | None = None
        last_error: RuntimeError | None = None

        for attempt in range(1, max_attempts + 1):
            if hooks and hooks.on_log:
                hooks.on_log(
                    f"{department.label}: codex attempt {attempt}/{max_attempts} "
                    f"using {runtime_profile.tier} profile. "
                    f"workspace={effective_workspace}"
                )
            try:
                payload = self._run_codex(
                    prompt=prompt,
                    schema=schema,
                    department_label=department.label,
                    runtime_profile=runtime_profile,
                    idle_timeout_seconds=company.effective_codex_worker_idle_timeout_seconds,
                    hard_timeout_seconds=company.effective_codex_worker_hard_timeout_seconds,
                    hooks=hooks,
                    workspace_path=effective_workspace,
                )
                break
            except RuntimeError as exc:
                last_error = exc
                if attempt >= max_attempts:
                    break
                if hooks and hooks.on_status:
                    hooks.on_status(
                        f"{department.label} worker failed attempt {attempt}/{max_attempts}. Retrying."
                    )
                if hooks and hooks.on_log:
                    hooks.on_log(f"{department.label}: retrying after failure: {exc}")

        if payload is None:
            raise RuntimeError(str(last_error) if last_error else "Codex department execution failed.")

        return DepartmentResult(
            summary=str(payload["summary"]).strip(),
            artifact_body=str(payload["artifact_body"]).strip(),
            risks=[str(item).strip() for item in payload.get("risks", []) if str(item).strip()],
            next_action=str(payload["next_action"]).strip(),
        )

    def _run_codex(
        self,
        prompt: str,
        schema: dict,
        department_label: str,
        runtime_profile: CodexRuntimeProfile,
        idle_timeout_seconds: int,
        hard_timeout_seconds: int | None,
        hooks: DepartmentRunHooks | None = None,
        workspace_path: Path | None = None,
    ) -> dict:
        with tempfile.TemporaryDirectory(prefix="blacklab-codex-") as temp_dir:
            temp_path = Path(temp_dir)
            schema_path = temp_path / "schema.json"
            output_path = temp_path / "output.json"
            stdout_path = temp_path / "stdout.log"
            stderr_path = temp_path / "stderr.log"
            schema_path.write_text(json.dumps(schema), encoding="utf-8")

            # Use the run-scoped workspace as the codex working directory.
            # This ensures every file the AI agent creates or modifies stays
            # inside .factory/runs/<run_id>/workspace/ and never touches the
            # main blackLAB source tree (src/, frontend/, etc.).
            effective_cwd = str(workspace_path) if workspace_path else tempfile.mkdtemp(prefix="blacklab-cwd-")
            codex_bin = self._resolve_codex_bin()

            command = [
                codex_bin,
                "exec",
                "-C",
                effective_cwd,
            ]
            if runtime_profile.model:
                command.extend(["--model", runtime_profile.model])
            if runtime_profile.autonomy == "yolo":
                command.append("--dangerously-bypass-approvals-and-sandbox")
            elif runtime_profile.autonomy == "full_auto":
                command.append("--full-auto")
            else:
                command.extend(["-s", "read-only"])
            command.extend(
                [
                    "--output-schema",
                    str(schema_path),
                    "-o",
                    str(output_path),
                    prompt,
                ]
            )
            if hooks and hooks.on_log:
                hooks.on_log(
                    f"{department_label}: launching codex worker with tier={runtime_profile.tier} "
                    f"model={runtime_profile.model} autonomy={runtime_profile.autonomy} bin={codex_bin}."
                )

            with stdout_path.open("w", encoding="utf-8") as stdout_handle, stderr_path.open("w", encoding="utf-8") as stderr_handle:
                try:
                    process = subprocess.Popen(
                        command,
                        stdout=stdout_handle,
                        stderr=stderr_handle,
                        text=True,
                        stdin=subprocess.DEVNULL,
                    )
                except FileNotFoundError as exc:
                    raise RuntimeError(
                        "Codex CLI launch failed because the executable could not be found. "
                        f"Resolved command: {command[0]}"
                    ) from exc
                if hooks and hooks.on_process_start:
                    hooks.on_process_start(process.pid, _preview_command(command))

                self._wait_for_codex_process(
                    process=process,
                    department_label=department_label,
                    stdout_path=stdout_path,
                    stderr_path=stderr_path,
                    output_path=output_path,
                    idle_timeout_seconds=idle_timeout_seconds,
                    hard_timeout_seconds=hard_timeout_seconds,
                    hooks=hooks,
                    workspace_path=workspace_path,
                )

            stdout_text = stdout_path.read_text(encoding="utf-8") if stdout_path.exists() else ""
            stderr_text = stderr_path.read_text(encoding="utf-8") if stderr_path.exists() else ""

            if process.returncode != 0:
                detail = stderr_text.strip() or stdout_text.strip() or "codex exec failed"
                raise RuntimeError(f"Codex department execution failed: {detail}")
            if not output_path.exists():
                raise RuntimeError("Codex department execution completed without a final output file.")
            return json.loads(output_path.read_text(encoding="utf-8"))

    def _wait_for_codex_process(
        self,
        *,
        process: subprocess.Popen,
        department_label: str,
        stdout_path: Path,
        stderr_path: Path,
        output_path: Path,
        idle_timeout_seconds: int,
        hard_timeout_seconds: int | None,
        hooks: DepartmentRunHooks | None,
        workspace_path: Path | None,
    ) -> None:
        start_time = time.monotonic()
        last_progress_time = start_time
        stderr_offset = 0
        workspace_signature = self._workspace_progress_signature(workspace_path)
        progress_signature = self._progress_signature(
            stdout_path=stdout_path,
            stderr_path=stderr_path,
            output_path=output_path,
            workspace_signature=workspace_signature,
        )
        last_workspace_scan = start_time

        while True:
            return_code = process.poll()
            new_stderr_lines, stderr_offset = self._read_new_log_lines(stderr_path, stderr_offset)
            if hooks and hooks.on_log and new_stderr_lines:
                for line in new_stderr_lines:
                    hooks.on_log(f"{department_label}: {line}")

            now = time.monotonic()
            if workspace_path and now - last_workspace_scan >= 10:
                workspace_signature = self._workspace_progress_signature(workspace_path)
                last_workspace_scan = now

            current_signature = self._progress_signature(
                stdout_path=stdout_path,
                stderr_path=stderr_path,
                output_path=output_path,
                workspace_signature=workspace_signature,
            )
            if current_signature != progress_signature:
                last_progress_time = now
                progress_signature = current_signature

            if return_code is not None:
                break

            elapsed = int(now - start_time)
            idle_elapsed = int(now - last_progress_time)

            if hard_timeout_seconds is not None and elapsed >= hard_timeout_seconds:
                self._terminate_codex_process(process, hooks)
                raise RuntimeError(
                    f"Codex department execution reached hard timeout after {hard_timeout_seconds}s."
                )

            if idle_elapsed >= idle_timeout_seconds:
                self._terminate_codex_process(process, hooks)
                raise RuntimeError(
                    f"Codex department execution timed out after {idle_timeout_seconds}s without progress."
                )

            if hooks and hooks.on_status:
                hooks.on_status(
                    f"{department_label} worker pid {process.pid} active for {elapsed}s; "
                    f"last progress {idle_elapsed}s ago."
                )
            time.sleep(2)

        process.wait(timeout=5)
        if hooks and hooks.on_process_finish:
            hooks.on_process_finish(process.pid, process.returncode)

    def _terminate_codex_process(self, process: subprocess.Popen, hooks: DepartmentRunHooks | None) -> None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        if hooks and hooks.on_process_finish:
            hooks.on_process_finish(process.pid, process.returncode or -1)

    def _progress_signature(
        self,
        *,
        stdout_path: Path,
        stderr_path: Path,
        output_path: Path,
        workspace_signature: tuple[int, int],
    ) -> tuple[tuple[bool, int, int], tuple[bool, int, int], tuple[bool, int, int], tuple[int, int]]:
        return (
            self._file_progress_signature(stdout_path),
            self._file_progress_signature(stderr_path),
            self._file_progress_signature(output_path),
            workspace_signature,
        )

    def _file_progress_signature(self, path: Path) -> tuple[bool, int, int]:
        if not path.exists():
            return (False, 0, 0)
        stat = path.stat()
        return (True, stat.st_size, stat.st_mtime_ns)

    def _workspace_progress_signature(self, workspace_path: Path | None) -> tuple[int, int]:
        if workspace_path is None or not workspace_path.exists():
            return (0, 0)
        file_count = 0
        latest_mtime_ns = 0
        stack = [workspace_path]
        while stack:
            current = stack.pop()
            try:
                with os.scandir(current) as entries:
                    for entry in entries:
                        if entry.is_dir(follow_symlinks=False):
                            stack.append(Path(entry.path))
                            continue
                        if not entry.is_file(follow_symlinks=False):
                            continue
                        file_count += 1
                        stat = entry.stat(follow_symlinks=False)
                        latest_mtime_ns = max(latest_mtime_ns, stat.st_mtime_ns)
            except FileNotFoundError:
                continue
        return (file_count, latest_mtime_ns)

    def _read_new_log_lines(self, path: Path, offset: int) -> tuple[list[str], int]:
        if not path.exists():
            return [], offset
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            handle.seek(offset)
            chunk = handle.read()
            new_offset = handle.tell()
        if not chunk:
            return [], new_offset
        lines = [line.strip() for line in chunk.splitlines() if line.strip()]
        return lines, new_offset

    def _build_prompt(
        self,
        company: CompanyConfig,
        department: DepartmentConfig,
        state: RunState,
        workspace_path: Path | None = None,
        project_context: str = "",
        directive_context: str = "",
    ) -> str:
        runtime_profile = self._resolve_runtime_profile(department=department, settings=state.settings)
        prior_summaries = "\n".join(
            f"- {step.department_label}: {step.summary}"
            for step in state.steps
            if step.summary
        ) or "- No prior summaries yet."
        artifact_previews = "\n\n".join(
            [
                f"### {artifact.department_key} / {artifact.title}\n{artifact.preview}"
                for artifact in state.artifacts
            ]
        ) or "No artifact previews yet."

        workspace_note = (
            f"WORKSPACE BOUNDARY: You may only create or modify files inside: {workspace_path}\n"
            "The blackLAB source tree (src/, frontend/, config/, tests/) is off-limits. "
            "Never read, write, or execute anything outside the workspace directory above."
            if workspace_path
            else ""
        )

        # Project context block — injected at the very top of every prompt.
        # This gives the AI instant awareness of the project and run history
        # without any manual setup by the operator.
        project_block = project_context.strip() + "\n\n" if project_context.strip() else ""
        directive_block = (
            "LIVE OPERATOR DIRECTIVES\n"
            f"{directive_context.strip()}\n\n"
            if directive_context.strip()
            else ""
        )

        if department.key == "board_review":
            return project_block + directive_block + "\n".join(
                [
                    f"You are the {department.label} inside {company.company_name}.",
                    "Your job is to act as the final executive editor and quality gate for the entire company run.",
                    f"Mission style: {company.mission_style}.",
                    f"Mission: {state.mission}",
                    "",
                    "Completed department summaries:",
                    prior_summaries,
                    "",
                    "Artifact previews:",
                    artifact_previews,
                    "",
                    workspace_note,
                    "Return JSON only and match the provided schema exactly.",
                    self._operation_boundary(runtime_profile.autonomy),
                    "",
                    "Field requirements:",
                    "- summary: one short synthesis summary",
                    "- artifact_body: one final markdown briefing for the operator",
                    "- risks: 1 to 3 contradictions, gaps, or launch risks",
                    "- next_action: exact operator move after reading the briefing",
                    "",
                    "The markdown artifact should contain these sections:",
                    "## Mission",
                    "## Company Thesis",
                    "## Cross-Department Alignment",
                    "## Contradictions To Resolve",
                    "## Quality Gates",
                    "## Immediate Actions",
                    "## Package Handoff",
                    "",
                    "The Package Handoff section must end with a fenced JSON object using these fields:",
                    "- delivery_type: short delivery label such as web_demo, report_pdf, dataset, middleware, bundle, or null",
                    "- primary_path: canonical entry file inside the package root, or null",
                    "- must_include: relative file paths that the package must ship",
                    "- launch_instructions: short operator instruction for using the package, or null",
                    "- validation_target: short label for the expected validation surface, or null",
                    "- allowed_external_dependencies: intentional external URLs, hosts, services, or empty list",
                    "- forbidden_local_dependencies: local-machine dependencies that must not leak into the package",
                    "- notes: short package-specific cautions or handoff notes",
                    "",
                    "Write for an operator who wants one coherent plan, not seven disconnected memos.",
                ]
            )

        if department.runtime_tier == "review":
            return project_block + directive_block + "\n".join(
                [
                    f"You are the {department.label} department inside {company.company_name}.",
                    "You are part of the lightweight review lane that tests and validates the company packet.",
                    f"Mission style: {company.mission_style}.",
                    f"Department purpose: {department.purpose}",
                    f"Mission: {state.mission}",
                    "",
                    "Prior department summaries:",
                    prior_summaries,
                    "",
                    "Artifact previews from other departments:",
                    artifact_previews,
                    "",
                    workspace_note,
                    "Return JSON only and match the provided schema exactly.",
                    self._operation_boundary(runtime_profile.autonomy),
                    "",
                    "Field requirements:",
                    "- summary: one short review summary",
                    "- artifact_body: markdown review packet for this department",
                    "- risks: 1 to 3 concrete execution or validation risks",
                    "- next_action: exact handoff action toward the final board review",
                    "",
                    "The markdown artifact should contain these sections:",
                    "## Mission",
                    "## Review Lens",
                    "## Findings",
                    "## Contradictions",
                    "## Quality Gates",
                    "## Immediate Actions",
                ]
            )

        return project_block + directive_block + "\n".join(
            [
                f"You are the {department.label} department inside {company.company_name}.",
                f"Mission style: {company.mission_style}.",
                f"Department purpose: {department.purpose}",
                f"Mission: {state.mission}",
                "",
                "Prior department summaries:",
                prior_summaries,
                "",
                "Artifact previews from other departments:",
                artifact_previews,
                "",
                workspace_note,
                "Return JSON only and match the provided schema exactly.",
                self._operation_boundary(runtime_profile.autonomy),
                "",
                "Field requirements:",
                "- summary: one short execution summary",
                "- artifact_body: markdown document for this department",
                "- risks: 1 to 3 concrete risks",
                "- next_action: exact handoff action for the next department",
                "",
                "The markdown artifact should contain these sections:",
                "## Mission",
                "## Department Goal",
                "## Decision",
                "## Revenue Logic",
                "## Risks",
                "## Immediate Actions",
            ]
        )

    def _resolve_runtime_profile(
        self,
        department: DepartmentConfig,
        settings: RunSettings,
    ) -> CodexRuntimeProfile:
        return CodexRuntimeProfile(
            tier=department.runtime_tier,
            model=settings.model_for_tier(department.runtime_tier),
            autonomy=settings.autonomy_for_tier(department.runtime_tier),
        )

    def _operation_boundary(self, autonomy: CodexAutonomyMode) -> str:
        if autonomy == "yolo":
            return (
                "You may inspect and modify the workspace if it materially improves the department result, "
                "but keep changes minimal and still return valid JSON."
            )
        if autonomy == "full_auto":
            return (
                "You may inspect the workspace and use automatic execution in the sandbox when helpful, "
                "but keep the main output as valid JSON."
            )
        return "Do not modify any files. Do not run write operations. Read-only reasoning is enough."


def _preview_command(command: list[str], limit: int = 140) -> str:
    preview = " ".join(command[:7]) + " ..."
    return preview if len(preview) <= limit else preview[: limit - 3] + "..."


def build_agent(mode: RunMode) -> DepartmentAgent:
    if mode == "mock":
        return MockDepartmentAgent()
    if mode == "codex":
        return CodexDepartmentAgent()
    if mode == "openai":
        return OpenAIDepartmentAgent()
    raise ValueError(f"Unsupported mode: {mode}")
