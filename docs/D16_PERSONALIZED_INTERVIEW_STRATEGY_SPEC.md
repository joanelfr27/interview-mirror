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
→ Role Intelligence
→ Canonical Requirements
→ existing D1–D4 support/gap reasoning
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

## Canonical requirement reasoning

D16 reuses canonical requirement identities and D1–D4 reasoning.

It must not introduce a competing PROVEN/UNCERTAIN, fit-score, or proof-score ontology.

Canonical information remains authoritative:
- support types: DIRECT, PARTIAL, ANALOGICAL_TRANSFER, CONTRADICTORY, NONE;
- requirement status: SUPPORTED, PARTIAL, UNRESOLVED, CONTRADICTED;
- existing unresolved states defined by the canonical foundation.

D16 may add presentation-level concepts such as preparation priority or interview vulnerability, but these do not replace canonical states.

## Strategic Tensions

A Strategic Tension is a role-specific preparation issue where requirement importance, evidence relationship, contextual delta, and assessment context create meaningful interview exposure.

Selection must be deterministic and reproducible from validated inputs. Candidate-facing output is normally compressed to 1–3 high-leverage tensions; internal downstream payloads may retain the fuller validated assessment.

Selection must consider, as applicable:
- canonical requirement/status;
- validated criticality;
- evidence strength and provenance;
- contextual delta such as scope, ownership, complexity, seniority, scale or domain;
- Assessment Context;
- contradiction state.

The exact ordering/scoring formula is deliberately not frozen here; it must be adversarially reviewed before implementation. The LLM may explain a validated tension but may not invent or independently select one.

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
- supporting evidence/provenance IDs where applicable;
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
- D15 input is stale;
- unsupported criticality is asserted;
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

Role Capability Model + validated D15 + known Assessment Context → D16.

D16 must preserve uncertainty rather than pretending an inferred JD exists.

## LLM boundary

Deterministic code owns:
- canonical IDs and provenance;
- state validation;
- criticality validation;
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

D16 may identify likely probe families as practice targets, but it must not conduct the probe.

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
- candidate-facing output exceeding 1–3 tensions.

## Implementation sequence

1. Freeze this specification after Claude/Gemini adversarial review.
2. Define typed D16 contracts.
3. Implement deterministic assessment and validation.
4. Implement Action Dispatcher.
5. Add D17/D20/D21 handoff tests.
6. Add no-JD and Assessment Context tests.
7. Run canonical suite, typecheck and build.
8. Run CodeRabbit.
9. Perform independent adversarial audit against the exact commit.
10. Update the Master Research & Product Record only after the implementation audit passes.

## Second WOW

> “I now know what this interview is likely to test, what my experience can credibly prove, where I may be challenged, and what I need to practise.”
