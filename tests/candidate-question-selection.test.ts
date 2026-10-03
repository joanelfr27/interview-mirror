import test from "node:test";
import assert from "node:assert/strict";
import {selectSharedCandidateQuestions,SHARED_CANDIDATE_QUESTION_BUDGET} from "@/lib/candidate-question-selection";
import type {EvidenceLedger} from "@/lib/canonical-evidence-model";
import type {D15BVerificationResult} from "@/lib/d15-semantic-thread-engine";

function ledger():EvidenceLedger {
 return {
  source_spans:[],evidence:[],
  requirements:[
   {id:"R-INV",source_span_id:"S1",normalized_requirement:"Investor relations and fundraising",category:"stakeholder",salience:"CORE",extraction_confidence:1,facets:[{id:"F-INV",type:"STAKEHOLDER",requirement:"relations avec les investisseurs et levées de fonds",source_span_id:"S1"}]},
   {id:"R-MA",source_span_id:"S2",normalized_requirement:"Asset Management, Project Finance, Private Equity or M&A",category:"experience",salience:"CORE",extraction_confidence:1,facets:[{id:"F-MA",type:"CONTEXT",requirement:"Asset Management, Project Finance, Private Equity ou M&A",source_span_id:"S2"}]},
   {id:"R-X",source_span_id:"S3",normalized_requirement:"General reporting",category:"finance",salience:"IMPORTANT",extraction_confidence:1,facets:[{id:"F-X",type:"FUNCTION",requirement:"reporting financier",source_span_id:"S3"}]},
  ],
  support_judgments:[],requirement_statuses:[],
  unresolved_items:[
   {id:"U-INV",requirement_id:"R-INV",facet_ids:["F-INV"],type:"ABSENT",supporting_evidence_ids:[],contradiction_evidence_ids:[],absence_basis:"UNMENTIONED",negation_evidence_ids:[]},
   {id:"U-MA",requirement_id:"R-MA",facet_ids:["F-MA"],type:"ABSENT",supporting_evidence_ids:[],contradiction_evidence_ids:[],absence_basis:"UNMENTIONED",negation_evidence_ids:[]},
   {id:"U-X",requirement_id:"R-X",facet_ids:["F-X"],type:"ABSENT",supporting_evidence_ids:[],contradiction_evidence_ids:[],absence_basis:"UNMENTIONED",negation_evidence_ids:[]},
  ],
  candidate_elicitations:[
   {id:"E-INV",unresolved_item_id:"U-INV",question:"Investor question"},
   {id:"E-MA",unresolved_item_id:"U-MA",question:"Investment-work question"},
   {id:"E-X",unresolved_item_id:"U-X",question:"Reporting question"},
  ],
  demonstration_objectives:[],
 };
}
const d15:D15BVerificationResult={accepted:[{id:"T1",headline:"You connect A and B.",evidence_ids:["A","B"],question_back:"D15 ownership question",maturity:"EMERGING_PATTERN",verification:"SUPPORTED"}],rejected:[],clarification_questions:[],cv_question_back:null,completion_state:"COMPLETED_WITH_THREADS"};

test("shared attention budget prioritizes critical requirement gaps over lower-value D15/reporting questions",()=>{
 const selected=selectSharedCandidateQuestions(ledger(),d15);
 assert.equal(selected.length,SHARED_CANDIDATE_QUESTION_BUDGET);
 assert.deepEqual(selected.slice(0,2).map(x=>x.id),["E-INV","E-MA"]);
 assert.ok(selected.every(x=>x.question.trim()));
 assert.ok(selected.every(x=>x.priority_basis.length>0));
});

test("EDF-style shared budget includes assessment context without exceeding three questions",()=>{
 const selected=selectSharedCandidateQuestions(ledger(),d15,SHARED_CANDIDATE_QUESTION_BUDGET,[],{jdPresent:true,language:"en"});
 assert.equal(selected.length,3);
 assert.deepEqual(selected.map(x=>x.id),["E-INV","E-MA","ASSESSMENT-CONTEXT"]);
 assert.equal(selected.filter(x=>x.origin==="ASSESSMENT_CONTEXT").length,1);
});

test("assessment context is absent when there is no JD",()=>{
 const selected=selectSharedCandidateQuestions(ledger(),d15,SHARED_CANDIDATE_QUESTION_BUDGET,[],{jdPresent:false,language:"en"});
 assert.equal(selected.some(x=>x.origin==="ASSESSMENT_CONTEXT"),false);
});
