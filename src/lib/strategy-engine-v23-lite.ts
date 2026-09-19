import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import type { InterviewStrategy, SessionLanguage, SessionRecord } from "@/types";
import { buildEvidenceMap, runStrategyEngineV2 } from "@/lib/strategy-engine";
import type { StrategicPlan } from "@/lib/strategy-plan-types";

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
          supporting_fact_ids: { type: "array", items: { type: "string" }, minItems: 1 },
          target_requirement: { type: "string" },
          interviewer_belief: { type: "string" },
          interviewer_doubt: { type: "string" },
          allowed_positioning: { type: "string" },
          forbidden_inference: { type: "string" }
        },
        required: ["id","mode","primary_evidence_node_id","supporting_fact_ids","target_requirement","interviewer_belief","interviewer_doubt","allowed_positioning","forbidden_inference"]
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
  const normalizeEvidenceText = (value: string) => canonicalize(value).toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, " ").trim();
  const normalizedCv = normalizeEvidenceText(session.cv_text);
  const valid = evidence.every((item) =>
    item && typeof item.id === "string" && item.source_text?.trim() &&
    Array.isArray(item.facts) && item.facts.length > 0 &&
    item.facts.every((f) => f.fact?.trim() && f.exact_source_text?.trim()) &&
    Array.isArray(item.relevant_jd_requirements) &&
    item.relevant_jd_requirements.length > 0 &&
    item.relevant_jd_requirements.every((requirement) => requirement?.trim() && jdRequirementGrounding(requirement, session.job_description))
  );

  // Some model outputs contain a valid evidence block but an overly broad or
  // weakly paraphrased JD retrieval label. Repair that label from the actual JD
  // rather than rejecting otherwise CV-grounded evidence. Candidate facts and
  // their CV provenance remain unchanged.
  const jdSentences = session.job_description
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => canonicalize(s))
    .filter((s) => s.length >= 20);
  const tokenSet = (value: string) => new Set(
    canonicalize(value).toLowerCase().split(/[^a-zà-ÿ0-9]+/)
      .filter((x) => x.length >= 5)
  );
  const overlap = (a: string, b: string) => {
    const aa = tokenSet(a); const bb = tokenSet(b);
    if (!aa.size || !bb.size) return 0;
    let common = 0;
    for (const token of aa) if (bb.has(token)) common++;
    return common / Math.min(aa.size, bb.size);
  };
  const repairedEvidence = evidence.map((item) => {
    const requirements = (item.relevant_jd_requirements ?? []).filter((r) => jdRequirementGrounding(r, session.job_description));
    if (requirements.length > 0) return { ...item, relevant_jd_requirements: requirements.slice(0, 3) };
    const factText = item.facts.map((f) => f.fact).join(" ");
    const best = jdSentences
      .map((sentence) => ({ sentence, score: Math.max(overlap(sentence, factText), overlap(sentence, item.source_text)) }))
      .sort((a, b) => b.score - a.score)[0];
    if (!best || best.score < 0.12) return item;
    return { ...item, relevant_jd_requirements: [best.sentence] };
  });

  const repairedValid = repairedEvidence.every((item) =>
    item && typeof item.id === "string" && item.source_text?.trim() &&
    Array.isArray(item.facts) && item.facts.length > 0 &&
    item.facts.every((f) => f.fact?.trim() && f.exact_source_text?.trim()) &&
    Array.isArray(item.relevant_jd_requirements) &&
    item.relevant_jd_requirements.length > 0 &&
    item.relevant_jd_requirements.every((requirement) => requirement?.trim() && jdRequirementGrounding(requirement, session.job_description))
  );
  if (!repairedValid) throw new Error("Candidate evidence extraction returned an invalid evidence pack.");

  // Zero-hallucination boundary: every extracted fact must point back to text
  // that actually exists in the supplied CV. The model may summarize that source
  // into "fact", but it cannot invent the source passage itself.
  for (const item of evidence.slice(0, 10)) {
    const source = normalizeEvidenceText(item.source_text);
    if (!source || !normalizedCv.includes(source)) {
      throw new Error("Candidate evidence extraction produced a source_text not found in the supplied CV.");
    }
    for (const fact of item.facts.slice(0, 5)) {
      const exactSource = normalizeEvidenceText(fact.exact_source_text);
      if (!exactSource || !normalizedCv.includes(exactSource)) {
        throw new Error("Candidate evidence extraction produced exact_source_text not found in the supplied CV.");
      }
      if (fact.exact_source_text.length > 500) {
        throw new Error("Candidate evidence extraction produced an excessively long exact_source_text.");
      }
    }
    for (const relationship of item.relationships.slice(0, 5)) {
      if (!Number.isInteger(relationship.from_fact) || !Number.isInteger(relationship.to_fact)
        || relationship.from_fact < 0 || relationship.to_fact < 0
        || relationship.from_fact >= item.facts.length || relationship.to_fact >= item.facts.length) {
        throw new Error("Candidate evidence extraction returned an invalid fact relationship index.");
      }
    }
  }
  return { evidence: repairedEvidence.slice(0, 10) };
}

