import { world, system, DisplaySlotId, ObjectiveSortOrder } from '@minecraft/server';
import { CONFIG } from './config.js';
import { formatNumber, getNumber, setNumber, getJson, setJson, giveItem, hasItem, ensureObjective, toScore } from './lib/util.js';
import { loadSessions, sessionsOf, activeSession, sessionKey, inActivePlot, onSessionDelete } from './sessions.js';
import { showStartMenu, fullScreenMenu } from './menu.js';

const NS = CONFIG.namespace;
const GENERATORS_KEY = `${NS}:generators`;
const TIERS = new Map(CONFIG.generators.map((g) => [g.block, g]));

/** Placed generators: "dimension|x|y|z" -> { owner: playerId, slot: session slot, block: typeId } */
let generators = {};
let moneyBoard;

const locKey = (dimensionId, { x, y, z }) => `${dimensionId}|${x}|${y}|${z}`;
const save = () => setJson(world, GENERATORS_KEY, generators);
const owned = (playerId, slot) => Object.entries(generators).filter(([, g]) => g.owner === playerId && (g.slot ?? 0) === slot);

// Money, income level and rebirths of the player's active session (0 when not in a session).
const stat = (player, name) => {
  const slot = activeSession(player);
  return slot === undefined ? 0 : getNumber(player, sessionKey(slot, name));
};
const setStat = (player, name, value) => {
  const slot = activeSession(player);
  if (slot !== undefined) setNumber(player, sessionKey(slot, name), value);
  return value;
};
const addStat = (player, name, delta) => setStat(player, name, stat(player, name) + delta);

const rebirthBonus = (p) => 1 + stat(p, 'rebirths') * CONFIG.rebirth.bonusPerRebirth;
const incomeMultiplier = (p) => (1 + stat(p, 'income_level') * CONFIG.upgrade.incomeBonusPerLevel) * rebirthBonus(p);
const upgradeCost = (level) => Math.floor(CONFIG.upgrade.baseCost * CONFIG.upgrade.costGrowth ** level);
const rebirthCost = (rebirths) => Math.floor(CONFIG.rebirth.baseCost * CONFIG.rebirth.costGrowth ** rebirths);

function incomePerSecond(player) {
  const slot = activeSession(player);
  if (slot === undefined) return 0;
  let base = 0;
  for (const [, g] of owned(player.id, slot)) base += TIERS.get(g.block)?.income ?? 0;
  return base * incomeMultiplier(player);
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

function buy(player, g) {
  if (stat(player, 'money') < g.cost) return player.sendMessage(`§cYou need §a$${formatNumber(g.cost)}§c for a ${g.name}.`);
  addStat(player, 'money', -g.cost);
  giveItem(player, g.block);
  player.playSound('random.orb');
  player.sendMessage(`§aBought a ${g.name}. Place it to start mining!`);
}

function upgrade(player) {
  const level = stat(player, 'income_level');
  const cost = upgradeCost(level);
  if (stat(player, 'money') < cost) return player.sendMessage(`§cYou need §a$${formatNumber(cost)}§c.`);
  addStat(player, 'money', -cost);
  setStat(player, 'income_level', level + 1);
  player.playSound('random.levelup');
  player.sendMessage(`§aIncome upgraded to level ${level + 1} (+${Math.round(CONFIG.upgrade.incomeBonusPerLevel * 100)}% each).`);
}

function rebirth(player, slot) {
  if (activeSession(player) !== slot) return;
  const rebirths = stat(player, 'rebirths');
  const cost = rebirthCost(rebirths);
  if (stat(player, 'money') < cost) return player.sendMessage(`§cRebirth needs §a$${formatNumber(cost)}§c.`);
  removeDrills(owned(player.id, slot));
  setStat(player, 'money', CONFIG.startingMoney);
  setStat(player, 'income_level', 0);
  setStat(player, 'rebirths', rebirths + 1);
  giveItem(player, CONFIG.generators[0].block);
  player.playSound('random.totem');
  world.sendMessage(`§d${player.name} reached rebirth ${rebirths + 1}!`);
}

/** Miner's Tablet: one full-screen form with the shop and the rebirth confirmation as sub-pages. */
function openMenu(player) {
  const slot = activeSession(player);
  if (slot === undefined) return showStartMenu(player);
  const level = stat(player, 'income_level');
  const rebirths = stat(player, 'rebirths');
  const buttons = CONFIG.generators.map((g) => ({
    list: 'tablet_shop',
    text: `${g.name} - $${formatNumber(g.cost)}\n§7+$${formatNumber(g.income)}/s each`,
    run: (p) => buy(p, g),
  }));
  buttons.push(
    { list: 'tablet_upgrade', text: `Upgrade income\n§7Level ${level + 1} - $${formatNumber(upgradeCost(level))}`, run: upgrade },
    { list: 'tablet_rebirth', text: `Rebirth! - $${formatNumber(rebirthCost(rebirths))}\n§7Bonus x${+(1 + (rebirths + 1) * CONFIG.rebirth.bonusPerRebirth).toFixed(2)}`, run: (p) => rebirth(p, slot) },
    { list: 'tablet_bottom', text: 'Main menu', run: showStartMenu },
  );
  const body =
    `Session ${slot + 1} - Money §a$${formatNumber(stat(player, 'money'))}§r\n` +
    `Income §a$${formatNumber(incomePerSecond(player))}/s§r - Drills ${owned(player.id, slot).length}/${CONFIG.maxGeneratorsPerPlayer} - Rebirths §d${rebirths}`;
  fullScreenMenu(player, { form: 'tablet', body, buttons });
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack.typeId === CONFIG.items.tablet) openMenu(player);
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
  if (owned(player.id, slot).length >= CONFIG.maxGeneratorsPerPlayer) {
    block.setType('minecraft:air');
    giveItem(player, tier.block);
    return player.sendMessage(`§cDrill limit reached (${CONFIG.maxGeneratorsPerPlayer}).`);
  }
  generators[locKey(dimension.id, block.location)] = { owner: player.id, slot, block: block.typeId };
  save();
  player.onScreenDisplay.setActionBar(`§a${tier.name} drilling: +$${formatNumber(tier.income * incomeMultiplier(player))}/s`);
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
  moneyBoard = ensureObjective(`${NS}_money`, '§aMoney');
  world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective: moneyBoard, sortOrder: ObjectiveSortOrder.Descending });

  // Pay income every second to each player's active session.
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      if (activeSession(player) === undefined) continue;
      const income = incomePerSecond(player);
      const money = income > 0 ? addStat(player, 'money', income) : stat(player, 'money');
      moneyBoard.setScore(player, toScore(money));
      player.onScreenDisplay.setActionBar(`§a$${formatNumber(money)}  §7(+$${formatNumber(income)}/s)`);
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
