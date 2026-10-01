# D15 Gold Mirror Rubrics — v2.1 FROZEN

**Status:** frozen human Gold authority. v2.1 is a provenance-based clarification of v2; it is frozen before the next product run.
**Frozen:** 2026-09-30.
**Parent:** v2 frozen on 2026-09-30.

## v2.1 amendment provenance

This amendment resolves ambiguities found by comparing v2 with the pre-run v1 draft, v1.1 draft, and human-reviewed frozen v1. It does not change Nancy A/B, David, Thomas recall, or Elena restraint to fit observed D15 output.

For Marie A, the v1 draft allowed 2/3 recall while carrying a question written for the Déployait/Participait pair. v1.1 tightened the rule around diagnosis. Human-reviewed frozen v1 explicitly approved: A+B PASS; A+C PASS; B+C FAIL because diagnosis is absent; 3/3 full recall; 2/3 may pass only when diagnosis A is included. It also stated that Déployait vs Participait may justify an ownership question. v2 retained the approved evidence combinations but accidentally made the three-line ownership contrast mandatory for every acceptable combination. v2.1 restores the reviewed intent with branch-specific question rules.

Before replay, expected v2.1 verdicts for the already-generated five-case run must be recorded in the executable-gate validation artifact; they may not be changed after replay.
**Product owner / human reviewer:** Thibaut.
**Purpose:** reconcile the pre-Run-#5 Gold drafts with the later human-reviewed decisions without changing the benchmark to fit Run #5.

## Provenance

The following source artifacts predate the first valid D15-B Gold Run #5 at commit `416f5b94f0f433bd4fc285c4590ae4638e17437b`.

| Source | Working-environment timestamp (UTC) | SHA-256 | Authority |
|---|---|---|---|
| `D15_Gold_Mirror_Rubrics_v1_DRAFT.md` | 2026-09-29 23:12 | `a9060ffd6a221fbf3dd8f7df9c174493cf8b532c16c8c8c3fcde5fa9d9498aff` | pre-run draft |
| `D15_Gold_Mirror_Rubrics_v1.1_DRAFT.md` | 2026-09-29 23:32 | `65b69621fb3492f0ef746a0b256dc0cc31dfe4c03d7860a35ab7d1007e2f83bb` | pre-run adversarial revision |
| `D15_GOLD_MIRROR_RUBRICS_V1_FROZEN_2026-09-30.md` | 2026-09-30 | repository frozen v1 | later human-reviewed authority |

The two timestamps above come from the working environment, not an independently attested clock. Their supporting provenance is the conversation in which both drafts were produced before the D15-B implementation and before Run #5.

### Human-reviewed decisions — Thibaut, product owner, 30 September 2026

1. **Nancy Thread A:** “Managing accounting systems and financial procedures.” is **Must not**. This supersedes v1.1, where its severity remained OPEN.
2. **Thomas:** any correct **2 of the 3** portal lines is acceptable recall; **3 of 3** is full recall. This supersedes v1.1, which required 3 of 3.

### Pre-Run-#5 rules preserved from the drafts

- Marie Thread B: E2 + E6; getting teams to act together on problems.
- David Thread B: E3 + E6; bringing the customer's view inside.
- Nancy Thread B: E2 (“Preparing and analysing actual, forecast and budget financial information.”) is a **Should not** / reduced-purity contextual extra, not an automatic failure.
- Thomas: ownership clarification is a **Must**.

## New policy — adopted after Run #5

**Additional otherwise-legitimate threads are not an automatic whole-CV failure solely because they increase the thread count.**

This is a post-Run-#5 evaluation-policy decision and is not backdated.

An additional thread is acceptable only if it independently satisfies all D15 truth, significance, restraint, traceability and evidence-eligibility requirements and does not consume evidence prohibited by a Gold rule. Required Gold threads must still be recovered. A trivial, role-restating, overlapping, duplicate, or unsupported extra thread remains a failure of the relevant component.

The gate must therefore score **required-thread recall and extra-thread validity separately**, rather than using exact thread count as a proxy for both.

