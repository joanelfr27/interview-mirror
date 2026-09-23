import test from "node:test";
import assert from "node:assert/strict";
import { isJourney, purposeForJourney, JOURNEYS } from "../src/lib/journey.ts";

test("D12: all five frozen journeys are valid", () => {
  assert.equal(JOURNEYS.length, 5);
  for (const journey of JOURNEYS) assert.equal(isJourney(journey), true);
});

test("D12-14: missing or malformed journey fails validation", () => {
  assert.equal(isJourney(null), false);
  assert.equal(isJourney(undefined), false);
  assert.equal(isJourney(""), false);
  assert.equal(isJourney("upcoming_interview"), false);
  assert.equal(isJourney("random"), false);
});

test("D12: journey mapping preserves the two canonical purposes", () => {
  assert.equal(purposeForJourney("new_upcoming"), "upcoming_interview");
  assert.equal(purposeForJourney("continue_upcoming"), "upcoming_interview");
  assert.equal(purposeForJourney("new_opportunity"), "upcoming_interview");
  assert.equal(purposeForJourney("new_skills"), "improve_skills");
  assert.equal(purposeForJourney("continue_skills"), "improve_skills");
});
