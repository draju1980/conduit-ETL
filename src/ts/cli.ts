/**
 * Conduit CLI — entry point for the conduit command.
 */

import { Command } from "@cliffy/command";
import { runPipeline } from "./pipeline.ts";
import { LOADERS } from "./loader/mod.ts";
import { EXTRACTORS } from "./engine/extract.ts";
import { initProject } from "./init.ts";
import {
  formatUptime,
  isDaemonRunning,
  startDaemon,
  stopDaemon,
} from "./daemon.ts";

const VERSION = "0.1.0";

// Track disabled connectors (in-process only)
const disabledConnectors: Set<string> = new Set();

const CONNECTOR_PACKAGES: Record<string, string> = {
  csv: "(built-in)",
  json: "(built-in)",
  jsonl: "(built-in)",
  parquet: "(built-in)",
  postgres: "npm:postgres",
  mysql: "npm:mysql2",
  snowflake: "npm:snowflake-sdk",
  bigquery: "npm:@google-cloud/bigquery",
  mongodb: "npm:mongodb",
  s3: "npm:@aws-sdk/client-s3",
};

const SOURCE_PACKAGES: Record<string, string> = {
  csv: "(built-in)",
  tsv: "(built-in)",
};

const disabledSources: Set<string> = new Set();

function getComponentVersions(): [string, string][] {
  const components: [string, string][] = [
    ["Deno", Deno.version.deno],
    ["V8", Deno.version.v8],
    ["TypeScript", Deno.version.typescript],
  ];

  const packages: [string, string][] = [
    ["DuckDB", "@duckdb/node-api"],
    ["Zod", "zod"],
    ["MongoDB Driver", "mongodb"],
  ];

  for (const [label, pkg] of packages) {
    try {
      const text = Deno.readTextFileSync(
        `node_modules/${pkg}/package.json`,
      );
      const json = JSON.parse(text) as { version?: string };
      components.push([label, json.version ?? "unknown"]);
    } catch {
      components.push([label, "installed"]);
    }
  }

  return components;
}

// ── Destination subcommands ──────────────────────────────────────────

const destinationList = new Command()
  .description("List all destination connectors and their status.")
  .action(() => {
    console.log(
      `${"CONNECTOR".padEnd(14)} ${"STATUS".padEnd(12)} ${"DRIVER".padEnd(40)}`,
    );
    console.log("-".repeat(66));
    for (const name of [...LOADERS.keys()].sort()) {
      let status: string;
      if (disabledConnectors.has(name)) {
        status = "disabled";
      } else {
        status = "ready";
      }
      const driver = CONNECTOR_PACKAGES[name] ?? "unknown";
      console.log(
        `${name.padEnd(14)} ${status.padEnd(12)} ${driver.padEnd(40)}`,
      );
    }
  });

const destinationAdd = new Command()
  .description("Add and enable a destination connector module.")
  .arguments("<connector:string>")
  .action((_opts, connector) => {
    if (!LOADERS.has(connector)) {
      console.error(`Unknown connector: '${connector}'`);
      console.error(
        `Available connectors: ${[...LOADERS.keys()].sort().join(", ")}`,
      );
      Deno.exit(1);
    }
    const pkg = CONNECTOR_PACKAGES[connector] ?? "";
    if (pkg.startsWith("(")) {
      console.log(
        `Connector '${connector}' is built-in and always available.`,
      );
      return;
    }
    disabledConnectors.delete(connector);
    console.log(`Connector '${connector}' enabled.`);
  });

const destinationRm = new Command()
  .description("Remove (disable) a destination connector module.")
  .arguments("<connector:string>")
  .action((_opts, connector) => {
    if (!LOADERS.has(connector)) {
      console.error(`Unknown connector: '${connector}'`);
      Deno.exit(1);
    }
    const pkg = CONNECTOR_PACKAGES[connector] ?? "";
    if (pkg.startsWith("(")) {
      console.error(`Cannot remove built-in connector '${connector}'.`);
      Deno.exit(1);
    }
    disabledConnectors.add(connector);
    console.log(`Connector '${connector}' removed.`);
  });

