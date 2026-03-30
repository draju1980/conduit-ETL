"""Extract data from sources into Arrow tables."""

from __future__ import annotations

import logging
from pathlib import Path

import pyarrow as pa
import pyarrow.csv as pcsv

from conduit.models import SourceConfig

logger = logging.getLogger(__name__)

# Extractors keyed by source type
_EXTRACTORS: dict[str, callable] = {}


def _extract_csv(source: SourceConfig, base_dir: Path) -> pa.Table:
    file_path = base_dir / source.config.get("path", "")
    if not file_path.exists():
        raise FileNotFoundError(f"CSV source file not found: {file_path}")

    read_options = pcsv.ReadOptions()
    if not source.config.get("has_header", True):
        read_options.autogenerate_column_names = True

    parse_options = pcsv.ParseOptions()
    delimiter = source.config.get("delimiter", ",")
    if delimiter:
        parse_options.delimiter = delimiter

    table = pcsv.read_csv(str(file_path), read_options=read_options, parse_options=parse_options)
    logger.info("Extracted %d rows from CSV source '%s' (%s)", len(table), source.name, file_path)
    return table


def _extract_tsv(source: SourceConfig, base_dir: Path) -> pa.Table:
    source.config.setdefault("delimiter", "\t")
    return _extract_csv(source, base_dir)


_EXTRACTORS = {
    "csv": _extract_csv,
    "tsv": _extract_tsv,
}


def extract_sources(sources: list[SourceConfig], base_dir: Path) -> dict[str, pa.Table]:
    """Extract all sources and return a dict mapping source name to Arrow table."""
    tables: dict[str, pa.Table] = {}

    for source in sources:
        extractor = _EXTRACTORS.get(source.type)
        if extractor is None:
            raise NotImplementedError(
                f"Connector type '{source.type}' is not yet implemented. "
                f"Supported types: {', '.join(sorted(_EXTRACTORS))}"
            )
        tables[source.name] = extractor(source, base_dir)

    logger.info("Extracted %d source(s): %s", len(tables), ", ".join(tables))
    return tables
