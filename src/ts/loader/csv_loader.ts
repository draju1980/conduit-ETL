/**
 * CSV destination writer.
 */

import { join, dirname } from "@std/path";
import { stringify } from "@std/csv";
import type { DataTable, DestinationConfig } from "../models.ts";

export async function loadCsv(
  table: DataTable,
  dest: DestinationConfig,
  baseDir: string,
): Promise<void> {
  const filePath = join(baseDir, (dest.config.path as string) ?? `${dest.name}.csv`);
  Deno.mkdirSync(dirname(filePath), { recursive: true });

  const delimiter = (dest.config.delimiter as string) ?? ",";
  const includeHeader = (dest.config.include_header as boolean) ?? true;

  const colNames = table.columns.map((c) => c.name);
  const rows = table.rows.map((row) => {
    const obj: Record<string, string> = {};
    for (const col of colNames) {
      const v = row[col];
      obj[col] = v === null || v === undefined ? "" : String(v);
    }
    return obj;
  });

  const csv = stringify(rows, {
    columns: includeHeader ? colNames : undefined,
    separator: delimiter,
  });

  await Deno.writeTextFile(filePath, csv);
  console.log(
    `Loaded ${table.rows.length} rows to CSV destination '${dest.name}' (${filePath})`,
  );
}
