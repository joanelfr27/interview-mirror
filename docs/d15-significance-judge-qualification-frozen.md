# D15 Semantic Significance Judge — Preregistered Qualification Artifact

Status: FROZEN BEFORE FIRST QUALIFICATION CALL
Baseline tag: `d15-truth-boundary-locked`
Baseline commit: `4b8c19ae31f6bf6749c1be48bf4a3d03f50ff510`

## Qualification rule

Each candidate judge receives the identical production SIGNIFICANCE prompt, model settings, cited canonical evidence and claim for every case.

- 6 cases × 5 independent raw judgments = 30 raw verdicts per candidate model.
- Qualification requires exactly 30/30 correct raw verdicts. 29/30 fails.
- No majority voting.
- No retries.
- No case substitutions.
- No prompt edits after the first qualification call.
- No expectation changes after the first qualification call.
- No post-result tuning.
- If multiple models qualify, select the cheapest qualifying model.
- If no model qualifies, STOP. The semantic-significance mechanism requires a design change rather than further model iteration.

## Frozen cases

### 1. NANCY_A — MUST ACCEPT
Claim:
`You work at the intersection of financial systems and business changes.`

Evidence:
- E4: Supporting acquisition accounting and financial integration activities.
- E5: Supporting systems integration following business changes.
- E6: Implementing and improving accounting systems and processes.

Expected raw verdict: `supported=true`

Purpose: genuine change/integration relationship.

### 2. DAVID_A — MUST ACCEPT
Claim:
`You create a rhythm for the sales team by aligning forecasts with structured reviews.`

Evidence:
- E2: Prepared monthly sales forecasts and reviewed variances with the sales team.
- E4: Introduced a structured pipeline review for the sales team.

Expected raw verdict: `supported=true`

Purpose: genuine operating-rhythm relationship.

### 3. FUNCTIONAL_POSITIVE — MUST ACCEPT
Claim:
`You connect recurring complaint diagnosis with intake-process changes.`

Evidence:
- SE1: Reviewed recurring causes in customer complaints.
- SE2: Changed the intake checklist after reviewing recurring complaint causes.

Expected raw verdict: `supported=true`

Provenance: exact functional positive control frozen in the D15 pre-spend significance gate at the baseline commit.

### 4. MARIE_A — MUST ACCEPT
Claim:
`Vous travaillez à l'intersection de l'analyse des problèmes et de la réorganisation des processus.`

Evidence:
- E5: Analysait les retards de livraison et présentait les causes principales à la direction.
- E8: Participait à la réorganisation du processus de traitement des commandes.

Expected raw verdict: `supported=true`

Purpose: French diagnosis/process-reorganisation relationship.

### 5. ELENA_ADMIN — MUST REJECT
Claim:
`You work across invoice administration.`

Evidence:
- SE1: Filed supplier invoices each week.
- SE2: Archived supplier invoices each month.

Expected raw verdict: `supported=false`

Provenance: exact Elena-like administrative negative control frozen in the D15 pre-spend significance gate at the baseline commit.

Purpose: reject a generic administrative bundle that does not reveal a meaningful cross-evidence professional relationship.

### 6. MARIE_B_FLAT — MUST REJECT
Claim:
`Vous suivez les incidents clients et coordonnez leur résolution avec les équipes concernées.`

Evidence:
- E2: Suivait les incidents clients et organisait leur résolution avec les équipes concernées.
- E6: Coordonnait le suivi des fournisseurs et des équipes internes lors des périodes de forte activité.

Expected raw verdict: `supported=false`

Provenance: real production headline from commit `1c17c6d3`.

Purpose: test whether the judge rejects a flat/near-verbatim duty paraphrase rather than mistaking it for a semantic Mirror insight.

## Observational holdout — THOMAS (NOT SCORED)

Recoverable production headline:
`You support users during the rollout of new systems.`

Evidence family: Thomas E4 + E5 + E7.

Provenance: production headline from `4c2b3f24`, also produced at `1c17c6d3`. The exact wording rejected in the later lock run was never logged and is not reconstructed.

Thomas is excluded from qualification because this recoverable headline is truthful but does not unambiguously satisfy the frozen role-title-specificity/significance criterion. It may be evaluated after model selection as observational evidence only and cannot change qualification.

## Frozen production verifier

The experiment MUST invoke the exact SIGNIFICANCE branch of `verifyD15BClaimIndependently()` from baseline commit `4b8c19ae31f6bf6749c1be48bf4a3d03f50ff510`, including its exact system prompt, JSON schema, cited canonical-atom representation and model-specific settings, except for the candidate model identifier being measured.

No rewritten/easier prompt is permitted.

## Stop condition

The first qualification model call freezes this artifact operationally. After that call, any change to cases, evidence, claims, expected labels, prompt, settings, scoring rule, or qualification threshold invalidates the experiment and requires a newly declared experiment rather than silently continuing this one.
