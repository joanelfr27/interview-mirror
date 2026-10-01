import { writeFileSync, mkdirSync } from "node:fs";
import { runD15BSemanticThreadEngine, verifyD15BClaimIndependently, verifyD15BSignificanceByMajority, verifyD15BSemanticThreadProposals } from "@/lib/d15-semantic-thread-engine";
import type { AtomicEvidence, EvidenceLedger, SourceSpan } from "@/lib/canonical-evidence-model";
import { assessD15BGoldDeterministically, buildD15BGoldLedger, d15BGoldFixtures } from "@/lib/d15-gold-gate";

const order = ["ELENA","NANCY","MARIE","DAVID","THOMAS"] as const;
const fixtures = [...d15BGoldFixtures()].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));

function evidenceLines(fixture: ReturnType<typeof d15BGoldFixtures>[number], ids:string[]) {
  return ids.map(id=>{
    const n=Number(id.replace(/^E/,""))-1;
    return `  - ${id}: ${fixture.lines[n] ?? "[missing source line]"}`;
  }).join("\n");
}


function syntheticSignificanceLedger(lines:[string,string]):EvidenceLedger{
  const source_spans:SourceSpan[]=lines.map((text,i)=>({id:`SS${i+1}`,document_id:"SYNTHETIC",text,start_offset:i*200,end_offset:i*200+text.length,language:"en",source_section:"BULLET"}));
  const evidence:AtomicEvidence[]=source_spans.map((span,i)=>({
    id:`SE${i+1}`,source_span_id:span.id,provenance:{source_type:"CV",language:"en",extraction_method:"PARSER"},
    subject:{actor:"candidate",ownership:"INDIVIDUAL"},action:{normalized_action:i===0?"reviewed":"changed",object:lines[i]!},
    context:{},scale:{},time:{},outcome:null,assertion:{type:"RESPONSIBILITY",polarity:"AFFIRMATIVE"},
    verifiability:{has_quantifiable_metric:false,has_third_party_entity:false,has_time_anchor:false},extraction_confidence:1,
  }));
  return {evidence,source_spans,requirements:[],support_judgments:[],requirement_statuses:[],unresolved_items:[],candidate_elicitations:[],demonstration_objectives:[]};
}

async function assertSyntheticSignificanceStability(out:string[]){
  const controls=[
    {name:"Thomas portal Gold relationship",expected:true,lines:["Supported the rollout of a new customer portal and coordinated user testing.","Collected user feedback during the rollout and shared recurring issues with the project team."] as [string,string],claim:"You work where a new system meets the people who have to use it."},
    {name:"Nancy integration Gold relationship",expected:true,lines:["Supporting acquisition accounting and financial integration activities.","Supporting systems integration following business changes."] as [string,string],claim:"You keep finance working through business change by connecting financial integration with systems integration."},
    {name:"functional relationship",expected:true,lines:["Reviewed recurring causes in customer complaints.","Changed the intake checklist after reviewing recurring complaint causes."] as [string,string],claim:"You connect recurring complaint diagnosis with intake-process changes."},
    {name:"Elena-like mere administrative bundle",expected:false,lines:["Filed supplier invoices each week.","Archived supplier invoices each month."] as [string,string],claim:"You work across invoice administration."},
  ];
  out.push("=".repeat(72),"SYNTHETIC SIGNIFICANCE STABILITY","=".repeat(72));
  for(const control of controls){
    const ledger=syntheticSignificanceLedger(control.lines);
    const verdicts:boolean[]=[];
    for(let i=0;i<3;i++) verdicts.push((await verifyD15BSignificanceByMajority(ledger,["SE1","SE2"],control.claim)).supported);
    out.push(`${control.name} voted decisions: ${verdicts.join(",")} expected=${control.expected}`);
    if(verdicts.some(v=>v!==control.expected)) throw new Error(`significance voted stability failed for ${control.name}: ${verdicts.join(",")}`);
  }
  out.push("");
}

