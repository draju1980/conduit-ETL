/**
 * JSON / JSONL destination writer.
 */

import { join, dirname } from "@std/path";
import type { DataTable, DestinationConfig } from "../models.ts";

export async function loadJson(
  table: DataTable,
  dest: DestinationConfig,
  baseDir: string,
): Promise<void> {
  const filePath = join(baseDir, (dest.config.path as string) ?? `${dest.name}.json`);
  Deno.mkdirSync(dirname(filePath), { recursive: true });

  const jsonl = ((dest.config.jsonl as boolean) ?? false) || dest.type === "jsonl";

  if (jsonl) {
    const lines = table.rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
    await Deno.writeTextFile(filePath, lines);
  } else {
    await Deno.writeTextFile(filePath, JSON.stringify(table.rows, null, 2));
  }

  const format = jsonl ? "JSONL" : "JSON";
  console.log(
    `Loaded ${table.rows.length} rows to ${format} destination '${dest.name}' (${filePath})`,
  );
}
