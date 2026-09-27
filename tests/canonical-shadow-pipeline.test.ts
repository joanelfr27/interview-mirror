import assert from "node:assert/strict";
import test from "node:test";
import {
  getCanonicalShadowEarlyReturnReasons,
  type CanonicalShadowEarlyReturnReason,
} from "../src/lib/canonical-shadow-pipeline.ts";

function diagnostics(overrides: Partial<{
  errors: string[];
  rejected_atoms: string[];
  rejected_requirements: string[];
}> = {}) {
  return {
    errors: overrides.errors ?? [],
    warnings: [],
    candidate_atom_count: 1,
    requirement_count: 1,
    facet_count: 1,
    rejected_atoms: overrides.rejected_atoms ?? [],
    rejected_requirements: overrides.rejected_requirements ?? [],
    raw_ownership_by_atom_id: {},
    raw_ownership_by_rejected_atom_id: {},
  } as const;
}

function ledger(evidence = 1, requirements = 1) {
  return {
    evidence: Array.from({ length: evidence }, (_, i) => ({ id: String(i + 1) })),
    requirements: Array.from({ length: requirements }, (_, i) => ({ id: String(i + 1) })),
  } as any;
}

test("canonical shadow early-return reasons preserve each independent gate", () => {
  const cases: Array<[CanonicalShadowEarlyReturnReason, ReturnType<typeof diagnostics>, any]> = [
    ["EXTRACTION_ERRORS", diagnostics({ errors: ["grounding failure"] }), ledger()],
    ["REJECTED_ATOMS", diagnostics({ rejected_atoms: ["A-1"] }), ledger()],
    ["REJECTED_REQUIREMENTS", diagnostics({ rejected_requirements: ["R-1"] }), ledger()],
    ["NO_EVIDENCE", diagnostics(), ledger(0, 1)],
    ["NO_REQUIREMENTS", diagnostics(), ledger(1, 0)],
  ];

  for (const [expected, d, l] of cases) {
    assert.deepEqual(getCanonicalShadowEarlyReturnReasons(d as any, l), [expected]);
  }
});

test("canonical shadow early-return reasons preserve multiple simultaneous causes", () => {
  assert.deepEqual(
    getCanonicalShadowEarlyReturnReasons(
      diagnostics({ errors: ["x"], rejected_atoms: ["A-1"], rejected_requirements: ["R-1"] }) as any,
      ledger(0, 0),
    ),
    [
      "EXTRACTION_ERRORS",
      "REJECTED_ATOMS",
      "REJECTED_REQUIREMENTS",
      "NO_EVIDENCE",
      "NO_REQUIREMENTS",
    ],
  );
});
