// Runtime validation only; no production writes.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { runD16ShadowRuntimeIntegration } from "@/lib/d16-shadow-runtime-integration";
import {
  diagnoseProfessionalMirrorConnections,
  diagnosticObjectOverlap,
  diagnosticSignalOverlap,
} from "@/lib/professional-mirror";
import {
  buildD16DependencySnapshot,
  buildD16Strategy,
  validateD16Strategy,
  type D16Inputs,
} from "@/lib/d16-personalized-interview-strategy";
import type { RoleCapabilityModel } from "@/lib/role-capability-model";
import type { SessionRecord } from "@/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey || !process.env.OPENAI_API_KEY) {
  throw new Error("Required runtime validation secrets are not configured.");
}

type SessionRow = {
  id: string;
  user_id: string;
  title: string;
  cv_text: string;
  job_description: string;
  cv_analysis: SessionRecord["cv_analysis"];
  interview_strategy: SessionRecord["interview_strategy"];
  preparation_language: SessionRecord["preparation_language"];
  preparation_purpose: SessionRecord["preparation_purpose"];
  interview_date: string | null;
  coaching_focus: string | null;
  job_description_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function ownershipMarkerInText(text: string): boolean {
  return /\b(?:i|i['’]m|i['’]ve|me|my|mine|je|j['’]ai|moi|mon|ma|mes|we|our|team|teams|nous|notre|nos|équipe|équipes|shared|co-owned|partagé|partagée|partagés|partagées|supervised|under supervision|sous supervision|supervisé|supervisée|report(?:ed)? to|rattaché|rattachée)\b/i.test(text);
}

function surroundingSourceQuote(document: string, quote: string): string {
  const index = document.indexOf(quote);
  if (index < 0) return "";
  const lineStart = document.lastIndexOf("\n", index) + 1;
  const lineEndIndex = document.indexOf("\n", index + quote.length);
  const lineEnd = lineEndIndex >= 0 ? lineEndIndex : document.length;
  return document.slice(lineStart, lineEnd).trim();
}


function ownershipBucket(atomQuote: string, surroundingQuote: string): "A" | "B" | "C" | "D" {
  const markerInAtom = ownershipMarkerInText(atomQuote);
  const markerInSurrounding = ownershipMarkerInText(surroundingQuote);
  if (!markerInAtom) return markerInSurrounding ? "B" : "C";
  const competingRelationship = /\b(?:led by|managed by|under (?:the )?supervision(?: of)?|report(?:ed|s)? to|rattach[ée]?e?\s+à|sous supervision|dirig[ée]?e?\s+par|équipe dirig[ée]?e?\s+par|team led by)\b/i;
  return competingRelationship.test(atomQuote) ? "D" : "A";
}

type SignalMatrixRow = {
  population: number;
  populated: number;
  population_rate: number;
  distinct_values: number;
  eligible_pairs: number;
  shared_value_pairs: number;
  shared_value_pair_rate: number;
};

function normalizeSignalValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean).sort().join("|");
  return String(value ?? "").trim().toLowerCase();
}

function signalMatrix(
  atoms: Array<import("@/lib/canonical-evidence-model").AtomicEvidence>,
  getValue: (atom: import("@/lib/canonical-evidence-model").AtomicEvidence) => unknown,
  pairMatches: (
    left: import("@/lib/canonical-evidence-model").AtomicEvidence,
    right: import("@/lib/canonical-evidence-model").AtomicEvidence,
  ) => boolean,
): SignalMatrixRow {
  const values = atoms.map(getValue).map(normalizeSignalValue);
  const populatedValues = values.filter(Boolean);
  let eligiblePairs = 0;
  let sharedValuePairs = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (!values[i]) continue;
    for (let j = i + 1; j < values.length; j += 1) {
      if (!values[j]) continue;
      eligiblePairs += 1;
      if (pairMatches(atoms[i], atoms[j])) sharedValuePairs += 1;
    }
  }
  return {
    population: atoms.length,
    populated: populatedValues.length,
    population_rate: atoms.length ? Number((populatedValues.length / atoms.length).toFixed(3)) : 0,
    distinct_values: new Set(populatedValues).size,
    eligible_pairs: eligiblePairs,
    shared_value_pairs: sharedValuePairs,
    shared_value_pair_rate: eligiblePairs ? Number((sharedValuePairs / eligiblePairs).toFixed(3)) : 0,
  };
}

