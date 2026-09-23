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

export function validateCanonicalResearchEvent(
  event: CanonicalResearchEvent,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!event.event_id.trim()) errors.push("D10 event_id is required.");
  if (!event.session_id.trim()) errors.push("D10 session_id is required.");
  if (!event.occurred_at.trim()) errors.push("D10 occurred_at is required.");
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
