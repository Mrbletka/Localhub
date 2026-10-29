// Balance values for Mining Tycoon. The Economy Designer agent tunes these.
export const CONFIG = {
  namespace: 'mining_tycoon',
  title: 'Mining Tycoon',
  items: { tablet: 'mining_tycoon:tycoon_tablet' },
  startingMoney: 25,
  maxGeneratorsPerPlayer: 40,
  // income is money per second per placed generator
  generators: [
    { block: 'mining_tycoon:generator_t1', name: 'Stone Drill', cost: 25, income: 1, icon: 'textures/mining_tycoon/blocks/generator_t1' },
    { block: 'mining_tycoon:generator_t2', name: 'Iron Drill', cost: 500, income: 12, icon: 'textures/mining_tycoon/blocks/generator_t2' },
    { block: 'mining_tycoon:generator_t3', name: 'Diamond Drill', cost: 10000, income: 150, icon: 'textures/mining_tycoon/blocks/generator_t3' },
  ],
  upgrade: { baseCost: 100, costGrowth: 1.75, incomeBonusPerLevel: 0.25 },
  rebirth: { baseCost: 50000, costGrowth: 4, bonusPerRebirth: 0.5 },
};
