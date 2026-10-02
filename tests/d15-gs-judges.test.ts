import test from 'node:test';
import assert from 'node:assert/strict';
import {validateG,validateS,combineGS,relationshipVetoes,evaluateGSCalls,clarificationQuestion} from '../src/lib/d15-gs-judges.ts';
import {buildD15BGoldLedger,d15BGoldFixtures} from '../src/lib/d15-gold-gate.ts';
import {d16EvidenceCoverage} from '../src/lib/d16-evidence-coverage.ts';
const atoms=[{evidence_id:'1',source_text:'Based on the review, revised the intake checklist.'}];
const G={supported:true,connector:'response',minimal_atom_subset:['1'],licensing_spans:[{evidence_id:'1',text:'Based on the review'}],reason:'explicit response'};
const S={supported:true,relationship_type:'MECHANISM' as const,reason:'review changes a process'};
test('G YES rejects missing, forged and uncited licenses',()=>{
 assert.equal(validateG({...G,licensing_spans:[]},atoms).supported,false);
 assert.equal(validateG({...G,licensing_spans:[{evidence_id:'1',text:'reduced errors'}]},atoms).supported,false);
 assert.equal(validateG({...G,minimal_atom_subset:['2']},atoms).supported,false);
 assert.equal(validateG(G,atoms).supported,true);
});
test('four cells require independent YES on both axes',()=>{
 for(const g of [false,true]) for(const s of [false,true]) assert.equal(combineGS('claim',{...G,supported:g},{...S,supported:s,relationship_type:s?'MECHANISM':'NONE'},[]).accepted,g&&s);
 assert.equal(combineGS('claim',G,S,['VETO']).accepted,false);
});
test('S rejects inconsistent type and missing rationale',()=>{
 assert.equal(validateS({...S,relationship_type:'NONE'}).supported,false);
 assert.equal(validateS({...S,reason:''}).supported,false);
});
test('unsupported cadence veto never grants acceptance',()=>{
 const ledger=buildD15BGoldLedger(d15BGoldFixtures().find(f=>f.id==='DAVID')!);
 assert.ok(relationshipVetoes(ledger,['E4'],'You create a rhythm for the team.').includes('RECURRENCE_WITHOUT_EXPLICIT_CADENCE'));
 assert.equal(combineGS('claim',{...G,supported:false},S,[]).accepted,false);
});
test('zero evidence denominator is not evaluated; mixed coverage counts only required actions',()=>{
 assert.deepEqual(d16EvidenceCoverage([{evidence_reference_mode:'NO_CANDIDATE_EVIDENCE',evidence_ids:[]}]),{total_actions:1,evidence_required_actions:0,evidence_linked_required_actions:0,evidence_exempt_actions:1,coverage_rate:null,status:'NOT_EVALUATED'});
 assert.equal(d16EvidenceCoverage([{evidence_reference_mode:'REQUIRED',evidence_ids:[]}]).status,'FAIL');
});

test('S is called and retained independently when G is NO',async()=>{
 let gCalls=0,sCalls=0;
 const result=await evaluateGSCalls('headline',atoms,async()=>{gCalls++;return {...G,supported:false,licensing_spans:[]};},async()=>{sCalls++;return S;},[]);
 assert.equal(gCalls,1);assert.equal(sCalls,1);assert.equal(result.G.supported,false);assert.equal(result.S.supported,true);assert.equal(result.accepted,false);
});

test('chronology alone cannot license a stronger cause even if G says YES',()=>{
 const g={...G,connector:'causal response',licensing_spans:[{evidence_id:'1',text:'After that review'}]};
 assert.equal(combineGS('claim',g,S,[]).accepted,false);
});

 test('Thomas training assistance cannot become facilitation even if both judges say YES',()=>{
 const ledger=buildD15BGoldLedger(d15BGoldFixtures().find(f=>f.id==='THOMAS')!);
 const vetoes=relationshipVetoes(ledger,['E4','E5','E7'],'You engage users by supporting rollouts and facilitating training.');
 assert.ok(vetoes.includes('TRAINING_OWNERSHIP_UPGRADE'));
 assert.equal(combineGS('claim',G,S,vetoes).accepted,false);
 assert.ok(!relationshipVetoes(ledger,['E4','E5','E7'],'You assist with training sessions.').includes('TRAINING_OWNERSHIP_UPGRADE'));
 });
 test('one fixed proposition survives both verdicts and becomes a question only in the eligible cell',async()=>{
 const proposition='Your forecasts feed the pipeline reviews.';
 const result=await evaluateGSCalls('headline',atoms,async()=>({...G,supported:false,licensing_spans:[]}),async()=>S,[],proposition);
 assert.equal(result.asserted_proposition,proposition);
 assert.ok(clarificationQuestion(result,'en')?.includes(proposition));
 assert.equal(clarificationQuestion({...result,G},'en'),null);
 assert.equal(clarificationQuestion({...result,vetoes:['OWNERSHIP_UPGRADE']},'en'),null);
 assert.equal(clarificationQuestion({...result,S:{...S,supported:false,relationship_type:'NONE'}},'en'),null);
 });

 test('model capability gate rejects unresolved models and invalid strict-schema payloads',async()=>{
 const {validateD15ModelPreflight}=await import('../src/lib/d15-model-preflight.ts');
 assert.throws(()=>validateD15ModelPreflight({model:'unknown',choices:[{message:{content:'{"ready":true}'}}]}));
 assert.throws(()=>validateD15ModelPreflight({model:'gpt-4o-mini-2024-07-18',choices:[{message:{content:'{"ready":false}'}}]}));
 assert.equal(validateD15ModelPreflight({model:'gpt-4o-mini-2024-07-18',choices:[{message:{content:'{"ready":true}'}}]}).status,'PASS');
 });

