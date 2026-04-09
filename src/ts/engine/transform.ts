/**
 * Transform data using DuckDB SQL engine.
 *
 * Uses the normalize module to register source DataTables as DuckDB
 * tables, then executes the user's SQL and returns the result.
 */

import type { DataTable } from "../models.ts";
import {
  createSession,
  closeSession,
  registerSources,
  querySession,
} from "../normalize/mod.ts";

/**
 * Register source tables in DuckDB and execute the transform SQL.
 * Returns the result as a DataTable.
 */
export async function runTransform(
  sql: string,
  sources: Map<string, DataTable>,
): Promise<DataTable> {
  const session = await createSession();

  try {
    // Normalize: convert all source DataTables → DuckDB tables
    await registerSources(session, sources);

    // Transform: run user SQL across all registered tables
    console.log(`Running transform SQL (${sql.trim().length} characters)`);
    const result = await querySession(session, sql);

    console.log(
      `Transform complete: ${result.rows.length} rows, ${result.columns.length} columns`,
    );
    return result;
  } finally {
    closeSession(session);
  }
}
