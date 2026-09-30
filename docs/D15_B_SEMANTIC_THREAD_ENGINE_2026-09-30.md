# D15-B Semantic Thread Engine — Phase 1

Status: bounded implementation scaffold.

This phase introduces the semantic boundary without wiring an LLM into production.

## Invariants

- Input is canonical E1 evidence only; no CV/JD re-extraction.
- Whole canonical source quotes are exposed to the semantic proposer.
- Proposals must cite at least two eligible evidence atoms from at least two source spans.
- Deterministic validation rejects unknown evidence, duplicate groups, unsupported numbers, timing, outcomes, and ownership escalation.
- D15-A maturity remains authoritative: accepted semantic threads are capped at Emerging while canonical role context is unavailable.
- Questions remain questions and do not become evidence.
- No proposal is written back into the EvidenceLedger.
- Existing lexical D15 remains untouched in this phase; cutover happens only after Gold fixtures and verifier gates pass.

## Next bounded step

Add the model proposer behind this contract, then an independent claim verifier that sees only one proposal plus its cited atoms. Score the five frozen Gold CV fixtures before any production cutover.
