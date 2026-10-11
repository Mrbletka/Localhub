import type { BuildingId, Colony, JobId, Settler } from '../core/types';
import type { Rng } from '../core/rng';
import { makeRng } from '../core/rng';
import { FIRST_NAMES } from '../content/names';
import { TRAIT_IDS } from '../content/traits';
import { BUILDING_IDS, BUILDINGS, costEntries } from '../content/buildings';
import { JOB_IDS, JOBS } from '../content/jobs';
import { idleAdults, jobSlots, jobUnlocked, workers } from './derived';

export function createColony(opts: {
  id: string;
  name: string;
  owner: string;
  slot: number;
  biome: string;
  now: number;
  seed: number;
}): Colony {
  const buildings = Object.fromEntries(BUILDING_IDS.map((b) => [b, 0])) as Record<BuildingId, number>;
  const c: Colony = {
    v: 1,
    id: opts.id,
    name: opts.name,
    slot: opts.slot,
    biome: opts.biome,
    founded: opts.now,
    simTime: opts.now,
    rng: opts.seed,
    owner: opts.owner,
    mayors: [opts.owner],
    privacy: 'public',
    storage: { wood: 40, stone: 0, fish: 30 },
    skills: { lumber: { level: 1, xp: 0 }, mining: { level: 1, xp: 0 }, fishing: { level: 1, xp: 0 } },
    settlers: [],
    nextSettlerId: 1,
    buildings,
    modifiers: [],
    chronicle: [],
    nextEntryId: 1,
    arrival: 0,
    hungry: false,
    stats: { produced: { wood: 0, stone: 0, fish: 0 }, births: 0, arrivals: 0, raids: 0, departures: 0 },
    owed: {},
    flags: {},
  };
  const rng = makeRng(c.rng);
  addSettler(c, rng, opts.now, 'adult').job = 'lumberjack';
  addSettler(c, rng, opts.now, 'adult').job = 'fisher';
  c.rng = rng.state();
  return c;
}

export function addSettler(c: Colony, rng: Rng, now: number, stage: Settler['stage'], name?: string): Settler {
  const used = new Set(c.settlers.map((s) => s.name));
  const free = FIRST_NAMES.filter((n) => !used.has(n));
  const traits: string[] = [];
  while (traits.length < 2) {
    const t = rng.pick(TRAIT_IDS);
    if (!traits.includes(t)) traits.push(t);
  }
  const s: Settler = {
    id: c.nextSettlerId++,
    name: name ?? (free.length ? rng.pick(free) : `${rng.pick(FIRST_NAMES)} ${c.nextSettlerId}`),
    skin: rng.int(0, 1),
    born: now,
    stage,
    job: 'idle',
    traits,
    mood: 60,
    injuredUntil: 0,
    misery: 0,
  };
  c.settlers.push(s);
  return s;
}

export function settler(c: Colony, id: number): Settler | undefined {
  return c.settlers.find((s) => s.id === id);
}

export type AssignResult = 'ok' | 'locked' | 'full' | 'child';

export function assignJob(c: Colony, s: Settler, job: JobId): AssignResult {
  if (s.stage !== 'adult') return 'child';
  if (s.job === job) return 'ok';
  if (!jobUnlocked(c, job)) return 'locked';
  if (workers(c, job).length >= jobSlots(c, job)) return 'full';
  s.job = job;
  return 'ok';
}

/** Puts idle adults into the open job with the fewest workers. Food first if the colony is hungry. */
export function autoAssign(c: Colony): number {
  let n = 0;
  for (const s of idleAdults(c)) {
    const open = JOB_IDS.filter((j) => j !== 'idle' && JOBS[j].produces && workers(c, j).length < jobSlots(c, j));
    if (!open.length) break;
    open.sort((a, b) => {
      if (c.hungry) {
        if (a === 'fisher') return -1;
        if (b === 'fisher') return 1;
      }
      return workers(c, a).length - workers(c, b).length;
    });
    s.job = open[0];
    n++;
  }
  return n;
}

export type BuildCheck =
  | { ok: true }
  | { ok: false; reason: 'max' | 'busy' | 'rathouse' | 'cost'; need?: number; missing?: string };

export function canBuild(c: Colony, b: BuildingId, coins: number): BuildCheck {
  const def = BUILDINGS[b];
  const level = c.buildings[b] + 1;
  if (level > def.maxLevel) return { ok: false, reason: 'max' };
  if (c.construction) return { ok: false, reason: 'busy' };
  if (b !== 'rathouse' && c.buildings.rathouse < 1) return { ok: false, reason: 'rathouse', need: 1 };
  const need = def.requires(level);
  if (c.buildings.rathouse < need) return { ok: false, reason: 'rathouse', need };
  for (const [k, n] of costEntries(def.cost(level))) {
    const have = k === 'coins' ? coins : c.storage[k];
    if (have < n) return { ok: false, reason: 'cost', missing: k };
  }
  return { ok: true };
}

/** Pays from storage and starts construction. Coins are paid by the caller (they belong to the Mayor). */
export function startBuild(c: Colony, b: BuildingId): number {
  const def = BUILDINGS[b];
  const level = c.buildings[b] + 1;
  let coins = 0;
  for (const [k, n] of costEntries(def.cost(level))) {
    if (k === 'coins') coins = n;
    else c.storage[k] -= n;
  }
  c.construction = { building: b, toLevel: level, progress: 0, required: def.minutes(level) };
  return coins;
}
