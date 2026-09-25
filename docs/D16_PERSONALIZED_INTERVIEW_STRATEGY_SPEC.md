# D16 — Personalized Interview Strategy

## Status
Design freeze / implementation specification. This document defines the D16 contract; it does not implement D16.

## Purpose
D16 converts validated career evidence into a small, actionable interview-preparation strategy.

> Evidence tells us what the candidate can support. The role tells us what matters. Assessment context tells us how it may be tested. D16 finds the few things that matter most. Then it turns them into actions.

D16 is not a career report, generic fit score, second Professional Mirror, or interview simulator.

## Canonical flow
D1–D10 Canonical Evidence
→ D15 Validated Mirror/Story
→ Role Intelligence / existing canonical requirement graph
→ D6 Canonical Strategy Bridge
→ Strategic Tension Filter
→ D16 Validation Gate
→ Action Dispatcher
→ D17 Prepare / D20 Practice / D21 Feedback

**D20 asks the questions. D21 evaluates the answers. D16 identifies what should be tested but does not conduct the test.**

## Inputs

Required:
- validated D15 Professional Mirror/Story;
- Role Capability Model;
- canonical D1–D4 requirement/support/gap outputs.

Optional:
- Job Description;
- Assessment Context.

A JD is enrichment, not a prerequisite.

Assessment Context may include interview stage/type, interviewer role, expected format, relevant seniority, behavioral/technical/case/presentation/panel modality, and employer-provided instructions. UNKNOWN is valid. Missing context must never be invented.

## Role Intelligence and the Existing Canonical Strategy Foundation

Role Intelligence is a normalization/context layer, not a new evidence, requirement, fit/gap, or strategy ontology. D16 must build on the existing canonical requirement graph and D6 strategy bridge already established by D1–D6.

The existing architecture is authoritative in this order:

1. D1–D3 establish canonical requirement identities, provenance, support/status and evidence relationships.
2. D4 derives the existing canonical fit/gap and preparation states.
3. D5 derives demonstration objectives and truthfulness boundaries.
4. D6 projects those validated inputs into the canonical strategy bridge.

D16 consumes those validated identities and states; it does not regenerate them.

- Role Capability Model provides the authoritative role baseline and baseline requirement criticality.
- A JD may enrich employer-specific context and criticality only through deterministic, validated rules; JD wording is not itself ground truth.
- Assessment Context may modify assessment relevance and preparation priority, but must not invent a role requirement or baseline criticality.
- Every requirement entering D16 must resolve to an existing canonical `requirement_id` with traceable source/provenance.
- If a JD or Role Capability Model introduces a requirement not present in the canonical graph, D16 must use the existing canonical requirement-normalization path to reconcile it or leave it unresolved/fail closed; it must not create a parallel D16 requirement graph.
- D16 must reuse the D6 Canonical Strategy Bridge rather than recreate its evidence routing, fit/gap state, preparation state, or truthfulness-boundary logic.
- Ambiguous or unsupported requirement identity/criticality must remain unresolved or fail closed; it must not be completed by LLM inference.

### D6 → D16 contract

D6 is the canonical deterministic strategy foundation. D16 is the strategic prioritisation layer above it.

D6 supplies, at minimum:
- `requirement_id`;
- canonical requirement text and provenance;
- requirement status and route mode;
- canonical fit/gap state and gap classification;
- canonical preparation state and deterministic strategy action;
- requirement-local evidence/provenance;
- unresolved item associations;
- demonstration-objective associations and truthfulness boundaries.

D16 may select, compress, contextualize and explain these validated items, but must not change them. Any D16 field that appears to restate a D6 value must validate exactly against D6.

D16 must not use the legacy V23 EvidenceMap, V23 `PROVEN/PARTIALLY_PROVEN/UNKNOWN/NOT_DOCUMENTED` status model, or another competing proof ontology as an authoritative source. Legacy adapters may remain temporarily for compatibility, but D16 truth is canonical D1–D6 truth.

### Criticality derivation

Criticality is authoritative only when traceable to validated Role Capability Model data and deterministic contextual rules. The derivation must be reproducible from:
1. Role Capability Model baseline criticality;
2. validated JD-specific modifiers, where explicitly supported; and
3. Assessment Context relevance, where applicable.

For V1, D16 must preserve two distinct values:
- **role_criticality** — the validated baseline importance of the requirement in the Role Capability Model, optionally modified only by an explicitly supported deterministic JD rule;
- **assessment_relevance** — the validated relevance of that requirement to the stated Assessment Context.

Assessment relevance may change preparation priority, but may not silently overwrite role criticality.

If no validated deterministic modifier exists for a JD or Assessment Context, the baseline role criticality remains unchanged and the contextual input is represented separately. UNKNOWN context therefore cannot increase or decrease baseline criticality.

The exact typed values, modifier whitelist, precedence rules, and deterministic tie-breakers must be frozen in the implementation contract before implementation. LLM output may extract or normalize semantics, but may not assign final criticality.

