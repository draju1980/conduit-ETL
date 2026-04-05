/**
 * S3 destination writer using AWS SDK v3.
 */

import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { stringify } from "@std/csv";
import { DuckDBInstance } from "@duckdb/node-api";
import type { DataTable, DestinationConfig } from "../models.ts";
import { writeCsvSync } from "../util.ts";

export async function loadS3(
  table: DataTable,
  dest: DestinationConfig,
  _baseDir: string,
): Promise<void> {
  const bucket = dest.config.bucket as string;
  const key = (dest.config.key as string) ??
    (dest.config.path as string) ?? `${dest.name}.parquet`;
  const fileFormat = (dest.config.format as string) ?? "parquet";
  const region = (dest.config.region as string) ?? undefined;

  if (!bucket) {
    throw new Error("S3 destination requires 'bucket' in config");
  }

  const clientConfig: Record<string, unknown> = {};
  if (region) clientConfig.region = region;
  if (dest.config.aws_access_key_id) {
    clientConfig.credentials = {
      accessKeyId: dest.config.aws_access_key_id as string,
      secretAccessKey: (dest.config.aws_secret_access_key as string) ?? "",
    };
  }
  if (dest.config.endpoint_override) {
    clientConfig.endpoint = dest.config.endpoint_override as string;
    clientConfig.forcePathStyle = true;
  }

  const s3 = new S3Client(clientConfig);
  let body: Uint8Array;
  let contentType: string;

  if (fileFormat === "csv") {
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
    body = new TextEncoder().encode(csv);
    contentType = "text/csv";
  } else {
    // Write parquet via DuckDB
    const tmpDir = Deno.makeTempDirSync();
    const tmpPath = `${tmpDir}/_s3_data.parquet`;
    const csvPath = `${tmpDir}/_s3_data.csv`;
    writeCsvSync(csvPath, table);

    const instance = await DuckDBInstance.create();
    const conn = await instance.connect();
    try {
      await conn.run(
        `CREATE TABLE _s3 AS SELECT * FROM read_csv('${csvPath}', auto_detect=true)`,
      );
      const compression = (dest.config.compression as string) ?? "snappy";
      await conn.run(
        `COPY _s3 TO '${tmpPath}' (FORMAT PARQUET, COMPRESSION '${compression}')`,
      );
    } finally {
      conn.closeSync();
    }

    body = Deno.readFileSync(tmpPath);
    contentType = "application/octet-stream";
    try {
      Deno.removeSync(tmpDir, { recursive: true });
    } catch {
      // best effort
    }
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  console.log(
    `Loaded ${table.rows.length} rows to S3 destination '${dest.name}' (s3://${bucket}/${key}, format=${fileFormat})`,
  );
}
