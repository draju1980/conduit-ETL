/**
 * `conduit init` — scaffolds a new Conduit project in the current directory.
 *
 * Creates:
 *   .conduit/           — project state directory
 *   .conduit/reports/   — validation reports
 *   .conduit/logs/      — run logs
 *   pipeline.yaml       — sample pipeline config
 */

import { join } from "@std/path";
import { ensureDirSync, existsSync } from "@std/fs";

const SAMPLE_PIPELINE = `# Conduit ETL Pipeline
# Documentation: https://github.com/conduit-etl/conduit

pipeline:
  name: my_pipeline
  description: "Sample pipeline — edit this to match your data"

sources:
  - name: input_data
    type: csv
    config:
      path: data/input.csv

transform:
  sql: |
    SELECT *
    FROM input_data

validation:
  - type: row_count
    min: 1
    on_failure: warn

  - type: null_check
    columns: []
    on_failure: fail

destinations:
  - name: output
    type: csv
    mode: full_refresh
    config:
      path: output/result.csv
`;

export interface InitResult {
  created: string[];
  skipped: string[];
}

export function initProject(base?: string): InitResult {
  const dir = base ?? Deno.cwd();
  const conduitDir = join(dir, ".conduit");
  const result: InitResult = { created: [], skipped: [] };

  // Create .conduit subdirectories
  const dirs = [
    conduitDir,
    join(conduitDir, "reports"),
    join(conduitDir, "logs"),
    join(conduitDir, "scheduler"),
    join(conduitDir, "checkpoints"),
  ];

  for (const d of dirs) {
    if (existsSync(d)) {
      result.skipped.push(d);
    } else {
      ensureDirSync(d);
      result.created.push(d);
    }
  }

  // Create sample pipeline.yaml
  const pipelinePath = join(dir, "pipeline.yaml");
  if (existsSync(pipelinePath)) {
    result.skipped.push(pipelinePath);
  } else {
    Deno.writeTextFileSync(pipelinePath, SAMPLE_PIPELINE);
    result.created.push(pipelinePath);
  }

  // Create data/ and output/ directories referenced in the sample
  for (const sub of ["data", "output"]) {
    const p = join(dir, sub);
    if (existsSync(p)) {
      result.skipped.push(p);
    } else {
      ensureDirSync(p);
      result.created.push(p);
    }
  }

  return result;
}
