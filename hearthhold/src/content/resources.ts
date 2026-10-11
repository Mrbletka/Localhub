import type { ResourceId } from '../core/types';

export interface ResourceDef {
  name: string;
  color: string;
  icon: string;
  /** Base market price in coins per unit. */
  price: number;
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  wood: { name: 'Wood', color: '§6', icon: 'textures/blocks/log_oak', price: 1 },
  stone: { name: 'Stone', color: '§7', icon: 'textures/blocks/cobblestone', price: 2 },
  fish: { name: 'Fish', color: '§b', icon: 'textures/items/fish_raw', price: 1.5 },
};

export const RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[];
