import { writeFileSync, mkdirSync } from "node:fs";
import { runD15BSemanticThreadEngine } from "@/lib/d15-semantic-thread-engine";
import { buildD15BGoldLedger, d15BGoldFixtures, runD15BGoldGate } from "@/lib/d15-gold-gate";

const order = ["ELENA","NANCY","MARIE","DAVID","THOMAS"] as const;
const fixtures = [...d15BGoldFixtures()].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));

function evidenceLines(fixture: ReturnType<typeof d15BGoldFixtures>[number], ids:string[]) {
  return ids.map(id=>{
    const n=Number(id.replace(/^E/,""))-1;
    return `  - ${id}: ${fixture.lines[n] ?? "[missing source line]"}`;
  }).join("\n");
}

async function main(){
  const note=process.argv.slice(2).join(" ").trim() || "no change note supplied";
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  const out:string[]=[`D15 EXPLORE — ${stamp}`,`CHANGE: ${note}`,""];
  for(const fixture of fixtures){
    out.push("=".repeat(72),fixture.id,"=".repeat(72));
    for(let run=1;run<=2;run++){
      const result=await runD15BSemanticThreadEngine(buildD15BGoldLedger(fixture));
      out.push(`\nRUN ${run}\n`,`MIRROR_STATUS: ${result.completion_state}`,`CV_QUESTION_BACK: ${result.cv_question_back ?? "—"}`);
      if(!result.accepted.length) out.push("ACCEPTED: none");
      for(const thread of result.accepted){
        out.push(`ACCEPTED: ${thread.headline}`,evidenceLines(fixture,thread.evidence_ids),`QUESTION: ${thread.question_back ?? "—"}`,"");
      }
      if(!result.rejected.length) out.push("REJECTED: none");
      for(const rejection of result.rejected){
        out.push(`REJECTED ${rejection.proposal_id}: ${rejection.reasons.join(" | ")}`);
      }
    }
    out.push("");
  }
  out.push("=".repeat(72),"GOLD SCORER","=".repeat(72));
  const gold=await runD15BGoldGate();
  for(const item of gold){
    out.push(`${item.fixture_id}: ${item.passed ? "PASS" : "FAIL"}`);
    for(const error of item.deterministic_errors) out.push(`  deterministic: ${error}`);
    for(const error of item.semantic_errors) out.push(`  semantic: ${error}`);
  }
  out.push("");
  const text=out.join("\n");
  mkdirSync("tmp/d15-explore",{recursive:true});
  const file=`tmp/d15-explore/${stamp}.txt`;
  writeFileSync(file,text,"utf8");
  process.stdout.write(text+"\n\nSAVED: "+file+"\n");
}
main().catch((error)=>{console.error(error);process.exit(1);});
