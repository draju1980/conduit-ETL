/**
 * Expectation registry — maps expectation type names to their implementations.
 */

import type { ExpectationFn } from "./types.ts";

const EXPECTATIONS = new Map<string, ExpectationFn>();

/** Register an expectation function by name. */
export function registerExpectation(name: string, fn: ExpectationFn): void {
  if (EXPECTATIONS.has(name)) {
    throw new Error(`Duplicate expectation registration: ${name}`);
  }
  EXPECTATIONS.set(name, fn);
}

/** Look up an expectation function by name. */
export function getExpectation(name: string): ExpectationFn | undefined {
  return EXPECTATIONS.get(name);
}

/** List all registered expectation names (sorted). */
export function listExpectations(): string[] {
  return [...EXPECTATIONS.keys()].sort();
}
