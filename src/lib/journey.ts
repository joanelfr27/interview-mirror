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
