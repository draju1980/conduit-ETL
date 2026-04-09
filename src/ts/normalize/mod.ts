/**
 * Normalize module — converts DataTables into DuckDB virtual tables.
 *
 * This is the bridge between raw extracted data and the SQL engine.
 * Every connector (CSV, TSV, or future database sources) produces a
 * DataTable. The normalize step writes each DataTable to a temp CSV
 * and registers it as a DuckDB table, giving the transform engine a
 * consistent in-memory SQL format regardless of the data origin.
 *
 * Directory layout:
 *   normalize/
 *   ├── mod.ts        ← Public API (this file)
 *   ├── session.ts    ← DuckDB session lifecycle (create, close)
 *   ├── register.ts   ← DataTable → DuckDB table registration
 *   └── query.ts      ← SQL query execution
 */

export type { DuckSession } from "./session.ts";
export { createSession, closeSession } from "./session.ts";
export { registerTable, registerSources } from "./register.ts";
export { querySession } from "./query.ts";