test('enumeration reading cannot invent a relationship or route a raw S YES into a question',async()=>{
 const {validateSemanticReading,readingVetoes}=await import('../src/lib/d15-semantic-reading.ts');
 const reading=validateSemanticReading({language:'en',actor:'CANDIDATE',asserted_proposition:'The candidate prepares forecasts and conducts reviews; no interaction is asserted.',component_claims:['prepares forecasts','conducts reviews'],form:'ENUMERATION',relationship_assertion:null,reading_reason:'Two activities joined by and.'});
 assert.throws(()=>validateSemanticReading({...reading,relationship_assertion:'Forecasts feed reviews.'}));
 const decision=combineGS('claim',{...G,supported:false,licensing_spans:[]},S,readingVetoes(reading),reading.asserted_proposition);
 assert.equal(decision.S.supported,true); // Preserve the raw error, do not hide it.
 assert.equal(decision.accepted,false);assert.equal(clarificationQuestion(decision,'en'),null);
});
test('packaging remains insignificant despite a strong generic connection reading',async()=>{
 const {readingVetoes}=await import('../src/lib/d15-semantic-reading.ts');
 const veto=readingVetoes({language:'en',actor:'CANDIDATE',asserted_proposition:'Two domains are connected.',component_claims:['financial systems','business change'],form:'PACKAGING',relationship_assertion:'Two domains are connected.',reading_reason:'No substantive flow is asserted.'});
 assert.equal(combineGS('claim',G,S,veto).accepted,false);
});
test('a substantive ungrounded relationship asks about the missing link rather than a list',()=>{
 const decision={...combineGS('headline',{...G,supported:false,licensing_spans:[]},S,[]),semantic_reading:{language:'en' as const,actor:'CANDIDATE' as const,asserted_proposition:'Forecasts feed reviews.',component_claims:['prepares forecasts','conducts reviews'],form:'RELATIONSHIP' as const,relationship_assertion:'Your forecasts feed the pipeline review.',reading_reason:'Information flow is asserted.'}};
 assert.ok(clarificationQuestion(decision,'en')?.includes('Your forecasts feed the pipeline review.'));
});

test('reading validation preserves active candidate agency and source language',async()=>{
 const {validateSemanticReading}=await import('../src/lib/d15-semantic-reading.ts');
 const reading={language:'en',actor:'CANDIDATE',asserted_proposition:'You align forecasts with reviews to create a team rhythm.',component_claims:['You align forecasts with reviews.','You create a team rhythm through that alignment.'],form:'RELATIONSHIP',relationship_assertion:'You use that alignment to create a rhythm.',reading_reason:'Explicit candidate mechanism.'};
 assert.doesNotThrow(()=>validateSemanticReading(reading,'You create a rhythm for the sales team by aligning forecasts with structured reviews.'));
 assert.throws(()=>validateSemanticReading({...reading,asserted_proposition:'A rhythm is created through alignment.'},'You create a rhythm.'));
 assert.throws(()=>validateSemanticReading(reading,'Vous créez un rythme.'));
 const fr={...reading,language:'fr',asserted_proposition:'Vous reliez l’analyse des problèmes et la réorganisation.',component_claims:['Vous analysez les problèmes.','Vous participez à la réorganisation.'],form:'PACKAGING',relationship_assertion:'Vous reliez ces deux domaines.'};
 assert.doesNotThrow(()=>validateSemanticReading(fr,'Vous travaillez à l’intersection de l’analyse et de la réorganisation.'));
 assert.throws(()=>validateSemanticReading({...fr,relationship_assertion:'Vous work with the analysis.'},'Vous travaillez à l’intersection de l’analyse et de la réorganisation.'));
});
test('intersection reading retains an asserted connection without adding a mechanism',async()=>{
 const {validateSemanticReading}=await import('../src/lib/d15-semantic-reading.ts');
 const reading={language:'en',actor:'CANDIDATE',asserted_proposition:'You connect financial-systems work and business-change work.',component_claims:['You work in financial systems.','You work in business changes.'],form:'PACKAGING',relationship_assertion:'You connect these domains without a specified mechanism.',reading_reason:'Generic connection, not just dual membership.'};
 assert.doesNotThrow(()=>validateSemanticReading(reading,'You work at the intersection of financial systems and business changes.'));
 assert.throws(()=>validateSemanticReading({...reading,relationship_assertion:'You work in both domains; no interaction is asserted.'},'You work at the intersection of financial systems and business changes.'));
});
test('invalid judge shapes are retained as raw replies rather than scored as semantic NO',async()=>{
 const {scoreDevelopmentControl}=await import('../src/lib/d15-v11-development-scorer.ts');
 const bad={supported:true,connector:'',minimal_atom_subset:[],licensing_spans:[],reason:'enumerated activities'};
 const result=await evaluateGSCalls('headline',atoms,async()=>bad,async()=>S,[]);
 assert.deepEqual(result.raw_G,bad);
 assert.equal(scoreDevelopmentControl({G:false,S:true},result).G_matches,null);
});
test('rate handling retries token rate limits but never quota errors',async()=>{
 const {retryableD15RateLimit}=await import('../src/lib/d15-diagnostic-request.ts');
 assert.equal(retryableD15RateLimit({status:429,code:'rate_limit_exceeded'}),true);
 assert.equal(retryableD15RateLimit({status:429,code:'insufficient_quota'}),false);
});
