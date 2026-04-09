# Conduit — Architecture & Design Plan

> **Status Legend:** DONE = implemented & tested | PARTIAL = config/models exist but logic incomplete | PLANNED = not yet implemented

## Overview

Conduit is a local-first ELT (Extract, Transform, Load) workbench for data engineers. It provides a unified SDK and CLI to pull data from heterogeneous sources, transform it with SQL, and export to destination databases or files — all from a single tool built on Deno + TypeScript.

---

## High-Level Data Flow

```
EXTRACT                 TRANSFORM                  VALIDATE                   LOAD
[PARTIAL]               [DONE]                     [DONE - custom]            [PARTIAL]
┌─────────────┐        ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ Postgres     │        │                  │       │ Custom           │       │ Snowflake        │
│ CSV / Excel  │──────▶ │  DuckDB (SQL)    │─────▶ │ Validation       │─────▶ │ BigQuery         │
│ BigQuery     │ Rows   │  Transform       │       │ Framework        │       │ CSV export       │
│ MongoDB      │        │                  │       │                  │       │ S3               │
└─────────────┘        └──────────────────┘       └──────────────────┘       └──────────────────┘
  Connector Layer         In-memory engine           Data quality gate          Batch writer
  + Vault secrets         + Schema checks            + 4 check types            + Incremental
  (CSV/TSV only)                                     (not GE-based)             (full_refresh only)
```

---

## Step-by-Step Breakdown

### Step 1 — Extract `PARTIAL`

The user defines sources in `pipeline.yaml` or via the web UI. The connector layer pulls data from each source. Vault resolves encrypted credentials at this point — never before. Each source streams data in chunks, not all at once, keeping memory usage low.

> **Current status:** Only CSV/TSV extractors implemented. No database connectors, no vault integration, no chunked streaming — entire dataset loaded into memory.

### Step 2 — Normalize `DONE`

Each connector converts its source data into a **DataTable** (plain JS objects with column metadata). The normalize module (`src/ts/normalize.ts`) writes each DataTable to a temp CSV and registers it as a DuckDB table via `read_csv` with `auto_detect=true`. This gives DuckDB a consistent in-memory format regardless of the origin.

The normalize module provides:
- `createSession()` / `closeSession()` — DuckDB session lifecycle
- `registerTable()` / `registerSources()` — DataTable → DuckDB table registration
- `querySession()` — Execute SQL and return results as DataTable

Both the transform engine and custom validation checks use the normalize module, eliminating duplicated DuckDB registration logic.

> **Current status:** Fully implemented in `src/ts/normalize.ts` with 8 dedicated tests. CSV/TSV sources are read via `@std/csv`, represented as `DataTable { columns: ColumnInfo[], rows: Record<string, unknown>[] }`. DuckDB auto-detects proper column types (INTEGER, DOUBLE, etc.) during normalization. Schema inference not yet implemented for other source types.

### Step 3 — Transform `DONE`

DuckDB registers all normalized sources as virtual tables. The user's SQL runs across all of them as if they were a single database. Full SQL is supported: JOINs, aggregations, CTEs, and window functions across sources.

```sql
SELECT o.*, r.region
FROM orders o
JOIN regions r ON o.region_id = r.id
WHERE o.status = 'active'
```

### Step 4 — Validate (Great Expectations-style) `DONE`

Before writing to the destination, Conduit runs the data quality validation pass. This step verifies that the transformed data meets defined expectations before any data lands at the destination.

> **Current status:** Full validation engine with 30 GE-style expectations + 4 legacy check types. All expectations run via DuckDB SQL through the normalize module. Supports `mostly` threshold parameter, rich result format (element_count, unexpected_count, partial_unexpected_list), and backwards-compatible YAML config (old `type:` and new `expectation_type:` formats coexist). One shared DuckDB session per validation run. 81 tests cover all expectations.

