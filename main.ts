/**
 * Conduit ETL — entry point.
 */

import { app } from "./src/ts/cli.ts";

await app.parse(Deno.args);
