# Conduit — Architecture & Design Plan

> **Status Legend:** DONE = implemented & tested | PARTIAL = config/models exist but logic incomplete | PLANNED = not yet implemented

## Overview

Conduit is a local-first ELT (Extract, Transform, Load) workbench for data engineers. It provides a unified SDK and web interface to pull data from heterogeneous sources, transform it with SQL, and export to destination databases or files — all from a single tool.

---

## High-Level Data Flow

```
EXTRACT                 TRANSFORM                  VALIDATE                   LOAD
[PARTIAL]               [DONE]                     [DONE - custom]            [PARTIAL]
┌─────────────┐        ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ Postgres     │        │                  │       │ Custom           │       │ Snowflake        │
│ CSV / Excel  │──────▶ │  DuckDB (SQL)    │─────▶ │ Validation       │─────▶ │ BigQuery         │
│ BigQuery     │ Arrow  │  Transform       │       │ Framework        │       │ CSV export       │
│ MongoDB      │        │                  │       │                  │       │ S3               │
└─────────────┘        └──────────────────┘       └──────────────────┘       └──────────────────┘
  Connector Layer         In-memory engine           Data quality gate          Batch writer
  + Vault secrets         + Schema checks            + 4 check types            + Incremental
  (CSV/TSV only)                                     (not GE-based)             (CSV only)
```

---

## Step-by-Step Breakdown

### Step 1 — Extract `PARTIAL`

The user defines sources in `pipeline.yaml` or via the web UI. The connector layer pulls data from each source. Vault resolves encrypted credentials at this point — never before. Each source streams data in chunks, not all at once, keeping memory usage low.

> **Current status:** Only CSV/TSV extractors implemented. No database connectors, no vault integration, no chunked streaming — entire dataset loaded into memory.

### Step 2 — Normalize `DONE`

Each connector converts its source data into **Apache Arrow** format. This gives DuckDB a consistent in-memory format regardless of the origin — whether it's a Postgres table, an Excel file, or a MongoDB collection. Schema is inferred at this stage.

> **Current status:** CSV/TSV sources are converted to Arrow tables via PyArrow. Schema inference not yet implemented for other source types.

### Step 3 — Transform `DONE`

DuckDB registers all normalized sources as virtual tables. The user's SQL runs across all of them as if they were a single database. Full SQL is supported: JOINs, aggregations, CTEs, and window functions across sources.

```sql
SELECT o.*, r.region
FROM orders o
JOIN regions r ON o.region_id = r.id
WHERE o.status = 'active'
```

### Step 4 — Validate (Custom Framework) `DONE`

Before writing to the destination, Conduit runs the data quality validation pass. This step verifies that the transformed data meets defined expectations before any data lands at the destination.

> **Current status:** Implemented using a custom validation framework (not Great Expectations). Supports 4 check types: schema, null_check, row_count, custom SQL. on_failure policy (fail/warn) fully working. JSON reports generated per run.

| Check | Description | Status |
| --- | --- | --- |
| Schema check | Output columns match destination schema | DONE |
| Null check | Required fields are not empty | DONE |
| Row count | Catches silent empty result sets | DONE |
| Custom SQL | Arbitrary SQL validation queries | DONE |
| GE Expectations | Great Expectations integration | PLANNED |
| Dry run mode | Stops here and reports what would load | DONE |

### Step 5 — Load `PARTIAL`

The connector writes to the destination in batches. Supports both full refresh and incremental modes. On failure, Conduit logs the exact batch, row, and error for debugging.

> **Current status:** Only CSV loader implemented. No database loaders, no batch writing, no incremental merge/append logic.

---

## Orchestration — Inbuilt Airflow Scheduler `PLANNED`

Apache Airflow is embedded inside Conduit as the scheduling and orchestration engine. Users never interact with Airflow directly — no DAG files, no Airflow UI, no Airflow config. Conduit owns the entire scheduling experience and auto-generates everything Airflow needs internally from `pipeline.yaml`.

> **Current status:** Not implemented. No Airflow integration, no DAG generation, no `conduit up/down` daemon, no scheduling commands.

### How It Works

```
User interacts with Conduit only
        │
        ├── conduit schedule pipeline.yaml --cron "0 6 * * *"
        ├── conduit pipeline list
        ├── conduit pipeline status orders
        └── localhost:4000/ui/pipelines   ← schedule management in web UI
                │
                ▼
        Airflow running internally        ← hidden, users never see this
        DAGs auto-generated from pipeline.yaml
        Airflow DB + logs → ~/.conduit/airflow/
```

### What `conduit up` Starts

