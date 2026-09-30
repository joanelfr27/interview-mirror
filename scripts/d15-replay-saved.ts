import { assessD15BGoldDeterministically, d15BGoldFixtures, semanticGoldErrors } from "@/lib/d15-gold-gate";
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

const preflag=(id:string,errors:string[])=>errors.map(raw=>({raw,likely_protection_terms:[...new Set((raw.match(/ownership|owner|owned|leadership|leader|led|outcome|result|improv|reduc|increas|Nancy|E8|E10/giu)||[]).map(x=>x.toLowerCase()))]}));

async function main(){
 for(const fixture of d15BGoldFixtures()){
  const result=saved[fixture.id]?.[0];
  if(!result) throw new Error("missing saved output "+fixture.id);
  const deterministic=assessD15BGoldDeterministically(fixture,result);
  console.log("\\nCASE "+fixture.id);
  console.log("DETERMINISTIC",JSON.stringify(deterministic));
  if(process.env.D15_REPLAY_DETERMINISTIC_ONLY==="1") continue;
  for(let pass=1;pass<=2;pass++){
   const raw=await semanticGoldErrors(fixture,result,deterministic.unmatched_thread_ids);
   console.log("SEMANTIC_PASS_"+pass+"_RAW",JSON.stringify(raw));
   console.log("SEMANTIC_PASS_"+pass+"_PREFLAG",JSON.stringify(preflag(fixture.id,raw)));
  }
 }
 console.log("\\nMANUAL_CLASSIFICATION_REQUIRED: classify every raw semantic string against frozen protections 1-3; keyword preflags are non-authoritative.");
}
main().catch(e=>{console.error(e);process.exit(1);});
