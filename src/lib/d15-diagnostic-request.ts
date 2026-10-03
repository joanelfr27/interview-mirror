import {getOpenAI} from '@/lib/openai';
type Request = Parameters<ReturnType<typeof getOpenAI>['chat']['completions']['create']>[0];
const queues=new Map<string,Promise<void>>();
const reservations=new Map<string,Array<{at:number;tokens:number}>>();
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export function retryableD15RateLimit(error:unknown):boolean {
 const e=error as {status?:number;code?:string};
 return e?.status===429&&e.code==='rate_limit_exceeded';
}
// Conservative rolling token reservations, below the observed 30k TPM limit.
// Serializes requests for each model. Only rejected 429 requests may be retried;
// a successful generation is never sampled again.
export async function diagnosticCompletion(request:Request) {
 const model=request.model;
 const previous=queues.get(model)??Promise.resolve();
 let release!:()=>void;
 const done=new Promise<void>(resolve=>{release=resolve;});
 queues.set(model,previous.then(()=>done));
 await previous;
 try {
  const tokens=Math.ceil(JSON.stringify(request).length/2)+(request.max_tokens??1800);
  let entries=reservations.get(model)??[];
  for(;;){
   entries=entries.filter(e=>Date.now()-e.at<61000);
   if(entries.reduce((n,e)=>n+e.tokens,0)+tokens<=24000) break;
   const delay=Math.min(60000,Math.max(1000,61000-(Date.now()-entries[0]!.at)));
   console.log(`D15 RATE PACING model=${model} wait_ms=${delay}`);
   await pause(delay);
  }
  entries.push({at:Date.now(),tokens});reservations.set(model,entries);
  for(let attempt=0;;attempt++){
   try{return await getOpenAI().chat.completions.create({...request,stream:false});}
   catch(error){
    if(!retryableD15RateLimit(error)||attempt>=2) throw error;
    console.log(`D15 RATE RETRY model=${model} retry=${attempt+1} wait_ms=60000`);
    await pause(60000);
   }
  }
 }finally{release();}
}
