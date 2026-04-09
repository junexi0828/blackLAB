from __future__ import annotations

import os
import platform
import re
import subprocess

from pydantic import BaseModel


class RuntimeResourceSnapshot(BaseModel):
    cpu_count: int
    load_1m: float | None = None
    load_ratio: float | None = None
    memory_total_mb: int | None = None
    memory_available_mb: int | None = None
    memory_available_ratio: float | None = None
    requested_parallelism: int
    effective_parallelism: int
    reason: str


class RuntimeResourceManager:
    def snapshot(self, requested_parallelism: int, active_workers: int = 0) -> RuntimeResourceSnapshot:
        cpu_count = max(1, os.cpu_count() or 1)
        requested = max(1, min(requested_parallelism, cpu_count))
        load_1m, load_ratio = self._cpu_load_snapshot(cpu_count)
        memory_total_mb, memory_available_mb, memory_available_ratio = self._memory_snapshot()

        effective = requested
        reasons: list[str] = []

        if load_ratio is not None:
            if load_ratio >= 1.25:
                effective = min(effective, 1)
                reasons.append("CPU load is critical.")
            elif load_ratio >= 1.0:
                effective = min(effective, 2)
                reasons.append("CPU load is high.")
            elif load_ratio >= 0.85:
                effective = min(effective, 3)
                reasons.append("CPU load is elevated.")
            elif load_ratio >= 0.7:
                effective = min(effective, 4)
                reasons.append("CPU load is warming up.")

        if memory_available_ratio is not None:
            if memory_available_ratio <= 0.08:
                effective = min(effective, 1)
                reasons.append("Available memory is critical.")
            elif memory_available_ratio <= 0.15:
                effective = min(effective, 2)
                reasons.append("Available memory is tight.")
            elif memory_available_ratio <= 0.22:
                effective = min(effective, 3)
                reasons.append("Available memory is guarded.")

        effective = max(1, effective)
        if not reasons:
            reasons.append("Requested parallelism is safe for current machine load.")
        if active_workers >= effective and requested > effective:
            reasons.append("Current workers already fill the effective parallel budget.")

        return RuntimeResourceSnapshot(
            cpu_count=cpu_count,
            load_1m=round(load_1m, 2) if load_1m is not None else None,
            load_ratio=round(load_ratio, 2) if load_ratio is not None else None,
            memory_total_mb=memory_total_mb,
            memory_available_mb=memory_available_mb,
            memory_available_ratio=round(memory_available_ratio, 2) if memory_available_ratio is not None else None,
            requested_parallelism=requested_parallelism,
            effective_parallelism=effective,
            reason=" ".join(reasons),
        )

    def _cpu_load_snapshot(self, cpu_count: int) -> tuple[float | None, float | None]:
        try:
            load_1m = os.getloadavg()[0]
        except (AttributeError, OSError):
            return None, None
        return load_1m, load_1m / max(cpu_count, 1)

    def _memory_snapshot(self) -> tuple[int | None, int | None, float | None]:
        system = platform.system().lower()
        if system == "darwin":
            return self._darwin_memory_snapshot()
        if system == "linux":
            return self._linux_memory_snapshot()
        return None, None, None

    def _darwin_memory_snapshot(self) -> tuple[int | None, int | None, float | None]:
        try:
            total_bytes = int(
                subprocess.run(
                    ["sysctl", "-n", "hw.memsize"],
                    capture_output=True,
                    check=True,
                    text=True,
                    timeout=1,
                ).stdout.strip()
            )
            vm_stat = subprocess.run(
                ["vm_stat"],
                capture_output=True,
                check=True,
                text=True,
                timeout=1,
            ).stdout
        except (OSError, subprocess.SubprocessError, ValueError):
            return None, None, None

        page_size_match = re.search(r"page size of (\d+) bytes", vm_stat)
        page_size = int(page_size_match.group(1)) if page_size_match else 4096
        page_map: dict[str, int] = {}
        for line in vm_stat.splitlines():
            if ":" not in line:
                continue
            key, raw_value = line.split(":", 1)
            digits = re.sub(r"[^0-9]", "", raw_value)
            if not digits:
                continue
            page_map[key.strip()] = int(digits)

        available_pages = (
            page_map.get("Pages free", 0)
            + page_map.get("Pages speculative", 0)
            + page_map.get("Pages inactive", 0)
            + page_map.get("Pages purgeable", 0)
        )
        available_bytes = available_pages * page_size
        total_mb = total_bytes // (1024 * 1024)
        available_mb = available_bytes // (1024 * 1024)
        available_ratio = available_bytes / total_bytes if total_bytes else None
        return total_mb, available_mb, available_ratio

    def _linux_memory_snapshot(self) -> tuple[int | None, int | None, float | None]:
        meminfo_path = "/proc/meminfo"
        if not os.path.exists(meminfo_path):
            return None, None, None

        values: dict[str, int] = {}
        with open(meminfo_path, encoding="utf-8") as handle:
            for line in handle:
                if ":" not in line:
                    continue
                key, raw_value = line.split(":", 1)
                digits = re.sub(r"[^0-9]", "", raw_value)
                if digits:
                    values[key.strip()] = int(digits)

        total_kb = values.get("MemTotal")
        available_kb = values.get("MemAvailable")
        if not total_kb or not available_kb:
            return None, None, None
        total_mb = total_kb // 1024
        available_mb = available_kb // 1024
        return total_mb, available_mb, available_kb / total_kb
