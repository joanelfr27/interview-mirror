import { createHash } from "node:crypto";
import { effectiveActorBasis, type EvidenceLedger } from "@/lib/canonical-evidence-model";
import type { CanonicalStrategyBridgeProjection, CanonicalStrategyBridgeRequirement } from "@/lib/canonical-strategy-bridge";
import { validateCanonicalStrategyBridgeProjection } from "@/lib/canonical-strategy-bridge";
import {
  roleCapabilityCriticalityOrder,
  validateRoleCapabilityModelAgainstCanonicalRequirements,
  type RoleCapabilityCriticality,
  type RoleCapabilityModel,
} from "@/lib/role-capability-model";
import type { ProfessionalMirror } from "@/lib/professional-mirror";
import type { D15BVerifiedThread } from "@/lib/d15-semantic-thread-engine";
import { validateG, validateS, relationshipVetoes, licensingVetoes } from "@/lib/d15-gs-judges";
import { D15_CODEBOOK_BLOB } from "@/lib/d15-gs-v11-rules";
import { d15ThreadEligibleAtoms } from "@/lib/d15-evidence-eligibility";
import { closedClarification } from "@/lib/d15-clarification-state";
import { validateSemanticReading, readingVetoes } from "@/lib/d15-semantic-reading";

export const D16_VERSION = "d16-v1" as const;

export type D16EvidenceReferenceMode =
  | "SUPPORTED_EVIDENCE"
  | "NO_CANDIDATE_EVIDENCE"
  | "MIXED_EVIDENCE";

export type AssessmentContext = {
  version: "assessment-context-v1";
  context_id: string;
  requirement_relevance: Record<string, "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN">;
};

export type D16DependencySnapshot = {
  version: "d16-dependency-snapshot-v1";
  d15_fingerprint: string;
  rcm_fingerprint: string;
  jd_fingerprint: string | null;
  assessment_context_fingerprint: string | null;
};

export type D16Inputs = {
  mirror: ProfessionalMirror;
  bridge: CanonicalStrategyBridgeProjection;
  role_capability_model: RoleCapabilityModel;
  ledger: EvidenceLedger;
  assessment_context?: AssessmentContext;
  canonical_requirements: Array<{ id: string; normalized_requirement: string }>;
  jd_present: boolean;
  jd_fingerprint: string | null;
  dependency_snapshot: D16DependencySnapshot;
};

export type ContextualDelta = {
  scope: boolean;
  ownership: boolean;
  complexity: boolean;
  seniority: boolean;
  scale: boolean;
  domain: boolean;
};

export type StrategicTension = {
  id: string;
  requirement_id: string;
  requirement: string;
  mode: "DIRECT" | "TRANSFERABLE" | "VERIFY_GAP";
  canonical_status: "SUPPORTED" | "PARTIAL" | "UNRESOLVED" | "CONTRADICTED";
  role_criticality: RoleCapabilityCriticality;
  assessment_relevance: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  preparation_priority: number;
  interview_vulnerability: string;
  strategic_significance: string;
  evidence_reference_mode: D16EvidenceReferenceMode;
  evidence_ids: string[];
  evidence_provenance_ids: string[];
  strategic_objective: string;
  prep_objective: string;
  practice_target: string;
  truthfulness_boundary: {
    permitted_claims: string[];
    prohibited_claims: string[];
  };
  contextual_delta: ContextualDelta;
  contradiction_present: boolean;
};

export type D16Action = {
  id: string;
  dispatcher: "PREP" | "PRACTICE" | "EVALUATION";
  requirement_id: string;
  evidence_reference_mode: D16EvidenceReferenceMode;
  evidence_ids: string[];
  evidence_provenance_ids: string[];
  canonical_status: StrategicTension["canonical_status"];
  role_criticality: RoleCapabilityCriticality;
  assessment_relevance: StrategicTension["assessment_relevance"];
  strategic_significance: string;
  prep_objective: string;
  practice_target: string;
  truthfulness_boundary: StrategicTension["truthfulness_boundary"];
  assessment_context: AssessmentContext | null;
};

export type D16Strategy = {
  version: typeof D16_VERSION;
  d6_version: "d6-v1";
  role_capability_model_version: "rcm-v1";
  jd_present: boolean;
  tensions: StrategicTension[];
  actions: D16Action[];
  dependency_snapshot: D16DependencySnapshot;
};

/** Explicit development selection; contextual relevance is curated, never proof. */
export type D16PreparationSelection = {
  requirement_id: string;
  preparation_evidence_ids: string[];
  relationship_ids: string[];
};
export type D16PreparationInputs = {
  canonical: D16Inputs;
  accepted_relationships: D15BVerifiedThread[];
  selections: D16PreparationSelection[];
  language: "en" | "fr";
  selection_source?: "CURATED" | "AUTOMATIC_CONTEXT_SELECTOR";
  dependency_fingerprint: string;
};
export type D16PreparationAction = {
  version: "d16-preparation-v2-development";
  id: string;
  dispatcher: "PREP" | "PRACTICE";
  requirement_id: string;
  canonical_status: StrategicTension["canonical_status"];
  requirement_proof_refs: Array<{ evidence_id: string; source_span_id: string; support_status: string }>;
  preparation_anchor_refs: Array<{ evidence_id: string; source_span_id: string; source_type: string; actor: string; ownership: string }>;
  d15_thread_refs: string[];
  missing_facet_ids: string[];
  evidence_reference_mode: D16EvidenceReferenceMode;
  personalization: "CURATED_CONTEXTUAL_ANCHORS" | "AUTOMATIC_CONTEXTUAL_ANCHORS" | "NO_RELEVANT_ANCHOR";
  role_criticality: RoleCapabilityCriticality;
  assessment_relevance: StrategicTension["assessment_relevance"];
  assessment_context: AssessmentContext | null;
  preparation_priority: number;
  strategic_significance: string;
  prep_objective: string;
  practice_target: string;
  instruction: string;
  expected_artifact: string;
  language: "en" | "fr";
  truthfulness_boundary: StrategicTension["truthfulness_boundary"];
  dependency_fingerprint: string;
};

