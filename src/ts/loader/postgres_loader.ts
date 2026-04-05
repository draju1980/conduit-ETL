/**
 * PostgreSQL destination writer.
 */

// deno-lint-ignore-file no-explicit-any
import postgres from "postgres";
import type { DataTable, DestinationConfig } from "../models.ts";

const TYPE_MAP: Record<string, string> = {
  TINYINT: "SMALLINT",
  SMALLINT: "SMALLINT",
  INTEGER: "INTEGER",
  BIGINT: "BIGINT",
  FLOAT: "REAL",
  DOUBLE: "DOUBLE PRECISION",
  VARCHAR: "TEXT",
  BOOLEAN: "BOOLEAN",
  DATE: "DATE",
  TIMESTAMP: "TIMESTAMP",
};

function mapType(duckdbType: string): string {
  return TYPE_MAP[duckdbType.toUpperCase()] ?? "TEXT";
}

export async function loadPostgres(
  table: DataTable,
  dest: DestinationConfig,
  _baseDir: string,
): Promise<void> {
  const host = (dest.config.host as string) ?? "localhost";
  const port = (dest.config.port as number) ?? 5432;
  const database = (dest.config.database as string) ??
    (dest.config.dbname as string);
  const username = (dest.config.user as string) ?? undefined;
  const password = (dest.config.password as string) ?? undefined;
  const targetTable = (dest.config.table as string) ?? dest.name;
  const schema = (dest.config.schema as string) ?? "public";
  const qualifiedTable = `${schema}.${targetTable}`;

  const sql = postgres({
    host,
    port,
    database,
    username,
    password,
  });

  try {
    if (dest.mode === "full_refresh") {
      await sql.unsafe(`DROP TABLE IF EXISTS ${qualifiedTable}`);
      const colDefs = table.columns
        .map((c) => `"${c.name}" ${mapType(c.type)}`)
        .join(", ");
      await sql.unsafe(`CREATE TABLE ${qualifiedTable} (${colDefs})`);
    }

    // Batch insert
    const colNames = table.columns.map((c) => c.name);
    const batchSize = dest.batch_size;
    for (let i = 0; i < table.rows.length; i += batchSize) {
      const batch = table.rows.slice(i, i + batchSize);
      for (const row of batch) {
        const values = colNames.map((col) => row[col] ?? null);
        const quotedCols = colNames.map((c) => `"${c}"`).join(", ");
        const placeholders = colNames.map((_, idx) => `$${idx + 1}`).join(", ");
        await sql.unsafe(
          `INSERT INTO ${qualifiedTable} (${quotedCols}) VALUES (${placeholders})`,
          values as any[],
        );
      }
    }

    console.log(
      `Loaded ${table.rows.length} rows to PostgreSQL destination '${dest.name}' (${qualifiedTable})`,
    );
  } finally {
    await sql.end();
  }
}
