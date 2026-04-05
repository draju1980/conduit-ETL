/**
 * Loader registry and shared types.
 */

import type { DataTable, DestinationConfig } from "../models.ts";
import { loadCsv } from "./csv_loader.ts";
import { loadJson } from "./json_loader.ts";
import { loadParquet } from "./parquet_loader.ts";
import { loadPostgres } from "./postgres_loader.ts";
import { loadMysql } from "./mysql_loader.ts";
import { loadSnowflake } from "./snowflake_loader.ts";
import { loadBigquery } from "./bigquery_loader.ts";
import { loadMongodb } from "./mongodb_loader.ts";
import { loadS3 } from "./s3_loader.ts";

export type LoaderFn = (
  table: DataTable,
  dest: DestinationConfig,
  baseDir: string,
) => Promise<void>;

export const LOADERS: Map<string, LoaderFn> = new Map([
  ["csv", loadCsv],
  ["json", loadJson],
  ["jsonl", loadJson],
  ["parquet", loadParquet],
  ["postgres", loadPostgres],
  ["mysql", loadMysql],
  ["snowflake", loadSnowflake],
  ["bigquery", loadBigquery],
  ["mongodb", loadMongodb],
  ["s3", loadS3],
]);
