import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { normalizeLanguage } from "@/lib/openai";
import { buildEvidenceMap, isValidStrategy } from "@/lib/strategy-engine";
import { runStrategyEngineV23Lite } from "@/lib/strategy-engine-v23-lite";
import { createClient } from "@/lib/supabase/server";
import type { InterviewStrategy, SessionRecord, CvAnalysis } from "@/types";

const STRATEGY_ENGINE_VERSION = "v2.3-lite-3";

function canonicalize(value: string): string { return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function hash(value: string): string { return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`; }
function parseAnalysis(value: unknown): CvAnalysis | null { if (typeof value === "string") { try { return JSON.parse(value) as CvAnalysis; } catch { return null; } } return value && typeof value === "object" ? value as CvAnalysis : null; }
function hasValidProvenance(value: unknown, session: SessionRecord): boolean { const a = parseAnalysis(value); const p = a?.provenance; return Boolean(p && p.contract_version === "v5.1" && p.preparation_language === session.preparation_language && p.cv_content_hash === hash(session.cv_text) && p.jd_content_hash === hash(session.job_description)); }
function supportedTechnicalPoint(gap: string, session: SessionRecord): boolean { const lower = gap.toLowerCase(); if (!/(ifrs|ohada|syscohada)/.test(lower)) return false; return /acca|ifrs|syscohada|ohada/.test(session.cv_text.toLowerCase()); }
function deriveMaterialRisks(session: SessionRecord): string[] { return (session.cv_analysis?.gaps ?? []).filter((gap) => !supportedTechnicalPoint(gap, session)).slice(0, 3); }
function shortAnchor(value: string, maxWords = 14): string { return canonicalize(value).split(" ").slice(0, maxWords).join(" ").replace(/[,:;]+$/, ""); }
function evidenceItems(session: SessionRecord) { return (session.cv_analysis?.evidenceChain ?? []).filter((item) => item.cv_evidence && item.cv_evidence !== "NO CV EVIDENCE FOUND" && item.jd_requirement).slice(0, 6); }
function fallbackRoleAnchor(requirement: string, fr: boolean): string {
  const r = requirement.toLowerCase();