/**
 * Tests for normalize/register.ts — DataTable → DuckDB table registration.
 */

import { assertEquals, assert } from "@std/assert";
import {
  createSession,
  closeSession,
  registerTable,
  registerSources,
  querySession,
} from "../../../src/ts/normalize/mod.ts";
import { createTableWithNulls } from "../fixtures/helpers.ts";
import type { DataTable } from "../../../src/ts/models.ts";

Deno.test("registerTable makes table queryable", async () => {
  const session = await createSession();
  try {
    const table: DataTable = {
      columns: [
        { name: "id", type: "INTEGER" },
        { name: "name", type: "VARCHAR" },
      ],
      rows: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    };

    await registerTable(session, "users", table);

    assertEquals(session.tables, ["users"]);

    const result = await querySession(session, "SELECT * FROM users ORDER BY id");
    assertEquals(result.rows.length, 2);
    assertEquals(result.rows[0]!.name, "Alice");
    assertEquals(result.rows[1]!.name, "Bob");
  } finally {
    closeSession(session);
  }
});

Deno.test("registerTable handles empty tables", async () => {
  const session = await createSession();
  try {
    const table: DataTable = {
      columns: [{ name: "id", type: "INTEGER" }],
      rows: [],
    };

    await registerTable(session, "empty", table);
    const result = await querySession(session, "SELECT * FROM empty");

    assertEquals(result.rows.length, 0);
    assertEquals(result.columns.length, 1);
  } finally {
    closeSession(session);
  }
});

Deno.test("registerTable preserves nulls in data", async () => {
  const session = await createSession();
  try {
    const table = createTableWithNulls();
    await registerTable(session, "data", table);

    const result = await querySession(
      session,
      "SELECT * FROM data WHERE customer_id IS NULL",
    );
    assertEquals(result.rows.length, 1);
  } finally {
    closeSession(session);
  }
});

Deno.test("registerSources registers multiple tables with JOINs", async () => {
  const session = await createSession();
  try {
    const sources = new Map<string, DataTable>();
    sources.set("orders", {
      columns: [
        { name: "id", type: "INTEGER" },
        { name: "amount", type: "DOUBLE" },
      ],
      rows: [
        { id: 1, amount: 100.0 },
        { id: 2, amount: 200.0 },
      ],
    });
    sources.set("customers", {
      columns: [
        { name: "id", type: "INTEGER" },
        { name: "name", type: "VARCHAR" },
      ],
      rows: [
        { id: 1, name: "Alice" },
      ],
    });

    await registerSources(session, sources);

    assertEquals(session.tables.length, 2);
    assert(session.tables.includes("orders"));
    assert(session.tables.includes("customers"));

    // Both tables should be queryable together
    const result = await querySession(
      session,
      "SELECT c.name, o.amount FROM orders o JOIN customers c ON o.id = c.id",
    );
    assertEquals(result.rows.length, 1);
    assertEquals(result.rows[0]!.name, "Alice");
    assertEquals(Number(result.rows[0]!.amount), 100.0);
  } finally {
    closeSession(session);
  }
});