| Check | Description | Status |
| --- | --- | --- |
| Schema check (legacy) | Output columns match destination schema | DONE |
| Null check (legacy) | Required fields are not empty | DONE |
| Row count (legacy) | Catches silent empty result sets | DONE |
| Custom SQL (legacy) | Arbitrary SQL validation queries | DONE |
| GE: Table-level (6) | Row count, column count, column matching | DONE |
| GE: Column existence (3) | Column exists, type check, type list | DONE |
| GE: Completeness (2) | Not-null, be-null with `mostly` | DONE |
| GE: Set membership (4) | In-set, not-in-set, distinct equal/contain | DONE |
| GE: Numeric (3) | Between, increasing, decreasing | DONE |
| GE: Uniqueness (1) | Unique values with `mostly` | DONE |
| GE: String (4) | Regex match, lengths equal/between | DONE |
| GE: Aggregate (7) | Min, max, mean, median, stdev, sum, unique count | DONE |
| GE: Multi-column | Column pair, compound uniqueness | PLANNED |
| GE: Distribution | KL divergence, quantiles, chi-squared | PLANNED |
| GE: Format validators | Email, UUID, IP, date format | PLANNED |
| Expectation suites | Named YAML collections | PLANNED |
| Dry run mode | Stops here and reports what would load | DONE |

### Step 5 — Load `PARTIAL`

The connector writes to the destination in batches. Supports both full refresh and incremental modes. On failure, Conduit logs the exact batch, row, and error for debugging.

> **Current status:** Destination connector modules implemented for CSV, JSON/JSONL, Parquet (via DuckDB `COPY TO`), PostgreSQL, MySQL, Snowflake, BigQuery, MongoDB, and S3. All loaders follow the same interface: `(table: DataTable, dest: DestinationConfig, baseDir: string) => Promise<void>`. Incremental merge/append logic not yet implemented — all loaders currently support full_refresh mode.

---

## Orchestration — Inbuilt Scheduler `PARTIAL`

An embedded cron-based scheduler runs inside Conduit as the scheduling engine. Users never interact with a separate scheduler — no DAG files, no external UI, no external config. Conduit owns the entire scheduling experience and auto-generates everything needed internally from `pipeline.yaml`.

> **Current status:** Daemon lifecycle implemented (`conduit up/down/status/init`). HTTP server with `/health`, `/api/status`, and `/ui` endpoints. PID file management and stale process detection. Scheduler logic, cron scheduling, and pipeline dependency resolution not yet implemented.

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
        Scheduler running internally     ← hidden, users never see this
        Jobs auto-generated from pipeline.yaml
        State + logs → ~/.conduit/scheduler/
```

### What `conduit up` Starts

```
conduit up
    ├── Conduit daemon
    ├── Cron scheduler           ← internal, auto-started
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

The scheduler ensures regions_sync and customers_load
complete successfully before orders_to_snowflake runs.
Users define this in pipeline.yaml — no DAG writing needed.
```

---

## Data Quality — Great Expectations Integration `PARTIAL`

Great Expectations (or equivalent TS-based validation engine) validates that data meets defined quality standards **before it lands at the destination**. Conduit integrates GE-style expectations as the validation engine in Step 4 of the ETL flow.

> **Current status:** Validation is implemented using a custom framework (schema, null_check, row_count, custom SQL checks) — NOT Great Expectations. GE integration is planned but not yet built. The custom framework covers the core use cases listed below. JSON reports are generated; HTML reports via GE are not available.

### How It Works

1. User defines an **expectation suite** per pipeline in `pipeline.yaml`
2. After the SQL transform, Conduit passes the result to the validation engine
3. The engine runs all expectations against the data
4. On failure: pipeline blocks, logs the violations, and skips the load step
5. On success: pipeline proceeds to load
6. A **data quality report** is generated automatically on every run

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
# Running validation suite: orders_quality_suite
# ✓ order_id — not_null               passed (100,000 rows)
# ✓ order_id — be_unique              passed (100,000 unique)
# ✓ amount   — be_between [0, 1M]     passed
# ✗ status   — be_in_set              FAILED — 42 unexpected values found: ['cancelled']
# ✗ Pipeline blocked — fix violations before loading
```

### Data Quality Reports

JSON reports are generated on every run, stored in `.conduit/reports/`:

```
.conduit/
└── reports/
    ├── orders_quality_suite_2026-03-27T10-00-00.json
    └── orders_quality_suite_2026-03-27T16-00-00.json
```

