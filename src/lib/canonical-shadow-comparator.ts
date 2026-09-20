import type { SessionRecord } from "@/types";
import type { CanonicalShadowResult } from "@/lib/canonical-shadow-extractor";

/**
 * E1.2 — deterministic shadow comparison.
 *
 * This compares the new canonical representation with the legacy EvidenceChain
 * without declaring either representation semantically correct.
 *
 * The purpose is diagnostic: granularity, source anchoring and coverage.
 */

export type ShadowComparison = {
  legacy: {
    evidence_item_count: number;
    fact_count: number;
    requirement_count: number;
    explicit_no_evidence_count: number;
  };
  canonical: {
    atom_count: number;
    requirement_count: number;
    facet_count: number;
    source_span_count: number;
    rejected_atom_count: number;
    rejected_requirement_count: number;
    diagnostic_error_count: number;
    diagnostic_warning_count: number;
  };
  coverage: {
    canonical_atoms_per_legacy_fact: number;
    canonical_facets_per_requirement: number;
    exact_source_anchor_rate: number;
  };
  observations: string[];
};

export function compareCanonicalShadow(
  session: SessionRecord,
  shadow: CanonicalShadowResult,
): ShadowComparison {
  const chain = session.cv_analysis?.evidenceChain ?? [];

  const legacyFactCount = chain.reduce(
    (sum, item) => sum + (item.evidence_facts?.length ?? 0),
    0,
  );

  const legacyExplicitNoEvidenceCount = chain.filter(
    (item) => item.cv_evidence === "NO CV EVIDENCE FOUND",
  ).length;

  const canonicalAtomCount = shadow.ledger.evidence.length;
  const canonicalRequirementCount = shadow.ledger.requirements.length;
  const canonicalFacetCount = shadow.ledger.requirements.reduce(
    (sum, requirement) => sum + requirement.facets.length,
    0,
  );

  const exactAnchorRate =
    canonicalAtomCount + shadow.diagnostics.rejected_atoms.length === 0
      ? 1
      : canonicalAtomCount /
        (canonicalAtomCount + shadow.diagnostics.rejected_atoms.length);

  const observations: string[] = [];

  if (canonicalAtomCount > legacyFactCount) {
    observations.push(
      "Canonical extraction preserves more candidate evidence units than the legacy evidence chain.",
    );
  } else if (canonicalAtomCount < legacyFactCount) {
    observations.push(
      "Canonical extraction currently preserves fewer candidate evidence units than the legacy evidence chain; inspect rejected atoms before proceeding.",
    );
  } else {
    observations.push(
      "Canonical and legacy representations contain the same number of candidate evidence units; inspect granularity and source spans rather than relying on counts.",
    );
  }

  if (canonicalFacetCount > canonicalRequirementCount) {
    observations.push(
      "JD requirements are decomposed into multiple facets where the source supports them.",
    );
  } else {
    observations.push(
      "JD facet decomposition has not produced multiple facets for the current sample; inspect whether the JD genuinely supports finer decomposition.",
    );
  }

  if (legacyExplicitNoEvidenceCount > 0 && canonicalAtomCount > 0) {
    observations.push(
      "The legacy chain contains explicit 'no CV evidence' outcomes while canonical extraction retains raw CV atoms; this is a diagnostic signal for the known summary/grounding failure, not proof that every requirement is supported.",
    );
  }

  if (shadow.diagnostics.rejected_atoms.length > 0) {
    observations.push(
      "Some candidate atoms were rejected by deterministic source validation and must be reviewed before canonical extraction is trusted.",
    );
  }

  if (shadow.diagnostics.rejected_requirements.length > 0) {
    observations.push(
      "Some JD requirements were rejected by deterministic source validation and must be reviewed before facet judgments are trusted.",
    );
  }

  return {
    legacy: {
      evidence_item_count: chain.length,
      fact_count: legacyFactCount,
      requirement_count: new Set(
        chain.flatMap((item) =>
          (item.canonical_jd_requirements ?? []).map((requirement) => requirement.requirement_id),
        ),
      ).size,
      explicit_no_evidence_count: legacyExplicitNoEvidenceCount,
    },
    canonical: {
      atom_count: canonicalAtomCount,
      requirement_count: canonicalRequirementCount,
      facet_count: canonicalFacetCount,
      source_span_count: shadow.source_spans.length,
      rejected_atom_count: shadow.diagnostics.rejected_atoms.length,
      rejected_requirement_count: shadow.diagnostics.rejected_requirements.length,
      diagnostic_error_count: shadow.diagnostics.errors.length,
      diagnostic_warning_count: shadow.diagnostics.warnings.length,
    },
    coverage: {
      canonical_atoms_per_legacy_fact:
        legacyFactCount === 0 ? canonicalAtomCount : canonicalAtomCount / legacyFactCount,
      canonical_facets_per_requirement:
        canonicalRequirementCount === 0 ? 0 : canonicalFacetCount / canonicalRequirementCount,
      exact_source_anchor_rate: exactAnchorRate,
    },
    observations,
  };
}
