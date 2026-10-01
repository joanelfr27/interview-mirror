import OpenAI from "openai";
import type { AtomicEvidence, EvidenceLedger, SourceSpan } from "@/lib/canonical-evidence-model";
import { buildD15BGoldLedger, d15BGoldFixtures } from "@/lib/d15-gold-gate";
import { buildD15BSemanticInput } from "@/lib/d15-semantic-thread-engine";
import { assertModelRequestCapabilities } from "@/lib/model-capabilities";

const MODELS = ["gpt-5.6-luna","gpt-5.4-mini","gpt-5.6-terra"] as const;
const model = process.env.D15_JUDGE_MODEL;
if (!model || !MODELS.includes(model as typeof MODELS[number])) throw new Error("D15_JUDGE_MODEL must be one of the preregistered candidates");
const apiKey=process.env.OPENAI_API_KEY;
if(!apiKey) throw new Error("OPENAI_API_KEY is not configured");
let openai: OpenAI | undefined;

const SYSTEM_PROMPT=`You are the independent D15-B claim verifier. You receive ONLY cited canonical evidence atoms and one candidate-facing claim.
Judge whether the claim stays within those atoms. Do not use outside knowledge or infer from titles or typical duties.
Reject ownership upgrades, invented outcomes, metrics, dates/durations, named entities/places, seniority/scope, tools, responsibilities, purpose links, or causal claims. Be strict about semantic upgrades even when they are linguistically subtle: support/assist wording does not entail providing/owning the activity; coordination/organisation does not entail managing it; and two separately documented activities do not entail that one was done to solve, improve, enable, or cause the other.
For HEADLINE, verify ONLY factual entailment and truth-boundary safety. Semantic synthesis is allowed when every substantive factual assertion is grounded in the cited atoms. Do not reject a headline merely because it is broad, interpretive, generic, or not insightful; SIGNIFICANCE is evaluated separately.
For SIGNIFICANCE, the relationship is EXPECTED not to be stated in any single cited line; discovering that cross-line relationship is the point of a semantic thread. Truth, factual entailment, invented facts, ownership, outcomes and causality are checked separately by deterministic guards and the HEADLINE verifier. DO NOT reject because the lines fail to say that they are connected, fail to say that one leads to/supports/influences another, or merely appear as separate CV bullets.

Apply these THREE tests:
(a) RELATIONAL MEANING: Is the proposed connection more than naming, listing, paraphrasing, or assigning a general category to the activities?
(b) REASONABLE SYNTHESIS: Would a reasonable reader, seeing these cited lines together, accept this connection as a fair synthesis of how the activities relate?
(c) ROLE-TITLE SPECIFICITY: Reject if the headline would be equally true of most people holding the candidate's ordinary job title or function. A generic duty-summary such as "You provide administrative support" or "You keep a manager's day running" is not a Mirror insight. Accept only when the cited lines together reveal a more specific recurring relationship, interface, pattern, or way of working than the role title itself implies.
Return supported=true if and only if (a) and (b) are yes AND the proposal passes (c).

Worked examples (illustrative only; these are not benchmark cases):
1. REJECT / generic receptionist duties. Lines: "Greeted clients at reception." + "Managed the main phone line." + "Ordered office stationery." Headline: "You keep front-desk administration running." => supported=false. This is a generic duty summary that would be equally true of many receptionists.
2. ACCEPT / warehouse tool-to-user interface. Lines: "Introduced a new stock-tracking tool in the warehouse." + "Trained warehouse staff to use the tool." + "Collected staff feedback after go-live." Headline: "You work where a new operational tool meets the people who have to use it." => supported=true. The lines reveal a specific implementation-to-user relationship beyond a generic warehouse-supervision title.
3. ACCEPT / accountant recurring around audit change. Lines: "Prepared account reconciliations for the annual audit." + "Mapped ledger balances during a finance-system migration." + "Reconciled migrated balances for auditor review." Headline: "Your accounting work repeatedly connects financial-system change with audit-ready evidence." => supported=true. The recurring relationship between system change, reconciliation and audit evidence is more specific than generic accounting work.

The lines themselves do NOT need to contain an explicit linking sentence, causal statement, or explanation of interconnection. Do not ask for one. Do not re-run factual entailment here.
For QUESTION_BACK, a genuine question may ask to establish an unknown fact; reject it only when its wording asserts an unsupported premise as already true. A neutral question asking what the candidate personally owned/did versus supported/assisted is SUPPORTED when cited evidence contains support/assist/help/participate/contribute wording. Do not treat the words "owned", "led", "result", or equivalent inside an interrogative as assertions when they are explicitly asking whether/how much of that unknown was true.
Reject the claim when its language differs from expected_language. Return supported=false whenever uncertain. Return JSON only.`;

