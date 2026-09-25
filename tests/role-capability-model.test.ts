import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ROLE_CAPABILITY_MODEL_VERSION,
  roleCapabilityCriticalityOrder,
  validateRoleCapabilityModel,
  validateRoleCapabilityModelAgainstCanonicalRequirements,
  type RoleCapabilityModel,
} from "@/lib/role-capability-model";

const canonicalRequirements = [
  { id: "req-regional-finance", normalized_requirement: "Regional finance leadership" },
  { id: "req-reporting", normalized_requirement: "Financial reporting" },
];

const validModel: RoleCapabilityModel = {
  version: ROLE_CAPABILITY_MODEL_VERSION,
  model_id: "finance-manager-v1",
  role_family: "FINANCE_MANAGEMENT",
  role_title: "Finance Manager",
  requirements: [
    {
      capability_id: "regional-finance",
      normalized_requirement: "Regional finance leadership",
      baseline_criticality: "CRITICAL",
      source: {
        source_type: "ROLE_TEMPLATE",
        source_id: "finance-manager",
        source_version: "2026-09",
      },
      canonical_requirement_id: "req-regional-finance",
    },
    {
      capability_id: "reporting",
      normalized_requirement: "Financial reporting",
      baseline_criticality: "IMPORTANT",
      source: {
        source_type: "ROLE_TEMPLATE",
        source_id: "finance-manager",
        source_version: "2026-09",
      },
      canonical_requirement_id: "req-reporting",
    },
  ],
};

describe("Role Capability Model v1", () => {
  it("uses deterministic criticality ordering", () => {
    assert.ok(roleCapabilityCriticalityOrder("CRITICAL") > roleCapabilityCriticalityOrder("IMPORTANT"));
    assert.ok(roleCapabilityCriticalityOrder("IMPORTANT") > roleCapabilityCriticalityOrder("SUPPORTING"));
  });

  it("accepts a fully sourced canonical model", () => {
    assert.deepEqual(validateRoleCapabilityModel(validModel), []);
    assert.deepEqual(validateRoleCapabilityModelAgainstCanonicalRequirements(validModel, canonicalRequirements), []);
  });

  it("fails closed on duplicate identities and missing source versions", () => {
    const invalid: RoleCapabilityModel = {
      ...validModel,
      requirements: [
        validModel.requirements[0],
        {
          ...validModel.requirements[1],
          capability_id: validModel.requirements[0].capability_id,
          canonical_requirement_id: validModel.requirements[0].canonical_requirement_id,
          source: { ...validModel.requirements[1].source, source_version: "" },
        },
      ],
    };
    const errors = validateRoleCapabilityModel(invalid);
    assert.ok(errors.some((error) => error.includes("Duplicate capability_id")));
    assert.ok(errors.some((error) => error.includes("Duplicate canonical_requirement_id")));
    assert.ok(errors.some((error) => error.includes("Missing source_version")));
  });

  it("rejects runtime source types outside the frozen allowlist", () => {
    const invalid = {
      ...validModel,
      requirements: [{ ...validModel.requirements[0], source: { ...validModel.requirements[0].source, source_type: "JD_INFERRED" } }],
    };
    const errors = validateRoleCapabilityModel(invalid as unknown as RoleCapabilityModel);
    assert.ok(errors.some((error) => error.includes("Unsupported source_type")));
  });

  it("fails closed when an RCM requirement ID is not in the canonical graph", () => {
    const invalid = { ...validModel, requirements: [{ ...validModel.requirements[0], canonical_requirement_id: "req-missing" }] };
    assert.deepEqual(validateRoleCapabilityModelAgainstCanonicalRequirements(invalid, canonicalRequirements), [
      "Unknown canonical_requirement_id for regional-finance: req-missing",
    ]);
  });

  it("fails closed when RCM normalized text diverges from the canonical requirement", () => {
    const invalid = { ...validModel, requirements: [{ ...validModel.requirements[0], normalized_requirement: "Different requirement" }] };
    assert.deepEqual(validateRoleCapabilityModelAgainstCanonicalRequirements(invalid, canonicalRequirements), [
      "RCM normalized_requirement diverges from canonical requirement req-regional-finance.",
    ]);
  });

  it("rejects an unsupported model version", () => {
    const invalid = { ...validModel, version: "rcm-v2" };
    const errors = validateRoleCapabilityModel(invalid as unknown as RoleCapabilityModel);
    assert.ok(errors.includes("Unsupported Role Capability Model version: rcm-v2"));
  });
});
