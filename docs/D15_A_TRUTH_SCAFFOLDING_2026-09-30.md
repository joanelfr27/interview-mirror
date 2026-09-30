# D15-A Truth Scaffolding — Implementation Record

Status: IMPLEMENTED FOR REVIEW
Branch: `d15-a-truth-scaffolding`
Base: `46fbb70bae016633b817000acd89825fb00a7b18`

## Scope

D15-A changes only deterministic truth scaffolding. It does not replace the current lexical thread builder, implement D15-B semantic grouping, rewrite the Professional Story, alter D16/D17, or add a second CV parser.

## Decisions

### Maturity fails closed without canonical career context

Canonical E1 atoms/source spans currently do not carry a role, employer, or career-context identifier. Source-span count is not evidence of independent career contexts.

D15 therefore treats the available evidence as one unproven career context and caps any supported thread at `EMERGING_PATTERN`. It must not infer role blocks from CV headings/dates inside D15 because that would create a second parser.

Product consequence: every real CV, including genuinely multi-role CVs, is currently capped at Emerging. The Mirror cannot truthfully emit Supported Conclusion or Sustained Strength until canonical role-context evidence exists and is validated.

Multi-role maturity is unvalidated. Gold Set v1 contains single-role CVs and can validate the Emerging ceiling only. Multi-role behavior requires Gold Set v2 plus a canonical role-context contract.

### Not Said Yet is thread-level

Missing dimensions are deduplicated across the whole thread:
- OUTCOME: surfaced once only when no thread atom documents an outcome.
- SCALE: surfaced once only when no thread atom documents quantity, currency, team size, or scope.
- TIMING: surfaced once only when no thread atom carries a time value/time anchor.

UNKNOWN ownership alone does not create a generic ownership gap. Ownership questions require a meaningful evidence tension and belong to D15-B.

Timing limitation: CV dates commonly live on role headings rather than responsibility atoms. Until canonical role context links those dates to thread evidence, timing will often be correctly reported as absent from the current evidence model. Once role context exists, timing should inherit from the canonical role context rather than remain a permanent per-thread gap.

### Provenance

Thread maturity basis and every Not Said Yet gap carry the canonical evidence IDs and source-span IDs used to determine them. The validator independently recomputes both and rejects forged maturity, gap content, or provenance.

### Sustained interpretation suppression

The previous implementation manufactured a `SUSTAINED_STRENGTH` interpretation from three source spans. D15-A suppresses that interpretation because three lines do not prove cross-context recurrence.

## Test decisions

Changed test file:
- `tests/canonical-mirror-persistence.test.ts`

Existing tests that check thread construction, deduplication, contradiction, ownership compatibility, Story traceability, and lexical connection behavior keep their original purpose and assertions; they are not mechanically rewritten to Emerging.

Existing forged-maturity test remains intact.

Added explicit D15-A tests:
1. Three-line thread is capped at Emerging when career context is unproven.
2. Validator rejects a forged Sustained Strength on an unproven-context thread.
3. Thread-level OUTCOME/SCALE/TIMING gaps are emitted once with canonical provenance; UNKNOWN ownership creates no generic gap.
4. A dimension is not flagged when canonical thread evidence supplies outcome, scale, or timing.
5. Validator rejects forged Not Said Yet provenance.

## Gold rubric boundary

Gold Mirror Rubrics v1.1 remain DRAFT pending the required human review for Nancy, Marie, and Thomas. D15-A may proceed because it does not settle those semantic grouping judgments. The rubrics must be human-reviewed and frozen before D15-B is scored against them.

## Open upstream findings preserved

D15-A does not close or mask:
- Nancy support-judge second-facet (`.2`) omission;
- Elena E1 atomicity inconsistency;
- JD requirement extraction instability.

These remain separate upstream findings and must be resolved before the next full live-validation gate.
