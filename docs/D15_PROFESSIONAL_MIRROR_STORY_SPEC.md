# D15 — Professional Mirror & Story 2.0

## Purpose
D15 turns the canonical D1–D10 evidence ledger into a candidate-facing Professional Mirror and Professional Story.

D15 is a projection layer. It does not extract new evidence, re-run fit/gap reasoning, or create role-specific strategy.

## Product contract
- Mirror and Story are one discovery/storytelling experience.
- Professional Mirror is an evidence-grounded reconstruction of progression, scope, ownership, decisions, outcomes, capabilities, and transferable evidence.
- Professional Story is the human-readable narrative emerging from supported connections in the Mirror.
- Career Cobweb is a conceptual evidence graph, not a required spider-web visualization.
- Every substantive statement is classified as Fact, Pattern, or Interpretation and carries evidence IDs.
- Patterns require at least two independent source spans.
- Interpretations require at least two independent source spans.
- Negated evidence cannot support a positive Mirror claim.
- Insufficient evidence fails closed.
- Strategy remains a separate role-specific experience.

## D15 v1 projection
Input: validated D1–D10 EvidenceLedger.

Output:
- evidence nodes
- deterministic evidence connections
- career threads
- evidence maturity
- Fact / Pattern / Interpretation statements
- a concise Story assembled only from supported statements

The first implementation is deterministic. LLM narrative generation is deferred until evidence-addressability can be validated against the deterministic projection.

## Non-goals
- no new extractor
- no new evidence ontology
- no replacement of D1–D10
- no strategy redesign
- no interview simulation changes
- no autonomous browser/computer use
- no literal cobweb visualization requirement

## Acceptance gate
1. D15 consumes only EvidenceLedger objects.
2. Every emitted substantive statement has source evidence IDs.
3. Every Pattern has at least two distinct source spans.
4. Every Interpretation has at least two distinct source spans.
5. Output is deterministic for identical input.
6. Story statements trace back to Mirror evidence.
7. Canonical tests, typecheck and build pass.
