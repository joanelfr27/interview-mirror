import {D15_COMPARISON_MODELS} from '@/lib/d15-semantic-reading';
import {AI_MODEL,getOpenAI} from '@/lib/openai';
export function validateD15ModelPreflight(response:{model?:string;choices?:Array<{message?:{content?:string|null}}>},model:string=AI_MODEL) {
  if(model!==AI_MODEL&&!D15_COMPARISON_MODELS.some(m=>m===model)) throw new Error('Unregistered D15 diagnostic model: '+model);
  if(!response.model?.startsWith(model)) throw new Error('Unexpected resolved model: '+response.model);
  const payload=JSON.parse(response.choices?.[0]?.message?.content??'null');
  if(payload?.ready!==true||Object.keys(payload).length!==1) throw new Error('Structured-output capability probe failed');
  return {requested_model:model,resolved_model:response.model,temperature:0,strict_json_schema:true,status:'PASS' as const};
}
export async function runD15ModelPreflight(model:string=AI_MODEL) {
  // A capability probe, not a semantic qualification or accuracy claim.
  if(model!==AI_MODEL&&!D15_COMPARISON_MODELS.some(m=>m===model)) throw new Error('Unregistered D15 diagnostic model: '+model);
  const response=await getOpenAI().chat.completions.create({model,temperature:0,response_format:{type:'json_schema',json_schema:{name:'d15_capability_probe',strict:true,schema:{type:'object',additionalProperties:false,properties:{ready:{type:'boolean'}},required:['ready']}}},messages:[{role:'user',content:'Return ready=true.'}]});
  return validateD15ModelPreflight(response,model);
}
