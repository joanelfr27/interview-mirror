import {writeFile,appendFile} from 'node:fs/promises';
import {AI_MODEL} from '@/lib/openai';
import {D15_STRONGER_MODEL} from '@/lib/d15-semantic-reading';
import {runD15ModelPreflight} from '@/lib/d15-model-preflight';
import {buildD15BGoldLedger,d15BGoldFixtures} from '@/lib/d15-gold-gate';
import {judgeD15GS,openRelationshipQuestion} from '@/lib/d15-gs-judges';
import {applyD15ClarificationAnswer} from '@/lib/d15-conversational-mirror';
import {deniedClarification} from '@/lib/d15-clarification-state';
const ledger=buildD15BGoldLedger(d15BGoldFixtures().find(f=>f.id==='DAVID')!);
const headline='You use your monthly sales forecasts as an input to the structured pipeline review.';
const frenchLedger=structuredClone(ledger);
const translations=[
 {id:'E2',span:'S2',quote:'Préparé les prévisions de ventes mensuelles et examiné les écarts avec l’équipe commerciale.',action:'Préparé',object:'les prévisions de ventes mensuelles'},
 {id:'E4',span:'S4',quote:'Introduit une revue structurée du pipeline commercial pour l’équipe commerciale.',action:'Introduit',object:'une revue structurée du pipeline commercial'},
];
for(const item of translations){
 const span=frenchLedger.source_spans.find(s=>s.id===item.span)!;span.text=item.quote;span.end_offset=span.start_offset+item.quote.length;span.language='fr';
 const atom=frenchLedger.evidence.find(a=>a.id===item.id)!;atom.action={normalized_action:item.action,object:item.object};atom.provenance.language='fr';
}
const frenchHeadline='Vous utilisez vos prévisions de ventes mensuelles comme une donnée d’entrée de la revue structurée du pipeline commercial.';
const cases=[
 {id:'COOPERATIVE',language:'en' as const,answer:'I used my monthly sales forecasts as an input to the structured pipeline review. I presented the forecast assumptions in that review and discussed the variances with the sales team.',expect:'ACCEPT'},
 {id:'DENIAL',language:'en' as const,answer:"No, they weren't connected",expect:'DENIED'},
 {id:'PARTIAL',language:'en' as const,answer:'Sometimes, informally',expect:'NEEDS_MORE_DETAIL'},
 {id:'FRENCH',language:'fr' as const,answer:'J’ai utilisé mes prévisions de ventes mensuelles comme une donnée d’entrée de la revue structurée du pipeline commercial. J’ai présenté les hypothèses dans cette revue et discuté des écarts avec l’équipe commerciale.',expect:'ACCEPT'},
 {id:'OTHER_ACTOR',language:'en' as const,answer:'My manager used my monthly sales forecasts as an input to the structured pipeline review. I only sent the forecasts to my manager.',expect:'REJECT'},
];
const report:Record<string,unknown>={mode:'DEVELOPMENT_ONLY_SIMULATED_ANSWERS_NOT_QUALIFICATION',status:'RUNNING',headline,french_headline:frenchHeadline,french_input:'DISCLOSED_SYNTHETIC_TRANSLATION_OF_DAVID_TWO_ANCHORS',cases:[],cutover:false,database_writes:false};
const save=()=>writeFile('d15-conversation-loop-report.json',JSON.stringify(report,null,2));
await save();
try{
 report.capability=await runD15ModelPreflight(D15_STRONGER_MODEL);
 report.extractor_capability=await runD15ModelPreflight(AI_MODEL);
 await appendFile('provenance.txt',`\nG_S_model=${D15_STRONGER_MODEL}\nreading_model=${D15_STRONGER_MODEL}\nE1_answer_extractor_model=${AI_MODEL}\nE1_resolved_probe_model=${(report.extractor_capability as {resolved_model:string}).resolved_model}\ninput=FIVE_DISCLOSED_SIMULATED_ANSWERS\n`);
 const before=await judgeD15GS(ledger,['E2','E4'],headline);report.before=before;await save();
 const frenchBefore=await judgeD15GS(frenchLedger,['E2','E4'],frenchHeadline);report.french_before=frenchBefore;await save();
 const results=[];
 for(const scenario of cases){
  const source=scenario.language==='fr'?frenchLedger:ledger;
  const prior=scenario.language==='fr'?frenchBefore:before;
  const claim=scenario.language==='fr'?frenchHeadline:headline;
  const question=openRelationshipQuestion(source,['E2','E4'],prior,scenario.language);
  if(prior.G.supported||!prior.S.supported||!question) throw new Error('CV-only hypothesis did not reach the intended question cell: '+scenario.language);
  const target={proposal_id:'DAVID-FORECAST-REVIEW',question,evidence_ids:['E2','E4'],gs_decision:prior};
  const loop=await applyD15ClarificationAnswer(source,{id:'SIMULATED-DAVID-'+scenario.id,answer:scenario.answer,target});
  const accepted=loop.mirror.accepted;
  const exact=accepted.every(t=>t.headline===claim&&t.gs_decision?.asserted_proposition===prior.asserted_proposition);
  const shared_subject=scenario.expect!=='ACCEPT'||loop.extraction.evidence.some(a=>/^(?:discussed|discuté)$/iu.test(a.action.normalized_action)&&a.subject.actor_basis==='EXPLICIT_CANDIDATE');
  const one_answer_maturity=accepted.every(t=>t.maturity==='CONFIRMED_RELATIONSHIP'&&t.relationship_support_unit_count===1);
  const restored=JSON.parse(JSON.stringify(loop.ledger));
  const denial_remembered=scenario.expect!=='DENIED'||deniedClarification(restored,['E2','E4'],prior.asserted_proposition,scenario.language);
  const retained=restored.mirror_clarifications?.[0]?.responses[0]?.answer===scenario.answer;
  const pass=retained&&denial_remembered&&(scenario.expect==='ACCEPT'?accepted.length===1&&exact&&shared_subject&&one_answer_maturity:scenario.expect==='REJECT'?accepted.length===0:accepted.length===0&&loop.status===scenario.expect&&!loop.repeat_question&&(scenario.expect!=='NEEDS_MORE_DETAIL'||Boolean(loop.follow_up&&loop.unresolved)));
  results.push({...scenario,pass,exact,shared_subject,one_answer_maturity,denial_remembered,answer_retained_after_reload:retained,loop});report.cases=results;await save();
  console.log(`CASE ${scenario.id}: pass=${pass} status=${loop.status} extracted=${loop.extraction.evidence.length} accepted=${accepted.length} shared_subject=${shared_subject} answer_retained=${retained} denial_remembered=${denial_remembered}`);
 }
 report.status=results.every(c=>c.pass)?'PASS_DEVELOPMENT_LOOP':'FAIL_DEVELOPMENT_LOOP';
 console.log(`LOOP ${report.status}: cases=${results.length}/5`);
 if(report.status!=='PASS_DEVELOPMENT_LOOP') process.exitCode=1;
}catch(error){report.status='ERROR';report.error=error instanceof Error?error.message:String(error);process.exitCode=1;console.log(`LOOP ERROR ${report.error}`);}
await save();