function jdRequirementGrounding(requirement: string, jobDescription: string): boolean {
  const stopwords = new Set([
    "about","which","where","when","their","there","avec","dans","pour","entre","cette","poste","vous","votre","notre","leurs",
    "experience","expérience","candidate","candidat","role","poste","position","finance","financial","accounting","comptabilité",
    "skills","compétences","strong","forte","fort","ability","capacité","knowledge","connaissance","command","maîtrise"
  ]);
  const normalize = (value: string) => canonicalize(value).toLowerCase().split(/[^a-zà-ÿ0-9]+/)
    .filter((token) => token.length >= 5 && !stopwords.has(token));
  const requirementTokens = normalize(requirement);
  const jdTokens = normalize(jobDescription);
  if (!requirementTokens.length || !jdTokens.length) return false;

  // Requirements can be concise paraphrases of the JD (especially across
  // French/English), so exact whole-word matching alone is too brittle.
  // A distinctive token is considered grounded when it is exact or shares a
  // meaningful six-character stem with a JD token (e.g. financier/financial,
  // auditeurs/audits). This remains a retrieval-link check, not candidate proof.
  const grounded = requirementTokens.filter((token) =>
    jdTokens.some((jdToken) =>
      jdToken === token
      || (token.length >= 7 && jdToken.length >= 7 && token.slice(0, 6) === jdToken.slice(0, 6))
    )
  );

  // At least one distinctive requirement term must be traceable to the actual
  // JD. We intentionally avoid requiring two exact tokens because valid
  // paraphrases such as "gestion du reporting financier" may share only
  // "reporting" with an English JD.
  return grounded.length >= 1;
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
      actionable_recommendation: "Anchor the strategy to the documented facts and preserve the relationships between them.",
      evidence_facts: block.facts.slice(0, 5).map((fact, factIndex) => ({
        fact_id: `E${String(pack.evidence.indexOf(block) + 1).padStart(2, "0")}-F${factIndex + 1}`,
        fact: clampWords(fact.fact, 18),
        category: fact.category,
        exact_source_text: fact.exact_source_text
      }))
    };
  });
}

function semanticOverlapForValidation(a: string, b: string): number {
  const tokens = (value: string) => new Set(
    canonicalize(value).toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((x) => x.length >= 5)
  );
  const aa = tokens(a); const bb = tokens(b);
  if (!aa.size || !bb.size) return 0;
  let common = 0; for (const token of aa) if (bb.has(token)) common++;
  return common / Math.min(aa.size, bb.size);
}

