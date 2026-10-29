import { world, system } from '@minecraft/server';
import { CONFIG } from './config.js';
import { formatNumber, getNumber, setNumber, getJson, setJson, giveItem, hasItem } from './lib/util.js';
import { loadSessions, sessionsOf, activeSession, sessionKey, inActivePlot, onSessionDelete, onMineRebuild } from './sessions.js';
import { stat, setStat, addStat, pickTier, mineLevel, valueMultiplier, valueCost, rebirthCost } from './economy.js';
import { rerollField, syncPick, popupUntil } from './mining.js';
import { padBlockId } from './mine_builder.js';
import { showStartMenu, fullScreenMenu, icon } from './menu.js';
import { onExpedition, showRunMenu } from './expedition.js';
import { resetMachines } from './machines.js';
import './trader.js';

const NS = CONFIG.namespace;
const GENERATORS_KEY = `${NS}:generators`;
const TIERS = new Map(CONFIG.generators.map((g) => [g.block, g]));

/** Placed generators: "dimension|x|y|z" -> { owner: playerId, slot: session slot, block: typeId } */
let generators = {};

const locKey = (dimensionId, { x, y, z }) => `${dimensionId}|${x}|${y}|${z}`;
const save = () => setJson(world, GENERATORS_KEY, generators);
const owned = (playerId, slot) => Object.entries(generators).filter(([, g]) => g.owner === playerId && (g.slot ?? 0) === slot);
const drillsUnlocked = (player) => mineLevel(player) >= CONFIG.drillsUnlockMine;

function incomePerSecond(player) {
  const slot = activeSession(player);
  if (slot === undefined) return 0;
  let base = 0;
  for (const [, g] of owned(player.id, slot)) base += TIERS.get(g.block)?.income ?? 0;
  return base * valueMultiplier(player);
}

function removeDrills(entries) {
  for (const [key] of entries) {
    const [dimensionId, x, y, z] = key.split('|');
    try {
      world.getDimension(dimensionId).getBlock({ x: +x, y: +y, z: +z })?.setType('minecraft:air');
    } catch {
      // chunk not loaded - the record is dropped either way
    }
    delete generators[key];
  }
  save();
}

/** Pay a price from the active session, or say what is missing. */
function pay(player, cost) {
  if (stat(player, 'money') >= cost) {
    addStat(player, 'money', -cost);
    return true;
  }
  player.sendMessage(`§cYou need §a$${formatNumber(cost)}§c (you have $${formatNumber(stat(player, 'money'))}).`);
  return false;
}

function buyDrill(player, g) {
  if (!drillsUnlocked(player) || !pay(player, g.cost)) return;
  giveItem(player, g.block);
  player.playSound('random.orb');
  player.sendMessage(`§aBought a ${g.name}. Place it on a drill pad: the light tiles along the side walls of your mine.`);
}

function upgradePick(player) {
  const next = CONFIG.picks[pickTier(player)];
  if (!next || !pay(player, next.cost)) return;
  setStat(player, 'pick', pickTier(player) + 1);
  syncPick(player);
  player.playSound('random.levelup');
  player.sendMessage(`§aYou got the ${next.name}!`);
}

function upgradeMine(player) {
  const next = CONFIG.mines[mineLevel(player)];
  if (!next || !pay(player, next.cost)) return;
  setStat(player, 'mine_level', mineLevel(player) + 1);
  rerollField(player);
  player.playSound('random.levelup');
  player.sendMessage(`§aYour mine reached the ${next.name}!${mineLevel(player) === CONFIG.drillsUnlockMine ? ' §eDrills are unlocked!' : ''}`);
}

function upgradeValue(player) {
  const level = stat(player, 'income_level');
  if (!pay(player, valueCost(level))) return;
  setStat(player, 'income_level', level + 1);
  player.playSound('random.levelup');
  player.sendMessage(`§aOre value level ${level + 1}: cash x${+valueMultiplier(player).toFixed(2)}.`);
}

function rebirth(player, slot) {
  if (activeSession(player) !== slot) return;
  const rebirths = stat(player, 'rebirths');
  if (!pay(player, rebirthCost(rebirths))) return;
  removeDrills(owned(player.id, slot));
  resetMachines(player, slot);
  setStat(player, 'money', CONFIG.startingMoney);
  setStat(player, 'income_level', 0);
  setStat(player, 'pick', 1);
  setStat(player, 'mine_level', 1);
  setStat(player, 'rebirths', rebirths + 1);
  syncPick(player);
  rerollField(player);
  player.playSound('random.totem');
  world.sendMessage(`§d${player.name} reached rebirth ${rebirths + 1}!`);
}