export function buildD16PreparationFingerprint(input: Omit<D16PreparationInputs, "dependency_fingerprint">): string {
  // Includes the ledger, support judgments and curated selection, unlike legacy D16's snapshot.
  // Persisted JSON drops undefined object fields. Hash that same representation
  // before saving, so reloads cannot turn unchanged material into stale input.
  return fingerprint({ encoding: "d16-preparation-json-v1", material: JSON.parse(JSON.stringify(input)) });
}

/** Shadow-only versioned projection over the existing deterministic D16 tensions. */
export function buildD16PreparationActions(input: D16PreparationInputs): D16PreparationAction[] {
  const { dependency_fingerprint, ...material } = input;
  if (dependency_fingerprint !== buildD16PreparationFingerprint(material)) throw new Error("Stale D16 preparation dependencies.");
  if (input.selection_source !== undefined && !["CURATED", "AUTOMATIC_CONTEXT_SELECTOR"].includes(input.selection_source)) throw new Error("Invalid D16 selection source.");
  if (!["en", "fr"].includes(input.language)) throw new Error("Invalid D16 preparation language.");
  const canonical = input.canonical;
  const strategy = buildD16Strategy(canonical);
  const atoms = new Map(canonical.ledger.evidence.map(a => [a.id, a]));
  const spans = new Map(canonical.ledger.source_spans.map(s => [s.id, s]));
  const mirrorRefs = new Map(canonical.mirror.evidence.map(e => [e.evidence_id, e]));
  const threadEligible = new Set(d15ThreadEligibleAtoms(canonical.ledger).map(a => a.id));
  const relationships = new Map(input.accepted_relationships.map(t => [t.id, t]));
  if (relationships.size !== input.accepted_relationships.length) throw new Error("Duplicate D15 relationship IDs.");
  const chosen = new Map(input.selections.map(s => [s.requirement_id, s]));
  if (chosen.size !== input.selections.length || input.selections.some(s => !strategy.tensions.some(t => t.requirement_id === s.requirement_id))) throw new Error("Invalid D16 preparation selection.");
  function resolve(id: string) {
    const atom = atoms.get(id), span = atom && spans.get(atom.source_span_id);
    if (!atom || !span || !span.text.trim()) throw new Error("Forged or missing D16 preparation reference: " + id);
    const mirrorRef = mirrorRefs.get(id);
    if (!mirrorRef || mirrorRef.source_span_id !== span.id || mirrorRef.source_quote !== span.text || mirrorRef.source_type !== atom.provenance.source_type) throw new Error("D16 preparation Mirror provenance mismatch: " + id);
    if (atom.assertion.polarity !== "AFFIRMATIVE") throw new Error("Non-affirmative D16 preparation anchor: " + id);
    if (effectiveActorBasis(atom) === "UNSPECIFIED") throw new Error("Unspecified D16 preparation attribution: " + id);
    return { atom, span };
  }
  // Check the existing D15 result contract; never re-judge or infer a relationship in D16.
  for (const t of input.accepted_relationships) {
    const gs = t.gs_decision;
    const cited = t.evidence_ids.map(id => { const { span } = resolve(id); return { evidence_id: id, source_text: span.text }; });
    const language = gs?.semantic_reading?.language ?? (t.headline.startsWith("Vous ") ? "fr" : "en");
    const closed = closedClarification(canonical.ledger, t.evidence_ids, t.headline, language)
      || (gs && closedClarification(canonical.ledger, t.evidence_ids, gs.asserted_proposition, language));
    const readingInvalid = gs?.semantic_reading && readingVetoes(validateSemanticReading(gs.semantic_reading, t.headline)).length;
    if (!gs || !gs.accepted || gs.codebook_blob !== D15_CODEBOOK_BLOB
      || gs.headline !== t.headline || t.verification !== "SUPPORTED" || gs.vetoes.length
      || licensingVetoes(gs.G).length || closed || readingInvalid
      || t.evidence_ids.some(id => !threadEligible.has(id) || effectiveActorBasis(atoms.get(id)!) === "EXPLICIT_OTHER")
      || !validateG(gs.G, cited).supported || !validateS(gs.S).supported
      || relationshipVetoes(canonical.ledger, t.evidence_ids, t.headline + " " + gs.asserted_proposition).length) {
      throw new Error("Unvalidated D15 relationship: " + t.id);
    }
  }
  return strategy.tensions.flatMap(tension => {
    const selection = chosen.get(tension.requirement_id);
    const threadIds = [...new Set(selection?.relationship_ids ?? [])];
    const anchorIds = [...new Set([...(selection?.preparation_evidence_ids ?? []), ...threadIds.flatMap(id => {
      const t = relationships.get(id);
      if (!t) throw new Error("Missing accepted D15 relationship: " + id);
      return t.evidence_ids;
    })])].sort();
    const anchors = anchorIds.map(resolve);
    const requirement = canonical.bridge.requirements.find(r => r.requirement_id === tension.requirement_id)!;
    const proof = requirement.evidence.filter(e => ["DIRECT", "PARTIAL", "ANALOGICAL_TRANSFER"].includes(e.support_status));
    const facets = canonical.ledger.requirements.find(r => r.id === tension.requirement_id)?.facets ?? [];
    const missing = facets.filter(f => !canonical.ledger.support_judgments.some(j => j.requirement_id === tension.requirement_id && j.facet_id === f.id && j.status === "DIRECT" && !j.abstained)).map(f => f.id);
    const fr = input.language === "fr";
    const attributedQuote = (id: string) => {
      const { atom, span } = resolve(id);
      const tag = effectiveActorBasis(atom) === "EXPLICIT_OTHER" ? (fr ? ` (travail de : ${atom.subject.actor})` : ` (work of: ${atom.subject.actor})`) : "";
      return `« ${span.text} »${tag}`;
    };
    const source = anchors.map(({ atom }) => attributedQuote(atom.id)).join("\n");
    const proofSource = proof.map(e => attributedQuote(e.evidence_id)).join("\n");
    const relationshipsText = threadIds.map(id => relationships.get(id)!.headline).join("; ");
    const conflict = tension.contradiction_present ? (fr ? " Le dossier contient une contradiction : préparez à l'expliquer sans privilégier arbitrairement une version." : " The record contains a contradiction: prepare to explain it without arbitrarily choosing one version.") : "";
    const boundary = (anchors.length ? (fr
      ? "Ces éléments servent de contexte de préparation, sans établir à eux seuls cette exigence. Distinguez votre contribution de celle des autres; ne transformez pas une assistance en direction. Ne nommez une norme, un résultat ou une ampleur que si vous pouvez les justifier."
      : "These are preparation anchors, not proof of this requirement. Separate your contribution from other actors; do not turn support into leadership. Name a standard, outcome or scale only if you can substantiate it.") : proof.length ? (fr ? "Utilisez les preuves citées dans les limites de leur statut canonique. Tout périmètre ou niveau de responsabilité supplémentaire reste à justifier." : "Use the cited requirement evidence within its canonical support state. Any additional scope or ownership remains to be established.") : (fr ? "Le dossier actuel ne justifie pas cette exigence. Une expérience adjacente ne vaut pas une preuve directe; présentez les étapes d'apprentissage comme un projet, pas comme une expérience acquise." : "The current record does not establish this requirement. Adjacent experience is not direct proof; describe learning steps as a plan, not as completed experience.")) + conflict;
    const topic = `« ${tension.requirement} »`;
    const standards = /\bstandards?\b|\bnormes?\b|\b(?:IFRS|IAS|US GAAP|SYSCOHADA)\b/i.test(tension.requirement);
    const exampleDetail = standards
      ? (fr ? "Préparez le problème précis, votre tâche et les responsabilités des autres. Identifiez la règle, le pays et la période uniquement si vous pouvez les justifier. Assemblez un justificatif anonymisé ou un récit précis de l'application de la règle. L'utilisation ou la mise en œuvre d'un système ne prouve pas à elle seule l'application d'une norme." : "Prepare the specific issue, your task and others' responsibilities. Identify the rule, jurisdiction and period only if you can substantiate them. Assemble an anonymized source or a precise account of applying the rule. Using or implementing a system alone does not prove application of a standard.")
      : (fr ? "Préparez la situation précise, votre contribution et les responsabilités des autres. Assemblez un justificatif anonymisé ou un récit précis de votre travail. Distinguez ce que cet exemple établit des aspects encore non vérifiés de l'exigence." : "Prepare the specific situation, your contribution and others' responsibilities. Assemble an anonymized source or a precise account of your work. Distinguish what this example establishes from the unverified parts of the requirement.");
    const exampleProbe = standards
      ? (fr ? "« Quelle règle ou norme avez-vous appliquée, et qu'avez-vous personnellement fait ? » Puis : « Quel jugement avez-vous exercé, et quelle preuve permettrait de le justifier ? » Si la norme n'est pas établie, distinguez votre travail documenté de l'exigence non vérifiée." : '\"Which rule or standard did you apply, and what did you personally do?\" Then: \"What judgment did you make, and what evidence could substantiate it?\" If the standard is not established, distinguish your documented work from the unverified requirement.')
      : (fr ? "« Qu'avez-vous personnellement fait, et comment cela répond-il à cette exigence ? » Puis : « Quel jugement avez-vous exercé, et quelle preuve permettrait de le justifier ? » Distinguez votre contribution documentée des aspects encore non vérifiés." : '\"What did you personally do, and how does it address this requirement?\" Then: \"What judgment did you make, and what evidence could substantiate it?\" Distinguish your documented contribution from the unverified parts.');
    const prep = anchors.length
      ? (fr ? `Pour ${topic}, choisissez un exemple parmi ces éléments documentés :\n${source}\n${exampleDetail}` : `For ${topic}, choose one example from these documented anchors:\n${source}\n${exampleDetail}`)
      : proof.length ? (fr ? `Pour ${topic}, aucun exemple contextuel n'a été sélectionné. Examinez les preuves de l'exigence :\n${proofSource}\nPréparez votre contribution et ses limites, puis les aspects restant à justifier. N'inventez pas un écart d'expérience à partir d'un écart de preuve.` : `For ${topic}, no contextual example was selected. Review the requirement evidence:\n${proofSource}\nPrepare your contribution and its limits, then the dimensions still to establish. Do not turn an evidence gap into a claim that you lack experience.`)
      : (fr ? `Aucun élément pertinent n'a été sélectionné pour ${topic}. Préparez une réponse en trois parties : ce que votre expérience documentée établit; l'expérience adjacente la plus proche, si elle existe, et ses limites; une étape réaliste d'apprentissage et de pratique supervisée pour combler l'écart, avec un moyen de démontrer votre progression. À défaut d'expérience adjacente, dites-le; n'inventez pas d'exemple.` : `No relevant candidate anchor was selected for ${topic}. Prepare a three-part answer: what your documented experience establishes; the closest adjacent experience, if any, and its limits; one realistic learning and supervised-practice step to close the gap, with a way to demonstrate progress. If there is no adjacent experience, say so; do not invent an example.`);
    const practice = anchors.length
      ? (fr ? `Entraînez-vous à répondre pour ${topic} à partir de l’exemple que vous aurez choisi en PREP, parmi ces éléments :\n${source}\n${exampleProbe}` : `Practise answering for ${topic} from your chosen example in PREP, using these anchors:\n${source}\n${exampleProbe}`)
      : proof.length ? (fr ? `Entraînez-vous à expliquer votre contribution à ${topic} à partir des preuves citées :\n${proofSource}\nDistinguez ce qu'elles établissent du périmètre et des responsabilités restant à justifier.` : `Practise explaining your contribution to ${topic} using the cited requirement evidence:\n${proofSource}\nDistinguish what it establishes from additional scope and ownership still to demonstrate.`)
      : (fr ? `Entraînez-vous à répondre à une question d’entretien sur ${topic} : « Quelle expérience adjacente pouvez-vous apporter, et comment deviendriez-vous prêt ? » Annoncez d'abord la limite, décrivez uniquement une expérience adjacente documentée si elle existe, puis expliquez votre projet d'apprentissage et comment vous démontreriez votre progression. Ne présentez pas le projet comme une expérience acquise.` : `Practise handling a probe on ${topic}: "What adjacent experience could you bring, and how would you become ready?" State the boundary first, explain only documented adjacent experience if any, then describe your learning plan and how you would demonstrate progress. Do not present the plan as completed experience.`);
    const missingNote = missing.length ? (fr ? "\nÀ justifier : " : "\nStill to establish: ") + facets.filter(f => missing.includes(f.id)).map(f => f.requirement).join("; ") + "." : "";
    const selfReport = anchors.some(a => a.atom.provenance.source_type === "CANDIDATE_ELICITED");
    const allConfirmed = threadIds.every(id => relationships.get(id)!.maturity === "CONFIRMED_RELATIONSHIP");
    const note = relationshipsText ? (fr ? `\nRelation ${allConfirmed ? "confirmée" : "acceptée"} : ${relationshipsText}.` : `\n${allConfirmed ? "Confirmed" : "Accepted"} relationship: ${relationshipsText}.`) : "";
    const selfNote = selfReport ? (fr ? " Déclaration du candidat; elle ne démontre pas une récurrence ou une vérification indépendante." : " Candidate self-report; it does not establish recurrence or independent verification.") : "";
    const common = {
      version: "d16-preparation-v2-development" as const, requirement_id: tension.requirement_id,
      canonical_status: tension.canonical_status,
      role_criticality: tension.role_criticality, assessment_relevance: tension.assessment_relevance,
      assessment_context: canonical.assessment_context ?? null,
      preparation_priority: tension.preparation_priority, strategic_significance: tension.strategic_significance,
      prep_objective: tension.prep_objective, practice_target: tension.practice_target,
      requirement_proof_refs: proof.map(e => ({ evidence_id: e.evidence_id, source_span_id: e.source_span_id, support_status: e.support_status })),
      preparation_anchor_refs: anchors.map(({ atom }) => ({ evidence_id: atom.id, source_span_id: atom.source_span_id, source_type: atom.provenance.source_type, actor: atom.subject.actor, ownership: atom.subject.ownership })),
      d15_thread_refs: threadIds, missing_facet_ids: missing,
      evidence_reference_mode: (tension.contradiction_present && (proof.length || anchors.length) ? "MIXED_EVIDENCE" : proof.length || anchors.length ? "SUPPORTED_EVIDENCE" : "NO_CANDIDATE_EVIDENCE") as D16EvidenceReferenceMode,
      personalization: anchors.length ? (input.selection_source === "AUTOMATIC_CONTEXT_SELECTOR" ? "AUTOMATIC_CONTEXTUAL_ANCHORS" as const : "CURATED_CONTEXTUAL_ANCHORS" as const) : "NO_RELEVANT_ANCHOR" as const,
      language: input.language, truthfulness_boundary: tension.truthfulness_boundary, dependency_fingerprint,
    };
    return [
      { ...common, id: tension.id + "-PREP-V2", dispatcher: "PREP" as const, instruction: prep + note + missingNote + "\n" + boundary + selfNote, expected_artifact: anchors.length || proof.length
        ? (fr ? "Une fiche d'exemple avec contribution, justificatifs et limites." : "An example sheet with contribution, substantiation and limits.")
        : (fr ? "Une réponse en trois parties : acquis documentés, expérience adjacente éventuelle et ses limites, plan d'apprentissage." : "A three-part answer: documented background, adjacent experience if any and its limits, learning plan.") },
      { ...common, id: tension.id + "-PRACTICE-V2", dispatcher: "PRACTICE" as const, instruction: practice + note + missingNote + "\n" + boundary + selfNote, expected_artifact: fr ? "Une réponse de pratique; son évaluation appartient à D21." : "A practice response; evaluating it belongs to D21." },
    ];
  });
}