function validateStrategicPlan(plan: StrategicPlan, evidenceMap: ReturnType<typeof buildEvidenceMap>): string[] {
  const errors: string[] = [];
  if (!plan.candidate_positioning?.trim()) errors.push("candidate_positioning is required.");
  if (!Array.isArray(plan.tensions) || plan.tensions.length !== 3) errors.push("tensions must contain exactly 3 items.");
  if (!Array.isArray(plan.likely_questions) || plan.likely_questions.length < 3) errors.push("likely_questions must contain at least 3 items.");
  const byId = new Map(evidenceMap.map((node) => [node.node_id, node]));
  const seen = new Set<string>();
  if (!Array.isArray(plan.verification_points)) errors.push("verification_points must be an array.");
  if (Array.isArray(plan.verification_points) && plan.verification_points.some((x) => typeof x !== "string" || !x.trim())) {
    errors.push("verification_points must contain only non-empty strings.");
  }
  const transferPattern = /transpos|transfér|applicable|mobilis|adapt|transfer|transferable|appliqu|can be applied|can be transferred/i;
  const verifyPattern = /vérifi|à confirmer|reste à établir|non (?:établi|documenté)|not established|not documented|needs to be established|verify|confirm/i;
  const directClaimPattern = /(?:expérience|experience)\s+(?:minière|dans le secteur|en project finance|de project finance|mining|in mining|in project finance|in the target sector)|(?:maîtrise|mastery|expertise)\s+(?:du secteur|minière|de project finance|of the sector|of project finance)/i;
  for (const tension of plan.tensions ?? []) {
    if (!tension || !tension.id?.trim()) { errors.push("Every tension requires an id."); continue; }
    if (!["DIRECT","TRANSFERABLE","VERIFY_GAP"].includes(tension.mode)) errors.push(tension.id + ": invalid mode.");
    const node = byId.get(tension.primary_evidence_node_id);
    if (!node) errors.push(tension.id + ": unknown primary evidence node.");
    else if (!["PROVEN","PARTIALLY_PROVEN"].includes(node.status)) errors.push(tension.id + ": primary evidence must be provable.");
    const boundFactIds = new Set((node?.supporting_facts ?? []).map((fact) => fact.fact_id));
    if (!Array.isArray(tension.supporting_fact_ids) || tension.supporting_fact_ids.length < 1) {
      errors.push(tension.id + ": supporting_fact_ids must contain at least one atomic fact_id.");
    } else {
      const uniqueFactIds = new Set(tension.supporting_fact_ids);
      if (uniqueFactIds.size !== tension.supporting_fact_ids.length) errors.push(tension.id + ": supporting_fact_ids must be unique.");
      for (const factId of tension.supporting_fact_ids) if (!boundFactIds.has(factId)) errors.push(tension.id + ": supporting_fact_id " + factId + " is not present on the bound evidence node.");
    }
    if (seen.has(tension.primary_evidence_node_id)) errors.push("Strategic tensions must use distinct primary evidence nodes.");
    seen.add(tension.primary_evidence_node_id);
    for (const field of ["target_requirement","interviewer_belief","interviewer_doubt","allowed_positioning","forbidden_inference"]) {
      if (!(tension as any)[field]?.trim()) errors.push(tension.id + ": missing " + field + ".");
    }

    const combined = [
      tension.interviewer_belief,
      tension.interviewer_doubt,
      tension.allowed_positioning,
      tension.forbidden_inference,
    ].filter(Boolean).join(" ");

    // An interviewer doubt must be a concrete, role-grounded question about
    // the candidate's evidence—not a generic coaching warning. Require it to
    // connect to both the target requirement and the bound evidence.
    const doubtRequirementOverlap = (() => {
      const tokens = (value: string) => new Set(
        canonicalize(value).toLowerCase().split(/[^a-zà-ÿ0-9]+/)
          .filter((x) => x.length >= 5 && !["about","which","where","when","their","there","requirement","requirements","expérience","experience","candidat","candidate","poste","role","interview","interviewer","votre","your","vous","you","dans","pour","avec"].includes(x))
      );
      const a = tokens(tension.interviewer_doubt);
      const b = tokens(tension.target_requirement);
      if (!a.size || !b.size) return 0;
      let common = 0; for (const token of a) if (b.has(token)) common++;
      return common / Math.min(a.size, b.size);
    })();
    const doubtEvidenceNode = byId.get(tension.primary_evidence_node_id);
    const doubtEvidenceOverlap = doubtEvidenceNode
      ? (() => {
          const a = new Set(canonicalize(tension.interviewer_doubt).toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((x) => x.length >= 5));
          const b = new Set(canonicalize(doubtEvidenceNode.fact).toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((x) => x.length >= 5));
          if (!a.size || !b.size) return 0;
          let common = 0; for (const token of a) if (b.has(token)) common++;
          return common / Math.min(a.size, b.size);
        })()
      : 0;
    if (doubtRequirementOverlap < 0.25 && doubtEvidenceOverlap < 0.15) {
      errors.push(tension.id + ": interviewer_doubt is not sufficiently grounded in the target requirement or bound evidence.");
    }
    const genericDoubt = /^(?:prepare|préparez|be ready|soyez prêt|show that|démontrez que|explain your|expliquez votre|talk about|parlez de|give an example|donnez un exemple)\b/i;
    if (genericDoubt.test(canonicalize(tension.interviewer_doubt))) {
      errors.push(tension.id + ": interviewer_doubt is a generic preparation instruction rather than an interviewer concern.");
    }

    if (tension.mode === "TRANSFERABLE") {
      if (!transferPattern.test(tension.allowed_positioning)) {
        errors.push(tension.id + ": TRANSFERABLE tension must explicitly state how the evidenced capability can transfer to the target requirement.");
      }
      if (directClaimPattern.test(tension.allowed_positioning)) {
        errors.push(tension.id + ": TRANSFERABLE allowed_positioning contains a direct target-domain experience claim.");
      }
    }

    if (tension.mode === "VERIFY_GAP") {
      if (!verifyPattern.test(combined)) {
        errors.push(tension.id + ": VERIFY_GAP must explicitly identify the requirement as something to verify or establish.");
      }
      if (directClaimPattern.test(tension.allowed_positioning)) {
        errors.push(tension.id + ": VERIFY_GAP allowed_positioning contains a direct target-domain experience claim.");
      }
    }

    if (tension.mode === "DIRECT" && verifyPattern.test(tension.allowed_positioning) && !/direct|démontr|établi|established|demonstrat/i.test(tension.allowed_positioning)) {
      errors.push(tension.id + ": DIRECT tension is framed primarily as a verification gap.");
    }
  }

  if (plan.tensions.length === 3) {
    const verificationPoints = plan.verification_points ?? [];
    const gapTensions = plan.tensions.filter((t) => t.mode === "VERIFY_GAP");
    // Verification points are strategic outputs, not free-form notes. Each must
    // connect to at least one authoritative target requirement or interviewer doubt.
    for (const point of verificationPoints) {
      const grounded = plan.tensions.some((t) =>
        semanticOverlapForValidation(point, t.target_requirement) >= 0.18
        || semanticOverlapForValidation(point, t.interviewer_doubt) >= 0.18
      );
      if (!grounded) errors.push("verification_point is not grounded in any authoritative tension.");
    }
    if (gapTensions.length > 0 && verificationPoints.length === 0) {
      errors.push("VERIFY_GAP tensions require at least one verification_point.");
    }

    const pairs = [[0,1],[0,2],[1,2]] as const;
    const strategicStopwords = new Set([
      "about","which","where","when","their","there","these","those","requirement","requirements",
      "expérience","experience","candidat","candidate","poste","role","job","position","interview",
      "interviewer","intervieweur","capacité","capability","éléments","elements","documenté","documented",
      "votre","your","vous","you","dans","with","pour","from","avec","this","that"
    ]);
    const tokens = (value: string) => new Set(
      canonicalize(value).toLowerCase().split(/[^a-zà-ÿ0-9]+/)
        .filter((x) => x.length >= 5 && !strategicStopwords.has(x))
    );
    const overlap = (a: string, b: string) => {
      const aa = tokens(a); const bb = tokens(b);
      if (!aa.size || !bb.size) return 0;
      let common = 0;
      for (const token of aa) if (bb.has(token)) common++;
      return common / Math.min(aa.size, bb.size);
    };

    for (const [a,b] of pairs) {
      const leftTarget = plan.tensions[a].target_requirement;
      const rightTarget = plan.tensions[b].target_requirement;
      const leftStrategic = plan.tensions[a].interviewer_belief + " " + plan.tensions[a].interviewer_doubt;
      const rightStrategic = plan.tensions[b].interviewer_belief + " " + plan.tensions[b].interviewer_doubt;

      // Distinct evidence nodes alone are not sufficient: three tensions can
      // still describe the same interview issue using different evidence.
      // Require either materially different target requirements OR materially
      // different interviewer concerns.
      const targetOverlap = overlap(leftTarget, rightTarget);
      const concernOverlap = overlap(leftStrategic, rightStrategic);
      if (targetOverlap >= 0.8 && concernOverlap >= 0.72) {
        errors.push("Strategic tensions " + (a + 1) + " and " + (b + 1) + " are not materially distinct.");
      }
    }
  }

  return [...new Set(errors)];
}

