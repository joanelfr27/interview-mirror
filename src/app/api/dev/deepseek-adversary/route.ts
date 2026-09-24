import { NextResponse } from "next/server";

const MODEL = "deepseek/deepseek-v4-flash-0731:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type Input = { cv: string; jd: string };

function parseJson(raw: string): unknown {
  const cleaned = raw.trim()
    .replace(/^\`\`\`json\s*/i, "")
    .replace(/^\`\`\`\s*/i, "")
    .replace(/\s*\`\`\`$/i, "")
    .trim();
  try { return JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("DeepSeek returned non-JSON output.");
  }
}

function prompt(input: Input) {
  return `You are the Strategic Adversary inside Interview Mirror.

Do NOT summarize the CV, match keywords, praise the candidate, or give generic interview advice.
Act as a skeptical senior interviewer. Find the QUESTION BEHIND THE QUESTION.

For exactly 3 tensions, identify:
- interviewer belief already supported by evidence
- unresolved question
- why that doubt matters for this role
- strongest legitimate candidate evidence
- what that evidence does NOT prove
- what the candidate must demonstrate
- remaining interviewer doubt
- concrete preparation consequence
- one non-obvious WOW insight

The insight must depend on THIS candidate and THIS role. Never invent ownership, scope, metrics, outcomes, seniority, industry experience or domain mastery. Distinguish direct evidence, transferable evidence and verification gaps.

Return ONLY valid JSON:
{"overall_challenge":"...","tensions":[{"interviewer_belief":"...","unresolved_question":"...","why_it_matters":"...","candidate_evidence":"...","evidence_limit":"...","must_demonstrate":"...","remaining_doubt":"...","preparation_consequence":"...","wow_insight":"..."}]}

CV:
${input.cv.slice(0,14000)}

JOB DESCRIPTION:
${input.jd.slice(0,10000)}`;
}

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.OPENROUTER_API_KEY), model: MODEL, purpose: "Strategic Adversary comparison" });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Experimental endpoint disabled in production." }, { status: 404 });
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENROUTER_API_KEY is not available in this environment." }, { status: 500 });

  const input = (await request.json()) as Input;
  if (!input?.cv?.trim() || !input?.jd?.trim()) return NextResponse.json({ error: "cv and jd are required." }, { status: 400 });

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Interview Mirror Strategic Adversary",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 2200,
      messages: [
        { role: "system", content: "You are a rigorous strategic interviewer. Return only the requested JSON object." },
        { role: "user", content: prompt(input) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  const payload = await response.json();
  if (!response.ok) return NextResponse.json({ error: "OpenRouter/DeepSeek request failed.", status: response.status, details: payload?.error?.message ?? payload }, { status: 502 });

  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || !raw.trim()) return NextResponse.json({ error: "DeepSeek returned an empty response." }, { status: 502 });

  try { return NextResponse.json({ model: MODEL, result: parseJson(raw) }); }
  catch { return NextResponse.json({ error: "DeepSeek response could not be parsed as JSON.", raw }, { status: 502 }); }
}
