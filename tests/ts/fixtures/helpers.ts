/**
 * Test helper functions (replaces pytest conftest.py fixtures).
 */

import { dirname, fromFileUrl, join } from "@std/path";
import type { DataTable } from "../../../src/ts/models.ts";

export const FIXTURES_DIR = join(dirname(fromFileUrl(import.meta.url)));

export function createSampleTable(): DataTable {
  return {
    columns: [
      { name: "order_id", type: "BIGINT" },
      { name: "customer_id", type: "BIGINT" },
      { name: "amount", type: "DOUBLE" },
      { name: "status", type: "VARCHAR" },
      { name: "region", type: "VARCHAR" },
    ],
    rows: [
      { order_id: 1, customer_id: 101, amount: 250.0, status: "active", region: "NA" },
      { order_id: 2, customer_id: 102, amount: 175.5, status: "active", region: "EU" },
      { order_id: 3, customer_id: 103, amount: 500.0, status: "completed", region: "NA" },
      { order_id: 4, customer_id: 101, amount: 89.99, status: "active", region: "APAC" },
      { order_id: 5, customer_id: 104, amount: 1200.0, status: "active", region: "EU" },
    ],
  };
}

export function createTableWithNulls(): DataTable {
  return {
    columns: [
      { name: "order_id", type: "BIGINT" },
      { name: "customer_id", type: "BIGINT" },
      { name: "amount", type: "DOUBLE" },
    ],
    rows: [
      { order_id: 1, customer_id: 101, amount: 250.0 },
      { order_id: 2, customer_id: null, amount: 175.5 },
      { order_id: null, customer_id: 103, amount: 500.0 },
      { order_id: 4, customer_id: 101, amount: 89.99 },
      { order_id: 5, customer_id: 104, amount: 1200.0 },
    ],
  };
}

export function createTableWithNegatives(): DataTable {
  return {
    columns: [
      { name: "order_id", type: "BIGINT" },
      { name: "amount", type: "DOUBLE" },
    ],
    rows: [
      { order_id: 1, amount: 250.0 },
      { order_id: 2, amount: -50.0 },
      { order_id: 3, amount: 100.0 },
    ],
  };
}
