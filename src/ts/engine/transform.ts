/**
 * Transform data using DuckDB SQL engine.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import type { DataTable } from "../models.ts";
import { writeCsvSync } from "../util.ts";

/**
 * Register source tables in DuckDB and execute the transform SQL.
 * Returns the result as a DataTable.
 */
export async function runTransform(
  sql: string,
  sources: Map<string, DataTable>,
): Promise<DataTable> {
  const instance = await DuckDBInstance.create();
  const conn = await instance.connect();
  const tmpDir = Deno.makeTempDirSync();

  try {
    for (const [name, table] of sources) {
      const csvPath = `${tmpDir}/${name}.csv`;
      writeCsvSync(csvPath, table);

      await conn.run(
        `CREATE TABLE "${name}" AS SELECT * FROM read_csv('${csvPath}', auto_detect=true)`,
      );
      console.log(
        `Registered source '${name}' (${table.rows.length} rows, ${table.columns.length} cols)`,
      );
    }

    console.log(`Running transform SQL (${sql.trim().length} characters)`);
    const reader = await conn.runAndReadAll(sql);
    const colNames = reader.columnNames();
    const rows = reader.getRowObjectsJS() as Record<string, unknown>[];

    // Get column types
    const columns = colNames.map((name, i) => ({
      name,
      type: reader.columnType(i)?.toString() ?? "VARCHAR",
    }));

    console.log(
      `Transform complete: ${rows.length} rows, ${columns.length} columns`,
    );
    return { columns, rows };
  } finally {
    conn.closeSync();
    try {
      Deno.removeSync(tmpDir, { recursive: true });
    } catch {
      // Cleanup best-effort
    }
  }
}
