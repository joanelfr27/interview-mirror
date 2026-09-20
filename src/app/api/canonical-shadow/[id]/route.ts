import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runCanonicalShadowPipeline } from "@/lib/canonical-shadow-pipeline";
import type { SessionRecord } from "@/types";

/**
 * E1 diagnostic endpoint only.
 * It reads the authenticated session and runs the canonical pipeline in memory.
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
    const result = await runCanonicalShadowPipeline(session as SessionRecord);
    return NextResponse.json({
      mode: "E1_SHADOW_ONLY",
      writes_performed: false,
      production_strategy_invoked: false,
      diagnostics: result.diagnostics,
      extraction: result.extraction,
      ledger: result.ledger,
    });
  } catch (caught) {
    console.error("[E1 canonical shadow] failed", caught);
    return NextResponse.json({
      mode: "E1_SHADOW_ONLY",
      writes_performed: false,
      production_strategy_invoked: false,
      error: "Canonical shadow pipeline failed. Check server logs for the exact stage.",
    }, { status: 503 });
  }
}
