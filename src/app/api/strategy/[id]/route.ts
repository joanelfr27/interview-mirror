import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { normalizeLanguage } from "@/lib/openai";
import { buildEvidenceMap, isValidStrategy } from "@/lib/strategy-engine";
import { createClient } from "@/lib/supabase/server";
import type { InterviewStrategy, SessionRecord, CvAnalysis } from "@/types";
import { STRATEGY_ENGINE_VERSION } from "@/lib/strategy-engine-version";

export const maxDuration = 60;

/** D16 production cutover gate. V23 must not remain candidate-authoritative. */
export const D16_PRODUCTION_CUTOVER_ENABLED = false;

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
  if (r.includes("ohada") || r.includes("syscohada")) return fr ? "les normes OHADA/SYSCOHADA" : "OHADA/SYSCOHADA accounting standards";
  if (r.includes("ifrs")) return fr ? "les normes IFRS" : "IFRS standards";
  if (r.includes("erp") || r.includes("sage") || r.includes("sap") || r.includes("oracle")) return fr ? "les systèmes ERP" : "ERP systems";
  if (r.includes("regional") || r.includes("region")) return fr ? "la gestion d'un périmètre régional" : "regional scope management";
  if (r.includes("reporting")) return fr ? "le reporting financier" : "financial reporting";
  if (r.includes("budget") || r.includes("forecast")) return fr ? "le pilotage budgétaire et les prévisions" : "budgeting and forecasting";
  return fr ? "cette responsabilité clé du poste" : "this key role responsibility";
}
function cleanEvidence(value: string, maxWords = 28): string {
  return shortAnchor(value.replace(/^\s*(?:expérience pertinente|relevant experience|point d'ancrage|evidence anchor)\s*:\s*/i, ""), maxWords);
}
function fallbackStrategy(session: SessionRecord): InterviewStrategy {
  const language = normalizeLanguage(session.preparation_language); const fr = language === "fr"; const analysis = session.cv_analysis; const strengths = analysis?.strengths ?? []; const items = evidenceItems(session); const risks = deriveMaterialRisks(session); const cv = session.cv_text.toLowerCase();
  const hasAcca = /\bacca\b/i.test(cv);
  const employerMatch = cv.match(/syngenta|vfs global|mitsubishi|epp books/i)?.[0];
  const candidateAnchor = employerMatch ? shortAnchor(employerMatch, 6) : (strengths[0] ? shortAnchor(strengths[0], 6) : (fr ? "votre parcours professionnel" : "your professional background"));
  const first = items[0]; const second = items[1] ?? items[0]; const third = items[2] ?? items[0];
  let firstRole = fallbackRoleAnchor(first?.jd_requirement ?? "", fr); let secondRole = fallbackRoleAnchor(second?.jd_requirement ?? "", fr); let thirdRole = fallbackRoleAnchor(third?.jd_requirement ?? "", fr);
  const usedRoles = new Set<string>();
  const distinctFallbacks = fr ? ["le pilotage budgétaire et les prévisions", "le reporting financier", "la gestion d'un périmètre régional"] : ["budgeting and forecasting", "financial reporting", "regional scope management"];
  [firstRole, secondRole, thirdRole] = [firstRole, secondRole, thirdRole].map((role) => { if (!usedRoles.has(role)) { usedRoles.add(role); return role; } const alt = distinctFallbacks.find((x) => !usedRoles.has(x)) ?? role; usedRoles.add(alt); return alt; });
  const priorities = [
    fr ? `Concernant ${firstRole}, l'entretien doit établir que vous avez déjà exercé un niveau de responsabilité réel chez ${candidateAnchor} : une décision que vous avez prise, une analyse que vous avez conduite ou un résultat dont vous étiez responsable, et non une tâche exécutée sous supervision.` : `On ${firstRole}, the interview must establish that you have already exercised real responsibility at ${candidateAnchor}: a decision you made, an analysis you led, or an outcome you owned, not a task performed under supervision.`,
    fr ? `Sur ${secondRole}, l'enjeu est de démontrer la profondeur de votre pratique${hasAcca ? ", en vous appuyant sur votre parcours professionnel autant que sur votre qualification ACCA" : ""} : le jugement que vous exerciez concrètement, et pas seulement une connaissance théorique du sujet.` : `On ${secondRole}, the goal is to demonstrate depth of practice${hasAcca ? ", drawing on both your professional background and your ACCA qualification" : ""}: the judgement you actually applied, not just theoretical knowledge of the topic.`,
    fr ? `Sur ${thirdRole}, l'intervieweur voudra vérifier comment votre expérience professionnelle vous prépare au périmètre du poste, en distinguant clairement ce qui est déjà démontré de ce qui reste à confirmer pendant l'entretien.` : `On ${thirdRole}, the interviewer will want to check how your professional experience prepares you for the scope of this role, clearly separating what is already demonstrated from what still needs to be confirmed in the interview.`
  ];
  const storyIntros = fr
    ? [(ev: string) => `${ev} Utilisez cet exemple pour démontrer un niveau réel de responsabilité et de décision personnelle.`,
       (ev: string) => `${ev} Utilisez cet exemple pour illustrer la profondeur de votre pratique et le jugement que vous avez exercé sur ce sujet.`,
       (ev: string) => `${ev} Utilisez cet exemple pour montrer comment cette expérience se rapproche du périmètre attendu pour ce poste.`]
    : [(ev: string) => `${ev} Use this example to demonstrate a genuine level of responsibility and personal decision-making.`,
       (ev: string) => `${ev} Use this example to show the depth of your practice and the judgement you applied on this topic.`,
       (ev: string) => `${ev} Use this example to show how this experience maps onto the scope expected for this role.`];
  const stories = [first, second, third].map((item, index) => { const evRaw = cleanEvidence(item?.cv_evidence ?? candidateAnchor, 28); const ev = /[.!?]$/.test(evRaw) ? evRaw : `${evRaw}.`; return storyIntros[index](ev); });
  const defenses = risks.map((risk) => { const lower = risk.toLowerCase(); if (fr && /erp|sage|sap|oracle/.test(lower)) return "Si le sujet ERP est abordé, précisez l'outil réellement utilisé, le processus concerné, la durée d'utilisation et votre niveau de responsabilité. Ne déduisez pas une expérience SAP, Oracle ou SAGE d'un simple passage dans un groupe international."; if (fr && /minier|mining/.test(lower)) return "Si le secteur minier est abordé, reconnaissez simplement l'absence d'expérience sectorielle documentée. Appuyez-vous ensuite sur une expérience financière concrète pour démontrer votre capacité à comprendre un nouvel environnement opérationnel sans prétendre à une expertise minière."; if (!fr && /erp|sage|sap|oracle/.test(lower)) return "If the ERP topic comes up, specify the system actually used, the process involved, the duration of use, and your level of responsibility. Do not infer SAP, Oracle, or Sage experience from working in an international group."; if (!fr && /mining/.test(lower)) return "If mining comes up, acknowledge that sector experience is not documented. Then use a concrete finance experience to demonstrate how you would transfer your operating discipline to a new environment without claiming mining expertise."; return fr ? "Traitez ce point comme une vérification ciblée : distinguez clairement ce que votre CV établit, ce que vous avez réellement pratiqué et ce qui devra être démontré pendant l'entretien." : "Treat this as a targeted verification point: distinguish what the CV establishes, what you actually practiced, and what must be demonstrated in the interview."; });
  const difficult = [fr ? "Quelle décision avez-vous personnellement influencée dans une situation comparable à ce poste, et quel a été votre rôle exact ?" : "Which decision have you personally influenced in a situation comparable to this role, and what exactly was your role?", fr ? "Pouvez-vous décrire un processus financier que vous maîtrisiez réellement, le jugement que vous exerciez et le résultat obtenu ?" : "Can you describe a finance process you genuinely owned, the judgement you applied, and the outcome?", risks[0] ? (fr ? "Votre CV laisse ce point à vérifier : pouvez-vous préciser votre expérience réelle sur ce sujet, notamment votre périmètre, votre niveau d'implication et la durée ?" : "Your CV leaves this point to be verified: can you clarify your actual experience, including scope, level of involvement, and duration?") : (fr ? "Quel exemple de votre parcours démontre le mieux votre capacité à prendre des décisions au niveau attendu pour ce poste ?" : "Which example from your background best demonstrates your ability to make decisions at the level expected for this role?")];
  return {
    candidatePositioning: fr ? `Votre positionnement ne doit pas être celui d'un candidat qui possède simplement une solide expérience financière. Il doit montrer comment ${candidateAnchor} vous a déjà placé face à des responsabilités suffisamment concrètes pour démontrer votre niveau d'impact, puis établir ce qui doit encore être vérifié pour le poste visé.` : `Your positioning should not be that of a candidate who simply has strong finance experience. It should show how ${candidateAnchor} has already exposed you to meaningful responsibility and evidence of impact, while making clear what still needs to be verified for the target role.`,
    strongestValueProposition: fr ? `Votre parcours combine une expérience financière structurée et des responsabilités pertinentes pour ce poste. Le point différenciant à faire émerger est la chaîne « expérience → décision personnelle → impact », plutôt qu'une simple liste de responsabilités.` : `Your background combines structured finance experience with responsibilities relevant to this role. The differentiator to establish is the chain “experience → personal decision → impact”, rather than another list of responsibilities.`,
    strengthsToLeverage: strengths.slice(0, 3).map((x) => fr ? `Atout établi : ${shortAnchor(x, 28)}.` : `Established strength: ${shortAnchor(x, 28)}.`),
    gapsOrRisks: risks,
    gapDefenseStrategy: defenses,
    interviewPriorities: priorities,
    likelyDifficultQuestions: difficult,
    storiesToPrepare: stories,
    communicationPriorities: fr ? "Parlez en termes de décisions, de périmètre et de résultats. Distinguez toujours ce que vous avez personnellement fait de ce qui relevait de l'équipe." : "Speak in terms of decisions, scope, and outcomes. Always distinguish what you personally did from what belonged to the wider team.",
    interviewPlan: fr ? "Commencez par établir votre niveau d'impact, utilisez ensuite des expériences précises pour démontrer la profondeur de votre pratique, puis traitez séparément les points qui restent à vérifier." : "First establish your level of impact, then use specific experiences to demonstrate depth of practice, and address verification points separately.",
    personalization: fr ? "Cette stratégie distingue trois niveaux : ce que votre CV prouve, ce que votre expérience permet raisonnablement d'inférer et ce que l'entretien doit encore établir." : "This strategy separates three levels: what your CV proves, what your experience reasonably suggests, and what the interview still needs to establish."
  };
}

async function generateStrategy(_session: SessionRecord): Promise<InterviewStrategy> {
  throw new Error("D16 production cutover required.");
}

function hasCurrentEngineVersion(strategy: unknown): boolean {
  return Boolean(strategy && typeof strategy === "object" && (strategy as any)._strategy_engine_version === STRATEGY_ENGINE_VERSION);
}

function stampEngineVersion(strategy: InterviewStrategy): InterviewStrategy {
  return { ...strategy, _strategy_engine_version: STRATEGY_ENGINE_VERSION } as InterviewStrategy;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: session, error } = await supabase.from("sessions").select("*").eq("id", id).eq("user_id", user.id).single();
  if (error || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const record = session as SessionRecord;
  if (!D16_PRODUCTION_CUTOVER_ENABLED) {
    return NextResponse.json({
      code: "D16_PRODUCTION_CUTOVER_REQUIRED",
      error: "The legacy strategy engine is disabled. D16 production integration must be enabled before an interview strategy can be generated.",
    }, { status: 503 });
  }
  if (!record.cv_analysis) return NextResponse.json({ error: "CV analysis is required before generating an interview strategy." }, { status: 400 });
  if (!hasValidProvenance(record.cv_analysis, record)) return NextResponse.json({ code: "ANALYSIS_PROVENANCE_INVALID", error: "The Professional Mirror analysis must be refreshed before an interview strategy can be generated." }, { status: 422 });
  const evidenceMap = buildEvidenceMap(record);
  if (hasCurrentEngineVersion(record.interview_strategy) && !["INSUFFICIENT_EVIDENCE", "AUTHORITATIVE_PLAN_FALLBACK"].includes((record.interview_strategy as any)?._strategy_status) && isValidStrategy(record.interview_strategy, normalizeLanguage(record.preparation_language), record.job_description, record.cv_analysis, record.cv_text, evidenceMap, null, true)) return NextResponse.json({ strategy: record.interview_strategy });

  let strategy: InterviewStrategy;
  try {
    strategy = await generateStrategy(record);
  } catch (error) {
    console.error("[Strategy Engine V2.3-lite] generation failed", error);
    return NextResponse.json({ code: "STRATEGY_ENGINE_V23_LITE_FAILED", error: "The V2.3-lite interview strategy engine failed validation. Check the server log for the exact failing stage." }, { status: 503 });
  }

  strategy = stampEngineVersion(strategy);
  const { error: updateError } = await supabase.from("sessions").update({ interview_strategy: strategy }).eq("id", id).eq("user_id", user.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ strategy });
}
