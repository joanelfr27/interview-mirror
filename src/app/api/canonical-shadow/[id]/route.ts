import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runCanonicalShadowPipeline } from "@/lib/canonical-shadow-pipeline";
import { runD16ShadowRuntimeIntegration } from "@/lib/d16-shadow-runtime-integration";
import { classifyCandidateElicitation } from "@/lib/candidate-elicitation";
import type { SessionRecord } from "@/types";

/**
 * E1/D16 diagnostic endpoint only.
 * It reads the authenticated session and runs canonical/D16 shadow computation in memory.
 * It never writes canonical data and never invokes the production Strategy engine.
 */
export const maxDuration = 120;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: session, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  try {
    const result = await runD16ShadowRuntimeIntegration(session as SessionRecord);
    return NextResponse.json({
      mode: "D16_SHADOW_ONLY",
      writes_performed: false,
      production_strategy_invoked: false,
      diagnostics: result.diagnostics,
      ledger: result.ledger,
      d2: result.d2,
      d3: result.d3,
      d4: result.d4,
      d5: result.d5,
      d6: result.d6,
      d15: result.d15,
    });
  } catch (caught) {
    console.error("[D16 shadow runtime] failed", caught);
    return NextResponse.json({
      mode: "D16_SHADOW_ONLY",
      writes_performed: false,
      production_strategy_invoked: false,
      error: "D16 shadow runtime integration failed. Check server logs for the exact stage.",
    }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: session, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  try {
    const body = await request.json() as { elicitation_id?: string; answer?: string };
    if (!body.elicitation_id || !body.answer?.trim()) {
      return NextResponse.json({ error: "elicitation_id and answer are required." }, { status: 400 });
    }

    // Never trust a client-supplied canonical ledger. Recreate the shadow
    // graph from the authenticated session so source provenance remains
    // server-derived and tamper-resistant.
    const initial = await runCanonicalShadowPipeline(session as SessionRecord);
    const elicitation = initial.ledger.candidate_elicitations.find(
      item => item.id === body.elicitation_id,
    );

    if (!elicitation) {
      return NextResponse.json({ error: "Elicitation not found." }, { status: 400 });
    }

    const result = await classifyCandidateElicitation(
      session as SessionRecord,
      initial.ledger,
      elicitation,
      body.answer,
    );

    return NextResponse.json({
      mode: "E1_SHADOW_ONLY",
      writes_performed: false,
      production_strategy_invoked: false,
      diagnostics: result.diagnostics,
      ledger: result.ledger,
    });
  } catch (caught) {
    console.error("[E1 canonical shadow elicitation] failed", caught);
    return NextResponse.json({
      mode: "E1_SHADOW_ONLY",
      writes_performed: false,
      production_strategy_invoked: false,
      error: "Canonical shadow elicitation failed. Check server logs for the exact stage.",
    }, { status: 503 });
  }
}
