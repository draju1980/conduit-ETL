"""Validation orchestrator — runs all checks and produces a report."""

from __future__ import annotations

import logging

import pyarrow as pa

from conduit.models import ValidationCheck
from conduit.validation.models import ValidationFinding, ValidationReport
from conduit.validation.validators import VALIDATORS

logger = logging.getLogger(__name__)


def run_validation(
    table: pa.Table,
    checks: list[ValidationCheck],
    pipeline_name: str,
) -> ValidationReport:
    """Run all validation checks against the transform result.

    All checks execute regardless of individual pass/fail — the operator
    sees every problem in a single run. The on_failure field controls
    whether a failed check becomes status "fail" (blocks load) or
    "warn" (logs but continues).
    """
    report = ValidationReport(pipeline_name=pipeline_name)

    if not checks:
        logger.info("No validation checks defined — skipping validation")
        return report

    logger.info("Running %d validation check(s) for pipeline '%s'", len(checks), pipeline_name)

    for i, check in enumerate(checks, 1):
        validator = VALIDATORS.get(check.type)
        if validator is None:
            finding = ValidationFinding(
                check_type=check.type,
                status="fail",
                message=f"Unknown validation type: '{check.type}'",
            )
        else:
            finding = validator(table, check)

        # Apply on_failure policy: if the check failed but on_failure is "warn",
        # downgrade from "fail" to "warn" so it doesn't block the load
        if finding.status == "fail" and check.on_failure == "warn":
            finding.status = "warn"

        report.findings.append(finding)
        logger.debug("Check %d/%d [%s] %s: %s", i, len(checks), check.type, finding.status, finding.message)

    return report
