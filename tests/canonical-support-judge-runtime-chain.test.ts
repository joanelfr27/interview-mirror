import assert from "node:assert/strict";
import test from "node:test";
import { runD16ShadowRuntimeIntegration } from "../src/lib/d16-shadow-runtime-integration.ts";
import { CanonicalSupportJudgmentError } from "../src/lib/canonical-support-judge.ts";

test("D16 full chain preserves support-judge diagnostics after completeness failure", async () => {
  process.env.SUPPORT_JUDGE_INCOMPLETE_TEST = "1";
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
    await assert.rejects(
      () => runD16ShadowRuntimeIntegration(session),
      (caught: unknown) => {
        if (!(caught instanceof CanonicalSupportJudgmentError)) {
          console.error(
            "D16 support-judge chain unexpected error:",
            caught instanceof Error ? { name: caught.name, message: caught.message, constructor: caught.constructor.name } : caught,
          );
          return false;
        }
        assert.equal(caught.diagnostic.parsed_successfully, true);
        assert.equal(caught.diagnostic.requirement_count, 1);
        assert.equal(caught.diagnostic.facet_count, 1);
        assert.deepEqual(caught.diagnostic.expected_facet_ids, ["F-1"]);
        assert.deepEqual(caught.diagnostic.returned_facet_ids, []);
        assert.deepEqual(caught.diagnostic.missing_facet_ids, ["F-1"]);
        assert.deepEqual(caught.diagnostic.unknown_facet_ids, []);
        assert.deepEqual(caught.diagnostic.duplicate_facet_ids, []);
        return true;
      },
    );
  } finally {
    delete process.env.SUPPORT_JUDGE_INCOMPLETE_TEST;
  }
});
