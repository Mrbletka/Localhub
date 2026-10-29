// Balance values for Mining Tycoon. The Economy Designer agent tunes these.
export const CONFIG = {
  namespace: 'mining_tycoon',
  title: 'Mining Tycoon',
  items: { tablet: 'mining_tycoon:tycoon_tablet' },
  startingMoney: 25,
  maxGeneratorsPerPlayer: 40, // per session
  // income is money per second per placed generator
  generators: [
    { block: 'mining_tycoon:generator_t1', name: 'Stone Drill', cost: 25, income: 1, icon: 'textures/mining_tycoon/blocks/generator_t1' },
    { block: 'mining_tycoon:generator_t2', name: 'Iron Drill', cost: 500, income: 12, icon: 'textures/mining_tycoon/blocks/generator_t2' },
    { block: 'mining_tycoon:generator_t3', name: 'Diamond Drill', cost: 10000, income: 150, icon: 'textures/mining_tycoon/blocks/generator_t3' },
  ],
  upgrade: { baseCost: 100, costGrowth: 1.75, incomeBonusPerLevel: 0.25 },
  rebirth: { baseCost: 50000, costGrowth: 4, bonusPerRebirth: 0.5 },
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
