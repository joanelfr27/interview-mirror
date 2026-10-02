import {appendFile,writeFile} from 'node:fs/promises';
import {AI_MODEL} from '@/lib/openai';
import {runD15ModelPreflight} from '@/lib/d15-model-preflight';
import {D15_STRONGER_MODEL,fixD15Proposition} from '@/lib/d15-semantic-reading';
import {d15BGoldFixtures,buildD15BGoldLedger} from '@/lib/d15-gold-gate';
import {runD15BSemanticThreadEngine} from '@/lib/d15-semantic-thread-engine';
import {judgeD15GS,clarificationQuestion} from '@/lib/d15-gs-judges';
import {ENUMERATION_DEVELOPMENT_CONTROLS,POSITIVE_DEVELOPMENT_CONTROLS,DEVELOPMENT_EXPECTATIONS,scoreDevelopmentControl,assessDevelopmentEngine} from '@/lib/d15-v11-development-scorer';
const fixtures=d15BGoldFixtures();
const controls=[
 ...POSITIVE_DEVELOPMENT_CONTROLS.map(control=>({id:control.id,expected:control,synthetic:true,label_use:'DEVELOPMENT_DIAGNOSTIC',ledger:buildD15BGoldLedger({...fixtures.find(f=>f.language===control.language)!,lines:[...control.lines]}),ids:control.lines.map((_,i)=>`E${i+1}`),language:control.language})),
 ...[...DEVELOPMENT_EXPECTATIONS.controls,...ENUMERATION_DEVELOPMENT_CONTROLS].map((control,i)=>({id:`${control.fixture}_${i+1}`,expected:control,synthetic:false,label_use:i<4&&control.fixture!=='DAVID'?'CALIBRATION_AFTER_LABEL_REVISION':'DEVELOPMENT_DIAGNOSTIC',ledger:buildD15BGoldLedger(fixtures.find(f=>f.id===control.fixture)!),ids:[...control.ids],language:fixtures.find(f=>f.id===control.fixture)!.language})),
];
const report={mode:'DEVELOPMENT_ONLY_NOT_QUALIFICATION',completion_status:'RUNNING',codebook_blob:DEVELOPMENT_EXPECTATIONS.codebook_blob,label_revision:DEVELOPMENT_EXPECTATIONS.label_revision,judge_model:D15_STRONGER_MODEL,planned:{controls:controls.length,positive_controls:POSITIVE_DEVELOPMENT_CONTROLS.length,cvs:fixtures.length},capabilities:[] as unknown[],controls:controls.map(({ledger,ids,language,...entry})=>({...entry,status:'PENDING',shared_reading:null as unknown,actual:null as unknown,comparison:null as unknown,question:null as string|null,error:null as string|null})),cvs:fixtures.map(f=>({fixture:f.id,status:'PENDING',result:null as unknown,assessment:null as unknown,error:null as string|null}))};
const save=()=>writeFile('d15-v11-development-report.json',JSON.stringify(report,null,2));
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
await save();
await appendFile('provenance.txt',`\nproposer_model=${AI_MODEL}\nproposition_model=${D15_STRONGER_MODEL}\nG_S_model=${D15_STRONGER_MODEL}\nmode=DEVELOPMENT_COMPLETION_AND_READING_DIAGNOSTIC_NOT_NEW_MODEL_COMPARISON\nrate_pacing=24000_estimated_tokens_per_61_seconds; retries_only_rejected_429; no_resampling_successful_outputs\n`);
try{
 const capability=await runD15ModelPreflight(D15_STRONGER_MODEL);report.capabilities.push(capability);
 await appendFile('provenance.txt',`capability_gate=${JSON.stringify(capability)}\n`);console.log(`CAPABILITY ${JSON.stringify(capability)}`);await save();
 for(let i=0;i<controls.length;i++){
  const control=controls[i]!;const entry=report.controls[i]!;entry.status='RUNNING';await save();
  try{
   const reading=await fixD15Proposition(control.expected.headline);entry.shared_reading=reading;await save();
   const actual=await judgeD15GS(control.ledger,control.ids,control.expected.headline,{model:D15_STRONGER_MODEL,reading});
   entry.actual=actual;entry.comparison=scoreDevelopmentControl(control.expected,actual);entry.question=clarificationQuestion(actual,control.language);entry.status='COMPLETED';
   console.log(`CONTROL ${entry.id}: G=${actual.G.supported} S=${actual.S.supported} accepted=${actual.accepted} vetoes=${actual.vetoes.join(',')} validation_error=${actual.G.connector==='INVALID'}`);
  }catch(error){entry.status='ERROR';entry.error=errorText(error);console.log(`CONTROL ${entry.id}: ERROR ${entry.error}`);}
  await save();
 }
 for(let i=0;i<fixtures.length;i++){
  const fixture=fixtures[i]!;const entry=report.cvs[i]!;entry.status='RUNNING';await save();
  try{
   const result=await runD15BSemanticThreadEngine(buildD15BGoldLedger(fixture));entry.result=result;entry.assessment=assessDevelopmentEngine(result);entry.status=result.completion_state==='ERROR'?'ERROR':'COMPLETED';
   console.log(`CV ${fixture.id}: accepted=${result.accepted.length} rejected=${result.rejected.length} questions=${result.clarification_questions?.length??0} state=${result.completion_state}`);
  }catch(error){entry.status='ERROR';entry.error=errorText(error);console.log(`CV ${fixture.id}: ERROR ${entry.error}`);}
  await save();
 }
 report.completion_status=[...report.controls,...report.cvs].every(e=>e.status==='COMPLETED')?'COMPLETED':'COMPLETED_WITH_ERRORS';
}catch(error){report.completion_status='ABORTED';console.log(`RUN ABORTED ${errorText(error)}`);}
await save();
console.log(`RUN ${report.completion_status}: controls=${report.controls.filter(e=>e.status==='COMPLETED').length}/${controls.length}; cvs=${report.cvs.filter(e=>e.status==='COMPLETED').length}/${fixtures.length}`);
if(report.completion_status!=='COMPLETED') process.exitCode=1;
