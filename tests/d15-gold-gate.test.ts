import test from "node:test";
import assert from "node:assert/strict";
import { assessD15BGoldDeterministically, buildD15BGoldLedger, d15BGoldFixtures } from "@/lib/d15-gold-gate";
import type { D15BVerificationResult } from "@/lib/d15-semantic-thread-engine";

test("D15-B Gold fixtures are frozen as Nancy/Marie/David/Elena/Thomas",()=>{
  const fixtures=d15BGoldFixtures();
  assert.deepEqual(fixtures.map(x=>x.id),["NANCY","MARIE","DAVID","ELENA","THOMAS"]);
  assert.deepEqual(fixtures.map(x=>x.expected_thread_count),[2,2,2,0,1]);
});

test("D15-B Gold fixture ledgers contain only responsibility lines as canonical evidence",()=>{
  for(const fixture of d15BGoldFixtures()){
    const ledger=buildD15BGoldLedger(fixture);
    assert.equal(ledger.evidence.length,fixture.lines.length);
    assert.ok(ledger.evidence.every(x=>x.assertion.type==="RESPONSIBILITY"));
    assert.ok(ledger.source_spans.every(x=>x.source_section==="BULLET"));
    assert.ok(ledger.evidence.every(x=>x.provenance.source_type==="CV"));
  }
});

test("D15-B frozen human decisions are encoded without weakening",()=>{
  const [nancy,marie,,elena,thomas]=d15BGoldFixtures();
  assert.deepEqual(nancy.threads[0]?.required_sets,[["E4","E5","E6"]]);
  assert.ok(nancy.threads[0]?.prohibited_ids.includes("E1"));
  assert.deepEqual(marie.threads[0]?.required_sets,[["E5","E3"],["E5","E8"],["E5","E3","E8"]]);
  assert.equal(elena.expected_thread_count,0);
  assert.equal(thomas.threads[0]?.required_sets.length,4);
});



const proposal=(id:string,headline:string,evidence_ids:string[],question_back:string|null)=>({
  id,headline,evidence_ids,question_back,maturity:"EMERGING_PATTERN" as const,verification:"SUPPORTED" as const,
});
const result=(accepted:ReturnType<typeof proposal>[]):D15BVerificationResult=>({accepted,rejected:[]});

test("Gold v2.1 Marie E5+E3 is acceptable partial recall with neutral outcome question",()=>{
  const marie=d15BGoldFixtures()[1]!;
  const r=result([
    proposal("A","Analyser les retards de livraison et déployer de nouvelles procédures de suivi des commandes.",["E5","E3"],"Quel résultat concret a suivi le déploiement de ces nouvelles procédures ?"),
    proposal("B","Organiser plusieurs parties autour de la résolution des incidents clients.",["E2","E6"],"Quel résultat concret cette coordination a-t-elle produit ?"),
  ]);
  assert.deepEqual(assessD15BGoldDeterministically(marie,r).errors,[]);
});

test("Gold v2.1 Marie E5+E8 is acceptable partial recall with grounded ownership question",()=>{
  const marie=d15BGoldFixtures()[1]!;
  const r=result([
    proposal("A","Analyser les retards de livraison et participer à la réorganisation du traitement des commandes.",["E5","E8"],"Dans cette réorganisation, qu’avez-vous personnellement pris en charge et à quoi avez-vous seulement participé ?"),
    proposal("B","Organiser plusieurs parties autour de la résolution des incidents clients.",["E2","E6"],"Quel résultat concret cette coordination a-t-elle produit ?"),
  ]);
  assert.deepEqual(assessD15BGoldDeterministically(marie,r).errors,[]);
});

test("Gold v2.1 Marie full recall requires explicit Déployait versus Participait ownership contrast",()=>{
  const marie=d15BGoldFixtures()[1]!;
  const r=result([
    proposal("A","Analyser les retards, déployer des procédures et participer à la réorganisation du traitement des commandes.",["E5","E3","E8"],"Qu’avez-vous personnellement déployé, et à quoi avez-vous plutôt participé ?"),
    proposal("B","Organiser plusieurs parties autour de la résolution des incidents clients.",["E2","E6"],"Quel résultat concret cette coordination a-t-elle produit ?"),
  ]);
  assert.deepEqual(assessD15BGoldDeterministically(marie,r).errors,[]);
});

test("Gold v2.1 Marie E3+E8 fails because diagnosis E5 is absent",()=>{
  const marie=d15BGoldFixtures()[1]!;
  const r=result([
    proposal("A","Déployer des procédures et participer à une réorganisation.",["E3","E8"],"Qu’avez-vous personnellement déployé, et à quoi avez-vous participé ?"),
    proposal("B","Organiser plusieurs parties autour de la résolution des incidents clients.",["E2","E6"],"Quel résultat concret cette coordination a-t-elle produit ?"),
  ]);
  assert.ok(assessD15BGoldDeterministically(marie,r).errors.some(x=>x.includes("required evidence")));
});

test("Gold v2.1 Thomas grounded support wording is not treated as leadership",()=>{
  const thomas=d15BGoldFixtures()[4]!;
  const r=result([proposal("A","Combining support for the rollout of a new customer portal with user feedback.",["E4","E5"],"What did you personally own, and what did you mainly support?")]);
  assert.deepEqual(assessD15BGoldDeterministically(thomas,r).errors,[]);
});

