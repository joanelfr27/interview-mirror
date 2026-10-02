# D15 Semantic Significance Codebook — v1.1 Candidate

Status: FROZEN FOR DISPOSABLE BLIND PILOT #4  
Purpose: human annotation of D15 semantic relationship grounding (G) and independent Mirror significance (S).  
Scope: this codebook evaluates only the evidence atoms and proposed relationship/headline presented to the labeler.

## 1. Annotation independence

Judge G and S independently, but evaluate the same asserted proposition.

### 1.1 Single-reading rule

Before assigning G or S, record the semantic proposition asserted by the headline in `asserted_proposition`. G and S must evaluate that same proposition. A word, connector, or construction must not be interpreted more weakly for G and more strongly for S merely to satisfy one axis.

When a headline supports both a weaker and a stronger reading, use the reading a reasonable candidate would take from it. If that remains unclear, use the stronger reading. This default is truth-protective: the Mirror is read by the candidate, so potentially relational wording is not silently weakened during grounding.

- G asks whether the asserted relationship is licensed by the cited evidence.
- S asks what kind of professional claim the asserted relationship would make, assuming the relationship were true.
- Final product acceptance is not an annotation field. In later system evaluation, ACCEPT requires G=YES and S=YES.
- Do not infer missing source context, job-title context, unstated intentions, or facts outside the supplied evidence.
- Vocabulary alone never determines either label.

## 2. Axis G — Relationship Grounding / Relationship License

### 2.1 Question

Using only the cited evidence atoms, is the relationship asserted by the proposed headline licensed by their joint meaning?

G is narrower than general factual truth. It evaluates the relationship itself.

### 2.2 G=YES

Label G=YES only when the asserted relationship is:

1. directly licensed by the evidence; or
2. a faithful abstraction or aggregation of the evidence that introduces no new relationship.

For every G=YES label, record:

- the relationship connector being evaluated;
- the minimal evidence-atom subset needed to license it; and
- the exact licensing span or spans.

### 2.3 G=NO

Label G=NO when the proposed relationship requires an unstated:

- mechanism;
- purpose;
- cause;
- responsibility;
- outcome;
- temporal dependency;
- response or adaptation relationship; or
- other connection not licensed by the evidence.

For G=NO, identify the unsupported connector or relationship.

### 2.4 Relationship rules

**Co-occurrence is not interaction.** Evidence that a person performed activity A and activity B does not by itself establish that A interacted with, informed, changed, enabled, or caused B.

**Coordination/interface requires a connection.** An interface is licensed only when the evidence establishes interaction, shared activity, a common process, or another explicit operational connection. Merely mentioning generic actors such as teams or stakeholders is insufficient.

**Sequence requires ordering.** A sequence claim requires evidence that establishes order.

**Causality requires causal evidence.** Temporal order alone does not license causality.

**Purpose requires purpose evidence.** Do not infer why an activity was performed merely because a purpose would be plausible.

**Response/adaptation requires an explicit connection.** A claim that one activity was performed in response to another requires evidence linking them.

**Recurrence requires recurrence evidence.** Words such as "rhythm", "regularly", "recurring", or equivalent French expressions require evidence of repetition or recurrence.

**Shared cadence licenses co-recurrence, not interaction.** Evidence that activities A and B occur on the same explicit recurring cadence licenses a proposition that A and B both recur on that cadence. Shared cadence alone does not license a proposition that A links to, feeds, informs, structures, drives, changes, or otherwise interacts with B. Such relational language requires evidence of the corresponding connection.

**Abstraction cannot manufacture a connector.** A broader description may summarize supported activities, but it cannot introduce a mechanism, purpose, causal link, interface, or outcome absent from the evidence.

**Ownership and outcomes cannot be upgraded.** Supporting, participating, assisting, or contributing cannot be rewritten as owning, leading, managing, or delivering an outcome unless the evidence licenses that level of agency.

### 2.5 Temporal language boundary

Temporal ordering can license a sequence, but not a stronger mechanism.

Expressions such as:

- "moves from X to Y";
- "leads into";
- "turns X into Y";
- "based on";
- "in response to";

assert more than mere chronology and require evidence for that stronger relationship.

### 2.6 G teaching examples

#### G1 — Explicit operational interface: YES

Evidence:
- "Reviewed the monthly sales forecast with the commercial team."
- "The review was used to update production requirements."

Proposed relationship:
- "You connect sales forecasting with production planning through the monthly review."

G=YES. The second statement explicitly connects the review to production requirements.

#### G2 — Mere co-occurrence: NO