```
conduit up
    ├── Conduit daemon
    ├── Airflow scheduler        ← internal, auto-started
    ├── REST / WS API (localhost:4000)
    └── Web UI (localhost:4000/ui)
            └── /ui/pipelines    ← schedule + run history management
```

### Scheduling via CLI

```bash
# Schedule a pipeline
conduit schedule pipeline.yaml --cron "0 6 * * *"
conduit schedule pipeline.yaml --every 1h

# Remove a schedule
conduit unschedule pipeline.yaml

# Pipeline management
conduit pipeline list                  # all pipelines + schedule + last run status
conduit pipeline status orders         # detailed status of a single pipeline
conduit pipeline pause orders          # pause without removing schedule
conduit pipeline resume orders         # resume a paused pipeline
conduit pipeline trigger orders        # manual run outside schedule
```

### `pipeline list` Output

```bash
$ conduit pipeline list

┌──────────────────┬─────────────────┬──────────────┬──────────┬─────────────┐
│ Pipeline         │ Schedule        │ Last Run     │ Duration │ Status      │
├──────────────────┼─────────────────┼──────────────┼──────────┼─────────────┤
│ orders_to_sf     │ 0 6 * * *       │ 2026-03-27   │ 4m 12s   │ ● success   │
│ regions_sync     │ every 1h        │ 2026-03-27   │ 0m 43s   │ ● success   │
│ customers_load   │ 0 0 * * *       │ 2026-03-26   │ 12m 01s  │ ✗ failed    │
│ inventory_check  │ manual only     │ 2026-03-25   │ 2m 08s   │ ○ paused    │
└──────────────────┴─────────────────┴──────────────┴──────────┴─────────────┘
```

### Scheduling in pipeline.yaml

```yaml
pipeline:
  name: orders_to_snowflake
  schedule:
    cron: "0 6 * * *"        # or use: every: 1h
    timezone: UTC
    on_failure: retry         # retry | stop | alert
    retries: 3
    retry_delay_minutes: 5
    depends_on:               # run after these pipelines succeed
      - regions_sync
      - customers_load
```

### Pipeline Dependency Flow

```
regions_sync ──┐
               ├──▶ orders_to_snowflake
customers_load─┘

Airflow ensures regions_sync and customers_load
complete successfully before orders_to_snowflake runs.
Users define this in pipeline.yaml — no DAG writing needed.
```

---

## Data Quality — Great Expectations Integration `PARTIAL`

Great Expectations validates that data meets defined quality standards **before it lands at the destination**. Conduit integrates GE as the validation engine in Step 4 of the ETL flow.

> **Current status:** Validation is implemented using a custom framework (schema, null_check, row_count, custom SQL checks) — NOT Great Expectations. GE integration is planned but not yet built. The custom framework covers the core use cases listed below. JSON reports are generated; HTML reports via GE are not available.

### How It Works

1. User defines an **expectation suite** per pipeline in `pipeline.yaml`
2. After the SQL transform, Conduit passes the result to Great Expectations
3. GE runs all expectations against the data
4. On failure: pipeline blocks, logs the violations, and skips the load step
5. On success: pipeline proceeds to load
6. GE generates a **data quality report** automatically on every run

### Pipeline Config

```yaml
# pipeline.yaml
transform:
  sql: |
    SELECT o.*, r.region
    FROM orders o
    JOIN regions r ON o.region_id = r.id
    WHERE o.status = 'active'

validation:
  engine: great_expectations
  suite: orders_quality_suite
  on_failure: block           # block | warn
  report:
    enabled: true
    path: .conduit/reports/
  expectations:
    - column: order_id
      expect: not_null
    - column: order_id
      expect: be_unique
    - column: amount
      expect: be_between
      min: 0
      max: 1000000
    - column: status
      expect: be_in_set
      values: [active, pending, closed]
    - column: updated_at
      expect: not_null
    - table:
      expect: row_count_to_be_between
      min: 1
      max: 10000000
```

### Standalone Validation CLI

```bash
# Validate data without running the full pipeline
conduit validate pipeline.yaml

# Output
# Running Great Expectations suite: orders_quality_suite
# ✓ order_id — not_null               passed (100,000 rows)
# ✓ order_id — be_unique              passed (100,000 unique)
# ✓ amount   — be_between [0, 1M]     passed
# ✗ status   — be_in_set              FAILED — 42 unexpected values found: ['cancelled']
# ✗ Pipeline blocked — fix violations before loading
```

### Data Quality Reports

GE generates an HTML report on every run, stored in `.conduit/reports/`:

