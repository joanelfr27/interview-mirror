import {createHash} from "node:crypto";
import type {SessionRecord} from "@/types";
import type {EvidenceLedger} from "@/lib/canonical-evidence-model";
import type {SelectedCandidateQuestion} from "@/lib/candidate-question-selection";
import {classifyCandidateElicitation} from "@/lib/candidate-elicitation";
import {applyD15ClarificationAnswer} from "@/lib/d15-conversational-mirror";
import {judgeCanonicalSupport} from "@/lib/canonical-support-judge";
import {attachDemonstrationObjectives} from "@/lib/demonstration-objectives";
import {buildCanonicalReasoningProjection,validateCanonicalReasoningProjection} from "@/lib/canonical-reasoning-adapter";
import {buildFitGapProjection,validateFitGapProjection} from "@/lib/fit-gap-reasoning";
import {buildCanonicalEvidenceRoute,validateCanonicalEvidenceRoute} from "@/lib/canonical-evidence-router";
import {buildFitGapConsumerProjection,validateFitGapConsumerProjection} from "@/lib/fit-gap-consumer";
import {buildDemonstrationObjectiveConsumerProjection,validateDemonstrationObjectiveConsumerProjection} from "@/lib/demonstration-objective-consumer";
import {buildCanonicalStrategyBridgeProjection,validateCanonicalStrategyBridgeProjection} from "@/lib/canonical-strategy-bridge";
import {buildProfessionalMirror,validateProfessionalMirror} from "@/lib/professional-mirror";
import {buildD16DependencySnapshot,buildD16Strategy,validateD16Strategy,type D16Inputs} from "@/lib/d16-personalized-interview-strategy";
import type {RoleCapabilityModel} from "@/lib/role-capability-model";
import {validateRequirementGraph} from "@/lib/canonical-evidence-model";

export type OwnerLoopAnswerTrace={
 question_id:string;origin:SelectedCandidateQuestion["origin"];question:string;answer:string;
 canonicalized_atoms:Array<{id:string;source_quote:string;actor:string;actor_basis:string|null;ownership:string;action:string;object:string;source_type:string}>;
 gap_classification:string|null;gap_classification_rationale:string|null;d15_status:string|null;
};

export async function applyOwnerLoopAnswers(
 session:SessionRecord,
 initial:EvidenceLedger,
 selected:SelectedCandidateQuestion[],
 answers:Record<string,string>,
):Promise<{ledger:EvidenceLedger;traces:OwnerLoopAnswerTrace[]}> {
 let ledger=initial; const traces:OwnerLoopAnswerTrace[]=[];
 for(const question of selected){
  const answer=answers[question.id]?.trim();
  if(!answer) continue;
  const before=new Set(ledger.evidence.map(a=>a.id));
  let gap:string|null=null,rationale:string|null=null,d15Status:string|null=null;
  if(question.origin==="REQUIREMENT_GAP"){
   const elicitation=ledger.candidate_elicitations.find(e=>e.id===question.elicitation?.id);
   if(!elicitation) throw new Error("Selected requirement elicitation is no longer present: "+question.id);
   const result=await classifyCandidateElicitation(session,ledger,elicitation,answer);
   ledger=result.ledger; gap=result.elicitation.classification??null; rationale=result.elicitation.classification_rationale??null;
  } else {
   if(!question.d15_target) throw new Error("Selected D15 question lacks its frozen clarification target: "+question.id);
   const result=await applyD15ClarificationAnswer(ledger,{id:"OWNER-"+question.id,answer,target:question.d15_target});
   ledger=result.ledger; d15Status=result.status;
  }
  const newAtoms=ledger.evidence.filter(a=>!before.has(a.id)).map(a=>{
   const span=ledger.source_spans.find(s=>s.id===a.source_span_id);
   return {id:a.id,source_quote:span?.text??"",actor:a.subject.actor,actor_basis:a.subject.actor_basis??null,ownership:a.subject.ownership,action:a.action.normalized_action,object:a.action.object,source_type:a.provenance.source_type};
  });
  traces.push({question_id:question.id,origin:question.origin,question:question.question,answer,canonicalized_atoms:newAtoms,gap_classification:gap,gap_classification_rationale:rationale,d15_status:d15Status});
 }
 // D15 relationship answers are canonical evidence too. Re-run the support judge once
 // after all answers so D16 sees the same final evidence population.
 const judged=await judgeCanonicalSupport(session,ledger);
 ledger=attachDemonstrationObjectives(judged.ledger).ledger;
 const graph=validateRequirementGraph(ledger);
 if(graph.length) throw new Error("Owner-loop elicited graph invalid: "+graph.join(" | "));
 return {ledger,traces};
}

