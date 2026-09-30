# D15 Gold v2.1 — Semantic replay protections

**Frozen before semantic replay:** 2026-09-30  
**Saved output:** `logs_99516618585.zip`  
**Authority:** preregistered replay expectations + frozen replay protocol.

The semantic replay calls the exact LOCK semantic judge, `semanticGoldErrors()`, twice over identical saved candidate output. Its native output is free-text error strings. The replay does not introduce a second semantic judge or normalized model schema.

## Semantic replay — scored protections

1. **Marie / David truth boundary** — no raw semantic error may assert unsupported ownership or unsupported outcome for Marie or David.
2. **Thomas support wording** — grounded “support for the rollout” must not be treated as leadership / unsupported ownership.
3. **Nancy B validity** — Nancy Thread B, E8+E10 (financial information → management/internal stakeholders), must not be rejected semantically.

## Protection 4 — deterministic, not semantic

**Nancy unmatched-extra routing** is not claimed as a semantic-judge protection. It is owned by deterministic routing and the existing synthetic coverage (tests 9 and 14): unmatched extras must be routed for LEGITIMATE / ILLEGITIMATE review rather than silently penalised. Its result is reported separately from the three semantic protections.

## Raw-output adjudication procedure — frozen before run

For each fixture and each of the two passes:

- preserve every raw `semanticGoldErrors()` string verbatim;
- emit a non-authoritative keyword pre-flag for likely ownership, outcome, leadership, or Nancy-B issues only to assist review;
- do **not** convert keyword matches into verdicts;
- after the run, the agent prepares every raw string, its keyword pre-flag, and a proposed classification against semantic protections 1–3; Thibaut manually confirms or overturns each row, and Thibaut's recorded decision is the verdict;
- retain all other strings as non-scored observations.

Thibaut's manual classification is the protection verdict. Agent-proposed classifications are advisory only and cannot close the gate. No new protection, category target, or favorable reinterpretation may be introduced after seeing the output.

## Stability

Wording equality is not the stability criterion. After both passes are independently classified using the frozen procedure, record `JUDGE_INSTABILITY` for a fixture only if the two passes disagree on whether any of semantic protections 1–3 was violated for that fixture. Do not select, average, substitute, or rerun a pass because of its result.

## Replay identity

The replay record must include:
- frozen replay target commit SHA;
- workflow-definition commit SHA;
- `git hash-object src/lib/d15-gold-gate.ts`;
- baseline scorer blob and the replay scorer blob, documenting the sole intended scorer-file change: exporting the existing `semanticGoldErrors()` function without changing its body.

## Replay-only execution

The replay deliberately calls `semanticGoldErrors()` even where deterministic findings exist. This bypasses only the normal deterministic short-circuit. Production/LOCK behavior remains unchanged.


## Elena capability addendum — 2026-09-30
The Elena deterministic rule set expanded after the original frozen replay: complete restraint now requires `COMPLETED_NO_QUALIFYING_RELATIONSHIP` plus a grounded, premise-free, pattern-seeking CV-level question. Historical saved outputs predate both fields; their Elena capability finding therefore reflects an absent capability, not a regression in thread restraint.
