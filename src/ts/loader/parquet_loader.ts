/**
 * Parquet destination writer using DuckDB COPY TO.
 */

import { join, dirname } from "@std/path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { DataTable, DestinationConfig } from "../models.ts";
import { writeCsvSync } from "../util.ts";

export async function loadParquet(
  table: DataTable,
  dest: DestinationConfig,
  baseDir: string,
): Promise<void> {
  const filePath = join(baseDir, (dest.config.path as string) ?? `${dest.name}.parquet`);
  Deno.mkdirSync(dirname(filePath), { recursive: true });

  const compression = (dest.config.compression as string) ?? "snappy";

  const instance = await DuckDBInstance.create();
  const conn = await instance.connect();
  const tmpDir = Deno.makeTempDirSync();

  try {
    // Write data to temp CSV, load into DuckDB, then COPY TO parquet
    const csvPath = `${tmpDir}/_data.csv`;
    writeCsvSync(csvPath, table);

    await conn.run(
      `CREATE TABLE _data AS SELECT * FROM read_csv('${csvPath}', auto_detect=true)`,
    );
    await conn.run(
      `COPY _data TO '${filePath}' (FORMAT PARQUET, COMPRESSION '${compression}')`,
    );

    console.log(
      `Loaded ${table.rows.length} rows to Parquet destination '${dest.name}' (${filePath})`,
    );
  } finally {
    conn.closeSync();
    try {
      Deno.removeSync(tmpDir, { recursive: true });
    } catch {
      // best effort
    }
  }
}
