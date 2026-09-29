import assert from "node:assert/strict";
import { extractCanonicalShadow } from "@/lib/canonical-shadow-extractor.ts";
import {
  validateAtomicEvidence,
  validateAtomicEvidenceAgainstSource,
} from "@/lib/canonical-evidence-model.ts";
import type { SessionRecord } from "@/types.ts";

type ProbeCase = {
  id: string;
  language: "en" | "fr";
  line: string;
  expectedAtomCount: number;
};

const CASES: ProbeCase[] = [
  {
    id: "elena-booked-maintained",
    language: "en",
    line: "Booked travel and maintained calendars for managers.",
    expectedAtomCount: 2,
  },
  {
    id: "elena-filed-maintained",
    language: "en",
    line: "Filed documents and maintained electronic records.",
    expectedAtomCount: 2,
  },
  {
    id: "elena-office-control",
    language: "en",
    line: "Updated contact information in the office database.",
    expectedAtomCount: 1,
  },
  {
    id: "marie-suivait-organisait",
    language: "fr",
    line: "Suivait les incidents clients et organisait leur résolution avec les équipes concernées.",
    expectedAtomCount: 2,
  },
];

const RUNS_PER_CASE = 3;

function normalizedTokens(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function objectContainsActionToken(action: string, object: string): string[] {
  const actionTokens = normalizedTokens(action);
  const objectTokens = new Set(normalizedTokens(object));
  return actionTokens.filter((token) => token.length >= 3 && objectTokens.has(token));
}

function makeSession(probeCase: ProbeCase, run: number): SessionRecord {
  const now = new Date().toISOString();
  return {
    id: `d15-atomicity-probe-${probeCase.id}-${run}`,
    user_id: "d15-atomicity-probe",
    title: "D15 E1 atomicity probe",
    cv_text: probeCase.line,
    job_description: "",
    cv_analysis: null,
    interview_strategy: null,
    preparation_language: probeCase.language,
    experience_language: probeCase.language,
    interview_language: probeCase.language,
    preparation_purpose: "improve_skills",
    interview_date: null,
    coaching_focus: null,
    status: "analyzed",
    created_at: now,
    updated_at: now,
  };
}

const failures: string[] = [];
const results: Array<Record<string, unknown>> = [];

for (const probeCase of CASES) {
  for (let run = 1; run <= RUNS_PER_CASE; run += 1) {
    const session = makeSession(probeCase, run);
    let extraction;

    try {
      extraction = await extractCanonicalShadow(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${probeCase.id} run ${run}: extractor threw: ${message}`);
      results.push({
        case_id: probeCase.id,
        run,
        expected_atom_count: probeCase.expectedAtomCount,
        atom_count: null,
        rejected_atoms: ["EXTRACTOR_THROW"],
        atoms: [],
        pass: false,
      });
      continue;
    }

    const atoms = extraction.ledger.evidence;
    const sourceById = new Map(extraction.source_spans.map((span) => [span.id, span]));
    const atomRows = atoms.map((atom) => {
      const span = sourceById.get(atom.source_span_id);
      const groundingErrors = span
        ? [
            ...validateAtomicEvidence(atom),
            ...validateAtomicEvidenceAgainstSource(atom, span),
            ...(session.cv_text.includes(span.text) ? [] : ["source quote is not an exact CV substring"]),
          ]
        : ["source span missing"];

      const actionTokensInObject = objectContainsActionToken(
        atom.normalized_action,
        atom.object,
      );

      return {
        atom_id: atom.id,
        source_quote: span?.text ?? null,
        verb: atom.normalized_action,
        object: atom.object,
        grounding: groundingErrors.length === 0 ? "PASS" : "FAIL",
        grounding_errors: groundingErrors,
        action_tokens_found_in_object: actionTokensInObject,
      };
    });

    const atomCountPass = atoms.length === probeCase.expectedAtomCount;
    const rejectionPass = extraction.diagnostics.rejected_atoms.length === 0;
    const groundingPass = atomRows.every((row) => row.grounding === "PASS");
    const atomicityPass = atomRows.every(
      (row) => (row.action_tokens_found_in_object as string[]).length === 0,
    );
    const pass = atomCountPass && rejectionPass && groundingPass && atomicityPass;

    if (!atomCountPass) {
      failures.push(
        `${probeCase.id} run ${run}: expected ${probeCase.expectedAtomCount} atoms, got ${atoms.length}`,
      );
    }
    if (!rejectionPass) {
      failures.push(
        `${probeCase.id} run ${run}: rejected atoms: ${extraction.diagnostics.rejected_atoms.join(", ")}`,
      );
    }
    if (!groundingPass) {
      failures.push(`${probeCase.id} run ${run}: one or more atoms failed grounding`);
    }
    if (!atomicityPass) {
      failures.push(
        `${probeCase.id} run ${run}: object contains action token(s)`,
      );
    }

    results.push({
      case_id: probeCase.id,
      run,
      expected_atom_count: probeCase.expectedAtomCount,
      atom_count: atoms.length,
      rejected_atoms: extraction.diagnostics.rejected_atoms,
      rejection_rate:
        extraction.diagnostics.candidate_atom_count +
          extraction.diagnostics.rejected_atoms.length >
        0
          ? Number(
              (
                extraction.diagnostics.rejected_atoms.length /
                (extraction.diagnostics.candidate_atom_count +
                  extraction.diagnostics.rejected_atoms.length)
              ).toFixed(3),
            )
          : 0,
      atoms: atomRows,
      pass,
    });
  }
}

console.log(JSON.stringify({
  probe: "D15 E1 atomicity",
  frozen_gate: {
    runs_per_case: RUNS_PER_CASE,
    cases: CASES.map(({ id, expectedAtomCount }) => ({ id, expectedAtomCount })),
    required: "3/3 runs per case; exact atom count; exact grounding; zero rejected atoms; no action token in object",
  },
  results,
  failures,
}, null, 2));

if (failures.length > 0) {
  console.error(`D15 atomicity probe FAILED with ${failures.length} finding(s).`);
  process.exitCode = 1;
} else {
  console.log("D15 atomicity probe PASS: all four frozen cases passed 3/3 runs.");
}
