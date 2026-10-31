// Mining Tycoon: one loop. Mine ores (the safe vein at home, or the caves below the lift) -> resource items -> the
// machines turn them into bars and cut gems -> sell at the Ore Trader for money, or spend money + bars at the workshop
// on a better pick, lantern, backpack, deeper caves and drills -> richer expeditions. Rebirth starts a session over
// with a permanent sell bonus.
// The Miner's Tablet is the hub: where you stand and what to do next.
import { world, system } from '@minecraft/server';
import { CONFIG } from './config.js';
import { formatNumber, getNumber, setNumber, giveItem, hasItem } from './lib/util.js';
import { loadSessions, sessionsOf, activeSession, sessionKey } from './sessions.js';
import { stat, setStat, pickTier, lightSeconds, backpackSize, cartLevel, valueMultiplier, rebirthCost } from './economy.js';
import { syncPick, rerollField } from './mining.js';
import { showStartMenu, fullScreenMenu, icon } from './menu.js';
import { onExpedition, showRunMenu } from './expedition.js';
import { resetMachines } from './machines.js';
import { resetDrills } from './drills.js';
import { guideLines } from './tutorial.js';
import { showPerks } from './progress.js';
import { showHud, toast } from './hud.js';
import { eachPlayer } from './lib/safe.js';
import './trader.js';

const NS = CONFIG.namespace;
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function rebirth(player, slot) {
  if (activeSession(player) !== slot) return;
  const rebirths = stat(player, 'rebirths');
  const cost = rebirthCost(rebirths);
  if (stat(player, 'money') < cost) return toast(player, '§cNot enough money', `Rebirth costs $${formatNumber(cost)} - you have $${formatNumber(stat(player, 'money'))}.`);
  resetDrills(player, slot);
  resetMachines(player, slot);
  setStat(player, 'money', CONFIG.startingMoney);
  for (const name of ['pick', 'lantern', 'backpack', 'cart']) setStat(player, name, 1);
  setStat(player, 'rebirths', rebirths + 1);
  syncPick(player);
  rerollField(player);
  player.playSound('random.totem');
  toast(player, `Rebirth ${rebirths + 1}!`, `Sell bonus x${+valueMultiplier(player).toFixed(2)} and a star for a perk (tablet > Perks & records)`, 6);
  for (const other of world.getAllPlayers()) {
    if (other.id !== player.id) toast(other, `§d${player.name} reached rebirth ${rebirths + 1}!`, `Everything they sell is worth x${+valueMultiplier(player).toFixed(2)} now.`, 4);
  }
}

/** Miner's Tablet: where you stand, the next goal, How to play (a page in the UI) and Rebirth (with a confirm page). */
function openMenu(player) {
  const slot = activeSession(player);
  if (slot === undefined) return showStartMenu(player);
  const rebirths = stat(player, 'rebirths');
  const [quest, detail] = guideLines(player);
  const body =
    `Session ${slot + 1} - Money §a$${formatNumber(stat(player, 'money'))}§r${rebirths ? ` - Sell bonus x${+valueMultiplier(player).toFixed(2)}` : ''}\n` +
    `${CONFIG.picks[pickTier(player) - 1].name} - Light ${clock(lightSeconds(player))} - Backpack ${backpackSize(player)} - ${CONFIG.expedition.levels[cartLevel(player) - 1].name}\n` +
    `${quest}\n${detail}`;
  const buttons = [
    { list: 'tablet_rebirth', text: `Rebirth! - $${formatNumber(rebirthCost(rebirths))}\n§7Sell bonus x${+(1 + (rebirths + 1) * CONFIG.rebirth.bonusPerRebirth).toFixed(2)}`, icon: icon('rebirth'), run: (p) => rebirth(p, slot) },
    { list: 'tablet_bottom', text: 'Perks & records\n§7Rebirth stars buy permanent perks', icon: icon('upgrades'), run: showPerks },
    { list: 'tablet_bottom', text: 'Main menu', icon: icon('home'), run: showStartMenu },
  ];
  fullScreenMenu(player, { form: 'tablet', body, buttons });
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack.typeId !== CONFIG.items.tablet) return;
  if (onExpedition(player)) showRunMenu(player); // no workshop down in the caves
  else openMenu(player);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  // Worlds from before sessions: money and rebirths move into session 1.
  const oldMoney = player.getDynamicProperty(`${NS}:money`);
  if (typeof oldMoney === 'number') {
    if (sessionsOf(player.id)[0] && player.getDynamicProperty(sessionKey(0, 'money')) === undefined) {
      for (const name of ['money', 'rebirths']) setNumber(player, sessionKey(0, name), getNumber(player, `${NS}:${name}`));
    }
    for (const name of ['money', 'income_level', 'rebirths', 'started']) player.setDynamicProperty(`${NS}:${name}`, undefined);
  }
  if (!hasItem(player, CONFIG.items.tablet)) giveItem(player, CONFIG.items.tablet);
});

world.afterEvents.worldLoad.subscribe(() => {
  loadSessions();
  // The old "Money" sidebar scoreboard is removed from existing worlds.
  const board = world.scoreboard.getObjective(`${NS}_money`);
  if (board) world.scoreboard.removeObjective(board);

  // The home HUD every second: money, then the quest or the next goal (expeditions show their own HUD).
  system.runInterval(() => {
    eachPlayer('hud', (player) => {
      if (activeSession(player) === undefined || onExpedition(player)) return;
      const rebirths = stat(player, 'rebirths');
      const [quest, detail, ratio] = guideLines(player);
      const money = `§6$${formatNumber(stat(player, 'money'))}${rebirths ? ` §7- sell x${+valueMultiplier(player).toFixed(2)}` : ''}`;
      showHud(player, 'home', `${money}\n${quest}\n${detail}`, Math.floor(ratio * 10)); // bar: one segment per 10 %
    });
  }, 20);
});