---

## Global rules

1. **Evidence eligibility:** thread evidence is responsibility evidence only. Summary/profile, skills lists, education and role-overview material do not count as thread evidence.
2. **Meaningfulness:** a displayed thread must express a relationship or professional function that is more informative than merely naming the role or activity category. It must not be a generic restatement of the cited duties.
3. **Grounding:** every displayed interpretation must resolve to canonical source evidence. Generated interpretation never becomes evidence.
4. **Maturity:** all five Gold CVs contain one undated role; no Gold thread may exceed **Emerging / Émergente**.
5. **Questions:** at most one clarification question per displayed thread. Ownership tension has priority; otherwise an outcome question may be used when required/appropriate by the case.
6. **Not Said Yet:** missing facts remain missing. They are not inferred to make a thread stronger.
7. **Wording:** exact wording is not scored. Core meaning and truth boundaries are.
8. **Must Not:** any Must Not violation fails that component regardless of prose quality.
9. **Coverage trigger:** high coverage of a CV is not by itself a rejection rule, but should trigger stricter significance review so a role summary cannot masquerade as a professional insight.
10. **No evidence overlap by default:** the same evidence line should not be used to manufacture multiple overlapping threads unless the Gold authority explicitly supports distinct relationships.

---

# 1. Nancy Fine

**Language:** EN. **Required Gold threads:** A and B.

## Thread A — finance continuity through business change

**Required evidence**
- “Supporting acquisition accounting and financial integration activities.”
- “Supporting systems integration following business changes.”
- “Implementing and improving accounting systems and processes.”

**Core meaning**
Her work repeatedly sits where finance has to keep functioning while systems, processes or the business itself are changing.

**Grouping**
- Must recover the three-line change/integration pattern.
- **Must not:** “Managing accounting systems and financial procedures.” Human decision, 2026-09-30: steady-state systems management does not establish the change/integration relationship.
- Must not use “Maintaining effective financial controls and reporting processes.” or Thread B evidence to manufacture this thread.

**Must Not**
No claim that she led acquisitions/integrations; no invented outcome, scale, number of acquisitions, dates/duration, seniority, “strategic” or transformation-leadership claim.

**Question**
Must surface the ownership tension between “Supporting…” and “Implementing…”, without deciding it.

**Not Said Yet**
Outcome, scale, timing.

**Maturity**
Emerging.

## Thread B — financial information into management decisions

**Required evidence**
- “Providing financial information to management to support business decisions.”
- “Communicating financial information to internal stakeholders.”

**Core meaning**
Her role connects financial information to the people who make decisions.

**Grouping**
- The two required lines are the core.
- “Preparing and analysing actual, forecast and budget financial information.” is **Should not / reduced purity**, but is tolerated as contextual evidence if the required core and meaning remain intact.
- Must not use statutory-reporting/control lines as the connecting theme.

**Must Not**
No claim that her information changed decisions/outcomes; no “strategic adviser”, “business partner”, unsupported seniority, or upgraded audience.

**Question**
Outcome question is Should, unless a higher-priority ownership tension is present.

**Not Said Yet**
Outcome, scale, timing.

**Maturity**
Emerging.

---

# 2. Marie Diallo

**Language:** FR. Headlines/questions/gaps must be in French. **Required Gold threads:** A and B.

## Thread A — diagnosing and changing the order flow

**Required evidence**
- E5: « Analysait les retards de livraison et présentait les causes principales à la direction. »
- E3: « Déployait de nouvelles procédures de suivi des commandes dans les agences. »
- E8: « Participait à la réorganisation du processus de traitement des commandes. »

**Core meaning**
She identifies where the order flow breaks down and helps change the procedures behind it.

**Recall**
- Full: E5 + E3 + E8.
- Acceptable: E5 + E3 or E5 + E8.
- E3 + E8 without E5 fails the diagnosis half of the meaning.

**Must Not**
Do not use routine supplier/internal-team “suivi” as if the shared word established this pattern. Do not claim delays fell, procedures succeeded, or that she led the reorganisation. Do not invent scale/dates.

