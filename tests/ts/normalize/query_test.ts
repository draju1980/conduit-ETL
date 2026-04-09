/**
 * Tests for normalize/query.ts — SQL query execution against a session.
 */

import { assertEquals, assert, assertRejects } from "@std/assert";
import {
  createSession,
  closeSession,
  registerTable,
  querySession,
} from "../../../src/ts/normalize/mod.ts";
import { createSampleTable } from "../fixtures/helpers.ts";
import type { DataTable } from "../../../src/ts/models.ts";

Deno.test("querySession returns correct column types from DuckDB", async () => {
  const session = await createSession();
  try {
    const table: DataTable = {
      columns: [
        { name: "id", type: "INTEGER" },
        { name: "price", type: "DOUBLE" },
        { name: "label", type: "VARCHAR" },
      ],
      rows: [
        { id: 1, price: 9.99, label: "widget" },
      ],
    };

    await registerTable(session, "products", table);
    const result = await querySession(session, "SELECT * FROM products");

    // DuckDB should infer proper types (not just VARCHAR)
    assertEquals(result.columns.length, 3);
    const typeMap: Record<string, string> = {};
    for (const col of result.columns) {
      typeMap[col.name] = col.type;
    }
    // DuckDB auto-detects integers and doubles from CSV
    assert(
      typeMap["id"]!.includes("INT") || typeMap["id"]!.includes("BIGINT"),
      `Expected integer type, got ${typeMap["id"]}`,
    );
    assert(
      typeMap["price"]!.includes("DOUBLE") || typeMap["price"]!.includes("FLOAT"),
      `Expected float type, got ${typeMap["price"]}`,
    );
    assertEquals(typeMap["label"], "VARCHAR");
  } finally {
    closeSession(session);
  }
});

Deno.test("querySession throws on invalid SQL", async () => {
  const session = await createSession();
  try {
    const table = createSampleTable();
    await registerTable(session, "data", table);

    await assertRejects(
      () => querySession(session, "SELECT * FROM nonexistent_table"),
    );
  } finally {
    closeSession(session);
  }
});
