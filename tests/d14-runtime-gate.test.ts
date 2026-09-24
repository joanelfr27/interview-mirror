import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/analyze/route.ts";

test("D14 runtime gate rejects analysis without a canonical CV", async () => {
  const request = new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      preparationPurpose: "improve_skills",
      journey: "new_skills",
      cvText: "Legacy CV text that must not bypass canonical ingestion.",
      jobDescription: "",
    }),
  });

  const response = await POST(request);
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, "CANONICAL_CV_REQUIRED");
});
