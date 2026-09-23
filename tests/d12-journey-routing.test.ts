import test from "node:test";
import assert from "node:assert/strict";
import { isJourney, purposeForJourney, JOURNEYS, isContinuationJourney, isNewJourney, continuationInputsChanged, isResumableSessionStatus, continuationResetState } from "../src/lib/journey.ts";

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

test("D12: new and continuation journey semantics are explicit", () => {
  assert.deepEqual(JOURNEYS.filter(isContinuationJourney), ["continue_upcoming", "continue_skills"]);
  assert.deepEqual(JOURNEYS.filter(isNewJourney), ["new_upcoming", "new_skills", "new_opportunity"]);
});

test("D12-06: canonical continuation text comparison ignores harmless formatting", () => {
  assert.equal(
    continuationInputsChanged("CV\u00a0text  with   spacing", "", "CV text with spacing", ""),
    false,
  );
  assert.equal(
    continuationInputsChanged("CV text", "same JD", "CV text", "changed JD"),
    true,
  );
});

test("D12-07: completed sessions are not resumable", () => {
  assert.equal(isResumableSessionStatus("completed"), false);
  assert.equal(isResumableSessionStatus("draft"), true);
  assert.equal(isResumableSessionStatus("analyzed"), true);
});

test("D12-08: unchanged continuation preserves practice state", () => {
  assert.deepEqual(continuationResetState("analyzed", false), {
    status: "analyzed",
    resetStrategy: false,
    resetQuestions: false,
  });
  assert.deepEqual(continuationResetState("in_progress", false), {
    status: "in_progress",
    resetStrategy: false,
    resetQuestions: false,
  });
});

test("D12-08: changed CV/JD forces fresh strategy and question state", () => {
  assert.deepEqual(continuationResetState("completed", true), {
    status: "analyzed",
    resetStrategy: true,
    resetQuestions: true,
  });
});