Evidence:
- "Prepared monthly sales forecasts."
- "Reviewed customer complaints."

Proposed relationship:
- "You connect sales forecasting with customer feedback."

G=NO. The evidence contains both activities but no relationship between them.

#### G3 — Explicit response/mechanism: YES

Evidence:
- "Reviewed recurring causes of customer complaints."
- "Based on that review, revised the customer-intake checklist."

Proposed relationship:
- "You turn recurring complaint analysis into changes in the intake process."

G=YES. "Based on that review" explicitly licenses the response relationship.

#### G4 — Chronology is not causality: NO

Evidence:
- "Reviewed supplier delays in Q1."
- "Reorganized the purchase-order workflow in Q2."

Proposed relationship:
- "You reorganized the purchase-order workflow in response to supplier delays."

G=NO. Q1 before Q2 establishes chronology, not the asserted response relationship.

#### G5 — Explicit purpose: YES

Evidence:
- "Introduced weekly inventory reviews to reduce emergency replenishment."

Proposed relationship:
- "You use weekly inventory reviews to reduce emergency replenishment."

G=YES. The purpose is explicit.

#### G6 — Invented purpose: NO

Evidence:
- "Introduced weekly inventory reviews."
- "Emergency replenishment decreased."

Proposed relationship:
- "You introduced weekly inventory reviews to reduce emergency replenishment."

G=NO. The evidence supplies an activity and an outcome but does not state that the review was introduced for that purpose or caused the decrease.

#### G7 — Permissible abstraction: YES

Evidence:
- "Checked invoice coding errors before posting."
- "Reviewed duplicate payment entries before release."

Proposed relationship:
- "You apply verification controls across invoice and payment processing."

G=YES. "Verification controls" is a category-level abstraction of the two explicitly evidenced checking/reviewing controls. It does not assert that the invoice control affects the payment control, or that either control causes an outcome. The word "across" scopes the abstraction to two evidenced process stages; it does not assert interaction between them.

#### G8 — Abstraction creating a mechanism: NO

Same evidence as G7.

Proposed relationship:
- "You use invoice controls to prevent errors from reaching payment."

G=NO. The proposed flow from invoice controls to payment prevention is not established.

## 3. Axis S — Independent Mirror Significance

### 3.1 Question

Assuming the asserted relationship were true, what kind of professional claim would it make?

Judge S without reconsidering whether the relationship is grounded. A relationship can therefore be G=NO and S=YES.

### 3.2 S=YES

Label S=YES when the asserted relationship expresses a meaningful professional:

- PATTERN;
- INTERFACE;
- MECHANISM; or
- RECURRENCE.

It must say something about how professional activities relate, not merely that the person performs the cited activities.

### 3.3 S=NO

Label S=NO when the asserted relationship is only:

- a list;
- paraphrase;
- category;
- label;
- fluent duty summary; or
- generic restatement of the activities.

A generic statement is one whose asserted meaning does not go beyond describing that the person performs the cited activities.

### 3.4 Closed S relationship types

If S=YES, choose exactly one:

- PATTERN — a meaningful characteristic configuration in how professional activities relate; use PATTERN when the significance does not depend on an asserted cadence or repeated cycle.
- INTERFACE — a meaningful connection across distinct functions, activities, processes, or professional domains.
- MECHANISM — a meaningful account of how one professional activity informs, changes, structures, or operates through another.
- RECURRENCE — a meaningful repeated relationship between activities for which repetition itself is part of the professional significance. Shared timing or common scheduling alone is not sufficient.

Type precedence: choose MECHANISM when the central claim is how one activity informs or changes another; choose RECURRENCE when cadence/repetition is central; choose INTERFACE when the central claim is the cross-domain/process connection without a mechanism; otherwise use PATTERN for a characteristic configuration that is meaningful but not dependent on recurrence.

If S=NO, use NONE.

S relationship type is a separate descriptive annotation from the binary S judgment. Pilot acceptance/disagreement gates must state explicitly whether type disagreement is gate-relevant. Unless a pilot protocol explicitly says otherwise, G and S binary disagreements are reported separately from S-type disagreements; a type-only disagreement does not silently become a G or S disagreement.

### 3.5 Cadence-removal test

For a proposed RECURRENCE claim, remove the cadence from the asserted proposition.

- If no relationship between the activities remains, S=NO: cadence was only timestamping a list.
- If a relationship remains (for example, a handoff, loop, or one activity feeding another) and repetition is central to that relationship, S=YES / RECURRENCE.

Example — shared cadence only, S=NO:

