import test from "node:test";
import assert from "node:assert/strict";
import type { AtomicEvidence, EvidenceLedger } from "@/lib/canonical-evidence-model";
import { buildD15BSemanticInput, deterministicHeadlineFloor, verifyD15BDeterministicFloorForTest, deterministicOutcomeQuestion, deterministicOwnershipQuestion, parseD15BCandidateDiscoveryContent, verifyD15BSemanticThreadProposals } from "@/lib/d15-semantic-thread-engine";

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

test("D15-B semantic input excludes summary/profile assertions from pattern maturity",()=>{
  const summary={...span("S0","Proven expertise in FP&A and restricted fund management."),source_section:"SUMMARY_OR_PROFILE" as const};
  const bullet={...span("S1","Managed restricted CSR project funds."),source_section:"BULLET" as const};
  const l=ledger([
    atom("A0","S0","Proven","expertise in FP&A and restricted fund management"),
    atom("A1","S1","Managed","restricted CSR project funds"),
  ],[summary,bullet]);
  assert.deepEqual(buildD15BSemanticInput(l).atoms.map((item)=>item.id),["A1"]);
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


test("D15-B rejects unsupported scope and seniority",()=>{
  const s1=span("S1","Supported accounting integration activities.");
  const s2=span("S2","Supported systems integration.");
  const l=ledger([atom("A1","S1","Supported","accounting integration activities"),atom("A2","S2","Supported","systems integration")],[s1,s2]);
  const result=verifyD15BSemanticThreadProposals(l,[{
    id:"P1",headline:"Executive leadership of global integration",evidence_ids:["A1","A2"],question_back:null,
  }]);
  assert.equal(result.accepted.length,0);
  assert.ok(result.rejected[0]?.reasons.some((x)=>x.includes("scope")));
  assert.ok(result.rejected[0]?.reasons.some((x)=>x.includes("seniority")));
});

test("D15-B rejects unsupported named entities or places",()=>{
  const s1=span("S1","Supported a customer portal rollout.");
  const s2=span("S2","Collected user feedback during rollout.");
  const l=ledger([atom("A1","S1","Supported","a customer portal rollout"),atom("A2","S2","Collected","user feedback during rollout")],[s1,s2]);
  const result=verifyD15BSemanticThreadProposals(l,[{
    id:"P1",headline:"Portal rollout for Microsoft in Abidjan",evidence_ids:["A1","A2"],question_back:null,
  }]);
  assert.equal(result.accepted.length,0);
  assert.ok(result.rejected[0]?.reasons.some((x)=>x.includes("named entity")));
});


test("D15-B guard spec: mid-sentence unsupported entity is rejected",()=>{
  const s1=span("S1","Supported acquisition accounting and systems integration.");
  const s2=span("S2","Supported a portal rollout.");
  const l=ledger([atom("A1","S1","Supported","acquisition accounting and systems integration"),atom("A2","S2","Supported","a portal rollout")],[s1,s2]);
  assert.equal(verifyD15BSemanticThreadProposals(l,[{id:"P",headline:"Integration support with Microsoft",evidence_ids:["A1","A2"],question_back:null}]).accepted.length,0);
});

test("D15-B guard spec: two-word unsupported entity at headline start is rejected",()=>{
  const s1=span("S1","Supported a customer portal rollout.");
  const s2=span("S2","Collected user feedback during rollout.");
  const l=ledger([atom("A1","S1","Supported","a customer portal rollout"),atom("A2","S2","Collected","user feedback during rollout")],[s1,s2]);
  assert.equal(verifyD15BSemanticThreadProposals(l,[{id:"P",headline:"New York portal rollout support",evidence_ids:["A1","A2"],question_back:null}]).accepted.length,0);
});

test("D15-B guard spec: Title-Case headline containing unsupported entity is rejected before output",()=>{
  const s1=span("S1","Supported a customer portal rollout.");
  const s2=span("S2","Collected user feedback during rollout.");
  const l=ledger([atom("A1","S1","Supported","a customer portal rollout"),atom("A2","S2","Collected","user feedback during rollout")],[s1,s2]);
  const r=verifyD15BSemanticThreadProposals(l,[{id:"P",headline:"Portal Rollout For Microsoft",evidence_ids:["A1","A2"],question_back:null}]);
  assert.equal(r.accepted.length,0);
  assert.ok(r.rejected[0]?.reasons.some(reason=>reason.includes("named entity")));
});

test("D15-B You/Vous opener is presentation, while unsupported entities remain guarded",()=>{
  const s1=span("S1","Supported a customer portal rollout.");
  const s2=span("S2","Collected user feedback during rollout.");
  const l=ledger([atom("A1","S1","Supported","a customer portal rollout"),atom("A2","S2","Collected","user feedback during rollout")],[s1,s2]);
  assert.equal(verifyD15BSemanticThreadProposals(l,[{id:"EN",headline:"You connect portal rollout with user feedback",evidence_ids:["A1","A2"],question_back:null}]).accepted.length,1);
  assert.equal(verifyD15BSemanticThreadProposals(l,[{id:"BAD",headline:"You connect portal rollout with Microsoft",evidence_ids:["A1","A2"],question_back:null}]).accepted.length,0);

  const f1={...span("F1","Déployait de nouvelles procédures de suivi des commandes dans les agences."),language:"fr" as const};
  const f2={...span("F2","Analysait les retards de livraison et présentait les causes principales à la direction."),language:"fr" as const};
  const fr=ledger([atom("E1","F1","Déployait","de nouvelles procédures"),atom("E2","F2","Analysait","les retards de livraison")],[f1,f2]);
  fr.evidence.forEach(x=>{x.provenance.language="fr";});
  assert.equal(verifyD15BSemanticThreadProposals(fr,[{id:"FR",headline:"Vous reliez l’analyse des retards aux changements de procédure",evidence_ids:["E1","E2"],question_back:null}]).accepted.length,1);
});

test("D15-B deterministic headline floor survives truth guards for every Gold evidence group",()=>{
  const lines={
    NANCY:[
      "Managing accounting systems and financial procedures.",
      "Preparing and analysing actual, forecast and budget financial information.",
      "Managing statutory financial reporting and taxation requirements.",
      "Supporting acquisition accounting and financial integration activities.",
      "Supporting systems integration following business changes.",
      "Implementing and improving accounting systems and processes.",
      "Training and developing finance staff.",
      "Providing financial information to management to support business decisions.",
      "Maintaining effective financial controls and reporting processes.",
      "Communicating financial information to internal stakeholders.",
    ],
    MARIE:[
      "Coordonnait les opérations quotidiennes de trois agences régionales.",
      "Suivait les incidents clients et organisait leur résolution avec les équipes concernées.",
      "Déployait de nouvelles procédures de suivi des commandes dans les agences.",
      "Formait les nouveaux superviseurs aux procédures opérationnelles.",
      "Analysait les retards de livraison et présentait les causes principales à la direction.",
      "Coordonnait le suivi des fournisseurs et des équipes internes lors des périodes de forte activité.",
      "Mettre à jour les tableaux de bord hebdomadaires pour la direction.",
      "Participait à la réorganisation du processus de traitement des commandes.",
    ],
    DAVID:[
      "Managed a portfolio of business customers across the northern region.",
      "Prepared monthly sales forecasts and reviewed variances with the sales team.",
      "Visited key accounts to understand customer priorities and coordinate follow-up.",
      "Introduced a structured pipeline review for the sales team.",
      "Worked with marketing colleagues to coordinate product launches.",
      "Presented customer and market observations to senior management.",
      "Coached new account executives on customer planning and reporting routines.",
      "Supported negotiations with several strategic customers.",
    ],
    THOMAS:[
      "Coordinated project meetings and maintained action logs.",
      "Prepared status updates for project stakeholders.",
      "Worked with technical teams to track delivery issues.",
      "Supported the rollout of a new customer portal.",
      "Collected user feedback during the portal rollout.",
      "Maintained project documentation and risk registers.",
      "Assisted with training sessions for users of the new portal.",
      "Helped project managers prepare steering-committee materials.",
    ],
  } as const;
  const cases=[
    ["NANCY-A",lines.NANCY,"en",["E4","E5","E6"]],
    ["NANCY-B",lines.NANCY,"en",["E8","E10"]],
    ["MARIE-A-E5-E3",lines.MARIE,"fr",["E5","E3"]],
    ["MARIE-A-E5-E8",lines.MARIE,"fr",["E5","E8"]],
    ["MARIE-A-FULL",lines.MARIE,"fr",["E5","E3","E8"]],
    ["MARIE-B",lines.MARIE,"fr",["E2","E6"]],
    ["DAVID-A-E2-E4",lines.DAVID,"en",["E2","E4"]],
    ["DAVID-A-E4-E7",lines.DAVID,"en",["E4","E7"]],
    ["DAVID-A-FULL",lines.DAVID,"en",["E2","E4","E7"]],
    ["DAVID-B",lines.DAVID,"en",["E3","E6"]],
    ["THOMAS-A-E4-E5",lines.THOMAS,"en",["E4","E5"]],
    ["THOMAS-A-E4-E7",lines.THOMAS,"en",["E4","E7"]],
    ["THOMAS-A-E5-E7",lines.THOMAS,"en",["E5","E7"]],
    ["THOMAS-A-FULL",lines.THOMAS,"en",["E4","E5","E7"]],
  ] as const;
  for(const [name,fixtureLines,language,evidenceIds] of cases){
    const selected=evidenceIds.map(id=>{
      const index=Number(id.slice(1))-1;
      const text=fixtureLines[index]!;
      const source={...span(`S${index+1}`,text),language};
      return {id,text,source};
    });
    const l=ledger(
      selected.map(({id,text},i)=>atom(id,`S${Number(id.slice(1))}`,text.split(/\\s+/)[0]??"Performed",text)),
      selected.map(({source})=>source),
    );
    l.evidence.forEach(x=>{x.provenance.language=language;});
    const proposal={id:name,headline:"placeholder",evidence_ids:[...evidenceIds],question_back:null};
    const floor=deterministicHeadlineFloor(l,proposal);
    const checked=verifyD15BDeterministicFloorForTest(l,{...proposal,headline:floor});
    assert.equal(checked.length,0,`${name} floor rejected: ${checked.join(" | ")}; floor=${JSON.stringify(floor)}`);
  }
});

test("D15-B shared boundary rejects contradicted evidence",()=>{
  const s1=span("S1","Managed treasury reporting.");
  const s2=span("S2","Did not manage treasury reporting.");
  const s3=span("S3","Reviewed treasury reporting.");
  const neg={...atom("N1","S2","Managed","treasury reporting"),assertion:{type:"RESPONSIBILITY",polarity:"NEGATED"}} as AtomicEvidence;
  const l=ledger([atom("A1","S1","Managed","treasury reporting"),neg,atom("A2","S3","Reviewed","treasury reporting")],[s1,s2,s3]);
  assert.deepEqual(buildD15BSemanticInput(l).atoms.map((item)=>item.evidence_id),["A2"]);
  const result=verifyD15BSemanticThreadProposals(l,[{id:"P1",headline:"Treasury reporting",evidence_ids:["A1","A2"],question_back:null}]);
  assert.equal(result.accepted.length,0);
  assert.ok(result.rejected[0]?.reasons.some((x)=>x.includes("unknown or ineligible")));
});

test("D15-B shared boundary deduplicates semantic evidence",()=>{
  const s1=span("S1","Managed monthly treasury reporting.");
  const s2=span("S2","Managed monthly treasury reporting.");
  const l=ledger([atom("A1","S1","Managed","monthly treasury reporting"),atom("A2","S2","Managed","monthly treasury reporting")],[s1,s2]);
  assert.deepEqual(buildD15BSemanticInput(l).atoms.map((item)=>item.evidence_id),["A1"]);
});

test("D15-B shared boundary excludes role-overview atoms before semantic threading",()=>{
  const s1={...span("S1","Responsible for accounting systems."),source_section:"EXPERIENCE_NON_BULLET"};
  const s2={...span("S2","Managed accounting systems."),source_section:"BULLET"};
  const l=ledger([atom("A1","S1","Responsible","accounting systems"),atom("A2","S2","Managed","accounting systems")],[s1,s2] as any);
  assert.deepEqual(buildD15BSemanticInput(l).atoms.map((item)=>item.evidence_id),["A2"]);
});


test("D15-B guard spec: French piloté ownership escalation is rejected",()=>{
  const s1=span("S1","Participait à la réorganisation des processus.");
  const s2=span("S2","A contribué au suivi de la réorganisation.");
  const l=ledger([atom("A1","S1","Participait","à la réorganisation des processus"),atom("A2","S2","Contribué","au suivi de la réorganisation")],[s1,s2]);
  const r=verifyD15BSemanticThreadProposals(l,[{id:"P",headline:"Vous avez piloté la réorganisation des processus",evidence_ids:["A1","A2"],question_back:null}]);
  assert.equal(r.accepted.length,0);
});

test("D15-B guard spec: French réduit outcome escalation is rejected",()=>{
  const s1=span("S1","Analysait les retards de livraison.");
  const s2=span("S2","Mettait à jour le tableau de bord des retards.");
  const l=ledger([atom("A1","S1","Analysait","les retards de livraison"),atom("A2","S2","Mettait","à jour le tableau de bord des retards")],[s1,s2]);
  const r=verifyD15BSemanticThreadProposals(l,[{id:"P",headline:"Vous avez réduit les retards de livraison",evidence_ids:["A1","A2"],question_back:null}]);
  assert.equal(r.accepted.length,0);
});

for (const entity of ["Syngenta","Paris"]) test(`D15-B guard spec: first-word entity ${entity} is rejected`,()=>{
  const s1=span("S1","Supported acquisition accounting and systems integration.");
  const s2=span("S2","Supported a portal rollout.");
  const l=ledger([atom("A1","S1","Supported","acquisition accounting and systems integration"),atom("A2","S2","Supported","a portal rollout")],[s1,s2]);
  const headline=entity==="Syngenta"?"Syngenta acquisition and systems integration support":"Paris portal rollout support";
  assert.equal(verifyD15BSemanticThreadProposals(l,[{id:"P",headline,evidence_ids:["A1","A2"],question_back:null}]).accepted.length,0);
});

for (const headline of ["Finance Through Change","Finance and Its Operating Rhythm"]) test(`D15-B guard spec: benign Title Case remains accepted: ${headline}`,()=>{
  const s1=span("S1","Worked across finance during change.");
  const s2=span("S2","Maintained the operating rhythm of finance.");
  const l=ledger([atom("A1","S1","Worked","across finance during change"),atom("A2","S2","Maintained","the operating rhythm of finance")],[s1,s2]);
  assert.equal(verifyD15BSemanticThreadProposals(l,[{id:"P",headline,evidence_ids:["A1","A2"],question_back:null}]).accepted.length,1);
});

test("D15-B guard spec: exact numeric value must be grounded",()=>{
  const s1=span("S1","Handled 8 reviews.");
  const s2=span("S2","Supported review follow-up.");
  const l=ledger([atom("A1","S1","Handled","8 reviews"),atom("A2","S2","Supported","review follow-up")],[s1,s2]);
  assert.equal(verifyD15BSemanticThreadProposals(l,[{id:"P",headline:"Handled 12 reviews",evidence_ids:["A1","A2"],question_back:null}]).accepted.length,0);
});

test("D15-B guard spec: unsupported ownership premise inside question is rejected",()=>{
  const s1=span("S1","Supported a portal rollout.");
  const s2=span("S2","Collected user feedback during rollout.");
  const l=ledger([atom("A1","S1","Supported","a portal rollout"),atom("A2","S2","Collected","user feedback during rollout")],[s1,s2]);
  const r=verifyD15BSemanticThreadProposals(l,[{id:"P",headline:"Portal rollout and user feedback",evidence_ids:["A1","A2"],question_back:"Since you led the rollout, what outcome did you achieve?"}]);
  assert.equal(r.accepted.length,0);
});

test("D15-B guard spec: Thomas portal-style grounded English headline remains accepted",()=>{
  const s1=span("S1","Supported the rollout of a new customer portal.");
  const s2=span("S2","Collected user feedback during the portal rollout.");
  const l=ledger([atom("A1","S1","Supported","the rollout of a new customer portal"),atom("A2","S2","Collected","user feedback during the portal rollout")],[s1,s2]);
  assert.equal(verifyD15BSemanticThreadProposals(l,[{id:"P",headline:"Customer portal rollout and user feedback",evidence_ids:["A1","A2"],question_back:null}]).accepted.length,1);
});

test("D15-B guard spec: Nancy-style integration support headline remains accepted",()=>{
  const s1=span("S1","Supported acquisition accounting and financial integration activities.");
  const s2=span("S2","Supported systems integration following business changes.");
  const l=ledger([atom("A1","S1","Supported","acquisition accounting and financial integration activities"),atom("A2","S2","Supported","systems integration following business changes")],[s1,s2]);
  assert.equal(verifyD15BSemanticThreadProposals(l,[{id:"P",headline:"Financial and systems integration support",evidence_ids:["A1","A2"],question_back:null}]).accepted.length,1);
});

test("D15-B Thomas exact support evidence selects English ownership floor from cited atoms",()=>{
  const s1=span("S1","Supported the rollout of a new customer portal.");
  const s2=span("S2","Collected user feedback during the portal rollout.");
  const l=ledger([atom("E4","S1","Supported","the rollout of a new customer portal"),atom("E5","S2","Collected","user feedback during the portal rollout")],[s1,s2]);
  const proposal={id:"THOMAS-A",headline:"Customer portal rollout and user feedback",evidence_ids:["E4","E5"],question_back:null};
  assert.equal(deterministicOwnershipQuestion(l,proposal),"In this work, what did you personally own or do, and what did you mainly support or assist with?");
});

test("D15-B reviewed outcome floors are exact premise-free templates in both languages",()=>{
  const en1=span("S1","Prepared monthly sales forecasts.");
  const en2=span("S2","Introduced a structured pipeline review.");
  const en=ledger([atom("E2","S1","Prepared","monthly sales forecasts"),atom("E4","S2","Introduced","a structured pipeline review")],[en1,en2]);
  const p={id:"DAVID-A",headline:"Sales forecasting and pipeline review",evidence_ids:["E2","E4"],question_back:null};
  assert.equal(deterministicOutcomeQuestion(en,p),"Did this change anything measurable? If so, what?");

  const fr1={...span("F1","Analysait les retards de livraison."),language:"fr" as const};
  const fr2={...span("F2","Déployait de nouvelles procédures."),language:"fr" as const};
  const a1={...atom("E5","F1","Analysait","les retards de livraison"),provenance:{source_type:"CV" as const,language:"fr" as const,extraction_method:"LLM" as const}};
  const a2={...atom("E3","F2","Déployait","de nouvelles procédures"),provenance:{source_type:"CV" as const,language:"fr" as const,extraction_method:"LLM" as const}};
  const fr=ledger([a1,a2],[fr1,fr2]);
  assert.equal(deterministicOutcomeQuestion(fr,{...p,evidence_ids:["E5","E3"]}),"Cela a-t-il changé quelque chose de mesurable ? Si oui, quoi ?");
});

test("D15-B discovery distinguishes genuine empty candidates from engine-content failure",()=>{
  assert.deepEqual(parseD15BCandidateDiscoveryContent('{"candidates":[]}'),[]);
  assert.throws(()=>parseD15BCandidateDiscoveryContent(""),/empty model content/);
  assert.throws(()=>parseD15BCandidateDiscoveryContent('{"unexpected":[]}'),/invalid candidates payload/);
});