function normalizeStrategicPlanGrounding(plan: StrategicPlan, evidenceMap: ReturnType<typeof buildEvidenceMap>, language: SessionLanguage): StrategicPlan {
  const byId = new Map(evidenceMap.map((node) => [node.node_id, node]));
  const overlap = (a: string, b: string) => semanticOverlapForValidation(a, b);
  const fr = normalizeLanguage(language) === "fr";
  const groundedDoubt = (tension: StrategicPlan["tensions"][number], nodeFact: string): string => {
    if (fr) {
      if (tension.mode === "TRANSFERABLE") return `L'intervieweur pourrait-il considérer que ${clampWords(nodeFact, 18)} démontre suffisamment une capacité transférable vers ${clampWords(tension.target_requirement, 16)} ?`;
      if (tension.mode === "VERIFY_GAP") return `Le CV permet-il d'établir suffisamment ${clampWords(tension.target_requirement, 18)}, au-delà de ${clampWords(nodeFact, 14)} ?`;
      return `L'intervieweur pourrait-il considérer que ${clampWords(nodeFact, 18)} démontre suffisamment ${clampWords(tension.target_requirement, 16)}, notamment en profondeur et en portée ?`;
    }
    if (tension.mode === "TRANSFERABLE") return `Could the interviewer consider that ${clampWords(nodeFact, 18)} demonstrates a sufficiently transferable capability for ${clampWords(tension.target_requirement, 16)}?`;
    if (tension.mode === "VERIFY_GAP") return `Does the CV establish ${clampWords(tension.target_requirement, 18)} strongly enough beyond ${clampWords(nodeFact, 14)}?`;
    return `Could the interviewer consider that ${clampWords(nodeFact, 18)} sufficiently demonstrates ${clampWords(tension.target_requirement, 16)}, particularly in depth and scope?`;
  };
  const tensions = (plan.tensions ?? []).map((tension) => {
    const node = byId.get(tension.primary_evidence_node_id);
    if (!node) return tension;
    const doubtOk = overlap(tension.interviewer_doubt, tension.target_requirement) >= 0.25
      || overlap(tension.interviewer_doubt, node.fact) >= 0.15;
    return doubtOk ? tension : { ...tension, interviewer_doubt: groundedDoubt(tension, node.fact) };
  });
  const normalized = { ...plan, tensions };
  const verificationPoints = (plan.verification_points ?? []).filter((point) =>
    normalized.tensions.some((t) =>
      overlap(point, t.target_requirement) >= 0.18 || overlap(point, t.interviewer_doubt) >= 0.18
    )
  );
  const groundedVerificationPoints = verificationPoints.length === (plan.verification_points ?? []).length
    ? verificationPoints
    : normalized.tensions.map((tension) =>
        tension.mode === "VERIFY_GAP"
          ? (fr
            ? `À confirmer pendant l'entretien : ${clampWords(tension.target_requirement, 20)}.`
            : `Confirm during the interview: ${clampWords(tension.target_requirement, 20)}.`)
          : (fr
            ? `À établir pendant l'entretien : le niveau de ${clampWords(tension.target_requirement, 18)} que l'élément documenté permet de démontrer.`
            : `Establish during the interview: the level of ${clampWords(tension.target_requirement, 18)} that the documented evidence supports.`)
      );
  return { ...normalized, verification_points: groundedVerificationPoints };
}

