# D15-A Truth Scaffolding — 2026-09-30

Status: implementation record. Gold Mirror Rubrics v1.1 remain DRAFT pending human review before D15-B.

## Scope implemented

D15-A changes deterministic truth scaffolding only. It does not change the lexical/semantic grouping authority, does not freeze the Gold rubrics, and does not modify D16 or D17.

### Maturity

Canonical atoms and source spans currently have no role/employer/career-context identifier. D15 therefore must not infer role blocks or use source-span count as a proxy for independent career contexts.

Fail-closed rule:
- any supported thread with evidence is capped at EMERGING_PATTERN while canonical role context is unavailable;
- SUPPORTED_CONCLUSION and SUSTAINED_STRENGTH are unavailable in candidate-facing output until canonical role-context evidence exists;
- generation and validation use the same rule;
- forged higher maturity remains invalid.

Product consequence: genuinely multi-role CVs are also capped at Emerging for now. This is a known limitation, not a bug. Multi-role maturity is unvalidated and requires a future Gold Set v2 plus canonical role-context support.

### Not Said Yet

Not Said Yet is computed once per thread, not once per atom.
- OUTCOME is surfaced only when no evidence in the thread documents an outcome.
- SCALE is surfaced only when no evidence in the thread documents quantity, currency, team size, or scope.
- TIMING is surfaced only when no evidence in the thread documents start, end, or recency.
- ownership is intentionally not emitted as a generic deterministic gap merely because ownership is UNKNOWN; ownership tensions/questions belong to bounded semantic reasoning where the evidence warrants them.
- every gap carries the thread evidence IDs and source-span IDs used to derive it.

Known timing limitation: dates commonly live on role headings rather than responsibility atoms. Until canonical role context can propagate role timing, many real threads will correctly appear to lack timing under the current evidence model. Once role context exists, role timing should satisfy thread timing where justified instead of remaining a universal gap.

### Provenance

Each thread now carries:
- maturity;
- maturity basis with context status, evidence IDs and source-span IDs;
- deduplicated Not Said Yet gaps with evidence IDs and source-span IDs.

## Test decisions

Changed test file: `tests/canonical-mirror-persistence.test.ts`.

1. `D15 builds an evidence-grounded Mirror`
   - Original purpose retained: construction + validation of a grounded Mirror.
   - Added D15-A assertions because maturity/provenance/gaps are now part of the grounded contract.
   - The expected maturity is Emerging because no canonical role context exists; this is not a mechanical assertion flip.

2. `D15 validator rejects forged maturity`
   - Strengthened and renamed to `D15 validator rejects forged sustained maturity without proven career contexts`.
   - It now forges SUSTAINED_STRENGTH on an actual multi-line thread and its Pattern statement, proving the validator rejects the same unsupported maturity that generation refuses to emit.

3. Added `D15-A computes Not Said Yet once per thread and suppresses dimensions documented anywhere in the thread`.
   - Verifies thread-level deduplication and that one documented outcome/scale/timing anywhere in the thread suppresses that gap.

No other existing test was changed merely to accommodate a new maturity label.

## Gold-rubric boundary

Nancy, Marie and Thomas human-review items remain open. No AI judgement is recorded as human review. Gold Mirror Rubrics v1.1 must be human-reviewed and frozen before D15-B is scored against them.
