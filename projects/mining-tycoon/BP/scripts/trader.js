// The Ore Trader on the landing of every mine buys resources and machine products for sell x cash multiplier (into
// the active session's money). Two choices keep the menu short: sell everything, or only the products (so the
// chunks can still go into the machines).
import { world, system } from '@minecraft/server';
import { CONFIG } from './config.js';
import { formatNumber } from './lib/util.js';
import { activeSession } from './sessions.js';
import { addStat, valueMultiplier } from './economy.js';
import { popup } from './mining.js';
import { fullScreenMenu, icon } from './menu.js';
import { onExpedition } from './expedition.js';

const PRODUCTS = new Set(CONFIG.products.map((g) => g.item));
const GOODS = new Map([...CONFIG.resources, ...CONFIG.products].map((g) => [g.item, g]));

/** What the player carries: { all: { count, value }, products: { count, value } } (value before the multiplier). */
function carried(player) {
  const container = player.getComponent('minecraft:inventory')?.container;
  const sum = { all: { count: 0, value: 0 }, products: { count: 0, value: 0 } };
  for (let i = 0; i < (container?.size ?? 0); i++) {
    const item = container.getItem(i);
    const good = item && GOODS.get(item.typeId);
    if (!good) continue;
    for (const part of PRODUCTS.has(good.item) ? [sum.all, sum.products] : [sum.all]) {
      part.count += item.amount;
      part.value += good.sell * item.amount;
    }
  }
  return sum;
}

function sell(player, productsOnly) {
  if (activeSession(player) === undefined || onExpedition(player)) return;
  const container = player.getComponent('minecraft:inventory')?.container;
  if (!container) return;
  let cash = 0;
  let count = 0;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    const good = item && GOODS.get(item.typeId);
    if (!good || (productsOnly && !PRODUCTS.has(good.item))) continue;
    cash += good.sell * item.amount;
    count += item.amount;
    container.setItem(i);
  }
  if (!count) return;
  cash *= valueMultiplier(player);
  const money = addStat(player, 'money', cash);
  player.playSound('random.orb');
  popup(player, `§a$${formatNumber(money)}  §e+$${formatNumber(cash)}`);
  player.sendMessage(`§aSold ${count} item${count > 1 ? 's' : ''} for $${formatNumber(cash)}.`);
}

function showTrader(player) {
  if (activeSession(player) === undefined || onExpedition(player)) return;
  const goods = carried(player);
  const multiplier = valueMultiplier(player);
  const cash = (value) => `$${formatNumber(value * multiplier)}`;
  const buttons = [];
  if (goods.all.count) {
    buttons.push({ list: 'notice', text: `Sell everything - ${cash(goods.all.value)}\n§7${goods.all.count} items`, icon: icon('sell'), run: (p) => sell(p, false) });
  }
  if (goods.products.count && goods.products.count < goods.all.count) {
    buttons.push({ list: 'notice', text: `Sell products only - ${cash(goods.products.value)}\n§7Keep the chunks for your machines`, icon: 'textures/mining_tycoon/items/gold_bar', run: (p) => sell(p, true) });
  }
  buttons.push({ list: 'notice', text: 'Close', icon: icon('back'), run: () => {} });
  const resources = goods.all.count - goods.products.count;
  const body = goods.all.count
    ? `§6Ore Trader§r\nYou carry ${resources} resource${resources === 1 ? '' : 's'} and ${goods.products.count} product${goods.products.count === 1 ? '' : 's'}.` +
      `\n§7Bars and cut gems are worth far more than chunks.${multiplier > 1 ? ` Cash bonus x${+multiplier.toFixed(2)}.` : ''}`
    : '§6Ore Trader§r\nNothing to sell yet. Bring resources up from an expedition: tap the lift at the end of the tunnel.';
  fullScreenMenu(player, { form: 'notice', body, buttons });
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block } = event;
  if (block.typeId !== CONFIG.blocks.trader) return;
  event.cancel = true;
  if (event.isFirstEvent) system.run(() => showTrader(player));
});
