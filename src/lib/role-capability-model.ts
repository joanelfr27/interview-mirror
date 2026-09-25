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

const CRITICALITY_ORDER: Record<RoleCapabilityCriticality, number> = {
  CRITICAL: 3,
  IMPORTANT: 2,
  SUPPORTING: 1,
};

export function roleCapabilityCriticalityOrder(
  criticality: RoleCapabilityCriticality,
): number {
  return CRITICALITY_ORDER[criticality];
}

export function validateRoleCapabilityModel(
  model: RoleCapabilityModel,
): string[] {
  const errors: string[] = [];

  if (model.version !== ROLE_CAPABILITY_MODEL_VERSION) {
    errors.push(`Unsupported Role Capability Model version: ${model.version}`);
  }
  if (!model.model_id.trim()) errors.push("Role Capability Model model_id is required.");
  if (!model.role_family.trim()) errors.push("Role Capability Model role_family is required.");
  if (!model.role_title.trim()) errors.push("Role Capability Model role_title is required.");

  const capabilityIds = new Set<string>();
  const requirementIds = new Set<string>();

  for (const requirement of model.requirements) {
    if (capabilityIds.has(requirement.capability_id)) {
      errors.push(`Duplicate capability_id: ${requirement.capability_id}`);
    }
    capabilityIds.add(requirement.capability_id);

    if (requirementIds.has(requirement.canonical_requirement_id)) {
      errors.push(`Duplicate canonical_requirement_id: ${requirement.canonical_requirement_id}`);
    }
    requirementIds.add(requirement.canonical_requirement_id);

    if (!requirement.capability_id.trim()) errors.push("Empty capability_id.");
    if (!requirement.normalized_requirement.trim()) {
      errors.push(`Empty normalized_requirement for ${requirement.capability_id}.`);
    }
    if (!requirement.canonical_requirement_id.trim()) {
      errors.push(`Missing canonical_requirement_id for ${requirement.capability_id}.`);
    }
    if (!Object.prototype.hasOwnProperty.call(CRITICALITY_ORDER, requirement.baseline_criticality)) {
      errors.push(
        `Unsupported baseline criticality for ${requirement.capability_id}: ${requirement.baseline_criticality}`,
      );
    }

    if (!requirement.source.source_id.trim()) {
      errors.push(`Missing source_id for ${requirement.capability_id}.`);
    }
    if (!requirement.source.source_version.trim()) {
      errors.push(`Missing source_version for ${requirement.capability_id}.`);
    }
  }

  return errors;
}