function normalizeStrategicPlanModeLanguage(plan: StrategicPlan, language: SessionLanguage): StrategicPlan {
  const fr = normalizeLanguage(language) === "fr";
  // Deterministic wording repair only. This never changes the selected mode,
  // evidence node, requirement, or factual content; it makes the mode boundary
  // explicit so downstream validators and the strategy writer cannot miss it.
  const transferPattern = /transpos|transfér|applicable|mobilis|adapt|transfer|transferable|appliqu|can be applied|can be transferred/i;
  const verifyPattern = /vérifi|à confirmer|reste à établir|non (?:établi|documenté)|not established|not documented|needs to be established|verify|confirm/i;
  return {
    ...plan,
    tensions: (plan.tensions ?? []).map((tension) => {
      if (tension.mode === "TRANSFERABLE") {
        const allowed = transferPattern.test(tension.allowed_positioning)
          ? tension.allowed_positioning
          : (fr ? `Cette capacité peut être transposée et mobilisée pour répondre à ${tension.target_requirement}, sans prétendre à une expérience directe dans ce domaine. ${tension.allowed_positioning}` : `This capability can be transferred and applied to ${tension.target_requirement}, without claiming direct experience in that domain. ${tension.allowed_positioning}`);
        return { ...tension, allowed_positioning: allowed };
      }
      if (tension.mode === "VERIFY_GAP") {
        const allowed = verifyPattern.test(tension.allowed_positioning)
          ? tension.allowed_positioning
          : (fr ? `Ce point reste à confirmer pendant l'entretien ; appuyez-vous sur l'élément documenté ci-dessous sans le présenter comme une qualification ou une expérience déjà établie. ${tension.allowed_positioning}` : `This point remains to be verified in the interview; use the documented evidence below without presenting it as an already established qualification or experience. ${tension.allowed_positioning}`);
        return { ...tension, allowed_positioning: allowed };
      }
      return tension;
    }),
  };
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
5) the exact atomic fact_id values from that node that support this tension (one or more; use only IDs present in supporting_facts),
6) an allowed way to position that evidence,
7) an explicit forbidden inference.

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
- supporting_fact_ids are mandatory provenance bindings. Never invent IDs; select only the atomic fact_id values present in the bound evidence node. Use the smallest sufficient set of facts.
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
    const plan = normalizeStrategicPlanGrounding(
      normalizeStrategicPlanModeLanguage(raw as StrategicPlan, language),
      evidenceMap,
      language
    );
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
Supporting atomic facts: ${t.supporting_fact_ids.join(", ")}
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
  // Keep the typed plan as the canonical strategic input. The serialized form is
  // only a model-facing representation; validators and downstream code use the
  // typed object so strategic meaning cannot drift through text parsing.
  return runStrategyEngineV2(evidenceSession, serializeAuthoritativePlan(plan), plan);
}