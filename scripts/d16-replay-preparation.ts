import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildD16PreparationActions, validateD16PreparationActions, reportD16PreparationCoverage, type D16PreparationInputs } from '@/lib/d16-personalized-interview-strategy';
const saved = JSON.parse(await readFile('tests/fixtures/d16-assembled-gold-inputs.json','utf8')) as { upstream_run: number; upstream_engine: string; upstream_report_sha256: string; case_inputs: Array<{candidate:string;input:D16PreparationInputs}> };
const report = {mode:'OFFLINE_D16_CONTENT_REPLAY_NOT_NEW_E1_OR_D15_RUN', upstream_run:saved.upstream_run, upstream_engine:saved.upstream_engine, upstream_report_sha256:saved.upstream_report_sha256, action_source_sha256:createHash('sha256').update(await readFile('src/lib/d16-personalized-interview-strategy.ts')).digest('hex'), model_calls:0,database_writes:false, cases:saved.case_inputs.map(c=>{
 const actions=buildD16PreparationActions(c.input);
 const validation=validateD16PreparationActions(actions,c.input);
 if(!validation.valid)throw new Error(validation.errors.join(' | '));
 for(const a of actions)console.log(`${c.candidate} ${a.dispatcher}\n${a.instruction}\n`);
 return {candidate:c.candidate,actions,coverage:reportD16PreparationCoverage(actions),validation};
})};
await writeFile('d16-preparation-replay-report.json',JSON.stringify(report,null,2));
console.log('REPLAY COMPLETE: model calls = 0; action validity is separate from content review.');
