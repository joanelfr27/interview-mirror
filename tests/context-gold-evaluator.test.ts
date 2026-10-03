import assert from "node:assert/strict";
import test from "node:test";
import { evaluateContextGold } from "../src/lib/context-gold-evaluator.ts";

const gold = [
  { source_quote: "Supported decisions across 14 African countries.", expected_scope: "14 African countries" },
  { source_quote: "Managed USD 50,000 restricted CSR project funds.", expected_domain: "restricted CSR project funds" },
  { source_quote: "Strengthened internal controls and operational effectiveness.", expect_none: true },
] as const;

test("context gold passes grounded extraction at >=80% recall with no false positives", () => {
  const result = evaluateContextGold(gold, [
    { source_quote: gold[0].source_quote, scope: "14 African countries" },
    { source_quote: gold[1].source_quote, domain: "restricted CSR project funds" },
    { source_quote: gold[2].source_quote },
  ]);
  assert.equal(result.recall, 1);
  assert.equal(result.pass, true);
});

test("context gold rejects invented context on a negative bullet", () => {
  const result = evaluateContextGold(gold, [
    { source_quote: gold[0].source_quote, scope: "14 African countries" },
    { source_quote: gold[1].source_quote, domain: "restricted CSR project funds" },
    { source_quote: gold[2].source_quote, domain: "internal controls" },
  ]);
  assert.equal(result.pass, false);
  assert.deepEqual(result.false_positive_quotes, [gold[2].source_quote]);
});

test("context gold rejects any value that is not an exact source substring", () => {
  const result = evaluateContextGold(gold, [
    { source_quote: gold[0].source_quote, scope: "multi-country Africa" },
    { source_quote: gold[1].source_quote, domain: "restricted CSR project funds" },
    { source_quote: gold[2].source_quote },
  ]);
  assert.equal(result.pass, false);
  assert.deepEqual(result.non_substring_values, ["multi-country Africa"]);
});
