/**
 * Snowflake destination writer.
 */

// deno-lint-ignore-file no-explicit-any
import snowflake from "snowflake-sdk";
import type { DataTable, DestinationConfig } from "../models.ts";

function execAsync(conn: any, sql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      complete: (err: any, _stmt: any, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows);
      },
    });
  });
}

function connectAsync(conn: any): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.connect((err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function loadSnowflake(
  table: DataTable,
  dest: DestinationConfig,
  _baseDir: string,
): Promise<void> {
  const conn = snowflake.createConnection({
    account: dest.config.account as string,
    username: dest.config.user as string,
    password: dest.config.password as string,
    warehouse: dest.config.warehouse as string,
    database: dest.config.database as string,
    schema: (dest.config.schema as string) ?? "PUBLIC",
    role: dest.config.role as string,
  });

  await connectAsync(conn);
  try {
    const targetTable = ((dest.config.table as string) ?? dest.name).toUpperCase();

    if (dest.mode === "full_refresh") {
      await execAsync(conn, `DROP TABLE IF EXISTS ${targetTable}`);
    }

    // Create table
    const colDefs = table.columns
      .map((c) => `"${c.name.toUpperCase()}" VARCHAR`)
      .join(", ");
    await execAsync(
      conn,
      `CREATE TABLE IF NOT EXISTS ${targetTable} (${colDefs})`,
    );

    // Insert in batches
    const colNames = table.columns.map((c) => c.name);
    for (let i = 0; i < table.rows.length; i += dest.batch_size) {
      const batch = table.rows.slice(i, i + dest.batch_size);
      for (const row of batch) {
        const values = colNames
          .map((col) => {
            const v = row[col];
            return v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
          })
          .join(", ");
        await execAsync(
          conn,
          `INSERT INTO ${targetTable} VALUES (${values})`,
        );
      }
    }

    console.log(
      `Loaded ${table.rows.length} rows to Snowflake destination '${dest.name}' (${targetTable})`,
    );
  } finally {
    conn.destroy(() => {});
  }
}
