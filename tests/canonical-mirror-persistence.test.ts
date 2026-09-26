import test from "node:test";
import assert from "node:assert/strict";
import { validateCanonicalMirrorSnapshot } from "@/lib/canonical-mirror-persistence";

test("D9 accepts an append-only canonical snapshot",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"s1",schema_version:"d9-v1",source_update_ids:["u1","u2"],mirror_payload:{requirements:[]}});assert.equal(v.valid,true);});
test("D9 rejects duplicate source updates",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"s1",schema_version:"d9-v1",source_update_ids:["u1","u1"],mirror_payload:{}});assert.equal(v.valid,false);});
test("D9 rejects missing identity",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"",schema_version:"",source_update_ids:[],mirror_payload:{}});assert.equal(v.valid,false);});

import { buildProfessionalMirror, validateProfessionalMirror } from "@/lib/professional-mirror";
import type { AtomicEvidence, EvidenceLedger } from "@/lib/canonical-evidence-model";

test("D9 accepts an append-only canonical snapshot",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"s1",schema_version:"d9-v1",source_update_ids:["u1","u2"],mirror_payload:{requirements:[]}});assert.equal(v.valid,true);});
test("D9 rejects duplicate source updates",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"s1",schema_version:"d9-v1",source_update_ids:["u1","u1"],mirror_payload:{}});assert.equal(v.valid,false);});
test("D9 rejects missing identity",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"",schema_version:"",source_update_ids:[],mirror_payload:{}});assert.equal(v.valid,false);});

const d15Span=(id:string,text:string,document_id="CV")=>({id,document_id,text,start_offset:0,end_offset:text.length,language:"en"});
type D15TestAtom = AtomicEvidence;
function makeD15Atom(id:string,spanId:string,object:string,polarity:"AFFIRMATIVE"|"NEGATED"="AFFIRMATIVE"): AtomicEvidence { return {
  id,source_span_id:spanId,provenance:{source_type:"CV" as const,language:"en",extraction_method:"LLM" as const},
  subject:{actor:"candidate",ownership:"INDIVIDUAL" as const},
  action:{normalized_action:"managed",object},
  context:{},
  scale:{},time:{},outcome:null,
  assertion:{type:"RESPONSIBILITY" as const,polarity},
  verifiability:{has_quantifiable_metric:false,has_third_party_entity:false,has_time_anchor:false},
  extraction_confidence:1,
  };
}
const d15Atom=(id:string,spanId:string,object:string,polarity:"AFFIRMATIVE"|"NEGATED"="AFFIRMATIVE"): D15TestAtom => makeD15Atom(id,spanId,object,polarity);
const d15Ledger=(evidence:D15TestAtom[],spans:ReturnType<typeof d15Span>[]):EvidenceLedger=>({
  source_spans:spans,evidence,requirements:[],support_judgments:[],requirement_statuses:[],unresolved_items:[],candidate_elicitations:[],demonstration_objectives:[]
});

test("D15 builds an evidence-grounded Mirror",()=>{
  const s1=d15Span("S1","Managed regional finance.");
  const s2=d15Span("S2","Managed regional finance reporting.");
  const l=d15Ledger([d15Atom("A1","S1","regional finance"),d15Atom("A2","S2","regional finance")],[s1,s2]);
  const m=buildProfessionalMirror(l);
  assert.equal(m.version,"d15-v1");
  assert.ok(m.threads.length>=1);
  assert.ok(m.statements.some(x=>x.kind==="PATTERN"));
  assert.equal(validateProfessionalMirror(m,l).valid,true);
});

test("D15 excludes negated evidence",()=>{
  const s1=d15Span("S1","Did not manage regional finance.");
  const l=d15Ledger([d15Atom("A1","S1","regional finance","NEGATED")],[s1]);
  const m=buildProfessionalMirror(l);
  assert.equal(m.evidence.length,0);
  assert.equal(m.threads.length,0);
});

test("D15 collapses identical duplicate imports so they cannot inflate a thread",()=>{
  const text="Managed regional finance.";
  const s1=d15Span("S1",text,"CV");
  const s2=d15Span("S2",text,"LINKEDIN");
  const l=d15Ledger([d15Atom("A1","S1","regional finance"),d15Atom("A2","S2","regional finance")],[s1,s2]);
  const m=buildProfessionalMirror(l);
  assert.equal(m.evidence.length,1);
  assert.equal(m.threads.length,0);
});

test("D15 uses supported evidence connections rather than exact labels only",()=>{
  const s1=d15Span("S1","Managed regional finance.");
  const s2=d15Span("S2","Managed regional tax.");
  const a1=d15Atom("A1","S1","finance");
  const a2=d15Atom("A2","S2","tax");
  a1.context.domain="finance";
  a2.context.domain="finance";
  const l=d15Ledger([a1,a2],[s1,s2]);
  const m=buildProfessionalMirror(l);
  assert.equal(m.threads.length,1);
  assert.equal(m.threads[0].connection_reason,"SHARED_DOMAIN");
});

