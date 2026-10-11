import type { Colony } from '../core/types';
import { makeRng } from '../core/rng';
import { HOUR, MINUTE, fmtDuration } from '../core/time';
import { BALANCE, skillXpNeeded } from '../content/balance';
import { BUILDINGS } from '../content/buildings';
import { seasonAt } from '../content/calendar';
import { JOBS, SKILL_NAMES } from '../content/jobs';
import { RESOURCES, RESOURCE_IDS } from '../content/resources';
import { STORY_EVENTS } from '../content/events';
import { TRAITS } from '../content/traits';
import { makeCtx, type SimCtx } from './ctx';
import { addSettler, autoAssign } from './colony';
import { canWork, eatPerHour, freeBeds, isInjured, settlerYieldPerHour, storageCap, workers } from './derived';

// One code path for live play and offline catch-up: both just call step() in
// fixed increments. Only the number of steps differs.

const STEP = BALANCE.stepMs;
const DT_H = STEP / HOUR;

export function step(c: Colony): void {
  const now = c.simTime + STEP;
  const rng = makeRng(c.rng);
  const x = makeCtx(c, rng, now, seasonAt(now));

  c.modifiers = c.modifiers.filter((m) => m.until > now);
  produce(x);
  eat(x);
  moods(x);
  construct(x);
  grow(x);
  storyEvents(x);

  c.rng = rng.state();
  c.simTime = now;
}

function produce(x: SimCtx): void {
  const { c, now } = x;
  for (const s of c.settlers) {
    const job = JOBS[s.job];
    if (!job.produces || !job.skill) continue;
    const amount = settlerYieldPerHour(c, s, now) * DT_H;
    if (amount <= 0) continue;
    const added = x.add(job.produces, amount);
    c.stats.produced[job.produces] += added;
    const sk = c.skills[job.skill];
    sk.xp += amount;
    while (sk.xp >= skillXpNeeded(sk.level)) {
      sk.xp -= skillXpNeeded(sk.level);
      sk.level++;
      x.grant({ xp: 50 * sk.level });
      x.log('good', `${SKILL_NAMES[job.skill]} reached Lv ${sk.level}`, `${job.plural} work ${Math.round(BALANCE.skillYieldPerLevel * 100)}% faster`, job.anchor);
    }
  }
  const cap = storageCap(c);
  for (const r of RESOURCE_IDS) {
    const flag = `full_${r}`;
    if (c.storage[r] >= cap && !c.flags[flag]) {
      c.flags[flag] = 1;
      x.log('idle', `Storehouse is full of ${RESOURCES[r].name.toLowerCase()}`, 'Storehouse · upgrade it or sell at the Market', 'storehouse');
    } else if (c.storage[r] < cap * 0.9) delete c.flags[flag];
  }
}

function eat(x: SimCtx): void {
  const { c } = x;
  const need = eatPerHour(c) * DT_H;
  if (c.storage.fish >= need) {
    c.storage.fish -= need;
    c.hungry = false;
  } else {
    c.storage.fish = 0;
    if (!c.hungry) x.log('danger', 'Food ran out', `Dock · settlers are hungry · assign more fishers`, 'dock');
    c.hungry = true;
  }
}

function moods(x: SimCtx): void {
  const { c, now } = x;
  const spare = freeBeds(c) > 0;
  for (const s of [...c.settlers]) {
    let target = 55 + c.buildings.rathouse * 2;
    for (const t of s.traits) {
      target += TRAITS[t]?.mood ?? 0;
      if (TRAITS[t]?.wantsSpace && !spare) target -= 20;
    }
    if (c.hungry) target -= 45;
    if (isInjured(s, now)) target -= 15;
    if (s.stage === 'adult' && s.job === 'idle') target -= 5;
    target = Math.max(0, Math.min(100, target));
    const drift = BALANCE.moodDriftPerHour * DT_H;
    s.mood += Math.max(-drift, Math.min(drift, target - s.mood));

    s.misery = s.mood < 15 ? s.misery + DT_H : Math.max(0, s.misery - DT_H);
    if (s.misery >= BALANCE.leaveAfterMiseryHours) {
      c.settlers = c.settlers.filter((o) => o.id !== s.id);
      for (const o of c.settlers) if (o.partner === s.id) o.partner = undefined;
      c.stats.departures++;
      x.log('danger', `${s.name} left the colony`, 'Houses · they were miserable for too long', 'houses');
    }
  }
}