**Recall tiers and checkable meaning**
- **Acceptable partial recall — E5 + E3:** PASS only when the headline explicitly preserves both (a) analysis/diagnosis of delivery delays or their causes and (b) deployment/change of order-tracking procedures. Required question: a neutral **outcome** question about what changed after the procedure deployment; it must not assume improvement.
- **Acceptable partial recall — E5 + E8:** PASS only when the headline explicitly preserves both (a) analysis/diagnosis of delivery delays or their causes and (b) participation in changing/reorganising the order process. Required question: a neutral **ownership clarification** about what Marie personally did/owned within the reorganisation versus what she participated in; it must not import E3 or presume leadership.
- **Full recall — E5 + E3 + E8:** PASS/full only when the headline preserves diagnosis plus process/procedure change. Required question: explicitly surface the « Déployait » versus « Participait à » ownership tension and ask what she personally led/owned versus supported/participated in, without presuming the answer.
- **E3 + E8 without E5:** FAIL. Diagnosis is absent.

For deterministic gate purposes, “diagnosis/change meaning preserved” is not satisfied by generic words such as procédures, commandes, direction, suivi, équipes, changement or réorganisation alone. The displayed headline must represent the E5 delivery-delay/cause analysis and connect it to the evidenced procedure/process change in the accepted branch.

**Question**
The branch-specific question above is **Required**, not optional. Missing it fails the clarification component.

**Not Said Yet**
Outcome, timing.

**Maturity**
Émergente / Emerging.

## Thread B — getting teams to act together on problems

**Required evidence**
- « Suivait les incidents clients et organisait leur résolution avec les équipes concernées. »
- « Coordonnait le suivi des fournisseurs et des équipes internes lors des périodes de forte activité. »

**Core meaning**
When a problem spans several parties, she organises them to resolve it.

**Must Not**
Routine “Coordonnait les opérations quotidiennes de trois agences régionales” is scope evidence, not thread evidence. No invented resolution speed/rates, customer satisfaction or team size.

**Question**
Outcome question is Should.

**Not Said Yet**
Outcome, scale, timing.

**Maturity**
Émergente / Emerging.

---

# 3. David Okoro

**Language:** EN. **Required Gold threads:** A and B. **Primary purpose:** semantic recall beyond lexical/topic matching.

## Thread A — giving the sales team its operating rhythm

**Required evidence**
- “Prepared monthly sales forecasts and reviewed variances with the sales team.”
- “Introduced a structured pipeline review for the sales team.”
- “Coached new account executives on customer planning and reporting routines.”

**Core meaning**
Beyond managing accounts, he builds the planning and review discipline the sales team runs on.

**Recall**
Full = all three. Two of three may pass only when the structured pipeline-review line is included and the core operating-rhythm meaning is preserved.

**Must Not**
Do not contaminate with “Managed a portfolio…” or “Supported negotiations…”. No forecast/revenue/win-rate/pipeline-result claims, title upgrade, team size or dates. “Account management” or “sales” alone is a role/category restatement, not the Gold insight.

**Question**
The draft allows either an ownership contrast or an outcome question. At most one question.

**Not Said Yet**
Outcome, scale, timing.

**Maturity**
Emerging.

## Thread B — bringing the customer's view inside

**Required evidence**
- “Visited key accounts to understand customer priorities and coordinate follow-up.”
- “Presented customer and market observations to senior management.”

**Core meaning**
He carries what customers need back to the people who decide.

**Must Not**
Do not use product-launch coordination as the connecting evidence. Do not claim his observations changed strategy or products. Do not pass a grouping merely because both lines contain customer/customer-related words.

**Question**
Outcome question is Should.

**Not Said Yet**
Outcome, timing.

**Maturity**
Emerging.

---

# 4. Elena Martin — negative control

**Language:** EN. **Required Gold threads:** zero. **Primary purpose:** restraint/significance.

All eight lines are routine assigned duties. The evidence does not yet establish a meaningful professional pattern.

