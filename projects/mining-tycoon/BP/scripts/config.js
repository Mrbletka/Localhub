// Balance values for Mining Tycoon. The Economy Designer agent tunes these.
// PLACEHOLDER PRICES: every cost/value here is a first guess - see "Balance notes - TO TUNE LATER" in DESIGN.md.
export const CONFIG = {
  namespace: 'mining_tycoon',
  title: 'Mining Tycoon',
  items: { tablet: 'mining_tycoon:tycoon_tablet' },
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
  // Ore field inside each mine plot, relative to the plot centre: x -radiusX..radiusX, z zFrom..zTo, `height` layers.
  field: { radiusX: 4, zFrom: -7, zTo: 1, height: 2, respawnSeconds: 4 },

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
  // Private mine plots in a grid far from spawn: plot i sits at origin + (i % perRow, i / perRow) x spacing.
  plots: {
    dimension: 'minecraft:overworld',
    origin: { x: 10000, y: 80, z: 10000 },
    spacing: 48,
    radius: 12, // plot is (2 x radius + 1) blocks wide
    perRow: 16,
    clearHeight: 16,
    floor: 'minecraft:polished_deepslate',
    border: 'minecraft:deepslate_bricks',
    light: 'minecraft:lantern',
  },
};
