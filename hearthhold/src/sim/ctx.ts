import type { Anchor, Colony, JobId, Owed, ResourceId, Settler, Tone } from '../core/types';
import type { Rng } from '../core/rng';
import type { SeasonEvent } from '../content/calendar';
import { BALANCE } from '../content/balance';
import { storageCap } from './derived';

/** What story events and growth rules get to touch. */
export interface SimCtx {
  c: Colony;
  rng: Rng;
  now: number;
  season: SeasonEvent;
  log(tone: Tone, title: string, detail: string, anchor?: Anchor): void;
  /** Gives every Mayor of the colony this reward (scaled by the week's event). */
  grant(r: Partial<Owed>): void;
  /** Adds up to `n` of a resource, respecting the cap. Returns the amount actually added. */
  add(res: ResourceId, n: number): number;
  take(res: ResourceId, n: number): number;
  modify(id: string, label: string, res: ResourceId, mult: number, hours: number): void;
  workers(job: JobId): Settler[];
}

export function makeCtx(c: Colony, rng: Rng, now: number, season: SeasonEvent): SimCtx {
  return {
    c,
    rng,
    now,
    season,
    log(tone, title, detail, anchor) {
      c.chronicle.push({ id: c.nextEntryId++, at: now, tone, title, detail, anchor });
      if (c.chronicle.length > BALANCE.maxChronicle) c.chronicle.splice(0, c.chronicle.length - BALANCE.maxChronicle);
    },
    grant(r) {
      const mult = season.rewards ?? 1;
      for (const id of c.mayors) {
        const o = (c.owed[id] ??= { coins: 0, acorns: 0, xp: 0 });
        o.coins += Math.round((r.coins ?? 0) * mult);
        o.acorns += Math.round((r.acorns ?? 0) * mult);
        o.xp += Math.round(r.xp ?? 0);
      }
    },
    add(res, n) {
      const room = Math.max(0, storageCap(c) - c.storage[res]);
      const added = Math.min(room, n);
      c.storage[res] += added;
      return added;
    },
    take(res, n) {
      const taken = Math.min(c.storage[res], n);
      c.storage[res] -= taken;
      return taken;
    },
    modify(id, label, res, mult, hours) {
      c.modifiers = c.modifiers.filter((m) => m.id !== id);
      c.modifiers.push({ id, label, resource: res, mult, until: now + hours * 3_600_000 });
    },
    workers(job) {
      return c.settlers.filter((s) => s.job === job && s.stage === 'adult' && s.injuredUntil <= now);
    },
  };
}
