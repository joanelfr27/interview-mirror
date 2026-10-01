# D15 Disposable Blind Pilot #2 — Single Human + AI Reference Protocol

This protocol supersedes only the pre-pilot labeler/reliability procedure in Section 10 of the frozen codebook for Pilot #2. It does not alter G, S, examples, annotation rules, or the architecture context.

Frozen codebook commit: `cb232a97fc9c7e1f7a796744ce6ba0c5d332ff6b`
Frozen codebook SHA-256: `13095ac257ee8ef1797c77721556dfff2c7f1aac2fb65ae0dc668ea50b27df22`

## Roles
- Primary human labeler: Joanel (one human labeler).
- Independent AI reference labeler: Claude. Claude is a reference labeler, not a second human and must not be described as human inter-rater reliability.
- Case designer/custodian: ChatGPT (OpenAI). The designer does not annotate either round.
- Designer intent is a precommitted diagnostic reference, not automatic ground truth.

## Blinding and rounds
- Both labelers receive the same frozen codebook and same Round 1 blind cases.
- Neither labeler sees the administration key, pair identities, test dimensions, designer intent, Round 2, or the other's labels.
- Each labeler's completed Round 1 artifact is locked by SHA-256 before Round 2 is released.
- Round 2 is released only after both Round 1 hashes are recorded.
- Each completed Round 2 artifact is also locked by SHA-256.
- Hidden pair information and designer intent are revealed only after all four annotation artifacts are locked.

## Evaluation
- Report human↔Claude agreement separately for G and S.
- Cohen's kappa may be reported descriptively but is not treated as human inter-rater reliability.
- Reveal translation and segmentation pair mappings only after both rounds are locked, then test within-labeler invariance.
- Diagnose every human↔Claude disagreement against the frozen codebook.
- Compare both labelers with precommitted designer intent only after blinding ends.
- Agreement with designer intent does not automatically establish correctness; disagreement triggers rule/case analysis.
- Pilot #2 evaluates single-human usability/consistency plus agreement with an independent AI reference. It does not establish two-human reproducibility.

## Lock definition
A round is LOCKED only when the completed annotation artifact has been finalized and its SHA-256 has been recorded by the custodian. Any subsequent byte change produces a different artifact and must be treated as a new version, not the locked result.
