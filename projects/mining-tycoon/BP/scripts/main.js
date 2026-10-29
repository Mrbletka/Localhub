import { world, system, DisplaySlotId, ObjectiveSortOrder } from '@minecraft/server';
import { ActionFormData, MessageFormData } from '@minecraft/server-ui';
import { CONFIG } from './config.js';
import { formatNumber, getNumber, setNumber, addNumber, getJson, setJson, giveItem, hasItem, ensureObjective, toScore } from './lib/util.js';

const NS = CONFIG.namespace;
const KEY = {
  money: `${NS}:money`,
  level: `${NS}:income_level`,
  rebirths: `${NS}:rebirths`,
  started: `${NS}:started`,
};
const GENERATORS_KEY = `${NS}:generators`;
const TIERS = new Map(CONFIG.generators.map((g) => [g.block, g]));

/** Placed generators: "dimension|x|y|z" -> { owner: playerId, block: typeId } */
let generators = {};
let moneyBoard;

const locKey = (dimensionId, { x, y, z }) => `${dimensionId}|${x}|${y}|${z}`;
const save = () => setJson(world, GENERATORS_KEY, generators);
const owned = (playerId) => Object.entries(generators).filter(([, g]) => g.owner === playerId);

const rebirthBonus = (p) => 1 + getNumber(p, KEY.rebirths) * CONFIG.rebirth.bonusPerRebirth;
const incomeMultiplier = (p) => (1 + getNumber(p, KEY.level) * CONFIG.upgrade.incomeBonusPerLevel) * rebirthBonus(p);
const upgradeCost = (level) => Math.floor(CONFIG.upgrade.baseCost * CONFIG.upgrade.costGrowth ** level);
const rebirthCost = (rebirths) => Math.floor(CONFIG.rebirth.baseCost * CONFIG.rebirth.costGrowth ** rebirths);

function incomePerSecond(player) {
  let base = 0;
  for (const [, g] of owned(player.id)) base += TIERS.get(g.block)?.income ?? 0;
  return base * incomeMultiplier(player);
}

function buyMenu(player) {
  const form = new ActionFormData().title('Buy drills').body(`§7Money: §a$${formatNumber(getNumber(player, KEY.money))}`);
  for (const g of CONFIG.generators) form.button(`${g.name}\n§8$${formatNumber(g.cost)} - $${formatNumber(g.income)}/s`, g.icon);
  form.show(player).then((res) => {
    if (res.canceled || res.selection === undefined) return;
    const g = CONFIG.generators[res.selection];
    if (getNumber(player, KEY.money) < g.cost) return player.sendMessage(`§cYou need §a$${formatNumber(g.cost)}§c.`);
    addNumber(player, KEY.money, -g.cost);
    giveItem(player, g.block);
    player.playSound('random.orb');
    player.sendMessage(`§aBought a ${g.name}. Place it to start mining!`);
  });
}

function upgrade(player) {
  const level = getNumber(player, KEY.level);
  const cost = upgradeCost(level);
  if (getNumber(player, KEY.money) < cost) return player.sendMessage(`§cYou need §a$${formatNumber(cost)}§c.`);
  addNumber(player, KEY.money, -cost);
  setNumber(player, KEY.level, level + 1);
  player.playSound('random.levelup');
  player.sendMessage(`§aIncome upgraded to level ${level + 1} (+${Math.round(CONFIG.upgrade.incomeBonusPerLevel * 100)}% each).`);
}

