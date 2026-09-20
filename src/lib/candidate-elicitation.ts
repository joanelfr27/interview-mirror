import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import type { SessionRecord } from "@/types";
import {
  type AtomicEvidence, type CandidateElicitation, type CandidateGapClassification,
  type EvidenceLedger, type UnresolvedItem, type SourceSpan,
  type EvidenceOwnership, type AssertionType,
  validateAtomicEvidence, validateRequirementGraph,
} from "@/lib/canonical-evidence-model";

const CLASSIFICATIONS = ["EVIDENCE_GAP","TRANSFERABLE","EXPERIENCE_GAP"] as const;

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    classification: { type: "string", enum: [...CLASSIFICATIONS] },
    rationale: { type: "string" },
    atom_quote: { type: "string" },
    actor: { type: "string" },
    ownership: { type: "string", enum: ["INDIVIDUAL","TEAM","SHARED","SUPERVISED","UNKNOWN"] },
    normalized_action: { type: "string" },
    object: { type: "string" },
  },
  required: ["classification","rationale","atom_quote","actor","ownership","normalized_action","object"],
} as const;

function responseFormat(name: string, schema: unknown) {
  return { type: "json_schema" as const, json_schema: { name, strict: true, schema: schema as Record<string, unknown> } };
}

export function buildElicitationQuestion(
  item: UnresolvedItem,
  ledger: EvidenceLedger,
  language: "en" | "fr",
): CandidateElicitation {
  const facets = ledger.requirements.find(r => r.id === item.requirement_id)?.facets
    .filter(f => item.facet_ids.includes(f.id)).map(f => f.requirement).join("; ") ?? "this requirement";
  const question = language === "fr"
    ? "Pour mieux comprendre ce point, décrivez librement toute expérience pertinente que vous avez réellement vécue, votre rôle personnel, le contexte, le périmètre et le résultat. Si vous n’avez pas d’expérience directe, indiquez-le et, si pertinent, décrivez l’expérience la plus proche que vous pourriez transférer."
    : "To clarify this point, describe any relevant experience you have actually had, your personal role, context, scope and outcome. If you do not have direct experience, say so and, if relevant, describe the closest experience you could transfer.";
  return { id: "ELICIT-" + item.id, unresolved_item_id: item.id, question };
}

export async function classifyCandidateElicitation(
  session: SessionRecord,
  ledger: EvidenceLedger,
  elicitation: CandidateElicitation,
  answer: string,
): Promise<{ ledger: EvidenceLedger; elicitation: CandidateElicitation; diagnostics: string[] }> {
  const language = normalizeLanguage(session.preparation_language);
  const item = ledger.unresolved_items.find(x => x.id === elicitation.unresolved_item_id);
  if (!item) throw new Error("Unknown unresolved item: " + elicitation.unresolved_item_id);

  const requirement = ledger.requirements.find(x => x.id === item.requirement_id);
  const response = await getOpenAI().chat.completions.create({
    model: AI_MODEL, temperature: 0,
    response_format: responseFormat("candidate_elicitation_classification", SCHEMA),
    messages: [
      {
        role: "system",
        content: languageInstruction(language) + "\n\n" +
          "Classify the candidate's answer only after the candidate has supplied it. " +
          "EVIDENCE_GAP means the answer establishes that the candidate has done the required thing but the CV omitted or failed to document it. " +
          "EXPERIENCE_GAP means the answer establishes that the candidate has not actually done the required thing. " +
          "TRANSFERABLE means the answer establishes a genuinely adjacent experience that could transfer but is not the same requirement. " +
          "Do not classify from plausibility. The atom_quote must be an exact substring of the supplied answer. Never invent an outcome, scope or ownership.",
      },
      {
        role: "user",
        content: "REQUIREMENT:\n" + JSON.stringify(requirement) + "\nUNRESOLVED ITEM:\n" + JSON.stringify(item) + "\nCANDIDATE ANSWER:\n" + answer,
      },
    ],
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty candidate elicitation classification response.");
  const parsed = JSON.parse(raw) as {
    classification: CandidateGapClassification; rationale: string; atom_quote: string;
    actor: string; ownership: EvidenceOwnership; normalized_action: string; object: string;
  };

  const quote = parsed.atom_quote.trim();
  const start = answer.indexOf(quote);
  const diagnostics: string[] = [];
  let atom: AtomicEvidence | null = null;
  let span: SourceSpan | null = null;

  if (!quote || start < 0) {
    diagnostics.push("Elicited classification rejected because atom_quote was not an exact answer substring.");
  } else {
    span = {
      id: "SPAN-ELICIT-" + elicitation.id,
      document_id: "ELICIT-" + session.id,
      text: quote, start_offset: start, end_offset: start + quote.length, language,
    };
    atom = {
      id: "ELICIT-ATOM-" + elicitation.id,
      source_span_id: span.id,
      provenance: { source_type: "CANDIDATE_ELICITED", language, extraction_method: "LLM" },
      subject: { actor: parsed.actor, ownership: parsed.ownership },
      action: { normalized_action: parsed.normalized_action, object: parsed.object },
      context: {}, scale: {}, time: {}, outcome: null,
      assertion: { type: "ELICITED", polarity: "AFFIRMATIVE" },
      verifiability: {
        has_quantifiable_metric: /[%€$£]|\b\d+(?:\.\d+)?\b/.test(quote),
        has_third_party_entity: false,
        has_time_anchor: /\b(?:19|20)\d{2}\b/.test(quote),
      },
      extraction_confidence: 1,
    };
    diagnostics.push(...validateAtomicEvidence(atom));
  }

  const updatedElicitation: CandidateElicitation = {
    ...elicitation, answer, answer_assertion_type: "ELICITED",
    answer_source_span_id: span?.id,
    classification: parsed.classification,
    classification_rationale: parsed.rationale,
  };

  const next: EvidenceLedger = {
    ...ledger,
    source_spans: span ? [...ledger.source_spans, span] : ledger.source_spans,
    evidence: atom && !validateAtomicEvidence(atom).length ? [...ledger.evidence, atom] : ledger.evidence,
    candidate_elicitations: [...ledger.candidate_elicitations.filter(x => x.id !== elicitation.id), updatedElicitation],
  };
  diagnostics.push(...validateRequirementGraph(next));
  return { ledger: next, elicitation: updatedElicitation, diagnostics };
}