```
.conduit/
└── reports/
    ├── orders_quality_suite_2026-03-27T10:00:00.html
    └── orders_quality_suite_2026-03-27T16:00:00.html
```

Reports are also accessible from the Conduit web UI at `localhost:4000/ui/reports`.

### Expectation Types Supported

| Expectation | Description | Status |
|-------------|-------------|--------|
| `not_null` | Column must have no null values | DONE (via null_check) |
| `be_unique` | Column values must be unique | PLANNED |
| `be_between` | Values must fall within a numeric range | DONE (via custom SQL) |
| `be_in_set` | Values must match a defined set | DONE (via custom SQL) |
| `match_regex` | Values must match a regex pattern | DONE (via custom SQL) |
| `row_count_to_be_between` | Table row count must be within range | DONE (via row_count) |
| `schema_matches` | Column names and types match expected schema | DONE (via schema check) |

### CLI Commands

| Command | Description | Status |
|---------|-------------|--------|
| `conduit validate pipeline.yaml` | Run validation suite without loading | DONE |
| `conduit validate pipeline.yaml --suite custom_suite` | Run a specific suite | PLANNED |
| `conduit run pipeline.yaml` | Validate + load (full pipeline) | DONE |
| `conduit report list` | List all generated quality reports | PLANNED |
| `conduit report open pipeline.yaml` | Open latest report in browser | PLANNED |

---

## Updated Tech Stack

| Layer | Tool | Role | Status |
|-------|------|------|--------|
| ETL Engine | DuckDB + Apache Arrow | Federated SQL + in-memory format | DONE |
| Orchestration | Apache Airflow | Pipeline scheduling and dependencies | PLANNED |
| Data Quality | Custom validators (GE planned) | Validation, documentation, monitoring | PARTIAL |
| Error Handling | Retry + backoff + dead letter | Configurable failure recovery | PARTIAL (config only) |
| Logging | Python logging | Structured log output to stderr | PARTIAL (basic logging done) |
| SDK / CLI | Python + Typer + FastAPI | Core SDK and local server | PARTIAL (Typer done, FastAPI planned) |
| Web UI | FastAPI + frontend | Visual pipeline management | PLANNED |
| Credential Security | Conduit Vault (AES-256) | Encrypted secrets, OS keychain | PLANNED |
| Config | PyYAML + Pydantic + env vars | Pipeline definition with variable substitution | PARTIAL (YAML done, env vars planned) |
| Connectors | Pluggable modules | Per-source/destination drivers | PARTIAL (CSV/TSV only) |
| Distribution | GitHub Actions binaries | PyInstaller cross-platform builds | DONE |
| Testing | pytest + Docker fixtures | Unit, integration, E2E | PARTIAL (unit tests done, no Docker/E2E) |

---

## Incremental Loads `PARTIAL`

Conduit tracks a **watermark** (last run timestamp or last ID) per pipeline. On subsequent runs, only new or updated rows are pulled — dramatically reducing load times and destination write costs for large datasets.

> **Current status:** Incremental config models defined in Pydantic (strategy, watermark_column, merge_key). No watermark tracking, no state persistence, no incremental extraction or merge logic implemented.

```bash
# First run — full load
conduit run pipeline.yaml
# Extracted 100,000 rows
# Loaded 100,000 rows -> snowflake.analytics.orders

# Second run — incremental
conduit run pipeline.yaml
# Extracted 523 new rows (since last run)
# Loaded 523 rows -> snowflake.analytics.orders
```

---

## Time Machine — Schema Locks & Config Versioning `PARTIAL`

Data pipelines break silently when upstream sources change schemas or when someone accidentally modifies a working pipeline config. Time Machine prevents this with two mechanisms:

> **Current status:** Config models defined (schema_lock, config_lock, history settings). No implementation — no lock files generated, no drift detection, no config versioning or history commands.

### Schema Locks

On first run (or via `conduit lock`), Conduit snapshots the schema (column names, types, nullability) for each source and destination. On every subsequent run, the live schema is compared against the locked snapshot.

**Detected drifts:**

* Column added, removed, or renamed
* Type changed (e.g., `INTEGER` → `VARCHAR`)
* Nullability changed (`NOT NULL` ↔ `NULL`)

Each lock is independently configurable:

* `on_violation: block` — pipeline refuses to run until the lock is updated
* `on_violation: warn` — logs the drift and continues

```yaml
sources:
  - name: orders
    type: postgres
    connection: my-pg-conn
    config:
      schema: public
      table: orders
    time_machine:
      schema_lock:
        enabled: true
        on_violation: block
        track: [columns, types, nullability]
```

