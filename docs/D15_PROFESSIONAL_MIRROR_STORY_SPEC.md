# D15 — Professional Mirror & Story 2.0

## Purpose
D15 turns the canonical D1–D10 EvidenceLedger into a candidate-facing Professional Mirror and Professional Story.

D15 is a point-in-time projection of the current canonical evidence. It may persist the candidate's current validation state, but longitudinal evolution across future evidence and sessions belongs to D23.

## Product contract
- Mirror and Story are one discovery/storytelling experience.
- Professional Mirror is an evidence-grounded reconstruction of progression, scope, ownership, decisions, outcomes, capabilities, and transferable evidence.
- Professional Story is the human-readable narrative emerging from supported connections in the Mirror.
- Career Cobweb is a conceptual evidence graph, not a required spider-web visualization.
- Every substantive statement is classified as Fact, Pattern, or Interpretation and carries evidence IDs.
- Patterns and Interpretations require at least two independent source spans.
- Exact duplicate imports do not count as independent evidence.
- Negated evidence cannot support a positive Mirror claim.
- Ambiguous or contradictory evidence must fail closed or remain at a lower maturity until clarified.
- Insufficient evidence fails closed.
- Strategy remains a separate role-specific experience in D16.\n- D15 is job-independent: it describes the candidate career whether or not a target job exists.\n- D15 must not evaluate fit to a role or prescribe how the candidate should bridge a role gap.

## Evidence independence
D15 must not create a second extraction/canonicalization pipeline.

Instead, it applies a deterministic projection over canonical atoms:
- preserve source_span provenance;
- collapse exact duplicate claims/imports;
- retain materially distinct career-stage evidence as independent;
- require distinct source spans for Pattern/Interpretation statements;
- never use repetition of the same canonical claim as proof of career progression.

The independence rule is intentionally evidence-based rather than a hard two-roles-and-two-periods formula. Distinct roles and periods are strong signals, but a single long role may contain genuinely distinct responsibility stages.

## D15 v1 projection
Input: validated D1–D10 EvidenceLedger.

Output:
- evidence references;
- deterministic evidence connections;
- career threads;
- evidence maturity;
- Fact / Pattern / Interpretation statements;
- a concise Story assembled only from supported statements.

Deterministic thread matching may connect evidence through shared object, domain, tool, standard, or repeated action. It must use the canonical evidence fields rather than inventing new facts.

The first implementation is deterministic. LLM narrative generation is deferred until evidence-addressability can be validated against the deterministic projection.

## Candidate experience
The entry experience is intentionally minimal:
1. One primary Career Reveal, only when evidence supports one.
2. Primary CTA: Start Preparing.
3. Secondary CTA: Show Me Why.
4. Secondary threads, detailed evidence, maturity, and candidate validation controls are progressively disclosed.
5. If no sufficiently supported thread exists, suppress the reveal and provide a graceful preparation-oriented fallback.

D15 must never require the candidate to inspect evidence before accessing preparation.

## Candidate validation boundary
D15 may persist current interpretation state such as:
- Accepted;
- Corrected / Context Added;
- Rejected.

A rejected interpretation must not appear in the current Story projection.

D15 does not own historical evolution of the Mirror across future evidence, sessions, or interview performance. That longitudinal evolution belongs to D23.

## Traceability and fail-closed rules
- Every substantive Mirror/Story claim must map to canonical evidence IDs and ultimately source spans.
- Story opening must identify its supporting Mirror statement.
- Story thread references must point to existing Mirror threads.
- Story statement references must belong to the referenced thread.
- No evidence path means no claim.
- Negated or candidate-elicited evidence cannot silently become positive documented evidence.

## D16 boundary\nD16 consumes the validated D15 Mirror/Story plus a target role capability model. A Job Description is optional enrichment, not a prerequisite for Strategy.\n- With a JD: D16 combines the canonical role capability model with role-specific requirements from the JD.\n- Without a JD: D16 uses the canonical role capability model for the selected target role.\n- D16 determines the bridge between demonstrated career evidence and role requirements: demonstrated, needs stronger demonstration, needs verification, or preparation gap.\n- D16 consolidates D15 evidence rather than repeating the Professional Mirror.\n- D17–D24 turn the resulting bridge into preparation, practice, simulation, feedback, and improvement.\n\n## Non-goals
- no new extractor
- no new evidence ontology
- no replacement of D1–D10
- no target-JD matching
- no strategy redesign
- no D23 longitudinal history/evolution
- no interview simulation changes
- no autonomous browser/computer use
- no literal cobweb visualization requirement
- no numerical career scoring
- no raw ontology, node IDs, vector distances, or LLM confidence metrics in the candidate UI
- no free-form chatbot interrogation inside the evidence drawer in D15 v1

## Acceptance gate
1. D15 consumes only EvidenceLedger objects.
2. Every emitted substantive statement has source evidence IDs.
3. Every Pattern has at least two distinct source spans.
4. Every Interpretation has at least two distinct source spans.
5. Exact duplicate imports do not increase pattern strength.
6. Output is deterministic for identical input.
7. Story statements trace back to Mirror evidence and valid thread relationships.
8. Negated evidence cannot support a positive Mirror claim.
9. No target JD is required or consumed by the D15 projection.\n10. D15 contains no role-fit or gap-bridging logic; that belongs to D16.\n11. D16 can operate with a role capability model when no JD is available.
12. Canonical tests, typecheck and build pass.

## Candidate-facing WOW
The preferred reveal is one high-value, evidence-backed thread that connects concrete career stages the candidate already experienced but may not have consciously connected.

"The Mirror is allowed to surprise the candidate. It is not allowed to surprise the evidence."
