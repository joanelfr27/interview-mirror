import type { EvidenceMapNode, EvidenceStatus, EvidenceType } from "@/lib/strategy-engine";
import type {
  AtomicEvidence,
  EvidenceLedger,
  Requirement,
  RequirementFacetType,
  SupportJudgment,
} from "@/lib/canonical-evidence-model";
import type { AtomicFactRequirementRelation, CanonicalJDRequirement, JDRequirementType, JDRequiredLevel, DocumentedEvidenceLevel } from "@/types";

function typeForFacet(facet: RequirementFacetType): EvidenceType {
  if (facet === "TOOL_METHOD") return "TOOL_OR_SYSTEM";
  if (facet === "OUTCOME") return "ACHIEVEMENT";
  if (facet === "LEVEL" || facet === "SCALE" || facet === "OWNERSHIP" || facet === "STAKEHOLDER") return "RESPONSIBILITY";
  return "EXPERIENCE";
}

function jdType(requirement: Requirement): JDRequirementType {
  switch (requirement.category.toUpperCase()) {
    case "TOOL": return "TOOL";
    case "DOMAIN": return "DOMAIN";
    case "QUALIFICATION": return "QUALIFICATION";
    case "STANDARD": return "STANDARD";
    case "RESPONSIBILITY": return "RESPONSIBILITY";
    default: return "CAPABILITY";
  }
}

function requiredLevel(requirement: Requirement): JDRequiredLevel {
  switch (requirement.salience) {
    case "CORE": return "ADVANCED";
    case "IMPORTANT": return "WORKING";
    case "SUPPORTING": return "KNOWLEDGE";
    default: return "PREFERRED";
  }
}

function documentedLevel(judgment: SupportJudgment, atom: AtomicEvidence): DocumentedEvidenceLevel {
  if (judgment.status === "DIRECT") {
    if (atom.subject.ownership === "INDIVIDUAL" && atom.outcome) return "OWNERSHIP";
    if (atom.subject.ownership === "INDIVIDUAL") return "RESPONSIBILITY";
    return "PRACTICE";
  }
  if (judgment.status === "ANALOGICAL_TRANSFER") return "PRACTICE";
  if (judgment.status === "PARTIAL") return "EXPOSURE";
  return "MENTION";
}

function relationFor(judgment: SupportJudgment): AtomicFactRequirementRelation["relation"] | null {
  if (judgment.status === "DIRECT") return "DIRECT";
  if (judgment.status === "ANALOGICAL_TRANSFER") return "RELATED";
  return null;
}

function statusFor(requirementId: string, ledger: EvidenceLedger): EvidenceStatus {
  const status = ledger.requirement_statuses.find((item) => item.requirement_id === requirementId)?.status;
  if (status === "SUPPORTED") return "PROVEN";
  if (status === "PARTIAL") return "PARTIALLY_PROVEN";
  if (status === "CONTRADICTED") return "UNKNOWN";
  return "NOT_DOCUMENTED";
}

function atomFor(ledger: EvidenceLedger, id: string): AtomicEvidence {
  const atom = ledger.evidence.find((item) => item.id === id);
  if (!atom) throw new Error("D3 Strategy bridge encountered unknown evidence: " + id);
  return atom;
}

function sourceTextFor(ledger: EvidenceLedger, atom: AtomicEvidence): string {
  const span = ledger.source_spans.find((item) => item.id === atom.source_span_id);
  if (!span) throw new Error("D3 Strategy bridge encountered unknown source span: " + atom.source_span_id);
  return span.text;
}

function relation(
  ledger: EvidenceLedger,
  requirementId: string,
  judgment: SupportJudgment,
  atom: AtomicEvidence,
): AtomicFactRequirementRelation | null {
  const kind = relationFor(judgment);
  if (!kind) return null;
  const source = sourceTextFor(ledger, atom);
  return {
    requirement_id: requirementId,
    relation: kind,
    documented_level: documentedLevel(judgment, atom),
    exact_cv_source_text: source,
  };
}

function canonicalRequirement(ledger: EvidenceLedger, requirement: Requirement): CanonicalJDRequirement {
  return {
    requirement_id: requirement.id,
    capability: requirement.normalized_requirement,
    requirement_type: jdType(requirement),
    required_level: requiredLevel(requirement),
    exact_jd_source_text: sourceTextFor(ledger, {
      ...atomFor(ledger, ledger.evidence[0]?.id ?? ""),
      source_span_id: requirement.source_span_id,
    }),
  };
}

