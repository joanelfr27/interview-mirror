export type ContextGoldItem = Readonly<{
  source_quote: string;
  expected_domain?: string;
  expected_scope?: string;
  expect_none?: boolean;
}>;
export type ContextObservedItem = Readonly<{ source_quote: string; domain?: string; scope?: string }>;
export const CONTEXT_GOLD_MIN_RECALL = 0.8;
export function evaluateContextGold(gold: readonly ContextGoldItem[], observed: readonly ContextObservedItem[]) {
  const byQuote = new Map(observed.map((item) => [item.source_quote, item]));
  let expectedPhraseCount = 0, recoveredPhraseCount = 0;
  const nonSubstringValues: string[] = [], falsePositiveQuotes: string[] = [];
  for (const expected of gold) {
    const actual = byQuote.get(expected.source_quote);
    const expectedValues = [expected.expected_domain, expected.expected_scope].filter((v): v is string => Boolean(v));
    expectedPhraseCount += expectedValues.length;
    for (const value of expectedValues) if (actual && (actual.domain === value || actual.scope === value)) recoveredPhraseCount += 1;
    for (const value of [actual?.domain, actual?.scope]) if (value && !expected.source_quote.includes(value)) nonSubstringValues.push(value);
    if (expected.expect_none && (actual?.domain || actual?.scope)) falsePositiveQuotes.push(expected.source_quote);
  }
  const recall = expectedPhraseCount ? Number((recoveredPhraseCount / expectedPhraseCount).toFixed(3)) : 1;
  return {
    expected_phrase_count: expectedPhraseCount, recovered_phrase_count: recoveredPhraseCount, recall,
    non_substring_values: nonSubstringValues, false_positive_quotes: falsePositiveQuotes,
    pass: recall >= CONTEXT_GOLD_MIN_RECALL && nonSubstringValues.length === 0 && falsePositiveQuotes.length === 0,
  };
}