Schema snapshots are stored in `.conduit/locks/` as JSON:

```json
{
  "source": "orders",
  "locked_at": "2026-03-27T10:00:00Z",
  "locked_by": "conduit run",
  "columns": [
    { "name": "order_id",   "type": "INTEGER",   "nullable": false },
    { "name": "amount",     "type": "DECIMAL",   "nullable": false },
    { "name": "updated_at", "type": "TIMESTAMP", "nullable": true }
  ]
}
```

### Config Versioning

Conduit hashes `pipeline.yaml` on each run and stores timestamped snapshots in `.conduit/history/`. Users can view the history, diff any two versions, and revert to a previous config.

```yaml
time_machine:
  config_lock:
    enabled: true
    on_violation: warn
  history:
    retain: 30
    path: .conduit/history/
```

### Storage Layout

```
.conduit/
├── locks/
│   ├── orders.schema.json
│   ├── customers.schema.json
│   └── snowflake_analytics.schema.json
├── history/
│   ├── 2026-03-27T10:00:00.yaml
│   └── 2026-03-27T16:00:00.yaml
├── checkpoints/
│   └── orders_to_warehouse/
│       ├── state.json
│       ├── watermarks.json
│       └── manifest.json
└── reports/
    └── orders_quality_suite_2026-03-27T10:00:00.html
```

### Time Machine CLI

| Command | Description |
| --- | --- |
| `conduit lock <pipeline>` | Snapshot all source/destination schemas |
| `conduit lock <pipeline> --source orders` | Lock a specific source only |
| `conduit unlock <pipeline>` | Remove all locks |
| `conduit drift <pipeline>` | Check for drift without running |
| `conduit history <pipeline>` | List config versions with timestamps |
| `conduit history <pipeline> --diff v1 v2` | Diff two config versions |
| `conduit revert <pipeline> --to <timestamp>` | Restore a previous config version |

---

## Disk Space Pre-check `PARTIAL`

Conduit runs on user desktops and servers where local disk space is not guaranteed. A pipeline that fails mid-run due to a full disk wastes time, leaves partial state, and can corrupt checkpoints. Conduit prevents this by checking available storage **before** the pipeline starts.

> **Current status:** Config model defined. No disk check logic implemented.

```yaml
runtime:
  disk_check:
    enabled: true
    min_free_gb: 5
    safety_buffer_pct: 20
    on_failure: block
```

---

## Chunk-based Streaming `PARTIAL`

Conduit processes data in **chunks** across the entire pipeline — extract, transform, and load. This keeps local storage usage bounded regardless of dataset size.

> **Current status:** Config model defined (extract_chunk_size, load_batch_size, max_memory_mb, spill_to_disk). No chunking implemented — entire dataset loaded into memory.

```yaml
runtime:
  chunking:
    extract_chunk_size: 10000
    load_batch_size: 5000
    max_memory_mb: 512
    spill_to_disk: true
```

---

## Checkpoint & Resume `PARTIAL`

Network failures, machine restarts, and transient errors should not force a pipeline to restart from scratch. Conduit tracks progress at the chunk level and resumes from the last successful checkpoint.

> **Current status:** Config model defined (enabled, auto_resume, retention, path). No checkpoint saving, no resume logic, no `--restart` flag implemented.

```bash
# First run — fails at chunk 88 of 150
conduit run pipeline.yaml
# ✗ Pipeline failed: ConnectionError at chunk 88/150
# ✓ Checkpoint saved — 87 chunks (870,000 rows) completed

# Second run — resumes automatically
conduit run pipeline.yaml
# ✓ Resuming from checkpoint: chunk 88/150
# ✓ Pipeline complete: 1,500,000 total rows
```

```yaml
runtime:
  checkpoint:
    enabled: true
    auto_resume: true
    retention: 7
    path: .conduit/checkpoints/
```

---

## Error Handling & Retry Strategy `PARTIAL`

Pipeline failures should be recoverable. Conduit provides configurable retry behavior, backoff strategies, and dead-letter routing for rows that fail repeatedly.

> **Current status:** Config model defined (`ErrorHandlingConfig` in models.py) with all fields. No retry logic, no dead-letter routing, no batch-level error handling implemented.

### Pipeline Config

```yaml
error_handling:
  max_retries: 3
  retry_delay_seconds: 30
  retry_backoff: exponential         # linear | exponential
  on_failure: abort                  # abort | skip_batch | dead_letter
  dead_letter_path: .conduit/dead_letter/
```

### Failure Modes