/** Button icons from item / ore textures: "mining_tycoon:pick_3" -> textures/mining_tycoon/items/pick_3. */
const itemIcon = (id) => `textures/mining_tycoon/items/${id.split(':')[1]}`;
const oreIcon = (ore) => `textures/mining_tycoon/blocks/ore_${ore.id}`;
/** The most valuable ore a mine level has. */
const newestOre = (level) => CONFIG.ores.filter((o) => o.id in CONFIG.mines[level - 1].weights).at(-1);

/** Names of the ores that need a pick tier / that a mine level adds. */
const oresNeeding = (tier) => CONFIG.ores.filter((o) => o.pick === tier).map((o) => o.name);
const oresAddedBy = (level) => {
  const before = CONFIG.mines[level - 2]?.weights ?? {};
  return Object.keys(CONFIG.mines[level - 1].weights).filter((id) => !(id in before)).map((id) => CONFIG.ores.find((o) => o.id === id).name);
};

/** Miner's Tablet: one full-screen form with Upgrades, Drills and the rebirth confirmation as sub-pages. */
function openMenu(player) {
  const slot = activeSession(player);
  if (slot === undefined) return showStartMenu(player);
  const tier = pickTier(player);
  const level = mineLevel(player);
  const value = stat(player, 'income_level');
  const rebirths = stat(player, 'rebirths');
  const nextPick = CONFIG.picks[tier];
  const nextMine = CONFIG.mines[level];
  const buttons = [
    nextPick
      ? { list: 'tablet_upgrades', text: `Pick: ${nextPick.name} - $${formatNumber(nextPick.cost)}\n§7Faster${oresNeeding(tier + 1).length ? `, mines ${oresNeeding(tier + 1).join(', ')}` : ''}`, icon: itemIcon(nextPick.item), run: upgradePick }
      : { list: 'tablet_upgrades', text: `Pick: ${CONFIG.picks[tier - 1].name}\n§7Best pick there is`, icon: itemIcon(CONFIG.picks[tier - 1].item), run: () => {} },
    nextMine
      ? { list: 'tablet_upgrades', text: `Mine: ${nextMine.name} - $${formatNumber(nextMine.cost)}\n§7Adds ${oresAddedBy(level + 1).join(', ')}`, icon: oreIcon(newestOre(level + 1)), run: upgradeMine }
      : { list: 'tablet_upgrades', text: `Mine: ${CONFIG.mines[level - 1].name}\n§7Deepest mine there is`, icon: oreIcon(newestOre(level)), run: () => {} },
    { list: 'tablet_upgrades', text: `Ore value: level ${value + 1} - $${formatNumber(valueCost(value))}\n§7+${Math.round(CONFIG.upgrade.incomeBonusPerLevel * 100)}% cash from ores and drills`, icon: icon('coin'), run: upgradeValue },
  ];
  if (drillsUnlocked(player)) {
    for (const g of CONFIG.generators) {
      buttons.push({ list: 'tablet_shop', text: `${g.name} - $${formatNumber(g.cost)}\n§7+$${formatNumber(g.income)}/s each`, icon: g.icon, run: (p) => buyDrill(p, g) });
    }
  } else {
    const unlock = CONFIG.mines[CONFIG.drillsUnlockMine - 1].name;
    buttons.push({ list: 'tablet_shop', text: `Locked\n§7Upgrade your mine to the ${unlock}`, icon: icon('lock'), run: (p) => p.sendMessage(`§eDrills unlock when your mine reaches the ${unlock}.`) });
  }
  buttons.push(
    { list: 'tablet_rebirth', text: `Rebirth! - $${formatNumber(rebirthCost(rebirths))}\n§7Bonus x${+(1 + (rebirths + 1) * CONFIG.rebirth.bonusPerRebirth).toFixed(2)}`, icon: icon('rebirth'), run: (p) => rebirth(p, slot) },
    { list: 'tablet_bottom', text: 'Main menu', icon: icon('home'), run: showStartMenu },
  );
  const income = incomePerSecond(player);
  const body =
    `Session ${slot + 1} - Money §a$${formatNumber(stat(player, 'money'))}§r\n` +
    `${CONFIG.picks[tier - 1].name} - ${CONFIG.mines[level - 1].name} - Cash x${+valueMultiplier(player).toFixed(2)}` +
    (income > 0 ? `\nDrills ${owned(player.id, slot).length}/${CONFIG.maxGeneratorsPerPlayer}: §a+$${formatNumber(income)}/s` : '');
  fullScreenMenu(player, { form: 'tablet', body, buttons });
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack.typeId !== CONFIG.items.tablet) return;
  if (onExpedition(player)) showRunMenu(player); // no shop down in the caves
  else openMenu(player);
});

