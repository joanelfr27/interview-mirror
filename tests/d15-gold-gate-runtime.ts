import { runD15BGoldGate } from "../src/lib/d15-gold-gate.ts";

const started=Date.now();
const results=await runD15BGoldGate();
console.log(JSON.stringify({kind:"D15_B_GOLD_GATE",elapsed_ms:Date.now()-started,results},null,2));
if(results.some(result=>!result.passed)) process.exitCode=1;
