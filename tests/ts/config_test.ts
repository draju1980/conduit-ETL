import { assertEquals, assertThrows } from "@std/assert";
import { loadPipeline } from "../../src/ts/config.ts";
import { join } from "@std/path";
import { FIXTURES_DIR } from "./fixtures/helpers.ts";

Deno.test("config", async (t) => {
  await t.step("load valid pipeline", () => {
    const config = loadPipeline(join(FIXTURES_DIR, "sample_pipeline.yaml"));
    assertEquals(config.pipeline.name, "test_orders");
    assertEquals(config.sources.length, 2);
    assertEquals(config.sources[0]!.name, "orders");
    assertEquals(config.sources[1]!.name, "regions");
    assertEquals(config.validation.length, 4);
    assertEquals(config.destinations.length, 1);
  });

  await t.step("validation checks parsed", () => {
    const config = loadPipeline(join(FIXTURES_DIR, "sample_pipeline.yaml"));
    assertEquals(config.validation[0]!.type, "schema");
    assertEquals(config.validation[1]!.type, "null_check");
    assertEquals(config.validation[2]!.type, "row_count");
    assertEquals(config.validation[3]!.type, "custom");
  });

  await t.step("load missing file throws", () => {
    assertThrows(() => {
      loadPipeline("/nonexistent/pipeline.yaml");
    });
  });
});