- "Every Monday, you reconcile tickets and review overdue cases."

Removing "Every Monday" leaves an additive duty list: "you reconcile tickets and review overdue cases."

Example — repeated relationship, S=YES / RECURRENCE:

- "Each month, the forecast feeds the commercial review."

Removing the cadence leaves the relationship "the forecast feeds the commercial review"; the monthly repetition is central to the claim.

### 3.6 Intrinsic-purpose test

Label S=NO when the asserted relationship merely states the inherent purpose of the activity itself. Removing the purpose language would still describe essentially the same professional duty.

S can be YES when the relationship connects distinct professional activities or expresses a meaningful choice about how the candidate performs the work.

Example — intrinsic purpose, S=NO:

Evidence/claim:
- "Providing financial information to management to support business decisions."

The decision-support purpose is inherent in the management-information duty; the statement does not reveal a separate professional mechanism or pattern.

Example — distinct activities connected, S can be YES/MECHANISM:

- "Redesigned the approval workflow after identifying recurring causes of payment errors."

This connects diagnosis with process redesign and describes how findings are acted on.

### 3.7 Generic actors do not create an interface

A relationship merely between the candidate and unspecified or generic actors such as "teams", "stakeholders", "colleagues", or "management" does not by itself constitute an INTERFACE.

The claim must express a meaningful relationship across distinct professional activities, functions, processes, or domains.

### 3.8 Atomicity-neutral S

S must not change solely because the same underlying source meaning is represented as one evidence atom or several.

Do not use atom count as a proxy for significance.

### 3.9 S teaching examples

#### S1 — Meaningful interface: YES / INTERFACE

Claim:
- "You work at the point where the payroll cycle and the tax-filing calendar have to agree."

Assuming true, this describes a meaningful interface between two distinct professional processes without asserting that one informs, changes, structures, or flows into the other.

#### S2 — Enumeration: NO / NONE

Claim:
- "You work across forecasting, reporting, and customer complaints."

This packages activities together without asserting a meaningful relationship.

#### S3 — Mechanism: YES / MECHANISM

Claim:
- "You use recurring operational reviews to change how work is organized."

Assuming true, this describes a mechanism connecting review and organizational change.

#### S4 — Category label: NO / NONE

Claim:
- "You operate at the intersection of finance and operations."

Without a substantive relationship beyond category membership, "intersection" is packaging rather than a Mirror insight.

#### S5 — Recurring professional relationship: YES / RECURRENCE

Claim:
- "Each month, the forecast feeds the commercial review."

Assuming true, removing the monthly cadence still leaves the substantive relationship "the forecast feeds the commercial review"; repetition is central to the professional claim.

#### S6 — Fluent duty summary: NO / NONE

Claim:
- "You communicate financial information to internal stakeholders to support business decisions."

This remains essentially a description of the ordinary purpose of the communication duty.

### 3.10 Anti-shortcut examples

**Relational vocabulary does not guarantee significance.**

Claim:
- "You bridge reporting and stakeholders."

S=NO if "bridge" merely repackages the fact that the person reports to stakeholders without a substantive relationship between distinct professional activities.

**Absence of fashionable relational vocabulary does not prevent significance.**

Claim:
- "After recurring complaint reviews, you change the intake checklist."

S=YES/MECHANISM because the asserted meaning connects diagnosis to process change even without words such as "bridge", "intersection", or "interface".

## 4. French semantic boundaries

French expressions must be interpreted by meaning, not by token.

### 4.1 "dans le cadre de"

Usually establishes context. It does not automatically establish purpose, causality, or mechanism.

Evidence:
- "Analysait les écarts dans le cadre de la clôture mensuelle."

Do not infer that the analysis caused or changed the closing process merely from "dans le cadre de".

### 4.2 "en lien avec"

Can express association and is often ambiguous. It does not automatically establish coordination, interface, causality, or mechanism.

Evidence:
- "Préparait les prévisions en lien avec l'équipe commerciale."

This can support an association with the commercial team, but stronger claims such as "coordonnait les décisions commerciales" require additional evidence.

### 4.3 "pour"

"Pour" can mark purpose, but it can also introduce a recipient, destination, or other syntactic relation. Interpret the whole proposition.

Explicit purpose:
- "A mis en place une revue hebdomadaire des stocks pour réduire les réapprovisionnements d'urgence."

The reduction purpose is explicit.

Recipient, not purpose:
- "Préparait les rapports financiers pour la direction."

Do not treat "pour la direction" by itself as evidence that the reports changed, guided, or caused management decisions.

