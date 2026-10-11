import type { Colony, Profile, QuestState } from '../core/types';
import { hash, makeRng } from '../core/rng';
import { dayNumber } from '../core/time';
import { mayorXpNeeded } from '../content/balance';
import { DAILY_QUESTS, DAILY_REWARDS, FIRST_STEPS, type CounterKey, type QuestDef, type Reward } from '../content/quests';

// Per-Mayor progression: XP, daily streak, quests, first steps. Pure functions.

export function counterValue(p: Profile, c: Colony | undefined, key: CounterKey): number {
  if (key.startsWith('colony.')) {
    if (!c) return 0;
    const k = key.slice(7);
    if (k === 'arrivals') return c.stats.arrivals;
    if (k === 'births') return c.stats.births;
    return Math.floor(c.stats.produced[k as 'wood' | 'stone' | 'fish']);
  }
  return p.counters[key] ?? 0;
}

export function bump(p: Profile, key: CounterKey, n = 1): void {
  p.counters[key] = (p.counters[key] ?? 0) + n;
}

/** Returns the number of levels gained. */
export function addXp(p: Profile, xp: number): number {
  p.xp += xp;
  let gained = 0;
  while (p.xp >= mayorXpNeeded(p.level)) {
    p.xp -= mayorXpNeeded(p.level);
    p.level++;
    gained++;
  }
  return gained;
}

export function giveReward(p: Profile, r: Reward): number {
  p.coins += r.coins ?? 0;
  p.acorns += r.acorns ?? 0;
  return addXp(p, r.xp ?? 0);
}

export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`§e${r.coins} coins§r`);
  if (r.acorns) parts.push(`§6${r.acorns} acorn${r.acorns > 1 ? 's' : ''}§r`);
  if (r.xp) parts.push(`§a${r.xp} XP§r`);
  return parts.join(' · ');
}

/** Pays out rewards the colony earned for this Mayor while they were away. */
export function collectOwed(p: Profile, c: Colony): Reward | undefined {
  const o = c.owed[p.id];
  if (!o || (!o.coins && !o.acorns && !o.xp)) return undefined;
  const r = { ...o };
  giveReward(p, r);
  c.owed[p.id] = { coins: 0, acorns: 0, xp: 0 };
  return r;
}

// ── Daily reward ────────────────────────────────────────────────────────────

export function dailyAvailable(p: Profile, now: number): boolean {
  return p.daily.lastClaimDay < dayNumber(now);
}

/** Streak day (0-based) the next claim will pay, with the step-back rule applied. */
export function dailyIndex(p: Profile, now: number): number {
  const missed = dayNumber(now) - p.daily.lastClaimDay - 1;
  const streak = missed > 0 ? Math.max(0, p.daily.streak - 1) : p.daily.streak;
  return streak % DAILY_REWARDS.length;
}

export function claimDaily(p: Profile, now: number): Reward | undefined {
  if (!dailyAvailable(p, now)) return undefined;
  const i = dailyIndex(p, now);
  p.daily = { streak: i + 1, lastClaimDay: dayNumber(now) };
  const r = DAILY_REWARDS[i];
  giveReward(p, r);
  return r;
}

// ── Daily quests ────────────────────────────────────────────────────────────

export function refreshQuests(p: Profile, c: Colony | undefined, now: number): void {
  const day = dayNumber(now);
  if (p.quests.day === day) return;
  const rng = makeRng(hash(`${p.id}:${day}`));
  const pool = DAILY_QUESTS.filter((q) => p.colony || !q.counter.startsWith('colony.'));
  const picked: QuestDef[] = [];
  while (picked.length < 3 && picked.length < pool.length) {
    const q = rng.pick(pool);
    if (!picked.includes(q)) picked.push(q);
  }
  p.quests = { day, list: picked.map((q): QuestState => ({ id: q.id, base: counterValue(p, c, q.counter), claimed: false })) };
}

export function questDef(id: string): QuestDef | undefined {
  return DAILY_QUESTS.find((q) => q.id === id);
}

export function questProgress(p: Profile, c: Colony | undefined, q: QuestState): [number, number] {
  const def = questDef(q.id);
  if (!def) return [0, 1];
  return [Math.min(def.target, counterValue(p, c, def.counter) - q.base), def.target];
}

export function claimQuest(p: Profile, c: Colony | undefined, q: QuestState): Reward | undefined {
  const [have, need] = questProgress(p, c, q);
  if (q.claimed || have < need) return undefined;
  q.claimed = true;
  const r = questDef(q.id)!.reward;
  giveReward(p, r);
  return r;
}

// ── First steps ─────────────────────────────────────────────────────────────

export function currentFirstStep(p: Profile, c: Colony | undefined) {
  const step = FIRST_STEPS[p.firstSteps];
  if (!step) return undefined;
  const [have, need] = step.done(p, c);
  return { step, have, need, ready: have >= need };
}

export function claimFirstStep(p: Profile, c: Colony | undefined): Reward | undefined {
  const cur = currentFirstStep(p, c);
  if (!cur?.ready) return undefined;
  p.firstSteps++;
  giveReward(p, cur.step.reward);
  return cur.step.reward;
}
