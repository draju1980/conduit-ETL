/**
 * BigQuery destination writer.
 */

// deno-lint-ignore-file no-explicit-any
import { BigQuery } from "@google-cloud/bigquery";
import type { DataTable, DestinationConfig } from "../models.ts";

export async function loadBigquery(
  table: DataTable,
  dest: DestinationConfig,
  _baseDir: string,
): Promise<void> {
  const project = dest.config.project as string | undefined;
  const dataset = dest.config.dataset as string;
  const targetTable = (dest.config.table as string) ?? dest.name;

  if (!dataset) {
    throw new Error("BigQuery destination requires 'dataset' in config");
  }

  const client = new BigQuery({ projectId: project });
  const tableRef = client.dataset(dataset).table(targetTable);

  if (dest.mode === "full_refresh") {
    try {
      await tableRef.delete();
    } catch {
      // Table might not exist
    }
  }

  // Insert rows in batches
  for (let i = 0; i < table.rows.length; i += dest.batch_size) {
    const batch = table.rows.slice(i, i + dest.batch_size);
    await tableRef.insert(batch as any[]);
  }

  const ref = project ? `${project}.${dataset}.${targetTable}` : `${dataset}.${targetTable}`;
  console.log(
    `Loaded ${table.rows.length} rows to BigQuery destination '${dest.name}' (${ref})`,
  );
}
