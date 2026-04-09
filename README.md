# Conduit-ETL

**Open-source, local-first ELT workbench for data engineers.**

Pull data from heterogeneous sources, transform with SQL, validate with built-in checks, and load to destinations — all from a single CLI tool built on Deno + TypeScript.

[![CI](https://github.com/mdraju/conduit-ETL/actions/workflows/ci.yml/badge.svg)](https://github.com/mdraju/conduit-ETL/actions/workflows/ci.yml)
[![JSR](https://jsr.io/badges/@conduit/etl)](https://jsr.io/@conduit/etl)
![Deno](https://img.shields.io/badge/deno-2.x-blue)
![Version](https://img.shields.io/badge/version-0.1.0-green)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

## Features

- **SQL transforms** — DuckDB-powered engine: JOINs, CTEs, aggregations, and window functions across all sources
- **10 destination types** — CSV, JSON, JSONL, Parquet, PostgreSQL, MySQL, Snowflake, BigQuery, MongoDB, and S3
- **30 Great Expectations-style validators** — table, column, aggregate, set membership, regex, uniqueness, numeric range, and string length checks with `mostly` threshold support
- **Legacy + GE validation** — schema checks, null checks, row counts, custom SQL assertions, and dry-run mode before any data lands
- **Configurable failure policy** — per-check `fail` or `warn` behavior, `mostly` parameter for partial pass thresholds, JSON validation reports with rich diagnostics
- **YAML-driven pipelines** — declarative `pipeline.yaml` config with Zod validation
- **Connector management CLI** — `conduit source add/rm/enable/disable/list` and `conduit destination add/rm/enable/disable/list`
- **JSR-distributed** — install directly from [jsr.io](https://jsr.io/@conduit/etl) with a single command

## Installation

Conduit is distributed via **[JSR](https://jsr.io/@conduit/etl)** — install directly to your desktop or server with a single command. No binaries to download, no package managers to configure.

### Prerequisites

- [Deno](https://deno.com) 2.x or later — install with `curl -fsSL https://deno.land/install.sh | sh`

### Install Conduit CLI globally

```bash
deno install -Agf -n conduit jsr:@conduit/etl/cli
```

This installs `conduit` as a global command on your machine. Flags explained:

| Flag | Purpose |
| --- | --- |
| `-A` | Grant all permissions (file, network, env, FFI — required for DuckDB and database drivers) |
| `-g` | Install globally (not scoped to current project) |
| `-f` | Force overwrite if already installed |
| `-n conduit` | Name the installed command `conduit` |

Make sure `~/.deno/bin` is in your `PATH`:

```bash
export PATH="$HOME/.deno/bin:$PATH"
```

### Verify the installation

```bash
conduit version
# conduit 0.1.0
#
# Components:
#   Deno                           2.x.x
#   DuckDB                         1.5.1
#   Zod                            3.x.x
#   ...
```

### Update to the latest version

```bash
deno install -Agf -n conduit jsr:@conduit/etl/cli
```

Re-running `deno install` pulls the latest version from JSR.

### Uninstall

```bash
deno uninstall conduit
```

### Why JSR

- **Cross-platform by default** — one install command works on macOS (Intel + Apple Silicon), Linux, and Windows
- **Native dependencies handled** — DuckDB and database drivers are resolved automatically per platform
- **No binary downloads** — no need to pick the right binary or manage GitHub release artifacts
- **Instant updates** — re-run `deno install` to pull the latest published version

## Quick Start

Once installed, scaffold and run a pipeline:

```bash
# Initialize a new project
conduit init

# Check installed version
conduit version

# Execute a pipeline
conduit run pipeline.yaml

# Validate without loading (dry-run mode)
conduit run pipeline.yaml --dry-run

# Run validation only
conduit validate pipeline.yaml

# Start the daemon (API server + scheduler + web UI)
conduit up

# Check running state
conduit status

# Stop the daemon
conduit down

# List destination connectors
conduit destination list
```

### Use as a library

```typescript
import { runPipeline, loadPipeline } from "jsr:@conduit/etl";

await runPipeline("pipeline.yaml");
```

Or add to your project's `deno.json`:

```json
{
  "imports": {
    "@conduit/etl": "jsr:@conduit/etl@^0.1.0"
  }
}
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

> **Status:** DONE = implemented | PLANNED = not yet implemented. See [PLAN.md](PLAN.md) for the full architecture and roadmap.

| Command | Description | Status |
| --- | --- | --- |
| **General** | | |
| `conduit version` | Show Conduit version + component versions | DONE |
| `conduit init` | Initialize a new Conduit project (creates `.conduit/` and sample `pipeline.yaml`) | DONE |
| `conduit up` | Start daemon, scheduler, API server, and web UI | DONE |
| `conduit down` | Stop everything | DONE |
| `conduit status` | Show running state and connections | DONE |
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

## Data Validation (Great Expectations-style)

Conduit includes a validation engine inspired by [Great Expectations](https://github.com/great-expectations/great_expectations) with **30 built-in expectations** plus 4 legacy check types. All expectations run via DuckDB SQL.

### Legacy checks (original format)

| Check | Description | Config |
| --- | --- | --- |
| `schema` | Verify output columns match expected names and types | `columns: [{name, type}]` |
| `null_check` | Assert required fields contain no nulls | `columns: [col1, col2]` |
| `row_count` | Catch empty result sets or unexpected row counts | `min:` / `max:` |
| `custom` | Arbitrary SQL assertions (rows returned = failures) | `sql:` (use `__result__` table) |

### GE-style expectations (30 built-in)

#### Table-level (6)

| Expectation | Description |
| --- | --- |
| `expect_table_row_count_to_equal` | Row count equals a specific value |
| `expect_table_row_count_to_be_between` | Row count is within a min/max range |
| `expect_table_column_count_to_equal` | Number of columns equals a specific value |
| `expect_table_column_count_to_be_between` | Number of columns is within a range |
| `expect_table_columns_to_match_ordered_list` | Columns match an exact ordered list |
| `expect_table_columns_to_match_set` | Columns match a set (order-independent) |

#### Column existence and type (3)

| Expectation | Description |
| --- | --- |
| `expect_column_to_exist` | Column exists in the table |
| `expect_column_values_to_be_of_type` | Column has a specific DuckDB type |
| `expect_column_values_to_be_in_type_list` | Column type is one of a list |

#### Completeness (2) — supports `mostly`

| Expectation | Description |
| --- | --- |
| `expect_column_values_to_not_be_null` | No null values (or within `mostly` threshold) |
| `expect_column_values_to_be_null` | All values are null |

#### Set membership (4) — supports `mostly`

| Expectation | Description |
| --- | --- |
| `expect_column_values_to_be_in_set` | Each value is in a given set |
| `expect_column_values_to_not_be_in_set` | No value is in a given set |
| `expect_column_distinct_values_to_equal_set` | Distinct values exactly match a set |
| `expect_column_distinct_values_to_contain_set` | Distinct values contain a required set |

#### Numeric (3) — supports `mostly`

| Expectation | Description |
| --- | --- |
| `expect_column_values_to_be_between` | Each value within min/max (optional `strict_min`/`strict_max`) |
| `expect_column_values_to_be_increasing` | Values are monotonically increasing |
| `expect_column_values_to_be_decreasing` | Values are monotonically decreasing |

#### Uniqueness (1) — supports `mostly`

| Expectation | Description |
| --- | --- |
| `expect_column_values_to_be_unique` | All values are unique (no duplicates) |

#### String pattern and length (4) — supports `mostly`

| Expectation | Description |
| --- | --- |
| `expect_column_values_to_match_regex` | Each value matches a regex pattern |
| `expect_column_values_to_not_match_regex` | No value matches a regex pattern |
| `expect_column_value_lengths_to_equal` | String length equals a specific value |
| `expect_column_value_lengths_to_be_between` | String length is within a range |

#### Aggregate statistics (7)

| Expectation | Description |
| --- | --- |
| `expect_column_min_to_be_between` | Column minimum is within a range |
| `expect_column_max_to_be_between` | Column maximum is within a range |
| `expect_column_mean_to_be_between` | Column mean is within a range |
| `expect_column_median_to_be_between` | Column median is within a range |
| `expect_column_stdev_to_be_between` | Column standard deviation is within a range |
| `expect_column_sum_to_be_between` | Column sum is within a range |
| `expect_column_unique_value_count_to_be_between` | Count of distinct values is within a range |

### The `mostly` parameter

Column-map expectations support a `mostly` threshold (0.0 to 1.0) that specifies what percentage of non-null values must pass. For example, `mostly: 0.95` means up to 5% unexpected values are tolerated.

```yaml
- expectation_type: expect_column_values_to_not_be_null
  kwargs:
    column: email
    mostly: 0.95    # passes if at least 95% of values are non-null
  on_failure: fail
```

### Rich result format

Every expectation returns detailed diagnostics:

- **element_count** — total rows examined
- **unexpected_count** — rows that violated the expectation
- **unexpected_percent** — percentage of violations
- **missing_count** / **missing_percent** — null value statistics
- **partial_unexpected_list** — sample of up to 20 failing values
- **observed_value** — human-readable summary (e.g., "100% match", "443.87")

### YAML configuration

Both legacy and GE-style checks can be mixed in the same pipeline:

```yaml
validation:
  # Legacy format
  - type: schema
    columns:
      - { name: order_id, type: INTEGER }
    on_failure: fail

  # GE-style expectations
  - expectation_type: expect_table_row_count_to_be_between
    kwargs:
      min_value: 1
      max_value: 10000000
    on_failure: warn

  - expectation_type: expect_column_values_to_be_in_set
    kwargs:
      column: status
      value_set: [active, completed, cancelled]
      mostly: 0.95
    on_failure: fail

  - expectation_type: expect_column_mean_to_be_between
    kwargs:
      column: amount
      min_value: 50
      max_value: 5000
```

Each check supports `on_failure: fail` (blocks load) or `on_failure: warn` (logs warning, continues).

Validation reports are saved as JSON to `.conduit/reports/`.

## Architecture

```
EXTRACT              NORMALIZE             TRANSFORM              VALIDATE               LOAD
+--------------+    +---------------+     +----------------+     +------------------+    +------------------+
| CSV / TSV    |--->| DataTable     |--->| DuckDB SQL     |--->| 30 GE-style      |--->| CSV / JSON(L)    |
| (future: DB  |    | -> temp CSV   |    | (JOINs, CTEs,  |    |   expectations   |    | Parquet / S3     |
|   sources)   |    | -> DuckDB     |    |  window funcs)  |    | + 4 legacy checks|    | PostgreSQL/MySQL |
+--------------+    |   table       |    +----------------+    | + mostly param   |    | Snowflake / BQ   |
 Connector layer    +---------------+     User SQL engine       +------------------+    | MongoDB          |
                     normalize/            transform.ts          expectations/ +          +------------------+
                     Uniform format        Virtual tables        validators.ts            loader/*.ts
```

**Pipeline flow:** Extract (CSV/TSV) -> Normalize (DataTable -> DuckDB) -> Transform (SQL) -> Validate (30 GE expectations + 4 legacy checks) -> Load (10 destination types)

### The normalize step

The normalize module (`src/ts/normalize.ts`) is the bridge between raw extracted data and the SQL engine. Every connector produces a `DataTable` (plain JS objects with column metadata). The normalize step:

1. Writes each `DataTable` to a temp CSV file
2. Uses DuckDB's `read_csv` with `auto_detect=true` to infer proper column types
3. Registers the data as an in-memory DuckDB table

This gives the transform and validation engines a consistent SQL-queryable format regardless of the data origin. When new source connectors are added (PostgreSQL, MongoDB, etc.), they only need to produce a `DataTable` — the normalize step handles everything from there.

## Tech Stack

| Component | Technology | Purpose |
| --- | --- | --- |
| Runtime | Deno 2.x | TypeScript-first, secure by default |
| SQL Engine | DuckDB (`@duckdb/node-api`) | In-process OLAP: transforms, joins, aggregations |
| Config Validation | Zod | Strict YAML schema validation with typed models |
| Config Format | `@std/yaml` | Pipeline definition in `pipeline.yaml` |
| CLI Framework | Cliffy | Command-line interface |
| Testing | `Deno.test` + `@std/assert` | Built-in test runner with coverage |
| Distribution | JSR (jsr.io) | Package registry for Deno / TypeScript |

## Destination Connectors

| Connector | Status | Driver |
| --- | --- | --- |
| CSV | Ready | `@std/csv` (built-in) |
| JSON | Ready | (built-in) |
| JSONL | Ready | (built-in) |
| Parquet | Ready | DuckDB `COPY TO` (built-in) |
| PostgreSQL | Ready | `npm:postgres` |
| MySQL | Ready | `npm:mysql2` |
| Snowflake | Ready | `npm:snowflake-sdk` |
| BigQuery | Ready | `npm:@google-cloud/bigquery` |
| MongoDB | Ready | `npm:mongodb` |
| S3 | Ready | `npm:@aws-sdk/client-s3` |

Use the CLI to manage destination connectors:

```bash
conduit destination list              # list all available connectors
conduit destination add postgres      # enable a destination connector
```

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

### Setup

```bash
# Clone the repo
git clone https://github.com/mdraju/conduit-ETL.git
cd conduit-ETL

# Install dependencies (DuckDB native binding requires scripts permission)
deno install --allow-scripts=npm:@duckdb/node-bindings
```

### Running locally

```bash
# Run the CLI directly from source
deno task dev run pipeline.yaml

# Or use deno run directly
deno run -A main.ts run pipeline.yaml
```

### Deno tasks reference

| Task | Command | Purpose |
| --- | --- | --- |
| `deno task dev` | `deno run -A main.ts` | Run CLI from source |
| `deno task test` | `deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/` | Run full test suite |
| `deno task test:cov` | Same + `--coverage=cov_profile` | Tests with coverage report |
| `deno task test:watch` | Same + `--watch` | Re-run tests on file change |
| `deno task lint` | `deno lint src/ts/ tests/ts/ main.ts` | Lint all source and test files |
| `deno task fmt` | `deno fmt src/ts/ tests/ts/ main.ts` | Auto-format code |
| `deno task check` | `deno check main.ts` | TypeScript type check |
| `deno task publish:dry` | `deno publish --dry-run --allow-slow-types --allow-dirty` | Validate JSR package |
| `deno task publish` | `deno publish --allow-slow-types` | Publish to jsr.io |

---

## Local Testing Guide

This section covers how to test every component of Conduit locally during development.

### Running the test suite

```bash
# Run all tests
deno task test

# Run tests with coverage report
deno task test:cov

# Watch mode — re-runs on file changes
deno task test:watch

# Run a specific test file
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/config_test.ts

# Run tests matching a name pattern
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys --filter "schema" tests/ts/
```

### Test coverage map

| Component | Test File | Tests | What's covered |
| --- | --- | --- | --- |
| Config loading | `tests/ts/config_test.ts` | 3 | YAML parsing, Zod validation, missing file errors |
| Normalize: session | `tests/ts/normalize/session_test.ts` | 2 | DuckDB session create, safe double-close |
| Normalize: register | `tests/ts/normalize/register_test.ts` | 4 | Table registration, empty tables, nulls, multi-source JOINs |
| Normalize: query | `tests/ts/normalize/query_test.ts` | 2 | Column type inference, invalid SQL errors |
| SQL transforms | `tests/ts/transform_test.ts` | 4 | SELECT, JOIN, WHERE filter, invalid SQL error handling |
| Validation: validators | `tests/ts/validation/validators_test.ts` | 11 | Schema (3), null_check (2), row_count (3), custom SQL (3) |
| Validation: runner | `tests/ts/validation/runner_test.ts` | 2 | on_failure policy, empty checks |
| Validation: report | `tests/ts/validation/report_test.ts` | 4 | Passed/failed state, summary counts, warn behavior |
| Expectations: table | `tests/ts/validation/expectations/table_test.ts` | 7 | Row count, column count, columns match (set/ordered) |
| Expectations: completeness | `tests/ts/validation/expectations/completeness_test.ts` | 4 | Not-null, be-null, mostly threshold |
| Expectations: set membership | `tests/ts/validation/expectations/set_membership_test.ts` | 6 | In-set, not-in-set, distinct-equal, distinct-contain, mostly |
| Expectations: numeric | `tests/ts/validation/expectations/numeric_test.ts` | 4 | Between, increasing, decreasing |
| Expectations: string | `tests/ts/validation/expectations/string_test.ts` | 5 | Regex match/not-match, length equal/between |
| Expectations: uniqueness | `tests/ts/validation/expectations/uniqueness_test.ts` | 2 | Unique pass, duplicate fail |
| Expectations: aggregate | `tests/ts/validation/expectations/aggregate_test.ts` | 6 | Min, max, mean, sum, unique-count between |
| Expectations: mostly | `tests/ts/validation/expectations/mostly_test.ts` | 8 | Threshold edge cases (0.0, 0.8, 1.0, nulls, rounding) |
| Full pipeline | `tests/ts/pipeline_test.ts` | 3 | End-to-end ETL, validate-only mode, report persistence |
| Project init | `tests/ts/init_test.ts` | 3 | Scaffolding, idempotency, no-overwrite protection |
| Daemon lifecycle | `tests/ts/daemon_test.ts` | 8 | State read/write, PID cleanup, stale process detection, uptime formatting |

### Testing the normalize module

The normalize module converts DataTables into DuckDB virtual tables. Tests are split by component:

```bash
# Run all normalize tests
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/normalize/

# Run individual components
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/normalize/session_test.ts
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/normalize/register_test.ts
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/normalize/query_test.ts
```

| File | What's tested |
| --- | --- |
| `session_test.ts` | Session creation with valid connection + temp dir, safe double-close |
| `register_test.ts` | Single table registration, empty tables, null preservation, multi-source JOINs |
| `query_test.ts` | DuckDB type inference (INTEGER, DOUBLE, VARCHAR), invalid SQL error handling |

### Testing the extract engine

The extract engine reads CSV/TSV files and converts them to `DataTable` objects.

```bash
# Run transform tests (extract is tested as part of the transform + pipeline tests)
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/transform_test.ts
```

To manually test extraction with your own CSV:

```bash
# Create a test pipeline that just extracts and outputs
cat > /tmp/test_extract.yaml << 'EOF'
pipeline:
  name: extract_test

sources:
  - name: my_data
    type: csv
    config:
      path: /path/to/your/data.csv

transform:
  sql: "SELECT * FROM my_data"

destinations:
  - name: output
    type: csv
    mode: full_refresh
    config:
      path: /tmp/extract_output.csv
EOF

deno run -A main.ts run /tmp/test_extract.yaml
```

### Testing the transform engine (DuckDB SQL)

The transform engine registers source tables in DuckDB and executes SQL across them.

```bash
# Run transform-specific tests
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/transform_test.ts
```

Tests cover:
- Simple `SELECT *` queries
- Multi-source `JOIN` operations
- `WHERE` filtering
- Error handling for invalid SQL

To test SQL transforms interactively, use the sample pipeline:

```bash
# Uses the test fixtures (orders.csv + regions.csv with a JOIN)
deno run -A main.ts run tests/ts/fixtures/sample_pipeline.yaml --dry-run
```

### Testing validation checks (legacy)

The legacy validation framework runs 4 check types. Tests are split by component:

```bash
# Run all validation tests (legacy + expectations)
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/

# Run legacy validator tests only
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/validators_test.ts
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/runner_test.ts
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/report_test.ts
```

| File | What's tested |
| --- | --- |
| `validators_test.ts` | All 4 legacy check types: schema (3 tests), null_check (2), row_count (3), custom SQL (3) |
| `runner_test.ts` | Orchestrator: on_failure policy (fail vs warn), empty checks, dual dispatch (legacy + GE) |
| `report_test.ts` | ValidationReport: passed/failed state, summary counts, warn behavior |

### Testing GE-style expectations (30 built-in)

Each expectation category has its own test file:

```bash
# Run all expectation tests
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/expectations/

# Run by category
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/expectations/table_test.ts
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/expectations/completeness_test.ts
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/expectations/set_membership_test.ts
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/expectations/numeric_test.ts
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/expectations/string_test.ts
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/expectations/uniqueness_test.ts
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/expectations/aggregate_test.ts
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/validation/expectations/mostly_test.ts
```

| File | What's tested |
| --- | --- |
| `table_test.ts` | Row count (equal/between), column count, columns match (set/ordered) |
| `completeness_test.ts` | Not-be-null (pass, fail, mostly), be-null |
| `set_membership_test.ts` | In-set (pass, fail, mostly), not-in-set, distinct equal/contain |
| `numeric_test.ts` | Between (pass, fail), increasing, decreasing |
| `string_test.ts` | Regex match/not-match, value lengths equal/between |
| `uniqueness_test.ts` | Unique pass, duplicate fail with partial_unexpected_list |
| `aggregate_test.ts` | Min, max, mean (pass+fail), sum, unique value count |
| `mostly_test.ts` | Edge cases: 0.0, 0.8 boundary, 1.0, nulls, rounding |

To test validation in dry-run mode (no data is loaded):

```bash
deno run -A main.ts validate tests/ts/fixtures/sample_pipeline.yaml
# Or equivalently:
deno run -A main.ts run tests/ts/fixtures/sample_pipeline.yaml --dry-run
```

Validation reports are saved as JSON to `.conduit/reports/`:

```bash
cat tests/ts/fixtures/.conduit/reports/*.json | head -50
```

### Testing destination loaders

Conduit has 10 destination loaders. Built-in loaders (CSV, JSON, JSONL, Parquet) can be tested locally without external services.

**CSV loader:**

```bash
cat > /tmp/test_csv_dest.yaml << 'EOF'
pipeline:
  name: csv_loader_test
sources:
  - name: orders
    type: csv
    config:
      path: tests/ts/fixtures/orders.csv
transform:
  sql: "SELECT * FROM orders"
destinations:
  - name: csv_out
    type: csv
    mode: full_refresh
    config:
      path: /tmp/conduit_csv_output.csv
EOF

deno run -A main.ts run /tmp/test_csv_dest.yaml
cat /tmp/conduit_csv_output.csv
```

**JSON loader:**

```bash
cat > /tmp/test_json_dest.yaml << 'EOF'
pipeline:
  name: json_loader_test
sources:
  - name: orders
    type: csv
    config:
      path: tests/ts/fixtures/orders.csv
transform:
  sql: "SELECT * FROM orders"
destinations:
  - name: json_out
    type: json
    mode: full_refresh
    config:
      path: /tmp/conduit_json_output.json
EOF

deno run -A main.ts run /tmp/test_json_dest.yaml
cat /tmp/conduit_json_output.json
```

**JSONL loader:**

```bash
# Same as above, but change type to "jsonl" and path to .jsonl
```

**Parquet loader:**

```bash
cat > /tmp/test_parquet_dest.yaml << 'EOF'
pipeline:
  name: parquet_loader_test
sources:
  - name: orders
    type: csv
    config:
      path: tests/ts/fixtures/orders.csv
transform:
  sql: "SELECT * FROM orders"
destinations:
  - name: parquet_out
    type: parquet
    mode: full_refresh
    config:
      path: /tmp/conduit_parquet_output.parquet
EOF

deno run -A main.ts run /tmp/test_parquet_dest.yaml
```

**Database loaders (PostgreSQL, MySQL, etc.):**

Database loaders require a running database instance. Use Docker for local testing:

```bash
# PostgreSQL
docker run -d --name conduit-pg -p 5432:5432 -e POSTGRES_PASSWORD=conduit -e POSTGRES_DB=conduit postgres:16

# MySQL
docker run -d --name conduit-mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=conduit -e MYSQL_DATABASE=conduit mysql:8

# MongoDB
docker run -d --name conduit-mongo -p 27017:27017 mongo:7
```

Example pipeline for PostgreSQL:

```yaml
destinations:
  - name: pg_out
    type: postgres
    mode: full_refresh
    config:
      host: localhost
      port: 5432
      database: conduit
      user: postgres
      password: conduit
      schema: public
      table: orders
```

### Testing the config loader

```bash
# Run config-specific tests
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/config_test.ts
```

Tests cover:
- Valid YAML parsing with Zod schema validation
- Validation check parsing (all 4 types)
- Error handling for missing files

To validate a pipeline config without running it:

```bash
# Dry-run validates config + runs transform + validation, but skips load
deno run -A main.ts run your_pipeline.yaml --dry-run
```

### Testing the full pipeline (end-to-end)

```bash
# Run pipeline integration tests
deno test --allow-read --allow-write --allow-env --allow-ffi --allow-net --allow-sys tests/ts/pipeline_test.ts
```

Tests the complete flow: Extract (CSV) -> Transform (DuckDB SQL JOIN) -> Validate (4 checks) -> Load (CSV output).

To run the sample pipeline end-to-end from source:

```bash
deno run -A main.ts run tests/ts/fixtures/sample_pipeline.yaml
```

Expected output:

```
============================================================
Pipeline 'test_orders' — starting
============================================================
--- EXTRACT ---
Extracted 5 rows from CSV source 'orders'
Extracted 3 rows from CSV source 'regions'
--- TRANSFORM ---
Transform complete: 4 rows, 5 columns
--- VALIDATE ---
[✓] schema: Schema check passed
[✓] null_check: Null check passed
[✓] row_count: Row count check passed
[✓] custom: Custom validation passed
--- LOAD ---
Loaded 4 rows to CSV destination 'output'
============================================================
Pipeline 'test_orders' — completed successfully
============================================================
```

### Testing CLI commands

#### `conduit init`

```bash
# Scaffold a new project in a temp directory
mkdir /tmp/conduit-test && cd /tmp/conduit-test
deno run -A /path/to/conduit-ETL/main.ts init

# Verify structure
ls -la .conduit/
# reports/  logs/  scheduler/  checkpoints/

cat pipeline.yaml
# Sample pipeline config with sources, transform, validation, destinations

# Running init again is safe — skips existing files
deno run -A /path/to/conduit-ETL/main.ts init
# "Project already initialized — nothing to create."

# Init in a specific directory
deno run -A /path/to/conduit-ETL/main.ts init --dir /tmp/another-project
```

#### `conduit up`

```bash
# Start the daemon on default port 4000
deno run -A main.ts up

# Start on a custom port
deno run -A main.ts up --port 5000

# Test the HTTP endpoints (in another terminal)
curl http://127.0.0.1:4000/health
# {"status":"ok","uptime":"12s"}

curl http://127.0.0.1:4000/api/status
# {"pid":12345,"port":4000,"startedAt":"...","version":"0.1.0"}

# Web UI placeholder
curl http://127.0.0.1:4000/ui
# <html>...<h1>Conduit Web UI</h1>...</html>

# Pipeline UI placeholder
curl http://127.0.0.1:4000/ui/pipelines
# <html>...<h1>Pipelines</h1>...</html>

# 404 for unknown routes
curl http://127.0.0.1:4000/unknown
# Not Found
```

#### `conduit status`

```bash
# When daemon is running
deno run -A main.ts status
# Conduit is running:
#   PID          12345
#   Port         4000
#   Version      0.1.0
#   Started      2026-04-09T10:00:00.000Z
#   Uptime       2m 30s

# When daemon is not running
deno run -A main.ts status
# Conduit is not running.
# Run 'conduit up' to start.
```

#### `conduit down`

```bash
# Stop a running daemon
deno run -A main.ts down
# Conduit stopped.

# When nothing is running
deno run -A main.ts down
# Conduit is not running.
```

#### `conduit version`

```bash
deno run -A main.ts version
# conduit 0.1.0
#
# Components:
#   Deno                           2.x.x
#   V8                             ...
#   TypeScript                     ...
#   DuckDB                         1.5.1
#   Zod                            3.x.x
#   MongoDB Driver                 6.x.x
```

#### Connector management

```bash
# List destination connectors
deno run -A main.ts destination list

# List source connectors
deno run -A main.ts source list

# Disable/enable a connector
deno run -A main.ts destination disable postgres
deno run -A main.ts destination enable postgres
```

### Testing with fixtures

The test suite includes fixtures in `tests/ts/fixtures/`:

| File | Description |
| --- | --- |
| `orders.csv` | 5-row sample orders table (order_id, customer_id, amount, status, region_id) |
| `regions.csv` | 3-row region lookup table (id, region) |
| `sample_pipeline.yaml` | Full pipeline config: 2 CSV sources, JOIN transform, 4 validation checks, CSV output |
| `helpers.ts` | Test helper functions: `createSampleTable()`, `createTableWithNulls()`, `createTableWithNegatives()` |

You can use these fixtures for quick manual testing:

```bash
# Run the full sample pipeline
deno run -A main.ts run tests/ts/fixtures/sample_pipeline.yaml

# Validate only (no load)
deno run -A main.ts validate tests/ts/fixtures/sample_pipeline.yaml
```

### Linting & formatting

```bash
deno task lint       # Lint all source and test files
deno task fmt        # Auto-format code
deno task check      # TypeScript type check
```

### Pre-commit checklist

Before committing, run these in order:

```bash
deno task fmt        # Format code
deno task lint       # Check for lint errors
deno task check      # Type check
deno task test       # Run full test suite
```

### Publishing to JSR

```bash
# Dry run — validates the package without publishing
deno task publish:dry

# Publish to jsr.io (requires scope ownership and auth)
deno task publish
```

Releases are triggered automatically by pushing a `v*` tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Project Structure

```
.
├── deno.json                  # Deno config, tasks, imports
├── main.ts                    # CLI entry point
├── mod.ts                     # Public library API
├── src/ts/
│   ├── cli.ts                 # Cliffy CLI (init, up, down, status, run, validate, etc.)
│   ├── config.ts              # YAML + Zod config loader
│   ├── daemon.ts              # Daemon lifecycle (PID, state, HTTP server)
│   ├── init.ts                # Project scaffolding (conduit init)
│   ├── models.ts              # Zod schemas (16 models)
│   ├── normalize/             # DataTable → DuckDB table registration (the bridge)
│   │   ├── mod.ts             # Public API (re-exports all normalize functions)
│   │   ├── session.ts         # DuckDB session lifecycle (create, close)
│   │   ├── register.ts        # DataTable → temp CSV → DuckDB table
│   │   └── query.ts           # SQL query execution against a session
│   ├── pipeline.ts            # Orchestrator (extract->normalize->transform->validate->load)
│   ├── util.ts                # Shared utilities
│   ├── engine/
│   │   ├── extract.ts         # CSV/TSV source extractors
│   │   └── transform.ts       # DuckDB SQL transform engine (uses normalize/)
│   ├── loader/
│   │   ├── mod.ts             # Loader registry
│   │   ├── csv_loader.ts
│   │   ├── json_loader.ts
│   │   ├── parquet_loader.ts
│   │   ├── postgres_loader.ts
│   │   ├── mysql_loader.ts
│   │   ├── snowflake_loader.ts
│   │   ├── bigquery_loader.ts
│   │   ├── mongodb_loader.ts
│   │   └── s3_loader.ts
│   └── validation/
│       ├── models.ts          # ValidationFinding, ValidationReport
│       ├── validators.ts      # 4 legacy validator implementations
│       ├── runner.ts          # Validation orchestrator (legacy + GE dual dispatch)
│       ├── reporter.ts        # JSON report + logging
│       └── expectations/      # Great Expectations-style validators (30 built-in)
│           ├── mod.ts         # Barrel import (registers all expectations)
│           ├── types.ts       # ExpectationResult, evaluateMostly, runColumnMapExpectation
│           ├── registry.ts    # Map<string, ExpectationFn> registry
│           ├── table.ts       # 6 table-level expectations
│           ├── column_existence.ts  # 3 column existence/type expectations
│           ├── completeness.ts      # 2 null/completeness expectations
│           ├── set_membership.ts    # 4 set membership expectations
│           ├── uniqueness.ts        # 1 uniqueness expectation
│           ├── numeric.ts           # 3 numeric range/ordering expectations
│           ├── string.ts            # 4 string/regex/length expectations
│           └── aggregate.ts         # 7 aggregate stat expectations
└── tests/ts/
    ├── config_test.ts              # Config loader tests
    ├── daemon_test.ts              # Daemon lifecycle tests
    ├── init_test.ts                # Project scaffolding tests
    ├── pipeline_test.ts            # End-to-end pipeline tests
    ├── transform_test.ts           # SQL transform engine tests
    ├── normalize/                  # Normalize module tests (1 file per component)
    │   ├── session_test.ts         # DuckDB session create/close
    │   ├── register_test.ts        # DataTable → DuckDB registration
    │   └── query_test.ts           # SQL query execution
    ├── validation/                 # Validation tests (1 file per component)
    │   ├── validators_test.ts      # Legacy: schema, null_check, row_count, custom
    │   ├── runner_test.ts          # Orchestrator + on_failure policy
    │   ├── report_test.ts          # ValidationReport summary + state
    │   └── expectations/           # GE-style expectation tests (1 file per category)
    │       ├── table_test.ts       # Table-level expectations
    │       ├── completeness_test.ts # Null/not-null + mostly
    │       ├── set_membership_test.ts # Set membership + mostly
    │       ├── numeric_test.ts     # Between, increasing, decreasing
    │       ├── string_test.ts      # Regex, lengths
    │       ├── uniqueness_test.ts  # Unique values
    │       ├── aggregate_test.ts   # Min, max, mean, sum, etc.
    │       └── mostly_test.ts      # mostly parameter edge cases
    └── fixtures/
        ├── helpers.ts
        ├── orders.csv
        ├── regions.csv
        └── sample_pipeline.yaml
```

## Roadmap

Key planned features:

- **Database sources** — PostgreSQL, MySQL, MongoDB, BigQuery, Snowflake, S3 extractors
- **Incremental loads** — watermark-based extract with merge/append strategies
- **Multi-column expectations** — column pair comparisons, compound uniqueness, cross-column assertions
- **Distribution expectations** — KL divergence, quantile checks, chi-squared tests
- **Format validators** — email, UUID, IP address, date format, JSON schema validation
- **Expectation suites** — named collections of expectations stored as `.conduit/suites/*.yaml`
- **Expectation profiler** — auto-generate expectations from data samples
- **Error handling & retries** — configurable retry backoff, skip_batch, dead-letter routing
- **Environment variables** — `${VAR}` substitution in pipeline configs
- **Chunked streaming** — bounded memory processing for large datasets
- **Checkpoint & resume** — pick up failed pipelines from last successful chunk
- **Schema locking** — detect source/destination drift before it breaks pipelines

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and add tests
4. Run the test suite (`deno task test`)
5. Commit and push (`git push origin feature/my-feature`)
6. Open a Pull Request

## License

MIT — see [LICENSE](LICENSE) for details.
