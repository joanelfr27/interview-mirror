# D16 review dispositions 2 October 2026

Reviewed source: 85bab3304f0b0957a844b6a5d9827381bd37023f, PR 67. These findings were verified against code before fixes. The final selector addition still needs review at its exact new commit; an earlier review is not a final-head approval.

| Reviewer and comment | Finding | Disposition and verification |
|---|---|---|
| CodeRabbit 4167938891 | Other-actor source shown without visible attribution | Confirmed; tag the exact quote with its canonical actor, including legacy effective actor basis. Other-actor regression checks the displayed label. |
| CodeRabbit 4167938929 | No-anchor PREP still demanded an example sheet | Confirmed; no-anchor/no-proof output now asks for a three-part answer with adjacent experience only if any. Artifact regression covers it. Original replay is preserved as historical output. |
| Copilot 4167986017 | D15 gate omitted licensing vetoes, closure and eligible citations | Confirmed material; recompute existing licensing and reading vetoes, require d15ThreadEligibleAtoms, and apply closedClarification to headline and proposition in source language. Real saved EN/FR accepted loop inputs pass; stale/denied inputs reject before model spending. The old mock elicitation fixture was invalid and now uses source-grounded ELICITED attribution/action. |
| Copilot 4167986068 | Contextual ID could resolve to a different existing span | Confirmed; resolve against Mirror evidence ID/span/quote/source type, plus canonical ledger atom. Swapped-span regression rejects. |
| Copilot 4167986112 | Negated source could be a positive preparation example | Confirmed; non-affirmative anchors reject; automatic selector excludes them. Denials/contradictions remain in their canonical paths. |
| Copilot 4167986169 | Missing contextual selection incorrectly implied no canonical support | Confirmed; proof-only actions review traceable D6 evidence and preserve its status. Separate gap-defense fallback applies when neither proof nor anchors is present. |
| Copilot 4167986232 | IFRS/US GAAP named requirements missed standard-specific guidance | Confirmed; include named IFRS/IAS/US GAAP/SYSCOHADA requirements in the bounded instruction classifier. IFRS regression preserves jurisdiction/period/system boundary. This classifier does not grant support. |
| Copilot 4167986286 | All accepted thread maturities called confirmed | Confirmed; only CONFIRMED_RELATIONSHIP uses confirmed wording. Other accepted maturities use accepted wording; self-report still cannot establish recurrence. Regression checks the label. |

No material finding is dismissed because CI was green. Structural review fixes do not alter the Nancy yardstick or runtime expectations. No new model output has yet been observed for the automatic selector. An initial pre-spend test iteration found a type-inference error and a shared mutable test-fixture reference; both were corrected before the pinned run. Unit-test iteration is not resampling semantic outputs.
