import type { Anchor, BuildingId, ResourceId } from '../core/types';

export type Cost = Partial<Record<ResourceId | 'coins', number>>;

export interface BuildingDef {
  name: string;
  icon: string;
  anchor: Anchor;
  maxLevel: number;
  /** Rathouse level required to build `level` of this building. */
  requires(level: number): number;
  cost(level: number): Cost;
  /** Work-minutes needed to build `level`. */
  minutes(level: number): number;
  /** One line describing what `level` gives you. */
  effect(level: number): string;
}

const grow = (base: number, factor: number, level: number) => Math.round(base * Math.pow(factor, level - 1));

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  rathouse: {
    name: 'Rathouse', icon: 'textures/items/door_wood', anchor: 'rathouse', maxLevel: 10,
    requires: () => 0,
    cost: (l) => (l === 1 ? { wood: 60 } : { wood: grow(150, 2.6, l), stone: grow(100, 2.7, l), coins: grow(200, 2.8, l) }),
    minutes: (l) => grow(3, 1.9, l),
    effect: (l) => (l === 1 ? 'Founds the colony. Unlocks Houses, Storehouse and work camps.' : `Colony Lv ${l}. Unlocks new jobs and buildings.`),
  },
  house: {
    name: 'House', icon: 'textures/items/bed_red', anchor: 'houses', maxLevel: 8,
    requires: (l) => (l <= 2 ? 1 : Math.ceil(l / 2) + 1),
    cost: (l) => ({ wood: grow(50, 1.7, l), stone: l > 1 ? grow(20, 1.8, l) : 0 }),
    minutes: (l) => grow(2, 1.6, l),
    effect: () => '+3 beds. More beds = more settlers.',
  },
  storehouse: {
    name: 'Storehouse', icon: 'textures/blocks/barrel_side', anchor: 'storehouse', maxLevel: 9,
    requires: (l) => l,
    cost: (l) => ({ wood: grow(80, 2.3, l), stone: grow(40, 2.4, l) }),
    minutes: (l) => grow(3, 1.8, l),
    effect: (l) => `Storage ×2.4. Offline progress up to ${Math.min(24, 4 + 4 * l)}h.`,
  },
  lumber_camp: {
    name: 'Lumber Camp', icon: 'textures/items/iron_axe', anchor: 'forest', maxLevel: 5,
    requires: (l) => l,
    cost: (l) => ({ wood: grow(40, 2, l), stone: grow(20, 2.1, l), coins: l > 1 ? grow(60, 2.2, l) : 0 }),
    minutes: (l) => grow(2, 1.8, l),
    effect: () => '+2 lumberjack slots, +15% wood.',
  },
  quarry: {
    name: 'Quarry', icon: 'textures/items/iron_pickaxe', anchor: 'quarry', maxLevel: 5,
    requires: (l) => l,
    cost: (l) => ({ wood: grow(60, 2, l), coins: l > 1 ? grow(60, 2.2, l) : 0 }),
    minutes: (l) => grow(2, 1.8, l),
    effect: () => '+2 miner slots, +15% stone.',
  },
  dock: {
    name: 'Dock', icon: 'textures/items/fishing_rod_uncast', anchor: 'dock', maxLevel: 5,
    requires: (l) => l,
    cost: (l) => ({ wood: grow(50, 2, l), stone: grow(10, 2.2, l), coins: l > 1 ? grow(60, 2.2, l) : 0 }),
    minutes: (l) => grow(2, 1.8, l),
    effect: () => '+2 fisher slots, +15% fish.',
  },
  watchtower: {
    name: 'Watchtower', icon: 'textures/items/iron_sword', anchor: 'houses', maxLevel: 5,
    requires: (l) => l + 2,
    cost: (l) => ({ wood: grow(100, 2, l), stone: grow(150, 2.1, l) }),
    minutes: (l) => grow(4, 1.8, l),
    effect: () => '+2 guard slots, +2 defense.',
  },
  market: {
    name: 'Market', icon: 'textures/items/emerald', anchor: 'rathouse', maxLevel: 3,
    requires: (l) => l + 1,
    cost: (l) => ({ wood: grow(150, 2.5, l), stone: grow(60, 2.5, l) }),
    minutes: (l) => grow(3, 2, l),
    effect: (l) => `Sell prices +${l * 10}%.`,
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

export function costEntries(cost: Cost): [ResourceId | 'coins', number][] {
  return (Object.entries(cost) as [ResourceId | 'coins', number][]).filter(([, n]) => n > 0);
}
