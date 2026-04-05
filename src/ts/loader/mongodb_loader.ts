/**
 * MongoDB destination writer.
 */

import { MongoClient } from "mongodb";
import type { DataTable, DestinationConfig } from "../models.ts";

export async function loadMongodb(
  table: DataTable,
  dest: DestinationConfig,
  _baseDir: string,
): Promise<void> {
  const uri = (dest.config.uri as string) ?? "mongodb://localhost:27017";
  const database = dest.config.database as string;
  const collectionName = (dest.config.collection as string) ?? dest.name;

  if (!database) {
    throw new Error("MongoDB destination requires 'database' in config");
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(database);
    const collection = db.collection(collectionName);

    if (dest.mode === "full_refresh") {
      await collection.drop().catch(() => {});
    }

    for (let i = 0; i < table.rows.length; i += dest.batch_size) {
      const batch = table.rows.slice(i, i + dest.batch_size);
      await collection.insertMany(batch);
    }

    console.log(
      `Loaded ${table.rows.length} rows to MongoDB destination '${dest.name}' (${database}.${collectionName})`,
    );
  } finally {
    await client.close();
  }
}
