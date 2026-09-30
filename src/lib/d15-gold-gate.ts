import type { AtomicEvidence, EvidenceLedger, SourceSpan } from "@/lib/canonical-evidence-model";
import { runD15BSemanticThreadEngine, type D15BVerificationResult } from "@/lib/d15-semantic-thread-engine";
import { AI_MODEL, getOpenAI } from "@/lib/openai";

type GoldThreadRule = {
  id: string;
  core_meaning: string;
  required_sets: string[][];
  prohibited_ids: string[];
  question_requirement: string;
};

type GoldFixture = {
  id: "NANCY" | "MARIE" | "DAVID" | "ELENA" | "THOMAS";
  language: "en" | "fr";
  lines: string[];
  threads: GoldThreadRule[];
  expected_thread_count: number;
  global_must_not: string[];
};

export type D15BGoldCaseResult = {
  fixture_id: GoldFixture["id"];
  passed: boolean;
  engine: D15BVerificationResult;
  deterministic_errors: string[];
  semantic_errors: string[];
  unmatched_thread_ids: string[];
};

const FIXTURES: GoldFixture[] = [
  {
    id: "NANCY", language: "en", expected_thread_count: 2,
    lines: [
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
    threads: [
      { id:"A", core_meaning:"Finance keeps functioning while the business changes through acquisition, integration, systems and process change.", required_sets:[["E4","E5","E6"]], prohibited_ids:["E1","E3","E8","E9","E10"], question_requirement:"Surface the support-versus-implementation ownership tension and ask what Nancy actually led or owned without assuming leadership." },
      { id:"B", core_meaning:"Financial information is connected to management and internal stakeholders who use it for decisions.", required_sets:[["E8","E10"]], prohibited_ids:["E3","E4","E5","E6","E9"], question_requirement:"Ask whether a decision or action changed because of the information, without claiming that it did." },
    ],
    global_must_not:["Do not claim Nancy led acquisitions or integrations.","Do not invent outcomes, scale, dates, duration, seniority or strategic-leader status."],
  },
  {
    id:"MARIE", language:"fr", expected_thread_count:2,
    lines:[
      "Coordonnait les opérations quotidiennes de trois agences régionales.",
      "Suivait les incidents clients et organisait leur résolution avec les équipes concernées.",
      "Déployait de nouvelles procédures de suivi des commandes dans les agences.",
      "Formait les nouveaux superviseurs aux procédures opérationnelles.",
      "Analysait les retards de livraison et présentait les causes principales à la direction.",
      "Coordonnait le suivi des fournisseurs et des équipes internes lors des périodes de forte activité.",
      "Mettre à jour les tableaux de bord hebdomadaires pour la direction.",
      "Participait à la réorganisation du processus de traitement des commandes.",
    ],
    threads:[
      { id:"A", core_meaning:"Elle identifie où le flux de commandes se bloque et contribue à modifier les procédures qui le structurent.", required_sets:[["E5","E3"],["E5","E8"],["E5","E3","E8"]], prohibited_ids:["E1","E4","E6","E7"], question_requirement:"En français, faire ressortir Déployait versus Participait à et demander ce qu'elle a réellement piloté, sans le présumer." },
      { id:"B", core_meaning:"Quand un problème implique plusieurs parties, elle les organise pour le résoudre.", required_sets:[["E2","E6"]], prohibited_ids:["E1","E3","E4","E5","E7","E8"], question_requirement:"En français, demander quel résultat concret cette coordination a produit, sans inventer le résultat." },
    ],
    global_must_not:["Les sorties doivent être en français.","Ne pas utiliser direction, suivi ou équipes comme thème lexical.","Ne pas inventer de baisse des retards, dates ou leadership de la réorganisation."],
  },
  {
    id:"DAVID", language:"en", expected_thread_count:2,
    lines:[
      "Managed a portfolio of business customers across the northern region.",
      "Prepared monthly sales forecasts and reviewed variances with the sales team.",
      "Visited key accounts to understand customer priorities and coordinate follow-up.",
      "Introduced a structured pipeline review for the sales team.",
      "Worked with marketing colleagues to coordinate product launches.",
      "Presented customer and market observations to senior management.",
      "Coached new account executives on customer planning and reporting routines.",
      "Supported negotiations with several strategic customers.",
    ],
    threads:[
      { id:"A", core_meaning:"Beyond managing accounts, he builds the planning and review discipline the sales team runs on.", required_sets:[["E2","E4"],["E4","E7"],["E2","E4","E7"]], prohibited_ids:["E1","E3","E5","E6","E8"], question_requirement:"Ask about ownership or the outcome of the pipeline-review discipline without inventing results." },
      { id:"B", core_meaning:"He carries what customers need and what he observes in the market back to senior management.", required_sets:[["E3","E6"]], prohibited_ids:["E1","E2","E4","E5","E7","E8"], question_requirement:"Ask whether anything changed because of his observations without claiming that it did." },
    ],
    global_must_not:["Do not restate the thread merely as sales or account management.","Do not invent revenue, forecast accuracy, win-rate, team size or dates."],
  },
  {
    id:"ELENA", language:"en", expected_thread_count:0,
    lines:[
      "Answered incoming calls and welcomed visitors.",
      "Updated contact information in the office database.",
      "Prepared meeting rooms and circulated agendas.",
      "Processed routine invoices according to established procedures.",
      "Booked travel and maintained calendars for managers.",
      "Filed documents and maintained electronic records.",
      "Ordered office supplies when requested.",
      "Assisted with general administrative tasks.",
    ],
    threads:[],
    global_must_not:["Zero threads. Do not manufacture office, maintained or record-keeping patterns.","Do not infer organised, reliable, detail-oriented, initiative, ownership or improvement."],
  },
  {
    id:"THOMAS", language:"en", expected_thread_count:1,
    lines:[
      "Coordinated project meetings and maintained action logs.",
      "Prepared status updates for project stakeholders.",
      "Worked with technical teams to track delivery issues.",
      "Supported the rollout of a new customer portal.",
      "Collected user feedback during the portal rollout.",
      "Maintained project documentation and risk registers.",
      "Assisted with training sessions for users of the new portal.",
      "Helped project managers prepare steering-committee materials.",
    ],
    threads:[
      { id:"A", core_meaning:"He works where a new customer portal meets the people who have to use it.", required_sets:[["E4","E5"],["E4","E7"],["E5","E7"],["E4","E5","E7"]], prohibited_ids:["E1","E2","E3","E6","E8"], question_requirement:"Ask what he personally owned because the evidence is support-level; do not assume he led the rollout." },
    ],
    global_must_not:["Do not create a second project-administration thread.","Do not claim portal leadership, adoption success, user count or dates."],
  },
];

function atom(id:string, spanId:string, line:string, language:"en"|"fr"):AtomicEvidence {
  const first = line.replace(/[.]/g,"").split(/\s+/)[0] ?? "Performed";
  const object = line.slice(first.length).trim().replace(/[.]$/,"");
  return {
    id, source_span_id:spanId, provenance:{source_type:"CV",language,extraction_method:"LLM"},
    subject:{actor:"candidate",ownership:"UNKNOWN"}, action:{normalized_action:first,object},
    context:{},scale:{},time:{},outcome:null,
    assertion:{type:"RESPONSIBILITY",polarity:"AFFIRMATIVE"},
    verifiability:{has_quantifiable_metric:false,has_third_party_entity:false,has_time_anchor:false},
    extraction_confidence:1,
  };
}

export function buildD15BGoldLedger(fixture: GoldFixture): EvidenceLedger {
  const source_spans:SourceSpan[] = fixture.lines.map((line,i)=>({
    id:`S${i+1}`,document_id:`GOLD-${fixture.id}`,text:line,start_offset:i*100,end_offset:i*100+line.length,
    language:fixture.language,source_section:"BULLET",
  }));
  return {
    source_spans,
    evidence:fixture.lines.map((line,i)=>atom(`E${i+1}`,`S${i+1}`,line,fixture.language)),
    requirements:[],support_judgments:[],requirement_statuses:[],unresolved_items:[],candidate_elicitations:[],demonstration_objectives:[],
  };
}

function setKey(ids:string[]):string { return [...new Set(ids)].sort().join("|"); }

function looksFrench(text:string):boolean {
  return /[àâçéèêëîïôûùüÿœæ]|\\b(?:dans|avec|vous|votre|qu|avez|personnellement|particip|réorganisation|retards|livraison|suivi|équipes|fournisseurs|commandes)\\b/i.test(text);
}
function languageMismatch(expected:"en"|"fr", text:string|null|undefined):boolean {
  if(!text) return false;
  return expected==="fr" ? !looksFrench(text) : looksFrench(text);
}
function isQuestion(text:string|null|undefined):boolean { return Boolean(text && text.trim().endsWith("?")); }
function ownershipQuestion(text:string|null|undefined):boolean {
  return isQuestion(text) && /personnel|personally|own|pris(?:e)? en charge|pilot|lead|led|souten|assist|particip/i.test(text!);
}
function outcomeQuestion(text:string|null|undefined):boolean {
  return isQuestion(text) && /résultat|result|chang|impact|amélior|improv|après|after|produit|outcome/i.test(text!);
}
function diagnosisChangeMeaning(text:string):boolean {
  const diagnosis=/retard|delay|cause|diagnos|bloc|break/i.test(text);
  const change=/procéd|proced|réorgan|reorgan|déploi|deploy|process|traitement des commandes|order process/i.test(text);
  return diagnosis && change;
}
function normalizedFrenchMatch(text:string|null|undefined):string {
  return (text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}
function explicitDeploymentParticipationContrast(text:string|null|undefined):boolean {
  if(!isQuestion(text)) return false;
  const normalized=normalizedFrenchMatch(text);
  const hasDeployment=/\bdeploy/.test(normalized);
  const hasParticipation=/\bparticip/.test(normalized);
  const hasContrast=/\b(?:et|mais|plutot|versus|vs)\b/.test(normalized);
  return hasDeployment && hasParticipation && hasContrast;
}

export type D15BDeterministicGoldAssessment = {
  errors:string[];
  unmatched_thread_ids:string[];
  matched:{rule_id:string;proposal_id:string;evidence_key:string}[];
};

export function assessD15BGoldDeterministically(fixture:GoldFixture,result:D15BVerificationResult):D15BDeterministicGoldAssessment {
  const errors:string[]=[];
  const unmatched=[...result.accepted];
  const matched:D15BDeterministicGoldAssessment["matched"]=[];

  if(fixture.id==="ELENA"){
    if(result.accepted.length!==0) errors.push("Elena restraint failed: expected zero displayed professional threads");
    // v2.1 makes the CV-level pattern-seeking question part of complete D15-B.
    // The current D15BVerificationResult contract has no CV-level question field, so this remains an explicit product-capability failure.
    errors.push("Elena CV-level pattern-seeking question capability is absent from the current D15-B output contract");
    return {errors,unmatched_thread_ids:unmatched.map(x=>x.id),matched};
  }

  for(const rule of fixture.threads){
    const allowed=new Set(rule.required_sets.map(setKey));
    const idx=unmatched.findIndex(p=>allowed.has(setKey(p.evidence_ids)) && !p.evidence_ids.some(id=>rule.prohibited_ids.includes(id)));
    if(idx<0){ errors.push(`Gold thread ${rule.id} required evidence/purity not recovered`); continue; }
    const p=unmatched.splice(idx,1)[0]!;
    const key=setKey(p.evidence_ids);
    matched.push({rule_id:rule.id,proposal_id:p.id,evidence_key:key});

    if(languageMismatch(fixture.language,p.headline)) errors.push(`Gold thread ${rule.id} headline language mismatch: expected ${fixture.language}`);
    if(languageMismatch(fixture.language,p.question_back)) errors.push(`Gold thread ${rule.id} question language mismatch: expected ${fixture.language}`);

    if(fixture.id==="NANCY" && rule.id==="A" && !ownershipQuestion(p.question_back))
      errors.push("Nancy A requires a premise-free ownership clarification");
    if(fixture.id==="MARIE" && rule.id==="A"){
      if(!diagnosisChangeMeaning(p.headline)) errors.push("Marie A headline must preserve delivery-delay diagnosis and evidenced process/procedure change");
      if(key===setKey(["E5","E3"]) && !outcomeQuestion(p.question_back))
        errors.push("Marie A E5+E3 requires a neutral outcome question");
      if(key===setKey(["E5","E8"]) && !ownershipQuestion(p.question_back))
        errors.push("Marie A E5+E8 requires a neutral ownership question about participation");
      if(key===setKey(["E5","E3","E8"])){
        if(!ownershipQuestion(p.question_back) || !explicitDeploymentParticipationContrast(p.question_back))
          errors.push("Marie A full recall requires an explicit Déployait-versus-Participait ownership question");
      }
    }
    if(fixture.id==="DAVID" && rule.id==="A" && !(ownershipQuestion(p.question_back)||outcomeQuestion(p.question_back)))
      errors.push("David A requires an ownership or outcome question");
    if(fixture.id==="THOMAS" && rule.id==="A" && !ownershipQuestion(p.question_back))
      errors.push("Thomas A requires a premise-free personal-ownership clarification");
  }

  // v2.1 third path: unmatched extras are not an automatic pass or fail.
  // They must be routed to a separate legitimacy review.
  return {errors,unmatched_thread_ids:unmatched.map(x=>x.id),matched};
}

const SCORE_SCHEMA={
  type:"object",additionalProperties:false,
  properties:{passed:{type:"boolean"},errors:{type:"array",items:{type:"string"}}},
  required:["passed","errors"],
} as const;

function citedAtoms(fixture:GoldFixture,result:D15BVerificationResult){
  return result.accepted.map(thread=>({
    thread_id:thread.id,
    cited_atoms:thread.evidence_ids.map(id=>({id,text:fixture.lines[Number(id.slice(1))-1]??""})),
  }));
}

const LEADERSHIP_OR_OWNERSHIP=/(?<!\p{L})(?:lead(?:s|ing)?|led|own(?:s|ed|ing)?|drive(?:s|n|ing)?|drove|manag(?:e|ed|es|ing)|head(?:s|ed|ing)?|oversee(?:s|ing)?|oversaw|overseen|spearhead(?:s|ed|ing)?|orchestrat(?:e|ed|es|ing)|responsible\s+for|pilot(?:e|es|er|ait|aient|é|ée|és|ées)|dirig(?:e|es|er|eait|eaient|é|ée|és|ées)|men(?:er|e|es|ait|aient|é|ée|és|ées)|condui(?:re|t|te|ts|tes|sait|saient)|supervis(?:er|e|es|ait|aient|é|ée|és|ées)|pris\s+en\s+charge)(?!\p{L})/iu;

const SYSTEM_OWNERSHIP_QUESTIONS=new Set([
  "What did you personally own, and what did you mainly support?",
  "What did you personally own?",
  "Dans ce travail, qu’avez-vous personnellement pris en charge, et qu’avez-vous plutôt soutenu ou accompagné ?",
  "Qu’avez-vous personnellement pris en charge ?",
]);

export type SemanticPreclearResult={ errors:string[]; set_aside:Array<{raw:string;reason:string}> };

export function supportGroundingPreclear(fixture:GoldFixture,result:D15BVerificationResult,errors:string[]):SemanticPreclearResult {
  const neutralCandidate=result.accepted.every(thread=>{
    const question=thread.question_back&&SYSTEM_OWNERSHIP_QUESTIONS.has(thread.question_back.trim())?"":thread.question_back??"";
    return !LEADERSHIP_OR_OWNERSHIP.test(`${thread.headline}\n${question}`);
  });
  if(!neutralCandidate) return {errors,set_aside:[]};
  const setAside=errors.filter(error=>/lead(?:er|ership|ing|s|\b)|unsupported ownership|ownership upgrade/i.test(error));
  return {
    errors:errors.filter(error=>!setAside.includes(error)),
    set_aside:setAside.map(raw=>({raw,reason:"Candidate headline and non-template question contain no leadership/ownership upgrade verb; raw semantic finding retained for audit."})),
  };
}

export async function semanticGoldErrors(fixture:GoldFixture,result:D15BVerificationResult, unmatchedThreadIds:string[]):Promise<string[]> {
  if(fixture.expected_thread_count===0) return result.accepted.length===0?[]:["Elena must have zero threads"];
  const response=await getOpenAI().chat.completions.create({
    model:AI_MODEL,temperature:0,
    response_format:{type:"json_schema",json_schema:{name:"d15_b_gold_score",strict:true,schema:SCORE_SCHEMA}},
    messages:[
      {role:"system",content:`You are a semantic benchmark reviewer operating under frozen Gold v2.1. Evidence-set recall, required-question presence, and language are scored deterministically before you. Judge only semantic core meaning, truth boundaries, restraint, and the legitimacy of unmatched extras. Judge candidate wording against the verbatim cited atoms supplied for each thread. A source phrase such as "Supported the rollout" faithfully paraphrased as "support for the rollout" is support-level evidence and MUST NOT be called leadership or require a disclaimer that leadership did not occur. For Marie Thread A: E5+E3 is an acceptable partial branch requiring a neutral outcome question; E5+E8 is an acceptable partial branch requiring a neutral ownership clarification grounded only in participation; only E5+E3+E8 requires an explicit Déployait-versus-Participait ownership contrast. Do not impose the full-branch contrast on E5+E8. Do not invent missing source context. Unmatched extras must each be judged LEGITIMATE or ILLEGITIMATE against relationship/significance, evidence eligibility, truth boundaries, traceability, overlap and restraint; an unmatched extra is not automatically a failure. Return errors only for actual semantic violations.`},
      {role:"user",content:JSON.stringify({language:fixture.language,source_lines:fixture.lines,cited_source_atoms:citedAtoms(fixture,result),gold_threads:fixture.threads,global_must_not:fixture.global_must_not,candidate_output:result.accepted,unmatched_thread_ids:unmatchedThreadIds})},
    ],
  });
  const parsed=JSON.parse(response.choices[0]?.message?.content||'{"passed":false,"errors":["empty scorer response"]}') as {passed:boolean;errors:string[]};
  const raw=parsed.passed?[]:parsed.errors;
  const preclear=supportGroundingPreclear(fixture,result,raw);
  for(const item of preclear.set_aside) console.log("[D15 GOLD SEMANTIC SET-ASIDE]",JSON.stringify(item));
  return preclear.errors;
}

export async function runD15BGoldGate():Promise<D15BGoldCaseResult[]> {
  const results:D15BGoldCaseResult[]=[];
  for(const fixture of FIXTURES){
    const ledger=buildD15BGoldLedger(fixture);
    const engine=await runD15BSemanticThreadEngine(ledger);
    const deterministic=assessD15BGoldDeterministically(fixture,engine);
    const deterministic_errors=deterministic.errors;
    const semantic_errors=deterministic_errors.length?[]:await semanticGoldErrors(fixture,engine,deterministic.unmatched_thread_ids);
    results.push({fixture_id:fixture.id,passed:deterministic_errors.length===0&&semantic_errors.length===0,engine,deterministic_errors,semantic_errors,unmatched_thread_ids:deterministic.unmatched_thread_ids});
  }
  return results;
}

export function d15BGoldFixtures():readonly GoldFixture[]{ return FIXTURES; }
