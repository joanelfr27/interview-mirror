# D16 evidence linked PREP and PRACTICE actions

Date: 2 October 2026. Design amendment for review; not implemented or qualified. This extends the frozen D16 action contract and preserves its canonical ontology, deterministic tension selection and D20/D21 boundaries.

## Problem and intended behavior

The pinned diagnostic produced generic actions with no candidate evidence links. A zero evidence denominator is now reported correctly, but that does not make those actions useful. A preparation action must tell this candidate which documented example to assemble, which part of the role it addresses, what remains unproved and what to practise saying truthfully.

Nancy's international-standards tension is the first yardstick. Compare her action text with Thomas's portal CV against the same role requirement: the evidence selection and preparation task must change, or the action must explicitly acknowledge that no relevant candidate anchor exists. Fixed counts of three tensions or nine actions are not acceptance criteria.

## Inputs and ownership

Reuse the validated D16 inputs: canonical ledger, D15 Mirror/Story, D6 Strategy Bridge, Role Capability Model, optional JD and Assessment Context. The implementation must expose accepted G/S relationship references through the existing D15 contract, not a second evidence extractor or an unvalidated script result. Reject stale inputs before generation. A thread reference resolves to its original atoms, source spans, G/S verdicts and fixed proposition.

A CONFIRMED_RELATIONSHIP is available as a self-reported preparation anchor. It does not prove recurrence, independent verification, the role requirement or a capability. Requirement/facet support still comes from canonical support judgments and the D6 bridge. Recomputing support or mapping a new answer to a requirement must use that existing path. D16 cannot grant DIRECT support from an accepted headline.

No D16 question is asked to recover evidence. PREP describes work the candidate can do; PRACTICE defines a task/probe for D20. D21 evaluates an actual response later. New evidence collected elsewhere must pass E1 and revalidated D15 before D16 is recalculated.

## Action reference amendment

Current D16 evidence_reference_mode describes whether an action relies on candidate evidence; it is not a requirement-proof verdict. Keep SUPPORTED_EVIDENCE, NO_CANDIDATE_EVIDENCE and MIXED_EVIDENCE and all canonical requirement states. Do not add another proof taxonomy.

For the revised action contract, distinguish two reference purposes explicitly:

- requirement_proof_refs: canonical evidence IDs and provenance IDs already mapped to the target requirement/facet by D6, with their canonical support states;
- preparation_anchor_refs: canonical evidence IDs and source-span IDs selected to help assemble or discuss an example, without asserting requirement support;
- d15_thread_refs: optional references to validated, current accepted relationships and their supporting canonical IDs, with self-report provenance visible.

These are routing purposes over the same canonical evidence, not new facts or support states. Existing evidence_ids must not be silently repurposed: introduce and validate a versioned action payload when implementing this amendment. Resolve displayed source text from canonical spans rather than storing a new paraphrased evidence bank.

An action that uses contextual CV anchors relies on candidate evidence even when requirement_proof_refs is empty. Its action evidence_reference_mode reflects that reliance, while canonical_status and wording still say that the requirement is unconfirmed. A tension's requirement-evidence state and its action's contextual anchors need not match; the revised validator must check both roles explicitly rather than copying a mode blindly.

Each PREP/PRACTICE action carries the selected tension/requirement ID, exact missing facet IDs, reference purposes, candidate ownership boundary, preparation instruction, expected preparation artifact or practice target, source language/product language, and dependency snapshot. Do not make all fields candidate-facing. Evidence links should open the familiar evidence drawer.

## Generation and validation

Keep tension selection, ranking and criticality deterministic. Resolve evidence/anchors only from supplied canonical IDs. A constrained writer may phrase the preparation instructions, but may not choose unsupported requirements, invent candidate facts or silently widen ownership, scope, standards, outcomes or causal links.

Before accepting an action, validate canonical and facet identity, source/provenance matching, thread acceptance and freshness, permitted self-report use, contradictions and consistency with the tension's truthfulness boundary. Check references by their declared purpose. A contextual anchor cannot be counted as proof of a missing facet. Explicit other-actor work cannot become candidate-owned work.

PREP should identify one usable example and what to assemble. PRACTICE should name what the candidate needs to demonstrate or defend, anchored in that example. A bare instruction to “prepare an example” or “practise explaining transfer” does not pass the Nancy personalization yardstick.

