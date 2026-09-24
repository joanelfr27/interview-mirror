export type CanonicalResearchEventName =
  | "FIT_GAP_VIEWED"
  | "PREPARATION_ROUTE_SELECTED"
  | "PROBE_ROUTE_SELECTED"
  | "CANDIDATE_EVIDENCE_CAPTURED"
  | "FEEDBACK_MIRROR_UPDATED"
  | "CANONICAL_VALIDATION_FAILED";

export type CanonicalResearchEvent = {
  event_id: string;
  session_id: string;
  event_name: CanonicalResearchEventName;
  occurred_at: string;
  requirement_id?: string;
  route_mode?: string;
  preparation_state?: string;
  probe_mode?: string;
  source_update_id?: string;
  validation_error_count?: number;
};

const ROUTE_MODES = new Set(["DIRECT","TRANSFERABLE","VERIFY_GAP"]);
const PREPARATION_STATES = new Set(["READY_TO_DEMONSTRATE","PREPARE_TRANSFER","VERIFY_BEFORE_INTERVIEW","PREPARE_PARTIAL","DEFEND_BOUNDARY","ELICIT_AND_CLARIFY"]);
const PROBE_MODES = new Set(["DEMONSTRATION","TRANSFER","PARTIAL","GAP_VERIFICATION","BOUNDARY","ELICITATION"]);

export function validateCanonicalResearchEvent(
  event: CanonicalResearchEvent,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!event.event_id.trim()) errors.push("D10 event_id is required.");
  if (!event.session_id.trim()) errors.push("D10 session_id is required.");
  if (!event.occurred_at.trim()) errors.push("D10 occurred_at is required.");
  if (!["FIT_GAP_VIEWED","PREPARATION_ROUTE_SELECTED","PROBE_ROUTE_SELECTED","CANDIDATE_EVIDENCE_CAPTURED","FEEDBACK_MIRROR_UPDATED","CANONICAL_VALIDATION_FAILED"].includes(event.event_name)) errors.push("D10 event_name is invalid.");
  if (event.route_mode !== undefined && !ROUTE_MODES.has(event.route_mode)) errors.push("D10 route_mode is invalid.");
  if (event.preparation_state !== undefined && !PREPARATION_STATES.has(event.preparation_state)) errors.push("D10 preparation_state is invalid.");
  if (event.probe_mode !== undefined && !PROBE_MODES.has(event.probe_mode)) errors.push("D10 probe_mode is invalid.");
  if (event.event_name === "CANONICAL_VALIDATION_FAILED" &&
      (!Number.isInteger(event.validation_error_count) || event.validation_error_count! < 1)) {
    errors.push("D10 validation failure events require a positive error count.");
  }
  if (event.event_name === "PROBE_ROUTE_SELECTED" && !event.probe_mode) {
    errors.push("D10 probe route events require probe_mode.");
  }
  if (event.event_name === "PREPARATION_ROUTE_SELECTED" && !event.preparation_state) {
    errors.push("D10 preparation route events require preparation_state.");
  }
  return { valid: errors.length === 0, errors };
}
