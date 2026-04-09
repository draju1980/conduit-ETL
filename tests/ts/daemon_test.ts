/**
 * Tests for the daemon module — state management, lifecycle.
 */

import { assertEquals, assert } from "@std/assert";
import { join } from "@std/path";
import { existsSync } from "@std/fs";
import {
  writeDaemonState,
  readDaemonState,
  clearDaemonState,
  isDaemonRunning,
  formatUptime,
  conduitDir,
  type DaemonState,
} from "../../src/ts/daemon.ts";

function makeTmpProject(): string {
  const tmp = Deno.makeTempDirSync();
  Deno.mkdirSync(join(tmp, ".conduit"), { recursive: true });
  return tmp;
}

Deno.test("writeDaemonState and readDaemonState round-trip", () => {
  const tmp = makeTmpProject();
  try {
    const state: DaemonState = {
      pid: 12345,
      port: 4000,
      startedAt: "2026-04-08T10:00:00.000Z",
      version: "0.1.0",
    };

    writeDaemonState(state, tmp);

    // PID file should exist
    assert(existsSync(join(conduitDir(tmp), "conduit.pid")));

    // State should round-trip
    const read = readDaemonState(tmp);
    assertEquals(read, state);
  } finally {
    Deno.removeSync(tmp, { recursive: true });
  }
});

Deno.test("readDaemonState returns null when no state file", () => {
  const tmp = makeTmpProject();
  try {
    const state = readDaemonState(tmp);
    assertEquals(state, null);
  } finally {
    Deno.removeSync(tmp, { recursive: true });
  }
});

Deno.test("clearDaemonState removes PID and state files", () => {
  const tmp = makeTmpProject();
  try {
    const state: DaemonState = {
      pid: 12345,
      port: 4000,
      startedAt: "2026-04-08T10:00:00.000Z",
      version: "0.1.0",
    };

    writeDaemonState(state, tmp);
    clearDaemonState(tmp);

    assertEquals(readDaemonState(tmp), null);
    assert(!existsSync(join(conduitDir(tmp), "conduit.pid")));
  } finally {
    Deno.removeSync(tmp, { recursive: true });
  }
});

Deno.test("isDaemonRunning returns false when no state", () => {
  const tmp = makeTmpProject();
  try {
    const { running, state } = isDaemonRunning(tmp);
    assertEquals(running, false);
    assertEquals(state, null);
  } finally {
    Deno.removeSync(tmp, { recursive: true });
  }
});

Deno.test("isDaemonRunning cleans up stale PID", () => {
  const tmp = makeTmpProject();
  try {
    // Write a fake PID that doesn't exist
    const state: DaemonState = {
      pid: 999999,
      port: 4000,
      startedAt: "2026-04-08T10:00:00.000Z",
      version: "0.1.0",
    };
    writeDaemonState(state, tmp);

    const { running } = isDaemonRunning(tmp);
    assertEquals(running, false);

    // State files should be cleaned up
    assertEquals(readDaemonState(tmp), null);
  } finally {
    Deno.removeSync(tmp, { recursive: true });
  }
});

Deno.test("formatUptime formats seconds", () => {
  const now = new Date();
  const thirtySecsAgo = new Date(now.getTime() - 30_000).toISOString();
  const result = formatUptime(thirtySecsAgo);
  assert(result.endsWith("s"), `Expected seconds format, got: ${result}`);
});

Deno.test("formatUptime formats minutes", () => {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
  const result = formatUptime(fiveMinAgo);
  assert(result.includes("m"), `Expected minutes format, got: ${result}`);
});

Deno.test("formatUptime formats hours", () => {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000).toISOString();
  const result = formatUptime(twoHoursAgo);
  assert(result.includes("h"), `Expected hours format, got: ${result}`);
});