**Required result**
- Zero displayed professional threads.
- No trait inference from duties.
- No ownership, initiative or improvement claim.
- No “administrative support”, “office”, “maintained”, record-keeping, reliability, organisation, operational-discipline or similar role/category restatement masquerading as insight.

**Question**
At least one pattern-seeking question at CV level, because there is no thread to carry it. It may ask whether she changed how a task was done or clarify scale/people supported. It must not assume an achievement.

**Not Said Yet**
Initiative/ownership, outcome, scale, timing.

**Maturity**
Not applicable.

**Story**
No story sentence.

---

# 5. Thomas Richards

**Language:** EN. **Required Gold threads:** one portal/user thread. **Primary purpose:** recall across representation boundaries.

## Portal rollout / users

**Required evidence**
- “Supported the rollout of a new customer portal.”
- “Collected user feedback during the portal rollout.”
- “Assisted with training sessions for users of the new portal.”

**Core meaning**
He works where a new system meets the people who have to use it.

**Recall — human decision, Thibaut, 2026-09-30**
- Any correct 2 of the 3 required portal lines is **acceptable recall** if the portal/user meaning is preserved.
- 3 of 3 is **full recall**.
- Failure to recover the portal/user relationship is a recall failure.

**Must Not**
No project-administration second thread from meetings/action logs/status/documentation/risk registers/steering materials. No ownership/leadership upgrade, adoption result, user count or dates.

**Question — pre-Run-#5 Must**
Ownership clarification is mandatory. The evidence is support-level; ask what Thomas personally owned without assuming the answer.

**Not Said Yet**
Ownership, outcome, scale, timing.

**Maturity**
Emerging.

---

# Gate interpretation

The next Gold Gate must score separately:

1. required-thread recall;
2. core-meaning/significance;
3. evidence purity and eligibility;
4. Must Not violations;
5. required candidate clarification;
6. Not Said Yet;
7. maturity;
8. restraint;
9. traceability;
10. extra-thread validity.

A Gold CV does not pass merely because its evidence IDs match. A correct evidence set with a trivial or unsupported interpretation fails meaning/significance. Conversely, a semantically correct required thread is not failed solely because it includes a specifically tolerated contextual line.

The semantic scorer must not be treated as independent merely because it is a separate call to the same model family. Before the 3×5 Gold validation can be trusted, semantic scoring requires a genuinely independent model and/or explicit human review of every accepted headline.

**Run #5 at `416f5b94f0f433bd4fc285c4590ae4638e17437b` remains the frozen pre-correction semantic baseline.**


---

## v2.1 executable-gate requirements added before replay

1. **Expected replay verdicts are preregistered before replay.** The validation artifact must state the expected component verdicts for Nancy, Marie, David, Elena and Thomas before the corrected scorer is run on the saved output.
2. **Unmatched extra threads have a third path.** They are not automatic PASS or automatic FAIL. Each is recorded as `LEGITIMATE` or `ILLEGITIMATE` against evidence eligibility, relationship/significance, truth boundaries, traceability, overlap and restraint. Required-thread recall is scored separately.
3. **Elena scope is explicit.** Zero professional threads is necessary but not sufficient. D15 must also produce at least one premise-free CV-level pattern-seeking question. Until that capability exists, Elena fails the complete v2.1 D15-B gate even when restraint passes.
4. **Deterministic grounded-support handling.** When a source atom explicitly uses support-level wording and a headline faithfully paraphrases that support wording without upgrading ownership, the gate must not fail it as leadership merely because the semantic judge misreads the phrase.
5. **Synthetic branch fixtures are mandatory before trusting replay:** Marie E5+E3 acceptable branch; Marie E5+E8 acceptable branch; Marie E5+E3+E8 full branch; Marie E3+E8 diagnosis-missing FAIL branch; Thomas grounded support-language case; one unmatched extra-thread case exercising LEGITIMATE/ILLEGITIMATE routing.
6. **Language is a component gate.** Thread language is determined from cited source atoms, passed to headline and question generation, and independently checked. Generated text is never used to infer the required language.
