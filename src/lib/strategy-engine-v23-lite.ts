import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import type { InterviewStrategy, SessionLanguage, SessionRecord } from "@/types";
import { buildEvidenceMap, runStrategyEngineV2 } from "@/lib/strategy-engine";

type CandidateEvidenceItem = {
  id: string;
  source_text: string;
  facts: Array<{ fact: string; category: string; exact_source_text: string }>;
  relationships: Array<{ from_fact: number; to_fact: number; relationship: string }>;
  relevant_jd_requirements: string[];
};

type CandidateEvidencePack = {
  evidence: CandidateEvidenceItem[];
};

export type StrategicTensionMode = "DIRECT" | "TRANSFERABLE" | "VERIFY_GAP";

export type StrategicTension = {
  id: string;
  mode: StrategicTensionMode;
  primary_evidence_node_id: string;
  target_requirement: string;
  interviewer_belief: string;
  interviewer_doubt: string;
  allowed_positioning: string;
  forbidden_inference: string;
};

export type StrategicPlan = {
  candidate_positioning: string;
  tensions: StrategicTension[];
  verification_points: string[];
  likely_questions: string[];
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
          relevant_jd_requirements: { type: "array", items: { type: "string" } },
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
        required: ["id","source_text","facts","relationships","relevant_jd_requirements"]
      }
    }
  },
  required: ["evidence"]
} as const;

const STRATEGIC_PLAN_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    candidate_positioning: { type: "string" },
    tensions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string" },
          mode: { type: "string", enum: ["DIRECT","TRANSFERABLE","VERIFY_GAP"] },
          primary_evidence_node_id: { type: "string" },
          target_requirement: { type: "string" },
          interviewer_belief: { type: "string" },
          interviewer_doubt: { type: "string" },
          allowed_positioning: { type: "string" },
          forbidden_inference: { type: "string" }
        },
        required: ["id","mode","primary_evidence_node_id","target_requirement","interviewer_belief","interviewer_doubt","allowed_positioning","forbidden_inference"]
      }
    },
    verification_points: { type: "array", items: { type: "string" } },
    likely_questions: { type: "array", items: { type: "string" } }
  },
  required: ["candidate_positioning","tensions","verification_points","likely_questions"]
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
- For each evidence block, identify 1 to 3 JD requirements that this evidence can legitimately inform. This is a retrieval link, not proof that the candidate meets the requirement.
- Keep missing requirements out of candidate evidence; the downstream strategy engine must handle missing evidence separately.
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
    const requirement = block.relevant_jd_requirements.slice(0, 2).map(canonicalize).filter(Boolean).join(" | ") || (jd.length > 0 ? "Relevant target-role evidence" : "CV-verified evidence");
    return {
      jd_requirement: requirement,
      cv_evidence: clampWords(factText + relationshipText, 28),
      gap_identified: "none",
      interview_implication: "Use this documented evidence to test a distinct interviewer belief; do not treat the target-role requirement as candidate fact.",
      actionable_recommendation: "Anchor the strategy to the documented facts and preserve the relationships between them."
    };
  });
}

function validateStrategicPlan(plan: StrategicPlan, evidenceMap: ReturnType<typeof buildEvidenceMap>): string[] {
  const errors: string[] = [];
  if (!plan.candidate_positioning?.trim()) errors.push("candidate_positioning is required.");
  if (!Array.isArray(plan.tensions) || plan.tensions.length !== 3) errors.push("tensions must contain exactly 3 items.");
  if (!Array.isArray(plan.likely_questions) || plan.likely_questions.length < 3) errors.push("likely_questions must contain at least 3 items.");
  const byId = new Map(evidenceMap.map((node) => [node.node_id, node]));
  const seen = new Set<string>();
  for (const tension of plan.tensions ?? []) {
    if (!["DIRECT","TRANSFERABLE","VERIFY_GAP"].includes(tension.mode)) errors.push(tension.id + ": invalid mode.");
    const node = byId.get(tension.primary_evidence_node_id);
    if (!node) errors.push(tension.id + ": unknown primary evidence node.");
    else if (!["PROVEN","PARTIALLY_PROVEN"].includes(node.status)) errors.push(tension.id + ": primary evidence must be provable.");
    if (seen.has(tension.primary_evidence_node_id)) errors.push("Strategic tensions must use distinct primary evidence nodes.");
    seen.add(tension.primary_evidence_node_id);
    for (const field of ["target_requirement","interviewer_belief","interviewer_doubt","allowed_positioning","forbidden_inference"]) {
      if (!(tension as any)[field]?.trim()) errors.push(tension.id + ": missing " + field + ".");
    }
  }
  return [...new Set(errors)];
}