When no relevant anchor exists, retain a role-based preparation action only with explicit lack of candidate-specific grounding. Do not fabricate a personalized story or label this fallback as successful personalization. Zero selected tensions and zero actions remain valid where the canonical state warrants them. EVALUATION payloads may carry D21 criteria; no performance result is invented.

## Nancy standards yardstick

Source anchors:

- “Managing statutory financial reporting and taxation requirements.”
- “Supporting acquisition accounting and financial integration activities.”
- “Implementing and improving accounting systems and processes.”

No named international standard is established by these anchors. The previously selected requirement was Experience with International Standards. These source lines can support preparation; they do not prove IFRS or another named standard. A finance-through-change relationship may be used only if actually accepted by current G/S; none is assumed here.

PREP: Choose one statutory-reporting or acquisition-accounting example. Prepare the accounting issue, the task you personally performed and the integration team's separate responsibilities. Identify the standard, jurisdiction and period only if you can substantiate them. Bring an anonymized source or a precise account of applying the relevant rule. Otherwise leave international-standard experience unconfirmed; system implementation does not prove IFRS expertise.

PRACTICE: Practise explaining that example in response to “Which international accounting standard did you apply, and what did you personally do?” If no standard can be established, distinguish the documented reporting/integration work from the unverified requirement. Prepare to explain what accounting judgment you made and what could substantiate it. Do not upgrade supporting integration to leading it.

French wording and the fuller human yardstick remain in D16_NANCY_ACTION_YARDSTICK_2026-10-02.md. A generated action must preserve the same boundary and identify its actual canonical source references.

## Development checks before a paid run

1. Nancy versus Thomas, same requirement: Nancy uses accounting/reporting anchors. Thomas must not inherit those anchors or IFRS claims; absent relevant evidence is explicit.
2. One self-reported CONFIRMED_RELATIONSHIP: usable contextual anchor, one support unit, no requirement-status upgrade.
3. Named other actor: retain actor ownership and the candidate's limited contribution. Do not infer that the candidate ran the other actor's process.
4. Partial answer or denial: no accepted relationship reference; unanswered/follow-up state stays in E1/D15 conversation metadata.
5. Unsupported standard, outcome, ownership or number: reject the action claim or remove the unsupported wording; never alter the evidence to rescue it.
6. Forged ID, wrong span, stale thread, changed ledger/JD/RCM/context: fail closed before dispatch.
7. Contradictions, transferable and no-JD cases: preserve canonical boundaries and employer-specific uncertainty.
8. EN/FR actions: preserve agency, modality and source language semantics; no strengthened translation.

Report raw denominators separately: actions using requirement-proof references, actions using contextual anchors, actions with no candidate evidence, and linked-reference validity. Zero applicable cases is NOT_EVALUATED. Personalization requires the candidate-swap content comparison; linked IDs alone cannot pass it.

## Exit and next step

Review this amendment and the Nancy/Thomas expected behavior before modifying the D16 payload and validator. Then implement one controlled PREP/PRACTICE slice, run pre-spend tests and one pinned development comparison. Keep qualification, production cutover, database writes, live persistence and the Pre-D17 Live Validation Gate separate. The current five-case D15 artifact is development evidence, not a D16 release authorization.

## Implemented first development slice — 2 October

`buildD16PreparationActions` and its validator now provide `d16-preparation-v2-development` in the existing D16 module. The legacy D16 builder, validator and production routing remain unchanged. Tensions still come from the existing deterministic builder; the slice emits PREP/PRACTICE only, without inventing evaluation results.

Preparation selections are explicit curated requirement-to-evidence mappings. This first slice does **not** automatically establish contextual relevance. Nancy/Thomas tests are controlled fixture comparisons using real source wording, not new assembled-CV/model runs. No personalization qualification follows from their passing. Coverage reports keep personalization NOT_EVALUATED until a separate content review.

The payload separates D6 requirement-support references from contextual source references and accepted D15 relationship IDs. Canonical requirement status is copied without upgrades. A full dependency fingerprint includes ledger, D6, D15 result, selected anchors, RCM, JD, context and language. Tampering or stale material fails closed. Accepted D15 results must retain both positive validated axes, a matching headline, current codebook, exact licensing spans and no vetoes; D16 does not create or re-judge a relationship. This validates the supplied existing D15 result contract, not the semantic correctness of the judge itself.