export function validateD16PreparationActions(actions: D16PreparationAction[], input: D16PreparationInputs): { valid: boolean; errors: string[] } {
  try {
    const expected = buildD16PreparationActions(input);
    return JSON.stringify(actions) === JSON.stringify(expected) ? { valid: true, errors: [] } : { valid: false, errors: ["D16 preparation actions differ from the validated canonical projection."] };
  } catch (e) { return { valid: false, errors: [e instanceof Error ? e.message : String(e)] }; }
}

export function reportD16PreparationCoverage(actions: D16PreparationAction[]) {
  return {
    action_count: actions.length,
    actions_with_requirement_proof: actions.filter(a => a.requirement_proof_refs.length > 0).length,
    actions_with_contextual_anchors: actions.filter(a => a.preparation_anchor_refs.length > 0).length,
    actions_without_candidate_evidence: actions.filter(a => a.evidence_reference_mode === "NO_CANDIDATE_EVIDENCE").length,
    linked_reference_count: actions.reduce((n, a) => n + a.requirement_proof_refs.length + a.preparation_anchor_refs.length, 0),
    // IDs alone cannot establish relevance or candidate-specific usefulness.
    personalization_evaluation: "NOT_EVALUATED" as const,
  };
}

const STATUS_PRIORITY: Record<StrategicTension["canonical_status"], number> = {
  CONTRADICTED: 4,
  UNRESOLVED: 3,
  PARTIAL: 2,
  SUPPORTED: 1,
};

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableSerialize).join(",") + "]";
  if (isRecord(value)) return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableSerialize(value[key])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}

