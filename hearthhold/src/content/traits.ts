import type { ResourceId } from '../core/types';

export interface TraitDef {
  name: string;
  desc: string;
  /** Yield multiplier for one resource. */
  yield?: Partial<Record<ResourceId, number>>;
  /** Shift to the mood this settler drifts towards. */
  mood?: number;
  /** Multiplier on the chance this settler is the one hurt in a danger event. */
  hurtChance?: number;
  /** Counts as extra defense when working as a guard. */
  defense?: number;
  /** Multiplier on lucky-find events in this settler's job. */
  luck?: number;
  /** Homesick: needs a spare bed in the colony to be happy. */
  wantsSpace?: boolean;
}

export const TRAITS: Record<string, TraitDef> = {
  strong: { name: 'Strong', desc: '+25% stone', yield: { stone: 1.25 } },
  nimble: { name: 'Nimble', desc: '+25% wood', yield: { wood: 1.25 } },
  patient: { name: 'Patient', desc: '+25% fish', yield: { fish: 1.25 } },
  hardy: { name: 'Hardy', desc: 'Rarely gets hurt', hurtChance: 0.3 },
  brave: { name: 'Brave', desc: '+1 defense as a guard', defense: 1 },
  lucky: { name: 'Lucky', desc: 'Lucky finds ×2', luck: 2 },
  cheerful: { name: 'Cheerful', desc: '+15 mood', mood: 15 },
  lazy: { name: 'Lazy', desc: '-10% everything, +10 mood', yield: { wood: 0.9, stone: 0.9, fish: 0.9 }, mood: 10 },
  homesick: { name: 'Homesick', desc: 'Unhappy without a spare bed', wantsSpace: true },
};

export const TRAIT_IDS = Object.keys(TRAITS);
