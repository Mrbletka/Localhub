import type { Anchor, JobId, Settler, Tone } from '../core/types';
import type { SimCtx } from '../sim/ctx';
import { TRAITS } from './traits';
import { BALANCE } from './balance';
import { defense } from '../sim/derived';

// Story events: the "Since you left" engine. Add a new one by appending to
// STORY_EVENTS; the sim rolls every entry each step.

export interface StoryEvent {
  id: string;
  tone: Tone;
  anchor: Anchor;
  danger?: boolean;
  /** Chance per hour; return 0 when the event can't happen right now. */
  perHour(x: SimCtx): number;
  /** Applies the event and returns the chronicle line, or null to skip. */
  run(x: SimCtx): { title: string; detail: string } | null;
}

const HOUR = 3_600_000;

function luckOf(x: SimCtx, job: JobId): number {
  return x.workers(job).some((s) => s.traits.some((t) => TRAITS[t]?.luck)) ? 2 : 1;
}

function hurt(x: SimCtx, pool: Settler[], hours: number): Settler | undefined {
  if (!pool.length) return undefined;
  // Hardy settlers are less likely to be the one who gets hurt.
  const weighted = pool.map((s) => ({ s, w: s.traits.reduce((w, t) => w * (TRAITS[t]?.hurtChance ?? 1), 1) }));
  let roll = x.rng.next() * weighted.reduce((a, b) => a + b.w, 0);
  for (const { s, w } of weighted) {
    roll -= w;
    if (roll <= 0) {
      s.injuredUntil = x.now + hours * HOUR;
      return s;
    }
  }
  return undefined;
}

/** Danger events can be repelled by defense; returns true when the guards won. */
function repelled(x: SimCtx, what: string, anchor: Anchor): boolean {
  const d = defense(x.c, x.now);
  if (d > 0 && x.rng.chance(d / (d + 3))) {
    x.c.stats.raids++;
    x.grant({ xp: 30, coins: 25 });
    x.log('good', `Guards drove off ${what}`, `${anchorName(anchor)} · nobody hurt · +25 coins`, anchor);
    return true;
  }
  return false;
}

export function anchorName(a: Anchor): string {
  return { forest: 'Forest', quarry: 'Quarry', dock: 'Dock', rathouse: 'Rathouse', houses: 'Houses', storehouse: 'Storehouse' }[a];
}

const dangerScale = (x: SimCtx) =>
  x.c.settlers.length < BALANCE.dangerGraceSettlers ? 0 : (x.season.danger ?? 1);

export const STORY_EVENTS: StoryEvent[] = [
  {
    id: 'diamond_vein', tone: 'good', anchor: 'quarry',
    perHour: (x) => (x.workers('miner').length ? 0.05 * luckOf(x, 'miner') : 0),
    run(x) {
      const n = x.add('stone', x.rng.int(30, 60));
      x.grant({ acorns: 2, xp: 40 });
      return { title: 'Miners struck a diamond vein', detail: `Quarry · +${n} stone · +2 acorns` };
    },
  },
  {
    id: 'big_catch', tone: 'good', anchor: 'dock',
    perHour: (x) => (x.workers('fisher').length ? 0.07 * luckOf(x, 'fisher') : 0),
    run(x) {
      const who = x.rng.pick(x.workers('fisher'));
      const n = x.add('fish', x.rng.int(25, 45));
      x.grant({ xp: 25 });
      return { title: `${who.name} landed a huge catch`, detail: `Dock · +${n} fish` };
    },
  },
  {
    id: 'golden_oak', tone: 'good', anchor: 'forest',
    perHour: (x) => (x.workers('lumberjack').length ? 0.05 * luckOf(x, 'lumberjack') : 0),
    run(x) {
      const n = x.add('wood', x.rng.int(40, 70));
      x.grant({ coins: 40, xp: 25 });
      return { title: 'Lumberjacks felled an ancient oak', detail: `Forest · +${n} wood · +40 coins` };
    },
  },
  {
    id: 'merchant', tone: 'good', anchor: 'rathouse',
    perHour: (x) => (x.c.buildings.rathouse >= 2 ? 0.03 : 0),
    run(x) {
      x.grant({ coins: 120, acorns: 1, xp: 20 });
      return { title: 'A travelling merchant paid a visit', detail: 'Rathouse · +120 coins · +1 acorn' };
    },
  },
  {
    id: 'festival', tone: 'life', anchor: 'rathouse',
    perHour: (x) => {
      const avg = x.c.settlers.reduce((a, s) => a + s.mood, 0) / Math.max(1, x.c.settlers.length);
      return x.c.buildings.rathouse >= 2 && avg >= 70 && x.c.settlers.length >= 5 ? 0.04 : 0;
    },
    run(x) {
      for (const s of x.c.settlers) s.mood = Math.min(100, s.mood + 15);
      x.grant({ xp: 60 });
      return { title: 'The settlers threw a harvest festival', detail: 'Rathouse · everyone +15 mood' };
    },
  },
  {
    id: 'drowned_raid', tone: 'danger', anchor: 'dock', danger: true,
    perHour: (x) => (x.workers('fisher').length ? 0.06 * dangerScale(x) : 0),
    run(x) {
      if (repelled(x, 'the Drowned', 'dock')) return null;
      x.c.stats.raids++;
      const lost = x.take('fish', Math.floor(x.c.storage.fish * x.rng.int(20, 40) / 100));
      const who = hurt(x, x.workers('fisher'), 2);
      x.modify('nets_broken', 'Nets broken', 'fish', 0.5, 2);
      return {
        title: 'Drowned raided the dock',
        detail: `Dock · ${who ? `${who.name} hurt, ` : ''}nets broken · -${lost} fish`,
      };
    },
  },
  {
    id: 'zombie_night', tone: 'danger', anchor: 'houses', danger: true,
    perHour: (x) => 0.05 * dangerScale(x),
    run(x) {
      if (repelled(x, 'a zombie horde', 'houses')) return null;
      x.c.stats.raids++;
      const lost = x.take('wood', Math.floor(x.c.storage.wood * x.rng.int(10, 20) / 100));
      const who = hurt(x, x.c.settlers.filter((s) => s.stage === 'adult'), 3);
      return {
        title: 'Zombies broke into the houses',
        detail: `Houses · ${who ? `${who.name} hurt, ` : ''}-${lost} wood`,
      };
    },
  },
  {
    id: 'rockslide', tone: 'danger', anchor: 'quarry', danger: true,
    perHour: (x) => (x.workers('miner').length >= 2 ? 0.03 * dangerScale(x) : 0),
    run(x) {
      const who = hurt(x, x.workers('miner'), 2);
      x.modify('rockslide', 'Rockslide', 'stone', 0.6, 1.5);
      return { title: 'A rockslide hit the quarry', detail: `Quarry · ${who ? `${who.name} hurt · ` : ''}stone -40% for a while` };
    },
  },
  {
    id: 'storm', tone: 'danger', anchor: 'dock', danger: true,
    perHour: (x) => (x.workers('fisher').length ? 0.03 * dangerScale(x) : 0),
    run(x) {
      x.modify('storm', 'Storm', 'fish', 0.6, 2);
      return { title: 'A storm rolled in from the sea', detail: 'Dock · fishing -40% for 2h' };
    },
  },
];
