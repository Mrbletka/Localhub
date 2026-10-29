// Balance values for Mining Tycoon. The Economy Designer agent tunes these.
// PLACEHOLDER PRICES: every cost/value here is a first guess - see "Balance notes - TO TUNE LATER" in DESIGN.md.
export const CONFIG = {
  namespace: 'mining_tycoon',
  title: 'Mining Tycoon',
  items: { tablet: 'mining_tycoon:tycoon_tablet' },
  blocks: { lift: 'mining_tycoon:lift', trader: 'mining_tycoon:trader' },
  startingMoney: 0,

  // Hand mining. value = cash per ore; pick = pick tier needed to break it. Hardness lives in BP/blocks/ore_*.json.
  ores: [
    { id: 'rock', block: 'mining_tycoon:ore_rock', name: 'Mine Rock', value: 1, pick: 1 },
    { id: 'coal', block: 'mining_tycoon:ore_coal', name: 'Coal Ore', value: 4, pick: 1 },
    { id: 'copper', block: 'mining_tycoon:ore_copper', name: 'Copper Ore', value: 12, pick: 2 },
    { id: 'iron', block: 'mining_tycoon:ore_iron', name: 'Iron Ore', value: 35, pick: 3 },
    { id: 'gold', block: 'mining_tycoon:ore_gold', name: 'Gold Ore', value: 100, pick: 4 },
    { id: 'ruby', block: 'mining_tycoon:ore_ruby', name: 'Ruby Ore', value: 300, pick: 5 },
    { id: 'diamond', block: 'mining_tycoon:ore_diamond', name: 'Diamond Ore', value: 900, pick: 6 },
  ],
  // Pick tiers in order (tier = index + 1). Mining speed lives in BP/items/pick_*.json (minecraft:digger).
  picks: [
    { item: 'mining_tycoon:pick_1', name: 'Wooden Pick', cost: 0 },
    { item: 'mining_tycoon:pick_2', name: 'Stone Pick', cost: 60 },
    { item: 'mining_tycoon:pick_3', name: 'Copper Pick', cost: 800 },
    { item: 'mining_tycoon:pick_4', name: 'Iron Pick', cost: 7500 },
    { item: 'mining_tycoon:pick_5', name: 'Gold Pick', cost: 60000 },
    { item: 'mining_tycoon:pick_6', name: 'Diamond Pick', cost: 450000 },
  ],
  // Mine levels in order (level = index + 1): weights of the ores that grow in the ore field.
  mines: [
    { name: 'Shallow Mine', cost: 0, weights: { rock: 80, coal: 20 } },
    { name: 'Copper Seam', cost: 120, weights: { rock: 60, coal: 25, copper: 15 } },
    { name: 'Iron Vein', cost: 1500, weights: { rock: 50, coal: 20, copper: 18, iron: 12 } },
    { name: 'Gold Cavern', cost: 12000, weights: { rock: 40, coal: 15, copper: 18, iron: 15, gold: 12 } },
    { name: 'Ruby Depths', cost: 100000, weights: { rock: 35, coal: 10, copper: 15, iron: 15, gold: 15, ruby: 10 } },
    { name: 'Diamond Core', cost: 750000, weights: { rock: 30, coal: 8, copper: 12, iron: 15, gold: 15, ruby: 12, diamond: 8 } },
  ],
  // The mine on every plot (BP/scripts/mine_builder.js). Bump `version` when the layout changes: older mines are rebuilt
  // the next time their session is entered (drills placed in them go back to the inventory).
  mine: {
    version: 3, // 3: lift in the tunnel, Ore Trader on the landing
    half: 15, // a mine fills x/z -half..half around its plot centre
    vein: { x: [-6, 6], z: [-12, -9], y: [1, 4] }, // the ore field: a vein in the north wall (y 0 = mine floor)
    respawnSeconds: 4,
  },

  // Resources: what ores give on expeditions (items you carry home). sell = Ore Trader price before the cash multiplier.
  resources: [
    { id: 'coal', item: 'mining_tycoon:res_coal', name: 'Coal Chunk', sell: 6 },
    { id: 'copper', item: 'mining_tycoon:res_copper', name: 'Copper Chunk', sell: 16 },
    { id: 'iron', item: 'mining_tycoon:res_iron', name: 'Iron Chunk', sell: 45 },
    { id: 'gold', item: 'mining_tycoon:res_gold', name: 'Gold Chunk', sell: 130 },
    { id: 'ruby', item: 'mining_tycoon:res_ruby', name: 'Rough Ruby', sell: 380 },
    { id: 'diamond', item: 'mining_tycoon:res_diamond', name: 'Rough Diamond', sell: 1100 },
  ],
  // Products: what the machines make from resources (the Ore Trader buys them too).
  products: [
    { id: 'crushed_copper', item: 'mining_tycoon:crushed_copper', name: 'Crushed Copper', sell: 10 },
    { id: 'crushed_iron', item: 'mining_tycoon:crushed_iron', name: 'Crushed Iron', sell: 28 },
    { id: 'crushed_gold', item: 'mining_tycoon:crushed_gold', name: 'Crushed Gold', sell: 80 },
    { id: 'copper_bar', item: 'mining_tycoon:copper_bar', name: 'Copper Bar', sell: 40 },
    { id: 'iron_bar', item: 'mining_tycoon:iron_bar', name: 'Iron Bar', sell: 110 },
    { id: 'gold_bar', item: 'mining_tycoon:gold_bar', name: 'Gold Bar', sell: 320 },
    { id: 'cut_ruby', item: 'mining_tycoon:cut_ruby', name: 'Cut Ruby', sell: 1000 },
    { id: 'cut_diamond', item: 'mining_tycoon:cut_diamond', name: 'Cut Diamond', sell: 3000 },
  ],
  // Machines (BP/scripts/machines.js): one of each per session, built in its bay on the landing of the mine (bay: x, y,
  // z from the plot centre; the block's north face is its front). seconds: time per item at each speed level; the
  // next level costs upgradeCost x machineUpgradeGrowth^(level - 1). recipes: in -> out (count per item, default 1).
  machines: [
    {
      id: 'smelter', block: 'mining_tycoon:smelter', name: 'Smelter', cost: 250, bay: [-6, 1, 11],
      about: 'Smelts chunks and crushed ore into bars, worth about 2.5x. Burns Coal Chunks.',
      seconds: [6, 4.5, 3.4, 2.5, 1.8], upgradeCost: 400,
      fuel: { id: 'coal', items: 4 }, // one Coal Chunk smelts 4 items
      recipes: [
        { in: 'crushed_copper', out: 'copper_bar' }, { in: 'crushed_iron', out: 'iron_bar' }, { in: 'crushed_gold', out: 'gold_bar' },
        { in: 'copper', out: 'copper_bar' }, { in: 'iron', out: 'iron_bar' }, { in: 'gold', out: 'gold_bar' },
      ],
    },
    {
      id: 'crusher', block: 'mining_tycoon:crusher', name: 'Crusher', cost: 3000, bay: [-4, 1, 11],
      about: 'Crushes a metal chunk into 2 crushed ore: smelted, that is 2 bars instead of 1.',
      seconds: [5, 3.8, 2.8, 2, 1.4], upgradeCost: 4000,
      recipes: [{ in: 'copper', out: 'crushed_copper', count: 2 }, { in: 'iron', out: 'crushed_iron', count: 2 }, { in: 'gold', out: 'crushed_gold', count: 2 }],
    },
    {
      id: 'cutter', block: 'mining_tycoon:gem_cutter', name: 'Gem Cutter', cost: 8000, bay: [-2, 1, 11],
      about: 'Cuts rough gems into jewels, worth about 2.7x.',
      seconds: [15, 11, 8, 6, 4], upgradeCost: 10000,
      recipes: [{ in: 'ruby', out: 'cut_ruby' }, { in: 'diamond', out: 'cut_diamond' }],
    },
  ],
  machineUpgradeGrowth: 2.2,
  machineFrame: 'mining_tycoon:machine_frame', // an empty bay: tap it to build its machine

  // Expeditions: a fresh cave per run (BP/scripts/cave_builder.js), one slot per player far from the mines.
  expedition: {
    origin: { x: -20000, y: 150, z: 10000 },
    spacing: 128,
    perRow: 16,
    half: 22, // a cave fills x/z -half..half around its centre
    height: 16, // y 0..height
    lightSeconds: 180, // the lantern's light energy
    maxCreatures: 8,
    levels: [
      {
        name: 'Shallow Caves',
        // ore weights next to the lift -> at the far end of the cave
        near: { coal: 55, copper: 35, iron: 10 },
        far: { copper: 25, iron: 30, gold: 25, ruby: 14, diamond: 6 },
        creatures: ['minecraft:zombie', 'minecraft:zombie', 'minecraft:skeleton', 'minecraft:spider'],
      },
    ],
  },

  // Drills: automation, unlocked at this mine level. income is money per second per placed drill.
  drillsUnlockMine: 3,
  maxGeneratorsPerPlayer: 40, // per session
  generators: [
    { block: 'mining_tycoon:generator_t1', name: 'Stone Drill', cost: 2000, income: 4, icon: 'textures/mining_tycoon/blocks/generator_t1' },
    { block: 'mining_tycoon:generator_t2', name: 'Iron Drill', cost: 20000, income: 35, icon: 'textures/mining_tycoon/blocks/generator_t2' },
    { block: 'mining_tycoon:generator_t3', name: 'Diamond Drill', cost: 200000, income: 300, icon: 'textures/mining_tycoon/blocks/generator_t3' },
  ],
  // Ore value: +incomeBonusPerLevel cash from ores and drills per level.
  upgrade: { baseCost: 40, costGrowth: 1.6, incomeBonusPerLevel: 0.25 },
  rebirth: { baseCost: 1000000, costGrowth: 4, bonusPerRebirth: 0.5 },

  // Save slots per player. Each session has its own mine plot, money, upgrades, rebirths and drills.
  sessions: { slots: 2 },
  // Mines sit in a grid far from spawn: plot i is centred at origin + (i % perRow, i / perRow) x spacing.
  plots: {
    dimension: 'minecraft:overworld',
    origin: { x: 10000, y: 80, z: 10000 },
    spacing: 48,
    perRow: 16,
  },
};
