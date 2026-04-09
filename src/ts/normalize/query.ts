/**
 * Query execution — run SQL against a DuckDB session.
 */

import type { DataTable } from "../models.ts";
import type { DuckSession } from "./session.ts";

/**
 * Execute a SQL query against the session and return the result as a DataTable.
 *
 * All registered tables are available in the query. The result includes
 * column types as reported by DuckDB (INTEGER, VARCHAR, DOUBLE, etc.).
 */
export async function querySession(
  session: DuckSession,
  sql: string,
): Promise<DataTable> {
  const reader = await session.conn.runAndReadAll(sql);
  const colNames = reader.columnNames();
  const rows = reader.getRowObjectsJS() as Record<string, unknown>[];

  const columns = colNames.map((name, i) => ({
    name,
    type: reader.columnType(i)?.toString() ?? "VARCHAR",
  }));

  return { columns, rows };
}
