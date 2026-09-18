import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import type { InterviewStrategy, SessionLanguage, SessionRecord } from "@/types";
import { runStrategyEngineV2 } from "@/lib/strategy-engine";

type CandidateEvidenceItem = {
  id: string;
  source_text: string;
  facts: Array<{ fact: string; category: string; exact_source_text: string }>;
  relationships: Array<{ from_fact: number; to_fact: number; relationship: string }>;
};

type CandidateEvidencePack = {
  evidence: CandidateEvidenceItem[];
};

const EVIDENCE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    evidence: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string" },
          source_text: { type: "string" },
          facts: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              properties: {
                fact: { type: "string" },
                category: { type: "string", enum: ["RESPONSIBILITY","ACHIEVEMENT","SCOPE","JURISDICTION","TOOL","LEADERSHIP","QUALIFICATION","INDUSTRY","PROCESS","STAKEHOLDER"] },
                exact_source_text: { type: "string" }
              },
              required: ["fact","category","exact_source_text"]
            }
          },
          relationships: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              properties: {
                from_fact: { type: "integer" },
                to_fact: { type: "integer" },
                relationship: { type: "string", enum: ["SAME_ROLE","SAME_EMPLOYER","SAME_ACHIEVEMENT","SAME_SCOPE","SAME_PROJECT","SAME_PROCESS"] }
              },
              required: ["from_fact","to_fact","relationship"]
            }
          }
        },
        required: ["id","source_text","facts","relationships"]
      }
    }
  },
  required: ["evidence"]
} as const;

function structuredResponseFormat(name: string, schema: unknown) {
  return { type: "json_schema" as const, json_schema: { name, strict: true, schema: schema as Record<string, unknown> } };
}

async function requestStructuredJson(system: string, user: string, name: string, schema: unknown): Promise<any> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    response_format: structuredResponseFormat(name, schema),
    messages: [{ role: "system", content: system }, { role: "user", content: user }]
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty structured response: " + name);
  return JSON.parse(raw);
}

function canonicalize(value: string): string {
  return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function clampWords(value: string, max = 24): string {
  return canonicalize(value).split(" ").slice(0, max).join(" ").replace(/[,:;]+$/, "");
}

function buildEvidencePrompt(session: SessionRecord, language: SessionLanguage): string {
  return languageInstruction(language) + `

You are Interview Mirror's candidate-evidence extraction layer.
This layer exists because downstream strategy must reason from the candidate's actual CV, not from a lossy summary.

Extract 6 to 10 high-value evidence blocks from the CV. Prefer evidence that preserves relationships between facts: role + scope + responsibility + outcome, rather than isolated keywords.

Rules:
- Every fact must be explicitly supported by exact_source_text from the CV.
- Preserve relationships when two or more facts belong to the same role, project, scope or achievement.
- Do not infer employer, industry, tool, qualification, metric, date, geography, ownership, seniority, outcome or responsibility.
- Do not turn a job requirement into candidate evidence.
- Do not use the existing CV analysis strengths/gaps as evidence.
- If the CV does not establish something, do not create a fact for it.
- Keep exact_source_text short and verbatim.
- Facts should be concise enough for downstream strategic reasoning.
- The purpose is strategic retrieval, not CV summarization.
- Candidate language: ${language === "fr" ? "French" : "English"}.
`;
}

async function extractCandidateEvidence(session: SessionRecord): Promise<CandidateEvidencePack> {
  const language = normalizeLanguage(session.preparation_language);
  const system = buildEvidencePrompt(session, language);
  const user = "RAW CV:\n" + session.cv_text.slice(0, 14000) + "\n\nTARGET JOB DESCRIPTION (context only; never treat it as candidate evidence):\n" + session.job_description.slice(0, 9000);
  const raw = await requestStructuredJson(system, user, "candidate_evidence_v23", EVIDENCE_SCHEMA);
  const evidence = Array.isArray(raw?.evidence) ? raw.evidence as CandidateEvidenceItem[] : [];
  if (evidence.length < 6) throw new Error("Candidate evidence extraction returned fewer than 6 evidence blocks.");
  const valid = evidence.every((item) =>
    item && typeof item.id === "string" && item.source_text?.trim() &&
    Array.isArray(item.facts) && item.facts.length > 0 &&
    item.facts.every((f) => f.fact?.trim() && f.exact_source_text?.trim())
  );
  if (!valid) throw new Error("Candidate evidence extraction returned an invalid evidence pack.");
  return { evidence: evidence.slice(0, 10) };
}

function evidenceToChain(pack: CandidateEvidencePack, jobDescription: string) {
  const jd = canonicalize(jobDescription);
  return pack.evidence.slice(0, 10).map((block) => {
    const facts = block.facts.slice(0, 5).map((f) => clampWords(f.fact, 18));
    const relationships = block.relationships.slice(0, 5).map((r) => {
      const from = facts[r.from_fact] ?? facts[0];
      const to = facts[r.to_fact] ?? facts[0];
      return from && to ? `${from} ↔ ${to} (${r.relationship.toLowerCase().replace(/_/g, " ")})` : "";
    }).filter(Boolean);
    const factText = facts.join("; ");
    const relationshipText = relationships.length ? " Relationships: " + relationships.join("; ") : "";
    const requirement = jd.length > 0 ? "Relevant target-role evidence" : "CV-verified evidence";
    return {
      jd_requirement: requirement,
      cv_evidence: clampWords(factText + relationshipText, 28),
      gap_identified: "none",
      interview_implication: "Use this documented evidence to test a distinct interviewer belief; do not treat the target-role requirement as candidate fact.",
      actionable_recommendation: "Anchor the strategy to the documented facts and preserve the relationships between them."
    };
  });
}

export async function runStrategyEngineV23Lite(session: SessionRecord): Promise<InterviewStrategy> {
  const pack = await extractCandidateEvidence(session);
  const enrichedSession: SessionRecord = {
    ...session,
    cv_analysis: session.cv_analysis
      ? { ...session.cv_analysis, evidenceChain: evidenceToChain(pack, session.job_description) }
      : undefined
  } as SessionRecord;

  if (!enrichedSession.cv_analysis) {
    throw new Error("CV analysis is required before generating an interview strategy.");
  }

  return runStrategyEngineV2(enrichedSession);
}
