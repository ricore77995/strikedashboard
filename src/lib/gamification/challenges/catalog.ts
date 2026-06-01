/**
 * Weekly challenge catalog. Slice 1 ships the single fully-automatic
 * challenge (Flash Check-in). The pool grows here as more challenges land;
 * rotation.ts picks one per week.
 */
export interface ChallengeDef {
  key: string;
  /** Pt-PT display name (used by the slice-2 UI). */
  name: string;
  points: number;
  winnersMax: number;
}

export const CHALLENGE_CATALOG: ReadonlyArray<ChallengeDef> = [
  { key: "flash_checkin", name: "Flash Check-in", points: 250, winnersMax: 5 },
];

export function getChallenge(key: string): ChallengeDef | undefined {
  return CHALLENGE_CATALOG.find((c) => c.key === key);
}
