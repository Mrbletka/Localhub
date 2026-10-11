import type { Colony, Profile } from '../core/types';

export interface Reward {
  coins?: number;
  acorns?: number;
  xp?: number;
}

/** Counters starting with "colony." read the colony's lifetime stats; everything else is the Mayor's own. */
export type CounterKey =
  | 'logs_chopped'
  | 'stone_mined'
  | 'market_sales'
  | 'coins_from_market'
  | 'settlers_assigned'
  | 'builds_started'
  | 'colony.wood'
  | 'colony.stone'
  | 'colony.fish'
  | 'colony.arrivals'
  | 'colony.births';

export interface QuestDef {
  id: string;
  title: string;
  icon: string;
  counter: CounterKey;
  target: number;
  reward: Reward;
}

export const DAILY_QUESTS: QuestDef[] = [
  { id: 'chop_logs', title: 'Chop 64 logs by hand', icon: 'textures/blocks/log_oak', counter: 'logs_chopped', target: 64, reward: { coins: 250, xp: 80 } },
  { id: 'mine_stone', title: 'Mine 80 stone by hand', icon: 'textures/blocks/cobblestone', counter: 'stone_mined', target: 80, reward: { coins: 250, xp: 80 } },
  { id: 'colony_wood', title: 'Colony gathers 500 wood', icon: 'textures/items/iron_axe', counter: 'colony.wood', target: 500, reward: { coins: 200, xp: 60 } },
  { id: 'colony_stone', title: 'Colony gathers 400 stone', icon: 'textures/items/iron_pickaxe', counter: 'colony.stone', target: 400, reward: { coins: 200, xp: 60 } },
  { id: 'colony_fish', title: 'Catch 250 fish', icon: 'textures/items/fish_raw', counter: 'colony.fish', target: 250, reward: { acorns: 2, xp: 60 } },
  { id: 'market_sell', title: 'Sell goods 3 times', icon: 'textures/items/emerald', counter: 'market_sales', target: 3, reward: { coins: 150, xp: 40 } },
  { id: 'build_any', title: 'Start a construction', icon: 'textures/items/door_wood', counter: 'builds_started', target: 1, reward: { coins: 150, xp: 50 } },
  { id: 'welcome', title: 'Welcome a new settler', icon: 'textures/items/bed_red', counter: 'colony.arrivals', target: 1, reward: { acorns: 1, xp: 50 } },
];

export interface FirstStep {
  title: string;
  icon: string;
  done(p: Profile, c: Colony | undefined): [number, number];
  reward: Reward;
}

export const FIRST_STEPS: FirstStep[] = [
  { title: 'Claim your island', icon: 'textures/items/banner_pattern', done: (p) => [p.colony ? 1 : 0, 1], reward: { coins: 100, xp: 50 } },
  { title: 'Build your Rathouse', icon: 'textures/items/door_wood', done: (_, c) => [Math.min(1, c?.buildings.rathouse ?? 0), 1], reward: { coins: 250, xp: 100 } },
  { title: 'Welcome 3 settlers', icon: 'textures/items/bed_red', done: (_, c) => [Math.min(3, c?.stats.arrivals ?? 0), 3], reward: { coins: 300, xp: 100 } },
  { title: 'Give an idle settler a job', icon: 'textures/items/iron_axe', done: (p) => [Math.min(1, p.counters.settlers_assigned ?? 0), 1], reward: { coins: 100, xp: 50 } },
  { title: 'Build a House', icon: 'textures/items/bed_red', done: (_, c) => [Math.min(1, c?.buildings.house ?? 0), 1], reward: { coins: 200, xp: 80 } },
  { title: 'Sell goods at the Market', icon: 'textures/items/emerald', done: (p) => [Math.min(1, p.counters.market_sales ?? 0), 1], reward: { coins: 150, xp: 50 } },
  { title: 'Reach Rathouse Lv 2', icon: 'textures/items/door_wood', done: (_, c) => [Math.min(2, c?.buildings.rathouse ?? 0), 2], reward: { coins: 500, acorns: 5, xp: 200 } },
];

/** 7-day streak. Missing a day steps back one day instead of resetting. */
export const DAILY_REWARDS: Reward[] = [
  { coins: 100 },
  { coins: 150 },
  { coins: 150, acorns: 1 },
  { coins: 250 },
  { coins: 300 },
  { coins: 400, acorns: 2 },
  { coins: 800, acorns: 5 },
];
