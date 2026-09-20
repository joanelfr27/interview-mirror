import type { CvAnalysis, SessionRecord } from "@/types";
import {
  type AtomicEvidence,
  type EvidenceLedger,
  type Requirement,
  type RequirementFacet,
  type SourceSpan,
  type SupportJudgment,
  aggregateRequirementStatus,
} from "@/lib/canonical-evidence-model";

/**
 * Transitional adapter only.
 *
 * This converts the current audit-version evidence chain into the canonical
 * ontology without pretending that the legacy model contains information it
 * does not have. In particular, it creates only one FUNCTION facet per legacy
 * JD requirement. Full facet decomposition belongs to the canonical extractor.
 *
 * This adapter is intentionally suitable for shadow-mode validation, not as the
 * final source of truth.
 */

function findExactSpan(documentId: string, source: string, text: string, language: string, occurrence = 0): SourceSpan | null {
  if (!text.trim()) return null;
  const start = source.indexOf(text, 0);
  if (start < 0) return null;
  let cursor = start;
  for (let i = 0; i < occurrence; i += 1) {
    cursor = source.indexOf(text, cursor + text.length);
    if (cursor < 0) return null;
  }
  return {
    id: `SPAN-${documentId}-${Math.max(0, cursor)}`,
    document_id: documentId,
    text,
    start_offset: cursor,
    end_offset: cursor + text.length,
    language,
  };
}

function toAtomicEvidence(
  session: SessionRecord,
  factId: string,
  fact: string,
  exactSource: string,
  index: number,
): { atom: AtomicEvidence | null; span: SourceSpan | null } {
  const cv = session.cv_text ?? "";
  const span = findExactSpan(`CV-${session.id}`, cv, exactSource, session.preparation_language ?? "en");
  if (!span) return { atom: null, span: null };

  return {
    span,
    atom: {
      id: factId || `LEGACY-A${index + 1}`,
      source_span_id: span.id,
      provenance: {
        source_type: "CV",
        language: span.language,
        extraction_method: "LLM",
      },
      subject: {
        actor: "candidate",
        ownership: "UNKNOWN",
      },
      action: {
        normalized_action: fact,
        object: fact,
      },
      context: {},
      scale: {},
      time: {},
      outcome: null,
      assertion: { type: "STATED", polarity: "AFFIRMATIVE" },
      verifiability: {
        has_quantifiable_metric: /[%€$£]|\b(?:million|thousand|k|m)\b/i.test(exactSource),
        has_third_party_entity: /\b(?:SAP|Oracle|Sage|ACCA|CFA|CPA|MBA)\b/i.test(exactSource),
        has_time_anchor: /\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b/i.test(exactSource),
      },
      extraction_confidence: 0.5,
    },
  };
}

export function adaptLegacyAnalysisToCanonical(session: SessionRecord): EvidenceLedger {
  const analysis = session.cv_analysis;
  const chain = analysis?.evidenceChain ?? [];
  const atoms: AtomicEvidence[] = [];
  const sourceSpans: SourceSpan[] = [];
  const requirements: Requirement[] = [];
  const judgments: SupportJudgment[] = [];

  const requirementSeen = new Set<string>();

  chain.forEach((item, itemIndex) => {
    const requirementId = item.canonical_jd_requirements?.[0]?.requirement_id
      ?? analysis?.jdRequirements?.[0]?.requirement_id
      ?? `LEGACY-REQ-${itemIndex + 1}`;

    const jdSource = item.canonical_jd_requirements?.[0]?.exact_jd_source_text
      ?? analysis?.jdRequirements?.find((r) => r.requirement_id === requirementId)?.exact_jd_source_text
      ?? item.jd_requirement;

    const jdSpan = findExactSpan(
      `JD-${session.id}`,
      session.job_description ?? "",
      jdSource,
      session.preparation_language ?? "en",
    );

    if (!jdSpan) return;

    if (!requirementSeen.has(requirementId)) {
      const facet: RequirementFacet = {
        id: `${requirementId}-F-LEGACY`,
        type: "FUNCTION",
        requirement: item.jd_requirement,
        source_span_id: jdSpan.id,
      };

      requirements.push({
        id: requirementId,
        source_span_id: jdSpan.id,
        normalized_requirement: item.jd_requirement,
        category: item.canonical_jd_requirements?.[0]?.requirement_type ?? "CAPABILITY",
        salience: "IMPORTANT",
        facets: [facet],
        extraction_confidence: 0.5,
      });
      requirementSeen.add(requirementId);
    }

    const facts = item.evidence_facts ?? [];
    facts.forEach((fact, factIndex) => {
      const converted = toAtomicEvidence(
        session,
        fact.fact_id || `LEGACY-A${itemIndex + 1}-${factIndex + 1}`,
        fact.fact,
        fact.exact_source_text,
        itemIndex + factIndex,
      );

      if (!converted.atom || !converted.span) return;

      atoms.push(converted.atom);
      sourceSpans.push(converted.span);

      const relation = fact.requirement_relations?.find((r) => r.requirement_id === requirementId);
      if (!relation) return;

      const facetId = `${requirementId}-F-LEGACY`;
      const status = relation.relation === "DIRECT"
        ? (relation.documented_level === "OWNERSHIP" || relation.documented_level === "MASTERY" ? "DIRECT" : "PARTIAL")
        : "ANALOGICAL_TRANSFER";

      judgments.push({
        id: `LEGACY-SJ-${converted.atom.id}-${facetId}`,
        requirement_id: requirementId,
        facet_id: facetId,
        status,
        supporting_evidence_ids: [converted.atom.id],
        rationale: "Translated from the legacy requirement relation; not a new semantic judgment.",
        confidence: 0.5,
        abstained: false,
        support_basis: "DOCUMENTED",
      });
    });
  });

  const requirementStatuses = requirements.map((requirement) => ({
    requirement_id: requirement.id,
    status: aggregateRequirementStatus(requirement, judgments),
  }));

  return {
    source_spans: sourceSpans,
    evidence: atoms,
    requirements,
    support_judgments: judgments,
    requirement_statuses: requirementStatuses,
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
}
