import type { Colony, JobId, ResourceId, Settler } from '../core/types';
import { BALANCE } from '../content/balance';
import { JOBS } from '../content/jobs';
import { TRAITS } from '../content/traits';
import { biome } from '../content/names';
import { seasonAt } from '../content/calendar';
import { RESOURCE_IDS } from '../content/resources';
import { HOUR } from '../core/time';

// Numbers derived from colony state. The sim and the UI both read these,
// so the "+320/h" a player sees is exactly what the sim does.

export const adults = (c: Colony) => c.settlers.filter((s) => s.stage === 'adult');
export const beds = (c: Colony) => BALANCE.bedsBase + BALANCE.bedsPerHouse * c.buildings.house;
export const freeBeds = (c: Colony) => Math.max(0, beds(c) - c.settlers.length);
export const storageCap = (c: Colony) => Math.round(BALANCE.storageBase * Math.pow(BALANCE.storageGrowth, c.buildings.storehouse));
export const offlineCapMs = (c: Colony) =>
  Math.min(24, BALANCE.offlineCapBaseHours + BALANCE.offlineCapPerStorehouse * c.buildings.storehouse) * HOUR;
export const isInjured = (s: Settler, now: number) => s.injuredUntil > now;
export const canWork = (s: Settler, now: number) => s.stage === 'adult' && !isInjured(s, now);
export const workers = (c: Colony, job: JobId) => c.settlers.filter((s) => s.job === job);
export const idleAdults = (c: Colony) => c.settlers.filter((s) => s.stage === 'adult' && s.job === 'idle');

export function jobUnlocked(c: Colony, job: JobId): boolean {
  return c.buildings.rathouse >= JOBS[job].unlockRathouse;
}

export function jobSlots(c: Colony, job: JobId): number {
  if (job === 'idle') return Infinity;
  if (!jobUnlocked(c, job)) return 0;
  if (job === 'builder') return Math.max(0, c.buildings.rathouse - 1);
  if (job === 'guard') return 2 * c.buildings.watchtower;
  const b = JOBS[job].building;
  return BALANCE.jobSlotsBase + BALANCE.jobSlotsPerLevel * (b ? c.buildings[b] : 0);
}

export function defense(c: Colony, now: number): number {
  let d = 2 * c.buildings.watchtower;
  for (const s of workers(c, 'guard')) {
    if (!canWork(s, now)) continue;
    d += 1;
    for (const t of s.traits) d += TRAITS[t]?.defense ?? 0;
  }
  return d;
}

export function moodMult(mood: number): number {
  return 0.6 + mood / 125;
}

/** Units per hour this settler currently gathers (0 if not a gatherer or can't work). */
export function settlerYieldPerHour(c: Colony, s: Settler, now: number): number {
  const job = JOBS[s.job];
  if (!job.produces || !job.skill || !canWork(s, now)) return 0;
  const res = job.produces;
  let y = BALANCE.gatherPerHour;
  y *= 1 + BALANCE.skillYieldPerLevel * (c.skills[job.skill].level - 1);
  if (job.building) y *= 1 + BALANCE.buildingYieldPerLevel * c.buildings[job.building];
  for (const t of s.traits) y *= TRAITS[t]?.yield?.[res] ?? 1;
  y *= moodMult(s.mood);
  y *= seasonAt(now).yield?.[res] ?? 1;
  y *= (biome(c.biome).yield as Partial<Record<ResourceId, number>>)[res] ?? 1;
  for (const m of c.modifiers) if (m.resource === res && m.until > now) y *= m.mult;
  return y;
}

export function eatPerHour(c: Colony): number {
  return c.settlers.reduce((sum, s) => sum + (s.stage === 'adult' ? 1 : 0.5) * BALANCE.eatPerHour, 0);
}

/** Net change per hour for each resource (production minus food). */
export function netPerHour(c: Colony, now: number): Record<ResourceId, number> {
  const out = { wood: 0, stone: 0, fish: 0 } as Record<ResourceId, number>;
  for (const s of c.settlers) {
    const res = JOBS[s.job].produces;
    if (res) out[res] += settlerYieldPerHour(c, s, now);
  }
  out.fish -= eatPerHour(c);
  return out;
}

export function avgMood(c: Colony): number {
  if (!c.settlers.length) return 50;
  return c.settlers.reduce((a, s) => a + s.mood, 0) / c.settlers.length;
}

export function colonyValue(c: Colony): number {
  let v = c.settlers.length * 50;
  for (const lvl of Object.values(c.buildings)) v += lvl * 100;
  for (const r of RESOURCE_IDS) v += Math.floor(c.storage[r] / 10);
  for (const sk of Object.values(c.skills)) v += (sk.level - 1) * 75;
  return v;
}
