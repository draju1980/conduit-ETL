/**
 * MySQL destination writer.
 */

// deno-lint-ignore-file no-explicit-any
import mysql from "mysql";
import type { DataTable, DestinationConfig } from "../models.ts";

const TYPE_MAP: Record<string, string> = {
  TINYINT: "TINYINT",
  SMALLINT: "SMALLINT",
  INTEGER: "INT",
  BIGINT: "BIGINT",
  FLOAT: "FLOAT",
  DOUBLE: "DOUBLE",
  VARCHAR: "TEXT",
  BOOLEAN: "BOOLEAN",
  DATE: "DATE",
  TIMESTAMP: "DATETIME",
};

function mapType(duckdbType: string): string {
  return TYPE_MAP[duckdbType.toUpperCase()] ?? "TEXT";
}

export async function loadMysql(
  table: DataTable,
  dest: DestinationConfig,
  _baseDir: string,
): Promise<void> {
  const conn = await (mysql as any).createConnection({
    host: (dest.config.host as string) ?? "localhost",
    port: (dest.config.port as number) ?? 3306,
    database: dest.config.database as string,
    user: dest.config.user as string,
    password: dest.config.password as string,
  });

  try {
    const targetTable = (dest.config.table as string) ?? dest.name;

    if (dest.mode === "full_refresh") {
      await conn.execute(`DROP TABLE IF EXISTS \`${targetTable}\``);
      const colDefs = table.columns
        .map((c) => `\`${c.name}\` ${mapType(c.type)}`)
        .join(", ");
      await conn.execute(`CREATE TABLE \`${targetTable}\` (${colDefs})`);
    }

    const colNames = table.columns.map((c) => c.name);
    const quotedCols = colNames.map((c) => `\`${c}\``).join(", ");
    const placeholders = colNames.map(() => "?").join(", ");
    const insertSql = `INSERT INTO \`${targetTable}\` (${quotedCols}) VALUES (${placeholders})`;

    for (let i = 0; i < table.rows.length; i += dest.batch_size) {
      const batch = table.rows.slice(i, i + dest.batch_size);
      const values = batch.map((row) =>
        colNames.map((col) => row[col] ?? null)
      );
      for (const vals of values) {
        await conn.execute(insertSql, vals);
      }
    }

    console.log(
      `Loaded ${table.rows.length} rows to MySQL destination '${dest.name}' (${targetTable})`,
    );
  } finally {
    await conn.end();
  }
}
