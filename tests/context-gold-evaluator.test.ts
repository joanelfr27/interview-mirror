import assert from "node:assert/strict";
import test from "node:test";
import { evaluateContextGold, parseContextGold, parseContextGoldPolicy } from "../src/lib/context-gold-evaluator.ts";

const gold = [
  { session_fingerprint: "test-session", source_quote: "Supported decisions across 14 African countries.", expected_scopes: ["14 African countries"] },
  { session_fingerprint: "test-session", source_quote: "Managed USD 50,000 restricted CSR project funds.", expected_domains: ["restricted CSR project funds"] },
  { session_fingerprint: "test-session", source_quote: "Strengthened internal controls and operational effectiveness.", expect_none: true },
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

test("context gold rejects malformed configured JSON instead of treating it as unconfigured", () => {
  assert.throws(() => parseContextGold("{}"), /must be a JSON array/);
  assert.throws(() => parseContextGold("[]"), /at least one gold item/);
  assert.throws(() => parseContextGold('[{"source_quote":"x"}]'), /session_fingerprint and source_quote/);
  assert.equal(parseContextGold(undefined), null);
});

test("context gold does not recover a domain from the scope field", () => {
  const result = evaluateContextGold(
    [{ session_fingerprint: "test-session", source_quote: "Worked across Africa.", expected_domains: ["Africa"] }],
    [{ source_quote: "Worked across Africa.", scope: "Africa" }],
  );
  assert.equal(result.recall, 0);
  assert.equal(result.pass, false);
});

test("context gold retains duplicate observations for the same quote", () => {
  const result = evaluateContextGold(
    [{ session_fingerprint: "test-session", source_quote: "Managed finance across Africa.", expected_domains: ["finance"], expected_scopes: ["Africa"] }],
    [
      { source_quote: "Managed finance across Africa.", domain: "finance" },
      { source_quote: "Managed finance across Africa.", scope: "Africa" },
    ],
  );
  assert.equal(result.recall, 1);
  assert.equal(result.pass, true);
});


test("context gold matches atomic source spans within a hand-marked bullet", () => {
  const bullet = "Delivered financial and commercial analysis across 14 African countries to support investment decisions.";
  const result = evaluateContextGold(
    [{ session_fingerprint: "test-session", source_quote: bullet, expected_scopes: ["14 African countries"] }],
    [{ source_quote: "financial and commercial analysis across 14 African countries", scope: "14 African countries" }],
  );
  assert.equal(result.recall, 1);
  assert.equal(result.pass, true);
});

test("context gold grounding is checked against the atomic span, not merely the surrounding bullet", () => {
  const bullet = "Delivered financial analysis across 14 African countries to support investment decisions.";
  const result = evaluateContextGold(
    [{ session_fingerprint: "test-session", source_quote: bullet, expected_scopes: ["14 African countries"] }],
    [{ source_quote: "Delivered financial analysis", scope: "14 African countries" }],
  );
  assert.equal(result.pass, false);
  assert.deepEqual(result.non_substring_values, ["14 African countries"]);
});

test("negative bullet fails when any contained atomic span carries context", () => {
  const bullet = "Strengthened internal controls and operational effectiveness.";
  const result = evaluateContextGold(
    [{ session_fingerprint: "test-session", source_quote: bullet, expect_none: true }],
    [{ source_quote: "internal controls", domain: "internal controls" }],
  );
  assert.equal(result.pass, false);
  assert.deepEqual(result.false_positive_quotes, [bullet]);
});


test("context gold preserves multiple expected phrases per field", () => {
  const bullet = "Managed budgeting, forecasting and reporting across Africa.";
  const result = evaluateContextGold(
    [{ session_fingerprint: "test-session", source_quote: bullet, expected_domains: ["budgeting", "forecasting", "reporting"], expected_scopes: ["Africa"] }],
    [
      { source_quote: "budgeting", domain: "budgeting" },
      { source_quote: "forecasting", domain: "forecasting" },
      { source_quote: "reporting across Africa", domain: "reporting", scope: "Africa" },
    ],
  );
  assert.equal(result.expected_phrase_count, 4);
  assert.equal(result.recovered_phrase_count, 4);
  assert.equal(result.pass, true);
});

test("context gold counts a missing CV bullet as extraction coverage failure", () => {
  const result = evaluateContextGold(
    [
      { session_fingerprint: "test-session", source_quote: "Extracted finance bullet.", expected_domains: ["finance"] },
      { session_fingerprint: "test-session", source_quote: "Missing controls bullet.", expected_domains: ["controls"] },
    ],
    [{ session_fingerprint: "test-session", source_quote: "Extracted finance bullet.", domain: "finance" }],
  );
  assert.equal(result.bullet_coverage, 0.5);
  assert.deepEqual(result.not_extracted_quotes, ["Missing controls bullet."]);
  assert.equal(result.pass, false);
});

test("configured gold phrases must be verbatim substrings of their CV bullet", () => {
  assert.throws(
    () => parseContextGold('[{"session_fingerprint":"s","source_quote":"Worked across Africa.","expected_scopes":["multi-country Africa"]}]'),
    /not copied verbatim/,
  );
});


test("context gold rejects blank or vacuous configured items", () => {
  assert.throws(() => parseContextGold('[{"session_fingerprint":"s","source_quote":"real text"}]'), /expected context or expect_none/);
  assert.throws(() => parseContextGold('[{"session_fingerprint":"s","source_quote":"   ","expect_none":true}]'), /session_fingerprint and source_quote/);
});

test("source offsets prevent a repeated atomic clause from satisfying two bullets", () => {
  const source = "Managed finance for Fund A.\nManaged finance for Fund B.";
  const secondStart = source.indexOf("Managed finance for Fund B.");
  const result = evaluateContextGold(
    [
      { session_fingerprint: "s", source_quote: "Managed finance for Fund A.", expected_domains: ["finance"] },
      { session_fingerprint: "s", source_quote: "Managed finance for Fund B.", expected_domains: ["finance"] },
    ],
    [{ source_quote: "Managed finance", start_offset: 0, end_offset: "Managed finance".length, domain: "finance" }],
    source,
  );
  assert.equal(result.bullet_coverage, 0.5);
  assert.equal(result.pass, false);
  assert.ok(secondStart > 0);
});

test("gold quote absent from current CV fails coverage", () => {
  const result = evaluateContextGold(
    [{ session_fingerprint: "s", source_quote: "Stale bullet.", expect_none: true }],
    [],
    "Current CV bullet.",
  );
  assert.equal(result.pass, false);
  assert.deepEqual(result.not_extracted_quotes, ["Stale bullet."]);
});


test("borderline gold is report-only and cannot decide the gate", () => {
  const borderline = [{ session_fingerprint: "s", source_quote: "Recommendations to senior management and headquarters.", expected_scopes: ["senior management", "headquarters"], borderline: true }] as const;
  const missed = evaluateContextGold(borderline, []);
  assert.equal(missed.expected_phrase_count, 0);
  assert.equal(missed.recall, 1);
  assert.equal(missed.pass, true);
  assert.equal(missed.borderline_results[0].found, false);

  const alternative = evaluateContextGold(borderline, [{ source_quote: "senior management", scope: "senior management" }]);
  assert.equal(alternative.expected_phrase_count, 0);
  assert.equal(alternative.non_substring_values.length, 0);
  assert.equal(alternative.false_positive_quotes.length, 0);
  assert.equal(alternative.pass, true);
  assert.equal(alternative.borderline_results[0].found, true);
});

test("frozen gold metadata survives parsing", () => {
  const parsed = parseContextGold(JSON.stringify([{ session_fingerprint: "s", bullet_number: 6, source_quote: "Recommendations to senior management.", expected_scopes: ["senior management"], borderline: true, note: "borderline scope" }]));
  assert.equal(parsed?.[0].bullet_number, 6);
  assert.equal(parsed?.[0].borderline, true);
  assert.equal(parsed?.[0].note, "borderline scope");
});

test("phrase-level policy excludes only named borderline scopes and keeps mixed-bullet domains in recall and coverage", () => {
  const policy = parseContextGoldPolicy(JSON.stringify({schema_version:1,gold_blob_sha:"x",session_fingerprint:"s",field_none_semantics:{omitted_expected_domains:"NONE",omitted_expected_scopes:"NONE"},borderline_exclusions:[{bullet_number:6,field:"scope",phrases:["senior management","headquarters"]},{bullet_number:8,field:"scope",phrases:["regional investment"]}]}))!;
  const mixed = [{session_fingerprint:"s",bullet_number:6,source_quote:"Conducted market assessments, providing recommendations to senior management and headquarters.",expected_domains:["market assessments"],expected_scopes:["senior management","headquarters"],borderline:true}] as const;
  const result=evaluateContextGold(mixed,[{source_quote:"market assessments",domain:"market assessments"}],undefined,policy);
  assert.equal(result.expected_phrase_count,1); assert.equal(result.recovered_phrase_count,1); assert.equal(result.recall,1); assert.equal(result.bullet_coverage,1); assert.equal(result.pass,true);
  assert.equal(result.borderline_results.length,2);
});
test("field-level NONE policy rejects scope when only domains were marked", () => {
  const policy = parseContextGoldPolicy(JSON.stringify({schema_version:1,gold_blob_sha:"x",session_fingerprint:"s",field_none_semantics:{omitted_expected_domains:"NONE",omitted_expected_scopes:"NONE"},borderline_exclusions:[]}))!;
  const g=[{session_fingerprint:"s",bullet_number:1,source_quote:"Managed finance for headquarters.",expected_domains:["finance"]}] as const;
  const result=evaluateContextGold(g,[{source_quote:g[0].source_quote,domain:"finance",scope:"headquarters"}],undefined,policy);
  assert.equal(result.pass,false); assert.deepEqual(result.false_positive_quotes,[g[0].source_quote]);
});
test("missing mandatory phrase stays in recall denominator", () => {
  const g=[{session_fingerprint:"s",bullet_number:1,source_quote:"Managed finance.",expected_domains:["finance"]}] as const;
  const result=evaluateContextGold(g,[]);
  assert.equal(result.expected_phrase_count,1); assert.equal(result.recovered_phrase_count,0); assert.equal(result.recall,0); assert.equal(result.pass,false);
});
