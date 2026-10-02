import {writeFile,appendFile} from 'node:fs/promises';
import {AI_MODEL} from '@/lib/openai';
import {D15_STRONGER_MODEL} from '@/lib/d15-semantic-reading';
import {runD15ModelPreflight} from '@/lib/d15-model-preflight';
import {buildD15BGoldLedger,d15BGoldFixtures} from '@/lib/d15-gold-gate';
import {judgeD15GS,openRelationshipQuestion} from '@/lib/d15-gs-judges';
import {applyD15ClarificationAnswer} from '@/lib/d15-conversational-mirror';
const ledger=buildD15BGoldLedger(d15BGoldFixtures().find(f=>f.id==='DAVID')!);
const headline='You use your monthly sales forecasts as an input to the structured pipeline review.';
const cases=[
 {id:'COOPERATIVE',answer:'I used my monthly sales forecasts as an input to the structured pipeline review. I presented the forecast assumptions in that review and discussed the variances with the sales team.',expect:'ACCEPT'},
 {id:'DENIAL',answer:"No, they weren't connected",expect:'DENIED'},
 {id:'PARTIAL',answer:'Sometimes, informally',expect:'NEEDS_MORE_DETAIL'},
];
const report:Record<string,unknown>={mode:'DEVELOPMENT_ONLY_SIMULATED_ANSWERS_NOT_QUALIFICATION',status:'RUNNING',headline,cases:[],cutover:false,database_writes:false};
const save=()=>writeFile('d15-conversation-loop-report.json',JSON.stringify(report,null,2));
await save();
try{
 report.capability=await runD15ModelPreflight(D15_STRONGER_MODEL);
 await appendFile('provenance.txt',`\nG_S_model=${D15_STRONGER_MODEL}\nreading_model=${D15_STRONGER_MODEL}\nE1_answer_extractor_model=${AI_MODEL}\ninput=THREE_DISCLOSED_SIMULATED_ANSWERS\n`);
 const before=await judgeD15GS(ledger,['E2','E4'],headline);report.before=before;await save();
 const question=openRelationshipQuestion(ledger,['E2','E4'],before,'en');report.question=question;await save();
 if(before.G.supported||!before.S.supported||!question) throw new Error('CV-only hypothesis did not reach the intended question cell');
 console.log(`QUESTION ${question}`);
 const results=[];
 for(const scenario of cases){
  const loop=await applyD15ClarificationAnswer(ledger,{id:'SIMULATED-DAVID-'+scenario.id,answer:scenario.answer,target:{proposal_id:'DAVID-FORECAST-REVIEW',question,evidence_ids:['E2','E4'],gs_decision:before}});
  const accepted=loop.mirror.accepted;
  const exact=accepted.every(t=>t.headline===headline&&t.gs_decision?.asserted_proposition===before.asserted_proposition);
  const pass=scenario.expect==='ACCEPT'?accepted.length===1&&exact:accepted.length===0&&loop.status===scenario.expect&&!loop.repeat_question;
  results.push({...scenario,pass,loop});report.cases=results;await save();
  console.log(`CASE ${scenario.id}: pass=${pass} status=${loop.status} extracted=${loop.extraction.evidence.length} accepted=${accepted.length} exact_proposition=${exact} repeat_question=${loop.repeat_question}`);
 }
 report.status=results.every(c=>c.pass)?'PASS_DEVELOPMENT_LOOP':'FAIL_DEVELOPMENT_LOOP';
 console.log(`LOOP ${report.status}: cases=${results.length}/3`);
 if(report.status!=='PASS_DEVELOPMENT_LOOP') process.exitCode=1;
}catch(error){report.status='ERROR';report.error=error instanceof Error?error.message:String(error);process.exitCode=1;console.log(`LOOP ERROR ${report.error}`);}
await save();