| Mode | Behavior |
| --- | --- |
| `abort` | Stop the pipeline immediately on first error |
| `skip_batch` | Log the failed batch, skip it, continue with remaining batches |
| `dead_letter` | Write failed rows to a dead-letter file for manual review, continue pipeline |

### Retry Behavior

```
Attempt 1 → fail → wait 30s
Attempt 2 → fail → wait 60s  (exponential)
Attempt 3 → fail → abort / skip_batch / dead_letter
```

Dead-letter files are stored as CSV in the configured path:

```
.conduit/dead_letter/
  orders_to_warehouse_2026-03-27T10:00:00_batch_88.csv
```

---

## Logging & Observability `PARTIAL`

Conduit uses structured logging throughout the pipeline. All log output goes to `stderr`, keeping `stdout` clean for piping and scripting.

> **Current status:** Basic Python logging implemented with configurable levels (INFO/DEBUG via `--verbose`). No structured JSON output, no log file rotation, no external log shipping.

### Log Format

```
2026-03-27 10:00:00 [INFO   ] conduit.pipeline: Pipeline 'orders_to_sf' — starting
2026-03-27 10:00:01 [INFO   ] conduit.engine.extract: Extracted 100,000 rows from CSV source 'orders'
2026-03-27 10:00:02 [INFO   ] conduit.engine.transform: Transform complete — 45,230 rows
2026-03-27 10:00:02 [INFO   ] conduit.validation.runner: Running 4 validation checks
2026-03-27 10:00:02 [ERROR  ] conduit.pipeline: Pipeline 'orders_to_sf' STOPPED — validation failed
```

### Planned Enhancements

| Feature | Description | Status |
| --- | --- | --- |
| Console logging | Human-readable log output to stderr | DONE |
| `--verbose` flag | Switch between INFO and DEBUG levels | DONE |
| JSON log format | `--log-format json` for machine-readable output | PLANNED |
| Log file output | `--log-file <path>` to write logs to a file | PLANNED |
| Run summary | Summary table at end of pipeline (rows extracted, transformed, loaded, duration) | PLANNED |

---

## Vault — Credential Resolution `PLANNED`

Secrets are never stored in pipeline configs or logs. The Conduit Vault stores all credentials encrypted with **AES-256**, using the OS keychain for key derivation. Credentials are resolved per-run and never cached in memory longer than needed.

> **Current status:** Not implemented. No encryption, no keychain integration, no vault CLI commands.

```yaml
# pipeline.yaml — no secrets ever stored here
sources:
  - name: orders
    type: postgres
    connection: my-pg-conn   # vault resolves credentials at runtime
```

---

## Connector Module System `PARTIAL`

Each database connector is an **independent, opt-in module**. Connectors are not bundled with Conduit core — users add only the ones they need for their project. This keeps the core lightweight with minimal dependencies. Each connector module brings its own driver (e.g. `psycopg2` for PostgreSQL, `pymongo` for MongoDB) only when explicitly added.

> **Current status:** CSV/TSV extractors and CSV loader are built-in (no module install needed). No connector management CLI, no plugin system, no database connector modules.

### Connector Management CLI

```bash
# Add a connector module (installs driver + enables it)
conduit source add postgres
conduit source add mongodb

# Remove a connector module (uninstalls driver)
conduit source rm mongodb

# Enable / disable without removing
conduit source enable bigquery
conduit source disable mysql

# List all available connectors and their status
conduit source list
```

### `conduit source list` Output

```bash
$ conduit source list

┌──────────────┬────────────┬──────────────────────────────┬───────────┐
│ Connector    │ Type       │ Driver                       │ Status    │
├──────────────┼────────────┼──────────────────────────────┼───────────┤
│ csv / tsv    │ src + dest │ (built-in)                   │ ● built-in│
│ postgres     │ src + dest │ psycopg2                     │ ● enabled │
│ mysql        │ src + dest │ pymysql                      │ ○ disabled│
│ bigquery     │ dest       │ google-cloud-bigquery        │ ○ not installed │
│ mongodb      │ src + dest │ pymongo                      │ ○ not installed │
│ excel        │ src        │ openpyxl                     │ ○ not installed │
│ s3           │ src + dest │ boto3                        │ ○ not installed │
│ snowflake    │ dest       │ snowflake-connector-python   │ ○ not installed │
└──────────────┴────────────┴──────────────────────────────┴───────────┘
```

### Module Architecture

Each connector module provides:
- **Extractor** — reads from the source, returns Arrow tables
- **Loader** — writes Arrow tables to the destination (if supported)
- **Schema inspector** — introspects source/destination schema for drift detection
- **Driver dependency** — the Python package required (installed automatically on `conduit source add`)

