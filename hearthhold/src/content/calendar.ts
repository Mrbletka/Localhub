import type { ResourceId } from '../core/types';
import { weekNumber } from '../core/time';

// Weekly events, baked into the pack. No server needed: the week number picks the event.

export interface SeasonEvent {
  id: string;
  name: string;
  blurb: string;
  yield?: Partial<Record<ResourceId, number>>;
  danger?: number;
  market?: number;
  /** Multiplier on coins/acorns from quests and story events. */
  rewards?: number;
}

export const SEASON_EVENTS: SeasonEvent[] = [
  { id: 'harvest_week', name: 'Harvest Week', blurb: '2× yield', yield: { wood: 2, stone: 2, fish: 2 } },
  { id: 'quiet_week', name: 'Quiet Week', blurb: 'Calm seas, fewer raids', danger: 0.5 },
  { id: 'blood_moon', name: 'Blood Moon', blurb: 'Raids ×2, rewards ×2', danger: 2, rewards: 2 },
  { id: 'fishing_derby', name: 'Fishing Derby', blurb: 'Fish +50%, sells ×2', yield: { fish: 1.5 }, market: 1.25 },
  { id: 'founders_fair', name: "Founders' Fair", blurb: 'Market prices +50%', market: 1.5 },
  { id: 'stonefall', name: 'Stonefall', blurb: 'Stone +75%', yield: { stone: 1.75 } },
];

export function seasonAt(ms: number): SeasonEvent {
  return SEASON_EVENTS[weekNumber(ms) % SEASON_EVENTS.length];
}
