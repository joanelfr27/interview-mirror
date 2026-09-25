# Interview Mirror — D1–D10 Master Build Specification v1.0

Status: implementation map derived from the D1–D10 research record, Gemini/Claude audit conclusions, and the current `audit-version` repository at E1 final merge commit.

## 1. Purpose

D1–D10 are treated as research findings and product requirements, not as ten independent features.

The target system is:

CV/JD source material → canonical evidence → requirement facets → evidentiary support → unresolved state → candidate elicitation → gap classification → demonstration objective → Strategy → preparation/probes → interview → feedback → updated evidence.

The product-facing promise remains:
- Know what your experience supports.
- Know where the gaps are.
- Know what you need to demonstrate.
- Tell your story with confidence.

## 2. Current-state audit

| Capability | Current repository | Actual state | Build implication |
|---|---|---|---|
| Canonical evidence ontology | E1 files exist | EXISTS, shadow-only | Do not rebuild. Operationalize later. |
| Atomic CV evidence + provenance | canonical shadow extractor/model | EXISTS, shadow-only | Do not create a second evidence model. |
| JD requirement/facet model | canonical extractor/model | EXISTS, shadow-only | Reuse E1. |
| Evidence-to-facet support | canonical support judge | EXISTS, shadow-only | Reuse; validate empirically before production cutover. |
| Requirement status | E1 aggregation | EXISTS, shadow-only | Reuse. |
| Unresolved classification | E1 ABSENT/AMBIGUOUS/CONFLICTING | EXISTS | Reuse. |
| Candidate elicitation | E1 endpoint/classifier | EXISTS, shadow-only | Reuse; connect to product flow later. |
| Evidence Gap / Transferable / Experience Gap | E1 classifier | EXISTS, shadow-only | Reuse; do not infer experience gap from CV alone. |
| Demonstration Objectives | E1 module | EXISTS, shadow-only | Reuse; connect to Strategy/preparation. |
| Evidence ledger | E1 in-memory ledger | EXISTS, not persistent product state | Persistence/integration is future build work, subject to validation gate. |
| Legacy evidence map | strategy-engine.ts | EXISTS, production | Transitional; not the canonical D-series target. |
| Strategy evidence extraction | strategy-engine-v23-lite.ts | EXISTS, production | Still performs its own candidate-evidence extraction. This is the major integration boundary. |
| Strategy deterministic planning | v23-lite + strategy-engine | EXISTS, production | Keep current strategy UI/contract stable while preparing canonical integration. |
| Strategy page | existing UI | EXISTS | No redesign. Feed better grounded strategy into existing experience. |
| Strategy-grounded interview questions | interview API | EXISTS | Uses current persisted Strategy, not E1 demonstration objectives. |
| Feedback evidence checking | feedback API | EXISTS | Checks answer evidence against CV and Strategy, but does not update canonical evidence. |
| Feedback → persistent canonical Mirror update | no canonical write path | MISSING | Build only after canonical evidence integration is validated. |
| Product-facing Fit & Gap view | no canonical ledger consumer | MISSING/PARTIAL | This is a real D-series product layer. |
| Canonical evidence router | no production consumer | MISSING | Build as deterministic/retrieval layer, not another LLM summary. |
| Research instrumentation | E1 protocol/docs exist | PARTIAL | Runtime/expert/EN-FR/test-retest/baseline evaluation still required. |

## 3. What D1–D10 actually require us to build

### Build A — Canonical Evidence Integration Boundary
Goal: make the E1 ledger the future authoritative evidence contract without immediately changing production Strategy.

Requirements:
- define one adapter/service boundary from canonical ledger to downstream product reasoning;
- preserve source spans and atom IDs;
- never convert canonical evidence back into an untraceable summary as the authoritative input;
- allow existing Strategy to consume a controlled projection during transition;
- keep E1 shadow endpoint isolated until validation criteria are met.

This is the bridge, not an E1 rewrite.

### Build B — Requirement/Fit-Gap Reasoning
Goal: answer, for each material JD requirement/facet:
1. what is directly established;
2. what is only partially established;
3. what is transferable/analogical;
4. what is unresolved;
5. what must still be demonstrated.

The current E1 support graph already supplies the primitives. The missing work is product-level consumption and presentation.

### Build C — Evidence Router
Goal: when a requirement is being prepared, retrieve the strongest relevant career evidence and its source.

Router output should preserve:
- requirement/facet ID;
- evidence atom IDs;
- source quotes;
- support status;
- ownership/context/scale dimensions;
- why the evidence is relevant;
- truthfulness boundary.

Do not implement this as another free-form “tell me the candidate's strengths” prompt.

### Build D — Gap Classification + Candidate Elicitation
Goal: do not call something a genuine experience gap merely because the CV is silent.

Flow:
unresolved → candidate question → elicited evidence → EVIDENCE_GAP / TRANSFERABLE / EXPERIENCE_GAP.

E1 already implements the underlying schema and classifier. The product work is to expose the right unresolved items at the right moment and persist the resulting state once validated.

### Build E — Demonstration Objective Layer
Goal: convert unresolved requirements into observable interview objectives.

Each objective must retain:
- target unresolved item;
- observable cue;
- supporting true atom IDs;
- permitted claims;
- prohibited claims;
- optional probe family;
- candidate gap classification when available.

E1 already has this structure. The missing product integration is what turns it into preparation.

