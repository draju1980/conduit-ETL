"""Data models for validation findings and reports."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal


@dataclass
class ValidationFinding:
    check_type: str
    status: Literal["pass", "fail", "warn"]
    message: str
    details: dict[str, Any] | None = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ValidationReport:
    pipeline_name: str
    run_timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    findings: list[ValidationFinding] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(f.status != "fail" for f in self.findings)

    @property
    def summary(self) -> str:
        total = len(self.findings)
        passed = sum(1 for f in self.findings if f.status == "pass")
        warned = sum(1 for f in self.findings if f.status == "warn")
        failed = sum(1 for f in self.findings if f.status == "fail")
        parts = [f"{total} check(s)"]
        if passed:
            parts.append(f"{passed} passed")
        if warned:
            parts.append(f"{warned} warned")
        if failed:
            parts.append(f"{failed} failed")
        return ", ".join(parts)
