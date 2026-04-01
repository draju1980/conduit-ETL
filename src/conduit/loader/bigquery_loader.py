"""BigQuery destination writer."""

from __future__ import annotations

import logging
from pathlib import Path

import pyarrow as pa

from conduit.models import DestinationConfig

logger = logging.getLogger(__name__)


def load_bigquery(table: pa.Table, dest: DestinationConfig, base_dir: Path) -> None:
    """Write an Arrow table to a BigQuery table."""
    try:
        from google.cloud import bigquery
    except ImportError:
        raise ImportError(
            "google-cloud-bigquery is required for BigQuery destinations. "
            "Please ensure you are using the official Conduit ETL binary which bundles all drivers."
        )

    project = dest.config.get("project")
    dataset = dest.config.get("dataset")
    target_table = dest.config.get("table", dest.name)

    if not dataset:
        raise ValueError("BigQuery destination requires 'dataset' in config")

    table_ref = f"{dataset}.{target_table}"
    if project:
        table_ref = f"{project}.{table_ref}"

    client = bigquery.Client(project=project)

    write_disposition = (
        bigquery.WriteDisposition.WRITE_TRUNCATE
        if dest.mode == "full_refresh"
        else bigquery.WriteDisposition.WRITE_APPEND
    )

    job_config = bigquery.LoadJobConfig(
        write_disposition=write_disposition,
        source_format=bigquery.SourceFormat.PARQUET,
    )

    job = client.load_table_from_dataframe(
        table.to_pandas(),
        table_ref,
        job_config=job_config,
    )
    job.result()  # Wait for completion

    logger.info(
        "Loaded %d rows to BigQuery destination '%s' (%s)",
        len(table), dest.name, table_ref,
    )
