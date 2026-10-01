# D15 Gold v2.1 — preregistered replay expectations

**Frozen before replay:** 2026-09-30
**Authority:** `docs/D15_GOLD_MIRROR_RUBRICS_V2_1_FROZEN_2026-09-30.md`
**Saved run:** GitHub Actions artifact `logs_99516618585.zip`, change note `verification language question stabilization`.

These expectations are fixed before the corrected executable gate is run on the saved output.

| Case | Expected complete v2.1 verdict | Expected component findings |
|---|---|---|
| Nancy | FAIL | Thread B E8+E10 is valid. Thread A E4+E5 is insufficient: frozen Gold requires E4+E5+E6. No unmatched-thread penalty may be used to obscure that specific recall miss. |
| Marie | FAIL | Thread A E5+E8 is acceptable partial recall and its neutral ownership question is admissible, but its headline is English while cited atoms are French. Thread B E2+E6 recall is valid. |
| David | FAIL | Thread B E3+E6 recall is valid. Thread A E2+E4 is acceptable recall, but its required ownership-or-outcome question is absent. |
| Elena | FAIL | Restraint passes with zero threads, but complete v2.1 D15-B fails because the required premise-free CV-level pattern-seeking question capability is absent from the current engine/output contract. |
| Thomas | FAIL | E4+E5+E7 is full recall and the support-level headline is grounded, not a leadership violation. The mandatory ownership question is in French although the cited source atoms are English, so language fails. |

## Replay acceptance condition

The corrected gate is not trusted merely because its overall PASS/FAIL values match this table. Its component findings must agree with the findings above and must not reproduce the known false reasoning:
- Thomas support wording must not be labelled leadership.
- David E3 must not be labelled an unsupported pipeline outcome.
- Marie E5+E8 must not be failed for omitting E3.
- Nancy E8+E10 must not be treated as an unmatched or category-only thread.

## Mandatory synthetic branches

Before replay is considered meaningful, deterministic tests must cover:
1. Marie E5+E3 acceptable partial recall + required neutral outcome question.
2. Marie E5+E8 acceptable partial recall + required neutral ownership question.
3. Marie E5+E3+E8 full recall + required Déployait/Participait ownership contrast.
4. Marie E3+E8 FAIL because diagnosis E5 is absent.
5. Thomas grounded support-language headline must not trigger leadership failure.
6. An unmatched extra thread must route to legitimacy review rather than automatic PASS or FAIL.
