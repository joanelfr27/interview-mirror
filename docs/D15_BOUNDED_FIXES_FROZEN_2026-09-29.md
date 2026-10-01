# D15 Bounded Fixes — Frozen Pair-Level Prediction

Status: FROZEN before second adversarial review and 15-run live validation.

## Scope

This experiment implements only four bounded fixes:
1. English/French generic-token parity, including accented and accent-free French spellings.
2. A finite English/French function-word stop list.
3. E1 atomicity: one explicit action proposition per atom; object must not contain a second action.
4. Canonical E1 source-section recording, with non-bullet role-overview evidence retained for traceability but prohibited from creating D15 edges.

Options previously considered and rejected by offline comparison:
- Core-noun matching: rejected because it destroys meaningful modifying-phrase connections such as Thomas portal and Marie commandes.
- Within-CV frequency guard: rejected because confirmed false positives and useful words have overlapping frequencies.

## Atom numbering

The frozen pair table uses substantive-evidence numbering, excluding Nancy's role-overview atom.
Runtime diagnostics may use the E1 numbering, where Nancy's role-overview line was atom 1 in Run #48. Scoring must map runtime evidence IDs to this frozen substantive numbering before comparing pairs.

## Frozen predictions

### Nancy

Substantive atoms:
1 Managing accounting systems and financial procedures.
2 Preparing and analysing actual, forecast and budget financial information.
3 Managing statutory financial reporting and taxation requirements.
4 Supporting acquisition accounting and financial integration activities.
5 Supporting systems integration following business changes.
6 Implementing and improving accounting systems and processes.
7 Training and developing finance staff.
8 Providing financial information to management to support business decisions.
9 Maintaining effective financial controls and reporting processes.
10 Communicating financial information to internal stakeholders.

Retained:
- 2–8 (information)
- 2–10 (information)
- 3–9 (reporting)
- 4–5 (integration)
- 4–6 (accounting)
- 8–10 (information)

Removed:
- All edges involving the role-overview atom.
- No additional lexical removal is predicted for accounting, information, or reporting.

### Marie

Retained:
- 1–3 (agences)
- 3–4 (procédures)
- 3–6 (suivi)
- 3–8 (commandes)
- 5–7 (direction)

Removed:
- 2–6 (équipes) through French generic-token parity.

No workplace-noun blacklist is applied; agences, procédures, suivi, direction, and commandes remain lexical matches at this stage.

### David

Retained:
- 1–8 (customers)

Removed:
- 5–8 (with) through the function-word stop list.

### Elena

Retained:
- 2–7 (office)

Removed:
- 5–6 (maintained) through E1 one-action atomicity.

The retained office edge is an expected residual false positive and is a launch blocker while the D15 cutover remains off.

### Thomas

Fixed prediction:
- 4–7 (portal) is expected whenever canonical E1 objects preserve portal in both atoms.

E1-dependent:
- 4–5
- 5–7

These two pairs depend on where E1 ends line 5's object phrase. Their variation is an E1 object-boundary finding, not a D15 miss.

## Research boundary

After these four fixes, remaining common-noun collisions are intentionally not solved by another lexical blacklist or frequency heuristic.
Object boundaries are also a research variable: broader objects can recover true relationships while introducing false lexical matches; narrower objects can remove both.
Meaning-based grouping remains out of scope for this bounded correction.

## Launch blocker

The negative control must not produce a candidate-facing Professional Mirror thread from ordinary administrative vocabulary. If Elena retains office as a thread after the four bounded fixes, D15 remains non-cutover and the residual lexical/semantic grouping problem is a launch blocker.

## Validation

Run the five controlled CVs three times each after implementation.
For every run record:
- commit
- session fingerprint
- E1 atom population
- rejected atoms
- runtime-to-frozen atom mapping
- pair-level retained/removed/variable status
- exact shared token
- thread membership
- maturity
- negative-control outcome

Do not tune thresholds, add workplace-noun exceptions, change semantic grouping, or change maturity rules after seeing the 15-run results.