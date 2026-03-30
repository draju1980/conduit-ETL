"""Log validation findings and save reports to disk."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from conduit.validation.models import ValidationReport

logger = logging.getLogger(__name__)

_STATUS_LOG_LEVEL = {
    "pass": logging.INFO,
    "warn": logging.WARNING,
    "fail": logging.ERROR,
}

_STATUS_SYMBOL = {
    "pass": "\u2713",  # checkmark
    "warn": "\u26a0",  # warning sign
    "fail": "\u2717",  # cross mark
}


def log_findings(report: ValidationReport) -> None:
    """Log every validation finding at the appropriate severity level."""
    for finding in report.findings:
        level = _STATUS_LOG_LEVEL.get(finding.status, logging.INFO)
        symbol = _STATUS_SYMBOL.get(finding.status, "?")
        logger.log(level, "[%s] %s: %s", symbol, finding.check_type, finding.message)

        # Log details for failures and warnings
        if finding.details and finding.status in ("fail", "warn"):
            for key, value in finding.details.items():
                if key == "sample":
                    continue  # don't dump sample rows in logs
                logger.log(level, "    %s: %s", key, value)

    # Summary line
    if report.passed:
        logger.info("Validation summary: %s — PASSED", report.summary)
    else:
        logger.error("Validation summary: %s — FAILED (load will be blocked)", report.summary)


def save_report(report: ValidationReport, output_dir: Path) -> Path:
    """Save the validation report as a JSON file.

    Returns the path to the written report file.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp_str = report.run_timestamp.strftime("%Y-%m-%dT%H-%M-%S")
    filename = f"{report.pipeline_name}_{timestamp_str}.json"
    report_path = output_dir / filename

    report_data = {
        "pipeline_name": report.pipeline_name,
        "run_timestamp": report.run_timestamp.isoformat(),
        "passed": report.passed,
        "summary": report.summary,
        "findings": [
            {
                "check_type": f.check_type,
                "status": f.status,
                "message": f.message,
                "details": f.details,
                "timestamp": f.timestamp.isoformat(),
            }
            for f in report.findings
        ],
    }

    with open(report_path, "w") as f:
        json.dump(report_data, f, indent=2, default=str)

    logger.info("Validation report saved to %s", report_path)
    return report_path
