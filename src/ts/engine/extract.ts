/**
 * Extract data from sources into DataTables.
 */

import { parse as parseCsv } from "@std/csv";
import { join } from "@std/path";
import type { DataTable, SourceConfig } from "../models.ts";

type ExtractFn = (
  source: SourceConfig,
  baseDir: string,
) => DataTable;

function extractCsv(source: SourceConfig, baseDir: string): DataTable {
  const filePath = join(baseDir, (source.config.path as string) ?? "");

  try {
    Deno.statSync(filePath);
  } catch {
    throw new Error(`CSV source file not found: ${filePath}`);
  }

  const text = Deno.readTextFileSync(filePath);
  const delimiter = (source.config.delimiter as string) ?? ",";
  const hasHeader = (source.config.has_header as boolean) ?? true;

  const parsed = parseCsv(text, {
    skipFirstRow: hasHeader,
    separator: delimiter,
  });

  const rows = parsed as Record<string, unknown>[];
  const columns = rows.length > 0
    ? Object.keys(rows[0]!).map((name) => ({ name, type: "VARCHAR" }))
    : [];

  console.log(
    `Extracted ${rows.length} rows from CSV source '${source.name}' (${filePath})`,
  );

  return { columns, rows };
}

function extractTsv(source: SourceConfig, baseDir: string): DataTable {
  if (!source.config.delimiter) {
    source.config.delimiter = "\t";
  }
  return extractCsv(source, baseDir);
}

export const EXTRACTORS: Map<string, ExtractFn> = new Map([
  ["csv", extractCsv],
  ["tsv", extractTsv],
]);

export function extractSources(
  sources: SourceConfig[],
  baseDir: string,
): Map<string, DataTable> {
  const tables = new Map<string, DataTable>();

  for (const source of sources) {
    const extractor = EXTRACTORS.get(source.type);
    if (!extractor) {
      throw new Error(
        `Connector type '${source.type}' is not yet implemented. ` +
          `Supported types: ${[...EXTRACTORS.keys()].sort().join(", ")}`,
      );
    }
    tables.set(source.name, extractor(source, baseDir));
  }

  console.log(
    `Extracted ${tables.size} source(s): ${[...tables.keys()].join(", ")}`,
  );
  return tables;
}
