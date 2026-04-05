import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { runPipeline } from "../../src/ts/pipeline.ts";
import { FIXTURES_DIR } from "./fixtures/helpers.ts";

Deno.test("pipeline", async (t) => {
  await t.step("full pipeline success", async () => {
    const tmpDir = Deno.makeTempDirSync();
    // Copy fixtures to temp dir
    for (const name of ["orders.csv", "regions.csv", "sample_pipeline.yaml"]) {
      Deno.copyFileSync(
        join(FIXTURES_DIR, name),
        join(tmpDir, name),
      );
    }

    const success = await runPipeline(join(tmpDir, "sample_pipeline.yaml"));
    assertEquals(success, true);

    // Check output was created
    const outputPath = join(tmpDir, "output", "test_output.csv");
    const stat = Deno.statSync(outputPath);
    assertEquals(stat.isFile, true);

    Deno.removeSync(tmpDir, { recursive: true });
  });

  await t.step("validate only mode", async () => {
    const tmpDir = Deno.makeTempDirSync();
    for (const name of ["orders.csv", "regions.csv", "sample_pipeline.yaml"]) {
      Deno.copyFileSync(
        join(FIXTURES_DIR, name),
        join(tmpDir, name),
      );
    }

    const success = await runPipeline(
      join(tmpDir, "sample_pipeline.yaml"),
      true,
    );
    assertEquals(success, true);

    // Output should NOT exist in validate-only mode
    try {
      Deno.statSync(join(tmpDir, "output", "test_output.csv"));
      assertEquals(true, false, "Output file should not exist");
    } catch {
      // Expected - file doesn't exist
    }

    Deno.removeSync(tmpDir, { recursive: true });
  });

  await t.step("saves validation report", async () => {
    const tmpDir = Deno.makeTempDirSync();
    for (const name of ["orders.csv", "regions.csv", "sample_pipeline.yaml"]) {
      Deno.copyFileSync(
        join(FIXTURES_DIR, name),
        join(tmpDir, name),
      );
    }

    await runPipeline(join(tmpDir, "sample_pipeline.yaml"));

    // Check .conduit/reports/ has a report
    const reportsDir = join(tmpDir, ".conduit", "reports");
    let found = false;
    for (const entry of Deno.readDirSync(reportsDir)) {
      if (entry.name.startsWith("test_orders_") && entry.name.endsWith(".json")) {
        found = true;
      }
    }
    assertEquals(found, true, "Validation report should be saved");

    Deno.removeSync(tmpDir, { recursive: true });
  });
});