## Canonical requirement reasoning

D16 reuses canonical requirement identities and D1–D4 reasoning.

It must not introduce a competing PROVEN/UNCERTAIN, fit-score, or proof-score ontology.

Canonical information remains authoritative:
- support types: DIRECT, PARTIAL, ANALOGICAL_TRANSFER, CONTRADICTORY, NONE;
- requirement status: SUPPORTED, PARTIAL, UNRESOLVED, CONTRADICTED;
- existing unresolved states defined by the canonical foundation.

D16 may add presentation-level concepts such as preparation priority or interview vulnerability, but these do not replace canonical states.

These presentation-level concepts are derived fields only:
- **preparation_priority** is deterministically derived from validated requirement status, criticality, evidence relationship, contextual delta, contradiction state, and Assessment Context; it is not a new evidence state.
- **interview_vulnerability** identifies a validated exposure created by the relationship between role requirement, candidate evidence, contextual delta, contradiction, and assessment context; it is not a diagnosis of candidate ability.
- **truthfulness/defense boundary** is constrained by canonical support/status and cited evidence. It states what the candidate can credibly claim and where transfer/uncertainty must be disclosed. It may be phrased by the LLM but may never widen, upgrade, or contradict canonical evidence.

Deterministic validation owns these derived fields. The LLM may explain or phrase them only within their validated inputs.

## Strategic Tensions

A Strategic Tension is a role-specific preparation issue where requirement importance, evidence relationship, contextual delta, and assessment context create meaningful interview exposure.

Selection must be deterministic and reproducible from validated inputs. Candidate-facing output is normally compressed to 1–3 high-leverage tensions; internal downstream payloads may retain the fuller validated assessment. Zero tensions is valid when no candidate meets the deterministic eligibility criteria; D16 must never manufacture a tension merely to fill the UI.

Selection must consider, as applicable:
- canonical requirement/status;
- validated criticality;
- evidence strength and provenance;
- contextual delta such as scope, ownership, complexity, seniority, scale or domain;
- Assessment Context;
- contradiction state.

The deterministic procedure must define, before implementation: candidate eligibility, exclusion rules, priority ordering, deterministic tie-breakers, and the 0–3 candidate-facing cap. The procedure must operate only on validated D6 inputs plus Role Capability Model and Assessment Context metadata. No LLM-generated ordering is authoritative. The LLM may explain a validated tension but may not invent or independently select one.

V1 must not introduce a second scoring ontology. If a numeric priority score is used internally, it is an implementation detail for deterministic ordering only and must not become a candidate-facing fit/proof score or replace canonical D1–D6 states.

## Grey-area rule

D16 identifies grey areas; it does not interrogate the candidate to resolve them.

Example:

“Transformation leadership — documented change-management experience is relevant, but available evidence does not establish transformation at the target role's scale.

What this means: expect questions testing scale, ownership and impact.
Prepare: a defensible transformation example and a truthful transfer explanation.
Practice: challenge me on this.”

Normal interview grey areas are valuable simulation material. D20 owns the probing.

If canonical evidence itself needs correction, clarification belongs in the canonical evidence/ingestion pathway, not a parallel D16 evidence-recovery loop.

## Action Dispatcher

Every surfaced D16 insight must map to an action:
- preparation objective → D17;
- practice target / grey-area challenge → D20;
- evaluation criterion / truthfulness boundary → D21.

Every downstream action retains:
- canonical requirement_id;
- an explicit evidence-reference mode, with V1 values:
  - `SUPPORTED_EVIDENCE` — the action asserts or relies on one or more validated candidate evidence/provenance references;
  - `NO_CANDIDATE_EVIDENCE` — the requirement is valid but no candidate evidence supports the action; a canonical reason/status must be carried;
  - `MIXED_EVIDENCE` — the action relies on both supported evidence and an explicit unresolved/contradictory relationship;
- evidence-reference mode is deterministic from the referenced canonical D6 state and evidence associations; it is not LLM-selected;
- supporting evidence/provenance IDs when the action asserts or relies on candidate evidence;
- an explicit canonical no-evidence state/reason when no candidate evidence exists, rather than silently omitting evidence;
- canonical support/status;
- criticality;
- Assessment Context;
- strategic significance;
- preparation objective;
- practice target;
- truthfulness/defense boundary.

## Validation Gate

D16 fails closed when:
- requirement_id is missing or unknown;
- evidence/provenance IDs are forged or mismatched;
- any material dependency is stale: canonical evidence/D15, Role Capability Model, JD, or Assessment Context;
- unsupported criticality is asserted;
- preparation_priority or interview_vulnerability is asserted without deterministic grounding;
- truthfulness/defense boundary exceeds or contradicts canonical evidence;
- contradiction is ignored;
- output lacks grounding;
- an action cannot be traced to a validated D16 finding;
- Assessment Context is presented as known when it is UNKNOWN.

