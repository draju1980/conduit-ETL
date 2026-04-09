/**
 * String pattern and length expectations.
 */

import { quoteIdent, escapeSqlValue, runColumnMapExpectation } from "./types.ts";
import { registerExpectation } from "./registry.ts";

registerExpectation(
  "expect_column_values_to_match_regex",
  (session, tableName, config) => {
    const col = quoteIdent(config.kwargs.column as string);
    const regex = config.kwargs.regex as string;
    return runColumnMapExpectation(
      session, tableName, config,
      `NOT regexp_matches(CAST(${col} AS VARCHAR), ${escapeSqlValue(regex)})`,
    );
  },
);

registerExpectation(
  "expect_column_values_to_not_match_regex",
  (session, tableName, config) => {
    const col = quoteIdent(config.kwargs.column as string);
    const regex = config.kwargs.regex as string;
    return runColumnMapExpectation(
      session, tableName, config,
      `regexp_matches(CAST(${col} AS VARCHAR), ${escapeSqlValue(regex)})`,
    );
  },
);

registerExpectation(
  "expect_column_value_lengths_to_equal",
  (session, tableName, config) => {
    const col = quoteIdent(config.kwargs.column as string);
    const expectedLength = config.kwargs.value as number;
    return runColumnMapExpectation(
      session, tableName, config,
      `LENGTH(CAST(${col} AS VARCHAR)) != ${expectedLength}`,
    );
  },
);

registerExpectation(
  "expect_column_value_lengths_to_be_between",
  (session, tableName, config) => {
    const col = quoteIdent(config.kwargs.column as string);
    const minValue = config.kwargs.min_value as number | undefined;
    const maxValue = config.kwargs.max_value as number | undefined;

    const conditions: string[] = [];
    if (minValue !== undefined) {
      conditions.push(`LENGTH(CAST(${col} AS VARCHAR)) < ${minValue}`);
    }
    if (maxValue !== undefined) {
      conditions.push(`LENGTH(CAST(${col} AS VARCHAR)) > ${maxValue}`);
    }

    return runColumnMapExpectation(
      session, tableName, config,
      conditions.length > 0 ? conditions.join(" OR ") : "FALSE",
    );
  },
);
