import assert from "node:assert/strict";
import test from "node:test";
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

test("unsupported model/parameter combinations fail before getOpenAI", async () => {
  await assert.rejects(
    () => createOpenAICompletion({
      model: "o1-mini",
      temperature: 0,
      messages: [],
    }),
    /Model capability validation failed/,
  );
});
