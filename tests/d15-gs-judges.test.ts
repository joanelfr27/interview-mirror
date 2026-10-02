import test from 'node:test';
import assert from 'node:assert/strict';
import {validateG,validateS,combineGS,relationshipVetoes,evaluateGSCalls} from '../src/lib/d15-gs-judges.ts';
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