function rebirth(player) {
  const rebirths = getNumber(player, KEY.rebirths);
  const cost = rebirthCost(rebirths);
  if (getNumber(player, KEY.money) < cost) return player.sendMessage(`§cRebirth needs §a$${formatNumber(cost)}§c.`);
  new MessageFormData()
    .title('Rebirth?')
    .body('Your money, upgrades and drills reset. You keep a permanent income bonus.')
    .button1('Rebirth!')
    .button2('Not yet')
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection !== 0) return;
      for (const [key] of owned(player.id)) {
        const [dimensionId, x, y, z] = key.split('|');
        try {
          world.getDimension(dimensionId).getBlock({ x: +x, y: +y, z: +z })?.setType('minecraft:air');
        } catch {
          // chunk not loaded - the record is dropped either way
        }
        delete generators[key];
      }
      save();
      setNumber(player, KEY.money, CONFIG.startingMoney);
      setNumber(player, KEY.level, 0);
      setNumber(player, KEY.rebirths, rebirths + 1);
      giveItem(player, CONFIG.generators[0].block);
      player.playSound('random.totem');
      world.sendMessage(`§d${player.name} reached rebirth ${rebirths + 1}!`);
    });
}

function openMenu(player) {
  const level = getNumber(player, KEY.level);
  const rebirths = getNumber(player, KEY.rebirths);
  new ActionFormData()
    .title(CONFIG.title)
    .body(
      `§7Money: §a$${formatNumber(getNumber(player, KEY.money))}\n` +
        `§7Income: §a$${formatNumber(incomePerSecond(player))}/s\n` +
        `§7Drills: §f${owned(player.id).length}/${CONFIG.maxGeneratorsPerPlayer}\n` +
        `§7Rebirths: §d${rebirths}`,
    )
    .button('Buy drills', CONFIG.generators[0].icon)
    .button(`Upgrade income\n§8$${formatNumber(upgradeCost(level))}`)
    .button(`Rebirth\n§8$${formatNumber(rebirthCost(rebirths))}`)
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      [buyMenu, upgrade, rebirth][res.selection]?.(player);
    });
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack.typeId === CONFIG.items.tablet) openMenu(player);
});

world.afterEvents.playerPlaceBlock.subscribe(({ player, block, dimension }) => {
  const tier = TIERS.get(block.typeId);
  if (!tier) return;
  if (owned(player.id).length >= CONFIG.maxGeneratorsPerPlayer) {
    block.setType('minecraft:air');
    giveItem(player, tier.block);
    return player.sendMessage(`§cDrill limit reached (${CONFIG.maxGeneratorsPerPlayer}).`);
  }
  generators[locKey(dimension.id, block.location)] = { owner: player.id, block: block.typeId };
  save();
  player.onScreenDisplay.setActionBar(`§a${tier.name} drilling: +$${formatNumber(tier.income * incomeMultiplier(player))}/s`);
});

// Only the owner may break a generator. Before-events are read-only, so messages go through system.run.
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const record = generators[locKey(event.dimension.id, event.block.location)];
  if (record && record.owner !== event.player.id) {
    event.cancel = true;
    const player = event.player;
    system.run(() => player.sendMessage('§cThat drill belongs to someone else.'));
  }
});

world.afterEvents.playerBreakBlock.subscribe(({ block, dimension }) => {
  const key = locKey(dimension.id, block.location);
  if (generators[key]) {
    delete generators[key];
    save();
  }
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  if (!player.getDynamicProperty(KEY.started)) {
    player.setDynamicProperty(KEY.started, true);
    setNumber(player, KEY.money, CONFIG.startingMoney);
    giveItem(player, CONFIG.generators[0].block);
  }
  if (!hasItem(player, CONFIG.items.tablet)) giveItem(player, CONFIG.items.tablet);
  player.sendMessage(`§bWelcome to ${CONFIG.title}!§r Place drills to mine ore for cash. Use the Miner's Tablet to buy more.`);
});

world.afterEvents.worldLoad.subscribe(() => {
  generators = getJson(world, GENERATORS_KEY, {});
  moneyBoard = ensureObjective(`${NS}_money`, '§aMoney');
  world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective: moneyBoard, sortOrder: ObjectiveSortOrder.Descending });

  // Pay income every second.
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      const income = incomePerSecond(player);
      const money = income > 0 ? addNumber(player, KEY.money, income) : getNumber(player, KEY.money);
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