Validation occurs before Action Dispatcher execution.

## Staleness and mutation

D15 may legitimately change when canonical evidence changes. Evidence provenance and audit history remain immutable.

D16 becomes stale when material inputs change:
- canonical evidence/D15;
- Role Capability Model;
- JD;
- Assessment Context.

Stale D16 must not silently drive preparation or simulation.

D16 never mutates D15 directly. New evidence must enter the canonical evidence architecture and trigger the appropriate D15 revalidation.

## No-JD mode

No-JD mode is first-class:

Role Capability Model + validated D15 + Assessment Context (which may be UNKNOWN) → D16.

D16 must preserve uncertainty rather than pretending an inferred JD exists.

## LLM boundary

Deterministic code owns:
- canonical IDs and provenance;
- state validation;
- canonical requirement identity validation;
- criticality derivation and validation;
- preparation_priority and interview_vulnerability derivation/validation;
- evidence-reference applicability and no-evidence representation;
- staleness validation across every material dependency;
- tension candidate selection;
- stale-state checks;
- output/action integrity.

LLM-assisted semantics may:
- explain validated relationships;
- summarize strategic significance;
- phrase preparation guidance;
- generate practice framing within validated boundaries.

The LLM must not:
- manufacture evidence;
- change canonical states;
- invent requirements;
- invent Assessment Context;
- select unsupported tensions;
- silently resolve contradictions;
- interrogate the candidate as an evidence-recovery loop.

## D15 boundary

D15 answers:

> What does my career actually say about me?

D15 is job-independent and reconstructs progression, scope, ownership, decisions, outcomes, capabilities and transferable evidence.

D16 answers:

> Given my actual experience and what this role requires, how should I prepare?

D16 must not duplicate D15's Mirror/Story or mutate it.

## D20/D21 boundary

D20 owns actual interview questioning, probing, challenge and simulation.

D21 owns evaluation of answers against preparation targets and truthfulness boundaries.

D16 may identify a probe family or practice target at the level of *what should be tested* (for example, scale, ownership, impact or transfer), but it must not generate or own the actual interview question set.

Existing V23 `likely_questions`, `likelyDifficultQuestions`, and similar question-generation outputs are therefore not D16 outputs. They must be retired from the D16 contract and ultimately owned by D20.

## Candidate experience

The D16 experience should answer:

> I now know what this interview is likely to test, what my experience can credibly prove, where I may be challenged, and what I need to practise.

Prioritize:
1. What matters most.
2. Why it matters.
3. What the evidence supports.
4. Where the grey area is.
5. What to prepare.
6. What to practise next.

Avoid a large diagnostic report; use progressive disclosure.

## Adversarial acceptance tests

At minimum:
- direct, partial, absent, transferable and contradictory evidence;
- title inflation / scope deflation;
- JD wishlist and explicit preferred requirements;
- ambiguous JD language;
- thin CV + rich Role Capability Model;
- adjacent-industry transfer;
- long single-role progression;
- French and English evidence;
- duplicate evidence reuse;
- stale D15;
- changed JD;
- changed Role Capability Model;
- changed Assessment Context;
- UNKNOWN Assessment Context;
- forged evidence IDs;
- invalid requirement IDs;
- unsupported criticality;
- LLM attempts to invent a tension;
- LLM attempts to resolve a contradiction;
- D16 attempts to ask candidate questions;
- candidate-facing output exceeding 3 tensions;
- zero tensions when no validated tension qualifies is accepted;
- D16 with no JD and UNKNOWN Assessment Context;
- deterministic Role Intelligence → Canonical Requirements identity and provenance;
- criticality derivation and contextual modification;
- stale canonical evidence/D15, Role Capability Model, JD, and Assessment Context each fail closed;
- evidence asserted without valid evidence/provenance IDs;
- no-evidence requirements represented explicitly without fabricated evidence;
- unsupported preparation_priority/interview_vulnerability/truthfulness boundaries;
- French evidence with French interview language;
- French evidence with English interview language;
- mixed French/English evidence and English/French JD or interview language;
- source language does not alter canonical reasoning, support/status, criticality, or tension selection.

## Implementation sequence

1. Reconcile this specification against the existing D1–D6 strategy architecture.
2. Freeze this specification after Claude/Gemini adversarial review.
3. Define typed D16 contracts.
3. Implement deterministic assessment and validation.
4. Implement Action Dispatcher.
5. Add D17/D20/D21 handoff tests.
6. Add no-JD and Assessment Context tests.
7. Run canonical suite, typecheck and build.
8. Run CodeRabbit.
9. Perform independent adversarial audit against the exact commit.
11. Update the Master Research & Product Record only after the implementation audit passes.

## Second WOW

> “I now know what this interview is likely to test, what my experience can credibly prove, where I may be challenged, and what I need to practise.”
