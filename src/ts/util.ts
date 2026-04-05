/**
 * Shared utilities.
 */

import { stringify } from "@std/csv";
import type { DataTable } from "./models.ts";

/**
 * Write a DataTable to a CSV file.
 * Uses @std/csv stringify which expects rows as objects.
 */
export function writeCsvSync(path: string, table: DataTable): void {
  const colNames = table.columns.map((c) => c.name);
  const rows = table.rows.map((row) => {
    const obj: Record<string, string> = {};
    for (const col of colNames) {
      const v = row[col];
      obj[col] = v === null || v === undefined ? "" : String(v);
    }
    return obj;
  });
  const csv = stringify(rows, { columns: colNames });
  Deno.writeTextFileSync(path, csv);
}
