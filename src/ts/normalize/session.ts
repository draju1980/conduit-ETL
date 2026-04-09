/**
 * DuckDB session lifecycle — create, close, and manage sessions.
 *
 * A session owns a DuckDB connection and a temp directory where
 * normalized CSV files are stored during table registration.
 */

import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

/** A DuckDB session with its connection and temp directory. */
export interface DuckSession {
  conn: DuckDBConnection;
  tmpDir: string;
  tables: string[];
}

/**
 * Create a new DuckDB session.
 *
 * The session owns a DuckDB connection and a temp directory where
 * normalized CSV files are stored. Call `closeSession()` when done.
 */
export async function createSession(): Promise<DuckSession> {
  const instance = await DuckDBInstance.create();
  const conn = await instance.connect();
  const tmpDir = Deno.makeTempDirSync();
  return { conn, tmpDir, tables: [] };
}

/**
 * Close a DuckDB session and clean up temp files.
 *
 * Safe to call multiple times — ignores cleanup errors.
 */
export function closeSession(session: DuckSession): void {
  session.conn.closeSync();
  try {
    Deno.removeSync(session.tmpDir, { recursive: true });
  } catch {
    // Cleanup is best-effort
  }
}