async function buildStrategicPlan(session: SessionRecord, evidenceMap: ReturnType<typeof buildEvidenceMap>): Promise<StrategicPlan> {
  const language = normalizeLanguage(session.preparation_language);
  const system = languageInstruction(language) + `

You are Interview Mirror's strategic planning layer. Your output is an AUTHORITATIVE PLAN for a later strategy-writing model.

The candidate evidence map is the only authoritative source of candidate facts.
The raw job description defines requirements, but a requirement is NEVER candidate evidence.

Build exactly 3 strategic tensions. A tension must connect:
1) a target-role requirement,
2) a specific interviewer belief,
3) the most credible doubt the interviewer could have about that belief,
4) one provable evidence node,
5) an allowed way to position that evidence,
6) an explicit forbidden inference.

Use these modes:
- DIRECT: the evidence directly demonstrates a relevant capability or responsibility.
- TRANSFERABLE: the evidence demonstrates an underlying capability that can reasonably be positioned as transferable, but the candidate must NOT be presented as having the target-domain experience merely because the capability transfers.
- VERIFY_GAP: the target requirement is not established strongly enough by the CV; use the evidence only to prepare how the candidate should handle the verification, not to claim the missing qualification/experience.

Important:
- Never convert mining, ERP, SAP, Oracle, Sage, project finance, or any other JD-only requirement into candidate experience unless the evidence map explicitly proves it.
- For TRANSFERABLE and VERIFY_GAP, the forbidden_inference must explicitly state what must not be claimed.
- Prefer non-obvious doubts about ownership, scope, depth, recency, scale, decision authority or transferability.
- Do not manufacture a vulnerability just to sound insightful.
- Preserve the distinction between evidence, requirement and strategic bridge.
- Do not invent metrics, outcomes, tools, employers, industries, standards knowledge, dates or ownership.
- The three tensions should be materially distinct.
- The later strategy writer will receive ONLY this plan plus the evidence map. Do not rely on later generation to reinterpret the JD.

Return the complete schema.
`;

  const user = "EVIDENCE MAP (complete candidate-fact boundary):\n" + JSON.stringify(evidenceMap, null, 2) +
    "\n\nRAW JOB DESCRIPTION:\n" + session.job_description.slice(0, 9000) +
    "\n\nCreate the authoritative strategic plan.";

  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await requestStructuredJson(system + (lastErrors.length ? "\nPrevious validation errors:\n- " + lastErrors.join("\n- ") : ""), user, "strategic_plan_v23", STRATEGIC_PLAN_SCHEMA);
    const plan = raw as StrategicPlan;
    lastErrors = validateStrategicPlan(plan, evidenceMap);
    if (!lastErrors.length) return plan;
  }
  throw new Error("Strategic plan failed validation after repair cap: " + lastErrors.join(" | "));
}

function serializeAuthoritativePlan(plan: StrategicPlan): string {
  return `AUTHORITATIVE STRATEGIC PLAN — THIS PLAN CONTROLS STRATEGIC INTERPRETATION.

The downstream strategy engine must treat this document as the only strategic interpretation of the target role. It may improve wording and candidate-facing communication, but it must not invent a new requirement, tension, candidate capability, transferability claim or missing-experience claim.

Candidate positioning:
${plan.candidate_positioning}

Strategic tensions:
${plan.tensions.map((t, i) => `
${i + 1}. [${t.mode}] Evidence node ${t.primary_evidence_node_id}
Target requirement: ${t.target_requirement}
Interviewer belief: ${t.interviewer_belief}
Interviewer doubt: ${t.interviewer_doubt}
Allowed positioning: ${t.allowed_positioning}
FORBIDDEN INFERENCE: ${t.forbidden_inference}`).join("\n")}

Verification points:
${plan.verification_points.map((x) => "- " + x).join("\n") || "- None explicitly identified."}

Likely questions:
${plan.likely_questions.map((x) => "- " + x).join("\n")}

HARD BOUNDARY:
- The plan is not candidate evidence.
- Evidence facts remain the only source of candidate-specific factual claims.
- Do not upgrade TRANSFERABLE into DIRECT.
- Do not convert VERIFY_GAP into proven experience.
- Do not claim any item named in FORBIDDEN INFERENCE.
`;
}

export async function runStrategyEngineV23Lite(session: SessionRecord): Promise<InterviewStrategy> {
  const pack = await extractCandidateEvidence(session);

  const evidenceSession: SessionRecord = {
    ...session,
    cv_analysis: session.cv_analysis
      ? { ...session.cv_analysis, evidenceChain: evidenceToChain(pack, session.job_description) }
      : undefined
  } as SessionRecord;

  if (!evidenceSession.cv_analysis) {
    throw new Error("CV analysis is required before generating an interview strategy.");
  }

  // The plan is generated from the evidence map + real JD, then passed as a
  // first-class strategic directive. The real JD remains available for role
  // context and validation; it is never replaced by serialized plan text.
  const evidenceMap = buildEvidenceMap(evidenceSession);
  const plan = await buildStrategicPlan(evidenceSession, evidenceMap);
  return runStrategyEngineV2(evidenceSession, serializeAuthoritativePlan(plan), plan);
}