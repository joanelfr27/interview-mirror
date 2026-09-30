import test from "node:test";
import assert from "node:assert/strict";
import { buildD15BGoldLedger, d15BGoldFixtures } from "@/lib/d15-gold-gate";

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
