/**
 * Aggregate stat expectations — min, max, mean, median, stdev, sum, unique count.
 */

import { runAggregateExpectation } from "./types.ts";
import { registerExpectation } from "./registry.ts";

const AGGREGATES: [string, string][] = [
  ["expect_column_min_to_be_between", "MIN"],
  ["expect_column_max_to_be_between", "MAX"],
  ["expect_column_mean_to_be_between", "AVG"],
  ["expect_column_median_to_be_between", "MEDIAN"],
  ["expect_column_stdev_to_be_between", "STDDEV"],
  ["expect_column_sum_to_be_between", "SUM"],
  ["expect_column_unique_value_count_to_be_between", "COUNT(DISTINCT"],
];

for (const [name, sqlFn] of AGGREGATES) {
  const isCountDistinct = sqlFn.startsWith("COUNT(DISTINCT");

  registerExpectation(name, async (session, tableName, config) => {
    if (isCountDistinct) {
      // Special case: COUNT(DISTINCT col) has different SQL shape
      const { querySession } = await import("../../normalize/mod.ts");
      const { quoteIdent } = await import("./types.ts");
      const column = config.kwargs.column as string;
      const minValue = config.kwargs.min_value as number | undefined;
      const maxValue = config.kwargs.max_value as number | undefined;
      const col = quoteIdent(column);
      const tbl = quoteIdent(tableName);

      const sql = `SELECT COUNT(DISTINCT ${col}) AS agg_value FROM ${tbl}`;
      const result = await querySession(session, sql);
      const observed = Number(result.rows[0]?.agg_value ?? 0);

      let success = true;
      if (minValue !== undefined && observed < minValue) success = false;
      if (maxValue !== undefined && observed > maxValue) success = false;

      return {
        success,
        expectation_type: config.expectation_type,
        kwargs: config.kwargs,
        result: {
          observed_value: observed,
          details: { min_value: minValue, max_value: maxValue },
        },
      };
    }

    return runAggregateExpectation(session, tableName, config, sqlFn);
  });
}
