/**
 * Column existence and type expectations.
 */

import { querySession } from "../../normalize/mod.ts";
import type { ExpectationResult } from "./types.ts";
import { quoteIdent } from "./types.ts";
import { registerExpectation } from "./registry.ts";
import type { DuckSession } from "../../normalize/mod.ts";

async function describeTable(
  session: DuckSession,
  tableName: string,
): Promise<Map<string, string>> {
  const r = await querySession(session, `DESCRIBE ${quoteIdent(tableName)}`);
  const cols = new Map<string, string>();
  for (const row of r.rows) {
    cols.set(String(row.column_name), String(row.column_type));
  }
  return cols;
}

registerExpectation(
  "expect_column_to_exist",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const column = config.kwargs.column as string;
    const cols = await describeTable(session, tableName);
    return {
      success: cols.has(column),
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: cols.has(column) ? `exists (${cols.get(column)})` : "not found",
        details: { columns: [...cols.keys()] },
      },
    };
  },
);

registerExpectation(
  "expect_column_values_to_be_of_type",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const column = config.kwargs.column as string;
    const expectedType = (config.kwargs.type_ as string).toUpperCase();
    const cols = await describeTable(session, tableName);
    const actualType = cols.get(column)?.toUpperCase() ?? "NOT FOUND";
    const success = actualType.includes(expectedType) || expectedType.includes(actualType);
    return {
      success,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: actualType,
        details: { expected: expectedType },
      },
    };
  },
);

registerExpectation(
  "expect_column_values_to_be_in_type_list",
  async (session, tableName, config): Promise<ExpectationResult> => {
    const column = config.kwargs.column as string;
    const typeList = (config.kwargs.type_list as string[]).map((t) => t.toUpperCase());
    const cols = await describeTable(session, tableName);
    const actualType = cols.get(column)?.toUpperCase() ?? "NOT FOUND";
    const success = typeList.some(
      (t) => actualType.includes(t) || t.includes(actualType),
    );
    return {
      success,
      expectation_type: config.expectation_type,
      kwargs: config.kwargs,
      result: {
        observed_value: actualType,
        details: { type_list: typeList },
      },
    };
  },
);
