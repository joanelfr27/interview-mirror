export type CanonicalMirrorSnapshot = {
  id?: string;
  session_id: string;
  schema_version: string;
  source_update_ids: string[];
  mirror_payload: Record<string, unknown>;
  created_at?: string;
};

export function validateCanonicalMirrorSnapshot(
  snapshot: CanonicalMirrorSnapshot,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!snapshot.session_id.trim()) errors.push("D9 session_id is required.");
  if (!snapshot.schema_version.trim()) errors.push("D9 schema_version is required.");
  if (!Array.isArray(snapshot.source_update_ids)) errors.push("D9 source_update_ids must be an array.");
  if (new Set(snapshot.source_update_ids).size !== snapshot.source_update_ids.length) errors.push("D9 source_update_ids must be unique.");
  if (!snapshot.mirror_payload || typeof snapshot.mirror_payload !== "object" || Array.isArray(snapshot.mirror_payload)) {
    errors.push("D9 mirror_payload must be an object.");
  }
  return { valid: errors.length === 0, errors };
}
