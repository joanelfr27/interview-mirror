import { readFile, writeFile, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { runD15ModelPreflight } from "@/lib/d15-model-preflight";
import { judgeCanonicalSupport, buildSupportJudgeSchema } from "@/lib/canonical-support-judge";
import { attachDemonstrationObjectives } from "@/lib/demonstration-objectives";
import { projectD16CanonicalLedger } from "@/lib/d16-shadow-runtime-integration";
import { attachD16DevelopmentRole, D16_SALES_ROLE_BASELINE } from "@/lib/d16-development-role-fixtures";
import { selectD16PreparationAnchors, D16_SELECTOR_MODEL, type D16AnchorSelectorInput } from "@/lib/d16-preparation-anchor-selector";
import { buildD16DependencySnapshot, buildD16Strategy, buildD16PreparationActions, validateD16PreparationActions, reportD16PreparationCoverage, type D16Inputs, type D16PreparationInputs } from "@/lib/d16-personalized-interview-strategy";
import type { EvidenceLedger } from "@/lib/canonical-evidence-model";
import type { D15BVerifiedThread } from "@/lib/d15-semantic-thread-engine";
import type { SessionRecord } from "@/types";
const fullRun = process.env.D16_VALIDATION_MODE === "FOUR_CASE_OWNER_AUTHORIZED";
const authorizationRef = process.env.D16_OWNER_AUTHORIZATION_REF?.trim() || null;
if (fullRun && !authorizationRef) throw Error("A four-case validation requires an explicit owner authorization reference before any model call.");
if (fullRun && process.env.D16_DAVID_ONLY === "1") throw Error("Conflicting D16 validation modes.");
const davidOnly = !fullRun;
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
const baseBytes=await readFile("tests/fixtures/d16-assembled-gold-inputs.json","utf8");
const loopBytes=await readFile("tests/fixtures/d16-d15-confirmed-loop.json","utf8");
const base=JSON.parse(baseBytes) as {case_inputs:Array<{candidate:string;input:D16PreparationInputs}>;upstream_run:number;upstream_report_sha256:string};
const loop=JSON.parse(loopBytes) as {cases:Array<{id:string;language:"en"|"fr";ledger:EvidenceLedger;accepted_relationships:D15BVerifiedThread[]}>;upstream_run:number;upstream_report_sha256:string};
const report:{mode:string;status:string;provenance:Record<string,unknown>;cases:Record<string,unknown>[]}={mode:"D16_AUTOMATIC_SELECTION_DEVELOPMENT_NOT_QUALIFICATION",status:"RUNNING",provenance:{saved_canonical_source_sha256:hash(baseBytes),saved_d15_loop_source_sha256:hash(loopBytes),upstream_runs:[base.upstream_run,loop.upstream_run],upstream_report_hashes:[base.upstream_report_sha256,loop.upstream_report_sha256],fresh_E1:false,fresh_D15_judges:false,model_selector:D16_SELECTOR_MODEL,support_judge_model:AI_MODEL,role_baseline:"ADMIN_CURATED_D16_SALES_ROLE_V1",candidate_answers:"SIMULATED_PREVIOUS_RUN",no_JD_cases:["DAVID_EN_NO_JD_MULTI_ROLE","DAVID_FR_NO_JD_MULTI_ROLE"],expected_model_calls:{capability:2,support_schema_capability:2,canonical_support:2,automatic_selector:davidOnly?2:4},failed_cases_only:davidOnly,preserved_successful_run:davidOnly?37040330015:null,cutover:false,database_reads:false,database_writes:false,repeat_successful_model_outputs:fullRun,repeat_within_run:false,owner_authorization_ref:authorizationRef,locked_boundary_dependency:"PR69_UNMERGED_DEVELOPMENT_ONLY"},cases:[]};
const save=()=>writeFile("d16-automatic-development-report.json",JSON.stringify(report,null,2));
await save();
try {
 const capabilities=[await runD15ModelPreflight(D16_SELECTOR_MODEL),await runD15ModelPreflight(AI_MODEL)];
 report.provenance.capabilities=capabilities;
 await appendFile("provenance.txt",`selector_model=${D16_SELECTOR_MODEL}\nsupport_judge_model=${AI_MODEL}\ncapabilities=${JSON.stringify(capabilities)}\n`);
 const schemaCapabilities: Array<Record<string,unknown>>=[];
 report.provenance.support_schema_capabilities=schemaCapabilities;
 for(const c of loop.cases){
  const schema=buildSupportJudgeSchema(attachD16DevelopmentRole(c.ledger,c.language));
  const record:Record<string,unknown>={language:c.language,schema_sha256:hash(JSON.stringify(schema)),status:"RUNNING"};
  schemaCapabilities.push(record);await save();
  const response=await getOpenAI().chat.completions.create({model:AI_MODEL,temperature:0,
   response_format:{type:"json_schema",json_schema:{name:"canonical_support_judgments",strict:true,schema}},
   messages:[{role:"system",content:'Schema compatibility check only. Return exactly {"judgments":[]} without assessing evidence.'}]});
  record.resolved_model=response.model;
  const content=response.choices[0]?.message?.content;
  if(!content || JSON.stringify(JSON.parse(content))!==JSON.stringify({judgments:[]}))throw Error("Support schema compatibility probe returned an unexpected response.");
  record.status="PASS";await save();
 }
 const inputs:Array<{id:string;make:()=>Promise<D16AnchorSelectorInput>}>=(davidOnly?[]:base.case_inputs).map(c=>({id:c.candidate+"_AUTO_STANDARDS",make:async()=>({canonical:c.input.canonical,language:c.input.language,accepted_relationships:[]})}));
 for(const c of loop.cases)inputs.push({id:"DAVID_"+c.language.toUpperCase()+"_NO_JD_MULTI_ROLE",make:async()=>{
  const seeded=attachD16DevelopmentRole(c.ledger,c.language);
  const entry=report.cases.find(e=>e.id==="DAVID_"+c.language.toUpperCase()+"_NO_JD_MULTI_ROLE");
  if(entry){entry.support_judge_input=seeded;await save();}
  const judged=await judgeCanonicalSupport({id:"D16-DEVELOPMENT-"+c.id,preparation_language:c.language} as SessionRecord,seeded);
  const objectives=attachDemonstrationObjectives(judged.ledger);
  if(objectives.diagnostics.length)throw Error(objectives.diagnostics.join(" | "));
  const projected=projectD16CanonicalLedger(objectives.ledger);
  const material={ledger:projected.ledger,mirror:projected.d15,bridge:projected.d6,canonical_requirements:projected.ledger.requirements.map(r=>({id:r.id,normalized_requirement:r.normalized_requirement})),role_capability_model:{version:"rcm-v1" as const,model_id:"d16-sales-role-v1",role_family:"sales",role_title:c.language==="fr"?"Responsable commercial — rôle de développement":"Sales manager — development role",requirements:projected.ledger.requirements.map(r=>({capability_id:"CAP-"+r.id,normalized_requirement:r.normalized_requirement,baseline_criticality:D16_SALES_ROLE_BASELINE.find(b=>b.id===r.id)!.criticality,canonical_requirement_id:r.id,source:{source_type:"ADMIN_CURATED" as const,source_id:"d16-sales-role-v1",source_version:"1"}}))},jd_present:false,jd_fingerprint:null};
  const canonical:D16Inputs={...material,dependency_snapshot:buildD16DependencySnapshot(material)};
  return {canonical,language:c.language,accepted_relationships:c.accepted_relationships};
 }});
 for(const c of inputs){
  const entry:Record<string,unknown>={id:c.id,status:"RUNNING"};report.cases.push(entry);await save();
  try {
   const input=await c.make();entry.jd_present=input.canonical.jd_present;entry.selector_input=input;entry.strategy=buildD16Strategy(input.canonical);await save();
   const selected=await selectD16PreparationAnchors(input);entry.selection_record=selected.record;entry.preparation_input=selected.preparation;await save();
   const actions=buildD16PreparationActions(selected.preparation),validation=validateD16PreparationActions(actions,selected.preparation);
   if(!validation.valid)throw Error(validation.errors.join(" | "));
   entry.actions=actions;entry.validation=validation;entry.coverage=reportD16PreparationCoverage(actions);entry.status="COMPLETED_PENDING_CONTENT_REVIEW";
   entry.structural_checks={no_requirement_upgrade:actions.every(a=>a.canonical_status===input.canonical.bridge.requirements.find(r=>r.requirement_id===a.requirement_id)!.status),maximum_three_tensions:(entry.strategy as {tensions:unknown[]}).tensions.length<=3};
   console.log(`CASE ${c.id}: tensions=${(entry.strategy as {tensions:unknown[]}).tensions.length} actions=${actions.length} anchors=${actions.reduce((n,a)=>n+a.preparation_anchor_refs.length,0)} d15_refs=${actions.reduce((n,a)=>n+a.d15_thread_refs.length,0)} proof_refs=${actions.reduce((n,a)=>n+a.requirement_proof_refs.length,0)}`);
   console.log("SELECTION "+JSON.stringify(selected.record.decisions));
   for(const a of actions)console.log(`${c.id} ${a.dispatcher} ${a.requirement_id}: ${a.instruction}`);
  }catch(e){entry.status="ERROR";entry.error=e instanceof Error?e.message:String(e);if(e&&typeof e==="object"&&"diagnostic" in e)entry.selection_error_diagnostic=e.diagnostic;console.log(`CASE ${c.id}: ERROR ${entry.error}`);}
  await save();
 }
 report.status=report.cases.every(c=>c.status==="COMPLETED_PENDING_CONTENT_REVIEW")?"COMPLETED_PENDING_CONTENT_REVIEW":"COMPLETED_WITH_ERRORS";
}catch(e){report.status="ABORTED";report.provenance.error=e instanceof Error?e.message:String(e);}
await save();console.log("RUN "+report.status);
if(report.status!=="COMPLETED_PENDING_CONTENT_REVIEW")process.exitCode=1;
