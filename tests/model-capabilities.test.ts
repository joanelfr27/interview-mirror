import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

test("real significance runner rejects Luna temperature zero before any API request", async () => {
  const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-loader", "./tests/real-runtime-loader.mjs", "scripts/d15-significance-judge-experiment.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          D15_JUDGE_MODEL: "gpt-5.6-luna",
          OPENAI_API_KEY: "dummy-test-key",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });

  assert.notEqual(result.code, 0);
  assert.match(result.output, /Model capability validation failed: Model "gpt-5\.6-luna" only supports the default temperature value \(1\)\./);
  assert.doesNotMatch(
    result.output,
    /\b(401|403)\b|unauthori[sz]ed|authentication|network|fetch|ECONN|ENOTFOUND|HTTP\/\d|OpenAI API|API request|request failed/i,
  );
});