test("Gold v2.1 unmatched extra thread routes to legitimacy review instead of deterministic failure",()=>{
  const thomas=d15BGoldFixtures()[4]!;
  const r=result([
    proposal("A","Combining support for the rollout of a new customer portal with user feedback.",["E4","E5"],"What did you personally own, and what did you mainly support?"),
    proposal("EXTRA","Project delivery issues across technical teams.",["E3","E6"],null),
  ]);
  const a=assessD15BGoldDeterministically(thomas,r);
  assert.deepEqual(a.errors,[]);
  assert.deepEqual(a.unmatched_thread_ids,["EXTRA"]);
});


test("Gold v2.1 Marie E5+E3 fails specifically when required outcome question is missing",()=>{
  const marie=d15BGoldFixtures()[1]!;
  const r=result([
    proposal("A","Analyser les retards de livraison et déployer de nouvelles procédures de suivi des commandes.",["E5","E3"],null),
    proposal("B","Organiser plusieurs parties autour de la résolution des incidents clients.",["E2","E6"],"Quel résultat concret cette coordination a-t-elle produit ?"),
  ]);
  const a=assessD15BGoldDeterministically(marie,r);
  assert.ok(a.errors.includes("Marie A E5+E3 requires a neutral outcome question"));
});

test("Gold v2.1 Marie E5+E8 fails specifically when required ownership question is missing",()=>{
  const marie=d15BGoldFixtures()[1]!;
  const r=result([
    proposal("A","Analyser les retards de livraison et participer à la réorganisation du traitement des commandes.",["E5","E8"],null),
    proposal("B","Organiser plusieurs parties autour de la résolution des incidents clients.",["E2","E6"],"Quel résultat concret cette coordination a-t-elle produit ?"),
  ]);
  const a=assessD15BGoldDeterministically(marie,r);
  assert.ok(a.errors.includes("Marie A E5+E8 requires a neutral ownership question about participation"));
});

test("Gold v2.1 Marie full branch fails specifically without explicit Deployait/Participait contrast",()=>{
  const marie=d15BGoldFixtures()[1]!;
  const r=result([
    proposal("A","Analyser les retards, déployer des procédures et participer à la réorganisation du traitement des commandes.",["E5","E3","E8"],"Qu’avez-vous personnellement pris en charge dans ce travail ?"),
    proposal("B","Organiser plusieurs parties autour de la résolution des incidents clients.",["E2","E6"],"Quel résultat concret cette coordination a-t-elle produit ?"),
  ]);
  const a=assessD15BGoldDeterministically(marie,r);
  assert.ok(a.errors.includes("Marie A full recall requires an explicit Déployait-versus-Participait ownership question"));
});

test("Gold v2.1 Thomas fails specifically when ownership clarification is absent",()=>{
  const thomas=d15BGoldFixtures()[4]!;
  const r=result([proposal("A","Combining support for the rollout of a new customer portal with user feedback.",["E4","E5"],null)]);
  const a=assessD15BGoldDeterministically(thomas,r);
  assert.ok(a.errors.includes("Thomas A requires a premise-free personal-ownership clarification"));
});

test("Gold v2.1 unmatched extra is observable without deterministic pass/fail",()=>{
  const thomas=d15BGoldFixtures()[4]!;
  const r=result([
    proposal("A","Combining support for the rollout of a new customer portal with user feedback.",["E4","E5"],"What did you personally own, and what did you mainly support?"),
    proposal("EXTRA","Project delivery issues across technical teams.",["E3","E6"],null),
  ]);
  const a=assessD15BGoldDeterministically(thomas,r);
  assert.equal(a.errors.length,0);
  assert.deepEqual(a.unmatched_thread_ids,["EXTRA"]);
});


test("Gold v2.1 Nancy B E8+E10 is protected as a valid Gold relationship",()=>{
  const nancy=d15BGoldFixtures()[0]!;
  const r=result([
    proposal("A","Keeping finance operating through acquisition integration, systems integration, and accounting-process change.",["E4","E5","E6"],"What did you personally own, and what did you mainly support?"),
    proposal("B","Connecting financial information with management and internal stakeholders who use it for decisions.",["E8","E10"],"What decision or action changed because of the information you provided?"),
  ]);
  const a=assessD15BGoldDeterministically(nancy,r);
  assert.equal(a.errors.length,0);
  assert.deepEqual(a.unmatched_thread_ids,[]);
});

test("Gold v2.1 Thomas support paraphrase creates no deterministic leadership or ownership-upgrade finding",()=>{
  const thomas=d15BGoldFixtures()[4]!;
  const r=result([
    proposal("A","Combining support for the rollout of a new customer portal with user feedback.",["E4","E5"],"What did you personally own, and what did you mainly support?"),
  ]);
  const a=assessD15BGoldDeterministically(thomas,r);
  assert.equal(a.errors.length,0);
  assert.ok(!a.errors.some(x=>/lead|ownership upgrade|unsupported ownership/i.test(x)));
});
