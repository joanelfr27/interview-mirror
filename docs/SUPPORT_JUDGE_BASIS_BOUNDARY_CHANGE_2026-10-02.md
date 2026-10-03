# Canonical support judge basis boundary-change candidate

Decision record created after failed runs 37040330015 and 37048265878, before any call using the new schema. This is an isolated locked-judge request-contract correction, not a D16-only content patch or release authorization.

## Observed defect and contract reconciliation

The frozen d15-lock-v2 support judge blob is 8387fc0 (full SHA recorded in the audit manifest). Its schema and canonical model permit DOCUMENTED and CANDIDATE_SELF_REPORTED only. Both sanitizer and graph validation reject judgments combining documented and elicited citations; self-report cannot be DIRECT. The error's phrase "requires an explicit mixed basis" is not an implemented permission: no MIXED value exists. D16 MIXED_EVIDENCE is an action reference mode with a different meaning, not a support basis.

Original engine 27100e6c omitted atom source types in the judge input. Correction fe41bbc35b22ff97d06ed9b59792cdc93eff2b3c exposed source/basis and added single-basis instructions, but both David cases still mixed the forecasting citations. Both completed runs failed before D16 selection. The prompt correction was insufficient. Do not claim it repaired runtime behavior.

The fe41bbc correction changed the locked judge request and diagnostics. It was published as draft PR 68 without first recording the boundary review in the master record. This procedural omission is recorded; the branch remains unmerged. New work requires the full boundary-change process before locked-line merge/cutover.

## Proposed request grammar

Generate nested anyOf judgment branches from the supplied ledger: documented positive statuses may cite only documented IDs; self-reported positive statuses may cite only elicited IDs and exclude DIRECT; abstained NONE must have no citations. Omit positive branches whose source class is empty. Unknown IDs, mixed source lists, positive empty lists, and NONE with citations are unrepresentable under the schema. Existing sanitizer, canonical model, support/status aggregation and missing-facet abstention remain unchanged. No MIXED support basis, model switch, new evidence ontology, post-response splitting or upgraded claim is introduced.

Each candidate-facing support claim remains subject to existing independent evidence/facet/graph validators. The schema narrows representable outputs; it does not establish semantic support or qualify the model. Preserve rejected raw responses and seeded support inputs in development artifacts. AJV is a dev-only independent JSON Schema validator for adversarial contract tests.

API syntax follows OpenAI's official Structured Outputs documentation: nested anyOf, enums, minItems/maxItems for non-fine-tuned models. Exact ledger schemas still require API compatibility checking in the next authorized diagnostic; no compatibility PASS is claimed from local validation.
https://developers.openai.com/api/docs/guides/structured-outputs

## Full-rigor gate

1. Pin original/changed judge, canonical model, model configuration, tests, fixtures, codebook and scoring blobs; preserve both failed runs and hashes.
2. Verify schema with an independent JSON Schema validator: homogeneous documented/self-report accept controls; mixed-basis, wrong-basis, forged ID, self-report DIRECT, positive-without-citation, contradictory/negative and empty-ledger reject/abstention controls. Run canonical suite, typecheck and build. Run existing ownership/truth regressions unchanged.
3. Obtain independent review of the boundary diff before locked-line merge/cutover. Draft PR review and local checks are not release approval. Retain an exact source/audit pack for owner-supplied independent audit.
4. A fresh four-case validation, if the owner authorizes resampling previously successful outputs, must be prospective and entirely pinned to one engine. All prior outputs remain historical. No pooling of runs into a single-commit PASS. One attempt per case, existing transport-only retry allowance, no prompt/model/scorer changes after output, failures preserved, all cases attempted. No automatic second run.
5. Full release/locked-boundary gates, disjoint expert-labelled qualification, real D12 pathways/WOW and Pre-D17 remain open. No database calls, cutover, locked-line merge or D17 is authorized here.

## Prospective four-case validation (prepared; not dispatched)

Cases and unchanged expectations are those in D16_AUTOMATIC_DEVELOPMENT_PREREGISTRATION_2026-10-02.md: Nancy/Thomas saved synthetic standards comparison, David EN/FR no-JD five-requirement role with simulated prior elicitation. All use one corrected engine; no E1 extraction or D15 G/S rerun. Expected calls: two existing model capability probes, two exact support-schema compatibility probes, two David support judgments, up to four selectors. If schema compatibility fails, abort before candidate judgments. If later a case fails, preserve it and attempt remaining cases once. Semantic relevance/action content review remains mandatory.