test("D15 preserves distinct claims that share a domain and action",()=>{
  const s1=d15Span("S1","Managed regional finance.");
  const s2=d15Span("S2","Managed regional tax.");
  const a1=d15Atom("A1","S1","finance");
  const a2=d15Atom("A2","S2","tax");
  a1.context.domain="finance";
  a2.context.domain="finance";
  const l=d15Ledger([a1,a2],[s1,s2]);
  const m=buildProfessionalMirror(l);
  assert.equal(m.evidence.length,2);
  assert.equal(m.threads.length,1);
  assert.equal(m.threads[0].connection_reason,"SHARED_DOMAIN");
});

test("D15 rejects a Story opening that is not traceable",()=>{
  const s1=d15Span("S1","Managed regional finance.");
  const s2=d15Span("S2","Managed regional finance reporting.");
  const l=d15Ledger([d15Atom("A1","S1","regional finance"),d15Atom("A2","S2","regional finance")],[s1,s2]);
  const m=buildProfessionalMirror(l);
  m.story.opening="Unsupported story claim.";
  assert.equal(validateProfessionalMirror(m,l).valid,false);
});

test("D15 rejects a Story statement attached to the wrong thread",()=>{
  const s1=d15Span("S1","Managed finance.");
  const s2=d15Span("S2","Managed finance reporting.");
  const s3=d15Span("S3","Managed audit.");
  const a1=d15Atom("A1","S1","finance");
  const a2=d15Atom("A2","S2","finance");
  const a3=d15Atom("A3","S3","audit");
  const l=d15Ledger([a1,a2,a3],[s1,s2,s3]);
  const m=buildProfessionalMirror(l);
  assert.ok(m.threads.length>=1);
  const first=m.story.threads[0];
  const unrelated=m.statements.find((s)=>s.id==="FACT-A3");
  assert.ok(unrelated);
  first.statement_ids.push(unrelated.id);
  assert.equal(validateProfessionalMirror(m,l).valid,false);
});


test("D15 does not create a thread from repeated action alone across unrelated domains",()=>{
  const s1=d15Span("S1","Managed finance.");
  const s2=d15Span("S2","Managed recruitment.");
  const a1=d15Atom("A1","S1","finance");
  const a2=d15Atom("A2","S2","recruitment");
  a1.context.domain="finance";
  a2.context.domain="human resources";
  const l=d15Ledger([a1,a2],[s1,s2]);
  const m=buildProfessionalMirror(l);
  assert.equal(m.threads.length,0);
});


test("D15 fails closed when affirmative evidence is contradicted",()=>{
  const s1=d15Span("S1","I managed regional finance.");
  const s2=d15Span("S2","I did not manage regional finance.");
  const a1=d15Atom("A1","S1","regional finance","AFFIRMATIVE");
  const a2=d15Atom("A2","S2","regional finance","NEGATED");
  const l=d15Ledger([a1,a2],[s1,s2]);
  const m=buildProfessionalMirror(l);
  assert.equal(m.evidence.length,0);
  assert.equal(m.threads.length,0);
});

test("D15 does not connect individual and team ownership",()=>{
  const s1=d15Span("S1","I managed finance.");
  const s2=d15Span("S2","Our team managed finance.");
  const a1=d15Atom("A1","S1","finance");
  const a2=d15Atom("A2","S2","finance");
  a2.subject.ownership="TEAM";
  a1.context.domain="finance"; a2.context.domain="finance";
  const l=d15Ledger([a1,a2],[s1,s2]);
  const m=buildProfessionalMirror(l);
  assert.equal(m.threads.length,0);
});

test("D15 ignores generic single-token overlap",()=>{
  const s1=d15Span("S1","Coordinated the sales team's quarterly offsite.");
  const s2=d15Span("S2","Rebuilt the data team's ingestion pipeline.");
  const a1=d15Atom("A1","S1","sales team offsite");
  const a2=d15Atom("A2","S2","data team ingestion");
  const l=d15Ledger([a1,a2],[s1,s2]);
  const m=buildProfessionalMirror(l);
  assert.equal(m.threads.length,0);
});

test("D15 collapses a conservative paraphrase duplicate",()=>{
  const s1=d15Span("S1","Led a team of 5 engineers.","CV");
  const s2=d15Span("S2","Managed a five-person engineering group.","LINKEDIN");
  const a1=d15Atom("A1","S1","team of 5 engineers");
  const a2=d15Atom("A2","S2","five-person engineering group");
  a1.action.normalized_action="Led";
  a2.action.normalized_action="Managed";
  const l=d15Ledger([a1,a2],[s1,s2]);
  const m=buildProfessionalMirror(l);
  assert.equal(m.evidence.length,1);
  assert.equal(m.threads.length,0);
});

test("D15 validator rejects forged maturity",()=>{
  const s1=d15Span("S1","Managed regional finance.");
  const l=d15Ledger([d15Atom("A1","S1","regional finance")],[s1]);
  const m=buildProfessionalMirror(l);
  const fact=m.statements.find((x)=>x.kind==="FACT");
  assert.ok(fact);
  fact.maturity="SUSTAINED_STRENGTH";
  const v=validateProfessionalMirror(m,l);
  assert.equal(v.valid,false);
  assert.ok(v.errors.some((e)=>e.includes("maturity")));
});
