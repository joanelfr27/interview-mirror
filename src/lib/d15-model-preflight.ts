import {AI_MODEL,getOpenAI} from '@/lib/openai';
export function validateD15ModelPreflight(response:{model?:string;choices?:Array<{message?:{content?:string|null}}>}) {
  if(AI_MODEL!=='gpt-4o-mini') throw new Error('Unregistered D15 diagnostic model: '+AI_MODEL);
  if(!response.model?.startsWith(AI_MODEL)) throw new Error('Unexpected resolved model: '+response.model);
  const payload=JSON.parse(response.choices?.[0]?.message?.content??'null');
  if(payload?.ready!==true||Object.keys(payload).length!==1) throw new Error('Structured-output capability probe failed');
  return {requested_model:AI_MODEL,resolved_model:response.model,temperature:0,strict_json_schema:true,status:'PASS' as const};
}
export async function runD15ModelPreflight() {
  // A capability probe, not a semantic qualification or accuracy claim.
  if(AI_MODEL!=='gpt-4o-mini') throw new Error('Unregistered D15 diagnostic model: '+AI_MODEL);
  const response=await getOpenAI().chat.completions.create({model:AI_MODEL,temperature:0,response_format:{type:'json_schema',json_schema:{name:'d15_capability_probe',strict:true,schema:{type:'object',additionalProperties:false,properties:{ready:{type:'boolean'}},required:['ready']}}},messages:[{role:'user',content:'Return ready=true.'}]});
  return validateD15ModelPreflight(response);
}
