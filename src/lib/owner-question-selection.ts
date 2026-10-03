import type {CandidateElicitation,EvidenceLedger} from "@/lib/canonical-evidence-model";
import type {D15BVerificationResult} from "@/lib/d15-semantic-thread-engine";
import type {StrategicTension} from "@/lib/d16-personalized-interview-strategy";

export const SHARED_QUESTION_BUDGET=3;
export type SelectedOwnerQuestion={
 id:string; origin:"D15_RELATIONSHIP"|"REQUIREMENT_GAP"; question:string;
 priority:number; priority_basis:string[]; unresolved_item_id?:string; proposal_id?:string;
};

const salienceScore=(s:string|undefined)=>s==="CRITICAL"?40:s==="HIGH"?30:s==="MEDIUM"?20:10;
const relevanceScore=(s:string|undefined)=>s==="HIGH"?30:s==="MEDIUM"?20:s==="LOW"?5:10;

export function selectOwnerQuestions(input:{
 ledger:EvidenceLedger;
 d15:D15BVerificationResult;
 requirement_elicitations:CandidateElicitation[];
 tensions?:StrategicTension[];
 budget?:number;
}):SelectedOwnerQuestion[]{
 const budget=Math.max(0,Math.min(SHARED_QUESTION_BUDGET,input.budget??SHARED_QUESTION_BUDGET));
 const tensionByRequirement=new Map((input.tensions??[]).map(t=>[t.requirement_id,t]));
 const requirementCandidates=input.requirement_elicitations.map(e=>{
  const unresolved=input.ledger.unresolved_items.find(u=>u.id===e.unresolved_item_id);
  const requirement=input.ledger.requirements.find(r=>r.id===unresolved?.requirement_id);
  const tension=requirement?tensionByRequirement.get(requirement.id):undefined;
  const basis=[
   `role_salience=${requirement?.salience??"UNKNOWN"}`,
   `assessment_relevance=${tension?.assessment_relevance??"UNKNOWN"}`,
   `d16_preparation_priority=${tension?.preparation_priority??"NONE"}`,
   `unresolved_type=${unresolved?.type??"UNKNOWN"}`,
  ];
  const priority=100+salienceScore(requirement?.salience)+relevanceScore(tension?.assessment_relevance)+
   Math.min(30,Math.max(0,tension?.preparation_priority??0))+(unresolved?.type==="CONFLICTING"?10:unresolved?.type==="AMBIGUOUS"?5:0);
  return {id:e.id,origin:"REQUIREMENT_GAP" as const,question:e.question,priority,priority_basis:basis,unresolved_item_id:e.unresolved_item_id};
 });
 const d15Candidates=(input.d15.clarification_questions??[]).map(q=>({
  id:"D15-"+q.proposal_id,origin:"D15_RELATIONSHIP" as const,question:q.question,
  priority:50+(q.gs_decision.S.supported?20:0)+(q.gs_decision.G.supported?0:10),
  priority_basis:[`semantic_significance=${q.gs_decision.S.supported}`,`relationship_unlicensed=${!q.gs_decision.G.supported}`],
  proposal_id:q.proposal_id,
 }));
 return [...requirementCandidates,...d15Candidates]
  .sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))
  .slice(0,budget);
}
