# D15 Gold v2.1 — Semantic replay protections

**Frozen before semantic replay:** 2026-09-30  
**Saved output:** `logs_99516618585.zip`  
**Authority:** preregistered replay expectations + frozen replay protocol.

The preregistration did not enumerate a complete semantic-category multiset. Therefore the semantic replay is scored only against protections that were explicitly agreed before replay. No additional semantic target is created retroactively.

## Scored protections

1. **Marie / David truth boundary** — the semantic judge must not produce an unsupported-ownership or unsupported-outcome finding for Marie or David.
2. **Thomas support wording** — grounded wording equivalent to “support for the rollout” must not be classified as leadership / unsupported ownership.
3. **Nancy B validity** — Nancy Thread B, E8+E10 (financial information → management/internal stakeholders), remains a valid Gold relationship and must not be rejected semantically.
4. **Nancy unmatched extra routing** — every Nancy unmatched extra must be explicitly classified `LEGITIMATE` or `ILLEGITIMATE`; it must never be silently penalised.

## Non-scored observations

Any other semantic finding is retained verbatim and normalized under the frozen replay protocol, but is an observation rather than a replay mismatch because no complete semantic target was preregistered for it.

## Stability

Run the semantic judge twice over the identical saved candidate output. Do not select, average, or substitute runs. If normalized category sets differ, record `JUDGE_INSTABILITY`.

## Replay-only execution

The replay may force semantic judging even when deterministic findings exist. This exception is replay-only. Production/LOCK gate behavior remains unchanged: deterministic failure continues to short-circuit semantic scoring.
