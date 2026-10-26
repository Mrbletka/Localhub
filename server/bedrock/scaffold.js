// Project templates. Each template produces a complete, importable add-on
// (behavior pack + resource pack) that agents then extend.
import crypto from 'node:crypto';
import { BEDROCK, STUDIO_VERSION } from './versions.js';
import * as art from './art.js';
import { WorkspaceError } from '../workspace.js';

export const TEMPLATES = {
  blank: { label: 'Blank add-on', description: 'Behavior + resource pack with a script entry point. Start from scratch.' },
  modpack: { label: 'Content pack', description: 'Custom item, tool, block and recipes - the base for modpack-style content.' },
  simulator: { label: 'Simulator', description: 'Clicker simulator: tap to gain power, sell for coins, upgrade and rebirth.' },
  tycoon: { label: 'Tycoon', description: 'Place generators that earn money every second, buy upgrades, rebirth for multipliers.' },
};

export function slugify(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

export function namespaceFrom(name) {
  const words = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let ns = words.join('_').replace(/^[0-9_]+/, '').slice(0, 20).replace(/_+$/, '') || 'studio';
  return ns === 'minecraft' ? 'mc_addon' : ns;
}

export function validNamespace(ns) {
  return /^[a-z][a-z0-9_]{1,31}$/.test(ns) && ns !== 'minecraft' && ns !== 'minecraftEdu';
}

const json = (value) => JSON.stringify(value, null, 2) + '\n';
// Escape text placed inside single-quoted strings of generated scripts.
const esc = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function manifests(ctx) {
  const v = [1, 0, 0];
  const bp = {
    format_version: BEDROCK.manifestFormatVersion,
    header: {
      name: `${ctx.name} BP`,
      description: ctx.description || `${ctx.name} behavior pack`,
      uuid: ctx.uuids.bpHeader,
      version: v,
      min_engine_version: BEDROCK.minEngineVersion,
    },
    modules: [
      { type: 'data', uuid: ctx.uuids.bpData, version: v },
      { type: 'script', language: 'javascript', uuid: ctx.uuids.bpScript, version: v, entry: 'scripts/main.js' },
    ],
    dependencies: [
      { uuid: ctx.uuids.rpHeader, version: v },
      ...ctx.scriptModules.map((m) => ({ module_name: m, version: BEDROCK.scriptModules[m] })),
    ],
    metadata: { authors: ctx.author ? [ctx.author] : [], generated_with: { localhub_bedrock_studio: [STUDIO_VERSION] } },
  };
  const rp = {
    format_version: BEDROCK.manifestFormatVersion,
    header: {
      name: `${ctx.name} RP`,
      description: ctx.description || `${ctx.name} resource pack`,
      uuid: ctx.uuids.rpHeader,
      version: v,
      min_engine_version: BEDROCK.minEngineVersion,
    },
    modules: [{ type: 'resources', uuid: ctx.uuids.rpModule, version: v }],
    dependencies: [{ uuid: ctx.uuids.bpHeader, version: v }],
    metadata: { authors: ctx.author ? [ctx.author] : [], generated_with: { localhub_bedrock_studio: [STUDIO_VERSION] } },
  };
  return { bp, rp };
}

function addTexture(ctx, key, canvas, kind = 'items') {
  const rel = `textures/${ctx.ns}/${kind === 'blocks' ? 'blocks/' : ''}${key}`;
  ctx.files[`RP/${rel}.png`] = canvas.png();
  const textureKey = `${ctx.ns}_${key}`;
  (kind === 'blocks' ? ctx.terrainTextures : ctx.itemTextures)[textureKey] = { textures: rel };
  return { textureKey, path: rel };
}

function addItem(ctx, { id, name, texture, category = 'items', components = {} }) {
  const identifier = `${ctx.ns}:${id}`;
  const { textureKey } = addTexture(ctx, id, texture);
  const langKey = `item.${identifier}.name`;
  ctx.lang.push(`${langKey}=${name}`);
  ctx.files[`BP/items/${id}.json`] = json({
    format_version: BEDROCK.formatVersions.item,
    'minecraft:item': {
      description: { identifier, menu_category: { category } },
      components: {
        'minecraft:icon': textureKey,
        'minecraft:display_name': { value: langKey },
        ...components,
      },
    },
  });
  return identifier;
}

function addBlock(ctx, { id, name, texture, category = 'construction', mapColor, components = {}, sound = 'stone' }) {
  const identifier = `${ctx.ns}:${id}`;
  const { textureKey } = addTexture(ctx, id, texture, 'blocks');
  const langKey = `tile.${identifier}.name`;
  ctx.lang.push(`${langKey}=${name}`);
  ctx.blockSounds[identifier] = { sound };
  ctx.files[`BP/blocks/${id}.json`] = json({
    format_version: BEDROCK.formatVersions.block,
    'minecraft:block': {
      description: { identifier, menu_category: { category } },
      components: {
        'minecraft:display_name': langKey,
        'minecraft:geometry': 'minecraft:geometry.full_block',
        'minecraft:material_instances': { '*': { texture: textureKey, render_method: 'opaque' } },
        'minecraft:destructible_by_mining': { seconds_to_destroy: 1.5 },
        ...(mapColor ? { 'minecraft:map_color': mapColor } : {}),
        ...components,
      },
    },
  });
  return identifier;
}

const UTIL_JS = `// Shared helpers for gameplay scripts.
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
`;

function blankMain(ctx) {
  return `import { world } from '@minecraft/server';

// Entry point for ${ctx.name}. Scripts start before the world is loaded (early execution):
// subscribe to events here, but touch world state only inside events or worldLoad.
world.afterEvents.worldLoad.subscribe(() => {
  console.warn('[${ctx.ns}] ${esc(ctx.name)} loaded');
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) player.sendMessage('§a${esc(ctx.name)}§r is running!');
});
`;
}

function modpack(ctx) {
  const ruby = addItem(ctx, { id: 'ruby', name: 'Ruby', texture: art.gem('#c3122a') });
  const sword = addItem(ctx, {
    id: 'ruby_sword',
    name: 'Ruby Sword',
    texture: art.sword('#c3122a'),
    category: 'equipment',
    components: {
      'minecraft:max_stack_size': 1,
      'minecraft:hand_equipped': true,
      'minecraft:damage': 8,
      'minecraft:durability': { max_durability: 900 },
      'minecraft:enchantable': { slot: 'sword', value: 14 },
      'minecraft:repairable': { repair_items: [{ items: [ruby], repair_amount: 225 }] },
    },
  });
  const block = addBlock(ctx, {
    id: 'ruby_block',
    name: 'Block of Ruby',
    texture: art.gemBlock('#c3122a'),
    mapColor: '#c3122a',
    components: { 'minecraft:destructible_by_mining': { seconds_to_destroy: 3 }, 'minecraft:light_emission': 3 },
  });
  ctx.files['BP/recipes/ruby_block.json'] = json({
    format_version: BEDROCK.formatVersions.recipe,
    'minecraft:recipe_shaped': {
      description: { identifier: `${ctx.ns}:ruby_block_from_rubies` },
      tags: ['crafting_table'],
      pattern: ['###', '###', '###'],
      key: { '#': { item: ruby } },
      unlock: [{ item: ruby }],
      result: { item: block, count: 1 },
    },
  });
  ctx.files['BP/recipes/ruby_from_block.json'] = json({
    format_version: BEDROCK.formatVersions.recipe,
    'minecraft:recipe_shapeless': {
      description: { identifier: `${ctx.ns}:rubies_from_block` },
      tags: ['crafting_table'],
      ingredients: [{ item: block }],
      unlock: [{ item: block }],
      result: { item: ruby, count: 9 },
    },
  });
  ctx.files['BP/recipes/ruby_sword.json'] = json({
    format_version: BEDROCK.formatVersions.recipe,
    'minecraft:recipe_shaped': {
      description: { identifier: `${ctx.ns}:ruby_sword` },
      tags: ['crafting_table'],
      pattern: ['#', '#', '/'],
      key: { '#': { item: ruby }, '/': { item: 'minecraft:stick' } },
      unlock: [{ item: ruby }],
      result: { item: sword, count: 1 },
    },
  });
  ctx.files['BP/scripts/main.js'] = `import { world } from '@minecraft/server';

// ${ctx.name}: content pack starter. Gameplay logic lives here; content lives in BP/items, BP/blocks, BP/recipes.
const RUBY_SWORD = '${sword}';

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) player.sendMessage('§c${esc(ctx.name)}§r loaded - craft rubies into a Ruby Sword!');
});

// Example of item-driven behaviour: ruby sword hits set the target on fire briefly.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity.typeId !== 'minecraft:player') return;
  const held = damagingEntity.getComponent('minecraft:equippable')?.getEquipment('Mainhand');
  if (held?.typeId === RUBY_SWORD) hitEntity.setOnFire(3, true);
});
`;
  ctx.hero = art.gem('#c3122a');
  ctx.design = `## Concept
A content pack that adds rubies: a gem item, a storage block and a ruby sword.

## Content
| Identifier | Type | Notes |
|---|---|---|
| ${ruby} | item | crafting material |
| ${sword} | item | 8 damage sword, sets targets on fire |
| ${block} | block | 9 rubies, emits light |

## Ideas / TODO
- [ ] Ruby ore that generates in the world (feature + feature rule)
- [ ] Ruby armor set
- [ ] A custom mob that drops rubies
`;
}

function simulator(ctx) {
  const clicker = addItem(ctx, {
    id: 'clicker',
    name: 'Power Wand',
    texture: art.wand('#b05cff'),
    category: 'equipment',
    components: { 'minecraft:max_stack_size': 1, 'minecraft:hand_equipped': true },
  });
  const menu = addItem(ctx, {
    id: 'sim_menu',
    name: 'Simulator Menu',
    texture: art.coin(),
    components: { 'minecraft:max_stack_size': 1 },
  });
  ctx.scriptModules.push('@minecraft/server-ui');
  ctx.files['BP/scripts/lib/util.js'] = UTIL_JS;
  ctx.files['BP/scripts/config.js'] = `// Balance values for ${ctx.name}. The Economy Designer agent tunes these.
export const CONFIG = {
  namespace: '${ctx.ns}',
  title: '${esc(ctx.name)}',
  items: { clicker: '${clicker}', menu: '${menu}' },
  menuIcon: 'textures/${ctx.ns}/sim_menu',
  basePowerPerClick: 1,
  clickCooldownTicks: 4,
  coinsPerPower: 1,
  upgrade: { baseCost: 15, costGrowth: 1.55, powerPerLevel: 0.5 },
  rebirth: { baseCost: 5000, costGrowth: 3, bonusPerRebirth: 1 },
};
`;
  ctx.files['BP/scripts/main.js'] = `import { world, system, DisplaySlotId, ObjectiveSortOrder } from '@minecraft/server';
import { ActionFormData, MessageFormData } from '@minecraft/server-ui';
import { CONFIG } from './config.js';
import { formatNumber, getNumber, setNumber, addNumber, giveItem, hasItem, ensureObjective, toScore } from './lib/util.js';

const NS = CONFIG.namespace;
const KEY = {
  power: \`\${NS}:power\`,
  coins: \`\${NS}:coins\`,
  level: \`\${NS}:click_level\`,
  rebirths: \`\${NS}:rebirths\`,
};
const lastClick = new Map();
let coinsBoard;

const rebirthBonus = (p) => 1 + getNumber(p, KEY.rebirths) * CONFIG.rebirth.bonusPerRebirth;
const powerPerClick = (p) => CONFIG.basePowerPerClick * (1 + getNumber(p, KEY.level) * CONFIG.upgrade.powerPerLevel) * rebirthBonus(p);
const upgradeCost = (level) => Math.floor(CONFIG.upgrade.baseCost * CONFIG.upgrade.costGrowth ** level);
const rebirthCost = (rebirths) => Math.floor(CONFIG.rebirth.baseCost * CONFIG.rebirth.costGrowth ** rebirths);

function sell(player) {
  const power = getNumber(player, KEY.power);
  if (power <= 0) return player.sendMessage('§cNothing to sell - use your wand first!');
  const coins = power * CONFIG.coinsPerPower * rebirthBonus(player);
  setNumber(player, KEY.power, 0);
  addNumber(player, KEY.coins, coins);
  player.playSound('random.orb');
  player.sendMessage(\`§aSold for §e\${formatNumber(coins)}§a coins.\`);
}

function upgrade(player) {
  const level = getNumber(player, KEY.level);
  const cost = upgradeCost(level);
  if (getNumber(player, KEY.coins) < cost) return player.sendMessage(\`§cYou need §e\${formatNumber(cost)}§c coins.\`);
  addNumber(player, KEY.coins, -cost);
  setNumber(player, KEY.level, level + 1);
  player.playSound('random.levelup');
  player.sendMessage(\`§aWand upgraded to level §b\${level + 1}§a!\`);
}

function rebirth(player) {
  const rebirths = getNumber(player, KEY.rebirths);
  const cost = rebirthCost(rebirths);
  if (getNumber(player, KEY.coins) < cost) return player.sendMessage(\`§cRebirth needs §e\${formatNumber(cost)}§c coins.\`);
  new MessageFormData()
    .title('Rebirth?')
    .body(\`Reset your coins, power and wand level to gain a permanent §d+\${CONFIG.rebirth.bonusPerRebirth * 100}%§r bonus.\`)
    .button1('Rebirth!')
    .button2('Not yet')
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection !== 0) return;
      setNumber(player, KEY.coins, 0);
      setNumber(player, KEY.power, 0);
      setNumber(player, KEY.level, 0);
      setNumber(player, KEY.rebirths, rebirths + 1);
      player.playSound('random.totem');
      world.sendMessage(\`§d\${player.name} reached rebirth \${rebirths + 1}!\`);
    });
}

function openMenu(player) {
  const level = getNumber(player, KEY.level);
  const rebirths = getNumber(player, KEY.rebirths);
  new ActionFormData()
    .title(CONFIG.title)
    .body(
      \`§7Power: §b\${formatNumber(getNumber(player, KEY.power))}\\n\` +
        \`§7Coins: §e\${formatNumber(getNumber(player, KEY.coins))}\\n\` +
        \`§7Per click: §a\${formatNumber(powerPerClick(player))}\\n\` +
        \`§7Rebirths: §d\${rebirths}\`,
    )
    .button('Sell power', CONFIG.menuIcon)
    .button(\`Upgrade wand\\n§8\${formatNumber(upgradeCost(level))} coins\`)
    .button(\`Rebirth\\n§8\${formatNumber(rebirthCost(rebirths))} coins\`)
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      [sell, upgrade, rebirth][res.selection]?.(player);
    });
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack.typeId === CONFIG.items.menu) return openMenu(player);
  if (itemStack.typeId !== CONFIG.items.clicker) return;
  const now = system.currentTick;
  if (now - (lastClick.get(player.id) ?? -1000) < CONFIG.clickCooldownTicks) return;
  lastClick.set(player.id, now);
  const gained = powerPerClick(player);
  addNumber(player, KEY.power, gained);
  player.playSound('random.pop', { pitch: 1.5, volume: 0.5 });
  player.onScreenDisplay.setActionBar(\`§b+\${formatNumber(gained)} power\`);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  if (!hasItem(player, CONFIG.items.clicker)) giveItem(player, CONFIG.items.clicker);
  if (!hasItem(player, CONFIG.items.menu)) giveItem(player, CONFIG.items.menu);
  player.sendMessage(\`§dWelcome to \${CONFIG.title}!§r Use the wand to gain power, open the menu to sell and upgrade.\`);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => lastClick.delete(playerId));

world.afterEvents.worldLoad.subscribe(() => {
  coinsBoard = ensureObjective(\`\${NS}_coins\`, '§eCoins');
  world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective: coinsBoard, sortOrder: ObjectiveSortOrder.Descending });

  // HUD + leaderboard refresh twice a second.
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      const coins = getNumber(player, KEY.coins);
      coinsBoard.setScore(player, toScore(coins));
      if (system.currentTick - (lastClick.get(player.id) ?? -1000) > 30) {
        player.onScreenDisplay.setActionBar(\`§bPower \${formatNumber(getNumber(player, KEY.power))}  §eCoins \${formatNumber(coins)}\`);
      }
    }
  }, 10);
});
`;
  ctx.hero = art.wand('#b05cff');
  ctx.icon = ['#2a1748', '#5b2a86'];
  ctx.design = `## Concept
A clicker simulator. Players tap the **Power Wand** to gain power, sell power for coins in the
**Simulator Menu**, buy wand upgrades and rebirth for permanent multipliers.

## Core loop
1. Use wand -> +power (\`basePowerPerClick x (1 + level x powerPerLevel) x rebirthBonus\`)
2. Menu -> Sell: power -> coins (\`coinsPerPower x rebirthBonus\`)
3. Menu -> Upgrade: cost \`baseCost x costGrowth^level\`
4. Menu -> Rebirth: resets coins/power/level, +\`bonusPerRebirth\` permanent multiplier

All numbers live in \`BP/scripts/config.js\`. Player progress is stored in dynamic properties.

## Ideas / TODO
- [ ] Pets that multiply power (entities that follow the player)
- [ ] Zones/worlds unlocked by rebirths
- [ ] Daily rewards and quests
- [ ] Leaderboard floating text
`;
}

function tycoon(ctx) {
  const tablet = addItem(ctx, {
    id: 'tycoon_tablet',
    name: 'Tycoon Tablet',
    texture: art.tablet('#3d9ddc'),
    components: { 'minecraft:max_stack_size': 1 },
  });
  const tiers = [
    { id: 'generator_t1', name: 'Basic Generator', color: '#3ddc84', cost: 25, income: 1 },
    { id: 'generator_t2', name: 'Turbo Generator', color: '#3d9ddc', cost: 500, income: 12 },
    { id: 'generator_t3', name: 'Quantum Generator', color: '#b05cff', cost: 10000, income: 150 },
  ].map((t) => ({
    ...t,
    block: addBlock(ctx, {
      id: t.id,
      name: t.name,
      texture: art.machine(t.color),
      mapColor: t.color,
      sound: 'metal',
      components: {
        'minecraft:destructible_by_mining': { seconds_to_destroy: 0.5 },
        'minecraft:destructible_by_explosion': false,
        'minecraft:light_emission': 6,
      },
    }),
  }));
  ctx.scriptModules.push('@minecraft/server-ui');
  ctx.files['BP/scripts/lib/util.js'] = UTIL_JS;
  ctx.files['BP/scripts/config.js'] = `// Balance values for ${ctx.name}. The Economy Designer agent tunes these.
export const CONFIG = {
  namespace: '${ctx.ns}',
  title: '${esc(ctx.name)}',
  items: { tablet: '${tablet}' },
  startingMoney: 25,
  maxGeneratorsPerPlayer: 40,
  // income is money per second per placed generator
  generators: [
${tiers.map((t) => `    { block: '${t.block}', name: '${t.name}', cost: ${t.cost}, income: ${t.income}, icon: 'textures/${ctx.ns}/blocks/${t.id}' },`).join('\n')}
  ],
  upgrade: { baseCost: 100, costGrowth: 1.75, incomeBonusPerLevel: 0.25 },
  rebirth: { baseCost: 50000, costGrowth: 4, bonusPerRebirth: 0.5 },
};
`;
  ctx.files['BP/scripts/main.js'] = `import { world, system, DisplaySlotId, ObjectiveSortOrder } from '@minecraft/server';
import { ActionFormData, MessageFormData } from '@minecraft/server-ui';
import { CONFIG } from './config.js';
import { formatNumber, getNumber, setNumber, addNumber, getJson, setJson, giveItem, hasItem, ensureObjective, toScore } from './lib/util.js';

const NS = CONFIG.namespace;
const KEY = {
  money: \`\${NS}:money\`,
  level: \`\${NS}:income_level\`,
  rebirths: \`\${NS}:rebirths\`,
  started: \`\${NS}:started\`,
};
const GENERATORS_KEY = \`\${NS}:generators\`;
const TIERS = new Map(CONFIG.generators.map((g) => [g.block, g]));

/** Placed generators: "dimension|x|y|z" -> { owner: playerId, block: typeId } */
let generators = {};
let moneyBoard;

const locKey = (dimensionId, { x, y, z }) => \`\${dimensionId}|\${x}|\${y}|\${z}\`;
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
  const form = new ActionFormData().title('Buy generators').body(\`§7Money: §a$\${formatNumber(getNumber(player, KEY.money))}\`);
  for (const g of CONFIG.generators) form.button(\`\${g.name}\\n§8$\${formatNumber(g.cost)} - $\${formatNumber(g.income)}/s\`, g.icon);
  form.show(player).then((res) => {
    if (res.canceled || res.selection === undefined) return;
    const g = CONFIG.generators[res.selection];
    if (getNumber(player, KEY.money) < g.cost) return player.sendMessage(\`§cYou need §a$\${formatNumber(g.cost)}§c.\`);
    addNumber(player, KEY.money, -g.cost);
    giveItem(player, g.block);
    player.playSound('random.orb');
    player.sendMessage(\`§aBought a \${g.name}. Place it to start earning!\`);
  });
}

function upgrade(player) {
  const level = getNumber(player, KEY.level);
  const cost = upgradeCost(level);
  if (getNumber(player, KEY.money) < cost) return player.sendMessage(\`§cYou need §a$\${formatNumber(cost)}§c.\`);
  addNumber(player, KEY.money, -cost);
  setNumber(player, KEY.level, level + 1);
  player.playSound('random.levelup');
  player.sendMessage(\`§aIncome upgraded to level \${level + 1} (+\${Math.round(CONFIG.upgrade.incomeBonusPerLevel * 100)}% each).\`);
}

function rebirth(player) {
  const rebirths = getNumber(player, KEY.rebirths);
  const cost = rebirthCost(rebirths);
  if (getNumber(player, KEY.money) < cost) return player.sendMessage(\`§cRebirth needs §a$\${formatNumber(cost)}§c.\`);
  new MessageFormData()
    .title('Rebirth?')
    .body('Your money, upgrades and generators reset. You keep a permanent income bonus.')
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
      world.sendMessage(\`§d\${player.name} reached rebirth \${rebirths + 1}!\`);
    });
}

function openMenu(player) {
  const level = getNumber(player, KEY.level);
  const rebirths = getNumber(player, KEY.rebirths);
  new ActionFormData()
    .title(CONFIG.title)
    .body(
      \`§7Money: §a$\${formatNumber(getNumber(player, KEY.money))}\\n\` +
        \`§7Income: §a$\${formatNumber(incomePerSecond(player))}/s\\n\` +
        \`§7Generators: §f\${owned(player.id).length}/\${CONFIG.maxGeneratorsPerPlayer}\\n\` +
        \`§7Rebirths: §d\${rebirths}\`,
    )
    .button('Buy generators', CONFIG.generators[0].icon)
    .button(\`Upgrade income\\n§8$\${formatNumber(upgradeCost(level))}\`)
    .button(\`Rebirth\\n§8$\${formatNumber(rebirthCost(rebirths))}\`)
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
    return player.sendMessage(\`§cGenerator limit reached (\${CONFIG.maxGeneratorsPerPlayer}).\`);
  }
  generators[locKey(dimension.id, block.location)] = { owner: player.id, block: block.typeId };
  save();
  player.onScreenDisplay.setActionBar(\`§a\${tier.name} online: +$\${formatNumber(tier.income * incomeMultiplier(player))}/s\`);
});

// Only the owner may break a generator. Before-events are read-only, so messages go through system.run.
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const record = generators[locKey(event.dimension.id, event.block.location)];
  if (record && record.owner !== event.player.id) {
    event.cancel = true;
    const player = event.player;
    system.run(() => player.sendMessage('§cThat generator belongs to someone else.'));
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
  player.sendMessage(\`§bWelcome to \${CONFIG.title}!§r Place generators to earn money. Use the tablet to buy more.\`);
});

world.afterEvents.worldLoad.subscribe(() => {
  generators = getJson(world, GENERATORS_KEY, {});
  moneyBoard = ensureObjective(\`\${NS}_money\`, '§aMoney');
  world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective: moneyBoard, sortOrder: ObjectiveSortOrder.Descending });

  // Pay income every second.
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      const income = incomePerSecond(player);
      const money = income > 0 ? addNumber(player, KEY.money, income) : getNumber(player, KEY.money);
      moneyBoard.setScore(player, toScore(money));
      player.onScreenDisplay.setActionBar(\`§a$\${formatNumber(money)}  §7(+$\${formatNumber(income)}/s)\`);
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
`;
  ctx.hero = art.machine('#3ddc84');
  ctx.icon = ['#10324a', '#1d5e3c'];
  ctx.design = `## Concept
A tycoon. Players place generators that pay money every second, buy more and better generators
from the **Tycoon Tablet**, upgrade their income and rebirth for permanent multipliers.

## Generators
| Block | Cost | Income/s |
|---|---|---|
${tiers.map((t) => `| ${t.block} | ${t.cost} | ${t.income} |`).join('\n')}

## Systems
- Ownership: placed generators are stored in a world dynamic property (\`${ctx.ns}:generators\`); only the owner can break them.
- Income: \`sum(generator income) x (1 + level x incomeBonusPerLevel) x rebirthBonus\`, paid every 20 ticks.
- Balance: everything lives in \`BP/scripts/config.js\`.

## Ideas / TODO
- [ ] Conveyor/dropper visuals with entities carrying "ore" to a seller block
- [ ] Plot claiming so each player gets a base
- [ ] Offline earnings on join
- [ ] More generator tiers with custom models
`;
}

const BUILDERS = { modpack, simulator, tycoon };

export async function createProject(ws, options = {}) {
  const name = String(options.name || '').trim();
  if (!name) throw new WorkspaceError('Project name is required');
  const template = options.template || 'blank';
  if (!TEMPLATES[template]) throw new WorkspaceError(`Unknown template "${template}". Use one of: ${Object.keys(TEMPLATES).join(', ')}`);
  const slug = slugify(options.slug || name);
  if (!slug) throw new WorkspaceError('Project name must contain letters or numbers');
  const ns = options.namespace ? String(options.namespace).toLowerCase() : namespaceFrom(name);
  if (!validNamespace(ns)) throw new WorkspaceError(`Invalid namespace "${ns}" - use lowercase letters, digits and _ (2-32 chars, not "minecraft")`);
  if (await ws.exists(slug)) throw new WorkspaceError(`A project named "${slug}" already exists`, 409);

  const ctx = {
    name,
    slug,
    ns,
    description: String(options.description || '').trim(),
    author: String(options.author || '').trim(),
    scriptModules: ['@minecraft/server'],
    uuids: Object.fromEntries(['bpHeader', 'bpData', 'bpScript', 'rpHeader', 'rpModule'].map((k) => [k, crypto.randomUUID()])),
    files: {},
    lang: [],
    itemTextures: {},
    terrainTextures: {},
    blockSounds: {},
    hero: null,
    icon: ['#1f2a44', '#3b1f4a'],
    design: '## Concept\n_Describe the add-on here. Agents keep this file up to date._\n\n## Ideas / TODO\n- [ ] \n',
  };

  if (BUILDERS[template]) BUILDERS[template](ctx);
  else ctx.files['BP/scripts/main.js'] = blankMain(ctx);
  if (!ctx.files['BP/scripts/main.js']) ctx.files['BP/scripts/main.js'] = blankMain(ctx);

  const { bp, rp } = manifests(ctx);
  ctx.files['BP/manifest.json'] = json(bp);
  ctx.files['RP/manifest.json'] = json(rp);
  const icon = art.packIcon(ctx.hero || art.gem('#4f8cff'), ...ctx.icon).png();
  ctx.files['BP/pack_icon.png'] = icon;
  ctx.files['RP/pack_icon.png'] = icon;
  ctx.files['RP/texts/languages.json'] = json(['en_US']);
  ctx.files['RP/texts/en_US.lang'] = [`pack.name=${name}`, `pack.description=${ctx.description || name}`, ...ctx.lang].join('\n') + '\n';
  ctx.files['RP/textures/item_texture.json'] = json({ resource_pack_name: slug, texture_name: 'atlas.items', texture_data: ctx.itemTextures });
  ctx.files['RP/textures/terrain_texture.json'] = json({
    resource_pack_name: slug,
    texture_name: 'atlas.terrain',
    padding: 8,
    num_mip_levels: 4,
    texture_data: ctx.terrainTextures,
  });
  if (Object.keys(ctx.blockSounds).length) {
    ctx.files['RP/blocks.json'] = json({ format_version: BEDROCK.formatVersions.blocksJson, ...ctx.blockSounds });
  }
  ctx.files['project.json'] = json({
    name,
    slug,
    type: template,
    namespace: ns,
    version: [1, 0, 0],
    description: ctx.description,
    author: ctx.author,
    tags: [template],
    created: new Date().toISOString(),
    library: { summary: ctx.description || TEMPLATES[template].description, featured: false, icon: 'RP/pack_icon.png' },
  });
  ctx.files['DESIGN.md'] = `# ${name}\n\nTemplate: **${TEMPLATES[template].label}** · Namespace: \`${ns}\`\n\n${ctx.design}`;

  for (const [rel, data] of Object.entries(ctx.files)) await ws.write(`${slug}/${rel}`, data);
  await ws.mkdir(`${slug}/.studio`);
  return { slug, namespace: ns, template, files: Object.keys(ctx.files).map((f) => `${slug}/${f}`) };
}
