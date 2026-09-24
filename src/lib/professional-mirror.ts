import type { AtomicEvidence, EvidenceLedger, EvidenceSourceType } from "@/lib/canonical-evidence-model";

export type MirrorStatementKind = "FACT" | "PATTERN" | "INTERPRETATION";
export type MirrorMaturity = "INSUFFICIENT_EVIDENCE" | "EMERGING_PATTERN" | "SUPPORTED_CONCLUSION" | "SUSTAINED_STRENGTH";

export type MirrorEvidenceRef = {
  evidence_id: string;
  source_span_id: string;
  source_quote: string;
  source_type: EvidenceSourceType;
};

export type CareerThread = {
  id: string;
  label: string;
  evidence_ids: string[];
  connection_reason: "SHARED_OBJECT" | "SHARED_DOMAIN" | "SHARED_TOOL" | "SHARED_STANDARD" | "REPEATED_ACTION";
};

export type MirrorStatement = {
  id: string;
  kind: MirrorStatementKind;
  text: string;
  evidence_ids: string[];
  maturity: MirrorMaturity;
};

export type ProfessionalStory = {
  opening: string;
  threads: Array<{ thread_id: string; title: string; statement_ids: string[] }>;
};

export type ProfessionalMirror = {
  version: "d15-v1";
  evidence: MirrorEvidenceRef[];
  threads: CareerThread[];
  statements: MirrorStatement[];
  story: ProfessionalStory;
};

function tokens(value: string): Set<string> {
  return new Set(value.normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 4));
}

function overlap(a: string, b: string): boolean {
  const left = tokens(a);
  const right = tokens(b);
  for (const token of left) if (right.has(token)) return true;
  return false;
}

function affirmativeAtoms(ledger: EvidenceLedger): AtomicEvidence[] {
  return ledger.evidence
    .filter((atom) => atom.assertion.polarity === "AFFIRMATIVE")
    .filter((atom) => atom.provenance.source_type !== "CANDIDATE_ELICITED")
    .sort((a, b) => a.id.localeCompare(b.id));
}

function spanFor(ledger: EvidenceLedger, atom: AtomicEvidence) {
  return ledger.source_spans.find((span) => span.id === atom.source_span_id);
}

function connection(a: AtomicEvidence, b: AtomicEvidence): CareerThread["connection_reason"] | null {
  if (overlap(a.action.object, b.action.object)) return "SHARED_OBJECT";
  if (a.context.domain && b.context.domain && overlap(a.context.domain, b.context.domain)) return "SHARED_DOMAIN";
  if (a.context.tools_or_systems?.some((x) => b.context.tools_or_systems?.some((y) => overlap(x, y)))) return "SHARED_TOOL";
  if (a.context.standards?.some((x) => b.context.standards?.some((y) => overlap(x, y)))) return "SHARED_STANDARD";
  if (overlap(a.action.normalized_action, b.action.normalized_action)) return "REPEATED_ACTION";
  return null;
}

function maturity(count: number): MirrorMaturity {
  if (count >= 3) return "SUSTAINED_STRENGTH";
  if (count === 2) return "SUPPORTED_CONCLUSION";
  if (count === 1) return "EMERGING_PATTERN";
  return "INSUFFICIENT_EVIDENCE";
}

function safeLabel(atom: AtomicEvidence): string {
  return [atom.action.normalized_action, atom.action.object].filter(Boolean).join(" ").trim();
}