Reports will also be accessible from the Conduit web UI at `localhost:4000/ui/reports` once the UI is built.

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
| Runtime | Deno 2.x | TypeScript-first, secure by default | DONE |
| ETL Engine | DuckDB (`@duckdb/node-api`) | In-memory SQL transforms | DONE |
| Orchestration | Embedded cron scheduler | Pipeline scheduling and dependencies | PLANNED |
| Data Quality | Custom TS validators (GE planned) | Validation, documentation, monitoring | PARTIAL |
| Error Handling | Retry + backoff + dead letter | Configurable failure recovery | PARTIAL (config only) |
| Logging | `console.*` / `@std/log` | Structured log output to stderr | PARTIAL (basic logging done) |
| SDK / CLI | Deno + Cliffy | Core SDK and CLI | DONE |
| Web UI | TBD (Hono / Fresh / Oak) | Visual pipeline management | PLANNED |
| Credential Security | Conduit Vault (AES-256) | Encrypted secrets, OS keychain | PLANNED |
| Config | `@std/yaml` + Zod + env vars | Pipeline definition with variable substitution | PARTIAL (YAML + Zod done, env vars planned) |
| Connectors | Pluggable modules | Per-source/destination drivers | PARTIAL (CSV/TSV source only; all destinations done) |
| Distribution | JSR (jsr.io) via `deno install` | Cross-platform package distribution | DONE |
| Testing | `Deno.test` + `@std/assert` | Unit, integration, E2E | PARTIAL (unit tests done, no integration/E2E) |

---

## Incremental Loads `PARTIAL`

Conduit tracks a **watermark** (last run timestamp or last ID) per pipeline. On subsequent runs, only new or updated rows are pulled — dramatically reducing load times and destination write costs for large datasets.

> **Current status:** Incremental config models defined in Zod schemas (strategy, watermark_column, merge_key). No watermark tracking, no state persistence, no incremental extraction or merge logic implemented.

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
│   ├── 2026-03-27T10-00-00.yaml
│   └── 2026-03-27T16-00-00.yaml
├── checkpoints/
│   └── orders_to_warehouse/
│       ├── state.json
│       ├── watermarks.json
│       └── manifest.json
└── reports/
    └── orders_quality_suite_2026-03-27T10-00-00.json
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

> **Current status:** Zod config model defined. No disk check logic implemented.

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

> **Current status:** Zod config model defined (extract_chunk_size, load_batch_size, max_memory_mb, spill_to_disk). No chunking implemented — entire dataset loaded into memory.

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

> **Current status:** Zod config model defined (enabled, auto_resume, retention, path). No checkpoint saving, no resume logic, no `--restart` flag implemented.

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

> **Current status:** Zod config model defined (`ErrorHandlingConfig` in src/ts/models.ts) with all fields. No retry logic, no dead-letter routing, no batch-level error handling implemented.

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
  orders_to_warehouse_2026-03-27T10-00-00_batch_88.csv
```

---

## Logging & Observability `PARTIAL`

Conduit uses structured logging throughout the pipeline. All log output goes to `stderr`, keeping `stdout` clean for piping and scripting.

> **Current status:** Basic console logging implemented (`console.log/warn/error`). No structured JSON output, no log file rotation, no external log shipping, no `--verbose` flag yet.

### Log Format

```
Pipeline 'orders_to_sf' — starting
Extracted 100000 rows from CSV source 'orders'
Transform complete: 45230 rows, 12 columns
Running 4 validation check(s) for pipeline 'orders_to_sf'
[✓] schema: Schema check passed
[✗] custom: Custom validation failed: 42 violating row(s) found
Pipeline 'orders_to_sf' STOPPED — validation failed
```

### Planned Enhancements

| Feature | Description | Status |
| --- | --- | --- |
| Console logging | Human-readable log output to stderr | DONE |
| `--verbose` flag | Switch between INFO and DEBUG levels | PLANNED |
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

Each database connector is an **independent module**. All driver packages are resolved as npm dependencies via Deno's npm compatibility — users enable only the connectors they need for their project via the CLI.

> **Current status:** CSV/TSV extractors built-in. Destination loaders implemented for all planned connectors (CSV, JSON/JSONL, Parquet, PostgreSQL, MySQL, Snowflake, BigQuery, MongoDB, S3). Destination CLI management commands (`conduit destination add/rm/enable/disable/list`) implemented. Source connector management CLI still planned.

### Connector Management CLI

```bash
# ── Source connectors (planned) ──
conduit source add postgres
conduit source rm mongodb
conduit source enable bigquery
conduit source disable mysql
conduit source list

# ── Destination connectors ──
conduit destination add postgres
conduit destination rm mongodb
conduit destination enable bigquery
conduit destination disable mysql
conduit destination list
```

### `conduit source list` Output

```bash
$ conduit source list

