export const JOURNEYS = [
  "new_upcoming",
  "new_skills",
  "continue_upcoming",
  "new_opportunity",
  "continue_skills",
] as const;

export type Journey = (typeof JOURNEYS)[number];

export function isJourney(value: string | null | undefined): value is Journey {
  return typeof value === "string" && (JOURNEYS as readonly string[]).includes(value);
}

export type PreparationPurpose = "upcoming_interview" | "improve_skills";

export function purposeForJourney(journey: Journey): PreparationPurpose {
  return journey === "new_skills" || journey === "continue_skills"
    ? "improve_skills"
    : "upcoming_interview";
}

export function isContinuationJourney(journey: Journey): boolean {
  return journey === "continue_upcoming" || journey === "continue_skills";
}

export function isNewJourney(journey: Journey): boolean {
  return journey === "new_upcoming" || journey === "new_skills" || journey === "new_opportunity";
}

export function canonicalizeJourneyText(value: string): string {
  return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function canonicalizeJourneyText(value: string): string {
  return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function continuationInputsChanged(
  existingCv: string,
  existingJd: string,
  nextCv: string,
  nextJd: string,
): boolean {
  return canonicalizeJourneyText(existingCv) !== canonicalizeJourneyText(nextCv)
    || canonicalizeJourneyText(existingJd) !== canonicalizeJourneyText(nextJd);
}

export function isResumableSessionStatus(status: string | null | undefined): boolean {
  return status !== "completed";
}

export function continuationResetState(
  existingStatus: string,
  inputsChanged: boolean,
): { status: string; resetStrategy: boolean; resetQuestions: boolean } {
  return {
    status: inputsChanged ? "analyzed" : existingStatus,
    resetStrategy: inputsChanged,
    resetQuestions: inputsChanged,
  };
}
