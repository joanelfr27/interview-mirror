import type { SessionRecord } from "@/types";
import { runCanonicalShadowPipeline } from "@/lib/canonical-shadow-pipeline";
import {
  buildCanonicalReasoningProjection,
  validateCanonicalReasoningProjection,
  type CanonicalReasoningProjection,
} from "@/lib/canonical-reasoning-adapter";
import {
  buildFitGapProjection,
  validateFitGapProjection,
  type FitGapProjection,
} from "@/lib/fit-gap-reasoning";
import {
  buildCanonicalEvidenceRoute,
  validateCanonicalEvidenceRoute,
  type CanonicalEvidenceRoute,
} from "@/lib/canonical-evidence-router";
import {
  buildFitGapConsumerProjection,
  validateFitGapConsumerProjection,
  type FitGapConsumerProjection,
} from "@/lib/fit-gap-consumer";
import {
  buildDemonstrationObjectiveConsumerProjection,
  validateDemonstrationObjectiveConsumerProjection,
  type DemonstrationObjectiveConsumerProjection,
} from "@/lib/demonstration-objective-consumer";
import {
  buildCanonicalStrategyBridgeProjection,
  validateCanonicalStrategyBridgeProjection,
  type CanonicalStrategyBridgeProjection,
} from "@/lib/canonical-strategy-bridge";
import {
  buildProfessionalMirror,
  validateProfessionalMirror,
  type ProfessionalMirror,
} from "@/lib/professional-mirror";
import { validateRequirementGraph, type EvidenceLedger } from "@/lib/canonical-evidence-model";
import type { CanonicalExtractionDiagnostics } from "@/lib/canonical-shadow-extractor";

export type D16ShadowRuntimeResult = {
  ledger: EvidenceLedger;
  d2: CanonicalReasoningProjection;
  d3: CanonicalEvidenceRoute;
  d4: FitGapConsumerProjection;
  d5: DemonstrationObjectiveConsumerProjection;
  d6: CanonicalStrategyBridgeProjection;
  d15: ProfessionalMirror;
  diagnostics: string[];
  /** Exact E1 extraction diagnostics object; D16 must consume without mutation or reinterpretation. */
  extraction_diagnostics: CanonicalExtractionDiagnostics;
};

export async function runD16ShadowRuntimeIntegration(
  session: SessionRecord,
): Promise<D16ShadowRuntimeResult> {
  const shadow = await runCanonicalShadowPipeline(session);
  const diagnostics = [...shadow.diagnostics];

  const graphErrors = validateRequirementGraph(shadow.ledger);
  if (graphErrors.length) {
    throw new Error("D16 shadow ledger validation failed: " + graphErrors.join(" | "));
  }

  const d2 = buildCanonicalReasoningProjection(shadow.ledger);
  const d2Validation = validateCanonicalReasoningProjection(d2);
  if (!d2Validation.valid) {
    throw new Error("D16 shadow D2 validation failed: " + d2Validation.errors.join(" | "));
  }

  const d2FitGap = buildFitGapProjection(d2);
  const d2FitGapValidation = validateFitGapProjection(d2FitGap);
  if (!d2FitGapValidation.valid) {
    throw new Error("D16 shadow Fit & Gap validation failed: " + d2FitGapValidation.errors.join(" | "));
  }

  const d3 = buildCanonicalEvidenceRoute(shadow.ledger);
  const d3Validation = validateCanonicalEvidenceRoute(d3, shadow.ledger);
  if (!d3Validation.valid) {
    throw new Error("D16 shadow D3 validation failed: " + d3Validation.errors.join(" | "));
  }

  const d4 = buildFitGapConsumerProjection(d2FitGap, d3, shadow.ledger);
  const d4Validation = validateFitGapConsumerProjection(d4, d2FitGap, d3, shadow.ledger);
  if (!d4Validation.valid) {
    throw new Error("D16 shadow D4 validation failed: " + d4Validation.errors.join(" | "));
  }

  const d5 = buildDemonstrationObjectiveConsumerProjection(
    d4,
    d2FitGap,
    d3,
    shadow.ledger,
  );
  const d5Validation = validateDemonstrationObjectiveConsumerProjection(
    d5,
    d4,
    d2FitGap,
    d3,
    shadow.ledger,
  );
  if (!d5Validation.valid) {
    throw new Error("D16 shadow D5 validation failed: " + d5Validation.errors.join(" | "));
  }

  const d6 = buildCanonicalStrategyBridgeProjection(
    d4,
    d2FitGap,
    d3,
    d5,
    shadow.ledger,
  );
  const d6Validation = validateCanonicalStrategyBridgeProjection(
    d6,
    d4,
    d2FitGap,
    d3,
    d5,
    shadow.ledger,
  );
  if (!d6Validation.valid) {
    throw new Error("D16 shadow D6 validation failed: " + d6Validation.errors.join(" | "));
  }

  const d15 = buildProfessionalMirror(shadow.ledger);
  const d15Validation = validateProfessionalMirror(d15, shadow.ledger);
  if (!d15Validation.valid) {
    throw new Error("D16 shadow D15 validation failed: " + d15Validation.errors.join(" | "));
  }

  const canonicalRequirementIds = shadow.ledger.requirements.map((item) => item.id).sort();
  const projectedRequirementIds = d6.requirements.map((item) => item.requirement_id).sort();
  if (JSON.stringify(canonicalRequirementIds) !== JSON.stringify(projectedRequirementIds)) {
    throw new Error("D16 shadow requirement identity drift detected between E1 and D6.");
  }

  const canonicalEvidenceIds = new Set(shadow.ledger.evidence.map((item) => item.id));
  const d6EvidenceIds = d6.requirements.flatMap((item) => item.evidence.map((evidence) => evidence.evidence_id));
  if (d6EvidenceIds.some((id) => !canonicalEvidenceIds.has(id))) {
    throw new Error("D16 shadow evidence provenance drift detected between E1 and D6.");
  }

  diagnostics.push(
    "D16 shadow runtime: E1 ledger validated.",
    "D16 shadow runtime: D2 projection validated.",
    "D16 shadow runtime: D3 route validated.",
    "D16 shadow runtime: D4 consumer projection validated.",
    "D16 shadow runtime: D5 consumer projection validated.",
    "D16 shadow runtime: D6 bridge projection validated.",
    "D16 shadow runtime: D15 Professional Mirror validated.",
    "D16 shadow runtime: canonical requirement identity preserved through D6.",
    "D16 shadow runtime: D6 evidence references remain canonical.",
  );

  return {
    ledger: shadow.ledger,
    d2,
    d3,
    d4,
    d5,
    d6,
    d15,
    diagnostics,
    extraction_diagnostics: shadow.extraction,
  };
}