┌──────────────┬────────────┬──────────────────────────────┬───────────┐
│ Connector    │ Type       │ Driver                       │ Status    │
├──────────────┼────────────┼──────────────────────────────┼───────────┤
│ csv / tsv    │ src + dest │ @std/csv (built-in)          │ ● built-in│
│ postgres     │ src + dest │ npm:postgres                 │ ● enabled │
│ mysql        │ src + dest │ npm:mysql2                   │ ○ disabled│
│ bigquery     │ dest       │ npm:@google-cloud/bigquery   │ ○ disabled│
│ mongodb      │ src + dest │ npm:mongodb                  │ ○ disabled│
│ excel        │ src        │ npm:exceljs                  │ ○ disabled│
│ s3           │ src + dest │ npm:@aws-sdk/client-s3       │ ○ disabled│
│ snowflake    │ dest       │ npm:snowflake-sdk            │ ○ disabled│
└──────────────┴────────────┴──────────────────────────────┴───────────┘
```

### `conduit destination list` Output

```bash
$ conduit destination list

CONNECTOR      STATUS       DRIVER
------------------------------------------------------------------
bigquery       ready        npm:@google-cloud/bigquery
csv            ready        (built-in)
json           ready        (built-in)
jsonl          ready        (built-in)
mongodb        ready        npm:mongodb
mysql          ready        npm:mysql2
parquet        ready        (built-in)
postgres       ready        npm:postgres
s3             ready        npm:@aws-sdk/client-s3
snowflake      ready        npm:snowflake-sdk
```

### Module Architecture

Each connector module provides:
- **Extractor** — reads from the source, returns DataTable (rows + column metadata)
- **Loader** — writes DataTable to the destination (if supported)
- **Schema inspector** — introspects source/destination schema for drift detection
- **Driver dependency** — the npm package required (resolved via Deno npm compat)

```
src/ts/loader/
  csv_loader.ts        # built-in
  json_loader.ts       # built-in
  parquet_loader.ts    # DuckDB COPY TO (built-in)
  postgres_loader.ts   # npm:postgres
  mysql_loader.ts      # npm:mysql2
  snowflake_loader.ts  # npm:snowflake-sdk
  bigquery_loader.ts   # npm:@google-cloud/bigquery
  mongodb_loader.ts    # npm:mongodb
  s3_loader.ts         # npm:@aws-sdk/client-s3
  mod.ts               # LoaderFn type + registry
```

### Connector Capabilities

| Connector | Source | Destination | Driver | Capabilities | Status |
| --- | --- | --- | --- | --- | --- |
| csv / tsv | DONE | DONE | `@std/csv` (built-in) | schema inference | DONE |
| postgres | PLANNED | DONE | `npm:postgres` | incremental, schema inference | PARTIAL |
| mysql | PLANNED | DONE | `npm:mysql2` | incremental, schema inference | PARTIAL |
| bigquery | — | DONE | `npm:@google-cloud/bigquery` | incremental | PARTIAL |
| mongodb | PLANNED | DONE | `npm:mongodb` | schema inference | PARTIAL |
| excel | PLANNED | — | `npm:exceljs` | — | PLANNED |
| parquet | PLANNED | DONE | DuckDB `COPY TO` (built-in) | schema inference, columnar | PARTIAL |
| json / jsonl | PLANNED | DONE | (built-in) | — | PARTIAL |
| s3 | PLANNED | DONE | `npm:@aws-sdk/client-s3` | incremental, csv/parquet formats | PARTIAL |
| snowflake | — | DONE | `npm:snowflake-sdk` | incremental, schema inference | PARTIAL |

---

## Web UI `PLANNED`

Conduit will include an optional web interface for visual pipeline management. The web UI will be served locally via a lightweight Deno HTTP framework (Hono / Fresh / Oak) and is never exposed to the internet by default.

> **Current status:** Not implemented. No HTTP server, no frontend, no web routes.

### Features

| Feature | Description | Status |
| --- | --- | --- |
| Pipeline dashboard | List all pipelines with status, schedule, last run | PLANNED |
| Pipeline editor | Visual YAML editor with validation | PLANNED |
| Run history | View past runs with logs, duration, row counts | PLANNED |
| Validation reports | Browse JSON quality reports | PLANNED |
| Connector management | Add/remove/enable/disable connectors via UI | PLANNED |
| Schema explorer | Browse source/destination schemas and drift status | PLANNED |

### How It Works

```
conduit serve --port 4000
    ├── REST API              ← localhost:4000/api/
    └── Web UI                ← localhost:4000/ui/
        ├── /ui/pipelines     ← dashboard
        ├── /ui/runs          ← run history
        ├── /ui/reports       ← validation reports
        ├── /ui/connectors    ← connector management
        └── /ui/schemas       ← schema explorer
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

