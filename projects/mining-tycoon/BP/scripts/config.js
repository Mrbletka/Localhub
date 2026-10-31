// Balance values for Mining Tycoon. The Economy Designer agent tunes these.
// PLACEHOLDER PRICES: every cost/value here is a first guess - see "Balance notes - TO TUNE LATER" in DESIGN.md.
export const CONFIG = {
  namespace: 'mining_tycoon',
  title: 'Mining Tycoon',
  items: { tablet: 'mining_tycoon:tycoon_tablet' },
  blocks: { lift: 'mining_tycoon:lift', trader: 'mining_tycoon:trader' },
  startingMoney: 0,

  // Ores (custom blocks): breaking one gives its resource item (home vein and caves alike); pick = pick tier needed.
  // Hardness lives in BP/blocks/ore_*.json. Mine Rock is no longer used (old veins are re-rolled).
  ores: [
    { id: 'rock', block: 'mining_tycoon:ore_rock', name: 'Mine Rock', pick: 1 },
    { id: 'coal', block: 'mining_tycoon:ore_coal', name: 'Coal Ore', pick: 1 },
    { id: 'copper', block: 'mining_tycoon:ore_copper', name: 'Copper Ore', pick: 2 },
    { id: 'iron', block: 'mining_tycoon:ore_iron', name: 'Iron Ore', pick: 3 },
    { id: 'gold', block: 'mining_tycoon:ore_gold', name: 'Gold Ore', pick: 4 },
    { id: 'ruby', block: 'mining_tycoon:ore_ruby', name: 'Ruby Ore', pick: 5 },
    { id: 'diamond', block: 'mining_tycoon:ore_diamond', name: 'Diamond Ore', pick: 6 },
  ],
  // Pick tiers in order (tier = index + 1), crafted at the Pickaxe Station from `needs` (money + goods by id).
  // Mining speed lives in BP/items/pick_*.json (minecraft:digger).
  picks: [
    { item: 'mining_tycoon:pick_1', name: 'Wooden Pick', needs: {} },
    { item: 'mining_tycoon:pick_2', name: 'Stone Pick', needs: { money: 50 } },
    { item: 'mining_tycoon:pick_3', name: 'Copper Pick', needs: { money: 150, copper_bar: 4 } },
    { item: 'mining_tycoon:pick_4', name: 'Iron Pick', needs: { money: 1200, iron_bar: 6 } },
    { item: 'mining_tycoon:pick_5', name: 'Gold Pick', needs: { money: 9000, gold_bar: 6 } },
    { item: 'mining_tycoon:pick_6', name: 'Diamond Pick', needs: { money: 60000, gold_bar: 8, cut_ruby: 4 } },
  ],
  // The home vein: weights of the ores that grow there (only ores your pick can mine; a new pick re-rolls it).
  vein: { coal: 50, copper: 35, iron: 15 },
  // The mine on every plot (BP/scripts/mine_builder.js). Bump `version` when the layout changes: older mines are rebuilt
  // the next time their session is entered (drills placed in them go back to the inventory).
  mine: {
    version: 4, // 4: workshop row on the landing, market stall on the east side, drill pads on the west side only
    half: 15, // a mine fills x/z -half..half around its plot centre
    vein: { x: [-6, 6], z: [-12, -9], y: [1, 4] }, // the ore field: a vein in the north wall (y 0 = mine floor)
    respawnSeconds: 4,
    trader: [10, 1, 1], // the Ore Trader's market stall
  },

  // Resources: what ores give (items). sell = Ore Trader price before the rebirth bonus.
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
  // Workshop stations (BP/scripts/workshop.js) in the row on the landing (bay: x, y, z from the plot centre; north
  // face = front). Each upgrade level lists what crafting it needs (money + goods by id).
  workshop: {
    stations: [
      { id: 'picks', block: 'mining_tycoon:pick_station', name: 'Pickaxe Station', bay: [2, 1, 11] },
      { id: 'gear', block: 'mining_tycoon:gear_bench', name: 'Gear Bench', bay: [4, 1, 11] },
      { id: 'cart', block: 'mining_tycoon:cart_depot', name: 'Mine Cart', bay: [6, 1, 11] },
    ],
    // Lantern: seconds of light per expedition.
    lantern: [
      { seconds: 180, needs: {} },
      { seconds: 240, needs: { money: 300, copper_bar: 3 } },
      { seconds: 300, needs: { money: 2500, iron_bar: 5 } },
      { seconds: 390, needs: { money: 20000, gold_bar: 5 } },
      { seconds: 480, needs: { money: 90000, cut_ruby: 3 } },
    ],
    // Backpack: how many items one expedition can bring up.
    backpack: [
      { size: 24, needs: {} },
      { size: 48, needs: { money: 200, copper_bar: 4 } },
      { size: 96, needs: { money: 1800, iron_bar: 6 } },
      { size: 160, needs: { money: 15000, gold_bar: 6 } },
      { size: 256, needs: { money: 120000, cut_diamond: 2 } },
    ],
  },

  // Expeditions: a fresh cave per run (BP/scripts/cave_builder.js), one slot per session far from the mines. Cave levels
  // are unlocked with the Mine Cart (`needs`); deeper caves are bigger, richer, darker and more dangerous.
  expedition: {
    origin: { x: -20000, y: 150, z: 10000 },
    spacing: 128,
    perRow: 16,
    height: 16, // y 0..height
    levels: [
      {
        name: 'Shallow Caves', palette: 'stone', half: 22, maxCreatures: 6, needs: {},
        about: 'Stone tunnels: coal and copper by the lift, iron and gold further in.',
        // ore weights next to the lift -> at the far end of the cave
        near: { coal: 50, copper: 38, iron: 12 },
        far: { copper: 25, iron: 35, gold: 25, ruby: 10, diamond: 5 },
        creatures: ['minecraft:zombie', 'minecraft:zombie', 'minecraft:skeleton', 'minecraft:spider'],
      },
      {
        name: 'Deep Caverns', palette: 'deep', half: 24, maxCreatures: 8, needs: { money: 3000, iron_bar: 8 },
        about: 'Deepslate halls: iron and gold, rubies and diamonds further in. Husks and cave spiders.',
        near: { copper: 30, iron: 45, gold: 25 },
        far: { iron: 20, gold: 40, ruby: 25, diamond: 15 },
        creatures: ['minecraft:zombie', 'minecraft:husk', 'minecraft:skeleton', 'minecraft:cave_spider'],
      },
      {
        name: 'Crystal Grotto', palette: 'crystal', half: 26, maxCreatures: 9, needs: { money: 25000, gold_bar: 8 },
        about: 'Glowing amethyst caves full of gold, rubies and diamonds. Strays shoot slowing arrows.',
        near: { iron: 30, gold: 45, ruby: 25 },
        far: { gold: 25, ruby: 40, diamond: 35 },
        creatures: ['minecraft:stray', 'minecraft:stray', 'minecraft:cave_spider', 'minecraft:zombie'],
      },
      {
        name: 'Magma Core', palette: 'magma', half: 28, maxCreatures: 10, needs: { money: 150000, cut_diamond: 4 },
        about: 'Blackstone and magma, rubies and diamonds everywhere. Wither skeletons, blazes, magma cubes.',
        near: { gold: 40, ruby: 35, diamond: 25 },
        far: { ruby: 35, diamond: 65 },
        creatures: ['minecraft:wither_skeleton', 'minecraft:magma_cube', 'minecraft:blaze', 'minecraft:wither_skeleton'],
      },
    ],
  },

  // Drills: helpers on the drill pads (west side of the mine) that dig chunks into the session's drill bin while you
  // play it. Crafted at the Pickaxe Station once your pick is good enough (`pick`). makes: weights of what they dig.
  drills: {
    max: 12, // per session
    bin: 256, // the bin stops filling when it is full
    tiers: [
      { block: 'mining_tycoon:generator_t1', name: 'Stone Drill', pick: 3, seconds: 20, needs: { money: 2000, copper_bar: 4 }, makes: { coal: 55, copper: 45 } },
      { block: 'mining_tycoon:generator_t2', name: 'Iron Drill', pick: 4, seconds: 15, needs: { money: 20000, iron_bar: 8 }, makes: { copper: 40, iron: 45, gold: 15 } },
      { block: 'mining_tycoon:generator_t3', name: 'Diamond Drill', pick: 6, seconds: 12, needs: { money: 200000, cut_diamond: 3 }, makes: { iron: 30, gold: 45, ruby: 18, diamond: 7 } },
    ],
  },
  rebirth: { baseCost: 1000000, costGrowth: 4, bonusPerRebirth: 0.5 },
  // Perks: every rebirth gives a star; stars buy permanent perks for that session (level n costs costs[n - 1] stars).
  perks: [
    { id: 'light', name: 'Bright Lantern', about: '+30 s of light on every expedition', per: 30, costs: [1, 2, 3] },
    { id: 'pack', name: 'Deep Pockets', about: '+16 backpack room', per: 16, costs: [1, 2, 3] },
    { id: 'speed', name: 'Quick Machines', about: 'machines work 15% faster', per: 0.15, costs: [1, 2, 3] },
  ],
  // The player profile (BP/scripts/profile.js, top-right HUD): XP for every ore mined at home or in a cave (its pick
  // tier: Coal 1 ... Diamond 6), levels and ranks. It belongs to the player (all sessions) and survives rebirth.
  profile: {
    xp: { base: 20, step: 15 }, // XP from level L to L + 1 = base + step x (L - 1): 20, 35, 50 ... (to Lv 10: 720 XP)
    maxLevel: 99,
    ranks: [ // from this level on; badge = an item texture shown on the avatar
      { level: 1, name: 'Rookie', badge: 'pick_1' },
      { level: 5, name: 'Digger', badge: 'pick_2' },
      { level: 10, name: 'Prospector', badge: 'pick_3' },
      { level: 15, name: 'Miner', badge: 'pick_4' },
      { level: 20, name: 'Expert', badge: 'pick_5' },
      { level: 30, name: 'Master', badge: 'pick_6' },
      { level: 40, name: 'Legend', badge: 'cut_diamond' },
    ],
  },
  // The tutorial: quests for a new session (BP/scripts/tutorial.js), each with a money reward.
  quests: [
    { text: 'Mine 5 Coal at the vein', target: 'vein', count: 'mined_coal', goal: 5, reward: 25 },
    { text: 'Sell your coal at the Ore Trader', target: 'trader', count: 'sold', goal: 1, reward: 25 },
    { text: 'Craft a Stone Pick at the Pickaxe Station', target: 'picks', pick: 2, reward: 50 },
    { text: 'Mine 8 Copper at the vein', target: 'vein', count: 'mined_copper', goal: 8, reward: 50 },
    { text: 'Build the Smelter in its bay ($250)', target: 'smelter', machine: 'smelter', reward: 75 },
    { text: 'Smelt 4 Copper Bars and collect them', target: 'smelter', count: 'made_copper_bar', goal: 4, reward: 100 },
    { text: 'Craft the Copper Pick at the Pickaxe Station', target: 'picks', pick: 3, reward: 150 },
    { text: 'Ride the lift into the Shallow Caves', target: 'lift', count: 'expeditions', goal: 1, reward: 50 },
    { text: 'Bring a haul home: extract at the cave lift', target: 'cave_lift', count: 'extracts', goal: 1, reward: 250 },
  ],

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