function fingerprint(value: unknown): string {
  return "sha256:" + createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

export function buildD16DependencySnapshot(input: { mirror: ProfessionalMirror; role_capability_model: RoleCapabilityModel; jd_fingerprint: string | null; assessment_context?: AssessmentContext }): D16DependencySnapshot {
  return { version: "d16-dependency-snapshot-v1", d15_fingerprint: fingerprint(input.mirror), rcm_fingerprint: fingerprint(input.role_capability_model), jd_fingerprint: input.jd_fingerprint, assessment_context_fingerprint: input.assessment_context ? fingerprint(input.assessment_context) : null };
}

function canonicalRequirementIds(items: Array<{ id: string }>): string[] {
  return [...new Set(items.map((item) => item.id))].sort();
}

function evidenceMode(item: CanonicalStrategyBridgeRequirement, mirror: ProfessionalMirror): D16EvidenceReferenceMode {
  const mirrorIds = new Set(mirror.evidence.map((e) => e.evidence_id));
  const valid = item.evidence.filter((e) => mirrorIds.has(e.evidence_id));
  if (!valid.length) return "NO_CANDIDATE_EVIDENCE";
  const positive = valid.some((e) => e.support_status === "DIRECT" || e.support_status === "PARTIAL" || e.support_status === "ANALOGICAL_TRANSFER");
  const contradictory = valid.some((e) => e.support_status === "CONTRADICTORY");
  if (positive && contradictory) return "MIXED_EVIDENCE";
  return positive ? "SUPPORTED_EVIDENCE" : "NO_CANDIDATE_EVIDENCE";
}

function evidenceIds(item: CanonicalStrategyBridgeRequirement, mirror: ProfessionalMirror): string[] {
  const mirrorIds = new Set(mirror.evidence.map((e) => e.evidence_id));
  return item.evidence.filter((e) => mirrorIds.has(e.evidence_id)).map((e) => e.evidence_id).sort();
}

function provenanceIds(item: CanonicalStrategyBridgeRequirement, ledger: EvidenceLedger): string[] {
  const evidenceById = new Map(ledger.evidence.map((e) => [e.id, e]));
  return item.evidence
    .map((e) => evidenceById.get(e.evidence_id)?.source_span_id)
    .filter((id): id is string => Boolean(id))
    .sort();
}

function contextualDelta(requirement: string, item: CanonicalStrategyBridgeRequirement, rcm: RoleCapabilityModel, mirror: ProfessionalMirror): ContextualDelta {
  const capability = rcm.requirements.find((r) => r.canonical_requirement_id === item.requirement_id);
  const roleText = capability?.normalized_requirement ?? requirement;
  const evidenceText = mirror.evidence
    .filter((e) => item.evidence.some((candidate) => candidate.evidence_id === e.evidence_id))
    .map((e) => e.source_quote)
    .join(" ")
    .toLowerCase();
  const right = roleText.toLowerCase();
  const containsTerm = (text: string, variants: string[]) => {
    const escaped = variants.map((variant) => variant.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|");
    return new RegExp("\\b(?:" + escaped + ")\\b", "i").test(text);
  };
  const delta = (terms: string[][]) => terms.some((variants) => containsTerm(right, variants) && !containsTerm(evidenceText, variants));
  return {
    scope: delta([["scope", "périmètre", "perimetre"], ["regional", "régional", "régionale", "régionaux", "régionales"], ["global", "mondial", "mondiale"], ["multi-country", "multi-pays"], ["multiple", "plusieurs"]]),
    ownership: delta([["ownership", "propriété"], ["own", "posséder", "possède", "possèdent"], ["manage", "managed", "managing", "management", "lead", "led", "leading", "gérer", "géré", "gérée", "gestion", "diriger", "dirigé", "dirigée", "gère", "gères", "gèrent"], ["accountable", "responsable", "redevable"]]),
    complexity: delta([["complex", "complexe"], ["transformation"], ["integration", "intégration"], ["advanced", "avancé", "avancée"]]),
    seniority: delta([["senior"], ["director", "directeur", "directrice"], ["head", "responsable", "chef"], ["manager", "gestionnaire"]]),
    scale: delta([["large", "grand", "grande"], ["million"], ["multi-site", "multi-sites"], ["enterprise", "entreprise"]]),
    domain: delta([["industry", "industrie"], ["sector", "secteur"], ["domain", "domaine"], ["regulated", "réglementé", "réglementée"]]),
  };
}

function evidenceStrength(tension: StrategicTension): number {
  const modeRank: Record<D16EvidenceReferenceMode, number> = { SUPPORTED_EVIDENCE: 3, MIXED_EVIDENCE: 2, NO_CANDIDATE_EVIDENCE: 0 };
  return modeRank[tension.evidence_reference_mode];
}

function deltaCount(delta: ContextualDelta): number {
  return Object.values(delta).filter(Boolean).length;
}

function relevant(
  item: CanonicalStrategyBridgeRequirement,
  assessment?: AssessmentContext,
): AssessmentContext["requirement_relevance"][string] {
  return assessment?.requirement_relevance[item.requirement_id] ?? "UNKNOWN";
}

function isEligible(item: CanonicalStrategyBridgeRequirement, delta: ContextualDelta): boolean {
  if (item.status === "CONTRADICTED" || item.status === "UNRESOLVED" || item.status === "PARTIAL") return true;
  return item.route_mode === "TRANSFERABLE" || deltaCount(delta) > 0;
}

function modeFor(item: CanonicalStrategyBridgeRequirement): StrategicTension["mode"] {
  return item.route_mode;
}

function vulnerabilityFor(
  item: CanonicalStrategyBridgeRequirement,
  mode: StrategicTension["mode"],
  evidence: D16EvidenceReferenceMode,
): string {
  if (item.status === "CONTRADICTED") return "The documented record contains conflicting evidence for this requirement; the interview may probe the discrepancy.";
  if (item.status === "UNRESOLVED" || evidence === "NO_CANDIDATE_EVIDENCE") return "The current evidence does not establish this requirement; the interviewer may ask for a concrete example.";
  if (item.status === "PARTIAL" || mode === "TRANSFERABLE") return "The documented experience is relevant but does not establish every dimension of the target requirement; follow-up may test the transfer.";
  return "The requirement is supported, but follow-up may test scope, ownership, or context.";
}

function significance(
  item: CanonicalStrategyBridgeRequirement,
  criticality: RoleCapabilityCriticality,
  relevanceValue: AssessmentContext["requirement_relevance"][string],
  delta: ContextualDelta,
): string {
  const parts = [
    `${criticality.toLowerCase()} role requirement`,
    item.status.toLowerCase() + " canonical status",
    relevanceValue === "UNKNOWN" ? null : relevanceValue.toLowerCase() + " assessment relevance",
    deltaCount(delta) ? `${deltaCount(delta)} contextual delta(s)` : null,
  ].filter(Boolean);
  return parts.join("; ");
}

function objectiveFor(item: CanonicalStrategyBridgeRequirement, evidence: D16EvidenceReferenceMode): string {
  if (item.status === "CONTRADICTED") return "Reconcile the documented conflict without overstating either side.";
  if (item.status === "UNRESOLVED" || evidence === "NO_CANDIDATE_EVIDENCE") return "Prepare a precise answer that distinguishes what is documented from what is not established.";
  if (item.status === "PARTIAL" || item.route_mode === "TRANSFERABLE") return "Show the closest documented evidence, then explicitly explain the transferable and unproven dimensions.";
  return "Demonstrate the documented requirement with the strongest traceable evidence.";
}

function boundariesFor(item: CanonicalStrategyBridgeRequirement) {
  const permitted = [...new Set(item.boundaries.flatMap((b) => b.permitted_claims))].sort();
  const prohibited = [...new Set(item.boundaries.flatMap((b) => b.prohibited_claims))].sort();
  return { permitted_claims: permitted, prohibited_claims: prohibited };
}

function compareTensions(a: StrategicTension, b: StrategicTension): number {
  return (
    STATUS_PRIORITY[b.canonical_status] - STATUS_PRIORITY[a.canonical_status] ||
    roleCapabilityCriticalityOrder(b.role_criticality) - roleCapabilityCriticalityOrder(a.role_criticality) ||
    ({ HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 }[b.assessment_relevance] - { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 }[a.assessment_relevance]) ||
    deltaCount(b.contextual_delta) - deltaCount(a.contextual_delta) ||
    Number(b.contradiction_present) - Number(a.contradiction_present) ||
    evidenceStrength(b) - evidenceStrength(a) ||
    b.evidence_provenance_ids.length - a.evidence_provenance_ids.length ||
    a.requirement_id.localeCompare(b.requirement_id)
  );
}

export function validateD16Inputs(input: D16Inputs): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(input)) return { valid: false, errors: ["D16 input must be an object."] };

  const bridge = input.bridge;
  const mirror = input.mirror;
  const rcm = input.role_capability_model;
  const ledger = input.ledger;
  if (typeof input.jd_fingerprint !== "string" && input.jd_fingerprint !== null) errors.push("D16 jd_fingerprint must be a string or null.");
  if (typeof input.jd_fingerprint === "string" && !nonBlank(input.jd_fingerprint)) errors.push("D16 jd_fingerprint must be nonblank.");
  if (!isRecord(input.dependency_snapshot)) errors.push("D16 dependency snapshot must be an object.");

  if (!isRecord(bridge)) errors.push("D16 D6 bridge must be an object.");
  if (!isRecord(mirror)) errors.push("D16 D15 mirror must be an object.");
  if (!isRecord(rcm)) errors.push("D16 RCM must be an object.");
  if (!isRecord(ledger)) errors.push("D16 evidence ledger must be an object.");
  if (input.assessment_context !== undefined && !isRecord(input.assessment_context)) {
    errors.push("D16 Assessment Context must be an object.");
  }
  if (typeof input.jd_present !== "boolean") errors.push("D16 jd_present must be boolean.");
  if (!Array.isArray(input.canonical_requirements)) {
    errors.push("D16 canonical requirements must be an array.");
  }

  if (errors.length) return { valid: false, errors };

  if (input.jd_present !== Boolean(input.jd_fingerprint)) errors.push("D16 JD presence does not match JD fingerprint state.");
  if (input.dependency_snapshot.version !== "d16-dependency-snapshot-v1") errors.push("D16 dependency snapshot version is invalid.");

  if (bridge.version !== "d6-v1") errors.push("D16 requires D6 version d6-v1.");
  if (mirror.version !== "d15-v1") errors.push("D16 requires D15 version d15-v1.");
  if (rcm.version !== "rcm-v1") errors.push("D16 requires RCM version rcm-v1.");

  if (!Array.isArray(bridge.requirements)) {
    errors.push("D16 D6 bridge requirements must be an array.");
    return { valid: false, errors };
  }
  if (!Array.isArray(mirror.evidence)) {
    errors.push("D16 D15 mirror evidence must be an array.");
    return { valid: false, errors };
  }
  if (!Array.isArray(ledger.evidence)) {
    errors.push("D16 evidence ledger evidence must be an array.");
    return { valid: false, errors };
  }
  if (!Array.isArray(ledger.source_spans)) {
    errors.push("D16 evidence ledger source_spans must be an array.");
    return { valid: false, errors };
  }

  for (const requirement of input.canonical_requirements) {
    if (!isRecord(requirement) || !nonBlank(requirement.id) || !nonBlank(requirement.normalized_requirement)) {
      errors.push("D16 canonical requirement must contain valid id and normalized_requirement fields.");
    }
  }
  for (const item of bridge.requirements) {
    if (!isRecord(item)) {
      errors.push("D16 D6 requirement must be an object.");
      continue;
    }
    if (!Array.isArray(item.evidence)) {
      errors.push("D16 D6 requirement evidence must be an array: " + String(item.requirement_id));
    } else {
      for (const evidence of item.evidence) {
        if (
          !isRecord(evidence) ||
          !nonBlank(evidence.evidence_id) ||
          !nonBlank(evidence.source_span_id) ||
          !nonBlank(evidence.source_quote) ||
          !nonBlank(evidence.support_status)
        ) {
          errors.push("D16 D6 requirement evidence must contain valid evidence_id, source_span_id, source_quote and support_status fields: " + String(item.requirement_id));
        }
      }
    }
  }
  for (const evidence of mirror.evidence) {
    if (!isRecord(evidence)) errors.push("D16 D15 mirror evidence must be an object.");
  }
  for (const evidence of ledger.evidence) {
    if (!isRecord(evidence)) errors.push("D16 evidence ledger evidence must be an object.");
  }
  for (const span of ledger.source_spans) {
    if (!isRecord(span)) errors.push("D16 evidence ledger source span must be an object.");
  }
  if (errors.length) return { valid: false, errors };

  const rcmErrors = validateRoleCapabilityModelAgainstCanonicalRequirements(rcm, input.canonical_requirements);
  errors.push(...rcmErrors.map((e) => "RCM: " + e));

  const canonicalIds = canonicalRequirementIds(input.canonical_requirements);
  const bridgeIds = [...new Set(bridge.requirements.map((r) => r.requirement_id))].sort();
  if (JSON.stringify(canonicalIds) !== JSON.stringify(bridgeIds)) errors.push("D16 canonical requirement set diverges from D6.");

  const bridgeSeen = new Set<string>();
  for (const item of bridge.requirements) {
    if (bridgeSeen.has(item.requirement_id)) errors.push("D16 duplicate D6 requirement: " + item.requirement_id);
    bridgeSeen.add(item.requirement_id);
    if (!nonBlank(item.requirement_id) || !nonBlank(item.normalized_requirement)) errors.push("D16 D6 requirement identity/text is blank.");
    const canonical = input.canonical_requirements.find((r) => r.id === item.requirement_id);
    if (!canonical) errors.push("D16 D6 requirement is not canonical: " + item.requirement_id);
    else if (canonical.normalized_requirement !== item.normalized_requirement) errors.push("D16 D6 requirement text diverges: " + item.requirement_id);
    if (!["SUPPORTED", "PARTIAL", "UNRESOLVED", "CONTRADICTED", "UNJUDGED"].includes(item.status)) errors.push("D16 unsupported canonical status: " + item.requirement_id);
    if (item.status === "UNJUDGED") errors.push("D16 refuses UNJUDGED requirements: " + item.requirement_id);
  }

  const mirrorEvidence = new Map(mirror.evidence.map((e) => [e.evidence_id, e]));
  const ledgerEvidence = new Map(ledger.evidence.map((e) => [e.id, e]));
  const spans = new Map(ledger.source_spans.map((s) => [s.id, s]));
  for (const item of bridge.requirements) {
    for (const evidence of item.evidence) {
      if (!isRecord(evidence)) continue;
      const mirrorRef = mirrorEvidence.get(evidence.evidence_id);
      const atom = ledgerEvidence.get(evidence.evidence_id);
      const span = spans.get(evidence.source_span_id);
      if (!mirrorRef || !atom || !span) errors.push("D16 forged or missing evidence reference: " + evidence.evidence_id);
      if (mirrorRef && (mirrorRef.source_span_id !== evidence.source_span_id || mirrorRef.source_quote !== evidence.source_quote)) errors.push("D16 evidence provenance mismatch: " + evidence.evidence_id);
      if (atom && atom.source_span_id !== evidence.source_span_id) errors.push("D16 evidence atom/source-span mismatch: " + evidence.evidence_id);
      if (span && span.text !== evidence.source_quote) errors.push("D16 evidence quote mismatch: " + evidence.evidence_id);
    }
  }

  if (input.assessment_context) {
    const assessment = input.assessment_context;
    if (assessment.version !== "assessment-context-v1" || !nonBlank(assessment.context_id)) errors.push("D16 Assessment Context is malformed.");
    if (!isRecord(assessment.requirement_relevance)) {
      errors.push("D16 Assessment Context requirement_relevance must be an object.");
    } else {
      const allowedAssessmentKeys = new Set(["version", "context_id", "requirement_relevance"]);
      for (const key of Object.keys(assessment)) if (!allowedAssessmentKeys.has(key)) errors.push("D16 Assessment Context contains an unsupported field: " + key);
      for (const [id, value] of Object.entries(assessment.requirement_relevance)) {
        if (!bridgeSeen.has(id)) errors.push("D16 Assessment Context references unknown requirement: " + id);
        if (!["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(value)) errors.push("D16 Assessment Context relevance is invalid: " + id);
      }
    }
  }

  const expectedSnapshot = buildD16DependencySnapshot(input);
  if (JSON.stringify(input.dependency_snapshot) !== JSON.stringify(expectedSnapshot)) errors.push("D16 material dependency snapshot is stale or mismatched.");

  return { valid: errors.length === 0, errors };
}

export function buildD16Strategy(input: D16Inputs): D16Strategy {
  const validation = validateD16Inputs(input);
  if (!validation.valid) throw new Error("D16 inputs are invalid: " + validation.errors.join(" | "));

  const tensions = input.bridge.requirements
    .map((item) => {
      const rcm = input.role_capability_model.requirements.find((r) => r.canonical_requirement_id === item.requirement_id)!;
      const delta = contextualDelta(item.normalized_requirement, item, input.role_capability_model, input.mirror);
      const assessment = relevant(item, input.assessment_context);
      const mode = modeFor(item);
      const evidence_reference_mode = evidenceMode(item, input.mirror);
      if (!isEligible(item, delta)) return null;
      const objective = objectiveFor(item, evidence_reference_mode);
      return {
        id: `D16-TENSION-${item.requirement_id}`,
        requirement_id: item.requirement_id,
        requirement: item.normalized_requirement,
        mode,
        canonical_status: item.status as StrategicTension["canonical_status"],
        role_criticality: rcm.baseline_criticality,
        assessment_relevance: assessment,
        preparation_priority: 0,
        interview_vulnerability: vulnerabilityFor(item, mode, evidence_reference_mode),
        strategic_significance: significance(item, rcm.baseline_criticality, assessment, delta),
        evidence_reference_mode,
        evidence_ids: evidenceIds(item, input.mirror),
        evidence_provenance_ids: provenanceIds(item, input.ledger),
        strategic_objective: objective,
        prep_objective: objective,
        practice_target: mode === "DIRECT" ? "Demonstrate the requirement with traceable evidence." : mode === "TRANSFERABLE" ? "Practise explaining the transfer without claiming unproven experience." : "Practise a precise boundary statement and clarification response.",
        truthfulness_boundary: boundariesFor(item),
        contextual_delta: delta,
        contradiction_present: item.status === "CONTRADICTED" || item.evidence.some((e) => e.support_status === "CONTRADICTORY"),
      } satisfies StrategicTension;
    })
    .filter((x): x is StrategicTension => Boolean(x))
    .reduce((unique, tension) => {
      if (!unique.some((item) => item.requirement_id === tension.requirement_id)) unique.push(tension);
      return unique;
    }, [] as StrategicTension[])
    .sort(compareTensions)
    .slice(0, 3)
    .map((tension, index) => ({ ...tension, preparation_priority: index + 1 }));

  const actions = dispatchD16Actions(tensions, input.assessment_context);
  return { version: D16_VERSION, d6_version: "d6-v1", role_capability_model_version: "rcm-v1", jd_present: input.jd_present, tensions, actions, dependency_snapshot: input.dependency_snapshot };
}

export function dispatchD16Actions(tensions: StrategicTension[], assessment_context?: AssessmentContext): D16Action[] {
  return tensions.flatMap((tension) => {
    const common = {
      requirement_id: tension.requirement_id,
      evidence_reference_mode: tension.evidence_reference_mode,
      evidence_ids: [...tension.evidence_ids],
      evidence_provenance_ids: [...tension.evidence_provenance_ids],
      canonical_status: tension.canonical_status,
      role_criticality: tension.role_criticality,
      assessment_relevance: tension.assessment_relevance,
      strategic_significance: tension.strategic_significance,
      prep_objective: tension.prep_objective,
      practice_target: tension.practice_target,
      truthfulness_boundary: tension.truthfulness_boundary,
      assessment_context: assessment_context ? {
        version: assessment_context.version,
        context_id: assessment_context.context_id,
        requirement_relevance: { ...assessment_context.requirement_relevance },
      } : null,
    };
    return [
      { id: tension.id + "-PREP", dispatcher: "PREP" as const, ...common },
      { id: tension.id + "-PRACTICE", dispatcher: "PRACTICE" as const, ...common },
      { id: tension.id + "-EVALUATION", dispatcher: "EVALUATION" as const, ...common },
    ];
  });
}

export function validateD16Strategy(strategy: D16Strategy, input: D16Inputs): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(strategy)) return { valid: false, errors: ["D16 strategy must be an object."] };
  if (!Array.isArray(strategy.tensions)) errors.push("D16 tensions must be an array.");
  if (!Array.isArray(strategy.actions)) errors.push("D16 actions must be an array.");
  if (strategy.version !== D16_VERSION) errors.push("D16 strategy version is invalid.");
  if (strategy.d6_version !== "d6-v1") errors.push("D16 strategy must pin D6 d6-v1.");
  if (strategy.role_capability_model_version !== "rcm-v1") errors.push("D16 strategy must pin RCM rcm-v1.");
  if (errors.length) return { valid: false, errors };

  const inputValidation = validateD16Inputs(input);
  errors.push(...inputValidation.errors);
  if (!inputValidation.valid) return { valid: false, errors };

  if (strategy.tensions.length > 3) errors.push("D16 candidate-facing tension count exceeds 3.");

  const canonicalTensions = new Set(input.bridge.requirements.map((r) => r.requirement_id));
  const seen = new Set<string>();
  for (const tension of strategy.tensions) {
    if (!isRecord(tension)) {
      errors.push("D16 tension must be an object.");
      continue;
    }
    if (!nonBlank(tension.requirement_id)) {
      errors.push("D16 tension requirement_id is blank.");
      continue;
    }
    if (seen.has(tension.requirement_id)) errors.push("D16 duplicate tension requirement: " + tension.requirement_id);
    seen.add(tension.requirement_id);
    if (!canonicalTensions.has(tension.requirement_id)) errors.push("D16 tension references unknown requirement: " + tension.requirement_id);
    if (!isRecord(tension.truthfulness_boundary) ||
        !Array.isArray(tension.truthfulness_boundary.permitted_claims) ||
        !Array.isArray(tension.truthfulness_boundary.prohibited_claims)) {
      errors.push("D16 truthfulness boundary is malformed: " + tension.requirement_id);
    }
  }

  const expected = buildD16Strategy(input);
  if (JSON.stringify(strategy.tensions) !== JSON.stringify(expected.tensions)) {
    errors.push("D16 tensions do not match the deterministic canonical projection.");
  }
  if (JSON.stringify(strategy.actions) !== JSON.stringify(expected.actions)) {
    errors.push("D16 actions do not match the deterministic Action Dispatcher projection.");
  }
  if (strategy.jd_present !== input.jd_present) errors.push("D16 jd_present diverges from input.");
  if (JSON.stringify(strategy.dependency_snapshot) !== JSON.stringify(input.dependency_snapshot)) errors.push("D16 strategy dependency snapshot diverges from input.");

  return { valid: errors.length === 0, errors };
}
