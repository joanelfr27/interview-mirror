import assert from "node:assert/strict";
import test from "node:test";
import { runD16ShadowRuntimeIntegration } from "../src/lib/d16-shadow-runtime-integration.ts";

test("D16 full chain preserves fail-closed support-judge completion for omitted facets", async () => {
  const previousIncompleteFlag = process.env.SUPPORT_JUDGE_INCOMPLETE_TEST;
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  process.env.SUPPORT_JUDGE_INCOMPLETE_TEST = "1";
  process.env.OPENAI_API_KEY = "test-key";
  const session = {
    id: "CHAIN-TEST",
    user_id: "USER-TEST",
    title: "Finance Manager",
    cv_text: "I managed finance",
    job_description: "Manage finance",
    cv_analysis: null,
    interview_strategy: null,
    preparation_language: "en",
    preparation_purpose: "INTERVIEW",
    interview_date: null,
    coaching_focus: null,
    job_description_url: null,
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  } as any;

  try {
    const result = await runD16ShadowRuntimeIntegration(session);
    const judgments = result.ledger.support_judgments;
    assert.equal(judgments.length, 1);
    assert.equal(judgments[0]?.facet_id, "F-1");
    assert.equal(judgments[0]?.status, "NONE");
    assert.equal(judgments[0]?.abstained, true);
    assert.deepEqual(judgments[0]?.supporting_evidence_ids, []);
    assert.equal(judgments[0]?.confidence, 0);
  } finally {
    if (previousIncompleteFlag === undefined) delete process.env.SUPPORT_JUDGE_INCOMPLETE_TEST;
    else process.env.SUPPORT_JUDGE_INCOMPLETE_TEST = previousIncompleteFlag;
    if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAIKey;
  }
});
