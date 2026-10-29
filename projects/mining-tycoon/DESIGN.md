# Mining Tycoon

Template: **Tycoon** · Namespace: `mining_tycoon`

## Concept
You run a mine - and below it lies the dark. From your home mine you ride the **lift** down on **expeditions** into a
cave that is freshly generated every run. Your **lantern's light** is the clock: mine as much as you dare, then get
back to the lift and **extract** with your haul. Let the light run out and the dark takes you - die down there and
everything you carried is lost. Back home, **machines** turn raw resources into valuable goods, the **trader** buys them,
and the **workshop** turns money and materials into progress: a **cart** for deeper, harder, richer cave levels, a
**pickaxe station** for better picks, a bigger **lantern**, a **backpack**, and machines that work while you're away.
A small safe vein at home gets you started.

## Core loop
0. Join -> full-screen **start menu** -> **Play** / **Create session** (2 save slots, each its own mine and save).
1. Mine the small safe vein at home -> first cash -> first pick upgrade.
2. Tap the **lift** at the end of your mine's tunnel -> **expedition**: a new cave, your lantern's light counting down.
3. Mine ores down there -> resource items in your inventory (Coal Chunk ... Rough Diamond). Richer ores lie further from
   the lift. Creatures come for you, more of them as your light fades.
4. Back at the lift -> **Extract** (keep everything) - or die / leave the game -> the haul is lost.
5. At home: sell at the **Ore Trader** (later: process in machines first for much more).
6. Upgrade (pick now; later the workshop: cart, pickaxe station, lantern, backpack, helper machines) -> deeper, longer,
   richer expeditions.

## Expeditions (step E1) - `BP/scripts/expedition.js`, `BP/scripts/cave_builder.js`, config `expedition`
- **Lift** (`mining_tycoon:lift`, steel cage door with a hazard stripe): in the back wall of the home mine's tunnel
  (tap: lift menu - **Descend** / **Not now**, with the light time and which ores your pick can mine) and in every
  cave's lift room (tap: **Extract** / **Keep mining**, with the haul and its value). Unbreakable.
- **Caves**: each session has its own cave slot (its plot index) in a grid at x -20000, z 10000, y 150, 128 apart. Every
  run builds a new cave from a fresh seed in a closed 45 x 45 x 17 stone box (`half` 22, `height` 16):
  - Lift room: 7 x 7 timber floor, 5 high, two hanging lanterns, the lift in its south wall; players arrive at its
    centre looking north. Three exits (north, west, east).
  - Tunnels: "diggers" that wander out of the exits on one gently rolling level (centre y 4-8, radius 1.6-2.7), steer
    away from the walls, branch (up to 11) and open round chambers (up to 5). Where tunnels meet at different heights,
    steps are cut into ledges until every floor can be walked to from the lift (sim: 99-100 % of the floor on every
    seed, nothing you can fall into and not climb out of).
  - Walls: stone, andesite, tuff, cobblestone (deepslate / cobbled deepslate low down) by seeded noise, gravel
    patches, dripstone and stalactites on ceilings, a little mossy cobblestone, a few cobwebs in tight corners.
  - Ores: deposits of 2-5 blocks that start on an exposed wall and grow into it (mining one exposes the next). The ore
    weights blend from the level's `near` (by the lift) to `far` (38+ blocks away) - richer the further you go.
    About 50-110 deposits per cave.
  - Built across ticks behind the loading screen like the home mine: one teleport into the lift room (slow falling and
    a safety floor first), then big rock fills around the room, column runs for tunnels/walls/ores, hanging blocks
    last; what was left of the previous run (creatures, items) is removed first.
- **Rules in caves**: only ores can be broken (with the same pick tiers as at home), nothing can be placed, other
  players can't break anything in your cave. Ores give **resource items** (Coal Chunk, Copper Chunk, Iron Chunk, Gold
  Chunk, Rough Ruby, Rough Diamond) - the haul.
- **Light energy** (`lightSeconds` 180): action bar `Light 2:41 |||||||||... Haul 12` every second (mining popups win
  for a moment). Over 30 % night vision; 30-10 % it flickers (night vision kept under 10 s, which makes the client
  flicker it) and darkness pulses; under 10 % no night vision and stronger darkness pulses; at 0 blindness and magic
  damage every second that grows (1, then +1 every 4 s). Warnings (title + sound) at 1:00, 0:30, 0:10 and when it is
  out.
