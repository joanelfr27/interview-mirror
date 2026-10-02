# D16 David failed-case iteration — 2 October 2026

Original run 37040330015, engine 27100e6ce760aa54895203b291b8e8d0a0f99135, completed with errors. Nancy and Thomas selector outputs are preserved in that original artifact and must not be resampled. Both David cases failed canonical support validation for mixing documented and candidate-elicited atoms in judgment E2. The original report did not capture the rejected support reply; its error message is the observable failure, not proof of its full content.

The judge request omitted provenance.source_type. Expose source_type and its existing support_basis for every atom, and explicitly require one evidence basis per facet judgment. Self-report cannot be DIRECT. Do not add a mixed ontology, split an unverified judgment, relax validation, or convert a rejected positive claim into accepted support. Preserve the existing hard rejection. Validation failures now carry the existing structured support diagnostic.

Three confirmed Copilot PR 67 findings are corrected together: 4168187631 (exclude Mirror-omitted atoms consistently from request and allowlist), 4168187700 (exclude established DIRECT facets from missing-facet context), and 4168187741 (retain raw selector reply on final dependency/action validation failures). No frozen content yardstick changes.

## Fixed follow-up

Set D16_DAVID_ONLY=1. Attempt DAVID_EN_NO_JD_MULTI_ROLE and DAVID_FR_NO_JD_MULTI_ROLE once each using the unchanged saved loop and five-requirement role. Expected calls: two capability probes, two support judgments, at most two selectors (selectors run only after valid upstream projection and eligible tensions). No Nancy/Thomas calls, E1 extraction, D15 G/S calls, database access, cutover, locked-line merge or D17 work. Preserve errors and do not repeat successful semantic replies. Original preregistration expectations continue unchanged; this is a separately pinned correction, not a replacement of the failed run.

Development close remains open pending these runtime results, content review and independent audit. Tests cannot establish semantic correctness or WOW.
