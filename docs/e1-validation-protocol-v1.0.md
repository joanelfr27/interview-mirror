# E1 Validation Protocol v1.0

Status: pre-registered design; results must not be interpreted until the protocol is executed.

## Primary validity question
Does the E1 requirement-facet evidentiary reader agree with independent expert annotation more reliably than a strong generic-LLM baseline, while preserving source traceability and truthfulness?

## Evaluation layers

### 1. Extraction fidelity
Sample varied CV/JD pairs across finance, commercial, operations, technology and professional-services roles.
Measure:
- exact source-span fidelity
- atom omission/addition rate against expert annotations
- requirement/facet decomposition agreement

### 2. Support validity
Independent experts annotate each facet using Codebook v1.0.
Measure:
- categorical agreement
- Cohen's kappa or Krippendorff's alpha where sample size permits
- system-vs-expert agreement
- generic-LLM-vs-expert agreement

### 3. Test-retest stability
Run identical CV/JD inputs repeatedly under the same configuration.
Predeclare acceptable status stability before inspecting results.

### 4. EN/FR invariance
Use semantically equivalent English and French versions of the same CV/JD pair.
Compare:
- atom identity and source anchoring
- requirement/facet identity
- support status
- unresolved-item classification
Differences are allowed only where translation changes explicit semantic content.

### 5. Independent evaluator
At least one evaluation layer must use human experts or a different model family from the extraction/judgment model. Self-evaluation by the same model family is not sufficient.

### 6. Strong generic baseline
Baseline must receive the same CV/JD content, the same task definition and equivalent output schema, but without the E1 ledger/facet architecture.
Do not use a deliberately weak prompt.

### 7. Demonstration quality
Blind human raters assess candidate responses using a fixed rubric:
- evidence utilization
- specificity
- ownership clarity
- scope/scale clarity
- outcome attribution
- truthfulness/unsupported-claim rate
- response to follow-up probing

## Predeclared gate
Before viewing comparative results, freeze:
- sample composition
- annotation codebook
- primary metrics
- minimum acceptable agreement
- test-retest criterion
- EN/FR equivalence criterion
- unsupported-claim tolerance
- baseline prompt and model configuration

No production Strategy cutover follows from one successful case. Shadow evidence must cover multiple role families and candidate profiles.

## Important epistemic distinction
Structural validators establish integrity and provenance. They do not establish semantic validity. Semantic validity requires independent annotation or human judgment.