async function assertObservedTruthSlipRegressions(out:string[]){
  const cases=[
    {
      name:"Marie causal purpose slip",
      fixtureId:"MARIE",
      ids:["E5","E8"],
      claim:"Vous contribuez à la réorganisation des processus pour résoudre les retards de livraison.",
    },
    {
      name:"Thomas assisted-training ownership slip",
      fixtureId:"THOMAS",
      ids:["E4","E5","E7"],
      claim:"You support users during the rollout of a new customer portal while gathering their feedback and providing training.",
    },
    {
      name:"Marie organised-resolution ownership slip",
      fixtureId:"MARIE",
      ids:["E2","E6"],
      claim:"Vous gérez la résolution des incidents clients avec les équipes concernées.",
    },
  ] as const;
  out.push("=".repeat(72),"OBSERVED TRUTH-SLIP REGRESSIONS","=".repeat(72));
  const failures:string[]=[];
  for(const control of cases){
    const fixture=fixtures.find(item=>item.id===control.fixtureId);
    if(!fixture) throw new Error(`missing Gold fixture ${control.fixtureId}`);
    const gold=buildD15BGoldLedger(fixture);
    const proposal={id:`TRUTH-${control.fixtureId}`,headline:control.claim,evidence_ids:[...control.ids],question_back:null};
    const deterministic=verifyD15BSemanticThreadProposals(gold,[proposal]);
    const deterministicRejected=deterministic.accepted.length===0;
    const verifierVerdicts:boolean[]=[];
    for(let i=0;i<3;i++) verifierVerdicts.push((await verifyD15BClaimIndependently(gold,[...control.ids],control.claim,"HEADLINE")).supported);
    out.push(`${control.name}: deterministic_rejected=${deterministicRejected} verifier=${verifierVerdicts.join(",")} expected_final_reject=true`);
    if(!deterministicRejected && verifierVerdicts.some(Boolean)){
      failures.push(`${control.name}: deterministic accepted and verifier=${verifierVerdicts.join(",")}`);
    }
  }
  out.push("");
  if(failures.length) throw new Error(`truth-slip regressions accepted:\n${failures.join("\n")}`);
}

async function main(){
  const note=process.argv.slice(2).join(" ").trim() || "no change note supplied";
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  const out:string[]=[`D15 EXPLORE — ${stamp}`,`CHANGE: ${note}`,""];
  await assertSyntheticSignificanceStability(out);
  await assertObservedTruthSlipRegressions(out);
  const scoredRuns = new Map<string, Array<Awaited<ReturnType<typeof runD15BSemanticThreadEngine>>>>();
  for(const fixture of fixtures){
    out.push("=".repeat(72),fixture.id,"=".repeat(72));
    for(let run=1;run<=2;run++){
      const result=await runD15BSemanticThreadEngine(buildD15BGoldLedger(fixture));
      const recorded=scoredRuns.get(fixture.id) ?? [];
      recorded.push(result);
      scoredRuns.set(fixture.id,recorded);
      out.push(`\nRUN ${run}\n`,`MIRROR_STATUS: ${result.completion_state}`,`CV_QUESTION_BACK: ${result.cv_question_back ?? "—"}`);
      if(!result.accepted.length) out.push("ACCEPTED: none");
      for(const thread of result.accepted){
        out.push(`ACCEPTED: ${thread.headline}`,evidenceLines(fixture,thread.evidence_ids),`QUESTION: ${thread.question_back ?? "—"}`,"");
      }
      if(!result.rejected.length) out.push("REJECTED: none");
      for(const rejection of result.rejected){
        const diagnosticHeadline=rejection.diagnostic_headline ? ` HEADLINE: ${rejection.diagnostic_headline}` : "";
        out.push(`REJECTED ${rejection.proposal_id}:${diagnosticHeadline} ${rejection.reasons.join(" | ")}`);
      }
    }
    out.push("");
  }
  out.push("=".repeat(72),"GOLD SCORER — SCORES RECORDED PRINTED RUNS","=".repeat(72));
  for(const fixture of fixtures){
    const runs=scoredRuns.get(fixture.id) ?? [];
    if(runs.length!==2) throw new Error(`expected two recorded runs for ${fixture.id}, got ${runs.length}`);
    const verdicts:string[]=[];
    for(let i=0;i<runs.length;i++){
      const engine=runs[i]!;
      const keys=engine.accepted.map(t=>[...t.evidence_ids].sort().join("+"));
      out.push(`SCORER_INPUT ${fixture.id}: RUN ${i+1} evidence_keys=[${keys.join(", ") || "none"}]`);
      const assessment=assessD15BGoldDeterministically(fixture,engine);
      const passed=assessment.errors.length===0;
      verdicts.push(`RUN ${i+1} ${passed?"PASS":"FAIL"}`);
      for(const error of assessment.errors) out.push(`  RUN ${i+1} deterministic: ${error}`);
    }
    out.push(`${fixture.id}: ${verdicts.join(" · ")} · PERSONA ${verdicts.every(v=>v.endsWith("PASS"))?"PASS":"FAIL"}`);
  }
  out.push("");
  const text=out.join("\n");
  mkdirSync("tmp/d15-explore",{recursive:true});
  const file=`tmp/d15-explore/${stamp}.txt`;
  writeFileSync(file,text,"utf8");
  process.stdout.write(text+"\n\nSAVED: "+file+"\n");
}
main().catch((error)=>{console.error(error);process.exit(1);});
