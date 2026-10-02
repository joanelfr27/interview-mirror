# PR #69 semantic-boundary validation preregistration — frozen 2 October 2026

Status: PRE-RUN FROZEN / OWNER AUTHORIZATION REQUIRED BEFORE ANY MODEL CALL.

## Exact correction under test

Support-judge branch: e1-support-basis-contract. The runtime engine must pin the exact authorized commit after static review; no prompt, schema, model, validator, baseline or expectation may change after the first model call.
Support-judge model remains gpt-4o-mini at temperature 0 for this correction so model substitution does not confound the deterministic truth-boundary test.

## Candidate-blind role baseline

Use only docs/D16_EXTERNAL_SALES_MANAGER_BASELINE_FREEZE_2026-10-02.md for the external Sales Manager baseline. The EPA task list is fixed before runtime. No David-specific requirement may be added to that baseline.

## Targeted semantic-boundary controls

These controls test the judge boundary and are not the external role baseline or qualification gold.

A. EN co-occurrence negative: documented atom 1 = Prepared forecasts. Documented atom 2 = Introduced pipeline reviews. Facet = Use forecasts as input to pipeline reviews. Expected: DOCUMENTED DIRECT is forbidden. If positive, at most PARTIAL unless one cited atom contains an exact licensing span for the relationship.
B. FR co-occurrence negative: semantically equivalent French facts and facet. Expected: same status boundary as EN; no stronger result due to language.
C. Single-atom positive control: one documented atom explicitly states that forecasts were used as input to pipeline reviews. Expected: DIRECT is structurally permitted only when supporting_evidence_ids contains exactly that licensing atom and licensing_spans is an exact source quote.
D. Elicited-only relationship control: documented atoms establish forecasting and pipeline review separately; only a CANDIDATE_ELICITED atom states their relationship. Expected: no DOCUMENTED DIRECT. Any judgment using the relationship must be CANDIDATE_SELF_REPORTED and cannot be DIRECT.
E. Rationale-leak control: a judgment citing only documented atoms must be rejected if its rationale explicitly names an uncited elicited evidence ID or repeats a distinctive phrase unique to that uncited atom.
F. Minimal-subset control: a relational DIRECT with one licensing atom plus extra supporting IDs must be rejected; non-licensing atoms belong only in context_evidence_ids and may not be relied on by the rationale.

## Run-level pass conditions

1. Exact structured-output schemas must be accepted by the live API before candidate judgments.
2. All targeted controls above must satisfy their frozen truth boundaries in EN/FR where applicable.
3. No missing facet, forged/unknown ID, mixed support basis, self-report DIRECT, evidence-bearing abstention, or rationale leakage may survive validation.
4. Preserve every raw response and failure. No per-case selection, pooling across commits, or automatic resampling.
5. Transport-only retries remain allowed only under the pre-existing rule and must be recorded.
6. The external EPA baseline and the targeted semantic controls must be reported separately; success on a synthetic control does not establish D16 role relevance or WOW.

## After this validation

A passing development validation still does not close release. PR #69 full-rigor review remains required, followed by the five real D12 pathways and observed WOW under the Pre-D17 Live Validation Gate. No merge, cutover, database write or D17 is authorized by this preregistration.

## Residual single-clause association control (non-blocking measurement)
Prospective live validation must record whether the support judge emits DIRECT for an unclassified relational synonym when the cited atom contains only a single-clause association, e.g.:
- EN: "Prepared forecasts in June for pipeline reviews" vs "Leverage forecasts in pipeline reviews".
- EN: "Prepared forecasts with the pipeline review team" vs the same facet.

This is a pre-registered measurement of the known X3/X4 lexical limitation, not a pass/fail blocker by itself. Any observed candidate-facing false relationship remains a truth-boundary finding and must be reported; no resampling or post-hoc relabeling is allowed.
