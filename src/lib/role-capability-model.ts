import type { Requirement } from "@/lib/canonical-evidence-model";

export type RoleCapabilityCriticality = "CRITICAL" | "IMPORTANT" | "SUPPORTING";

export const ROLE_CAPABILITY_MODEL_VERSION = "rcm-v1" as const;

export type RoleCapabilitySourceType =
  | "ROLE_LIBRARY"
  | "ROLE_TEMPLATE"
  | "ADMIN_CURATED";

export type RoleCapabilityModelRequirement = {
  capability_id: string;
  normalized_requirement: string;
  baseline_criticality: RoleCapabilityCriticality;
  source: {
    source_type: RoleCapabilitySourceType;
    source_id: string;
    source_version: string;
  };
  canonical_requirement_id: string;
};

export type RoleCapabilityModel = {
  version: typeof ROLE_CAPABILITY_MODEL_VERSION;
  model_id: string;
  role_family: string;
  role_title: string;
  requirements: RoleCapabilityModelRequirement[];
};

const ROLE_CAPABILITY_SOURCE_TYPES = new Set<RoleCapabilitySourceType>([
  "ROLE_LIBRARY",
  "ROLE_TEMPLATE",
  "ADMIN_CURATED",
]);

const CRITICALITY_ORDER: Record<RoleCapabilityCriticality, number> = {
  CRITICAL: 3,
  IMPORTANT: 2,
  SUPPORTING: 1,
};

/** Returns the deterministic ordering value for a role capability criticality. */
export function roleCapabilityCriticalityOrder(
  criticality: RoleCapabilityCriticality,
): number {
  return CRITICALITY_ORDER[criticality];
}

/** Validates the structural and provenance contract of an RCM v1 model. */
export function validateRoleCapabilityModel(model: unknown): string[] {
  const errors: string[] = [];

  if (!model || typeof model !== "object" || Array.isArray(model)) {
    return ["Role Capability Model must be an object."];
  }

  const candidate = model as Record<string, unknown>;

  if (candidate.version !== ROLE_CAPABILITY_MODEL_VERSION) {
    errors.push(`Unsupported Role Capability Model version: ${String(candidate.version)}`);
  }

  for (const [field, label] of [
    ["model_id", "model_id"],
    ["role_family", "role_family"],
    ["role_title", "role_title"],
  ] as const) {
    if (typeof candidate[field] !== "string" || !candidate[field].trim()) {
      errors.push(`Role Capability Model ${label} is required.`);
    }
  }

  if (!Array.isArray(candidate.requirements)) {
    errors.push("Role Capability Model requirements must be an array.");
    return errors;
  }

  const capabilityIds = new Set<string>();
  const requirementIds = new Set<string>();

  for (const requirement of candidate.requirements) {
    if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) {
      errors.push("Role Capability Model requirement must be an object.");
      continue;
    }

    const item = requirement as Record<string, unknown>;
    const capabilityId = typeof item.capability_id === "string" ? item.capability_id : "";
    const normalizedRequirement =
      typeof item.normalized_requirement === "string" ? item.normalized_requirement : "";
    const canonicalRequirementId =
      typeof item.canonical_requirement_id === "string" ? item.canonical_requirement_id : "";

    if (capabilityId && capabilityIds.has(capabilityId)) {
      errors.push(`Duplicate capability_id: ${capabilityId}`);
    }
    if (capabilityId) capabilityIds.add(capabilityId);

    if (canonicalRequirementId && requirementIds.has(canonicalRequirementId)) {
      errors.push(`Duplicate canonical_requirement_id: ${canonicalRequirementId}`);
    }
    if (canonicalRequirementId) requirementIds.add(canonicalRequirementId);

    if (!capabilityId) errors.push("Empty capability_id.");
    if (!normalizedRequirement) {
      errors.push(`Empty normalized_requirement for ${capabilityId}.`);
    }
    if (!canonicalRequirementId) {
      errors.push(`Missing canonical_requirement_id for ${capabilityId}.`);
    }

    const source = item.source;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      errors.push(`Missing source for ${capabilityId}.`);
      continue;
    }

    const sourceRecord = source as Record<string, unknown>;
    const sourceType = sourceRecord.source_type;
    const sourceId = sourceRecord.source_id;
    const sourceVersion = sourceRecord.source_version;

    if (
      typeof sourceType !== "string" ||
      !ROLE_CAPABILITY_SOURCE_TYPES.has(sourceType as RoleCapabilitySourceType)
    ) {
      errors.push(`Unsupported source_type for ${capabilityId}: ${String(sourceType)}`);
    }

    if (
      typeof item.baseline_criticality !== "string" ||
      !Object.prototype.hasOwnProperty.call(CRITICALITY_ORDER, item.baseline_criticality)
    ) {
      errors.push(
        `Unsupported baseline criticality for ${capabilityId}: ${String(item.baseline_criticality)}`,
      );
    }

    if (typeof sourceId !== "string" || !sourceId.trim()) {
      errors.push(`Missing source_id for ${capabilityId}.`);
    }
    if (typeof sourceVersion !== "string" || !sourceVersion.trim()) {
      errors.push(`Missing source_version for ${capabilityId}.`);
    }
  }

  return errors;
}

/** Validates RCM requirement IDs and normalized text against the canonical D1–D3 requirement graph. */
export function validateRoleCapabilityModelAgainstCanonicalRequirements(
  model: unknown,
  canonicalRequirements: unknown,
): string[] {
  const errors = validateRoleCapabilityModel(model);

  if (!model || typeof model !== "object" || Array.isArray(model)) {
    return errors;
  }

  const candidate = model as Record<string, unknown>;
  if (!Array.isArray(candidate.requirements)) {
    return errors;
  }

  if (!Array.isArray(canonicalRequirements)) {
    errors.push("Canonical requirements must be an array.");
    return errors;
  }

  const canonicalById = new Map<string, { id: string; normalized_requirement: string }>();
  for (const requirement of canonicalRequirements) {
    if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) {
      errors.push("Canonical requirement must be an object.");
      continue;
    }

    const item = requirement as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id.trim() || typeof item.normalized_requirement !== "string") {
      errors.push("Canonical requirement must contain valid id and normalized_requirement fields.");
      continue;
    }

    canonicalById.set(item.id, {
      id: item.id,
      normalized_requirement: item.normalized_requirement,
    });
  }

  for (const requirement of candidate.requirements) {
    if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) {
      continue;
    }

    const item = requirement as Record<string, unknown>;
    const capabilityId =
      typeof item.capability_id === "string" ? item.capability_id : "";
    const canonicalRequirementId =
      typeof item.canonical_requirement_id === "string"
        ? item.canonical_requirement_id
        : "";
    const normalizedRequirement =
      typeof item.normalized_requirement === "string"
        ? item.normalized_requirement
        : "";

    if (!canonicalRequirementId) {
      continue;
    }

    const canonical = canonicalById.get(canonicalRequirementId);
    if (!canonical) {
      errors.push(
        `Unknown canonical_requirement_id for ${capabilityId}: ${canonicalRequirementId}`,
      );
      continue;
    }

    if (normalizedRequirement !== canonical.normalized_requirement) {
      errors.push(
        `RCM normalized_requirement diverges from canonical requirement ${canonical.id}.`,
      );
    }
  }

  return errors;
}