- **Creatures**: zombies, skeletons, spiders (level `creatures`) spawned on cave floors 10-20 blocks from the player,
  after 10 quiet seconds: target count 1 at full light up to `maxCreatures` 8 at 0, one every 5-15 s (faster as the
  light fades). Tagged `mining_tycoon:creature` + `mining_tycoon:cave_<i>`, removed when the run ends.
- **No natural spawns**: the caves are dark, so any monster that spawns by itself in a cave box (or in a home mine)
  is removed at once (`entitySpawn`), as are item drops in caves that are not add-on items (creature loot).
- **Ending a run**:
  - **Extract** at the cave lift: the haul is safe; back home (loading screen), "Expedition complete!" notice with
    the haul and its value at the trader.
  - **Death**: on respawn (at home: the mine's spawn point) everything mined on that run is taken from the inventory
    ("The dark took you!" notice). Resources carried in from earlier runs are not at risk.
  - **Give up** from the Miner's Tablet (in a cave it shows Keep mining / Give up with a confirm page): same loss,
    lift home.
  - **Leaving the game** mid-run: on the next join the haul is taken and they are moved out of the cave at once
    (chat message); the start menu shows as usual.
  - Run state lives on the player (`mining_tycoon:run`: slot, cave, seed, level, light, haul, phase) and is saved on
    every ore and every 5 s, so a crash or quit can't keep a haul. After a script reload a player still in their cave
    carries on (the creature spots are planned again from the seed).
- `keepInventory` is turned on (world load), so picks and the tablet are never dropped.
- **Ore Trader** (`mining_tycoon:trader`, spruce stall with a coin sign, `BP/scripts/trader.js`) on the home mine's
  landing buys resources and machine products for `sell x cash multiplier` (into the active session's money). Its menu
  stays short for phones: **Sell everything**, **Sell products only** (keeps the chunks for the machines), **Close**.
  Prices (before the multiplier): Coal Chunk $6, Copper Chunk $16, Iron Chunk $45, Gold Chunk $130, Rough Ruby $380,
  Rough Diamond $1.1K; products below.
- Menus: the `notice` form (lift, extract, trader, results) and the `run` form (tablet in a cave) in the generator;
  icons `expedition` (lantern), `extract` (ore cart with an up arrow), `sell` (money bag).

## Machines (step E2) - `BP/scripts/machines.js`, config `machines`, `products`
- Three **machine bays** on the west side of the landing (x -6, -4, -2 at z 11, facing the hall; the old barrels there
  are gone). An empty bay is a **Machine Bay** frame (scaffold with a blueprint): tap it to build its machine. One of
  each per session; the machine block shows in its bay (`syncBays` on every session entry, also fixes older mines
  without a rebuild).
  | Machine | Cost | Makes | s per item (levels 1-5) | Next level |
  |---|---|---|---|---|
  | Smelter | $250 | Copper/Iron/Gold Chunk or Crushed ore -> Bar. Fuel: 1 Coal Chunk per 4 items | 6, 4.5, 3.4, 2.5, 1.8 | $400 x 2.2^(level-1) |
  | Crusher | $3K | Copper/Iron/Gold Chunk -> 2 Crushed ore (2 bars instead of 1) | 5, 3.8, 2.8, 2, 1.4 | $4K x 2.2^(level-1) |
  | Gem Cutter | $8K | Rough Ruby/Diamond -> Cut Ruby/Diamond | 15, 11, 8, 6, 4 | $10K x 2.2^(level-1) |
- Products (sell): Crushed Copper $10, Crushed Iron $28, Crushed Gold $80, Copper Bar $40, Iron Bar $110, Gold Bar
  $320, Cut Ruby $1K, Cut Diamond $3K. Chain value of one Gold Chunk: sold raw $130, smelted $320, crushed + smelted
  $640.
- Tap a built machine: one full-screen menu with at most 4 buttons - **Collect N items**, **Load N** (every accepted
  good you carry, plus just enough Coal Chunks to smelt it all), **Speed: level N - $cost**, **Close**. The body shows
  level and time per item, what is working and how long it takes, fuel, and what is ready.
- Work: every second, each machine of the player's **active session** works one second (one item at a time, in recipe
  order), wherever the player is - in the mine or on an expedition; nothing happens while they are offline or play
  another session. Chat messages when a machine is done or out of fuel. Working machines smoke / sparkle in the mine.
- State per session: player property `s<slot>:machines` = { machineId: { level, in, out, fuel, work, idle } }.
- Rebirth takes the machines down (what was in them, and whole coal of the fuel, comes back to the inventory); deleting
  a session deletes them.
- Items `mining_tycoon:crushed_copper/iron/gold`, `copper_bar/iron_bar/gold_bar`, `cut_ruby/cut_diamond`; blocks
  `mining_tycoon:smelter`, `crusher`, `gem_cutter`, `machine_frame` (north face = front, unbreakable, smelter glows).

## Roadmap - expeditions
- [x] **E1 First expedition:** lift, generated caves, light energy, creatures, resource items, extract or lose it all,
  Ore Trader.
- [x] **E2 Machines:** crusher, smelter, gem cutter at home turn chunks into bars and cut gems worth far more (takes time).
- [ ] **E3 Workshop:** craft with materials + money: cart (unlocks cave levels), pickaxe station (better picks),
  lantern (more light), backpack (capacity), helper machines that work while you're away (the drills' new job).
