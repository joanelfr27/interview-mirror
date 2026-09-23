import type { EvidenceLedger, AtomicEvidence, SourceSpan } from "@/lib/canonical-evidence-model";
import { validateRequirementGraph, validateAtomicEvidenceAgainstSource } from "@/lib/canonical-evidence-model";
import { type CanonicalProbeRoutingProjection, validateCanonicalProbeRoutingProjection } from "@/lib/canonical-probe-router";
import { type CanonicalStrategyBridgeProjection, validateCanonicalStrategyBridgeProjection } from "@/lib/canonical-strategy-bridge";
import { type FitGapConsumerProjection, validateFitGapConsumerProjection } from "@/lib/fit-gap-consumer";
import { type FitGapProjection, validateFitGapProjection } from "@/lib/fit-gap-reasoning";
import { type CanonicalEvidenceRoute, validateCanonicalEvidenceRoute } from "@/lib/canonical-evidence-router";
import { type DemonstrationObjectiveConsumerProjection, validateDemonstrationObjectiveConsumerProjection } from "@/lib/demonstration-objective-consumer";

export type CanonicalFeedbackObservation = {
  observation_id: string;
  requirement_id: string;
  source_span: SourceSpan;
  evidence: AtomicEvidence;
  claim_boundary: "DOCUMENTED" | "CANDIDATE_STATED";
};

export type CanonicalFeedbackMirrorUpdate = {
  version: "d8-v1";
  observations: CanonicalFeedbackObservation[];
};

export function buildCanonicalFeedbackMirrorUpdate(
  probeRouting: CanonicalProbeRoutingProjection,
  bridge: CanonicalStrategyBridgeProjection,
  fitGapConsumer: FitGapConsumerProjection,
  fitGapReasoning: FitGapProjection,
  route: CanonicalEvidenceRoute,
  objectives: DemonstrationObjectiveConsumerProjection,
  ledger: EvidenceLedger,
  observations: CanonicalFeedbackObservation[],
): CanonicalFeedbackMirrorUpdate {
  const input = validateCanonicalFeedbackMirrorInputs(probeRouting, bridge, fitGapConsumer, fitGapReasoning, route, objectives, ledger);
  if (!input.valid) throw new Error("D8 canonical inputs are invalid: " + input.errors.join(" | "));
  const result: CanonicalFeedbackMirrorUpdate = {
    version: "d8-v1",
    observations: [...observations].sort((a,b)=>a.observation_id.localeCompare(b.observation_id)),
  };
  const validation = validateCanonicalFeedbackMirrorUpdate(result, probeRouting, bridge, fitGapConsumer, fitGapReasoning, route, objectives, ledger);
  if (!validation.valid) throw new Error("D8 feedback mirror update is invalid: " + validation.errors.join(" | "));
  return result;
}

export function validateCanonicalFeedbackMirrorInputs(
  probeRouting: CanonicalProbeRoutingProjection,
  bridge: CanonicalStrategyBridgeProjection,
  fitGapConsumer: FitGapConsumerProjection,
  fitGapReasoning: FitGapProjection,
  route: CanonicalEvidenceRoute,
  objectives: DemonstrationObjectiveConsumerProjection,
  ledger: EvidenceLedger,
): {valid:boolean;errors:string[]} {
  const errors:string[]=[];
  const graph=validateRequirementGraph(ledger); if(graph.length) errors.push(...graph.map(e=>"E1: "+e));
  const d2=validateFitGapProjection(fitGapReasoning); if(!d2.valid) errors.push(...d2.errors.map(e=>"D2: "+e));
  const d3=validateCanonicalEvidenceRoute(route,ledger); if(!d3.valid) errors.push(...d3.errors.map(e=>"D3: "+e));
  const d4=validateFitGapConsumerProjection(fitGapConsumer,fitGapReasoning,route,ledger); if(!d4.valid) errors.push(...d4.errors.map(e=>"D4: "+e));
  const d5=validateDemonstrationObjectiveConsumerProjection(objectives,fitGapConsumer,fitGapReasoning,route,ledger); if(!d5.valid) errors.push(...d5.errors.map(e=>"D5: "+e));
  const d6=validateCanonicalStrategyBridgeProjection(bridge,fitGapConsumer,fitGapReasoning,route,objectives,ledger); if(!d6.valid) errors.push(...d6.errors.map(e=>"D6: "+e));
  const d7=validateCanonicalProbeRoutingProjection(probeRouting,bridge,fitGapConsumer,fitGapReasoning,route,objectives,ledger); if(!d7.valid) errors.push(...d7.errors.map(e=>"D7: "+e));
  return {valid:errors.length===0,errors};
}

export function validateCanonicalFeedbackMirrorUpdate(
  update: CanonicalFeedbackMirrorUpdate,
  probeRouting: CanonicalProbeRoutingProjection,
  bridge: CanonicalStrategyBridgeProjection,
  fitGapConsumer: FitGapConsumerProjection,
  fitGapReasoning: FitGapProjection,
  route: CanonicalEvidenceRoute,
  objectives: DemonstrationObjectiveConsumerProjection,
  ledger: EvidenceLedger,
): {valid:boolean;errors:string[]} {
  const errors:string[]=[];
  errors.push(...validateCanonicalFeedbackMirrorInputs(probeRouting,bridge,fitGapConsumer,fitGapReasoning,route,objectives,ledger).errors);
  if(update.version!=="d8-v1") errors.push("D8 version must be d8-v1.");
  const routeIds=new Set(probeRouting.routes.map(r=>r.requirement_id));
  const seen=new Set<string>();
  for(const item of update.observations){
    if(seen.has(item.observation_id)) errors.push("D8 duplicate observation: "+item.observation_id);
    seen.add(item.observation_id);
    if(!routeIds.has(item.requirement_id)) errors.push("D8 observation targets unrouted requirement: "+item.requirement_id);
    if(item.source_span.document_id!=="INTERVIEW") errors.push("D8 feedback source span must be an INTERVIEW span: "+item.observation_id);
    if(item.evidence.source_span_id!==item.source_span.id) errors.push("D8 evidence/source span mismatch: "+item.observation_id);
    errors.push(...validateAtomicEvidenceAgainstSource(item.evidence,item.source_span).map(e=>"D8 evidence grounding: "+e+" ["+item.observation_id+"]"));
    if(item.evidence.assertion.polarity!=="AFFIRMATIVE") errors.push("D8 update cannot silently add negated evidence: "+item.observation_id);
    if(item.claim_boundary==="CANDIDATE_STATED" && item.evidence.provenance.source_type!=="CANDIDATE_ELICITED") errors.push("D8 candidate-stated observation must use candidate-elicited provenance: "+item.observation_id);
    if(item.claim_boundary==="DOCUMENTED" && item.evidence.provenance.source_type==="CANDIDATE_ELICITED") errors.push("D8 documented observation cannot use candidate-elicited provenance: "+item.observation_id);
    const route=requirementRoute(routeIds,item.requirement_id,probeRouting);
    if(route && !route.permitted_claims.length && item.claim_boundary==="CANDIDATE_STATED") errors.push("D8 candidate-stated observation requires an explicit claim boundary: "+item.observation_id);
  }
  return {valid:errors.length===0,errors};
}

function requirementRoute(ids:Set<string>,id:string,p:CanonicalProbeRoutingProjection){
  if(!ids.has(id)) return undefined;
  return p.routes.find(r=>r.requirement_id===id);
}
