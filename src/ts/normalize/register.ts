/**
 * Table registration — converts DataTables into DuckDB virtual tables.
 *
 * ┌────────────┐      ┌──────────────┐      ┌────────────────┐
 * │  DataTable  │ ───► │  Temp CSV    │ ───► │  DuckDB Table  │
 * │ (JS objects)│      │  (on disk)   │      │  (in-memory)   │
 * └────────────┘      └──────────────┘      └────────────────┘
 *
 * Why temp CSV? DuckDB's `read_csv` with `auto_detect=true` infers
 * column types (INTEGER, DOUBLE, etc.) from the actual data, which
 * is more accurate than the VARCHAR columns that @std/csv produces.
 */

import type { DataTable } from "../models.ts";
import type { DuckSession } from "./session.ts";
import { writeCsvSync } from "../util.ts";

/**
 * Register a single DataTable as a DuckDB table.
 *
 * Writes the DataTable to a temp CSV file, then uses DuckDB's
 * `read_csv` with `auto_detect=true` to infer proper column types
 * and register it as an in-memory table.
 *
 * @param session - The DuckDB session to register into
 * @param name    - The table name (used in SQL queries)
 * @param table   - The DataTable to register
 */
export async function registerTable(
  session: DuckSession,
  name: string,
  table: DataTable,
): Promise<void> {
  const csvPath = `${session.tmpDir}/${name}.csv`;
  writeCsvSync(csvPath, table);

  await session.conn.run(
    `CREATE TABLE "${name}" AS SELECT * FROM read_csv('${csvPath}', auto_detect=true)`,
  );

  session.tables.push(name);
  console.log(
    `Registered source '${name}' (${table.rows.length} rows, ${table.columns.length} cols)`,
  );
}

/**
 * Register multiple DataTables into a DuckDB session.
 *
 * Convenience wrapper that calls `registerTable()` for each entry
 * in the source map. This is the main entry point for normalizing
 * all extracted sources before a transform step.
 *
 * @param session - The DuckDB session
 * @param sources - Map of table name → DataTable
 */
export async function registerSources(
  session: DuckSession,
  sources: Map<string, DataTable>,
): Promise<void> {
  for (const [name, table] of sources) {
    await registerTable(session, name, table);
  }
}