- [ ] **E4 Depths:** cave levels 2-5 (Deep Caverns, Crystal Grotto, Flooded Mines, Magma Core): bigger caves, richer ores,
  tougher custom creatures, hazards.
- [ ] **E5 Home rework + balance:** home mine upgrades become workshop upgrades, prices tuned with a progression
  simulator, rebirth revisited.

## Content
Ores (custom blocks, drop nothing; value is paid in cash). Hardness = seconds to break by hand; a pick divides it by its speed.
| Block | Name | Value | Hardness | Needs |
|---|---|---|---|---|
| mining_tycoon:ore_rock | Mine Rock | $1 | 1.2 | Wooden Pick |
| mining_tycoon:ore_coal | Coal Ore | $4 | 2 | Wooden Pick |
| mining_tycoon:ore_copper | Copper Ore | $12 | 3.5 | Stone Pick |
| mining_tycoon:ore_iron | Iron Ore | $35 | 6 | Copper Pick |
| mining_tycoon:ore_gold | Gold Ore | $100 | 10 | Iron Pick |
| mining_tycoon:ore_ruby | Ruby Ore | $300 | 16 | Gold Pick |
| mining_tycoon:ore_diamond | Diamond Ore | $900 | 25 | Diamond Pick |

Picks (items `mining_tycoon:pick_1`..`pick_6`; speed only works on ores):
| Tier | Name | Speed | Cost |
|---|---|---|---|
| 1 | Wooden Pick | 2 | start |
| 2 | Stone Pick | 4 | $60 |
| 3 | Copper Pick | 7 | $800 |
| 4 | Iron Pick | 12 | $7.5K |
| 5 | Gold Pick | 20 | $60K |
| 6 | Diamond Pick | 32 | $450K |

Mine levels (ore field weights, %):
| Level | Name | Cost | rock | coal | copper | iron | gold | ruby | diamond |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Shallow Mine | start | 80 | 20 | | | | | |
| 2 | Copper Seam | $120 | 60 | 25 | 15 | | | | |
| 3 | Iron Vein | $1.5K | 50 | 20 | 18 | 12 | | | |
| 4 | Gold Cavern | $12K | 40 | 15 | 18 | 15 | 12 | | |
| 5 | Ruby Depths | $100K | 35 | 10 | 15 | 15 | 15 | 10 | |
| 6 | Diamond Core | $750K | 30 | 8 | 12 | 15 | 15 | 12 | 8 |

Drills (unlock at mine level 3):
| Block | Name | Cost | Income/s |
|---|---|---|---|
| mining_tycoon:generator_t1 | Stone Drill | $2K | 4 |
| mining_tycoon:generator_t2 | Iron Drill | $20K | 35 |
| mining_tycoon:generator_t3 | Diamond Drill | $200K | 300 |

