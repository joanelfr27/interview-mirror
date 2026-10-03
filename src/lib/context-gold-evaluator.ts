export type ContextGoldItem = Readonly<{
  session_fingerprint: string;
  source_quote: string;
  expected_domains?: readonly string[];
  expected_scopes?: readonly string[];
  expect_none?: boolean;
}>;
export type ContextObservedItem = Readonly<{ source_quote: string; domain?: string; scope?: string }>;
export const CONTEXT_GOLD_MIN_RECALL = 0.8;

export function parseContextGold(value: string | undefined): readonly ContextGoldItem[] | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("E1_CONTEXT_GOLD_JSON must be a JSON array.");
  if (parsed.length === 0) throw new Error("E1_CONTEXT_GOLD_JSON must contain at least one gold item.");
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== "object" || typeof (item as ContextGoldItem).source_quote !== "string" || typeof (item as ContextGoldItem).session_fingerprint !== "string" || !(item as ContextGoldItem).session_fingerprint.trim()) {
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
    if (candidate.expect_none && ((candidate.expected_domains?.length ?? 0) || (candidate.expected_scopes?.length ?? 0))) throw new Error(`E1_CONTEXT_GOLD_JSON item ${index} cannot combine expect_none with expected context.`);
  }
  return parsed as ContextGoldItem[];
}

export function evaluateContextGold(gold: readonly ContextGoldItem[], observed: readonly ContextObservedItem[]) {
  let expectedPhraseCount = 0, recoveredPhraseCount = 0;
  const nonSubstringValues: string[] = [], falsePositiveQuotes: string[] = [], notExtractedQuotes: string[] = [];
  for (const expected of gold) {
    // Gold is marked at source-bullet level, while E1 evidence is atomic and may
    // preserve only a clause from that bullet. Match only source-grounded atom
    // spans contained verbatim in the marked bullet; never fuzzy-match text.
    const actual = observed.filter((item) =>
      item.source_quote.length > 0 && expected.source_quote.includes(item.source_quote)
    );
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
    bullet_coverage: Number(((gold.length - notExtractedQuotes.length) / gold.length).toFixed(3)),
    pass: recall >= CONTEXT_GOLD_MIN_RECALL && nonSubstringValues.length === 0 && falsePositiveQuotes.length === 0 && notExtractedQuotes.length === 0 };
}