```
~/.conduit/modules/
  postgres/
    extractor.py
    loader.py
    inspector.py
    module.yaml        # metadata: name, driver, capabilities
  mongodb/
    extractor.py
    inspector.py
    module.yaml
```

### Connector Capabilities

| Connector | Type | Driver | Capabilities | Status |
| --- | --- | --- | --- | --- |
| csv / tsv | src + dest | (built-in) | schema inference | DONE |
| postgres | src + dest | `psycopg2` | incremental, schema inference | PLANNED |
| mysql | src + dest | `pymysql` | incremental, schema inference | PLANNED |
| bigquery | dest | `google-cloud-bigquery` | incremental | PLANNED |
| mongodb | src + dest | `pymongo` | schema inference | PLANNED |
| excel | src | `openpyxl` | — | PLANNED |
| parquet | src + dest | `pyarrow` (built-in) | schema inference, columnar | PLANNED |
| json / jsonl | src + dest | `pyarrow` (built-in) | — | PLANNED |
| s3 | src + dest | `boto3` | incremental | PLANNED |
| snowflake | dest | `snowflake-connector-python` | incremental, schema inference | PLANNED |

---

## Web UI `PLANNED`

Conduit includes an optional web interface for visual pipeline management. The web UI is served locally via FastAPI and is never exposed to the internet by default.

> **Current status:** Not implemented. No FastAPI server, no frontend, no web routes.

### Features

| Feature | Description | Status |
| --- | --- | --- |
| Pipeline dashboard | List all pipelines with status, schedule, last run | PLANNED |
| Pipeline editor | Visual YAML editor with validation | PLANNED |
| Run history | View past runs with logs, duration, row counts | PLANNED |
| Validation reports | Browse HTML/JSON quality reports | PLANNED |
| Connector management | Add/remove/enable/disable connectors via UI | PLANNED |
| Schema explorer | Browse source/destination schemas and drift status | PLANNED |

### How It Works

```
conduit serve --port 4000
    ├── FastAPI REST API       ← localhost:4000/api/
    └── Web UI                 ← localhost:4000/ui/
        ├── /ui/pipelines      ← dashboard
        ├── /ui/runs           ← run history
        ├── /ui/reports        ← validation reports
        ├── /ui/connectors     ← connector management
        └── /ui/schemas        ← schema explorer
```

The web UI can also be started alongside the scheduler via `conduit up`.

---

## Pipeline Templates `PLANNED`

Templates are the primary onboarding path. Users list available templates, pick the closest match to their use case, generate a pre-filled `pipeline.yaml`, and start running — no documentation needed.

> **Current status:** Not implemented. No template CLI commands, no template files.

### List Available Templates

```bash
$ conduit template list

┌──────────────────────────┬──────────────────────────────────────────┐
│ Template                 │ Description                              │
├──────────────────────────┼──────────────────────────────────────────┤
│ postgres-to-snowflake    │ Postgres source → Snowflake destination  │
│ postgres-to-bigquery     │ Postgres source → BigQuery destination   │
│ postgres-to-csv          │ Postgres source → CSV export             │
│ mysql-to-snowflake       │ MySQL source → Snowflake destination     │
│ csv-to-postgres          │ CSV file → Postgres destination          │
│ csv-to-bigquery          │ CSV file → BigQuery destination          │
│ excel-to-postgres        │ Excel file → Postgres destination        │
│ mongo-to-snowflake       │ MongoDB source → Snowflake destination   │
│ s3-to-bigquery           │ S3 source → BigQuery destination         │
│ multi-source-to-snowflake│ Multiple sources → Snowflake destination │
│ blank                    │ Empty template, minimal options          │
│ full                     │ All options documented with comments     │
└──────────────────────────┴──────────────────────────────────────────┘

Run "conduit template init <name>" to generate a pipeline.yaml
```

### Generate a Template

```bash
# Generate by template name — writes pipeline.yaml to current directory
conduit template init postgres-to-snowflake

# Generate by source + destination on the fly
conduit template init --source postgres --dest bigquery

# Output to a specific filename
conduit template init postgres-to-snowflake --output orders-pipeline.yaml

# Print to terminal without writing a file
conduit template init postgres-to-snowflake --print

# Full template — all options with inline comments
conduit template init full
```

### Generated Template Example

