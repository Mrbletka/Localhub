import type { Anchor, BuildingId, JobId, ResourceId, SkillId } from '../core/types';

export interface JobDef {
  name: string;
  /** Plural used on island tags: "Quarry · 3 miners". */
  plural: string;
  icon: string;
  produces?: ResourceId;
  skill?: SkillId;
  /** Building whose level adds job slots and yield. */
  building?: BuildingId;
  anchor?: Anchor;
  /** Rathouse level needed before this job can be assigned. */
  unlockRathouse: number;
  blurb: string;
}

export const JOBS: Record<JobId, JobDef> = {
  idle: { name: 'Idle', plural: 'idle', icon: 'textures/items/bed_red', unlockRathouse: 0, blurb: 'Waiting for orders.' },
  lumberjack: {
    name: 'Lumberjack', plural: 'lumberjacks', icon: 'textures/items/iron_axe',
    produces: 'wood', skill: 'lumber', building: 'lumber_camp', anchor: 'forest', unlockRathouse: 0,
    blurb: 'Chops forests for building.',
  },
  miner: {
    name: 'Miner', plural: 'miners', icon: 'textures/items/iron_pickaxe',
    produces: 'stone', skill: 'mining', building: 'quarry', anchor: 'quarry', unlockRathouse: 0,
    blurb: 'Digs the quarry for tools and walls.',
  },
  fisher: {
    name: 'Fisher', plural: 'fishers', icon: 'textures/items/fishing_rod_uncast',
    produces: 'fish', skill: 'fishing', building: 'dock', anchor: 'dock', unlockRathouse: 0,
    blurb: 'Feeds your growing town.',
  },
  builder: {
    name: 'Builder', plural: 'builders', icon: 'textures/items/iron_shovel', anchor: 'rathouse', unlockRathouse: 2,
    blurb: 'Speeds up construction.',
  },
  guard: {
    name: 'Guard', plural: 'guards', icon: 'textures/items/iron_sword', building: 'watchtower', anchor: 'houses', unlockRathouse: 3,
    blurb: 'Keeps raiders away at night.',
  },
};

export const JOB_IDS = Object.keys(JOBS) as JobId[];
export const SKILL_NAMES: Record<SkillId, string> = { lumber: 'Lumber', mining: 'Mining', fishing: 'Fishing' };