Other upgrades: **Ore value** +25% cash from ores and drills per level, cost $40 x 1.6^level. **Rebirth** $1M x 4^n,
+50% permanent cash per rebirth; resets money, pick, mine level, ore value and drills of that session.

## Balance notes - TO TUNE LATER
Every number above is a first guess so the loop can be played; they all live in `BP/scripts/config.js` (ore values,
pick costs, mine costs and weights, drills, upgrade and rebirth curves). Ore hardness is `seconds_to_destroy` in
`BP/blocks/ore_*.json`, pick speed is the `minecraft:digger` speed in `BP/items/pick_*.json`.
- [ ] Play the first 30 minutes and write a minute -> cash/s -> next purchase table here.
- [ ] Aim: 3-5 purchases in the first minute or two, first drill around 10 minutes, first rebirth 30-45 minutes.
- [ ] Check hand mining vs drills: drills should feel like a big boost at unlock, but mining must stay worth it.
- [ ] Check mining times: with the "right" pick every ore should take ~0.8 s; hardness/speed may need tweaking in game.
- [ ] Rebirth cost and bonus once the late game exists.
- [ ] Machines: build and speed costs vs what one expedition earns; product prices (bar ~2.5x, crushed+smelted
  ~5x, cut gem ~2.7x); fuel use. Machines only work while you play that session (offline progress could come with E3).
- [ ] Expeditions: haul per run vs the home vein (first runs only mine coal with the Wooden Pick), light time,
  creature count/pace, resource sell prices, ore density (`deposits` chance in cave_builder.js).

## Systems (current)
- Ownership: placed drills are stored in a world dynamic property (`mining_tycoon:generators`) with owner and session slot; only the owner can break them.
- Drill income: `sum(drill income) x cash multiplier`, paid every 20 ticks. Drills go on the drill pads only.
- Money shows in the action bar (no scoreboard; the old `mining_tycoon_money` sidebar is removed on world load).
- Limit: 40 drills per session.
- Start menu (`BP/scripts/menu.js`): shown on every join (retried every 5 ticks until the client can show it), and
  from Tablet > Main menu. It comes back if closed with Back, so players must choose:
  - **Play**: continue your last session (builds its mine first if it never finished). No sessions yet -> starts
    session 1.
  - **Create session** (only while you have no sessions): start session 1.
  - **Sessions** (once you have one) -> Sessions page: `Session N (playing)` + money and rebirths -> play it;
    `Slot N - Empty` -> create a session there; **Delete a session** -> Delete page (`Delete Session N` -> confirm
    page: **Yes, delete Session N** / **Keep it**); **Back**.
  - **Exit**: disconnects the player with a goodbye message. The host of a local world can't be disconnected, so they
    get a hint to leave from the pause menu instead.
- Join cover: short dark camera fades (1-1.5 s, re-sent on every menu attempt while joining) hide the world and HUD
  only while no menu is up: joining, Back on the start menu, the teleport into a mine. The full-screen menus and the
  loading screen cover everything else. A long fade can't be cut short on phones, so it would stay dark after the
  loading screen; when the player is in the mine the HUD comes back and `camera.clear()` ends any fade left.
- Loading screen: entering a session shows a third full-screen form (tag `§m§t§l`, no buttons): cave, logo,
  "Building your mine..." / "Heading into Session N..." and a gold pick striking a shaking gold ore. It opens a moment
  after the teleport (teleports close open forms), comes back if anything closes it while the mine is still loading,
  stays at least 2 s and closes (`uiManager.closeAllForms`, repeated until it is really gone) 1 s after the player
  stands in the mine; then the world fades in.
- Sessions (`BP/scripts/sessions.js`, world property `mining_tycoon:sessions`): 2 save slots per player (config
  `sessions.slots`). Each session is its own save: own mine plot, money, income level, rebirths (player properties
  `mining_tycoon:s<slot>:<name>`), placed drills (`slot` in each drill record) and unplaced drill items (stashed when
  you switch away, handed back when you return). Only the active session (`mining_tycoon:active_session`) earns.
  A new session starts with $0, a Wooden Pick and the Shallow Mine. Deleting one frees its plot; the next owner gets it rebuilt clean.
  Worlds from before sessions: the old plot, money, upgrades and rebirths become session 1.
