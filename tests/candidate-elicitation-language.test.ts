import assert from "node:assert/strict";
import test from "node:test";
import { detectAnswerLanguage } from "../src/lib/candidate-elicitation.ts";

test("candidate answer language detection handles accented French", () => {
  assert.equal(detectAnswerLanguage("J'ai piloté la trésorerie et préparé les clôtures."), "fr");
  assert.equal(detectAnswerLanguage("I led treasury and prepared the close."), "en");
  assert.equal(detectAnswerLanguage("xgéré"), "mixed");
  assert.equal(detectAnswerLanguage("xmanaged"), "mixed");
});
