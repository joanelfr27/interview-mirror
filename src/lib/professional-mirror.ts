import type { AtomicEvidence, EvidenceLedger, EvidenceSourceType } from "@/lib/canonical-evidence-model";
import { d15EligibleIndependentAtoms, d15ThreadEligibleAtoms } from "@/lib/d15-evidence-eligibility";

export type MirrorStatementKind = "FACT" | "PATTERN" | "INTERPRETATION";
export type MirrorMaturity = "CONFIRMED_RELATIONSHIP" | "INSUFFICIENT_EVIDENCE" | "EMERGING_PATTERN" | "SUPPORTED_CONCLUSION" | "SUSTAINED_STRENGTH";

export type MirrorEvidenceRef = {
  evidence_id: string;
  source_span_id: string;
  source_quote: string;
  source_type: EvidenceSourceType;
};

export type MirrorGapDimension = "OUTCOME" | "SCALE" | "TIMING";

export type MirrorNotSaidYet = {
  dimension: MirrorGapDimension;
  evidence_ids: string[];
  source_span_ids: string[];
};

export type MirrorMaturityBasis = {
  proven_context_count: number;
  context_status: "CANONICAL_ROLE_CONTEXT_UNAVAILABLE";
  evidence_ids: string[];
  source_span_ids: string[];
};

