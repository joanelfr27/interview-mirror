import {appendFile,writeFile} from 'node:fs/promises';
import {AI_MODEL} from '@/lib/openai';
import {runD15ModelPreflight} from '@/lib/d15-model-preflight';
import {D15_COMPARISON_MODELS,D15_STRONGER_MODEL,fixD15Proposition} from '@/lib/d15-semantic-reading';
import {d15BGoldFixtures,buildD15BGoldLedger} from '@/lib/d15-gold-gate';
import {runD15BSemanticThreadEngine} from '@/lib/d15-semantic-thread-engine';
import {judgeD15GS,clarificationQuestion} from '@/lib/d15-gs-judges';
import {ENUMERATION_DEVELOPMENT_CONTROLS,POSITIVE_DEVELOPMENT_CONTROLS,DEVELOPMENT_EXPECTATIONS,scoreDevelopmentControl,assessDevelopmentEngine} from '@/lib/d15-v11-development-scorer';
await appendFile('provenance.txt',`\nproposer_model=${AI_MODEL}\nproposition_model=${D15_STRONGER_MODEL}\nengine_G_S_model=${D15_STRONGER_MODEL}\ncomparison_models=${JSON.stringify(D15_COMPARISON_MODELS)}\ncomparison=DEVELOPMENT_ONLY_PAIRED_FIXED_READING_ONE_CALL_PER_AXIS_MODEL\n`);
const capabilities=[];
for(const model of D15_COMPARISON_MODELS){
 const capability=await runD15ModelPreflight(model);capabilities.push(capability);
 await appendFile('provenance.txt',`capability_gate=${JSON.stringify(capability)}\n`);
 console.log(`CAPABILITY ${JSON.stringify(capability)}`);
}
const report={mode:'DEVELOPMENT_ONLY_NOT_QUALIFICATION',codebook_blob:DEVELOPMENT_EXPECTATIONS.codebook_blob,label_revision:DEVELOPMENT_EXPECTATIONS.label_revision,capabilities,controls:[] as unknown[],cvs:[] as unknown[]};
const save=()=>writeFile('d15-v11-development-report.json',JSON.stringify(report,null,2));
async function compare(control:{headline:string;G:boolean;S:boolean},ledger:ReturnType<typeof buildD15BGoldLedger>,ids:string[],id:string,language:'en'|'fr',synthetic=false){
 const reading=await fixD15Proposition(control.headline);
 const entry={id,expected:control,synthetic,shared_reading:reading,models:[] as unknown[]};
 report.controls.push(entry);await save();
 for(const model of D15_COMPARISON_MODELS){
  const actual=await judgeD15GS(ledger,ids,control.headline,{model,reading});
  const question=clarificationQuestion(actual,language);
  console.log(`CONTROL ${id} model=${model}: G=${actual.G.supported} S=${actual.S.supported} accepted=${actual.accepted} question=${Boolean(question)} vetoes=${actual.vetoes.join(',')}`);
  entry.models.push({model,actual,question,comparison:scoreDevelopmentControl(control,actual)});await save();
 }
}
let index=0;
for(const control of [...DEVELOPMENT_EXPECTATIONS.controls,...ENUMERATION_DEVELOPMENT_CONTROLS]){
 const fixture=d15BGoldFixtures().find(f=>f.id===control.fixture)!;
 await compare(control,buildD15BGoldLedger(fixture),[...control.ids],`${control.fixture}_${++index}`,fixture.language);
}
for(const control of POSITIVE_DEVELOPMENT_CONTROLS){
 const base=d15BGoldFixtures().find(f=>f.language===control.language)!;
 await compare(control,buildD15BGoldLedger({...base,lines:[...control.lines]}),['E1','E2'],control.id,control.language,true);
}
for(const fixture of d15BGoldFixtures()){
 const result=await runD15BSemanticThreadEngine(buildD15BGoldLedger(fixture));
 console.log(`CV ${fixture.id}: accepted=${result.accepted.length} rejected=${result.rejected.length} questions=${result.clarification_questions?.length??0} state=${result.completion_state}`);
 report.cvs.push({fixture:fixture.id,judge_model:D15_STRONGER_MODEL,result,assessment:assessDevelopmentEngine(result)});await save();
}
