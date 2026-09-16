import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI } from "@/lib/openai";
import type { InterviewStrategy, SessionRecord } from "@/types";

// Existing implementation retained; only the key-message guidance and fallback
// wording below are refined so the strategy reads as candidate-facing coaching.