function textSignalPair(
  getValue: (atom: import("@/lib/canonical-evidence-model").AtomicEvidence) => unknown,
) {
  return (
    left: import("@/lib/canonical-evidence-model").AtomicEvidence,
    right: import("@/lib/canonical-evidence-model").AtomicEvidence,
  ) => {
    const leftValue = getValue(left);
    const rightValue = getValue(right);
    if (typeof leftValue !== "string" || typeof rightValue !== "string") return false;
    if (!leftValue.trim() || !rightValue.trim()) return false;
    return diagnosticSignalOverlap(leftValue, rightValue);
  };
}

function arraySignalPair(
  getValue: (atom: import("@/lib/canonical-evidence-model").AtomicEvidence) => unknown,
) {
  return (
    left: import("@/lib/canonical-evidence-model").AtomicEvidence,
    right: import("@/lib/canonical-evidence-model").AtomicEvidence,
  ) => {
    const leftValues = getValue(left);
    const rightValues = getValue(right);
    if (!Array.isArray(leftValues) || !Array.isArray(rightValues)) return false;
    return leftValues.some((x) =>
      typeof x === "string" && x.trim() &&
      rightValues.some((y) =>
        typeof y === "string" && y.trim() && diagnosticSignalOverlap(x, y),
      ),
    );
  };
}

function exactSignalPair(
  getValue: (atom: import("@/lib/canonical-evidence-model").AtomicEvidence) => unknown,
) {
  return (
    left: import("@/lib/canonical-evidence-model").AtomicEvidence,
    right: import("@/lib/canonical-evidence-model").AtomicEvidence,
  ) => {
    const leftValue = normalizeSignalValue(getValue(left));
    const rightValue = normalizeSignalValue(getValue(right));
    return Boolean(leftValue && rightValue && leftValue === rightValue);
  };
}

function buildSignalPopulationMatrix(atoms: Array<import("@/lib/canonical-evidence-model").AtomicEvidence>) {
  return {
    ownership: signalMatrix(atoms, (atom) => atom.subject.ownership === "UNKNOWN" ? "" : atom.subject.ownership, exactSignalPair((atom) => atom.subject.ownership === "UNKNOWN" ? "" : atom.subject.ownership)),
    outcome: signalMatrix(atoms, (atom) => atom.outcome, textSignalPair((atom) => atom.outcome)),
    scope: signalMatrix(atoms, (atom) => atom.scale.scope, textSignalPair((atom) => atom.scale.scope)),
    quantity: signalMatrix(atoms, (atom) => atom.scale.quantity, exactSignalPair((atom) => atom.scale.quantity)),
    team_size: signalMatrix(atoms, (atom) => atom.scale.team_size, exactSignalPair((atom) => atom.scale.team_size)),
    temporal: signalMatrix(atoms, (atom) => [atom.time.start, atom.time.end, atom.time.recency], exactSignalPair((atom) => [atom.time.start, atom.time.end, atom.time.recency])),
    domain: signalMatrix(atoms, (atom) => atom.context.domain, textSignalPair((atom) => atom.context.domain)),
    action: signalMatrix(atoms, (atom) => atom.action.normalized_action === "UNKNOWN" ? "" : atom.action.normalized_action, textSignalPair((atom) => atom.action.normalized_action === "UNKNOWN" ? "" : atom.action.normalized_action)),
    object: signalMatrix(atoms, (atom) => atom.action.object === "UNKNOWN" ? "" : atom.action.object, (left, right) =>
      left.action.object !== "UNKNOWN" && right.action.object !== "UNKNOWN" &&
      diagnosticObjectOverlap(left.action.object, right.action.object, left.provenance.language, right.provenance.language)),
    tools_or_systems: signalMatrix(atoms, (atom) => atom.context.tools_or_systems, arraySignalPair((atom) => atom.context.tools_or_systems)),
    standards: signalMatrix(atoms, (atom) => atom.context.standards, arraySignalPair((atom) => atom.context.standards)),
  };
}
