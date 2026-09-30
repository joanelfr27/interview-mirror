import test from "node:test";
import assert from "node:assert/strict";
import type { AtomicEvidence, EvidenceLedger } from "@/lib/canonical-evidence-model";
import { buildD15BSemanticInput, verifyD15BSemanticThreadProposals } from "@/lib/d15-semantic-thread-engine";

const span=(id:string,text:string)=>({id,document_id:"CV",text,start_offset:0,end_offset:text.length,language:"en"});
const atom=(id:string,spanId:string,action:string,object:string,ownership:AtomicEvidence["subject"]["ownership"]="UNKNOWN"):AtomicEvidence=>({
  id,source_span_id:spanId,provenance:{source_type:"CV",language:"en",extraction_method:"LLM"},
  subject:{actor:"candidate",ownership},action:{normalized_action:action,object},context:{},scale:{},time:{},outcome:null,
  assertion:{type:"RESPONSIBILITY",polarity:"AFFIRMATIVE"},
  verifiability:{has_quantifiable_metric:false,has_third_party_entity:false,has_time_anchor:false},extraction_confidence:1,
});
const ledger=(evidence:AtomicEvidence[],source_spans:ReturnType<typeof span>[]):EvidenceLedger=>({
  evidence,source_spans,requirements:[],support_judgments:[],requirement_statuses:[],unresolved_items:[],candidate_elicitations:[],demonstration_objectives:[]
});

test("D15-B semantic input exposes whole canonical evidence and no raw CV/JD",()=>{
  const s1=span("S1","Supported the rollout of a new customer portal.");
  const l=ledger([atom("A1","S1","Supported","the rollout of a new customer portal")],[s1]);
  assert.deepEqual(buildD15BSemanticInput(l).atoms[0]?.source_quote,s1.text);
  assert.equal("cv_text" in buildD15BSemanticInput(l),false);
});

test("D15-B accepts a grounded two-atom semantic thread and caps maturity at Emerging",()=>{
  const s1=span("S1","Supported the rollout of a new customer portal.");
  const s2=span("S2","Collected user feedback during the portal rollout.");
  const l=ledger([
    atom("A1","S1","Supported","the rollout of a new customer portal"),
    atom("A2","S2","Collected","user feedback during the portal rollout"),
  ],[s1,s2]);
  const result=verifyD15BSemanticThreadProposals(l,[{
    id:"P1",headline:"Customer portal rollout and user feedback",evidence_ids:["A1","A2"],question_back:null,
  }]);
  assert.equal(result.rejected.length,0);
  assert.equal(result.accepted[0]?.maturity,"EMERGING_PATTERN");
});

test("D15-B rejects unknown evidence and one-span pseudo threads",()=>{
  const s1=span("S1","Supported a portal rollout.");
  const l=ledger([atom("A1","S1","Supported","a portal rollout")],[s1]);
  const result=verifyD15BSemanticThreadProposals(l,[
    {id:"P1",headline:"Portal work",evidence_ids:["A1","MISSING"],question_back:null},
  ]);
  assert.equal(result.accepted.length,0);
  assert.ok(result.rejected[0]?.reasons.some((x)=>x.includes("unknown")));
});

test("D15-B rejects unsupported ownership escalation",()=>{
  const s1=span("S1","Supported acquisition accounting and financial integration activities.");
  const s2=span("S2","Supported systems integration following business changes.");
  const l=ledger([
    atom("A1","S1","Supported","acquisition accounting and financial integration activities","UNKNOWN"),
    atom("A2","S2","Supported","systems integration following business changes","UNKNOWN"),
  ],[s1,s2]);
  const result=verifyD15BSemanticThreadProposals(l,[{
    id:"P1",headline:"Led financial and systems integration",evidence_ids:["A1","A2"],question_back:"What did you personally own?",
  }]);
  assert.equal(result.accepted.length,0);
  assert.ok(result.rejected[0]?.reasons.some((x)=>x.includes("ownership")));
});

test("D15-B rejects unsupported outcomes, numbers and timing",()=>{
  const s1=span("S1","Supported a portal rollout.");
  const s2=span("S2","Collected user feedback.");
  const l=ledger([atom("A1","S1","Supported","a portal rollout"),atom("A2","S2","Collected","user feedback")],[s1,s2]);
  const result=verifyD15BSemanticThreadProposals(l,[{
    id:"P1",headline:"Improved portal adoption by 30% in 2025",evidence_ids:["A1","A2"],question_back:null,
  }]);
  assert.equal(result.accepted.length,0);
  assert.ok(result.rejected[0]?.reasons.some((x)=>x.includes("outcome")));
  assert.ok(result.rejected[0]?.reasons.some((x)=>x.includes("number")));
  assert.ok(result.rejected[0]?.reasons.some((x)=>x.includes("timing")));
});

test("D15-B question-back must remain a question",()=>{
  const s1=span("S1","Supported a portal rollout.");
  const s2=span("S2","Collected user feedback.");
  const l=ledger([atom("A1","S1","Supported","a portal rollout"),atom("A2","S2","Collected","user feedback")],[s1,s2]);
  const result=verifyD15BSemanticThreadProposals(l,[{
    id:"P1",headline:"Portal rollout and user feedback",evidence_ids:["A1","A2"],question_back:"You owned the rollout",
  }]);
  assert.equal(result.accepted.length,0);
  assert.ok(result.rejected[0]?.reasons.some((x)=>x.includes("question")));
});
