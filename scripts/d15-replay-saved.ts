import { assessD15BGoldDeterministically, d15BGoldFixtures, runD15BSemanticReplayReview } from "@/lib/d15-gold-gate";
import type { D15BVerificationResult, D15BVerifiedThread } from "@/lib/d15-semantic-thread-engine";

const t=(id:string,headline:string,evidence_ids:string[],question_back:string|null):D15BVerifiedThread=>({id,headline,evidence_ids,question_back,maturity:"EMERGING_PATTERN",verification:"SUPPORTED"});
const r=(accepted:D15BVerifiedThread[]):D15BVerificationResult=>({accepted,rejected:[]});

const saved:Record<string,D15BVerificationResult[]>={
 NANCY:[r([
  t("B","Connecting financial information with internal stakeholders and management.",["E10","E8"],"In this work, what did you personally own or do, and what did you mainly support or assist with?"),
  t("A","Connecting acquisition accounting with systems integration following business changes.",["E4","E5"],"In this work, what did you personally own or do, and what did you mainly support or assist with?"),
 ])],
 MARIE:[r([
  t("A","Analyzing delivery delays with participation in order processing reorganization.",["E5","E8"],"Dans ce travail, qu’avez-vous personnellement pris en charge, et qu’avez-vous plutôt soutenu ou accompagné ?"),
  t("B","Connecter le suivi des incidents clients avec la coordination des fournisseurs et des équipes internes.",["E2","E6"],"Quelles actions avez-vous personnellement entreprises pour suivre les incidents clients et organiser leur résolution avec les équipes concernées, par rapport à la coordination que vous avez fournie?"),
 ])],
 DAVID:[r([
  t("B","Connecting customer priorities with senior management insights.",["E3","E6"],"What specific actions did you personally take to coordinate follow-up with key accounts?"),
  t("A","Combining monthly sales forecasts with structured pipeline reviews for the sales team.",["E2","E4"],null),
 ])],
 ELENA:[r([])],
 THOMAS:[r([
  t("A","Combining support for the rollout of a new customer portal with user feedback collection and training assistance.",["E4","E5","E7"],"Dans ce travail, qu’avez-vous personnellement pris en charge, et qu’avez-vous plutôt soutenu ou accompagné ?"),
 ])],
};

const forbidden=(id:string,cats:string[])=>{
 if((id==="MARIE"||id==="DAVID") && cats.some(x=>x==="UNSUPPORTED_OWNERSHIP"||x==="UNSUPPORTED_OUTCOME")) return "Marie/David unsupported ownership/outcome protection broken";
 if(id==="THOMAS" && cats.includes("UNSUPPORTED_OWNERSHIP")) return "Thomas support wording misclassified as leadership";
 if(id==="NANCY" && cats.includes("CORE_MEANING_MISMATCH")) return "Nancy B validity protection may be broken";
 return null;
};

async function main(){
 let failed=false;
 for(const fixture of d15BGoldFixtures()){
  const result=saved[fixture.id]?.[0];
  if(!result) throw new Error("missing saved output "+fixture.id);
  const deterministic=assessD15BGoldDeterministically(fixture,result);
  const reviews=[];
  for(let pass=1;pass<=2;pass++) reviews.push(await runD15BSemanticReplayReview(fixture,result,deterministic.unmatched_thread_ids));
  const sets=reviews.map(x=>x.findings.map(f=>f.category).sort());
  const stable=JSON.stringify(sets[0])===JSON.stringify(sets[1]);
  console.log("\n"+fixture.id);
  reviews.forEach((x,i)=>console.log("PASS "+(i+1),JSON.stringify(x)));
  if(!stable){ console.log("JUDGE_INSTABILITY"); failed=true; }
  for(const review of reviews){
   const cats=review.findings.map(x=>x.category);
   const protection=forbidden(fixture.id,cats);
   if(protection){ console.log("PROTECTION_BROKEN:",protection); failed=true; }
   if(fixture.id==="NANCY"){
    for(const id of deterministic.unmatched_thread_ids){
     if(!review.unmatched_extras.some(x=>x.thread_id===id)){ console.log("PROTECTION_BROKEN: Nancy unmatched extra not explicitly classified:",id); failed=true; }
    }
   }
  }
 }
 if(failed) process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exit(1);});
