export type ContextGoldItem = Readonly<{
  session_fingerprint: string; source_quote: string; expected_domains?: readonly string[]; expected_scopes?: readonly string[];
  expect_none?: boolean; bullet_number?: number; borderline?: boolean; note?: string | null;
}>;
export type ContextObservedItem = Readonly<{ source_quote: string; start_offset?: number; end_offset?: number; domain?: string; scope?: string }>;
export type ContextGoldPolicy = Readonly<{
  schema_version: 1; gold_blob_sha: string; session_fingerprint: string;
  field_none_semantics: Readonly<{ omitted_expected_domains: "NONE"; omitted_expected_scopes: "NONE" }>;
  borderline_exclusions: readonly Readonly<{ bullet_number: number; field: "domain" | "scope"; phrases: readonly string[] }>[];
}>;
export const CONTEXT_GOLD_MIN_RECALL = 0.8;

export function parseContextGold(value: string | undefined): readonly ContextGoldItem[] | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("E1_CONTEXT_GOLD_JSON must be a JSON array.");
  if (parsed.length === 0) throw new Error("E1_CONTEXT_GOLD_JSON must contain at least one gold item.");
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== "object" || typeof (item as ContextGoldItem).source_quote !== "string" || !(item as ContextGoldItem).source_quote.trim() || typeof (item as ContextGoldItem).session_fingerprint !== "string" || !(item as ContextGoldItem).session_fingerprint.trim()) throw new Error(`E1_CONTEXT_GOLD_JSON item ${index} must contain session_fingerprint and source_quote.`);
    const candidate = item as ContextGoldItem;
    for (const key of ["expected_domains", "expected_scopes"] as const) {
      const values = candidate[key];
      if (values !== undefined && (!Array.isArray(values) || values.length === 0 || values.some((v) => typeof v !== "string" || !v.trim()))) throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.${key} must be a non-empty string array when provided.`);
      if (values?.some((v) => !candidate.source_quote.includes(v))) throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.${key} contains a phrase not copied verbatim from source_quote.`);
    }
    if (candidate.expect_none !== undefined && typeof candidate.expect_none !== "boolean") throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.expect_none must be boolean.`);
    if (candidate.borderline !== undefined && typeof candidate.borderline !== "boolean") throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.borderline must be boolean.`);
    if (candidate.bullet_number !== undefined && (!Number.isInteger(candidate.bullet_number) || candidate.bullet_number < 1)) throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.bullet_number must be a positive integer.`);
    if (candidate.note !== undefined && candidate.note !== null && typeof candidate.note !== "string") throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.note must be string or null.`);
    const n=(candidate.expected_domains?.length??0)+(candidate.expected_scopes?.length??0);
    if (candidate.expect_none && n) throw new Error(`E1_CONTEXT_GOLD_JSON item ${index} cannot combine expect_none with expected context.`);
    if (!candidate.expect_none && n===0) throw new Error(`E1_CONTEXT_GOLD_JSON item ${index} must contain expected context or expect_none:true.`);
  }
  return parsed as ContextGoldItem[];
}
export function parseContextGoldPolicy(value: string | undefined): ContextGoldPolicy | null {
  if (value === undefined || value.trim() === "") return null;
  const p=JSON.parse(value) as ContextGoldPolicy;
  if (p.schema_version!==1 || typeof p.gold_blob_sha!=="string" || typeof p.session_fingerprint!=="string") throw new Error("Invalid context policy header.");
  if (p.field_none_semantics?.omitted_expected_domains!=="NONE" || p.field_none_semantics?.omitted_expected_scopes!=="NONE") throw new Error("Context policy must freeze omitted fields as NONE.");
  if (!Array.isArray(p.borderline_exclusions)) throw new Error("Context policy borderline_exclusions must be an array.");
  return p;
}
export function evaluateContextGold(gold: readonly ContextGoldItem[], observed: readonly ContextObservedItem[], sourceDocument?: string, policy?: ContextGoldPolicy | null) {
  let expectedPhraseCount=0,recoveredPhraseCount=0;
  const nonSubstringValues:string[]=[],falsePositiveQuotes:string[]=[],notExtractedQuotes:string[]=[];
  const borderlineResults:Array<{source_quote:string;field:"domain"|"scope";phrase:string;found:boolean}>=[];
  const excluded=(b:number,f:"domain"|"scope")=>new Set(policy?.borderline_exclusions.filter(x=>x.bullet_number===b&&x.field===f).flatMap(x=>x.phrases)??[]);
  for(const expected of gold){
    const ed=excluded(expected.bullet_number??-1,"domain"), es=excluded(expected.bullet_number??-1,"scope");
    for(const phrase of expected.expected_domains??[]) if(!ed.has(phrase)) expectedPhraseCount++;
    for(const phrase of expected.expected_scopes??[]) if(!es.has(phrase)) expectedPhraseCount++;
    let gs=-1,ge=-1;
    if(sourceDocument!==undefined){ gs=sourceDocument.indexOf(expected.source_quote); if(gs<0||sourceDocument.indexOf(expected.source_quote,gs+1)>=0){notExtractedQuotes.push(expected.source_quote);continue;} ge=gs+expected.source_quote.length; }
    const actual=observed.filter(i=>i.source_quote.length>0&&(sourceDocument===undefined?expected.source_quote.includes(i.source_quote):(typeof i.start_offset==="number"&&typeof i.end_offset==="number"&&i.start_offset>=gs&&i.end_offset<=ge)));
    if(actual.length===0) notExtractedQuotes.push(expected.source_quote);
    for(const phrase of expected.expected_domains??[]) if(ed.has(phrase)) borderlineResults.push({source_quote:expected.source_quote,field:"domain",phrase,found:actual.some(i=>i.domain===phrase)}); else if(actual.some(i=>i.domain===phrase)) recoveredPhraseCount++;
    for(const phrase of expected.expected_scopes??[]) if(es.has(phrase)) borderlineResults.push({source_quote:expected.source_quote,field:"scope",phrase,found:actual.some(i=>i.scope===phrase)}); else if(actual.some(i=>i.scope===phrase)) recoveredPhraseCount++;
    for(const item of actual){
      if(item.domain&&!ed.has(item.domain)&&!item.source_quote.includes(item.domain)) nonSubstringValues.push(item.domain);
      if(item.scope&&!es.has(item.scope)&&!item.source_quote.includes(item.scope)) nonSubstringValues.push(item.scope);
      if(policy&&expected.expected_domains===undefined&&item.domain) falsePositiveQuotes.push(expected.source_quote);
      if(policy&&expected.expected_scopes===undefined&&item.scope) falsePositiveQuotes.push(expected.source_quote);
      if(expected.expect_none&&(item.domain||item.scope)) falsePositiveQuotes.push(expected.source_quote);
    }
  }
  const recall=expectedPhraseCount?Number((recoveredPhraseCount/expectedPhraseCount).toFixed(3)):1;
  return {expected_phrase_count:expectedPhraseCount,recovered_phrase_count:recoveredPhraseCount,recall,non_substring_values:[...new Set(nonSubstringValues)],false_positive_quotes:[...new Set(falsePositiveQuotes)],not_extracted_quotes:[...new Set(notExtractedQuotes)],borderline_results:borderlineResults,bullet_coverage:Number(((gold.length-new Set(notExtractedQuotes).size)/Math.max(1,gold.length)).toFixed(3)),pass:recall>=CONTEXT_GOLD_MIN_RECALL&&nonSubstringValues.length===0&&falsePositiveQuotes.length===0&&notExtractedQuotes.length===0};
}