export function buildStrategyEvidenceMapFromCanonicalLedger(
  ledger: EvidenceLedger,
): EvidenceMapNode[] {
  const spans = new Map(ledger.source_spans.map((span) => [span.id, span]));
  const atoms = new Map(ledger.evidence.map((atom) => [atom.id, atom]));

  return ledger.requirements.map((requirement, index) => {
    const judgments = requirement.facets
      .map((facet) => ledger.support_judgments.find(
        (item) => item.requirement_id === requirement.id && item.facet_id === facet.id,
      ))
      .filter((item): item is SupportJudgment => Boolean(item));

    const candidateRelations: AtomicFactRequirementRelation[] = [];
    const supportingFacts = new Map<string, EvidenceMapNode["supporting_facts"][number]>();

    for (const judgment of judgments) {
      const kind = relationFor(judgment);
      if (!kind) continue;
      for (const evidenceId of judgment.supporting_evidence_ids) {
        const atom = atoms.get(evidenceId);
        if (!atom) throw new Error("D3 Strategy bridge encountered unknown evidence: " + evidenceId);
        const source = spans.get(atom.source_span_id);
        if (!source) throw new Error("D3 Strategy bridge encountered unknown source span: " + atom.source_span_id);

        const rel = relation(ledger, requirement.id, judgment, atom);
        if (!rel) continue;
        candidateRelations.push(rel);

        const fact = supportingFacts.get(atom.id);
        if (fact) {
          fact.requirement_relations = [...(fact.requirement_relations ?? []), rel];
        } else {
          supportingFacts.set(atom.id, {
            fact_id: atom.id,
            fact: [atom.action.normalized_action, atom.action.object].filter(Boolean).join(" "),
            category: atom.context.tools_or_systems?.length ? "TOOL" : "RESPONSIBILITY",
            exact_source_text: source.text,
            requirement_relations: [rel],
          });
        }
      }
    }

    const requirementSpan = spans.get(requirement.source_span_id);
    if (!requirementSpan) throw new Error("D3 Strategy bridge encountered unknown requirement source span: " + requirement.source_span_id);

    const canonical = {
      requirement_id: requirement.id,
      capability: requirement.normalized_requirement,
      requirement_type: jdType(requirement),
      required_level: requiredLevel(requirement),
      exact_jd_source_text: requirementSpan.text,
    };

    const firstFacet = requirement.facets[0];
    const type = typeForFacet(firstFacet?.type ?? "FUNCTION");

    return {
      node_id: "CE" + String(index + 1).padStart(2, "0"),
      type,
      status: statusFor(requirement.id, ledger),
      fact: requirement.normalized_requirement,
      jd_requirement: requirement.normalized_requirement,
      canonical_jd_requirements: [canonical],
      supporting_facts: [...supportingFacts.values()].map((fact) => ({
        ...fact,
        requirement_relations: [...new Map(
          (fact.requirement_relations ?? []).map((rel) => [rel.requirement_id + ":" + rel.relation + ":" + rel.exact_cv_source_text, rel])
        ).values()],
      })),
    };
  });
}

export function validateStrategyEvidenceMapBoundary(
  ledger: EvidenceLedger,
  evidenceMap: EvidenceMapNode[],
): string[] {
  const errors: string[] = [];
  const ledgerEvidence = new Set(ledger.evidence.map((atom) => atom.id));
  const ledgerRequirements = new Set(ledger.requirements.map((requirement) => requirement.id));

  for (const node of evidenceMap) {
    for (const fact of node.supporting_facts) {
      if (!ledgerEvidence.has(fact.fact_id)) errors.push("Strategy bridge references non-canonical fact: " + fact.fact_id);
      for (const rel of fact.requirement_relations ?? []) {
        if (!ledgerRequirements.has(rel.requirement_id)) errors.push("Strategy bridge references non-canonical requirement: " + rel.requirement_id);
        if (!fact.exact_source_text || rel.exact_cv_source_text !== fact.exact_source_text) {
          errors.push("Strategy bridge lost exact CV provenance for fact: " + fact.fact_id);
        }
      }
    }
  }
  return errors;
}
