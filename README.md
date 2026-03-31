# Conduit-ETL

**Open-source, local-first ELT workbench for data engineers.**

Pull data from heterogeneous sources, transform with SQL, validate with built-in checks, and load to destinations — all from a single CLI tool.

[![CI](https://github.com/mdraju/conduit-ETL/actions/workflows/ci.yml/badge.svg)](https://github.com/mdraju/conduit-ETL/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13-blue)
![Version](https://img.shields.io/badge/version-0.1.0-green)
![License](https://img.shields.io/badge/license-open--source-brightgreen)

## Features

- **SQL transforms** — DuckDB-powered engine: JOINs, CTEs, aggregations, and window functions across all sources
- **Apache Arrow interchange** — all sources normalized to Arrow tables for consistent in-memory processing
- **10 destination connectors** — CSV, JSON/JSONL, Parquet, PostgreSQL, MySQL, Snowflake, BigQuery, MongoDB, and S3
- **Validation pipeline** — schema checks, null checks, row counts, custom SQL assertions, and dry-run mode before any data lands
- **Configurable failure policy** — per-check `fail` or `warn` behavior with JSON validation reports
- **YAML-driven pipelines** — declarative `pipeline.yaml` config with Pydantic validation
- **Connector management CLI** — `conduit destination add/rm/enable/disable/list` for managing destination modules
- **Cross-platform binaries** — PyInstaller-built standalone executables for macOS (arm64/amd64), Linux, and Windows

## Quick Start

### Install from source

```bash
# Clone the repo
git clone https://github.com/mdraju/conduit-ETL.git
cd conduit-ETL

# Create a virtual environment and install
make install

# Or install directly with pip
pip install -e ".[dev]"
```

### Run a pipeline

```bash
# Execute a pipeline
conduit run pipeline.yaml

# Validate without loading (dry-run mode)
conduit run pipeline.yaml --dry-run

# Run validation only
conduit validate pipeline.yaml

# Enable debug logging
conduit run pipeline.yaml --verbose
```

## Pipeline Configuration

Pipelines are defined in YAML. Here's a working example:

```yaml
pipeline:
  name: orders_enriched

sources:
  - name: orders
    type: csv
    config:
      path: data/orders.csv

  - name: regions
    type: csv
    config:
      path: data/regions.csv

transform:
  sql: |
    SELECT o.order_id, o.customer_id, o.amount, o.status, r.region
    FROM orders o
    JOIN regions r ON o.region_id = r.id
    WHERE o.status = 'active'

validation:
  - type: schema
    columns:
      - { name: order_id, type: INTEGER }
      - { name: amount, type: DECIMAL }
    on_failure: fail

  - type: null_check
    columns: [order_id, customer_id, amount]
    on_failure: fail

  - type: row_count
    min: 1
    max: 10000000
    on_failure: warn

  - type: custom
    sql: |
      SELECT * FROM __result__
      WHERE amount < 0
    on_failure: fail

destinations:
  - name: output
    type: csv
    mode: full_refresh
    config:
      path: output/result.csv

  # Or load to a database:
  # - name: warehouse
  #   type: postgres
  #   mode: full_refresh
  #   config:
  #     host: localhost
  #     port: 5432
  #     database: analytics
  #     user: conduit
  #     password: ${PG_PASSWORD}
  #     schema: public
  #     table: orders_enriched
```

## CLI Reference

| Command | Description |
| --- | --- |
| `conduit run <pipeline.yaml>` | Execute a full pipeline (extract -> transform -> validate -> load) |
| `conduit run <pipeline.yaml> --dry-run` | Run through validation but skip the load step |
| `conduit validate <pipeline.yaml>` | Run validation checks only (alias for `--dry-run`) |
| `conduit run <pipeline.yaml> --verbose` | Execute with debug-level logging |
| `conduit source add <connector>` | Add and enable a source connector module (planned) |
| `conduit source rm <connector>` | Remove a source connector module (planned) |
| `conduit source list` | List all source connectors and their status (planned) |
| `conduit destination add <connector>` | Add and enable a destination connector module |
| `conduit destination rm <connector>` | Remove a destination connector module |
| `conduit destination enable <connector>` | Enable a disabled destination connector |
| `conduit destination disable <connector>` | Disable a destination connector without removing |
| `conduit destination list` | List all destination connectors and their status |

## Validation Checks

Conduit includes a built-in validation framework that runs after transform and before load:

| Check | Description | Config |
| --- | --- | --- |
| `schema` | Verify output columns match expected names and types | `columns: [{name, type}]` |
| `null_check` | Assert required fields contain no nulls | `columns: [col1, col2]` |
| `row_count` | Catch empty result sets or unexpected row counts | `min:` / `max:` |
| `custom` | Arbitrary SQL assertions (rows returned = failures) | `sql:` (use `__result__` table) |

Each check supports `on_failure: fail` (blocks load) or `on_failure: warn` (logs warning, continues).

Validation reports are saved as JSON to `.conduit/reports/`.

## Error Handling

Configure retry behavior and failure modes per pipeline:

```yaml
error_handling:
  max_retries: 3
  retry_delay_seconds: 30
  retry_backoff: exponential    # linear | exponential
  on_failure: abort             # abort | skip_batch | dead_letter
  dead_letter_path: .conduit/dead_letter/
```

| Mode | Behavior |
| --- | --- |
| `abort` | Stop immediately on first error |
| `skip_batch` | Log failed batch, continue with remaining |
| `dead_letter` | Write failed rows to file for review, continue |

> Note: Error handling config is defined but retry/dead-letter logic is not yet implemented.

## Architecture

```
Sources              Engine                   Validation              Destinations
+--------------+    +------------------+     +------------------+    +------------------+
| CSV / TSV    |--->| DuckDB SQL       |--->| Schema checks    |--->| CSV / JSON(L)    |
|              |    | (JOINs, CTEs,    |    | Null checks      |    | Parquet / S3     |
|              |    |  window funcs)   |    | Row counts       |    | PostgreSQL/MySQL |
+--------------+    +------------------+    | Custom SQL       |    | Snowflake / BQ   |
  PyArrow            In-memory engine        +------------------+    | MongoDB          |
  Arrow tables       Virtual tables          JSON reports            +------------------+
                                                                      Batch writers
```

**Pipeline flow:** Extract (CSV/TSV -> Arrow) -> Transform (DuckDB SQL) -> Validate (4 check types) -> Load (10 destination types)

## Tech Stack

| Component | Technology | Purpose |
| --- | --- | --- |
| SQL Engine | DuckDB | In-process OLAP: transforms, joins, aggregations |
| In-Memory Format | Apache Arrow / PyArrow | Zero-copy interchange between connectors and engine |
| Config Validation | Pydantic v2 | Strict YAML schema validation with typed models |
| Config Format | PyYAML | Pipeline definition in `pipeline.yaml` |
| CLI Framework | Typer | Command-line interface |
| Build System | Hatchling | Python packaging |
| Binary Distribution | PyInstaller | Cross-platform standalone executables |
| CI/CD | GitHub Actions | Test matrix + release builds |

## Connector Module System

Connectors are **opt-in modules** — only CSV/TSV is built-in. Add database connectors as needed for your project. Each module installs only its required driver, keeping Conduit lightweight.

```bash
# ── Source connectors (planned) ──
conduit source add postgres
conduit source list

# ── Destination connectors ──
conduit destination add postgres      # enable a destination connector
conduit destination rm mongodb        # remove a destination connector
conduit destination enable bigquery   # re-enable a disabled connector
conduit destination disable mysql     # disable without removing
conduit destination list              # list all connectors and status
```

### Install destination drivers

```bash
# Install individual drivers
pip install conduit-etl[postgres]     # psycopg2-binary
pip install conduit-etl[mysql]        # pymysql
pip install conduit-etl[snowflake]    # snowflake-connector-python
pip install conduit-etl[bigquery]     # google-cloud-bigquery
pip install conduit-etl[mongodb]      # pymongo

# Install all destination drivers
pip install conduit-etl[all-destinations]
```

| Connector | Source | Destination | Driver | Status |
| --- | --- | --- | --- | --- |
| CSV / TSV | Available | Available | (built-in) | Done |
| JSON / JSONL | Planned | Available | (built-in) | Partial |
| Parquet | Planned | Available | `pyarrow` (built-in) | Partial |
| PostgreSQL | Planned | Available | `psycopg2-binary` | Partial |
| MySQL | Planned | Available | `pymysql` | Partial |
| BigQuery | — | Available | `google-cloud-bigquery` | Partial |
| MongoDB | Planned | Available | `pymongo` | Partial |
| S3 | Planned | Available | (built-in) | Partial |
| Snowflake | — | Available | `snowflake-connector-python` | Partial |
| Excel | Planned | — | `openpyxl` | Planned |

## The `.conduit/` Directory

Conduit stores all runtime state in a `.conduit/` directory relative to your pipeline:

```
.conduit/
├── reports/          # JSON validation reports (one per run)
├── checkpoints/      # Resume state for failed pipelines (planned)
├── locks/            # Schema snapshots for drift detection (planned)
├── history/          # Pipeline config version history (planned)
└── dead_letter/      # Failed rows for manual review (planned)
```

Add `.conduit/checkpoints/` and `.conduit/dead_letter/` to `.gitignore`. Reports and locks are safe to commit.

## Development

### Prerequisites

- Python 3.10+
- Make (optional, for convenience targets)

### Setup

```bash
# Create venv and install dev dependencies
make install

# Or manually
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### Testing

```bash
# Run tests
make test

# Run tests with coverage (80% minimum)
make test-cov

# Run tests directly
pytest tests/ -v --tb=short
```

### Building Standalone Binaries

```bash
# Install build dependencies and build
make build

# Smoke test the binary
make smoke-test

# Clean build artifacts
make clean
```

Binaries are built automatically on tagged releases via GitHub Actions for:
- macOS (arm64 + amd64)
- Linux (amd64)
- Windows (amd64)

## Project Structure

```
src/conduit/
  __init__.py          # Package version
  cli.py               # Typer CLI (run, validate commands)
  config.py            # YAML pipeline loader
  models.py            # Pydantic models (11 config models)
  pipeline.py          # Pipeline orchestrator (extract->transform->validate->load)
  engine/
    extract.py         # Source extractors (CSV/TSV -> Arrow)
    transform.py       # DuckDB SQL transform engine
  loader/
    csv_loader.py      # CSV destination writer
    json_loader.py     # JSON / JSONL destination writer
    parquet_loader.py  # Parquet destination writer
    postgres_loader.py # PostgreSQL destination writer
    mysql_loader.py    # MySQL destination writer
    snowflake_loader.py# Snowflake destination writer
    bigquery_loader.py # BigQuery destination writer
    mongodb_loader.py  # MongoDB destination writer
    s3_loader.py       # S3 destination writer (CSV/Parquet)
  validation/
    validators.py      # 4 validator implementations
    runner.py           # Validation orchestrator
    reporter.py        # JSON report generation + logging
tests/
  test_*.py            # 33 tests across 4 test files
  fixtures/            # Sample pipeline + CSV test data
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and add tests
4. Run the test suite (`make test`)
5. Commit and push (`git push origin feature/my-feature`)
6. Open a Pull Request

Please ensure all tests pass and coverage stays above 80% before submitting.

## Roadmap

See [PLAN.md](PLAN.md) for the full architecture and design document with implementation status tracking. Key planned features:

- **Database connectors** — PostgreSQL, MySQL, MongoDB, BigQuery, Snowflake, S3, Excel, Parquet, JSON
- **Incremental loads** — watermark-based extract with merge/append strategies
- **Error handling & retries** — configurable retry backoff, skip_batch, dead-letter routing
- **Encrypted vault** — AES-256 secrets backed by OS keychain
- **Environment variables** — `${VAR}` substitution in pipeline configs
- **Chunked streaming** — bounded memory processing for large datasets
- **Checkpoint & resume** — pick up failed pipelines from last successful chunk
- **Schema locking** — detect source/destination drift before it breaks pipelines
- **Orchestration** — embedded scheduling with cron expressions
- **Web UI** — visual pipeline configuration and monitoring (FastAPI)
- **Pipeline templates** — reusable pipeline scaffolding
- **`conduit init`** — project scaffolding with standard directory layout

## License

Open Source — see [LICENSE](LICENSE) for details.
