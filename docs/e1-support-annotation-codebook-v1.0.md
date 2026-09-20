# Interview Mirror E1 Support Annotation Codebook v1.0

Status: frozen for the E1 validation study. This codebook must be versioned before system results are reviewed.

## Unit of annotation
One Requirement Facet is the unit. Annotators receive only the candidate Atomic Evidence, its source spans, and the exact JD facet.

## Support statuses

### DIRECT
Use only when one or more explicit candidate atoms satisfy the facet without requiring an unstated material dimension.
Example: JD requires "ACCA qualification"; CV explicitly states "ACCA qualified".
Do not infer direct support from job title, years of experience, or typical responsibilities.

### PARTIAL
Use when explicit atoms address the facet but a material required dimension remains unresolved.
Example: JD requires finance leadership across 10 countries; CV documents finance leadership but does not state geographic scope.

### ANALOGICAL_TRANSFER
Use only when explicit evidence demonstrates a genuinely adjacent capability, while the required context/tool/domain is different.
Annotator must record the shared dimensions and the unshared dimensions. Never use this label merely because two activities sound similar.
Shared dimensions: task/function, decision type, scale, stakeholders, or process.
Unshared dimensions: domain, tool, regulation, operating context, or other material facet.

### CONTRADICTORY
Use only when explicit candidate evidence conflicts with the facet.
An explicit negative statement can support contradiction.
Unmentioned information is never contradictory.

### NONE
Use when the supplied candidate evidence contains no adequate support for the facet.
If the available information is insufficient to distinguish a positive status, abstain rather than infer.

## Requirement status aggregation
Apply mechanically, after every facet has a judgment:
1. Any CONTRADICTORY facet -> CONTRADICTED.
2. Otherwise, all facets DIRECT -> SUPPORTED.
3. Otherwise, at least one DIRECT/PARTIAL/ANALOGICAL_TRANSFER facet -> PARTIAL.
4. Otherwise -> UNRESOLVED.

## Gap classification
Do not classify Evidence Gap, Transferable, or Experience Gap from the CV alone.
Use candidate elicitation:
- Evidence Gap: candidate establishes direct experience that was undocumented in the source CV.
- Transferable: candidate establishes adjacent experience, not the same requirement.
- Experience Gap: candidate establishes that they have not actually performed the required activity.

Elicitation prompts must be open and non-leading.

## Evidence basis
Documented source evidence and candidate self-report are distinct provenance classes.
Candidate self-report must never be silently merged into documented CV support.

## Truthfulness
A Demonstration Objective may only permit claims supported by cited Atomic Evidence or explicitly identified candidate self-report. It must prohibit upgrading partial, transferable, absent, or contradictory evidence into direct experience.

## Annotation protocol
Annotators independently label each facet, record a short rationale, and flag abstention when evidence is insufficient. Disagreements are adjudicated only after independent labels are recorded.
