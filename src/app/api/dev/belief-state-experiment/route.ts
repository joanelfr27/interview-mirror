import { NextResponse } from "next/server";
import { getOpenAI, AI_MODEL } from "@/lib/openai";

const RESULT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    overall_challenge: { type: "string" },
    tensions: {
      type: "array", minItems: 3, maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          requirement: { type: "string" },
          evidence_state: { type: "string", enum: ["PROVEN", "PLAUSIBLE_UNCONFIRMED", "NOT_ESTABLISHED"] },
          interviewer_belief: { type: "string" },
          evidence_available: { type: "string" },
          evidence_boundary: { type: "string" },
          unresolved_belief: { type: "string" },
          verification_target: { type: "string" },
          confirmation_evidence: { type: "string" },
          must_demonstrate: { type: "string" },
          point_of_attention: { type: "string" },
          preparation_consequence: { type: "string" }
        },
        required: ["requirement","evidence_state","interviewer_belief","evidence_available","evidence_boundary","unresolved_belief","verification_target","confirmation_evidence","must_demonstrate","point_of_attention","preparation_consequence"]
      }
    }
  },
  required: ["overall_challenge","tensions"]
} as const;

type Variant = "baseline" | "skeptic" | "belief_state";

function promptFor(variant: Variant): string {
  const common = `
You are an expert senior hiring manager reviewing a candidate CV against a target job description.
Your job is to identify the three most decision-relevant strategic tensions for interview preparation.

Evidence discipline:
- Use only facts explicitly present in the supplied CV.
- Never infer ownership from title, decision authority from participation, scale from a generic label, mastery from qualification, outcome from responsibility, or direct experience from keywords.
- If the CV omits a detail, treat it as unknown, not as a weakness.
- Distinguish direct evidence from transferable evidence.
- Do not manufacture psychological motives or cynical doubts.
- A requirement may be PROVEN, PLAUSIBLE_UNCONFIRMED, or NOT_ESTABLISHED.
- PLAUSIBLE_UNCONFIRMED means the CV creates a credible signal but does not establish depth, ownership, scope, scale, authority, recency, or context.
- NOT_ESTABLISHED means the CV does not provide meaningful evidence for the requirement.
- The interview is where unresolved evidence is verified.
- 'must_demonstrate' and 'point_of_attention' must be materially different: the former is the proof objective; the latter is the residual uncertainty.
- Avoid generic advice such as demonstrate leadership, show communication, or prove ownership unless tied to a specific evidence boundary.
`;

  if (variant === "baseline") return common + `
Reasoning variant: baseline strategic reasoning.
Generate three tensions from the CV/JD. Seek non-obvious but defensible interviewer doubts. Keep every doubt anchored to explicit evidence boundaries.
`;

  if (variant === "skeptic") return common + `
Reasoning variant: embedded skeptical senior hiring-manager persona.
Before writing each tension, internally challenge the candidate's apparent positioning as a skeptical hiring manager would. The challenge must remain constrained by the CV evidence. Do not add facts.
`;

  return common + `
Reasoning variant: BELIEF STATE + VERIFICATION TARGET.
For each tension explicitly reason in this order:
1. What requirement matters?
2. What evidence is actually available?
3. What belief can the interviewer reasonably form from that evidence?
4. What remains unresolved?
5. Why is it unresolved?
6. What interview evidence would resolve it?
7. What should the candidate rehearse?

Do not call an unconfirmed detail a gap. Make the uncertainty itself the strategic insight when appropriate.
`;
}

async function runVariant(variant: Variant, cv: string, jd: string) {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    response_format: { type: "json_schema", json_schema: { name: `strategy_${variant}`, strict: true, schema: RESULT_SCHEMA as Record<string, unknown> } },
    messages: [
      { role: "system", content: promptFor(variant) },
      { role: "user", content: `RAW CV:
${cv.slice(0, 14000)}

TARGET JOB DESCRIPTION:
${jd.slice(0, 9000)}` }
    ]
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error(`Empty ${variant} response.`);
  return JSON.parse(raw);
}

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: AI_MODEL,
    variants: ["baseline", "skeptic", "belief_state"],
    purpose: "Offline synthetic research only. Not production Strategy.",
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Research endpoint disabled in production." }, { status: 404 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }
  try {
    const body = await request.json();
    const cv = typeof body?.cv === "string" ? body.cv.trim() : "";
    const jd = typeof body?.jd === "string" ? body.jd.trim() : "";
    if (!cv || !jd) return NextResponse.json({ error: "cv and jd are required." }, { status: 400 });

    const variants: Variant[] = ["baseline", "skeptic", "belief_state"];
    const results: Record<string, unknown> = {};
    for (const variant of variants) results[variant] = await runVariant(variant, cv, jd);

    return NextResponse.json({
      experiment: "belief-state-verification-v1",
      model: AI_MODEL,
      results,
      note: "This endpoint intentionally does not score or select a winner. Human evaluation remains required.",
    });
  } catch (error) {
    return NextResponse.json({ error: "Experiment failed.", details: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}