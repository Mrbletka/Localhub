// Pure data shapes. Nothing in core/, content/ or sim/ may import @minecraft/*,
// so the whole simulation can run (and be tested) outside the game.

export type ResourceId = 'wood' | 'stone' | 'fish';
export type SkillId = 'lumber' | 'mining' | 'fishing';
export type JobId = 'idle' | 'lumberjack' | 'miner' | 'fisher' | 'builder' | 'guard';
export type BuildingId =
  | 'rathouse'
  | 'house'
  | 'storehouse'
  | 'lumber_camp'
  | 'quarry'
  | 'dock'
  | 'watchtower'
  | 'market';

/** Island spots the chronicle can point at (pins on the diorama). */
export type Anchor = 'forest' | 'quarry' | 'dock' | 'rathouse' | 'houses' | 'storehouse';

/** Status colours from the UI kit: gold / green / red / orange / plain. */
export type Tone = 'good' | 'life' | 'danger' | 'idle' | 'info';

export type Stockpile = Record<ResourceId, number>;

export interface Settler {
  id: number;
  name: string;
  skin: number;
  /** Sim time of birth/arrival. */
  born: number;
  stage: 'child' | 'adult';
  job: JobId;
  traits: string[];
  mood: number;
  injuredUntil: number;
  partner?: number;
  /** Hours spent miserable; settlers leave when it gets too high. */
  misery: number;
}

export interface Construction {
  building: BuildingId;
  toLevel: number;
  /** Work-minutes done / required. */
  progress: number;
  required: number;
}

/** Temporary multiplier, e.g. "Nets broken: fishing -50% for 2h". */
export interface Modifier {
  id: string;
  label: string;
  resource?: ResourceId;
  mult: number;
  until: number;
}

export interface ChronicleEntry {
  id: number;
  at: number;
  tone: Tone;
  title: string;
  detail: string;
  anchor?: Anchor;
}

export interface Owed {
  coins: number;
  acorns: number;
  xp: number;
}

export interface Colony {
  v: 1;
  id: string;
  name: string;
  slot: number;
  biome: string;
  founded: number;
  /** Everything up to this timestamp has been simulated. */
  simTime: number;
  rng: number;
  owner: string;
  mayors: string[];
  privacy: 'public' | 'private';
  storage: Stockpile;
  skills: Record<SkillId, { level: number; xp: number }>;
  settlers: Settler[];
  nextSettlerId: number;
  buildings: Record<BuildingId, number>;
  construction?: Construction;
  modifiers: Modifier[];
  chronicle: ChronicleEntry[];
  nextEntryId: number;
  /** 0..1 progress towards the next settler arriving. */
  arrival: number;
  hungry: boolean;
  stats: { produced: Stockpile; births: number; arrivals: number; raids: number; departures: number };
  /** Rewards from colony events, paid to each Mayor when they are online. */
  owed: Record<string, Owed>;
  /** One-shot flags so repeating states are only logged once. */
  flags: Record<string, number>;
}

export interface QuestState {
  id: string;
  /** Counter value when the quest was handed out; progress = current - base. */
  base: number;
  claimed: boolean;
}

export interface Profile {
  v: 1;
  id: string;
  name: string;
  colony?: string;
  coins: number;
  acorns: number;
  xp: number;
  level: number;
  prestige: number;
  lastSeen: number;
  daily: { streak: number; lastClaimDay: number };
  quests: { day: number; list: QuestState[] };
  firstSteps: number;
  /** Lifetime counters (logs_chopped, stone_mined, coins_earned, …). Quests read deltas from these. */
  counters: Record<string, number>;
}