### 4.4 French lexical shortcut counterexample

Claim:
- "Vous faites le lien entre la finance et les équipes opérationnelles."

Do not label S=YES merely because "faites le lien" sounds relational. If the evidence only shows that reports were sent to operational teams, this is a generic restatement, not necessarily an interface.

Conversely:

Claim:
- "Après l'analyse récurrente des incidents, vous modifiez le processus de traitement."

Assuming true, this can be S=YES/MECHANISM even without a conventional "interface" expression.

## 5. G × S interpretation matrix

| G | S | Later system interpretation |
|---|---|---|
| YES | YES | ACCEPT candidate |
| YES | NO | Reject: grounded but not Mirror-significant |
| NO | YES | Reject: potentially insightful but unlicensed by evidence |
| NO | NO | Reject |

This matrix does not change the requirement to annotate G and S independently.

## 6. Annotation record

For every case record:

- case_id
- asserted_proposition: the single semantic reading of the headline that both G and S evaluate
- G: YES | NO
- G_connector: relationship asserted by the headline
- G_minimal_atom_subset: atom IDs required for the G judgment
- G_licensing_span: exact evidence span(s) for G=YES; NONE for G=NO
- G_reason: concise explanation
- S: YES | NO
- S_relationship_type: PATTERN | INTERFACE | MECHANISM | RECURRENCE | NONE
- S_reason: concise explanation
- labeler_id

For G=NO, G_minimal_atom_subset should identify the evidence most relevant to evaluating the unsupported relationship; G_licensing_span must be NONE.

## 7. Annotation prohibitions

Labelers must not:

- use information outside the supplied evidence;
- repair or enrich the evidence from plausible professional knowledge;
- infer a relationship merely because it would make sense in the role;
- use job-title specificity as a criterion;
- count atoms as a proxy for significance;
- change G because S feels weak;
- change S because G is unsupported;
- use one semantic reading of the headline for G and a different reading for S;
- use English/French lexical tokens as automatic labels; or
- assess whether the extraction system should have preserved additional source context.

## 8. Borderline cases

A case is not "borderline" because a labeler is uncertain. Borderline status is empirical under a protocol that actually uses two blind human labelers: those two human labelers disagree on G or S before reconciliation.

A disagreement involving an AI reference labeler is diagnostic evidence, not automatically a two-human borderline case or freeze-block trigger. An owner may nevertheless block freeze when such a disagreement exposes a genuine codebook gap; that decision must be recorded explicitly rather than represented as the frozen two-human rule firing.

Disagreements are preserved and diagnosed before any reconciliation.

## 9. System Architecture Context — Not Annotation Rules

The following requirements belong to the Interview Mirror system and must not influence annotation of the supplied atoms.

### 9.1 E1 relational-preservation requirement

Atomization should preserve relational information necessary to reconstruct relationships expressed in the source, including cross-references, causal or purpose links, temporal dependencies, response relationships, and references such as "those findings", "this analysis", "following this review", and French equivalents.

This requirement constrains E1. It does not authorize a D15 labeler to reconstruct a relationship missing from the supplied evidence.

### 9.2 Independent relationship support

Independent relationship support means a distinct source evidence unit that independently contributes evidence for the relationship. Splitting one source statement into multiple atoms does not increase support count.

System evaluation may track:

- relationship_support_units;
- distinct_source_lines;
- distinct_roles.

These fields are not part of G or S annotation in the blind pilot.

## 10. Protocol neutrality

This codebook defines semantic annotation rules only. It does not prescribe labeler composition, blinding/custody procedure, disagreement thresholds, or pilot acceptance gates.

Each disposable pilot must freeze those procedural choices in its own protocol before annotation begins. Human-vs-AI reference results must not be described as human inter-rater reliability. If an AI reference labeler retains prior-round context, its cross-round consistency must be reported as memory-qualified rather than memory-free blind invariance.

Pilot #1–#3 procedures and dispositions belong in a separate provenance record, not in this operative semantic codebook.

## 11. Freeze and reproducibility

The authoritative pilot codebook is this committed plain-text UTF-8 file with LF line endings.

The pilot record must capture:

- repository commit SHA;
- this file's SHA-256 calculated from the committed bytes;
- annotation-round artifact hashes;
- sealed administration-key hash; and
- sealed designer-intent-record hash.

Human-readable exports are derivatives only. The committed UTF-8/LF file is authoritative.

No semantic rule, example, or definition may be edited after annotation begins. A material change creates a new candidate and requires a fresh disposable pilot.
