import type {CandidateElicitation,EvidenceLedger,RequirementSalience} from "@/lib/canonical-evidence-model";
import type {D15BVerificationResult} from "@/lib/d15-semantic-thread-engine";
import type {D15ClarificationTarget} from "@/lib/d15-conversational-mirror";
import type {StrategicTension} from "@/lib/d16-personalized-interview-strategy";

export const SHARED_CANDIDATE_QUESTION_BUDGET = 3;

export type CandidateQuestionOrigin = "REQUIREMENT_GAP" | "D15_RELATIONSHIP" | "ASSESSMENT_CONTEXT";
export type SelectedCandidateQuestion = {
  id:string;
  origin:CandidateQuestionOrigin;
  question:string;
  priority:number;
  priority_basis:string[];
  elicitation?:CandidateElicitation;
  d15_target?:D15ClarificationTarget;
};

const SALIENCE:Record<RequirementSalience,number>={CORE:50,IMPORTANT:35,SUPPORTING:20,CONTEXTUAL:10};
const highStake=/(?:investor|investisseur|fundrais|levée|lender|prêteur|shareholder|actionnaire|asset management|gestion d['’]actifs|project finance|private equity|\bM&A\b|fusion|acquisition|valuation|valorisation|\bIRR\b|\bTRI\b|\bNPV\b|\bVAN\b)/iu;
const stakeholder=/(?:investor|investisseur|lender|prêteur|shareholder|actionnaire|board|conseil|committee|comité)/iu;

export function rankRequirementElicitations(ledger:EvidenceLedger, elicitations:CandidateElicitation[], tensions:StrategicTension[]=[]):SelectedCandidateQuestion[] {
 const tensionByRequirement=new Map(tensions.map(t=>[t.requirement_id,t]));
 return elicitations.map(elicitation=>{
  const item=ledger.unresolved_items.find(x=>x.id===elicitation.unresolved_item_id);
  const requirement=ledger.requirements.find(x=>x.id===item?.requirement_id);
  const facets=requirement?.facets.filter(f=>item?.facet_ids.includes(f.id))??[];
  const text=[requirement?.normalized_requirement,...facets.map(f=>f.requirement)].filter(Boolean).join(" ");
  let priority=requirement?SALIENCE[requirement.salience]:0;
  const tension=requirement?tensionByRequirement.get(requirement.id):undefined;
  const basis=[`salience=${requirement?.salience??"UNKNOWN"}`];
  if(tension){
   priority+=Math.min(40,Math.max(0,tension.preparation_priority));
   basis.push(`d16_preparation_priority=${tension.preparation_priority}`);
   if(tension.assessment_relevance==="HIGH"){priority+=20;basis.push("assessment_relevance=HIGH");}
   else basis.push(`assessment_relevance=${tension.assessment_relevance}`);
   basis.push(`role_criticality=${tension.role_criticality}`);
  }
  if(highStake.test(text)){priority+=35;basis.push("high-stakes role gap");}
  if(stakeholder.test(text)||facets.some(f=>["STAKEHOLDER","GOVERNANCE","OWNERSHIP"].includes(f.type))){priority+=15;basis.push("stakeholder/governance relevance");}
  if(item?.type==="ABSENT"){priority+=8;basis.push("unresolved absence");}
  if((item?.supporting_evidence_ids.length??0)>0){priority+=5;basis.push("existing partial/adjacent evidence can be clarified");}
  return {id:elicitation.id,origin:"REQUIREMENT_GAP" as const,question:elicitation.question,priority,priority_basis:basis,elicitation};
 }).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
}

export function d15RelationshipQuestions(result:D15BVerificationResult):SelectedCandidateQuestion[] {
 const questions:SelectedCandidateQuestion[]=[];
 for(const target of result.clarification_questions??[]){
  questions.push({id:"D15-"+target.proposal_id,origin:"D15_RELATIONSHIP",question:target.question,priority:38,priority_basis:["significant relationship unresolved by CV","candidate answer can license or deny exact stored proposition"],d15_target:target});
 }
 for(const thread of result.accepted){
  if(!thread.question_back?.trim()) continue;
  const target=thread.gs_decision ? {proposal_id:thread.id,question:thread.question_back,evidence_ids:thread.evidence_ids,gs_decision:thread.gs_decision} : undefined;
  questions.push({id:"D15-ACCEPTED-"+thread.id,origin:"D15_RELATIONSHIP",question:thread.question_back,priority:28,priority_basis:["accepted CV relationship has a bounded ownership/outcome clarification"],...(target?{d15_target:target}:{})});
 }
 if(result.cv_question_back?.trim()) questions.push({id:"D15-CV-QUESTION",origin:"D15_RELATIONSHIP",question:result.cv_question_back,priority:20,priority_basis:["no qualifying CV relationship; open discovery question"]});
 return questions;
}

export function assessmentContextQuestion(jdPresent:boolean, language:"en"|"fr"):SelectedCandidateQuestion[] {
 if(!jdPresent) return [];
 return [{
  id:"ASSESSMENT-CONTEXT",origin:"ASSESSMENT_CONTEXT",
  question:language==="fr"
   ?"Que savez-vous réellement du format de l’entretien : interlocuteurs, nombre d’étapes, étude de cas ou test technique, et langue ? Si rien ne vous a été communiqué, dites simplement « rien communiqué »."
   :"What do you actually know about the interview format: interviewers, number of rounds, case study or technical test, and language? If nothing has been communicated, simply say “nothing communicated”.",
  priority:90,
  priority_basis:["JD present","assessment context can change preparation priorities","low-friction standard question"],
 }];
}

export function selectSharedCandidateQuestions(
 ledger:EvidenceLedger,
 d15:D15BVerificationResult,
 budget=SHARED_CANDIDATE_QUESTION_BUDGET,
 tensions:StrategicTension[]=[],
 options:{jdPresent?:boolean;language?:"en"|"fr"}={},
):SelectedCandidateQuestion[] {
 if(!Number.isInteger(budget)||budget<1) throw new Error("Candidate question budget must be a positive integer.");
 const candidates=[...rankRequirementElicitations(ledger,ledger.candidate_elicitations,tensions),...assessmentContextQuestion(Boolean(options.jdPresent),options.language??"en"),...d15RelationshipQuestions(d15)];
 const deduped=candidates.filter((item,index,all)=>all.findIndex(x=>x.question.trim()===item.question.trim())===index);
 return deduped.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).slice(0,budget);
}
