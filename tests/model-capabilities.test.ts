import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createOpenAICompletion } from "../src/lib/openai.ts";
import {
  MODEL_CAPABILITIES,
  validateModelRequestCapabilities,
} from "../src/lib/model-capabilities.ts";

test("explicit capability table allows the configured model request shape", () => {
  assert.ok(MODEL_CAPABILITIES["gpt-4o-mini"]);
  assert.deepEqual(
    validateModelRequestCapabilities("gpt-4o-mini", {
      temperature: 0,
      response_format: { type: "json_schema" },
    }),
    [],
  );
});

test("validator rejects known incompatible reasoning-model parameters", () => {
  assert.ok(
    validateModelRequestCapabilities("o1-mini", { temperature: 0 }).some((error) =>
      error.includes("default temperature"),
    ),
  );
  assert.ok(
    validateModelRequestCapabilities("o3-mini", { top_p: 0.5 }).some((error) =>
      error.includes("top_p"),
    ),
  );
  assert.ok(
    validateModelRequestCapabilities("o1", { response_format: { type: "json_object" } }).some((error) =>
      error.includes("response_format"),
    ),
  );
});

test("Luna and Terra capability fixtures reject temperature zero", async () => {
  const path = join(process.cwd(), "tests/fixtures/luna-terra-capabilities.json");
  const { fixtures } = JSON.parse(await readFile(path, "utf8")) as {
    fixtures: Array<{ provider: string; model: string; unsupported: { temperature: number } }>;
  };
  assert.deepEqual(fixtures.map(({ provider }) => provider), ["Luna", "Terra"]);
  for (const fixture of fixtures) {
    assert.ok(
      validateModelRequestCapabilities(fixture.model, fixture.unsupported)
        .some((error) => error.includes("default temperature")),
      `${fixture.provider} must reject temperature zero`,
    );
  }
});

test("unsupported model/parameter combinations fail before getOpenAI", () => {
  assert.throws(
    () => createOpenAICompletion({
      model: "o1-mini",
      temperature: 0,
      messages: [],
    }),
    /Model capability validation failed/,
  );
});