function roleModel(ledger:EvidenceLedger,roleTitle:string):RoleCapabilityModel {
 return {
  version:"rcm-v1",model_id:"owner-loop-shadow",role_family:"shadow-runtime",role_title:roleTitle||"Runtime Shadow Role",
  requirements:ledger.requirements.map((r,index)=>({
   capability_id:"OWNER-LOOP-CAP-"+String(index+1),normalized_requirement:r.normalized_requirement,
   baseline_criticality:r.salience==="CORE"?"CRITICAL":r.salience==="IMPORTANT"?"IMPORTANT":"SUPPORTING",
   source:{source_type:"ADMIN_CURATED",source_id:"owner-loop-shadow",source_version:"1"},
   canonical_requirement_id:r.id,
  })),
 };
}

export function buildOwnerLoopD16(session:SessionRecord,ledger:EvidenceLedger){
 const d2=buildCanonicalReasoningProjection(ledger);const v2=validateCanonicalReasoningProjection(d2);if(!v2.valid)throw new Error("D2 invalid: "+v2.errors.join(" | "));
 const fit=buildFitGapProjection(d2);const vf=validateFitGapProjection(fit);if(!vf.valid)throw new Error("FitGap invalid: "+vf.errors.join(" | "));
 const d3=buildCanonicalEvidenceRoute(ledger);const v3=validateCanonicalEvidenceRoute(d3,ledger);if(!v3.valid)throw new Error("D3 invalid: "+v3.errors.join(" | "));
 const d4=buildFitGapConsumerProjection(fit,d3,ledger);const v4=validateFitGapConsumerProjection(d4,fit,d3,ledger);if(!v4.valid)throw new Error("D4 invalid: "+v4.errors.join(" | "));
 const d5=buildDemonstrationObjectiveConsumerProjection(d4,fit,d3,ledger);const v5=validateDemonstrationObjectiveConsumerProjection(d5,d4,fit,d3,ledger);if(!v5.valid)throw new Error("D5 invalid: "+v5.errors.join(" | "));
 const d6=buildCanonicalStrategyBridgeProjection(d4,fit,d3,d5,ledger);const v6=validateCanonicalStrategyBridgeProjection(d6,d4,fit,d3,d5,ledger);if(!v6.valid)throw new Error("D6 invalid: "+v6.errors.join(" | "));
 const mirror=buildProfessionalMirror(ledger);const vm=validateProfessionalMirror(mirror,ledger);if(!vm.valid)throw new Error("Mirror invalid: "+vm.errors.join(" | "));
 const canonical_requirements=ledger.requirements.map(r=>({id:r.id,normalized_requirement:r.normalized_requirement}));
 const inputBase:Omit<D16Inputs,"dependency_snapshot">={mirror,bridge:d6,role_capability_model:roleModel(ledger,session.title),ledger,canonical_requirements,jd_present:Boolean(session.job_description.trim()),jd_fingerprint:"sha256:"+createHash("sha256").update(session.job_description,"utf8").digest("hex")};
 const input:D16Inputs={...inputBase,dependency_snapshot:buildD16DependencySnapshot(inputBase)};
 const strategy=buildD16Strategy(input);const validation=validateD16Strategy(strategy,input);if(!validation.valid)throw new Error("D16 invalid: "+validation.errors.join(" | "));
 return {d2,d3,d4,d5,d6,mirror,strategy};
}
