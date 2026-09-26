import assert from "node:assert/strict";
import test from "node:test";
import { OWNERSHIP_EXTRACTION_RULE } from "../src/lib/canonical-shadow-extractor.ts";

test("ownership prompt keeps manager-assigned responsibility distinct from candidate ownership", () => {
  assert.match(OWNERSHIP_EXTRACTION_RULE, /attaches to the same action\/proposition represented by this atom/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"my manager assigned this responsibility to me"/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /Do NOT treat .* as INDIVIDUAL ownership/i);
});

test("ownership prompt keeps possessive references to other people distinct from candidate ownership", () => {
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"my predecessor"/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"my colleague"/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /marker elsewhere in the sentence is not sufficient/i);
});
