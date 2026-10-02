# D16 automatic selection development preregistration

This record is committed before any automatic-selector model call. It preserves the auditor checklist supplied on 2 October and defines one development run, not qualification. The run target is development close. Release close still requires real sessions, the five D12 pathways, observed WOW and the existing release decisions. Cutover, database writes, merge to a locked line and D17 remain off.

## Fixed inputs and one-run rule

Four cases, each attempted once:

1. NANCY_AUTO_STANDARDS: saved complete canonical E1–D6 graph from run 37032538646, same synthetic standards requirement as Thomas. Previously curated selections are discarded before calling the selector; it sees canonical atoms, selected tensions and no hand-picked anchor list.
2. THOMAS_AUTO_STANDARDS: the matched saved graph, with no curated selection carried into the selector.
3. DAVID_EN_NO_JD_MULTI_ROLE: genuine saved accepted CONFIRMED_RELATIONSHIP and ledger from simulated loop run 37025234473. Attach the explicit five-requirement ADMIN_CURATED role baseline, run the existing canonical support judge, project through the existing D1–D6/D15 path, then select contextual anchors.
4. DAVID_FR_NO_JD_MULTI_ROLE: the French counterpart from that loop, with the translated explicit role baseline. The source is partly translated/simulated and partly English, not an unseen French CV. Source quotes stay verbatim; candidate guidance is French.

Nancy/Thomas use the same saved synthetic JD and RCM. David has no JD; the versioned curated role supplies canonical requirement IDs and baseline criticality. The five-requirement sales role and EN/FR facet wording are frozen in src/lib/d16-development-role-fixtures.ts. This tests no-JD operation and multi-requirement selection; it does not test automatic role-baseline generation, full-JD extraction or live candidate benefit.

Do not rerun successful model outputs. Shared diagnostic transport may retry only an API 429 rejection, at most twice; no successful semantic response is resampled. All four cases run even if one fails. Save input graphs and selector replies before/after validation. No post-output yardstick or expectation edit is permitted in this run. Any later fix is a separately pinned development iteration, preserving the failed result.

Expected calls: two capability probes, two canonical support-judge calls for David's new role, and four selector calls. No new E1 extraction or D15 G/S calls. Selector: gpt-4.1-2025-04-14, temperature 0, strict schema. Support judge: existing gpt-4o-mini path, with resolved capability snapshot recorded. Workflow is on a separate run branch and hard-pins the engine commit; it triggers by push, so workflow_dispatch availability on the default branch is irrelevant.

## Frozen comparison expectations

| Case or check | Expectation | Failure or unmeasured result |
|---|---|---|
| Nancy anchors | Select at least one statutory-reporting or acquisition-accounting anchor; system implementation may be additional context | Irrelevant or system-only selection is a development selector miss |
| Nancy truth | No international standard, IFRS, ownership or outcome established by contextual anchors; requirement proof/status remains exactly D6 | Any upgrade is a truth-boundary failure |
| Nancy content | PREP/PRACTICE satisfy the original yardstick instruction by instruction, including candidate choice, personal contribution, rule/jurisdiction/period, substantiation and judgment rehearsal | Structural links alone cannot pass content review |
| Thomas anchors | Portal/customer/training text does not become accounting-standards context; return no relevant anchor rather than manufacture an example | Hand-picking, unrelated anchors or invented finance experience fail |
| Thomas task | Explicit boundary plus a truthful adjacent-experience-if-any / readiness-plan defense; no anchor template or compulsory invented example | Candidate-specific relevance remains absent, not a personalization pass |
| David D15 | If forecast/review is a selected tension, automatic selection should reference the already validated related thread | Zero linked threads is a consumption miss; if the tension is not eligible, report upstream status and mark runtime consumption coverage unmeasured |
| David truth | Thread is self-report and one support unit; no recurrence, ownership, regional scale or role support granted by the D15 reference alone | Any requirement upgrade from thread selection fails |
| David role | All five canonical requirements assessed; tensions selected/ranked by existing deterministic code, capped at three; criticality from frozen RCM | Exact tension count is not an expected output; forcing three fails |
| French | Actor, scope, modality and source quotes preserved; guidance French | No fresh-French or qualification claim |
| Validation | Known/eligible IDs only; no stale source/Mirror/role/JD/context, denied/other-actor closure, chronology-only causal license or unsupported instruction | Invalid graph/reference fails before dispatch, not a richer fallback |
| Coverage | Report actions/proof/anchors/absent references separately, plus zero denominators as NOT_EVALUATED | No vacuous success or repeated suite-level case flags |

## Yardstick provenance

The Nancy yardstick was added in commit 2bf6878b6ead26db3c4d7f3a7d52359cffa3bffa, authored 2026-10-02T11:04:51Z. Its Git blob is 5dfdd7e56a992e7f4cefc70f7c237cc4b3ac40a6. Its content is unchanged. It predates the 37032538646 curated runtime and this automatic-selection experiment. Familiar CVs, previous outputs and teaching-related controls are disclosed development material, not fresh holdouts.

## Fixed audit coverage and exit

Review the 25 September freeze plus 2 October amendment: canonical scope; automatic Nancy/Thomas selection; validated D15 consumption; deterministic 0–3 tensions and no-JD mode; specific PREP/PRACTICE and transfer/defense; truth/provenance; forged/stale rejection; strong/partial/transferable/contradictory/reused evidence and scope/seniority/wishlist/FR–EN controls; exact commit/blob provenance and bot findings; authorization limits.

Mechanical tests and build are necessary but cannot establish semantic relevance or WOW. After this one run, read every action and selection against these expectations. Development close requires actual automatic selection and D15 consumption plus the validation/adversarial gates. Independent Claude review remains pending until the report, exact branch ZIP, artifacts/hashes and dated Nancy yardstick are supplied. Release remains open regardless of a development pass.