world.afterEvents.playerPlaceBlock.subscribe(({ player, block, dimension }) => {
  const tier = TIERS.get(block.typeId);
  if (!tier) return;
  const slot = activeSession(player);
  if (!inActivePlot(player, dimension.id, block.location)) {
    block.setType('minecraft:air');
    giveItem(player, tier.block);
    return player.sendMessage('§cDrills only work in the mine of the session you are playing.');
  }
  if (block.below()?.typeId !== padBlockId()) {
    block.setType('minecraft:air');
    giveItem(player, tier.block);
    return player.sendMessage('§cPlace drills on the drill pads: the light tiles along the side walls of your mine.');
  }
  if (owned(player.id, slot).length >= CONFIG.maxGeneratorsPerPlayer) {
    block.setType('minecraft:air');
    giveItem(player, tier.block);
    return player.sendMessage(`§cDrill limit reached (${CONFIG.maxGeneratorsPerPlayer}).`);
  }
  generators[locKey(dimension.id, block.location)] = { owner: player.id, slot, block: block.typeId };
  save();
  player.onScreenDisplay.setActionBar(`§a${tier.name} drilling: +$${formatNumber(tier.income * valueMultiplier(player))}/s`);
});

// Drills can only be broken by their owner, from the session they belong to (so they can't move between saves).
// Before-events are read-only, so messages go through system.run.
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const record = generators[locKey(event.dimension.id, event.block.location)];
  if (!record) return;
  const player = event.player;
  if (record.owner !== player.id) {
    event.cancel = true;
    system.run(() => player.sendMessage('§cThat drill belongs to someone else.'));
  } else if ((record.slot ?? 0) !== activeSession(player)) {
    event.cancel = true;
    system.run(() => player.sendMessage('§cThat drill belongs to your other session.'));
  }
});

world.afterEvents.playerBreakBlock.subscribe(({ block, dimension }) => {
  const key = locKey(dimension.id, block.location);
  if (generators[key]) {
    delete generators[key];
    save();
  }
});

onSessionDelete((playerId, slot) => removeDrills(owned(playerId, slot)));

// A mine that gets rebuilt (new layout) loses what stood in it: its drills go back to the inventory.
onMineRebuild((player, slot) => {
  const drills = owned(player.id, slot);
  for (const [key, g] of drills) {
    giveItem(player, g.block);
    delete generators[key];
  }
  if (drills.length) {
    save();
    player.sendMessage(`§eYour mine was rebuilt: your ${drills.length} drill${drills.length > 1 ? 's are' : ' is'} back in your inventory.`);
  }
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  // Worlds from before sessions: money, upgrades and rebirths move into session 1.
  const oldMoney = player.getDynamicProperty(`${NS}:money`);
  if (typeof oldMoney === 'number') {
    if (sessionsOf(player.id)[0] && player.getDynamicProperty(sessionKey(0, 'money')) === undefined) {
      for (const name of ['money', 'income_level', 'rebirths']) setNumber(player, sessionKey(0, name), getNumber(player, `${NS}:${name}`));
    }
    for (const name of ['money', 'income_level', 'rebirths', 'started']) player.setDynamicProperty(`${NS}:${name}`, undefined);
  }
  if (!hasItem(player, CONFIG.items.tablet)) giveItem(player, CONFIG.items.tablet);
});

world.afterEvents.worldLoad.subscribe(() => {
  generators = getJson(world, GENERATORS_KEY, {});
  loadSessions();
  // Money shows in the action bar; the old "Money" sidebar scoreboard is removed from existing worlds.
  const board = world.scoreboard.getObjective(`${NS}_money`);
  if (board) world.scoreboard.removeObjective(board);

  // Pay income every second to each player's active session.
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      if (activeSession(player) === undefined) continue;
      const income = incomePerSecond(player);
      const money = income > 0 ? addStat(player, 'money', income) : stat(player, 'money');
      if (onExpedition(player)) continue; // the expedition has its own bar (light and haul)
      if (system.currentTick < (popupUntil.get(player.id) ?? 0)) continue; // a mining popup is showing
      player.onScreenDisplay.setActionBar(`§a$${formatNumber(money)}${income > 0 ? `  §7(+$${formatNumber(income)}/s)` : ''}`);
    }
  }, 20);

  // Sparkles on loaded generators.
  system.runInterval(() => {
    let budget = 48;
    for (const key of Object.keys(generators)) {
      if (budget-- <= 0) break;
      const [dimensionId, x, y, z] = key.split('|');
      try {
        world.getDimension(dimensionId).spawnParticle('minecraft:villager_happy', { x: +x + 0.5, y: +y + 1.1, z: +z + 0.5 });
      } catch {
        // unloaded chunk
      }
    }
  }, 40);
});
