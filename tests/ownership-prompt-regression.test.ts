import assert from "node:assert/strict";
import test from "node:test";
import { OWNERSHIP_EXTRACTION_RULE } from "../src/lib/canonical-shadow-extractor.ts";

test("ownership prompt recognizes explicit candidate ownership independently of assertion type", () => {
  assert.match(OWNERSHIP_EXTRACTION_RULE, /Assertion type is a separate field and does not determine ownership/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /If the candidate is explicitly the actor\/owner of that action, return INDIVIDUAL/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /A RESPONSIBILITY assertion can still have INDIVIDUAL ownership/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"I built financial models." -> INDIVIDUAL/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"I managed the forecasting process." -> INDIVIDUAL/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"J'ai construit des modèles de forecast." -> INDIVIDUAL/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"J'ai piloté le processus budgétaire." -> INDIVIDUAL/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /If the quote explicitly states that the candidate and another person jointly perform or own the asserted action, return SHARED rather than INDIVIDUAL/i);
  assert.match(OWNERSHIP_EXTRACTION_RULE, /"I jointly built the forecast models with my manager." -> SHARED/i);
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
