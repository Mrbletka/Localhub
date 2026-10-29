# Mining Tycoon

Template: **Tycoon** · Namespace: `mining_tycoon`

## Concept
You run a mine. Place **drills** that dig ore and turn it into cash every second. Spend the cash on more and better
drills, upgrade your mining speed, and dig into deeper, richer layers. When the mine is maxed out, **rebirth**: the mine
resets but you keep a permanent cash multiplier and push even deeper next time.

## Core loop
1. Earn cash from placed drills (paid every second).
2. Open the **Miner's Tablet** -> buy drills, upgrade income.
3. Place more/better drills -> income grows.
4. Save up -> rebirth for a permanent multiplier -> repeat faster.

## Drills (current)
| Block | Name | Cost | Income/s |
|---|---|---|---|
| mining_tycoon:generator_t1 | Stone Drill | 25 | 1 |
| mining_tycoon:generator_t2 | Iron Drill | 500 | 12 |
| mining_tycoon:generator_t3 | Diamond Drill | 10000 | 150 |

## Systems (current)
- Ownership: placed drills are stored in a world dynamic property (`mining_tycoon:generators`); only the owner can break them.
- Income: `sum(drill income) x (1 + level x incomeBonusPerLevel) x rebirthBonus`, paid every 20 ticks.
- Limit: 40 drills per player.
- Balance: everything lives in `BP/scripts/config.js`.

## Roadmap (built step by step)
- [x] **Step 1 - Foundation:** project from the tycoon template, rethemed to mining (drills, Miner's Tablet, texts).
- [ ] **Step 2 - Look:** pixel-art drill textures (stone/iron/diamond), Miner's Tablet icon, pack icon.
- [ ] **Step 3 - More drills:** 6+ tiers (e.g. Copper, Gold, Emerald, Amethyst, Obsidian) with a tuned price curve.
- [ ] **Step 4 - Ore feel:** drills pop ore chunks / mining particles and sounds; optional Ore Seller block.
- [ ] **Step 5 - Plots:** each player claims a mine plot; drills only work on your own plot.
- [ ] **Step 6 - Depth layers:** rebirths unlock deeper layers (Stone -> Deepslate -> Magma Core) with new drill tiers.
- [ ] **Step 7 - Extras:** offline earnings, leaderboard, daily bonus.
