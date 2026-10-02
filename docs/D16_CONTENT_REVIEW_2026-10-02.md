# D16 content review 2 October 2026

The assembled-input run demonstrated evidence-linked action formatting and truth boundaries. Its original content receives PARTIAL_PASS_CONTENT_REVIEW. The revised offline replay meets the Nancy preparation yardstick and gives Thomas a useful gap-defense exercise. This review does not establish automatic anchor selection, candidate benefit in use, or qualification.

## Provenance and scope

- Upstream run: 37032538646; engine 42cf5ef6eb09501960159352f27d9b343bcbf085.
- ZIP SHA-256: 6a876aa017884d36086335ef5908f2fd0c2433d4a0db52f4cbaafe5951ebb918.
- Upstream report SHA-256: 64d1953da7db576dfa1994bccfe9e89e3015fda73bb4faaa2ff0e0290390a802.
- Inputs: saved complete canonical graphs from responsibility lines of two familiar Gold CV fixtures. These are not full uploaded CV documents.
- Role: one synthetic international-accounting-standards requirement, identical requirement-model fingerprint for both candidates.
- Nancy anchors remain curated; Thomas has no selected anchor. No accepted D15 thread was supplied. Automatic selection and multi-tension criticality/compression were not measured.
- Revised replay: scripts/d16-replay-preparation.ts; zero model calls, no database writes, no production cutover. Original report remains unchanged.

## Nancy against the hand-written yardstick

Source: docs/D16_NANCY_ACTION_YARDSTICK_2026-10-02.md. Each row corresponds to a substantive yardstick instruction. PASS means the revised wording satisfies the instruction, not that Nancy has supplied the requested facts.

| Yardstick instruction | Original output | Revised offline output | Review |
|---|---|---|---|
| PREP chooses one statutory/reporting or acquisition-accounting example | Offered three anchors without a completed choice | Asks candidate to choose one; system context stays available but cannot prove a standard | PASS; choice is a candidate task, not persisted state |
| Prepare issue and personal task | Broad instruction | Explicit issue and task | PASS |
| Separate candidate from integration team and other actors | Boundary stated | Task names others' responsibilities; support cannot become leadership | PASS |
| Name standard, jurisdiction and period only with substantiation | Standard warning; jurisdiction/period absent | All three required conditionally | PASS |
| Bring anonymized source or precise account of applying the rule | Missing concrete artifact task | Explicit source/account task | PASS |
| Otherwise leave international-standard experience unconfirmed | Proof refs empty; status unresolved | Status and empty proof refs retained; distinguish unverified requirement | PASS |
| System implementation does not establish IFRS expertise | Generic no-unsupported-standard warning | Explicit system-implementation warning, no IFRS claim | PASS |
| PRACTICE asks which rule/standard and what candidate personally did | General rehearsal | Concrete question tied to the named requirement | PASS |
| Start from chosen example | Incorrectly called it “selected” | “Your chosen example in PREP” | PASS; does not assert choice already happened |
| Do not upgrade support to leadership | Present | Retained | PASS |
| If standard unestablished, distinguish documented work | Present broadly | Explicit boundary in rehearsal | PASS |
| Follow up on judgment and substantiating evidence | Missing concrete question | Exact judgment/evidence follow-up | PASS |
| Do not invent rule, outcome or ownership | Present | Retained | PASS |

The probe says “rule or standard” under the explicit international-standards requirement. It allows Nancy to describe the actual rule without falsely naming an international standard. This is a deliberate wording adaptation, not a finding that the requirement is proved. French equivalents are implemented and covered by unit tests; this offline assembled-input replay was English only.

## Thomas usefulness decision

Original content was insufficient: rehearsing “the requirement remains unestablished” establishes a boundary but does not prepare a candidate for a probe. It also appended anchor instructions to actions with no anchors.

Revised PREP asks for a three-part answer: documented background; the closest adjacent experience if any and its limits; a realistic learning/supervised-practice step and how progress would be demonstrated. If there is no adjacent experience, it explicitly says not to invent one. Revised PRACTICE rehearses a concrete readiness question, beginning with the boundary and distinguishing a future plan from completed experience. Anchor-specific text is absent.

Verdict: useful enough as a development gap-defense exercise for this unsupported requirement. It is not an automatically chosen transfer strategy; no adjacent example or learning program was selected by D16, and candidate usefulness has not been observed in an interview. The candidate still has to supply the truthful example or plan.

## Persistence correction

The first replay exposed a v2 fingerprint mismatch after JSON persistence: undefined optional fields were hashed before saving but omitted by JSON. The v2 fingerprint now hashes explicitly versioned JSON-canonical material. The cached fixture retains each original upstream fingerprint and records the replay conversion; evidence, support judgments and legacy D16 dependency snapshots are unchanged. A regression checks round-trip equality and rejection of changed evidence context. Legacy production fingerprinting is unchanged.

## Status and next capability

CONTENT_REVIEW_PASS_DEVELOPMENT_REPLAY, with curated-selection and single-requirement scope. Typecheck and 345 tests passed (344 canonical and one D14 runtime); four replay actions validated. Automatic relevance selection, a real validated D15 input, full-JD tension selection/compression and independent review remain open. The next capability experiment should let D16 select from saved canonical evidence and a validated CONFIRMED_RELATIONSHIP, compare against the Nancy yardstick, and exercise more than one requirement before any qualification claim.
