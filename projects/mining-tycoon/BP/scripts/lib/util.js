// Shared helpers for gameplay scripts.
import { world, ItemStack } from '@minecraft/server';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** 1234567 -> "1.23M" */
export function formatNumber(value) {
  if (!Number.isFinite(value)) return 'inf';
  const sign = value < 0 ? '-' : '';
  let n = Math.abs(value);
  let i = 0;
  while (n >= 1000 && i < SUFFIXES.length - 1) {
    n /= 1000;
    i++;
  }
  const digits = i === 0 ? 0 : n < 10 ? 2 : n < 100 ? 1 : 0;
  return sign + (i === 0 ? Math.floor(n) : n.toFixed(digits)) + SUFFIXES[i];
}

export function getNumber(holder, key, fallback = 0) {
  const value = holder.getDynamicProperty(key);
  return typeof value === 'number' ? value : fallback;
}

export function setNumber(holder, key, value) {
  holder.setDynamicProperty(key, value);
  return value;
}

export function addNumber(holder, key, delta) {
  return setNumber(holder, key, getNumber(holder, key) + delta);
}

export function getJson(holder, key, fallback) {
  const raw = holder.getDynamicProperty(key);
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Dynamic property strings are limited to 32767 characters - keep stored JSON small. */
export function setJson(holder, key, value) {
  holder.setDynamicProperty(key, JSON.stringify(value));
}

export function giveItem(player, typeId, amount = 1) {
  const container = player.getComponent('minecraft:inventory')?.container;
  if (!container) return;
  const leftover = container.addItem(new ItemStack(typeId, amount));
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

export function hasItem(player, typeId) {
  const container = player.getComponent('minecraft:inventory')?.container;
  if (!container) return false;
  for (let i = 0; i < container.size; i++) {
    if (container.getItem(i)?.typeId === typeId) return true;
  }
  return false;
}

export function ensureObjective(id, displayName) {
  return world.scoreboard.getObjective(id) ?? world.scoreboard.addObjective(id, displayName);
}

/** Scoreboard scores are 32-bit integers; clamp big economy numbers before displaying them. */
export function toScore(value) {
  return Math.max(-2147483648, Math.min(2147483647, Math.floor(value)));
}