const schema={type:"object",additionalProperties:false,properties:{supported:{type:"boolean"},reason:{type:"string"}},required:["supported","reason"]} as const;

function synthetic(lines:[string,string]):EvidenceLedger{
 const source_spans:SourceSpan[]=lines.map((text,i)=>({id:`SS${i+1}`,document_id:"SYNTHETIC",text,start_offset:i*200,end_offset:i*200+text.length,language:"en",source_section:"BULLET"}));
 const evidence:AtomicEvidence[]=source_spans.map((span,i)=>({id:`SE${i+1}`,source_span_id:span.id,provenance:{source_type:"CV",language:"en",extraction_method:"PARSER"},subject:{actor:"candidate",ownership:"INDIVIDUAL"},action:{normalized_action:i===0?"reviewed":"changed",object:lines[i]!},context:{},scale:{},time:{},outcome:null,assertion:{type:"RESPONSIBILITY",polarity:"AFFIRMATIVE"},verifiability:{has_quantifiable_metric:false,has_third_party_entity:false,has_time_anchor:false},extraction_confidence:1}));
 return {evidence,source_spans,requirements:[],support_judgments:[],requirement_statuses:[],unresolved_items:[],candidate_elicitations:[],demonstration_objectives:[]};
}
function gold(id:"NANCY"|"DAVID"|"MARIE"){const f=d15BGoldFixtures().find(x=>x.id===id);if(!f)throw new Error("missing fixture "+id);return buildD15BGoldLedger(f);}
const cases=[
 {id:"NANCY_A",ledger:gold("NANCY"),ids:["E4","E5","E6"],claim:"You work at the intersection of financial systems and business changes.",expected:true},
 {id:"DAVID_A",ledger:gold("DAVID"),ids:["E2","E4"],claim:"You create a rhythm for the sales team by aligning forecasts with structured reviews.",expected:true},
 {id:"FUNCTIONAL_POSITIVE",ledger:synthetic(["Reviewed recurring causes in customer complaints.","Changed the intake checklist after reviewing recurring complaint causes."]),ids:["SE1","SE2"],claim:"You connect recurring complaint diagnosis with intake-process changes.",expected:true},
 {id:"MARIE_A",ledger:gold("MARIE"),ids:["E5","E8"],claim:"Vous travaillez à l'intersection de l'analyse des problèmes et de la réorganisation des processus.",expected:true},
 {id:"ELENA_ADMIN",ledger:synthetic(["Filed supplier invoices each week.","Archived supplier invoices each month."]),ids:["SE1","SE2"],claim:"You work across invoice administration.",expected:false},
 {id:"MARIE_B_FLAT",ledger:gold("MARIE"),ids:["E2","E6"],claim:"Vous suivez les incidents clients et coordonnez leur résolution avec les équipes concernées.",expected:false},
] as const;

let correct=0;
console.log(JSON.stringify({event:"D15_SIGNIFICANCE_EXPERIMENT_START",model,cases:6,repetitions:5,qualification:"30/30"}));
for(const c of cases){
 const input=buildD15BSemanticInput(c.ledger);
 const wanted=new Set<string>(c.ids);
 const atoms=input.atoms.filter(a=>wanted.has(a.evidence_id));
 const language=c.id.startsWith("MARIE")?"fr":"en";
 for(let repetition=1;repetition<=5;repetition++){
  const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {model,temperature:0,response_format:{type:"json_schema",json_schema:{name:"d15_b_claim_verification",strict:true,schema}},messages:[
   {role:"system",content:SYSTEM_PROMPT},
   {role:"user",content:JSON.stringify({claim_type:"SIGNIFICANCE",expected_language:language,cited_atoms:atoms,claim:c.claim})},
  ]};
  assertModelRequestCapabilities(model,request);
  openai ??= new OpenAI({apiKey});
  const response=await openai.chat.completions.create(request);
  const raw=response.choices[0]?.message?.content||'{"supported":false,"reason":"empty verifier response"}';
  const parsed=JSON.parse(raw) as {supported?:boolean;reason?:string};
  const supported=parsed.supported===true;
  const pass=supported===c.expected;
  if(pass)correct++;
  console.log(JSON.stringify({event:"RAW_VERDICT",case:c.id,repetition,expected:c.expected,supported,pass,reason:String(parsed.reason??"")}));
 }
}
console.log(JSON.stringify({event:"D15_SIGNIFICANCE_EXPERIMENT_RESULT",model,correct,total:30,qualified:correct===30}));
if(correct!==30) process.exitCode=2;