```yaml
# pipeline.yaml — generated by Conduit
# Template: postgres-to-snowflake
# Docs: https://github.com/draju1980/conduit-ETL/docs/templates

pipeline:
  name: my_pipeline                        # required: unique pipeline name
  schedule:
    cron: "0 6 * * *"                      # cron expression, or comment out for manual only
    # every: 1h                            # alternative: run every interval
    timezone: UTC
    on_failure: retry                      # retry | stop | alert
    retries: 3
    retry_delay_minutes: 5
    depends_on: []                         # pipelines that must succeed first

# ── Sources ──────────────────────────────────────────────
sources:
  - name: orders                           # reference name used in SQL
    type: postgres                         # connector type
    connection: my-pg-conn                 # vault connection name
    config:
      schema: public
      table: orders
    query: |                               # optional: custom SQL instead of full table
      SELECT * FROM orders
      WHERE updated_at > '{{ watermark }}'
    incremental:
      enabled: true
      strategy: timestamp                  # timestamp | id
      watermark_column: updated_at
    time_machine:
      schema_lock:
        enabled: true
        on_violation: block                # block | warn
        track: [columns, types, nullability]

# ── Transform ─────────────────────────────────────────────
transform:
  sql: |
    SELECT
      o.order_id,
      o.amount,
      o.status,
      o.updated_at
    FROM orders o
    WHERE o.status = 'active'

# ── Validation (Great Expectations) ───────────────────────
validation:
  engine: great_expectations
  suite: my_pipeline_suite
  on_failure: block                        # block | warn
  report:
    enabled: true
    path: .conduit/reports/
  expectations:
    - column: order_id
      expect: not_null
    - column: order_id
      expect: be_unique
    - column: amount
      expect: be_between
      min: 0
      max: 1000000
    - table:
      expect: row_count_to_be_between
      min: 1
      max: 10000000

# ── Destination ───────────────────────────────────────────
destinations:
  - name: warehouse
    type: snowflake
    connection: my-sf-conn                 # vault connection name
    mode: incremental                      # incremental | full_refresh
    config:
      database: ANALYTICS
      schema: PUBLIC
      table: ORDERS
      warehouse: COMPUTE_WH
    incremental:
      merge_key: [order_id]
      strategy: merge                      # merge | append

# ── Runtime ───────────────────────────────────────────────
runtime:
  chunking:
    extract_chunk_size: 10000
    load_batch_size: 5000
    max_memory_mb: 512
    spill_to_disk: true
  disk_check:
    enabled: true
    min_free_gb: 5
    safety_buffer_pct: 20
    on_failure: block
  checkpoint:
    enabled: true
    auto_resume: true
    retention: 7
```

---

## CLI Reference

| Command | Description | Status |
| --- | --- | --- |
| **General** | | |
| `conduit --version` | Show Conduit version | PLANNED |
| `conduit init` | Initialize a new Conduit project (creates `.conduit/` and sample `pipeline.yaml`) | PLANNED |
| `conduit up` | Start daemon, Airflow scheduler, API server, and web UI | PLANNED |
| `conduit down` | Stop everything | PLANNED |
| `conduit status` | Show running state and connections | PLANNED |
| **Templates** | | |
| `conduit template list` | List all available pipeline templates | PLANNED |
| `conduit template init <name>` | Generate a pipeline.yaml from a template | PLANNED |
| `conduit template init --source X --dest Y` | Generate template by connector combination | PLANNED |
| `conduit template init <name> --print` | Print template to terminal without writing file | PLANNED |
| **Running** | | |
| `conduit run pipeline.yaml` | Execute a pipeline | DONE |
| `conduit run pipeline.yaml --dry-run` | Validate without loading | DONE |
| `conduit run pipeline.yaml --restart` | Ignore checkpoint, start fresh | PLANNED |
| `conduit query "SELECT ..." --source conn` | Run an ad-hoc query | PLANNED |
| **Scheduling** | | |
| `conduit schedule pipeline.yaml --cron "..."` | Schedule a pipeline with cron expression | PLANNED |
| `conduit schedule pipeline.yaml --every 1h` | Schedule a pipeline by interval | PLANNED |
| `conduit unschedule pipeline.yaml` | Remove a pipeline schedule | PLANNED |
| `conduit pipeline list` | List all pipelines with schedule and status | PLANNED |
| `conduit pipeline status <name>` | Detailed status of a single pipeline | PLANNED |
| `conduit pipeline pause <name>` | Pause a scheduled pipeline | PLANNED |
| `conduit pipeline resume <name>` | Resume a paused pipeline | PLANNED |
| `conduit pipeline trigger <name>` | Manually trigger a pipeline run | PLANNED |
| **Validation** | | |
| `conduit validate pipeline.yaml` | Run validation suite without loading | DONE |
| `conduit report list` | List generated quality reports | PLANNED |
| `conduit report open pipeline.yaml` | Open latest report in browser | PLANNED |
| **Vault** | | |
| `conduit vault add / list / get / delete` | Manage encrypted secrets | PLANNED |
| **Connectors (Module System)** | | |
| `conduit source add <connector>` | Add and enable a connector module | PLANNED |
| `conduit source rm <connector>` | Remove a connector module | PLANNED |
| `conduit source enable <connector>` | Enable a disabled connector | PLANNED |
| `conduit source disable <connector>` | Disable without removing | PLANNED |
| `conduit source list` | List all connectors and their status | PLANNED |
| **Time Machine** | | |
| `conduit lock / unlock / drift <pipeline>` | Schema lock management | PLANNED |
| `conduit history / revert <pipeline>` | Config version management | PLANNED |
| **Checkpoints** | | |
| `conduit resume <pipeline>` | Resume a failed pipeline | PLANNED |
| `conduit checkpoint status / clean <pipeline>` | Checkpoint management | PLANNED |
| **Server** | | |
| `conduit serve --port 4000` | Start API + web app only (no scheduler) | PLANNED |

