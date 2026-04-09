/**
 * Tests for normalize/session.ts — DuckDB session lifecycle.
 */

import { assertEquals, assert } from "@std/assert";
import {
  createSession,
  closeSession,
} from "../../../src/ts/normalize/mod.ts";

Deno.test("createSession returns a valid session", async () => {
  const session = await createSession();
  try {
    assert(session.conn, "session should have a connection");
    assert(session.tmpDir, "session should have a temp directory");
    assertEquals(session.tables, []);
  } finally {
    closeSession(session);
  }
});

Deno.test("closeSession is safe to call multiple times", async () => {
  const session = await createSession();
  closeSession(session);
  // Calling again should not throw
  closeSession(session);
});