const destinationEnable = new Command()
  .description("Enable a previously disabled connector.")
  .arguments("<connector:string>")
  .action((_opts, connector) => {
    if (!LOADERS.has(connector)) {
      console.error(`Unknown connector: '${connector}'`);
      Deno.exit(1);
    }
    disabledConnectors.delete(connector);
    console.log(`Connector '${connector}' enabled.`);
  });

const destinationDisable = new Command()
  .description("Disable a connector without removing its driver.")
  .arguments("<connector:string>")
  .action((_opts, connector) => {
    if (!LOADERS.has(connector)) {
      console.error(`Unknown connector: '${connector}'`);
      Deno.exit(1);
    }
    disabledConnectors.add(connector);
    console.log(`Connector '${connector}' disabled.`);
  });

const destination = new Command()
  .description("Manage destination connectors.")
  .command("list", destinationList)
  .command("add", destinationAdd)
  .command("rm", destinationRm)
  .command("enable", destinationEnable)
  .command("disable", destinationDisable);

// ── Source subcommands ───────────────────────────────────────────────

const sourceList = new Command()
  .description("List all source connectors and their status.")
  .action(() => {
    console.log(
      `${"CONNECTOR".padEnd(14)} ${"STATUS".padEnd(12)} ${"DRIVER".padEnd(40)}`,
    );
    console.log("-".repeat(66));
    for (const name of [...EXTRACTORS.keys()].sort()) {
      const status = disabledSources.has(name) ? "disabled" : "ready";
      const driver = SOURCE_PACKAGES[name] ?? "unknown";
      console.log(
        `${name.padEnd(14)} ${status.padEnd(12)} ${driver.padEnd(40)}`,
      );
    }
  });

const sourceAdd = new Command()
  .description("Add and enable a source connector module.")
  .arguments("<connector:string>")
  .action((_opts, connector) => {
    if (!EXTRACTORS.has(connector)) {
      console.error(`Unknown connector: '${connector}'`);
      console.error(
        `Available connectors: ${[...EXTRACTORS.keys()].sort().join(", ")}`,
      );
      Deno.exit(1);
    }
    const pkg = SOURCE_PACKAGES[connector] ?? "";
    if (pkg.startsWith("(")) {
      console.log(
        `Connector '${connector}' is built-in and always available.`,
      );
      return;
    }
    disabledSources.delete(connector);
    console.log(`Connector '${connector}' enabled.`);
  });

const sourceRm = new Command()
  .description("Remove (disable) a source connector module.")
  .arguments("<connector:string>")
  .action((_opts, connector) => {
    if (!EXTRACTORS.has(connector)) {
      console.error(`Unknown connector: '${connector}'`);
      Deno.exit(1);
    }
    const pkg = SOURCE_PACKAGES[connector] ?? "";
    if (pkg.startsWith("(")) {
      console.error(`Cannot remove built-in connector '${connector}'.`);
      Deno.exit(1);
    }
    disabledSources.add(connector);
    console.log(`Connector '${connector}' removed.`);
  });

const sourceEnable = new Command()
  .description("Enable a previously disabled source connector.")
  .arguments("<connector:string>")
  .action((_opts, connector) => {
    if (!EXTRACTORS.has(connector)) {
      console.error(`Unknown connector: '${connector}'`);
      Deno.exit(1);
    }
    disabledSources.delete(connector);
    console.log(`Connector '${connector}' enabled.`);
  });

const sourceDisable = new Command()
  .description("Disable a source connector without removing its driver.")
  .arguments("<connector:string>")
  .action((_opts, connector) => {
    if (!EXTRACTORS.has(connector)) {
      console.error(`Unknown connector: '${connector}'`);
      Deno.exit(1);
    }
    disabledSources.add(connector);
    console.log(`Connector '${connector}' disabled.`);
  });

const source = new Command()
  .description("Manage source connectors.")
  .command("list", sourceList)
  .command("add", sourceAdd)
  .command("rm", sourceRm)
  .command("enable", sourceEnable)
  .command("disable", sourceDisable);

// ── Main CLI ─────────────────────────────────────────────────────────

