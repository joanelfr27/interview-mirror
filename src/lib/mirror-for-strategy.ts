import type { MirrorMaturity } from "@/lib/professional-mirror";

export type MirrorCompletionState =
  | "COMPLETED_WITH_THREADS"
  | "COMPLETED_NO_QUALIFYING_RELATIONSHIP"
  | "ALL_REJECTED"
  | "ERROR";

export type MirrorConfirmationStatus =
  | "UNCONFIRMED"
  | "CONFIRMED"
  | "CORRECTED";

export type MirrorForStrategy = {
  version: "mirror-for-strategy-v1";
  completion_state: MirrorCompletionState;
  threads: Array<{
    thread_id: string;
    headline: string;
    cited_atom_ids: string[];
    maturity: MirrorMaturity;
    question_back: string;
    confirmation_status: MirrorConfirmationStatus;
  }>;
  not_said_yet: Array<{
    type: "OUTCOME" | "SCALE" | "TIMING";
    cited_atom_ids: string[];
    question_back: string;
  }>;
  cv_question_back: string | null;
};

/**
 * D15 -> D16 invariant:
 * - threads organize strategy;
 * - cited canonical atoms carry proof;
 * - confirmation never upgrades generated interpretation into evidence;
 * - question-back answers become proof only after ingestion through the
 *   canonical elicited-evidence boundary.
 */
export function validateMirrorForStrategy(mirror: MirrorForStrategy): string[] {
  const errors: string[] = [];
  const noRelationship = mirror.completion_state === "COMPLETED_NO_QUALIFYING_RELATIONSHIP";

  if (noRelationship) {
    if (mirror.threads.length !== 0) errors.push("no-relationship state cannot contain threads");
    if (!mirror.cv_question_back?.trim()) errors.push("no-relationship state requires cv_question_back");
  } else if (mirror.cv_question_back !== null) {
    errors.push("cv_question_back is allowed only for completed no-relationship state");
  }

  if (mirror.completion_state === "COMPLETED_WITH_THREADS" && mirror.threads.length === 0) {
    errors.push("completed-with-threads state requires at least one thread");
  }

  if ((mirror.completion_state === "ALL_REJECTED" || mirror.completion_state === "ERROR") && mirror.threads.length !== 0) {
    errors.push("failed completion states cannot expose accepted threads");
  }

  for (const thread of mirror.threads) {
    if (!thread.question_back.trim()) errors.push(`thread ${thread.thread_id} requires question_back`);
    if (thread.cited_atom_ids.length === 0) errors.push(`thread ${thread.thread_id} requires cited atoms`);
  }
  return errors;
}