Instructions quote canonical sources, keep others' work distinct, mark self-reported relationships as self-report, and forbid turning support into leadership or unestablished standards into facts. Missing relevant anchors yield an explicit fallback. EN/FR wording is supplied; source text remains in its original language. No free-form action writer is enabled, which makes the v2 validator able to reject an altered instruction exactly.

Pre-spend validation: typecheck and 338 tests (337 canonical plus the D14 runtime gate) passed. Six new checks cover Nancy's contextual accounting/non-IFRS boundary, Thomas's fallback against the same standards requirement, tampered claims/forged IDs/stale source, other-actor ownership, single-answer accepted D15 self-report, and French instructions.

Remaining: independent review of this versioned amendment/implementation; an actual assembled Nancy/Thomas comparison; broader contradictory, facet, denial/partial and no-JD cases; candidate-relevant anchor selection beyond curation; and a pinned paid development run only when its outputs answer a new question. Production cutover, qualification, persistence and D17 remain closed. A matching source reference alone is not a semantic-relevance pass.

### Review corrections and assembled runtime comparison

Internal review added a second application of existing D15 deterministic vetoes at the D16 boundary (a positive supplied G/S flag cannot bypass current attribution vetoes) and an explicit candidate-facing contradiction warning. Further regressions preserve zero-action states and reject unresolved/denied relationship references. Typecheck and 341 tests pass after these changes (340 canonical plus D14 runtime).

The controlled runner `scripts/d16-evidence-linked-development.ts` assembles E1 through D6 from every responsibility line in the familiar Nancy and Thomas fixtures against one identical standards JD. It does not read sessions or write a database, rerun the D15 judges, introduce a new model, or claim these are full uploaded CV documents. RCM criticality and the contextual Nancy anchor selection are explicitly curated development inputs. Requirement extraction is separate per candidate and must be inspected for comparison equivalence. The complete ledger, D6 bridge, Mirror, model capability provenance, dependency fingerprint and dispatched actions are saved before/after dispatch so the expensive upstream calls need not be repeated for offline D16 changes. Content review remains NOT_EVALUATED until the actual outputs are read; no structural pass is a personalization claim.

## Automatic context selection development extension

The next slice adds a constrained semantic selector over canonical source atoms and already accepted D15 relationships. Its only output authority is contextual preparation relevance. Deterministic D16 code continues to select/rank/cap tensions and derive criticality, states and truthfulness boundaries. The selector cannot produce requirements, proof judgments, headlines, actions or candidate answers. Guidance remains a deterministic projection of canonical sources and missing facets.

The selector first rebuilds and validates the existing D1–D6 and D15 projections from the saved ledger, then checks supplied D15 licenses, source eligibility, closure and current deterministic vetoes. Known IDs, bounded selection counts and rationale shape are enforced. Model relevance explanations stay internal and are explicitly pending content review. An empty relevant-anchor choice is valid, and zero eligible tensions costs no model call. Async dependency mutation is rejected; outputs retain a full JSON-stable dependency fingerprint.

D16PreparationInputs optionally records selection_source=AUTOMATIC_CONTEXT_SELECTOR; actions distinguish automatic context from curated context and no relevant anchor. No selector result can change requirement_proof_refs or canonical status. Guidance now also carries the selected tension's priority, criticality, assessment context, objectives and traceable missing facets. D21 evaluation remains the existing deterministic criteria handoff, not an invented performance result.

The one-run input/expectation freeze is docs/D16_AUTOMATIC_DEVELOPMENT_PREREGISTRATION_2026-10-02.md. Tests use saved canonical inputs and genuine EN/FR accepted CONFIRMED_RELATIONSHIP objects from the earlier simulated loop; conservative synthetic support controls are disclosed and are not represented as model output. The runtime comparison uses the existing canonical support judge only for the explicit new five-requirement role and never reruns E1 or D15 judgments. Both Nancy and Thomas discard curated anchor mappings before the selector sees their inputs.

Copilot and CodeRabbit findings at 85bab330 are recorded in D16_REVIEW_DISPOSITIONS_2026-10-02.md. The old content replay remains an immutable historical artifact; a new run gets a separate report. Qualification, production cutover, database writes, locked-line merges, real pathway/WOW validation and D17 remain closed.