export const app = new Command()
  .name("conduit")
  .version(VERSION)
  .description("Conduit - Local-first ELT workbench")
  .command(
    "run",
    new Command()
      .description(
        "Execute a pipeline (extract -> transform -> validate -> load).",
      )
      .arguments("<pipeline:string>")
      .option("--dry-run", "Validate without loading", { default: false })
      .option("-v, --verbose", "Enable debug logging", { default: false })
      .action(async (opts, pipeline) => {
        const success = await runPipeline(pipeline, opts.dryRun);
        if (!success) Deno.exit(1);
      }),
  )
  .command(
    "validate",
    new Command()
      .description("Run validation checks without loading (same as --dry-run).")
      .arguments("<pipeline:string>")
      .option("-v, --verbose", "Enable debug logging", { default: false })
      .action(async (_opts, pipeline) => {
        const success = await runPipeline(pipeline, true);
        if (!success) Deno.exit(1);
      }),
  )
  .command(
    "version",
    new Command()
      .description("Show the conduit version and component details.")
      .action(() => {
        console.log(`conduit ${VERSION}`);
        console.log();
        console.log("Components:");
        const components = getComponentVersions();
        for (const [label, ver] of components) {
          console.log(`  ${label.padEnd(30)} ${ver}`);
        }
      }),
  )
  .command("destination", destination)
  .command("source", source)
  .command(
    "init",
    new Command()
      .description("Initialize a new Conduit project (creates .conduit/ and sample pipeline.yaml).")
      .option("-d, --dir <path:string>", "Target directory (defaults to cwd)")
      .action((opts) => {
        const result = initProject(opts.dir);
        if (result.created.length === 0) {
          console.log("Project already initialized — nothing to create.");
          for (const s of result.skipped) {
            console.log(`  (exists) ${s}`);
          }
          return;
        }
        console.log("Conduit project initialized:");
        for (const c of result.created) {
          console.log(`  + ${c}`);
        }
        if (result.skipped.length > 0) {
          for (const s of result.skipped) {
            console.log(`  (exists) ${s}`);
          }
        }
        console.log();
        console.log("Next steps:");
        console.log("  1. Edit pipeline.yaml to define your sources and transforms");
        console.log("  2. Run: conduit run pipeline.yaml");
      }),
  )
  .command(
    "up",
    new Command()
      .description("Start the Conduit daemon (scheduler, API server, and web UI).")
      .option("-p, --port <port:number>", "Port for the API/UI server", { default: 4000 })
      .action((opts) => {
        console.log("Starting Conduit...");
        try {
          const state = startDaemon(opts.port, VERSION);
          console.log();
          console.log(`  Conduit daemon    PID ${state.pid}`);
          console.log(`  Scheduler         running`);
          console.log(`  API server        http://127.0.0.1:${state.port}`);
          console.log(`  Web UI            http://127.0.0.1:${state.port}/ui`);
          console.log();
          console.log("Conduit is up. Use 'conduit down' to stop.");
        } catch (err) {
          console.error(`Failed to start: ${(err as Error).message}`);
          Deno.exit(1);
        }
      }),
  )
  .command(
    "down",
    new Command()
      .description("Stop the running Conduit daemon.")
      .action(() => {
        const stopped = stopDaemon();
        if (stopped) {
          console.log("Conduit stopped.");
        } else {
          console.log("Conduit is not running.");
        }
      }),
  )
  .command(
    "status",
    new Command()
      .description("Show the running state and connection details.")
      .action(() => {
        const { running, state } = isDaemonRunning();
        if (!running || !state) {
          console.log("Conduit is not running.");
          console.log("Run 'conduit up' to start.");
          return;
        }
        const uptime = formatUptime(state.startedAt);
        console.log("Conduit is running:");
        console.log();
        console.log(`  PID          ${state.pid}`);
        console.log(`  Port         ${state.port}`);
        console.log(`  Version      ${state.version}`);
        console.log(`  Started      ${state.startedAt}`);
        console.log(`  Uptime       ${uptime}`);
        console.log();
        console.log("Endpoints:");
        console.log(`  API          http://127.0.0.1:${state.port}/api/status`);
        console.log(`  Health       http://127.0.0.1:${state.port}/health`);
        console.log(`  Web UI       http://127.0.0.1:${state.port}/ui`);
      }),
  );