export function buildProfessionalMirror(ledger: EvidenceLedger): ProfessionalMirror {
  const atoms = affirmativeAtoms(ledger);
  const evidence: MirrorEvidenceRef[] = atoms.flatMap((atom) => {
    const span = spanFor(ledger, atom);
    return span ? [{ evidence_id: atom.id, source_span_id: span.id, source_quote: span.text, source_type: atom.provenance.source_type }] : [];
  });

  const repeated = new Map<string, Set<string>>();
  for (const atom of atoms) {
    const label = safeLabel(atom);
    if (!label) continue;
    const key = label.toLowerCase();
    const ids = repeated.get(key) ?? new Set<string>();
    ids.add(atom.id);
    repeated.set(key, ids);
  }

  const threads: CareerThread[] = [...repeated.entries()]
    .filter(([, ids]) => ids.size >= 2)
    .map(([label, ids]) => ({
      id: `THREAD-${label.replace(/[^a-z0-9]+/gi, "-")}`,
      label,
      evidence_ids: [...ids].sort(),
      connection_reason: "SHARED_OBJECT" as const,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const statements: MirrorStatement[] = [];
  for (const atom of atoms) {
    const span = spanFor(ledger, atom);
    if (!span) continue;
    statements.push({ id: `FACT-${atom.id}`, kind: "FACT", text: span.text, evidence_ids: [atom.id], maturity: "EMERGING_PATTERN" });
  }

  for (const thread of threads) {
    statements.push({
      id: `PATTERN-${thread.id}`,
      kind: "PATTERN",
      text: `Repeated professional thread: ${thread.label}.`,
      evidence_ids: [...thread.evidence_ids],
      maturity: maturity(thread.evidence_ids.length),
    });
  }

  for (const thread of threads.filter((item) => item.evidence_ids.length >= 3)) {
    statements.push({
      id: `INTERPRETATION-${thread.id}`,
      kind: "INTERPRETATION",
      text: `Across multiple documented experiences, ${thread.label} appears as a sustained professional thread.`,
      evidence_ids: [...thread.evidence_ids],
      maturity: "SUSTAINED_STRENGTH",
    });
  }

  statements.sort((a, b) => a.id.localeCompare(b.id));
  const opening = statements.find((s) => s.kind === "INTERPRETATION") ?? statements.find((s) => s.kind === "PATTERN") ?? statements[0];

  return {
    version: "d15-v1",
    evidence,
    threads,
    statements,
    story: {
      opening: opening?.text ?? "Your professional story is still gathering evidence.",
      threads: threads.map((thread) => ({
        thread_id: thread.id,
        title: thread.label,
        statement_ids: statements.filter((s) => s.evidence_ids.some((id) => thread.evidence_ids.includes(id))).map((s) => s.id),
      })),
    },
  };
}

export function validateProfessionalMirror(mirror: ProfessionalMirror, ledger: EvidenceLedger): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (mirror.version !== "d15-v1") errors.push("D15 mirror version must be d15-v1.");

  const evidenceById = new Map(ledger.evidence.map((atom) => [atom.id, atom]));
  const spans = new Map(ledger.source_spans.map((span) => [span.id, span]));
  const mirrorIds = new Set(mirror.evidence.map((item) => item.evidence_id));

  for (const ref of mirror.evidence) {
    const atom = evidenceById.get(ref.evidence_id);
    const span = spans.get(ref.source_span_id);
    if (!atom || !span) { errors.push(`D15 unknown evidence reference: ${ref.evidence_id}`); continue; }
    if (atom.assertion.polarity !== "AFFIRMATIVE") errors.push(`D15 mirror cannot use negated evidence: ${ref.evidence_id}`);
    if (atom.provenance.source_type === "CANDIDATE_ELICITED") errors.push(`D15 mirror cannot use candidate-elicited evidence: ${ref.evidence_id}`);
    if (atom.source_span_id !== ref.source_span_id || span.text !== ref.source_quote) errors.push(`D15 provenance mismatch: ${ref.evidence_id}`);
  }

  for (const statement of mirror.statements) {
    if (!statement.text.trim()) errors.push(`D15 ${statement.id} has empty text.`);
    if (!statement.evidence_ids.length) errors.push(`D15 ${statement.id} has no evidence.`);
    const uniqueSpans = new Set(statement.evidence_ids.map((id) => evidenceById.get(id)?.source_span_id).filter((id): id is string => Boolean(id)));
    if (statement.kind !== "FACT" && uniqueSpans.size < 2) errors.push(`D15 ${statement.id} needs two distinct source spans.`);
    for (const id of statement.evidence_ids) {
      if (!mirrorIds.has(id)) errors.push(`D15 ${statement.id} references evidence outside the Mirror: ${id}`);
      if (evidenceById.get(id)?.assertion.polarity !== "AFFIRMATIVE") errors.push(`D15 ${statement.id} references non-affirmative evidence: ${id}`);
    }
  }

  for (const thread of mirror.threads) {
    if (thread.evidence_ids.length < 2) errors.push(`D15 thread ${thread.id} needs two evidence nodes.`);
    if (new Set(thread.evidence_ids).size !== thread.evidence_ids.length) errors.push(`D15 thread ${thread.id} contains duplicate evidence.`);
    for (const id of thread.evidence_ids) if (!mirrorIds.has(id)) errors.push(`D15 thread ${thread.id} references unknown evidence: ${id}`);
  }

  const statementIds = new Set(mirror.statements.map((s) => s.id));
  for (const storyThread of mirror.story.threads) for (const id of storyThread.statement_ids) if (!statementIds.has(id)) errors.push(`D15 Story references unknown statement: ${id}`);
  return { valid: errors.length === 0, errors };
}