### Build F — Canonical Strategy Bridge
Goal: feed evidence-grounded reasoning into the existing Strategy-before-Simulation flow.

Important:
- Strategy UI remains frozen.
- Strategy-before-Simulation remains frozen.
- The current Strategy engine is not rewritten wholesale.
- First create a controlled input contract that can accept canonical requirement/evidence state.
- Then replace the old duplicated candidate-evidence path only after E1 runtime/semantic validation.

The current v2.3-lite engine still calls its own `extractCandidateEvidence` and constructs its own legacy EvidenceMap. That is the primary architectural duplication to remove eventually.

### Build G — Preparation/Probe Routing
Goal: turn demonstration objectives into practical preparation.

For each objective:
- evidence to retrieve;
- point to clarify;
- transfer explanation if applicable;
- likely probe family;
- truthful boundary;
- practice target.

This should feed the existing interview question generation rather than create a separate generic simulator.

### Build H — Feedback → Mirror Update
Goal: close the Intelligence Chain.

Current feedback already extracts answer evidence spans and distinguishes CV-verified vs candidate-claim evidence. It does not currently feed those claims into the canonical evidence ledger.

Future flow:
answer → validated elicited evidence → support against requirement → updated unresolved/demonstration state → updated preparation priorities.

No automatic upgrade from “candidate said it” to “documented CV evidence.”

### Build I — Validation / Research Instrumentation
The D-series claims remain hypotheses unless measured.

Required validation dimensions from the research record:
- extraction fidelity;
- expert agreement;
- support judgment agreement;
- gap classification agreement;
- evidence utilization;
- blinded answer quality;
- calibration;
- fabrication/unsupported-claim rate;
- EN/FR invariance;
- test-retest stability;
- comparison against a strong generic LLM baseline.

Commercial claims such as PMF, willingness-to-pay and hiring-outcome improvement remain unproven until separately studied.

## 4. D1–D10 mapping

### D1 — Candidate problem
Build implication: canonical Fit & Gap output must answer the candidate's upstream uncertainty, not merely show a match score.

### D2 — Uncertainty to solve
Build implication: model evidence selection, communication, interpretation and response adaptation; do not model/predict interviewer decisions.

### D3 — Evidence observability
Build implication: Requirement → Support → Unresolved → Demonstration Objective must be explicit and traceable.

### D4 — “I have the experience but don't know how to use it”
Build implication: Evidence Router + transfer-aware preparation.

### D5 — Competitive crowding
Build implication: do not add generic interview-prep features to compete on breadth. The architecture should make requirement-level evidentiary reasoning the core workflow.

### D6 — Inference gap
Build implication: Fit & Gap must explain why evidence is insufficient, rather than only returning a score.

### D7 — What candidate needs to see
Build implication: candidate-facing distinction between established, partial, transferable, unresolved, and post-elicitation gap classes.

### D8 — Preparation/confidence
Build implication: every material gap exposed to the candidate must have a preparation path; avoid “gap dumping.”

### D9 — Promise
Build implication: implementation complexity stays behind the UI. Candidate sees clear evidence, gaps and demonstration priorities.

### D10 — Niche
Build implication: preserve the candidate-side evidentiary reasoning wedge; do not turn the product into a generic simulator or career-story generator.

## 5. What NOT to build

- No second canonical evidence extractor.
- No second evidence ontology.
- No probabilistic interviewer-belief system.
- No generic “AI coach” layer replacing the evidence ledger.
- No generic feature expansion to match competitors.
- No Strategy UI redesign.
- No immediate wholesale rewrite of Strategy.
- No claim that E1 semantic correctness is proven merely because CI is green.
- No classification of genuine experience gap from CV absence alone.
- No conversion of candidate self-report into documented evidence.
- No hiring-outcome/PMF claims without research.

## 6. Dependency order

1. **Canonical integration contract**
2. **Requirement/Fit-Gap consumer**
3. **Evidence Router**
4. **Demonstration Objective → preparation/probe consumer**
5. **Controlled Strategy bridge**
6. **Interview question routing**
7. **Feedback → canonical update**
8. **Persistent longitudinal Mirror**
9. **Empirical validation / comparative study**

E1 itself remains the evidence foundation; it is not a new build stream.

## 7. Immediate implementation target

The first coding item should therefore be a **non-destructive Canonical Reasoning Adapter**:
- input: validated E1 EvidenceLedger;
- output: a stable downstream reasoning projection containing requirement/facet status, evidence pointers, unresolved items, elicitation state and demonstration objectives;
- no database writes;
- no Strategy UI change;
- no replacement of the production Strategy engine;
- deterministic schema validation;
- unit tests covering direct, partial, analogical, contradictory, unresolved and elicited cases.

Once that adapter is audited, the next item is the Fit & Gap consumer.

This keeps the work controlled and prevents another E1 architectural loop.

## 8. Audit conclusion

Gemini and Claude's common direction is preserved:
- candidate-side evidentiary reasoning;
- source/provenance traceability;
- requirement-level support;
- explicit gap taxonomy;
- candidate elicitation before experience-gap claims;
- demonstration objectives;
- evidence-led downstream generation;
- deterministic validation and abstention;
- independent empirical validation.

The current repository confirms that E1 already contains much of this machinery in shadow mode. The principal missing work is **integration and operationalization**, especially the boundary between the canonical E1 ledger and the duplicated production Strategy evidence path.

This document is an implementation map, not a claim that semantic E1 validation is complete.
