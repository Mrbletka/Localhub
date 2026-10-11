// Every tuning number in one place. Rates are per real hour.

export const BALANCE = {
  stepMs: 15_000,
  /** Units a working settler gathers per hour before multipliers. */
  gatherPerHour: 60,
  /** Fish eaten per hour by an adult (children eat half). */
  eatPerHour: 6,
  /** Yield bonus per skill level above 1. */
  skillYieldPerLevel: 0.08,
  /** Yield bonus per level of the job's building. */
  buildingYieldPerLevel: 0.15,
  /** Base work-minutes per real minute on construction; each builder adds this much again. */
  buildRate: 1,
  storageBase: 500,
  storageGrowth: 2.4,
  offlineCapBaseHours: 4,
  offlineCapPerStorehouse: 4,
  bedsBase: 3,
  bedsPerHouse: 3,
  jobSlotsBase: 2,
  jobSlotsPerLevel: 2,
  /** Hours for a new settler to arrive, per settler already living there. */
  arrivalHoursPerSettler: 0.1,
  childGrowsUpHours: 12,
  pairUpPerHour: 0.15,
  babyPerHour: 0.06,
  moodDriftPerHour: 12,
  /** Danger events only start once the colony has this many settlers. */
  dangerGraceSettlers: 4,
  leaveAfterMiseryHours: 3,
  /** Mayor XP needed for the next level: base * level^exp. */
  mayorXpBase: 400,
  mayorXpExp: 1.4,
  skillXpBase: 200,
  skillXpExp: 2.1,
  maxChronicle: 40,
  maxMayors: 4,
} as const;

export function skillXpNeeded(level: number): number {
  return Math.round(BALANCE.skillXpBase * Math.pow(level, BALANCE.skillXpExp));
}

export function mayorXpNeeded(level: number): number {
  return Math.round(BALANCE.mayorXpBase * Math.pow(level, BALANCE.mayorXpExp));
}