Owner decision required only to override the existing "successful model outputs will not be resampled" master-record instruction for this separately labelled validation. This document does not grant that exception itself.


## 2 October semantic HOLD and general correction

Authorized development run 37052068438 showed that structural basis isolation was necessary but insufficient. The exact EN/FR schemas were API-compatible, yet ROLE-FORECAST-F0 was returned as DOCUMENTED DIRECT by composing separate documented forecasting and pipeline-review activities. The French rationale also explicitly relied on an elicited atom outside the returned supporting IDs. This is a semantic truth-boundary defect in the canonical support judge, not a D16 selector defect. The run remains preserved as failed validation evidence.

The correction therefore reuses the frozen D15 G relationship-grounding principles rather than adding case-specific exceptions:

- Co-occurrence is not a relationship; chronology does not license causality, purpose, response or mechanism. Independently of connector classification, DIRECT support may not compose atoms from different source spans; multiple DIRECT atoms are permitted only when they preserve the same source-span reference.
- A conservative deterministic classifier identifies unambiguous relational wording such as input-to, based-on, response, causality, feeding, shaping, enabling, influence or dependency. Ambiguous lexical tokens are not automatic semantic labels: chronology licenses sequence only, and habitual/purpose/recipient forms such as English “used to” or French « pour » require semantic interpretation. The general DIRECT anti-composition invariant remains the fail-closed backstop when the classifier does not fire.
- For relational DIRECT, the judge must return the asserted connector and exact licensing span(s). The connector must occur explicitly in the facet wording and in each exact licensing span; each licensing span must occur verbatim in the minimal supporting evidence. When multiple atoms are cited, the relationship itself must be licensed within one cited atom; independent activities cannot be composed into DIRECT.
- supporting_evidence_ids is the minimal licensing subset. context_evidence_ids is optional non-licensing context and must be disjoint. Abstentions carry neither.
- Rationale consistency is checked independently: an uncited evidence ID, or a distinctive exact phrase uniquely traceable to an atom outside the minimal subset, rejects the judgment. Because lexical checks cannot prove the absence of paraphrased/translated hidden reliance, an accepted model-written rationale is never propagated: the canonical rationale is regenerated deterministically from the validated minimal IDs, status, connector and exact licensing spans. The raw model response remains in diagnostics for audit.
- The pre-existing MBA/Finance sanitizer guard is retained unchanged to avoid an unrelated regression. The relational correction adds no new credential-specific or candidate-specific rewrite.
- No MIXED support basis is introduced. A relationship supported only by elicitation remains CANDIDATE_SELF_REPORTED and cannot be DIRECT.
- The support judge remains on the existing gpt-4o-mini configuration for this correction. Changing the model at the same time would confound whether the deterministic boundary itself fixed the defect. Model adequacy remains a qualification question after the boundary passes static/adversarial review.

No new live/model validation is authorized by this record. Before any such run, the independent EPA Sales Manager role baseline, prospective expectations, exact correction commit, tests and provenance must be frozen. PR #69 remains HOLD until full-rigor review is complete.


## Independent assistant audit before Claude — 2 October 2026

The full PR #69 boundary was re-audited against the frozen D15 G/S codebook in the master research record before any new live run. Two confirmed issues were corrected:

1. The relational regex was broader than the frozen G semantics: chronology and ambiguous habitual/purpose wording were being treated as automatic relational labels. The classifier is now conservative; chronology and ambiguous “used to”/« pour » forms are not automatic labels, while the general DIRECT anti-composition invariant remains authoritative.
2. The sanitizer error text incorrectly said mixed documented/elicited support “requires an explicit mixed basis” even though no MIXED support basis exists. The message now correctly states that mixed bases are not permitted in one support judgment.

Concurrent Copilot hardening additionally requires a relational DIRECT licensing quote to bind content from both sides of the facet relationship in the same clause, and adds Unicode/French regression coverage. These changes are included in the exact Claude audit target and must be independently reviewed rather than assumed correct.

No live/model validation was performed during this audit. The next gate is an independent Claude audit of the exact pinned commit after static CI is green.
