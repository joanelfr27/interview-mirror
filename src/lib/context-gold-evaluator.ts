export type ContextGoldItem = Readonly<{
  session_fingerprint: string;
  source_quote: string;
  expected_domains?: readonly string[];
  expected_scopes?: readonly string[];
  expect_none?: boolean;
  bullet_number?: number;
  borderline?: boolean;
  note?: string | null;
}>;
export type ContextObservedItem = Readonly<{ source_quote: string; start_offset?: number; end_offset?: number; domain?: string; scope?: string }>;
export const CONTEXT_GOLD_MIN_RECALL = 0.8;

export function parseContextGold(value: string | undefined): readonly ContextGoldItem[] | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("E1_CONTEXT_GOLD_JSON must be a JSON array.");
  if (parsed.length === 0) throw new Error("E1_CONTEXT_GOLD_JSON must contain at least one gold item.");
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== "object" || typeof (item as ContextGoldItem).source_quote !== "string" || !(item as ContextGoldItem).source_quote.trim() || typeof (item as ContextGoldItem).session_fingerprint !== "string" || !(item as ContextGoldItem).session_fingerprint.trim()) {
      throw new Error(`E1_CONTEXT_GOLD_JSON item ${index} must contain session_fingerprint and source_quote.`);
    }
    const candidate = item as ContextGoldItem;
    for (const key of ["expected_domains", "expected_scopes"] as const) {
      const values = candidate[key];
      if (values !== undefined && (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== "string" || !value.trim()))) {
        throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.${key} must be a non-empty string array when provided.`);
      }
      if (values?.some((value) => !candidate.source_quote.includes(value))) {
        throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.${key} contains a phrase not copied verbatim from source_quote.`);
      }
    }
    if (candidate.expect_none !== undefined && typeof candidate.expect_none !== "boolean") throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.expect_none must be boolean.`);
    if (candidate.borderline !== undefined && typeof candidate.borderline !== "boolean") throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.borderline must be boolean.`);
    if (candidate.bullet_number !== undefined && (!Number.isInteger(candidate.bullet_number) || candidate.bullet_number < 1)) throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.bullet_number must be a positive integer.`);
    if (candidate.note !== undefined && candidate.note !== null && typeof candidate.note !== "string") throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.note must be string or null.`);
    const assertionCount = (candidate.expected_domains?.length ?? 0) + (candidate.expected_scopes?.length ?? 0);
    if (candidate.expect_none && assertionCount) throw new Error(`E1_CONTEXT_GOLD_JSON item ${index} cannot combine expect_none with expected context.`);
    if (!candidate.expect_none && assertionCount === 0) throw new Error(`E1_CONTEXT_GOLD_JSON item ${index} must contain expected context or expect_none:true.`);
  }
  return parsed as ContextGoldItem[];
}

export function evaluateContextGold(gold: readonly ContextGoldItem[], observed: readonly ContextObservedItem[], sourceDocument?: string) {
  let expectedPhraseCount = 0, recoveredPhraseCount = 0;
  const nonSubstringValues: string[] = [], falsePositiveQuotes: string[] = [], notExtractedQuotes: string[] = [];
  const borderlineResults: Array<{ source_quote: string; found: boolean; observed_values: string[] }> = [];
  for (const expected of gold) {
    // Resolve the gold bullet to one unique occurrence in the current CV, then
    // credit only atomic spans whose original offsets fall inside that occurrence.
    // This prevents repeated text in another bullet from satisfying this item.
    let goldStart = -1, goldEnd = -1;
    if (sourceDocument !== undefined) {
      goldStart = sourceDocument.indexOf(expected.source_quote);
      if (goldStart < 0 || sourceDocument.indexOf(expected.source_quote, goldStart + 1) >= 0) {
        notExtractedQuotes.push(expected.source_quote);
        continue;
      }
      goldEnd = goldStart + expected.source_quote.length;
    }
    const actual = observed.filter((item) => {
      if (!item.source_quote.length) return false;
      if (sourceDocument === undefined) return expected.source_quote.includes(item.source_quote);
      return typeof item.start_offset === "number" && typeof item.end_offset === "number" &&
        item.start_offset >= goldStart && item.end_offset <= goldEnd;
    });
    if (expected.borderline) {
      const expectedBorderline = [...(expected.expected_domains ?? []), ...(expected.expected_scopes ?? [])];
      const observedValues = actual.flatMap((item) => [item.domain, item.scope].filter((value): value is string => Boolean(value)));
      borderlineResults.push({ source_quote: expected.source_quote, found: expectedBorderline.some((phrase) => observedValues.includes(phrase)), observed_values: observedValues });
      continue;
    }
    if (actual.length === 0) notExtractedQuotes.push(expected.source_quote);
    for (const phrase of expected.expected_domains ?? []) {
      expectedPhraseCount += 1;
      if (actual.some((item) => item.domain === phrase)) recoveredPhraseCount += 1;
    }
    for (const phrase of expected.expected_scopes ?? []) {
      expectedPhraseCount += 1;
      if (actual.some((item) => item.scope === phrase)) recoveredPhraseCount += 1;
    }
    for (const item of actual) for (const value of [item.domain, item.scope]) if (value && !item.source_quote.includes(value)) nonSubstringValues.push(value);
    if (expected.expect_none && actual.some((item) => item.domain || item.scope)) falsePositiveQuotes.push(expected.source_quote);
  }
  const recall = expectedPhraseCount ? Number((recoveredPhraseCount / expectedPhraseCount).toFixed(3)) : 1;
  return { expected_phrase_count: expectedPhraseCount, recovered_phrase_count: recoveredPhraseCount, recall,
    non_substring_values: nonSubstringValues, false_positive_quotes: falsePositiveQuotes, not_extracted_quotes: notExtractedQuotes,
    borderline_results: borderlineResults,
    bullet_coverage: Number(((gold.filter((item) => !item.borderline).length - notExtractedQuotes.length) / Math.max(1, gold.filter((item) => !item.borderline).length)).toFixed(3)),
    pass: recall >= CONTEXT_GOLD_MIN_RECALL && nonSubstringValues.length === 0 && falsePositiveQuotes.length === 0 && notExtractedQuotes.length === 0 };
}
