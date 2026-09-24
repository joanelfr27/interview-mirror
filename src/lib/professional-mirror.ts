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
  opening_statement_id: string | null;
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
    .filter((atom) => ledger.source_spans.some((span) => span.id === atom.source_span_id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function spanFor(ledger: EvidenceLedger, atom: AtomicEvidence) {
  return ledger.source_spans.find((span) => span.id === atom.source_span_id);
}

function dedupeKey(ledger: EvidenceLedger, atom: AtomicEvidence): string {
  const span = spanFor(ledger, atom);
  return [
    span?.text ?? "",
    atom.action.normalized_action,
    atom.action.object,
    atom.context.domain ?? "",
    ...(atom.context.tools_or_systems ?? []),
    ...(atom.context.standards ?? []),
  ].join("|").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function independentAtoms(ledger: EvidenceLedger): AtomicEvidence[] {
  const seen = new Set<string>();
  return affirmativeAtoms(ledger).filter((atom) => {
    const key = dedupeKey(ledger, atom);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function connection(a: AtomicEvidence, b: AtomicEvidence): CareerThread["connection_reason"] | null {
  if (overlap(a.action.object, b.action.object)) return "SHARED_OBJECT";
  if (a.context.domain && b.context.domain && overlap(a.context.domain, b.context.domain)) return "SHARED_DOMAIN";
  if (a.context.tools_or_systems?.some((x) => b.context.tools_or_systems?.some((y) => overlap(x, y)))) return "SHARED_TOOL";
  if (a.context.standards?.some((x) => b.context.standards?.some((y) => overlap(x, y)))) return "SHARED_STANDARD";
  if (overlap(a.action.normalized_action, b.action.normalized_action) && a.context.domain && b.context.domain && overlap(a.context.domain, b.context.domain)) return "REPEATED_ACTION";
  return null;
}

function maturity(independentSpanCount: number): MirrorMaturity {
  if (independentSpanCount >= 3) return "SUSTAINED_STRENGTH";
  if (independentSpanCount === 2) return "SUPPORTED_CONCLUSION";
  if (independentSpanCount === 1) return "EMERGING_PATTERN";
  return "INSUFFICIENT_EVIDENCE";
}

function safeLabel(atom: AtomicEvidence): string {
  return [atom.action.normalized_action, atom.action.object].filter(Boolean).join(" ").trim();
}

function buildThreads(atoms: AtomicEvidence[]): CareerThread[] {
  const adjacency = new Map<string, Array<{ id: string; reason: CareerThread["connection_reason"] }>>();
  for (const atom of atoms) adjacency.set(atom.id, []);

  for (let i = 0; i < atoms.length; i += 1) {
    for (let j = i + 1; j < atoms.length; j += 1) {
      const reason = connection(atoms[i], atoms[j]);
      if (!reason) continue;
      adjacency.get(atoms[i].id)?.push({ id: atoms[j].id, reason });
      adjacency.get(atoms[j].id)?.push({ id: atoms[i].id, reason });
    }
  }

  const visited = new Set<string>();
  const threads: CareerThread[] = [];

  for (const atom of atoms) {
    if (visited.has(atom.id)) continue;
    const component: string[] = [];
    const queue = [atom.id];
    const reasons = new Map<CareerThread["connection_reason"], number>();

    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      component.push(current);

      for (const edge of adjacency.get(current) ?? []) {
        reasons.set(edge.reason, (reasons.get(edge.reason) ?? 0) + 1);
        if (!visited.has(edge.id)) queue.push(edge.id);
      }
    }

    const uniqueSpans = new Set(
      component.map((id) => atoms.find((candidate) => candidate.id === id)?.source_span_id)
        .filter((id): id is string => Boolean(id)),
    );
    if (component.length < 2 || uniqueSpans.size < 2) continue;

    const bestReason = [...reasons.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "REPEATED_ACTION";
    const labels = component
      .map((id) => atoms.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is AtomicEvidence => Boolean(candidate))
      .map(safeLabel)
      .filter(Boolean);
    const label = [...new Set(labels)].sort()[0] ?? "Supported professional thread";

    threads.push({
      id: `THREAD-${component.sort().join("-")}`,
      label,
      evidence_ids: [...component].sort(),
      connection_reason: bestReason,
    });
  }

  return threads.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildProfessionalMirror(ledger: EvidenceLedger): ProfessionalMirror {
  const atoms = independentAtoms(ledger);
  const evidence: MirrorEvidenceRef[] = atoms.flatMap((atom) => {
    const span = spanFor(ledger, atom);
    return span ? [{ evidence_id: atom.id, source_span_id: span.id, source_quote: span.text, source_type: atom.provenance.source_type }] : [];
  });

  const threads = buildThreads(atoms);
  const statements: MirrorStatement[] = [];

  for (const atom of atoms) {
    const span = spanFor(ledger, atom);
    if (!span) continue;
    statements.push({
      id: `FACT-${atom.id}`,
      kind: "FACT",
      text: span.text,
      evidence_ids: [atom.id],
      maturity: "EMERGING_PATTERN",
    });
  }

  for (const thread of threads) {
    const spanCount = new Set(thread.evidence_ids.map((id) => atoms.find((atom) => atom.id === id)?.source_span_id)
      .filter((id): id is string => Boolean(id))).size;

    statements.push({
      id: `PATTERN-${thread.id}`,
      kind: "PATTERN",
      text: `Repeated professional thread: ${thread.label}.`,
      evidence_ids: [...thread.evidence_ids],
      maturity: maturity(spanCount),
    });

    if (spanCount >= 3) {
      statements.push({
        id: `INTERPRETATION-${thread.id}`,
        kind: "INTERPRETATION",
        text: `Across multiple documented experiences, ${thread.label} appears as a sustained professional thread.`,
        evidence_ids: [...thread.evidence_ids],
        maturity: "SUSTAINED_STRENGTH",
      });
    }
  }

  statements.sort((a, b) => a.id.localeCompare(b.id));
  const opening = statements.find((s) => s.kind === "INTERPRETATION") ?? statements.find((s) => s.kind === "PATTERN") ?? null;

  return {
    version: "d15-v1",
    evidence,
    threads,
    statements,
    story: {
      opening: opening?.text ?? "Your professional story is still gathering evidence.",
      opening_statement_id: opening?.id ?? null,
      threads: threads.map((thread) => ({
        thread_id: thread.id,
        title: thread.label,
        statement_ids: statements
          .filter((s) => s.evidence_ids.length > 0 && s.evidence_ids.every((id) => thread.evidence_ids.includes(id)))
          .map((s) => s.id),
      })),
    },
  };
}

export function validateProfessionalMirror(mirror: ProfessionalMirror, ledger: EvidenceLedger): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (mirror.version !== "d15-v1") errors.push("D15 mirror version must be d15-v1.");

  const evidenceById = new Map(ledger.evidence.map((atom) => [atom.id, atom]));
  const spans = new Map(ledger.source_spans.map((span) => [span.id, span]));
  const mirrorEvidenceById = new Map(mirror.evidence.map((item) => [item.evidence_id, item]));

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
    const uniqueSpans = new Set(statement.evidence_ids.map((id) => evidenceById.get(id)?.source_span_id)
      .filter((id): id is string => Boolean(id)));
    if (statement.kind !== "FACT" && uniqueSpans.size < 2) errors.push(`D15 ${statement.id} needs two distinct source spans.`);
    for (const id of statement.evidence_ids) {
      if (!mirrorEvidenceById.has(id)) errors.push(`D15 ${statement.id} references evidence outside the Mirror: ${id}`);
      if (evidenceById.get(id)?.assertion.polarity !== "AFFIRMATIVE") errors.push(`D15 ${statement.id} references non-affirmative evidence: ${id}`);
    }
  }

  const threadById = new Map(mirror.threads.map((thread) => [thread.id, thread]));
  for (const thread of mirror.threads) {
    const uniqueEvidence = new Set(thread.evidence_ids);
    const uniqueSpans = new Set(thread.evidence_ids.map((id) => evidenceById.get(id)?.source_span_id)
      .filter((id): id is string => Boolean(id)));
    if (uniqueEvidence.size < 2) errors.push(`D15 thread ${thread.id} needs two evidence nodes.`);
    if (uniqueEvidence.size !== thread.evidence_ids.length) errors.push(`D15 thread ${thread.id} contains duplicate evidence.`);
    if (uniqueSpans.size < 2) errors.push(`D15 thread ${thread.id} needs two distinct source spans.`);
    for (const id of thread.evidence_ids) if (!mirrorEvidenceById.has(id)) errors.push(`D15 thread ${thread.id} references unknown evidence: ${id}`);
  }

  const statementById = new Map(mirror.statements.map((statement) => [statement.id, statement]));
  if (mirror.story.opening_statement_id === null) {
    if (mirror.story.opening !== "Your professional story is still gathering evidence.") errors.push("D15 Story opening is not traceable to a statement.");
  } else {
    const openingStatement = statementById.get(mirror.story.opening_statement_id);
    if (!openingStatement || openingStatement.text !== mirror.story.opening) errors.push("D15 Story opening does not match its supporting statement.");
  }

  for (const storyThread of mirror.story.threads) {
    const thread = threadById.get(storyThread.thread_id);
    if (!thread) {
      errors.push(`D15 Story references unknown thread: ${storyThread.thread_id}`);
      continue;
    }
    const allowedStatementIds = new Set(
      mirror.statements
        .filter((s) => s.evidence_ids.length > 0 && s.evidence_ids.every((id) => thread.evidence_ids.includes(id)))
        .map((s) => s.id),
    );
    for (const statementId of storyThread.statement_ids) {
      if (!statementById.has(statementId)) errors.push(`D15 Story references unknown statement: ${statementId}`);
      else if (!allowedStatementIds.has(statementId)) errors.push(`D15 Story statement ${statementId} does not belong to thread ${storyThread.thread_id}.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
