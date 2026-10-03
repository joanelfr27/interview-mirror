import assert from "node:assert/strict";
import test from "node:test";
import { evaluateJdStability } from "../src/lib/jd-stability-gate.ts";
const all={fund_financial_steering:true,investor_funder_relations:true,required_experience:true,bilingualism:true,degree_finance_specialization:true} as const;
test("JD stability passes only when all five concepts survive and counts stay within 20 percent",()=>{
 assert.equal(evaluateJdStability({requirement_count:10,facet_count:20,concepts:all},{requirement_count:12,facet_count:24,concepts:all}).pass,true);
});
test("JD stability freezes persistence response when a material concept disappears",()=>{
 const missing={...all,degree_finance_specialization:false};
 const r=evaluateJdStability({requirement_count:10,facet_count:20,concepts:all},{requirement_count:10,facet_count:20,concepts:missing});
 assert.equal(r.pass,false); assert.equal(r.failure_response,"PERSIST_VALIDATED_DECOMPOSITION_PER_OPPORTUNITY");
});
test("JD stability fails when decomposition counts diverge beyond 20 percent",()=>{
 const r=evaluateJdStability({requirement_count:9,facet_count:12,concepts:all},{requirement_count:22,facet_count:27,concepts:all});
 assert.equal(r.pass,false);
});

test("JD stability boundary passes below or at the frozen 20 percent limit", () => {
  assert.equal(evaluateJdStability({requirement_count:10,facet_count:20,concepts:all},{requirement_count:12,facet_count:24,concepts:all}).pass,true);
});
test("JD stability fails just beyond the frozen count limit", () => {
  assert.equal(evaluateJdStability({requirement_count:10,facet_count:20,concepts:all},{requirement_count:13,facet_count:20,concepts:all}).pass,false);
});
test("JD stability independently gates facet-count divergence", () => {
  assert.equal(evaluateJdStability({requirement_count:10,facet_count:10,concepts:all},{requirement_count:10,facet_count:13,concepts:all}).pass,false);
});