export type CareerThread = {
  id: string;
  label: string;
  evidence_ids: string[];
  connection_reason: "SHARED_OBJECT" | "SHARED_DOMAIN" | "SHARED_TOOL" | "SHARED_STANDARD" | "REPEATED_ACTION";
  maturity: MirrorMaturity;
  maturity_basis: MirrorMaturityBasis;
  not_said_yet: MirrorNotSaidYet[];
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

const GENERIC_TOKENS = new Set([
  "team","teams","process","processes","system","systems","data","work","business","project","projects",
  "function","functions","area","areas","role","roles","group","groups","activity","activities","person","persons",
  "equipe","equipes","équipe","équipes","processus","systeme","systemes","système","systèmes",
  "projet","projets","fonction","fonctions","groupe","groupes","activite","activites","activité","activités",
  "personne","personnes",
]);

const FUNCTION_STOP_WORDS = new Set([
  "with","from","into","during","through","over","under","upon","between","among","within","without",
  "about","after","before","across","around","toward","towards","such","than","then","this","that",
  "their","they","them","your","our","have","been","were","will","would","could","should",
  "dans","pour","avec","leur","leurs","sans","sous","entre","parmi","chez","vers","depuis","après",
  "avant","pendant","durant","selon","comme","cette","cette","ceux","elles","elle","nous","vous",
]);

const BROAD_OBJECT_MODIFIERS = new Set([
  "commercial","customer","digital","enterprise","financial","global","international",
  "market","operational","performance","product","regional","risk","service","strategic","technical",
]);

function normalizeClaimToken(value: string): string {
  const token = value.normalize("NFKC").toLowerCase();
  const aliases: Record<string,string> = {
    managed:"lead",manage:"lead",managing:"lead",led:"lead",leadership:"lead",
    group:"team",groups:"team",team:"team",teams:"team",
    engineering:"engineer",engineers:"engineer",
    five:"5",four:"4",three:"3",two:"2",one:"1",
  };
  return aliases[token] ?? token;
}

function tokens(value: string): Set<string> {
  const rawTokens = value.normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  return new Set(
    rawTokens
      .map((raw) => ({
        raw,
        normalized: normalizeClaimToken(raw),
      }))
      .filter(({ raw, normalized }) => {
        const isNumeric = /^\d+$/.test(normalized);
        const isShortProfessionalToken = /^[A-Z0-9]{2,}$/.test(raw);
        const isStandardToken = normalized.length >= 4;

        return (isStandardToken || isNumeric || isShortProfessionalToken)
          && !GENERIC_TOKENS.has(normalized)
          && !FUNCTION_STOP_WORDS.has(normalized);
      })
      .map(({ normalized }) => normalized),
  );
}

function overlapCount(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

function overlap(a: string, b: string): boolean {
  return overlapCount(a, b) >= 1;
}

function objectOverlap(a: string, b: string): boolean {
  const left = tokens(a);
  const right = tokens(b);
  for (const token of left) {
    if (right.has(token) && !BROAD_OBJECT_MODIFIERS.has(token)) return true;
  }
  return false;
}

export function diagnosticSignalOverlap(a: string, b: string): boolean {
  return overlap(a, b);
}

export function diagnosticSharedObjectWords(a: string, b: string): string[] {
  const left = tokens(a);
  const right = tokens(b);
  return [...left].filter((token) => right.has(token) && !BROAD_OBJECT_MODIFIERS.has(token)).sort();
}

function claimTokens(ledger: EvidenceLedger, atom: AtomicEvidence): Set<string> {
  const span = spanFor(ledger, atom);
  return tokens([
    atom.action.normalized_action,
    atom.action.object,
    atom.context.domain ?? "",
    ...(atom.context.tools_or_systems ?? []),
    ...(atom.context.standards ?? []),
    atom.scale.quantity ?? "",
    atom.scale.scope ?? "",
    span?.text ?? "",
  ].join(" "));
}

function semanticDuplicate(
  ledger: EvidenceLedger,
  a: AtomicEvidence,
  b: AtomicEvidence,
): boolean {
  const actionMatches =
    normalizeClaimToken(a.action.normalized_action) ===
    normalizeClaimToken(b.action.normalized_action);

  if (!actionMatches) return false;

  const leftObject = tokens(a.action.object);
  const rightObject = tokens(b.action.object);

  if (!leftObject.size || !rightObject.size) return false;

  const objectShared = [...leftObject].filter((token) =>
    rightObject.has(token),
  ).length;

  const objectSimilarity =
    objectShared / Math.max(leftObject.size, rightObject.size);

  if (objectSimilarity < 0.8) return false;

  const leftSpan = spanFor(ledger, a);
  const rightSpan = spanFor(ledger, b);

  if (!leftSpan || !rightSpan) return false;

  const leftSource = tokens(leftSpan.text);
  const rightSource = tokens(rightSpan.text);

  if (!leftSource.size || !rightSource.size) return false;

  const sourceShared = [...leftSource].filter((token) =>
    rightSource.has(token),
  ).length;

  const sourceSimilarity =
    sourceShared / Math.max(leftSource.size, rightSource.size);

  return sourceSimilarity >= 0.8;
}
function contradictionKey(atom: AtomicEvidence): string {
  return [
    atom.action.normalized_action,
    atom.action.object,
    atom.context.domain ?? "",
    atom.context.jurisdiction ?? "",
  ].join("|").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function affirmativeAtoms(ledger: EvidenceLedger): AtomicEvidence[] {
  const contradictoryKeys = new Set(
    ledger.evidence
      .filter((atom) => atom.assertion.polarity === "NEGATED")
      .map(contradictionKey)
      .filter(Boolean),
  );
  return ledger.evidence
    .filter((atom) => atom.assertion.polarity === "AFFIRMATIVE")
    .filter((atom) => !contradictoryKeys.has(contradictionKey(atom)))
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

function ownershipCompatible(a: AtomicEvidence, b: AtomicEvidence): boolean {
  return a.subject.ownership === b.subject.ownership;
}

function independentAtoms(ledger: EvidenceLedger): AtomicEvidence[] {
  return d15EligibleIndependentAtoms(ledger);
}

function connection(a: AtomicEvidence, b: AtomicEvidence): CareerThread["connection_reason"] | null {
  if (!ownershipCompatible(a, b)) return null;
  if (objectOverlap(a.action.object, b.action.object)) return "SHARED_OBJECT";
  if (a.context.domain && b.context.domain && overlap(a.context.domain, b.context.domain)) return "SHARED_DOMAIN";
  if (a.context.tools_or_systems?.some((x) => b.context.tools_or_systems?.some((y) => overlap(x, y)))) return "SHARED_TOOL";
  if (a.context.standards?.some((x) => b.context.standards?.some((y) => overlap(x, y)))) return "SHARED_STANDARD";
  if (overlap(a.action.normalized_action, b.action.normalized_action) && a.context.domain && b.context.domain && overlap(a.context.domain, b.context.domain)) return "REPEATED_ACTION";
  return null;
}

export function diagnosticConnectionReason(
  a: AtomicEvidence,
  b: AtomicEvidence,
): CareerThread["connection_reason"] | null {
  return connection(a, b);
}

export type ProfessionalMirrorConnectionDiagnostic = {
  atoms: Array<{
    id:string;
    source_span_id:string;
    ownership:AtomicEvidence["subject"]["ownership"];
  }>;
  pairs:Array<{
    left_id:string;
    right_id:string;
    connection_reason:CareerThread["connection_reason"]|null;
    shared_object:boolean;
    shared_domain:boolean;
    shared_tool:boolean;
    shared_standard:boolean;
    repeated_action_with_shared_domain:boolean;
  }>;
};

export function assertProfessionalMirrorConnectionDiagnosticsMatchProduction(
  ledger: EvidenceLedger,
  diagnostics: ProfessionalMirrorConnectionDiagnostic,
): void {
  const atoms = independentAtoms(ledger);
  assertDiagnosticInvariant(diagnostics, atoms, ledger);
}

function optionalOverlap(a: string | undefined, b: string | undefined): boolean {
  return Boolean(a && b && overlap(a, b));
}

function assertDiagnosticInvariant(
  diagnostics: ProfessionalMirrorConnectionDiagnostic,
  atoms: AtomicEvidence[],
  ledger: EvidenceLedger,
): void {
  const expectedAtoms = atoms.map((atom) => ({
    id: atom.id,
    source_span_id: atom.source_span_id,
    ownership: atom.subject.ownership,
  }));

  if (JSON.stringify(diagnostics.atoms) !== JSON.stringify(expectedAtoms)) {
    throw new Error("D15 diagnostic invariant failed: atom population/order differs from production independentAtoms().");
  }

  const expectedPairs: ProfessionalMirrorConnectionDiagnostic["pairs"] = [];
  for (let i = 0; i < atoms.length; i += 1) {
    for (let j = i + 1; j < atoms.length; j += 1) {
      expectedPairs.push({
        left_id: atoms[i].id,
        right_id: atoms[j].id,
        connection_reason:
          atoms[i].source_span_id && atoms[j].source_span_id &&
          [spanFor(ledger, atoms[i])?.source_section, spanFor(ledger, atoms[j])?.source_section]
            .includes("EXPERIENCE_NON_BULLET")
            ? null
            : connection(atoms[i], atoms[j]),
        shared_object: Boolean(atoms[i].action.object && atoms[j].action.object && overlap(atoms[i].action.object, atoms[j].action.object)),
        shared_domain: Boolean(atoms[i].context.domain && atoms[j].context.domain && optionalOverlap(atoms[i].context.domain, atoms[j].context.domain)),
        shared_tool: Boolean(atoms[i].context.tools_or_systems?.some((x) => atoms[j].context.tools_or_systems?.some((y) => overlap(x, y)))),
        shared_standard: Boolean(atoms[i].context.standards?.some((x) => atoms[j].context.standards?.some((y) => overlap(x, y)))),
        repeated_action_with_shared_domain: Boolean(overlap(atoms[i].action.normalized_action, atoms[j].action.normalized_action) && atoms[i].context.domain && atoms[j].context.domain && optionalOverlap(atoms[i].context.domain, atoms[j].context.domain)),
      });
    }
  }

  if (JSON.stringify(diagnostics.pairs) !== JSON.stringify(expectedPairs)) {
    throw new Error("D15 diagnostic invariant failed: pair population/order/signals/reasons differ from production connection().");
  }
}

export function diagnoseProfessionalMirrorConnections(ledger: EvidenceLedger): ProfessionalMirrorConnectionDiagnostic {
  const atoms=independentAtoms(ledger);
  const diagnostics={
    atoms:atoms.map(atom=>({
      id:atom.id,
      source_span_id:atom.source_span_id,
      ownership:atom.subject.ownership,
    })),
    pairs:[],
  } as ProfessionalMirrorConnectionDiagnostic;

  // Signal fields are descriptive and independently evaluated. They may report
  // multiple true mechanisms for one pair. They do not determine connection_reason;
  // that remains exclusively the production oracle above.
  for(let i=0;i<atoms.length;i+=1) for(let j=i+1;j<atoms.length;j+=1){
    const left=atoms[i],right=atoms[j];
    diagnostics.pairs.push({
      left_id:left.id,
      right_id:right.id,
      connection_reason:
        [spanFor(ledger, left)?.source_section, spanFor(ledger, right)?.source_section]
          .includes("EXPERIENCE_NON_BULLET")
          ? null
          : diagnosticConnectionReason(left,right),
      shared_object:Boolean(left.action.object && right.action.object && diagnosticSignalOverlap(left.action.object,right.action.object)),
      shared_domain:Boolean(left.context.domain&&right.context.domain&&diagnosticSignalOverlap(left.context.domain,right.context.domain)),
      shared_tool:Boolean(left.context.tools_or_systems?.some(x=>right.context.tools_or_systems?.some(y=>diagnosticSignalOverlap(x,y)))),
      shared_standard:Boolean(left.context.standards?.some(x=>right.context.standards?.some(y=>diagnosticSignalOverlap(x,y)))),
      repeated_action_with_shared_domain:Boolean(diagnosticSignalOverlap(left.action.normalized_action,right.action.normalized_action)&&left.context.domain&&right.context.domain&&diagnosticSignalOverlap(left.context.domain,right.context.domain)),
    });
  }
  return diagnostics;
}

function maturityForCanonicalContext(provenContextCount: number): MirrorMaturity {
  // D15-A fail-closed rule: canonical evidence currently carries no role/employer
  // context identifier. Source-span count is not a proxy for career-context count.
  // Until canonical role context exists, a supported thread is capped at Emerging.
  if (provenContextCount >= 3) return "SUSTAINED_STRENGTH";
  if (provenContextCount === 2) return "SUPPORTED_CONCLUSION";
  if (provenContextCount === 1) return "EMERGING_PATTERN";
  return "INSUFFICIENT_EVIDENCE";
}

function threadTruthScaffolding(
  atoms: AtomicEvidence[],
  evidenceIds: string[],
): Pick<CareerThread, "maturity" | "maturity_basis" | "not_said_yet"> {
  const evidence = evidenceIds
    .map((id) => atoms.find((atom) => atom.id === id))
    .filter((atom): atom is AtomicEvidence => Boolean(atom));
  const sourceSpanIds = [...new Set(evidence.map((atom) => atom.source_span_id))].sort();

  // No canonical role/employer context exists yet. Fail closed to one context for
  // any supported thread; do not infer role blocks inside D15.
  const provenContextCount = evidence.length > 0 ? 1 : 0;
  const maturity = maturityForCanonicalContext(provenContextCount);

  const gaps: MirrorNotSaidYet[] = [];
  const addGap = (dimension: MirrorGapDimension) => gaps.push({
    dimension,
    evidence_ids: [...evidenceIds].sort(),
    source_span_ids: [...sourceSpanIds],
  });

  if (!evidence.some((atom) => Boolean(atom.outcome?.trim()))) addGap("OUTCOME");
  if (!evidence.some((atom) =>
    Boolean(atom.scale.quantity?.trim()) ||
    Boolean(atom.scale.currency?.trim()) ||
    typeof atom.scale.team_size === "number" ||
    Boolean(atom.scale.scope?.trim()),
  )) addGap("SCALE");
  if (!evidence.some((atom) =>
    Boolean(atom.time.start?.trim()) ||
    Boolean(atom.time.end?.trim()) ||
    Boolean(atom.time.recency?.trim()),
  )) addGap("TIMING");

  return {
    maturity,
    maturity_basis: {
      proven_context_count: provenContextCount,
      context_status: "CANONICAL_ROLE_CONTEXT_UNAVAILABLE",
      evidence_ids: [...evidenceIds].sort(),
      source_span_ids: [...sourceSpanIds],
    },
    not_said_yet: gaps,
  };
}

function safeLabel(atom: AtomicEvidence): string {
  const ownership =
    atom.subject.ownership === "INDIVIDUAL" ? "Personally" :
    atom.subject.ownership === "TEAM" ? "As a team" :
    atom.subject.ownership === "SHARED" ? "Shared ownership" :
    atom.subject.ownership === "SUPERVISED" ? "Under supervision" : "";
  return [ownership, atom.action.normalized_action, atom.action.object].filter(Boolean).join(" ").trim();
}

function buildThreads(ledger: EvidenceLedger, atoms: AtomicEvidence[]): CareerThread[] {
  const adjacency = new Map<string, Array<{ id: string; reason: CareerThread["connection_reason"] }>>();
  for (const atom of atoms) adjacency.set(atom.id, []);

  for (let i = 0; i < atoms.length; i += 1) {
    for (let j = i + 1; j < atoms.length; j += 1) {
      const leftSpan = spanFor(ledger, atoms[i]);
      const rightSpan = spanFor(ledger, atoms[j]);
      if (
        leftSpan?.source_section === "EXPERIENCE_NON_BULLET" ||
        rightSpan?.source_section === "EXPERIENCE_NON_BULLET"
      ) continue;

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

    const evidenceIds = [...component].sort();
    const truthScaffolding = threadTruthScaffolding(atoms, evidenceIds);
    threads.push({
      id: `THREAD-${component.sort().join("-")}`,
      label,
      evidence_ids: evidenceIds,
      connection_reason: bestReason,
      ...truthScaffolding,
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

  // Role-overview lines remain canonical evidence/facts for traceability, but do not
  // participate in D15 thread construction or maturity.
  const threadAtoms = d15ThreadEligibleAtoms(ledger, atoms);
  const threads = buildThreads(ledger, threadAtoms);
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
      maturity: thread.maturity,
    });

    // D15-A deliberately suppresses sustained-strength interpretation language
    // while canonical role context is unavailable. Multiple lines are not proof
    // of multiple career contexts.
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
    const expectedMaturity =
      statement.kind === "FACT"
        ? "EMERGING_PATTERN"
        : maturityForCanonicalContext(statement.evidence_ids.length > 0 ? 1 : 0);
    if (statement.maturity !== expectedMaturity) {
      errors.push(`D15 ${statement.id} maturity exceeds the proven canonical career-context evidence.`);
    }
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

    const expectedScaffolding = threadTruthScaffolding(independentAtoms(ledger), thread.evidence_ids);
    if (thread.maturity !== expectedScaffolding.maturity) {
      errors.push(`D15 thread ${thread.id} maturity exceeds the proven canonical career-context evidence.`);
    }
    if (JSON.stringify(thread.maturity_basis) !== JSON.stringify(expectedScaffolding.maturity_basis)) {
      errors.push(`D15 thread ${thread.id} maturity provenance does not match canonical evidence.`);
    }
    if (JSON.stringify(thread.not_said_yet) !== JSON.stringify(expectedScaffolding.not_said_yet)) {
      errors.push(`D15 thread ${thread.id} Not Said Yet gaps do not match canonical evidence.`);
    }
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
