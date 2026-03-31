"""S3 destination writer (built-in via PyArrow S3 filesystem)."""

from __future__ import annotations

import logging
from pathlib import Path

import pyarrow as pa
import pyarrow.csv as pcsv
import pyarrow.parquet as pq
from pyarrow import fs as pafs

from conduit.models import DestinationConfig

logger = logging.getLogger(__name__)


def load_s3(table: pa.Table, dest: DestinationConfig, base_dir: Path) -> None:
    """Write an Arrow table to an S3 bucket as CSV or Parquet.

    Uses PyArrow's built-in S3FileSystem — no boto3 dependency required.
    Credentials are resolved from environment variables, IAM roles,
    or explicit config values.
    """
    bucket = dest.config.get("bucket")
    key = dest.config.get("key", dest.config.get("path", f"{dest.name}.parquet"))
    file_format = dest.config.get("format", "parquet")
    region = dest.config.get("region", "")

    if not bucket:
        raise ValueError("S3 destination requires 'bucket' in config")

    # Build S3FileSystem — picks up AWS_* env vars and IAM roles automatically
    s3_kwargs = {}
    if region:
        s3_kwargs["region"] = region
    if dest.config.get("aws_access_key_id"):
        s3_kwargs["access_key"] = dest.config["aws_access_key_id"]
        s3_kwargs["secret_key"] = dest.config.get("aws_secret_access_key", "")
    if dest.config.get("endpoint_override"):
        s3_kwargs["endpoint_override"] = dest.config["endpoint_override"]

    s3 = pafs.S3FileSystem(**s3_kwargs)
    s3_path = f"{bucket}/{key}"

    if file_format == "csv":
        with s3.open_output_stream(s3_path) as out:
            write_options = pcsv.WriteOptions(include_header=True)
            pcsv.write_csv(table, out, write_options=write_options)
    else:
        pq.write_table(
            table,
            s3_path,
            filesystem=s3,
            compression=dest.config.get("compression", "snappy"),
        )

    logger.info(
        "Loaded %d rows to S3 destination '%s' (s3://%s/%s, format=%s)",
        len(table), dest.name, bucket, key, file_format,
    )
