/**
 * Set membership expectations — value set checks.
 */

import { querySession } from "../../normalize/mod.ts";
import type { ExpectationResult } from "./types.ts";
import { quoteIdent, escapeSqlValue, runColumnMapExpectation } from "./types.ts";
import { registerExpectation } from "./registry.ts";

function toSqlSet(values: unknown[]): string {
  return values.map(escapeSqlValue).join(", ");
}

registerExpectation(
  "expect_column_values_to_be_in_set",
  (session, tableName, config) => {
    const valueSet = config.kwargs.value_set as unknown[];
    const col = quoteIdent(config.kwargs.column as string);
    return runColumnMapExpectation(
      session, tableName, config,
      `${col} NOT IN (${toSqlSet(valueSet)})`,
    );
  },
);

registerExpectation(
  "expect_column_values_to_not_be_in_set",
  (session, tableName, config) => {
    const valueSet = config.kwargs.value_set as unknown[];
    const col = quoteIdent(config.kwargs.column as string);
    return runColumnMapExpectation(
      session, tableName, config,
      `${col} IN (${toSqlSet(valueSet)})`,
    );
  },
);

registerExpectation(
  "expect_column_distinct_values_to_equal_set",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const column = config.kwargs.column as string;
    const expectedSet = new Set((config.kwargs.value_set as unknown[]).map(String));
    const col = quoteIdent(column);
    const tbl = quoteIdent(tableName);

    const r = await querySession(session, `
      SELECT DISTINCT ${col} AS val FROM ${tbl} WHERE ${col} IS NOT NULL
    `);
    const actualSet = new Set(r.rows.map((row) => String(row.val)));

    const missing = [...expectedSet].filter((v) => !actualSet.has(v));
    const extra = [...actualSet].filter((v) => !expectedSet.has(v));

    return {
      success: missing.length === 0 && extra.length === 0,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: [...actualSet].join(", "),
        details: { missing, extra },
      },
    };
  },
);

registerExpectation(
  "expect_column_distinct_values_to_contain_set",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const column = config.kwargs.column as string;
    const requiredSet = new Set((config.kwargs.value_set as unknown[]).map(String));
    const col = quoteIdent(column);
    const tbl = quoteIdent(tableName);

    const r = await querySession(session, `
      SELECT DISTINCT ${col} AS val FROM ${tbl} WHERE ${col} IS NOT NULL
    `);
    const actualSet = new Set(r.rows.map((row) => String(row.val)));

    const missing = [...requiredSet].filter((v) => !actualSet.has(v));

    return {
      success: missing.length === 0,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: [...actualSet].join(", "),
        details: { missing },
      },
    };
  },
);
