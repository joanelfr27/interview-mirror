import {writeFile,appendFile} from 'node:fs/promises';
import {AI_MODEL} from '@/lib/openai';
import {D15_STRONGER_MODEL} from '@/lib/d15-semantic-reading';
import {runD15ModelPreflight} from '@/lib/d15-model-preflight';
import {buildD15BGoldLedger,d15BGoldFixtures} from '@/lib/d15-gold-gate';
import {judgeD15GS,openRelationshipQuestion} from '@/lib/d15-gs-judges';
import {applyD15ClarificationAnswer} from '@/lib/d15-conversational-mirror';
const ledger=buildD15BGoldLedger(d15BGoldFixtures().find(f=>f.id==='DAVID')!);
const headline='You use your monthly sales forecasts as an input to the structured pipeline review.';
const answer='I used my monthly sales forecasts as an input to the structured pipeline review. I presented the forecast assumptions in that review and discussed the variances with the sales team.';
const report:Record<string,unknown>={mode:'DEVELOPMENT_ONLY_SIMULATED_ANSWER_NOT_QUALIFICATION',status:'RUNNING',headline,simulated_answer:answer,cutover:false,database_writes:false};
const save=()=>writeFile('d15-conversation-loop-report.json',JSON.stringify(report,null,2));
await save();
try{
 report.capability=await runD15ModelPreflight(D15_STRONGER_MODEL);
 await appendFile('provenance.txt',`\nG_S_model=${D15_STRONGER_MODEL}\nreading_model=${D15_STRONGER_MODEL}\nE1_answer_extractor_model=${AI_MODEL}\ninput=DISCLOSED_SIMULATED_CANDIDATE_ANSWER\n`);
 const before=await judgeD15GS(ledger,['E2','E4'],headline);report.before=before;await save();
 const question=openRelationshipQuestion(ledger,['E2','E4'],before,'en');report.question=question;await save();
 if(before.G.supported||!before.S.supported||!question) throw new Error('CV-only hypothesis did not reach the intended question cell');
 console.log(`QUESTION ${question}`);
 const loop=await applyD15ClarificationAnswer(ledger,{id:'SIMULATED-DAVID-LOOP-1',question,answer});report.loop=loop;await save();
 const elicitedIds=new Set(loop.extraction.evidence.map(a=>a.id));
 const accepted=loop.mirror?.accepted.filter(t=>t.gs_decision?.accepted&&t.evidence_ids.some(id=>elicitedIds.has(id)))??[];
 report.accepted_threads_using_elicited_evidence=accepted;
 report.status=accepted.length?'PASS_DEVELOPMENT_LOOP':'FAIL_DEVELOPMENT_LOOP';
 console.log(`LOOP ${report.status}: extracted=${elicitedIds.size} rejected_atoms=${loop.extraction.rejected.length} accepted_anchored_threads=${accepted.length}`);
 if(!accepted.length) process.exitCode=1;
}catch(error){report.status='ERROR';report.error=error instanceof Error?error.message:String(error);process.exitCode=1;console.log(`LOOP ERROR ${report.error}`);}
await save();
