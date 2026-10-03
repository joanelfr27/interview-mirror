import assert from "node:assert/strict";
import test from "node:test";
import { evaluateContextGold, parseContextGold } from "../src/lib/context-gold-evaluator.ts";

const gold = [
  { session_fingerprint: "test-session", source_quote: "Supported decisions across 14 African countries.", expected_scope: "14 African countries" },
  { session_fingerprint: "test-session", source_quote: "Managed USD 50,000 restricted CSR project funds.", expected_domain: "restricted CSR project funds" },
  { session_fingerprint: "test-session", source_quote: "Strengthened internal controls and operational effectiveness.", expect_none: true },
] as const;

test("context gold passes grounded extraction at >=80% recall with no false positives", () => {
  const result = evaluateContextGold(gold, [
    { session_fingerprint: "test-session", source_quote: gold[0].source_quote, scope: "14 African countries" },
    { session_fingerprint: "test-session", source_quote: gold[1].source_quote, domain: "restricted CSR project funds" },
    { session_fingerprint: "test-session", source_quote: gold[2].source_quote },
  ]);
  assert.equal(result.recall, 1);
  assert.equal(result.pass, true);
});

test("context gold rejects invented context on a negative bullet", () => {
  const result = evaluateContextGold(gold, [
    { session_fingerprint: "test-session", source_quote: gold[0].source_quote, scope: "14 African countries" },
    { session_fingerprint: "test-session", source_quote: gold[1].source_quote, domain: "restricted CSR project funds" },
    { session_fingerprint: "test-session", source_quote: gold[2].source_quote, domain: "internal controls" },
  ]);
  assert.equal(result.pass, false);
  assert.deepEqual(result.false_positive_quotes, [gold[2].source_quote]);
});

test("context gold rejects any value that is not an exact source substring", () => {
  const result = evaluateContextGold(gold, [
    { session_fingerprint: "test-session", source_quote: gold[0].source_quote, scope: "multi-country Africa" },
    { session_fingerprint: "test-session", source_quote: gold[1].source_quote, domain: "restricted CSR project funds" },
    { session_fingerprint: "test-session", source_quote: gold[2].source_quote },
  ]);
  assert.equal(result.pass, false);
  assert.deepEqual(result.non_substring_values, ["multi-country Africa"]);
});

test("context gold rejects malformed configured JSON instead of treating it as unconfigured", () => {
  assert.throws(() => parseContextGold("{}"), /must be a JSON array/);
  assert.throws(() => parseContextGold("[]"), /at least one gold item/);
  assert.throws(() => parseContextGold('[{"source_quote":"x"}]'), /session_fingerprint and source_quote/);
  assert.equal(parseContextGold(undefined), null);
});

test("context gold does not recover a domain from the scope field", () => {
  const result = evaluateContextGold(
    [{ session_fingerprint: "test-session", source_quote: "Worked across Africa.", expected_domain: "Africa" }],
    [{ session_fingerprint: "test-session", source_quote: "Worked across Africa.", scope: "Africa" }],
  );
  assert.equal(result.recall, 0);
  assert.equal(result.pass, false);
});

test("context gold retains duplicate observations for the same quote", () => {
  const result = evaluateContextGold(
    [{ session_fingerprint: "test-session", source_quote: "Managed finance across Africa.", expected_domain: "finance", expected_scope: "Africa" }],
    [
      { session_fingerprint: "test-session", source_quote: "Managed finance across Africa.", domain: "finance" },
      { session_fingerprint: "test-session", source_quote: "Managed finance across Africa.", scope: "Africa" },
    ],
  );
  assert.equal(result.recall, 1);
  assert.equal(result.pass, true);
});


test("context gold matches atomic source spans within a hand-marked bullet", () => {
  const bullet = "Delivered financial and commercial analysis across 14 African countries to support investment decisions.";
  const result = evaluateContextGold(
    [{ session_fingerprint: "test-session", source_quote: bullet, expected_scope: "14 African countries" }],
    [{ session_fingerprint: "test-session", source_quote: "financial and commercial analysis across 14 African countries", scope: "14 African countries" }],
  );
  assert.equal(result.recall, 1);
  assert.equal(result.pass, true);
});

test("context gold grounding is checked against the atomic span, not merely the surrounding bullet", () => {
  const bullet = "Delivered financial analysis across 14 African countries to support investment decisions.";
  const result = evaluateContextGold(
    [{ session_fingerprint: "test-session", source_quote: bullet, expected_scope: "14 African countries" }],
    [{ session_fingerprint: "test-session", source_quote: "Delivered financial analysis", scope: "14 African countries" }],
  );
  assert.equal(result.pass, false);
  assert.deepEqual(result.non_substring_values, ["14 African countries"]);
});

test("negative bullet fails when any contained atomic span carries context", () => {
  const bullet = "Strengthened internal controls and operational effectiveness.";
  const result = evaluateContextGold(
    [{ session_fingerprint: "test-session", source_quote: bullet, expect_none: true }],
    [{ session_fingerprint: "test-session", source_quote: "internal controls", domain: "internal controls" }],
  );
  assert.equal(result.pass, false);
  assert.deepEqual(result.false_positive_quotes, [bullet]);
});