function construct(x: SimCtx): void {
  const { c, now } = x;
  const job = c.construction;
  if (!job) return;
  const builders = workers(c, 'builder').filter((s) => canWork(s, now)).length;
  job.progress += BALANCE.buildRate * (1 + builders) * (STEP / MINUTE);
  if (job.progress < job.required) return;
  c.buildings[job.building] = job.toLevel;
  c.construction = undefined;
  const def = BUILDINGS[job.building];
  x.grant({ xp: 40 * job.toLevel });
  x.log('good', `${def.name} ${job.toLevel > 1 ? `Lv ${job.toLevel} ` : ''}is finished`, def.effect(job.toLevel), def.anchor);
}

function grow(x: SimCtx): void {
  const { c, rng, now } = x;
  const happy = c.settlers.length === 0 || c.settlers.reduce((a, s) => a + s.mood, 0) / c.settlers.length >= 45;

  // Newcomers arrive when there's a bed, food and a decent mood.
  if (freeBeds(c) > 0 && !c.hungry && happy) {
    c.arrival += DT_H / Math.max(0.05, BALANCE.arrivalHoursPerSettler * c.settlers.length);
    if (c.arrival >= 1) {
      c.arrival = 0;
      const s = addSettler(c, rng, now, 'adult');
      c.stats.arrivals++;
      const foreman = c.flags.foreman && autoAssign(c) > 0;
      x.log('life', `${s.name} arrived at ${c.name}`, `Houses · ${TRAITS[s.traits[0]].name}, ${TRAITS[s.traits[1]].name}${foreman ? ` · now a ${JOBS[s.job].name.toLowerCase()}` : ''}`, 'houses');
    }
  }

  // Couples form, then families grow.
  const single = c.settlers.filter((s) => s.stage === 'adult' && !s.partner);
  if (single.length >= 2 && rng.chance(BALANCE.pairUpPerHour * DT_H)) {
    const a = single[0];
    const b = rng.pick(single.slice(1));
    a.partner = b.id;
    b.partner = a.id;
    x.log('life', `${a.name} and ${b.name} moved in together`, 'Houses · a new household', 'houses');
  }
  const couples = c.settlers.filter((s) => s.partner && s.id < s.partner);
  for (const a of couples) {
    if (freeBeds(c) === 0 || c.hungry) break;
    if (a.mood < 60 || !rng.chance(BALANCE.babyPerHour * DT_H)) continue;
    const b = c.settlers.find((s) => s.id === a.partner)!;
    const baby = addSettler(c, rng, now, 'child');
    c.stats.births++;
    x.grant({ xp: 30, acorns: 1 });
    x.log('life', `${rng.chance(0.5) ? a.name : b.name} had a baby, ${baby.name}`, 'Houses · +1 settler', 'houses');
  }

  for (const s of c.settlers) {
    if (s.stage === 'child' && now - s.born >= BALANCE.childGrowsUpHours * HOUR) {
      s.stage = 'adult';
      x.log('life', `${s.name} grew up`, `Houses · ready to work after ${fmtDuration(now - s.born)}`, 'houses');
      if (c.flags.foreman) autoAssign(c);
    }
  }
}

function storyEvents(x: SimCtx): void {
  // At most one story per step keeps the chronicle readable.
  for (const ev of STORY_EVENTS) {
    const p = ev.perHour(x) * DT_H;
    if (p <= 0 || !x.rng.chance(p)) continue;
    const out = ev.run(x);
    if (out) x.log(ev.tone, out.title, out.detail, ev.anchor);
    return;
  }
}

/**
 * Simulates up to `to`. Yields every `batch` steps so the game can spread a long
 * catch-up over several ticks (Bedrock's watchdog dislikes long frames).
 */
export function* advance(c: Colony, to: number, batch = 200): Generator<void, number, void> {
  let steps = 0;
  while (c.simTime + STEP <= to) {
    step(c);
    if (++steps % batch === 0) yield;
  }
  return steps;
}

/** Skips time beyond the offline cap. Returns the skipped ms (shown as "rested"). */
export function applyOfflineCap(c: Colony, now: number, capMs: number): number {
  const gap = now - c.simTime;
  if (gap <= capMs) return 0;
  const skipped = gap - capMs;
  c.simTime += skipped;
  return skipped;
}

export function runSync(c: Colony, to: number): number {
  const gen = advance(c, to, Infinity);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}
