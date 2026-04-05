import { assertEquals, assertRejects } from "@std/assert";
import { runTransform } from "../../src/ts/engine/transform.ts";
import type { DataTable } from "../../src/ts/models.ts";

function simpleTable(): DataTable {
  return {
    columns: [
      { name: "id", type: "INTEGER" },
      { name: "value", type: "INTEGER" },
    ],
    rows: [
      { id: 1, value: 10 },
      { id: 2, value: 20 },
      { id: 3, value: 30 },
    ],
  };
}

Deno.test("transform", async (t) => {
  await t.step("simple select", async () => {
    const sources = new Map([["data", simpleTable()]]);
    const result = await runTransform("SELECT * FROM data", sources);
    assertEquals(result.rows.length, 3);
  });

  await t.step("join two sources", async () => {
    const orders: DataTable = {
      columns: [
        { name: "order_id", type: "INTEGER" },
        { name: "amount", type: "DOUBLE" },
        { name: "region_id", type: "INTEGER" },
      ],
      rows: [
        { order_id: 1, amount: 100, region_id: 1 },
        { order_id: 2, amount: 200, region_id: 2 },
      ],
    };
    const regions: DataTable = {
      columns: [
        { name: "id", type: "INTEGER" },
        { name: "region", type: "VARCHAR" },
      ],
      rows: [
        { id: 1, region: "NA" },
        { id: 2, region: "EU" },
      ],
    };

    const sources = new Map<string, DataTable>([
      ["orders", orders],
      ["regions", regions],
    ]);
    const result = await runTransform(
      "SELECT o.order_id, o.amount, r.region FROM orders o JOIN regions r ON o.region_id = r.id",
      sources,
    );
    assertEquals(result.rows.length, 2);
    assertEquals(result.columns.length, 3);
  });

  await t.step("filter", async () => {
    const sources = new Map([["data", simpleTable()]]);
    const result = await runTransform(
      "SELECT * FROM data WHERE value > 15",
      sources,
    );
    assertEquals(result.rows.length, 2);
  });

  await t.step("invalid sql throws", async () => {
    const sources = new Map([["data", simpleTable()]]);
    await assertRejects(async () => {
      await runTransform("SELECT * FROM nonexistent", sources);
    });
  });
});