---

## Environment Variable Support `PLANNED`

Pipeline configs can reference environment variables using `${VAR}` syntax. This allows secrets, paths, and environment-specific values to be injected at runtime without hardcoding them in YAML files.

> **Current status:** Not implemented. No variable substitution in pipeline configs.

```yaml
sources:
  - name: orders
    type: postgres
    config:
      host: ${PG_HOST}
      port: ${PG_PORT:-5432}           # default value if not set
      database: ${PG_DATABASE}
      user: ${PG_USER}
      password: ${PG_PASSWORD}         # or use vault instead

destinations:
  - name: output
    type: csv
    config:
      path: ${OUTPUT_DIR}/orders.csv
```

Supported syntax:

| Syntax | Behavior |
| --- | --- |
| `${VAR}` | Required — fails if not set |
| `${VAR:-default}` | Optional — uses default if not set |
| `${VAR:?error message}` | Required — fails with custom error message if not set |

---

## `conduit init` — Project Scaffolding `PLANNED`

The `conduit init` command creates a new Conduit project directory with the standard layout and a sample pipeline.

> **Current status:** Not implemented.

```bash
$ conduit init my-project
Created project: my-project/
  ├── pipeline.yaml          # sample pipeline config
  ├── .conduit/
  │   ├── reports/           # validation reports
  │   ├── checkpoints/       # resume state
  │   ├── locks/             # schema snapshots
  │   └── history/           # config versions
  └── .gitignore             # ignores .conduit/checkpoints, dead_letter, etc.

# Or initialize in current directory
$ conduit init .
```

---

## Testing Strategy `PARTIAL`

> **Current status:** 33 unit/integration tests covering core ETL + validation logic. No Docker-based integration tests, no E2E tests against real databases, no lint/security CI gates.

### Testing Pyramid

```
                    ┌─────────────┐
                    │   E2E Tests │  ← full pipeline runs against real DBs
                    └──────┬──────┘
               ┌───────────┴───────────┐
               │   Integration Tests   │  ← connector + engine together
               └───────────┬───────────┘
          ┌─────────────────┴─────────────────┐
          │           Unit Tests              │  ← isolated functions & logic
          └───────────────────────────────────┘
```

### CI Gate — Every PR must pass

```yaml
jobs:
  unit-tests:                          # DONE — runs in ci.yml matrix
    run: pytest tests/unit --cov=conduit --cov-fail-under=80

  integration-tests:                   # PLANNED — no Docker services in CI
    services:
      postgres: postgres:15
      mysql: mysql:8
    run: pytest tests/integration

  e2e-tests:                           # PLANNED — no E2E test suite
    run: pytest tests/e2e

  lint:                                # PLANNED — not in CI workflow
    run: |
      ruff check .
      mypy .

  security:                            # PLANNED — not in CI workflow
    run: |
      bandit -r src/
      pip-audit
```

### Release Gate

```
Tag v0.x.0 pushed
      │
      ├── All CI checks green ✓
      ├── Coverage above 80% ✓
      ├── No security vulnerabilities ✓
      └── Lint clean ✓
      │
      ▼
Binary built for macOS (arm64 + amd64), Linux, Windows
      │
      ▼
GitHub Release published ✓
```

---

## Distribution `DONE`

| Phase | Method | Status |
|-------|--------|--------|
| Phase 1 | GitHub Releases binary CLI | DONE |