- Hand mining (`BP/scripts/mining.js`): the ore field is the **vein** in the north wall of each mine, 13 wide, 4 high
  and 4 deep (config `mine.vein`, relative to the plot centre). Breaking an ore pays `value x cash multiplier` at once
  (`+$12 Copper Ore` popup; the money action bar waits for it) and the ore grows back after ~4-5 s, rolled from the
  session's mine level (never inside a player). Ores drop nothing (`loot_tables/blocks/ore_empty.json`).
  - An ore needs the pick tier in its config (`pick`); by hand or with a weaker pick the break is cancelled with a hint.
  - Picks (`mining_tycoon:pick_1..6`) follow the session: arriving in a session, upgrading, rebirth and respawning
    all make sure you hold exactly that session's pick. Pick speed only works on blocks tagged `mining_tycoon_ore`.
  - Arriving in a session refills empty vein cells; a mine upgrade (or rebirth) re-rolls the whole vein.
  - Players in a session get a short saturation effect every 10 s, so mining never makes them hungry.
- Miner's Tablet (`openMenu` in `main.js`): body shows session, money, pick, mine and cash multiplier (+ drill income).
  **Upgrades** -> Pick (next pick, price, ores it unlocks), Mine (next level, price, ores it adds), Ore value (+25%);
  **Drills** -> shop (locked until mine level 3: one "Locked" button); **Rebirth** -> confirm page (**Rebirth! - $cost**
  with the new bonus / **Not yet**); **Main menu** -> start menu. Buying or upgrading closes the menu.
- Session economy (`BP/scripts/economy.js`): money, income_level (ore value), rebirths, pick and mine_level per
  session; cash multiplier = `(1 + 0.25 x ore value level) x (1 + 0.5 x rebirths)` for ores and drills alike.
- Full-screen menus, one form per menu (`RP/ui/server_form.json` + `BP/scripts/menu_layout.js`, both generated by
  `tools/gen_server_form.py` - edit the menu tree there and run it):
  - A form whose title starts with a form tag (`§m§t§s` start menu, `§m§t§t` tablet) is drawn full screen: cave
    background `textures/mining_tycoon/ui/menu_bg` (128x64, drawn 32px past each edge to cover the screen safe area),
    logo, the body text on every page, a heading per sub-page and stone & gold buttons (nine-sliced
    `textures/mining_tycoon/ui/button`, `button_hover`, `button_pressed`; gold text, up to 2 lines). Other forms keep
    the normal look.
  - All pages of a menu are in that one form. Sub-pages open with **Navs**: on/off toggles inside the UI that turn into
    the sub-page's Back button, so changing page never closes the form. Only real choices go to the script.
  - Every real button text starts with an invisible list code (`§p§1§1§r`...) naming the page list it is drawn in;
    title flags (`§h§s` has sessions, `§f§1`/`§f§2` slot filled) show or hide Navs. Scripts use the names from
    `menu_layout.js` via `fullScreenMenu(player, { form, flags, body, buttons: [{ list, text, run }] })` in `menu.js`.
  - Without the resource pack every button shows in one plain list (including the delete confirmations).
  - Look and motion (all generated): pixel-art logo `ui/logo.png` (drops in with a bounce, then floats, two twinkling
    sparkles); the cave background lives in the screen's own background slot (`third_party_server_screen` ->
    `$screen_bg_content`, drawn full screen, outside the phone's safe area; shown only when the form title has one of
    our tags), stretched to the screen with `keep_ratio: false` (images keep their art's 2:1 ratio by default, so on
    a wider phone screen the cave stopped short of both edges). It stays still and has
    flickering lantern glows (`ui/fx_glow`), gems that twinkle on their own rhythm (`ui/fx_sparkle`), drifting dust
    (`ui/fx_dust`) and a minecart (`ui/fx_minecart`, cut out of the background) rolling smoothly along the rail every ~18 s.
    The menu content slides up when a menu opens. Effect positions are texel coordinates of `menu_bg.png`
    (`LIGHTS`, `GEMS`, `RAIL` in the generator) - update them if the background is repainted.
  - Icons: every button has a 16x16 icon on the left that bobs while the button is selected. Real buttons pass a
    texture as the form button icon (`icon('play')` -> `ui/icons/play`, or pick / ore / drill textures in the
    tablet); Navs have fixed icons in the generator (`icon=`, `back_icon=`). Icons: play, new_slot, sessions, session,
    exit, back, delete, upgrades, drills, rebirth, home, coin, lock.
