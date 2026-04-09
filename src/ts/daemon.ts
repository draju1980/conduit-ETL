/**
 * Conduit daemon — manages the background server process.
 *
 * Handles PID file management, process lifecycle, and status reporting.
 * The daemon hosts the scheduler, REST API, and web UI.
 */

import { join } from "@std/path";
import { ensureDirSync } from "@std/fs";

const DEFAULT_PORT = 4000;
const CONDUIT_DIR = ".conduit";
const PID_FILE = "conduit.pid";
const STATE_FILE = "conduit.state.json";

export interface DaemonState {
  pid: number;
  port: number;
  startedAt: string;
  version: string;
}

/** Resolve .conduit directory relative to cwd or a given base. */
export function conduitDir(base?: string): string {
  return join(base ?? Deno.cwd(), CONDUIT_DIR);
}

function pidFilePath(base?: string): string {
  return join(conduitDir(base), PID_FILE);
}

function stateFilePath(base?: string): string {
  return join(conduitDir(base), STATE_FILE);
}

/** Write the daemon state (PID + metadata) to disk. */
export function writeDaemonState(state: DaemonState, base?: string): void {
  ensureDirSync(conduitDir(base));
  Deno.writeTextFileSync(pidFilePath(base), String(state.pid));
  Deno.writeTextFileSync(stateFilePath(base), JSON.stringify(state, null, 2));
}

/** Read the daemon state from disk, or null if not running. */
export function readDaemonState(base?: string): DaemonState | null {
  try {
    const text = Deno.readTextFileSync(stateFilePath(base));
    return JSON.parse(text) as DaemonState;
  } catch {
    return null;
  }
}

/** Remove PID and state files. */
export function clearDaemonState(base?: string): void {
  try {
    Deno.removeSync(pidFilePath(base));
  } catch { /* ignore */ }
  try {
    Deno.removeSync(stateFilePath(base));
  } catch { /* ignore */ }
}

/** Check whether a process with the given PID is alive. */
export function isProcessAlive(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    Deno.kill(pid, "SIGCONT");
    return true;
  } catch {
    return false;
  }
}

/** Check if a daemon is currently running. */
export function isDaemonRunning(base?: string): { running: boolean; state: DaemonState | null } {
  const state = readDaemonState(base);
  if (!state) return { running: false, state: null };
  const alive = isProcessAlive(state.pid);
  if (!alive) {
    // Stale PID file — clean up
    clearDaemonState(base);
    return { running: false, state: null };
  }
  return { running: true, state };
}

/**
 * Start the Conduit daemon as a background HTTP server.
 * Returns the DaemonState on success.
 */
export function startDaemon(
  port = DEFAULT_PORT,
  version = "0.1.0",
  base?: string,
): DaemonState {
  const { running, state: existing } = isDaemonRunning(base);
  if (running && existing) {
    throw new Error(
      `Conduit is already running (PID ${existing.pid}, port ${existing.port}). ` +
        `Run 'conduit down' first.`,
    );
  }

  const dir = conduitDir(base);
  ensureDirSync(dir);
  ensureDirSync(join(dir, "logs"));
  ensureDirSync(join(dir, "scheduler"));
  ensureDirSync(join(dir, "reports"));

  const server = Deno.serve({ port, hostname: "127.0.0.1", onListen: () => {} }, (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      const state = readDaemonState(base);
      const uptime = state ? formatUptime(state.startedAt) : "unknown";
      return new Response(JSON.stringify({ status: "ok", uptime }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/api/status") {
      const state = readDaemonState(base);
      return new Response(JSON.stringify(state), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/ui" || url.pathname === "/ui/") {
      return new Response(
        `<html><body><h1>Conduit Web UI</h1><p>Coming soon — pipeline management dashboard.</p></body></html>`,
        { headers: { "content-type": "text/html" } },
      );
    }

    if (url.pathname === "/ui/pipelines") {
      return new Response(
        `<html><body><h1>Pipelines</h1><p>Pipeline scheduler UI — coming soon.</p></body></html>`,
        { headers: { "content-type": "text/html" } },
      );
    }

    return new Response("Not Found", { status: 404 });
  });

  const state: DaemonState = {
    pid: Deno.pid,
    port,
    startedAt: new Date().toISOString(),
    version,
  };

  writeDaemonState(state, base);

  // Keep reference so it can be shut down
  (globalThis as Record<string, unknown>).__conduit_server = server;

  return state;
}

/** Stop the running daemon. */
export function stopDaemon(base?: string): boolean {
  const { running, state } = isDaemonRunning(base);
  if (!running || !state) {
    return false;
  }

  // If it's our own process, shut down the server
  if (state.pid === Deno.pid) {
    const server = (globalThis as Record<string, unknown>).__conduit_server as Deno.HttpServer | undefined;
    if (server) {
      server.shutdown();
    }
  } else {
    // Kill the external process
    try {
      Deno.kill(state.pid, "SIGTERM");
    } catch {
      // Process may have already exited
    }
  }

  clearDaemonState(base);
  return true;
}

/** Format uptime duration from a start time ISO string. */
export function formatUptime(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
