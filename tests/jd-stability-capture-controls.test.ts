import test from "node:test";
import assert from "node:assert/strict";
import { evaluateJdStability, type JdDecompositionSnapshot } from "../src/lib/jd-stability-gate.ts";

const all = {
  fund_financial_steering: true,
  investor_funder_relations: true,
  required_experience: true,
  bilingualism: true,
  degree_finance_specialization: true,
} as const;

function snap(requirement_count:number, facet_count:number, concepts:any = all):JdDecompositionSnapshot {
  return { requirement_count, facet_count, concepts };
}

test("A1 stub control: stable complete decompositions PASS", () => {
  const evaluation = evaluateJdStability(snap(10,20), snap(11,22));
  assert.equal(evaluation.pass, true);
  assert.deepEqual(evaluation.missing_concepts, []);
  assert.ok(evaluation.requirement_count_divergence <= 0.2);
  assert.ok(evaluation.facet_count_divergence <= 0.2);
});

test("A2 stub control: missing degree plus >20% divergence FAIL with reasons", () => {
  const missingDegree = { ...all, degree_finance_specialization: false };
  const evaluation = evaluateJdStability(snap(10,20), snap(7,14,missingDegree));
  assert.equal(evaluation.pass, false);
  assert.deepEqual(evaluation.missing_concepts, ["degree_finance_specialization"]);
  assert.ok(evaluation.requirement_count_divergence > 0.2);
  assert.ok(evaluation.facet_count_divergence > 0.2);
  assert.equal(evaluation.failure_response, "PERSIST_VALIDATED_DECOMPOSITION_PER_OPPORTUNITY");
});

test("B capture control: injected call-2 failure persists state and error", async () => {
  const result:any = {
    schema_version: 2,
    mode: "STUB",
    model_id: null,
    expected_calls: 2,
    calls: [{call:1,status:"NOT_STARTED"},{call:2,status:"NOT_STARTED"}],
    complete:false,
  };
  const writes:string[]=[];
  const write=()=>writes.push(JSON.stringify(result));
  const stub=async(call:number)=>{
    if(call===2) throw new Error("INJECTED_CALL_2_FAILURE");
    return snap(10,20);
  };
  try {
    result.calls[0].status="STARTED"; write();
    result.calls[0]={call:1,status:"COMPLETED",snapshot:await stub(1),requirements:[{source_quote:"stub",normalized_requirement:"stub",facets:[]}]}; write();
    result.calls[1].status="STARTED"; write();
    await stub(2);
    assert.fail("call 2 must throw");
  } catch(error) {
    result.error=error instanceof Error?{name:error.name,message:error.message}:{message:String(error)};
    result.verdict="EXECUTION_ERROR"; write();
  }
  const captured=JSON.parse(writes.at(-1)!);
  assert.equal(captured.mode,"STUB");
  assert.equal(captured.calls[0].status,"COMPLETED");
  assert.equal(captured.calls[1].status,"STARTED");
  assert.equal(captured.complete,false);
  assert.equal(captured.verdict,"EXECUTION_ERROR");
  assert.equal(captured.error.message,"INJECTED_CALL_2_FAILURE");
});