- The mine (`BP/scripts/mine_builder.js`, config `mine`): every session plays in an enclosed underground cave, 31 x 31
  blocks around its plot centre (floor y 0, roof y 10), in a 16-wide grid at x/z 10000, y 80, 48 blocks apart.
  - Hall about 27 x 20 with rough rock walls (stone, andesite, tuff, cobbled deepslate, deepslate, a bit of mossy
    cobblestone, all chosen by seeded noise so a plot always looks the same), a ceiling 7-9 high in deepslate, tuff and
    dripstone with stalactites, three spruce arches with hanging lanterns, lanterns on chains, froglights in the roof.
  - North: the **ore vein** (x -6..6, z -12..-9, y 1..4) in a timber frame, gravel rubble in front of it.
  - Sides: **drill pads** (polished tuff in deepslate-tile frames, x 9..12 on both sides, z -4..6): drills can only
    stand on a pad.
  - South: a rail track runs from a dark tunnel (timber frame, blackstone back with the **expedition lift** in it at
    eye height) over a spruce landing with barrels and the **Ore Trader** to the vein. Players arrive on the rails at
    z 10 looking at the vein; their respawn point is set there. (Layout version 3; older mines are rebuilt on entry.)
  - Built across ticks with `system.runJob` while the loading screen shows: one teleport to the arrival spot first
    (teleports close menus), a safety floor under it, then the plan (computed across ticks too) goes in column by
    column bottom-up - never a solid block where the player stands - and hanging/attached blocks (lanterns, chains,
    stalactites, rails) go in last, top-down. Block ids are checked at runtime with fallbacks (`minecraft:chain` became
    `minecraft:iron_chain`; old versions get plain blocks where a state is unknown).
  - Each plot record stores the layout `version` it was built with; a session whose mine is older than
    `CONFIG.mine.version` (old floating platforms are version 1) gets it rebuilt on entry, and drills that stood in it
    go back to the inventory.
  - Protection: only the owner breaks blocks in a mine, and only ores and drills; only drills can be placed (on pads,
    in the active session's mine). Drills in your other session's mine can't be broken from this one.

## Roadmap (built step by step)
- [x] **Foundation:** project from the tycoon template, rethemed to mining (drills, Miner's Tablet, texts).
- [x] **Menu look:** pixel-art logo, button icons, animated background (pan, lanterns, gems, dust, minecart).
- [x] **Pack icon:** cave, logo and a gold pick striking gold ore (BP and RP).
- [ ] **Look:** pixel-art drill textures, Miner's Tablet icon.
- [ ] **Ore feel:** mining particles/sounds; drills that visibly mine the vein.
- [ ] **Growing mine (idea):** mine upgrades make the cave bigger / add chambers, rebirth layers change its look.
- [x] **Start menu + plots:** full-screen join menu (Play / Create session / Exit), private mine plots, drills only in your own mine.
- [x] **Underground mine:** enclosed cave with timber arches, lanterns, rails, an ore vein in the north wall and drill
  pads; old platforms are rebuilt automatically.
- [x] **Sessions:** 2 save slots per player with a full-screen slots menu; stone & gold menu buttons.
- [x] **One-form menus:** start menu, sessions, delete + confirm and the Miner's Tablet (shop, rebirth) switch pages
  without closing.
- [x] **Hand mining:** ore field in every mine, picks, mine levels, ore value; drills become automation (locked until
  mine level 3). Prices are placeholders (see Balance notes).
- [ ] **Balance pass:** tune all prices from real play (see Balance notes).
- [ ] **Ore bag (idea):** ores go into a bag with a capacity upgrade and are sold at a seller, instead of instant cash.
- [ ] **Depth layers:** rebirths unlock deeper layers (Stone -> Deepslate -> Magma Core) with new ores and drill tiers.
- [ ] **Extras:** offline earnings, leaderboard, daily bonus.
