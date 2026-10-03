export type ContextGoldItem = Readonly<{
  source_quote: string;
  expected_domain?: string;
  expected_scope?: string;
  expect_none?: boolean;
}>;
export type ContextObservedItem = Readonly<{ source_quote: string; domain?: string; scope?: string }>;
export const CONTEXT_GOLD_MIN_RECALL = 0.8;

export function parseContextGold(value: string | undefined): readonly ContextGoldItem[] | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("E1_CONTEXT_GOLD_JSON must be a JSON array.");
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== "object" || typeof (item as ContextGoldItem).source_quote !== "string") {
      throw new Error(`E1_CONTEXT_GOLD_JSON item ${index} must contain source_quote.`);
    }
    const candidate = item as ContextGoldItem;
    for (const key of ["expected_domain", "expected_scope"] as const) {
      if (candidate[key] !== undefined && typeof candidate[key] !== "string") throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.${key} must be a string.`);
    }
    if (candidate.expect_none !== undefined && typeof candidate.expect_none !== "boolean") throw new Error(`E1_CONTEXT_GOLD_JSON item ${index}.expect_none must be boolean.`);
    if (candidate.expect_none && (candidate.expected_domain || candidate.expected_scope)) throw new Error(`E1_CONTEXT_GOLD_JSON item ${index} cannot combine expect_none with expected context.`);
  }
  return parsed as ContextGoldItem[];
}

export function evaluateContextGold(gold: readonly ContextGoldItem[], observed: readonly ContextObservedItem[]) {
  const byQuote = new Map<string, ContextObservedItem[]>();
  for (const item of observed) byQuote.set(item.source_quote, [...(byQuote.get(item.source_quote) ?? []), item]);
  let expectedPhraseCount = 0, recoveredPhraseCount = 0;
  const nonSubstringValues: string[] = [], falsePositiveQuotes: string[] = [];
  for (const expected of gold) {
    const actual = byQuote.get(expected.source_quote) ?? [];
    if (expected.expected_domain) {
      expectedPhraseCount += 1;
      if (actual.some((item) => item.domain === expected.expected_domain)) recoveredPhraseCount += 1;
    }
    if (expected.expected_scope) {
      expectedPhraseCount += 1;
      if (actual.some((item) => item.scope === expected.expected_scope)) recoveredPhraseCount += 1;
    }
    for (const item of actual) for (const value of [item.domain, item.scope]) if (value && !expected.source_quote.includes(value)) nonSubstringValues.push(value);
    if (expected.expect_none && actual.some((item) => item.domain || item.scope)) falsePositiveQuotes.push(expected.source_quote);
  }
  const recall = expectedPhraseCount ? Number((recoveredPhraseCount / expectedPhraseCount).toFixed(3)) : 1;
  return { expected_phrase_count: expectedPhraseCount, recovered_phrase_count: recoveredPhraseCount, recall,
    non_substring_values: nonSubstringValues, false_positive_quotes: falsePositiveQuotes,
    pass: recall >= CONTEXT_GOLD_MIN_RECALL && nonSubstringValues.length === 0 && falsePositiveQuotes.length === 0 };
}
