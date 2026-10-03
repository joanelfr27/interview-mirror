import assert from "node:assert/strict";
import test from "node:test";
import { OWNERSHIP_EXTRACTION_RULE, spanWithinParent } from "../src/lib/canonical-shadow-extractor.ts";

test("ownership prompt recognizes explicit candidate ownership independently of assertion type", () => {
  assert.match(OWNERSHIP_EXTRACTION_RULE, /Assertion type is a separate field and does not determine ownership/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /If the candidate is explicitly the actor\/owner of that action, return INDIVIDUAL/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /A RESPONSIBILITY assertion can still have INDIVIDUAL ownership/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"I built financial models." -> INDIVIDUAL/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"I managed the forecasting process." -> INDIVIDUAL/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"J'ai construit des modèles de forecast." -> INDIVIDUAL/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"J'ai piloté le processus budgétaire." -> INDIVIDUAL/i);
});

test("ownership prompt keeps manager-assigned responsibility distinct from candidate ownership", () => {
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"my manager assigned this responsibility to me"/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"me" is the recipient of the assignment, not the actor\/owner/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /Do NOT treat .* as INDIVIDUAL ownership/i);
});

test("ownership prompt keeps possessive references to other people distinct from candidate ownership", () => {
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"my predecessor"/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"my colleague"/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /marker elsewhere in the sentence is not sufficient/i);
});


test("normalized facet containment handles decomposed combining accents and preserves original text", () => {
  const source = "Expe\u0301rience en finance";
  const parent = {
    id: "SPAN-JD-TEST-REQUIREMENT-0-22",
    document_id: "JD-TEST",
    text: source,
    start_offset: 0,
    end_offset: source.length,
    language: "fr",
    source_section: "UNKNOWN_SECTION",
  } as const;

  const span = spanWithinParent(parent as any, "Expérience en finance");
  assert.ok(span);
  assert.equal(span.text, source);
  assert.equal(span.start_offset, 0);
  assert.equal(span.end_offset, source.length);
});