# ── Validation ────────────────────────────────────────────
validation:
  - type: schema
    columns:
      - { name: order_id, type: INTEGER }
      - { name: amount, type: DECIMAL }
    on_failure: fail

  - type: null_check
    columns: [order_id, amount]
    on_failure: fail

  - type: row_count
    min: 1
    max: 10000000
    on_failure: warn

  - type: custom
    sql: |
      SELECT * FROM __result__
      WHERE amount < 0 OR amount > 1000000
    on_failure: fail

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
| `conduit version` | Show Conduit version + component versions | DONE |
| `conduit init` | Initialize a new Conduit project (creates `.conduit/` and sample `pipeline.yaml`) | PLANNED |
| `conduit up` | Start daemon, scheduler, API server, and web UI | PLANNED |
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
| **Source Connectors** | | |
| `conduit source add <connector>` | Add and enable a source connector module | DONE |
| `conduit source rm <connector>` | Remove a source connector module | DONE |
| `conduit source enable <connector>` | Enable a disabled source connector | DONE |
| `conduit source disable <connector>` | Disable source without removing | DONE |
| `conduit source list` | List all source connectors and their status | DONE |
| **Destination Connectors** | | |
| `conduit destination add <connector>` | Add and enable a destination connector module | DONE |
| `conduit destination rm <connector>` | Remove a destination connector module | DONE |
| `conduit destination enable <connector>` | Enable a disabled destination connector | DONE |
| `conduit destination disable <connector>` | Disable destination without removing | DONE |
| `conduit destination list` | List all destination connectors and their status | DONE |
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

> **Current status:** 24 test steps across 4 test files covering core ETL + validation logic. Uses `Deno.test` + `@std/assert` (no external test runner). No integration tests against real databases, no E2E tests, no lint/security CI gates.

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
  test:                                # DONE — runs in ci.yml matrix
    run: deno task test

  type-check:                          # DONE
    run: deno check main.ts mod.ts

  lint:                                # DONE
    run: deno lint

  integration-tests:                   # PLANNED — no Docker services in CI
    services:
      postgres: postgres:15
      mysql: mysql:8
    run: deno test tests/ts/integration/ --allow-all

  e2e-tests:                           # PLANNED — no E2E test suite
    run: deno test tests/ts/e2e/ --allow-all

  security:                            # PLANNED — not in CI workflow
    run: |
      deno info --json
      npm audit
```

### Release Gate

```
Tag v0.x.0 pushed
      │
      ├── All CI checks green ✓
      ├── Type check passes ✓
      ├── Lint clean ✓
      ├── Tests passing ✓
      └── JSR publish dry-run succeeds ✓
      │
      ▼
Package published to JSR via deno publish
      │
      ▼
Users install via: deno install -Agf -n conduit jsr:@conduit/etl/cli
```

---

## Distribution `DONE`

| Phase | Method | Status |
|-------|--------|--------|
| Phase 1 | JSR (jsr.io) via `deno install` | DONE |

### How users install

```bash
# Install globally as a CLI command
deno install -Agf -n conduit jsr:@conduit/etl/cli

# Or use as a library
import { runPipeline } from "jsr:@conduit/etl";
```

### Why JSR over `deno compile` binaries

- **Native dependency handling**: DuckDB's `.node` addon has an `@rpath` dependency on `libduckdb.dylib`. `deno compile` cannot bundle shared libraries alongside native addons, so compiled binaries fail at runtime. `deno install` from JSR resolves `node_modules` correctly, including adjacent shared libraries.
- **Cross-platform by default**: JSR publishes platform-agnostic source; Deno fetches the correct native deps per user's platform on install.
- **No binary maintenance**: No need to build and upload separate binaries for macOS arm64, Linux amd64, Windows amd64. One `deno publish` → all platforms.
- **Updates via re-install**: Users update with `deno install -Agf -n conduit jsr:@conduit/etl/cli` — Deno pulls the latest version.
