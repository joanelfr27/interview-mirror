# D15 Gold v2.1 — Replay Protocol

**Frozen before saved-output replay:** 2026-09-30
**Purpose:** define comparison semantics before any model judge sees the saved run.

## Checkout invariant

Replay may start only after confirming:
1. HEAD descends from `91a60c40ac9446d992a6bc6ed37cb3e7b8eadba7`.
2. Commits after `91a60c40` and before replay change tests/protocol only; product engine code is unchanged.
3. The preregistration file created at `ea97dce8507706bcb90ea8fda2fb8f6efad7e9ad` remains byte-identical.

## Exact-match rule

### Deterministic layer
Compare by stable rule/category identity, fixture, thread and evidence branch — not prose wording. The observed set must equal the preregistered expected set. Missing expected findings and unexpected additional findings are both replay mismatches.

Stable deterministic categories:
- REQUIRED_RECALL_MISSING
- LANGUAGE_MISMATCH_HEADLINE
- LANGUAGE_MISMATCH_QUESTION
- REQUIRED_QUESTION_MISSING_OR_WRONG_TYPE
- MARIE_DIAGNOSIS_CHANGE_MEANING_MISSING
- ELENA_CAPABILITY_MISSING
- UNMATCHED_THREAD_ROUTED

`UNMATCHED_THREAD_ROUTED` is routing/observability, not itself a failure.

### Semantic layer
Judge prose is not compared verbatim. Normalize every semantic finding to one of:
- CORE_MEANING_MISMATCH
- UNSUPPORTED_OWNERSHIP
- UNSUPPORTED_OUTCOME
- UNSUPPORTED_SCALE
- UNSUPPORTED_TIMING
- UNSUPPORTED_SENIORITY
- UNSUPPORTED_SCOPE
- RESTRAINT_VIOLATION
- EXTRA_THREAD_LEGITIMATE
- EXTRA_THREAD_ILLEGITIMATE
- TRACEABILITY_VIOLATION
- OVERLAP_VIOLATION

For each fixture/run, compare the normalized category multiset to the preregistered expected semantic categories. Missing categories and unexpected categories are both mismatches. Raw judge wording is retained separately.

Grounded Nancy B E8+E10 is a valid Gold relationship. Grounded Thomas wording that faithfully restates source-level "Supported the rollout" as "support for the rollout" must not normalize to UNSUPPORTED_OWNERSHIP.

## Two semantic replays

Run the semantic judge twice over the same saved candidate output without selecting, averaging or substituting either result.

If normalized semantic category sets differ between replay 1 and replay 2, record:
`JUDGE_INSTABILITY`

Judge instability is a separate validation finding. Neither run is chosen as authoritative merely because it matches the preregistration. Report both raw and normalized results.

## Elena reporting

Elena's missing CV-level pattern-seeking question is:
`ELENA_CAPABILITY_MISSING`

It is a complete-gate failure but must not be reported as a generated Mirror output-quality defect. Restraint (zero professional threads) is scored separately.
