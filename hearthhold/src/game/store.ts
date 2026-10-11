import { world } from '@minecraft/server';
import type { Colony, Profile } from '../core/types';
import { dayNumber } from '../core/time';

// All game state lives in world dynamic properties as JSON. Records are cached in
// memory and written back when marked dirty, so saves cost nothing during play.

const KEY_INDEX = 'hh:index';
const KEY_COLONY = 'hh:colony:';
const KEY_PROFILE = 'hh:profile:';
/** Bedrock caps a string property at 32767 chars; we split anything longer. */
const CHUNK = 30000;

interface Index {
  v: 1;
  colonies: string[];
  nextColony: number;
}

const colonies = new Map<string, Colony>();
const profiles = new Map<string, Profile>();
const dirty = new Set<string>();
let index: Index | undefined;

function readJson<T>(key: string): T | undefined {
  const head = world.getDynamicProperty(key);
  if (typeof head !== 'string') return undefined;
  let text = head;
  if (head.startsWith('@chunks:')) {
    const n = Number(head.slice(8));
    text = '';
    for (let i = 0; i < n; i++) text += (world.getDynamicProperty(`${key}#${i}`) as string | undefined) ?? '';
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    console.warn(`[Hearthhold] could not parse ${key}`);
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  const text = JSON.stringify(value);
  if (text.length <= CHUNK) {
    world.setDynamicProperty(key, text);
    return;
  }
  const n = Math.ceil(text.length / CHUNK);
  for (let i = 0; i < n; i++) world.setDynamicProperty(`${key}#${i}`, text.slice(i * CHUNK, (i + 1) * CHUNK));
  world.setDynamicProperty(key, `@chunks:${n}`);
}

export function getIndex(): Index {
  return (index ??= readJson<Index>(KEY_INDEX) ?? { v: 1, colonies: [], nextColony: 1 });
}

export function allColonies(): Colony[] {
  return getIndex()
    .colonies.map(getColony)
    .filter((c): c is Colony => !!c);
}

export function getColony(id: string): Colony | undefined {
  let c = colonies.get(id);
  if (!c) {
    c = readJson<Colony>(KEY_COLONY + id);
    if (c) colonies.set(id, c);
  }
  return c;
}

export function addColony(c: Colony): void {
  const idx = getIndex();
  idx.colonies.push(c.id);
  colonies.set(c.id, c);
  markIndex();
  markColony(c);
}

export function nextColonyId(): string {
  const idx = getIndex();
  markIndex();
  return `c${idx.nextColony++}`;
}

export function newProfile(id: string, name: string, now: number): Profile {
  return {
    v: 1,
    id,
    name,
    coins: 300,
    acorns: 5,
    xp: 0,
    level: 1,
    prestige: 0,
    lastSeen: now,
    daily: { streak: 0, lastClaimDay: dayNumber(now) - 1 },
    quests: { day: -1, list: [] },
    firstSteps: 0,
    counters: {},
  };
}

export function getProfile(id: string, name: string, now: number): Profile {
  let p = profiles.get(id);
  if (!p) {
    p = readJson<Profile>(KEY_PROFILE + id) ?? newProfile(id, name, now);
    p.name = name;
    profiles.set(id, p);
    dirty.add(KEY_PROFILE + id);
  }
  return p;
}

export function findProfile(id: string): Profile | undefined {
  return profiles.get(id) ?? readJson<Profile>(KEY_PROFILE + id);
}

export const markColony = (c: Colony) => dirty.add(KEY_COLONY + c.id);
export const markProfile = (p: Profile) => dirty.add(KEY_PROFILE + p.id);
const markIndex = () => dirty.add(KEY_INDEX);

export function flush(): void {
  for (const key of dirty) {
    if (key === KEY_INDEX) writeJson(key, getIndex());
    else if (key.startsWith(KEY_COLONY)) {
      const c = colonies.get(key.slice(KEY_COLONY.length));
      if (c) writeJson(key, c);
    } else if (key.startsWith(KEY_PROFILE)) {
      const p = profiles.get(key.slice(KEY_PROFILE.length));
      if (p) writeJson(key, p);
    }
  }
  dirty.clear();
}
