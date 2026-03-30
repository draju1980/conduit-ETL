"""Pipeline runner — orchestrates Extract → Transform → Validate → Load."""

from __future__ import annotations

import logging
from pathlib import Path

from conduit.config import load_pipeline
from conduit.engine.extract import extract_sources
from conduit.engine.transform import run_transform
from conduit.loader.csv_loader import load_csv
from conduit.validation.reporter import log_findings, save_report
from conduit.validation.runner import run_validation

logger = logging.getLogger(__name__)

# Loader dispatch by destination type
_LOADERS = {
    "csv": load_csv,
}


def run_pipeline(config_path: str, validate_only: bool = False) -> bool:
    """Execute the full pipeline: extract → transform → validate → load.

    Args:
        config_path: Path to pipeline.yaml.
        validate_only: If True, run through validation but skip load.

    Returns:
        True if the pipeline completed successfully, False if validation blocked it.
    """
    config_file = Path(config_path).resolve()
    base_dir = config_file.parent
    reports_dir = base_dir / ".conduit" / "reports"

    config = load_pipeline(config_file)
    pipeline_name = config.pipeline.name
    logger.info("=" * 60)
    logger.info("Pipeline '%s' — starting", pipeline_name)
    logger.info("=" * 60)

    # --- Step 1: Extract ---
    logger.info("--- EXTRACT ---")
    sources = extract_sources(config.sources, base_dir)

    # --- Step 2: Transform ---
    logger.info("--- TRANSFORM ---")
    result = run_transform(config.transform.sql, sources)

    # --- Step 3: Validate ---
    logger.info("--- VALIDATE ---")
    report = run_validation(result, config.validation, pipeline_name)

    # Always log findings and save report, regardless of pass/fail
    log_findings(report)
    save_report(report, reports_dir)

    if not report.passed:
        logger.error(
            "Pipeline '%s' STOPPED — validation failed. Load will NOT proceed.",
            pipeline_name,
        )
        return False

    if validate_only:
        logger.info("Validation-only mode — skipping load step")
        return True

    # --- Step 4: Load ---
    logger.info("--- LOAD ---")
    for dest in config.destinations:
        loader = _LOADERS.get(dest.type)
        if loader is None:
            raise NotImplementedError(
                f"Destination type '{dest.type}' is not yet implemented. "
                f"Supported types: {', '.join(sorted(_LOADERS))}"
            )
        loader(result, dest, base_dir)

    logger.info("=" * 60)
    logger.info("Pipeline '%s' — completed successfully", pipeline_name)
    logger.info("=" * 60)
    return True
