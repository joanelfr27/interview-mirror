import { NextResponse } from "next/server";

const NEMOTRON_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type AdversaryRequest = {
  cv: string;
  jd: string;
  strategy?: unknown;
};

function jsonFromModel(raw: string): unknown {
  const cleaned = raw.trim()
    .replace(/^\`\`\`json\s*/i, "")
    .replace(/^\`\`\`\s*/i, "")
    .replace(/\s*\`\`\`$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Nemotron returned non-JSON output.");
  }
}

function buildPrompt(input: AdversaryRequest): string {
  return \`
You are the Strategic Adversary inside Interview Mirror.

Your job is NOT to summarize the CV, match keywords, praise the candidate, or write generic interview advice.

You are a skeptical senior interviewer. Attack the proposed strategy and find the QUESTION BEHIND THE QUESTION.

The useful insight is the unresolved belief the interviewer needs to form about this candidate for this specific role.

For each of exactly 3 strategic tensions:
1. Identify what the interviewer is likely to believe already from the evidence.
2. Identify what remains unproven or doubtful.
3. Explain why that doubt matters for this particular role.
4. State the strongest candidate-specific evidence that can legitimately address it.
5. State what the evidence does NOT prove. Never invent ownership, scale, metrics, outcomes, domain experience, or seniority.
6. Give a concrete preparation consequence: what example, decision, action, result, or clarification the candidate should prepare.
7. Explicitly distinguish "what must be demonstrated" from "what may still cause doubt".

Quality test:
- The insight must be non-obvious.
- It must depend on this candidate AND this job.
- It must be more useful than "highlight your experience/leadership".
- It must expose a tension, not merely restate a gap.
- It must survive a skeptical interviewer challenge.
- Never upgrade transferable evidence into direct target-domain experience.

Return ONLY valid JSON:
{
  "overall_challenge": "...",
  "tensions": [
    {
      "interviewer_belief": "...",
      "unresolved_question": "...",
      "why_it_matters": "...",
      "candidate_evidence": "...",
      "evidence_limit": "...",
      "must_demonstrate": "...",
      "remaining_doubt": "...",
      "preparation_consequence": "...",
      "wow_insight": "..."
    }
  ]
}

CV:
\${input.cv.slice(0, 14000)}

JOB DESCRIPTION:
\${input.jd.slice(0, 10000)}

CURRENT STRATEGY (if supplied):
\${JSON.stringify(input.strategy ?? null).slice(0, 12000)}
\`;
}

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.OPENROUTER_API_KEY),
    model: NEMOTRON_MODEL,
    purpose: "Strategic Adversary experiment",
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Experimental endpoint disabled in production." }, { status: 404 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY is not available in this environment." }, { status: 500 });
  }

  const input = (await request.json()) as AdversaryRequest;
  if (!input?.cv?.trim() || !input?.jd?.trim()) {
    return NextResponse.json({ error: "cv and jd are required." }, { status: 400 });
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${apiKey}\`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Interview Mirror Strategic Adversary",
    },
    body: JSON.stringify({
      model: NEMOTRON_MODEL,
      temperature: 0.2,
      max_tokens: 2200,
      messages: [
        {
          role: "system",
          content: "You are a rigorous strategic interviewer. Return only the requested JSON object.",
        },
        { role: "user", content: buildPrompt(input) },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    return NextResponse.json(
      { error: "OpenRouter/Nemotron request failed.", status: response.status, details: payload?.error?.message ?? payload },
      { status: 502 },
    );
  }

  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || !raw.trim()) {
    return NextResponse.json({ error: "Nemotron returned an empty response." }, { status: 502 });
  }

  try {
    return NextResponse.json({
      model: NEMOTRON_MODEL,
      result: jsonFromModel(raw),
    });
  } catch {
    return NextResponse.json({ error: "Nemotron response could not be parsed as JSON.", raw }, { status: 502 });
  }
}
