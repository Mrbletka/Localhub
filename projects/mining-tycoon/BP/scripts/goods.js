// Goods are the items mining and the machines produce (resources and products). Upgrades are paid with "needs":
// { money: 150, copper_bar: 4 } - money of the active session plus goods from the inventory.
import { CONFIG } from './config.js';
import { formatNumber, giveItem } from './lib/util.js';
import { stat, addStat } from './economy.js';
import { toast } from './hud.js';

export const GOODS = new Map([...CONFIG.resources, ...CONFIG.products].map((g) => [g.id, g]));
export const GOOD_BY_ITEM = new Map([...GOODS.values()].map((g) => [g.item, g]));
export const goodName = (id) => GOODS.get(id)?.name ?? id;
export const goodIcon = (id) => `textures/mining_tycoon/items/${GOODS.get(id)?.item.split(':')[1]}`;

/** Every stack of goods in the inventory: [{ index, item, good }]. */
export function stacks(player) {
  const container = player.getComponent('minecraft:inventory')?.container;
  const out = [];
  for (let i = 0; i < (container?.size ?? 0); i++) {
    const item = container.getItem(i);
    const good = item && GOOD_BY_ITEM.get(item.typeId);
    if (good) out.push({ index: i, item, good });
  }
  return out;
}

export const countGood = (player, id) => stacks(player).reduce((n, s) => n + (s.good.id === id ? s.item.amount : 0), 0);

/** Take up to `amount` of a good out of the inventory; returns how many were taken. */
export function takeGood(player, id, amount) {
  const container = player.getComponent('minecraft:inventory')?.container;
  let taken = 0;
  for (const { index, item, good } of stacks(player)) {
    if (good.id !== id || taken >= amount) continue;
    const n = Math.min(item.amount, amount - taken);
    taken += n;
    if (n === item.amount) container.setItem(index);
    else {
      item.amount -= n;
      container.setItem(index, item);
    }
  }
  return taken;
}

/** Give goods ({ id: count }) in stacks of 64. */
export function giveGoods(player, goods) {
  for (const [id, n] of Object.entries(goods)) {
    const good = GOODS.get(id);
    for (let left = n; good && left > 0; left -= 64) giveItem(player, good.item, Math.min(64, left));
  }
}

const parts = (needs) => Object.entries(needs).filter(([id, n]) => id !== 'money' && n > 0);

/** "4 Copper Bar + $150" */
export function needsText(needs) {
  const list = parts(needs).map(([id, n]) => `${n} ${goodName(id)}`);
  if (needs.money) list.push(`$${formatNumber(needs.money)}`);
  return list.join(' + ') || 'free';
}

/** "Copper Bar 2/4 - $150" coloured: green what you have, red what is still missing. */
export function progressText(player, needs) {
  const list = parts(needs).map(([id, n]) => {
    const have = countGood(player, id);
    return `${have >= n ? '§a' : '§c'}${goodName(id)} ${Math.min(have, n)}/${n}`;
  });
  if (needs.money) list.push(`${stat(player, 'money') >= needs.money ? '§a' : '§c'}$${formatNumber(needs.money)}`);
  return list.join('§7, ') || '§afree';
}

/** How far the player is towards needs, 0..1 (each good and the money count the same). */
export function progressRatio(player, needs) {
  const shares = parts(needs).map(([id, n]) => Math.min(1, countGood(player, id) / n));
  if (needs.money) shares.push(Math.min(1, stat(player, 'money') / needs.money));
  return shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 1;
}

/** What is still missing, e.g. ["2 Copper Bar", "$40"]; empty when the player can pay. */
export function missing(player, needs) {
  const out = parts(needs).filter(([id, n]) => countGood(player, id) < n).map(([id, n]) => `${n - countGood(player, id)} ${goodName(id)}`);
  const money = stat(player, 'money');
  if (needs.money > money) out.push(`$${formatNumber(needs.money - money)}`);
  return out;
}

/** Pay money and goods. Nothing is taken (and the player is told what is missing) when something is short. */
export function pay(player, needs) {
  const short = missing(player, needs);
  if (short.length) {
    toast(player, '§cNot enough yet', `You still need ${short.join(', ')}.`);
    return false;
  }
  for (const [id, n] of parts(needs)) takeGood(player, id, n);
  if (needs.money) addStat(player, 'money', -needs.money);
  return true;
}
