import {runD15ModelPreflight} from '@/lib/d15-model-preflight';
import {AI_MODEL} from '@/lib/openai';
import {appendFile,writeFile} from 'node:fs/promises';
import {d15BGoldFixtures,buildD15BGoldLedger} from '@/lib/d15-gold-gate';
import {runD15BSemanticThreadEngine} from '@/lib/d15-semantic-thread-engine';
import {judgeD15GS} from '@/lib/d15-gs-judges';
import {POSITIVE_DEVELOPMENT_CONTROLS,DEVELOPMENT_EXPECTATIONS,scoreDevelopmentControl,assessDevelopmentEngine} from '@/lib/d15-v11-development-scorer';
await appendFile('provenance.txt',`\nactual_model=${AI_MODEL}\nproposition_model=${AI_MODEL}\nG_model=${AI_MODEL}\nS_model=${AI_MODEL}\n`);
const capability=await runD15ModelPreflight();
await appendFile('provenance.txt',`resolved_model=${capability.resolved_model}\ncapability_gate=${JSON.stringify(capability)}\n`);
console.log(`CAPABILITY ${JSON.stringify(capability)}`);
console.log(`D15 development model=${AI_MODEL}; G/S share a fixed proposition`);
const report={mode:'DEVELOPMENT_ONLY_NOT_QUALIFICATION',codebook_blob:DEVELOPMENT_EXPECTATIONS.codebook_blob,capability,controls:[] as unknown[],cvs:[] as unknown[]};
for(const control of DEVELOPMENT_EXPECTATIONS.controls){
 const fixture=d15BGoldFixtures().find(f=>f.id===control.fixture)!;
 const actual=await judgeD15GS(buildD15BGoldLedger(fixture),[...control.ids],control.headline);
 console.log(`CONTROL ${control.fixture}: G=${actual.G.supported} S=${actual.S.supported} accepted=${actual.accepted} vetoes=${actual.vetoes.join(",")}`);
 report.controls.push({expected:control,actual,comparison:scoreDevelopmentControl(control,actual)});
 await writeFile('d15-v11-development-report.json',JSON.stringify(report,null,2));
}
for(const control of POSITIVE_DEVELOPMENT_CONTROLS){
 const base=d15BGoldFixtures().find(f=>f.language===control.language)!;
 const ledger=buildD15BGoldLedger({...base,lines:[...control.lines]});
 const actual=await judgeD15GS(ledger,['E1','E2'],control.headline);
 console.log(`CONTROL ${control.id}: G=${actual.G.supported} S=${actual.S.supported} accepted=${actual.accepted} vetoes=${actual.vetoes.join(",")}`);
 report.controls.push({expected:control,actual,comparison:scoreDevelopmentControl(control,actual),synthetic:true});
 await writeFile('d15-v11-development-report.json',JSON.stringify(report,null,2));
}
for(const fixture of d15BGoldFixtures()){
 const result=await runD15BSemanticThreadEngine(buildD15BGoldLedger(fixture));
 console.log(`CV ${fixture.id}: accepted=${result.accepted.length} rejected=${result.rejected.length} questions=${result.clarification_questions?.length??0} state=${result.completion_state}`);
 report.cvs.push({fixture:fixture.id,result,assessment:assessDevelopmentEngine(result)});
 await writeFile('d15-v11-development-report.json',JSON.stringify(report,null,2));
}
