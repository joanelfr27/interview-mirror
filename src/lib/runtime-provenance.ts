const SHA1_PATTERN = /^[0-9a-f]{40}$/;

export function verifyRuntimeCommit(checkedOutSha: string, trustedSha?: string): string {
  if (!SHA1_PATTERN.test(checkedOutSha)) {
    throw new Error("Checked-out runtime commit must be a full immutable SHA.");
  }
  if (trustedSha && (!SHA1_PATTERN.test(trustedSha) || trustedSha !== checkedOutSha)) {
    throw new Error("Checked-out runtime commit does not match the trusted runtime SHA.");
  }
  return checkedOutSha;
}
