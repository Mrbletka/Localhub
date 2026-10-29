// Shared helpers for building in the world: block ids checked against the running game, seeded noise.
import { BlockPermutation, BlockTypes } from '@minecraft/server';

/** First of these block ids that exists in this game version (ids get renamed: chain -> iron_chain). */
export const pick = (...ids) => ids.find((id) => BlockTypes.get(id)) ?? 'minecraft:stone';

/** A block with states; without them if this version doesn't know a state. */
export function permutation(id, states) {
  try {
    return BlockPermutation.resolve(id, states);
  } catch {
    return BlockPermutation.resolve(id);
  }
}

/** Deterministic hash of (seed, a, b) in [0, 1). */
export function hash(seed, a, b) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(a, 0xc2b2ae35) ^ Math.imul(b, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1): the same seed and position always give the same value. */
export function noise(seed, x, y, scale) {
  const x0 = Math.floor(x / scale);
  const y0 = Math.floor(y / scale);
  const fx = x / scale - x0;
  const fy = y / scale - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(seed, x0, y0) * (1 - sx) + hash(seed, x0 + 1, y0) * sx;
  const bottom = hash(seed, x0, y0 + 1) * (1 - sx) + hash(seed, x0 + 1, y0 + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

/** Seeded random numbers in [0, 1) (mulberry32). */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
