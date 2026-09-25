import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

test("V23 strategy engine is not reachable from the strategy route", () => {
  const source = fs.readFileSync("src/app/api/strategy/[id]/route.ts", "utf8");
  assert.ok(
    !source.includes("runStrategyEngineV23Lite"),
    "V23 generator must not be imported or called from the route",
  );
  assert.match(
    source,
    /D16_PRODUCTION_CUTOVER_ENABLED\s*=\s*false/,
    "cutover gate must default to disabled",
  );
});
