import { describe, expect, it } from "node:test";
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
    expect(roleCapabilityCriticalityOrder("CRITICAL")).toBeGreaterThan(
      roleCapabilityCriticalityOrder("IMPORTANT"),
    );
    expect(roleCapabilityCriticalityOrder("IMPORTANT")).toBeGreaterThan(
      roleCapabilityCriticalityOrder("SUPPORTING"),
    );
  });

  it("accepts a fully sourced canonical model", () => {
    expect(validateRoleCapabilityModel(validModel)).toEqual([]);
    expect(validateRoleCapabilityModelAgainstCanonicalRequirements(validModel, canonicalRequirements)).toEqual([]);
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
    expect(errors.some((error) => error.includes("Duplicate capability_id"))).toBe(true);
    expect(errors.some((error) => error.includes("Duplicate canonical_requirement_id"))).toBe(true);
    expect(errors.some((error) => error.includes("Missing source_version"))).toBe(true);
  });

  it("rejects runtime source types outside the frozen allowlist", () => {
    const invalid = {
      ...validModel,
      requirements: [{
        ...validModel.requirements[0],
        source: { ...validModel.requirements[0].source, source_type: "JD_INFERRED" },
      }],
    } as RoleCapabilityModel;

    expect(validateRoleCapabilityModel(invalid).some((error) => error.includes("Unsupported source_type"))).toBe(true);
  });

  it("fails closed when an RCM requirement ID is not in the canonical graph", () => {
    const invalid = {
      ...validModel,
      requirements: [{ ...validModel.requirements[0], canonical_requirement_id: "req-missing" }],
    };
    expect(validateRoleCapabilityModelAgainstCanonicalRequirements(invalid, canonicalRequirements)).toContain(
      "Unknown canonical_requirement_id for regional-finance: req-missing",
    );
  });

  it("fails closed when RCM normalized text diverges from the canonical requirement", () => {
    const invalid = {
      ...validModel,
      requirements: [{ ...validModel.requirements[0], normalized_requirement: "Different requirement" }],
    };
    expect(validateRoleCapabilityModelAgainstCanonicalRequirements(invalid, canonicalRequirements)).toContain(
      "RCM normalized_requirement diverges from canonical requirement req-regional-finance.",
    );
  });

  it("rejects an unsupported model version", () => {
    const invalid = {
      ...validModel,
      version: "rcm-v2",
    } as RoleCapabilityModel;

    expect(validateRoleCapabilityModel(invalid)).toContain(
      "Unsupported Role Capability Model version: rcm-v2",
    );
  });
});
