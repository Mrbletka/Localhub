# Mining Tycoon

Template: **Tycoon** · Namespace: `mining_tycoon`

## Concept
You run a mine - and below it lies the dark. Mine the safe vein at home, or ride the **lift** into a cave that is new
every run: your lantern's **light** is the clock, die down there and that run's haul is lost. Every ore is an item.
**Machines** turn chunks into bars and cut gems worth far more; the **Ore Trader** buys everything; the **workshop**
turns money + bars + gems into a better pick, lantern, backpack, deeper cave levels and drills that dig for you.
**Rebirth** starts over with a permanent sell bonus. Everything feeds the same loop, and the Miner's Tablet always
shows the next goal.

## Core loop
1. Join -> full-screen **start menu** -> **Play** / **Create session** (2 save slots, each its own mine and save).
2. Arrive on the landing, facing the base: machine bays (west of the tunnel), the tunnel with the lift, the workshop
   (east of it); the Ore Trader's market stall is on the east side, drill pads on the west side, the vein in the north wall.
3. Mine -> resource items: the **vein** (safe, only ores your pick can mine) or an **expedition** (risky, rich).
4. Refine in the **machines** (Smelter, Crusher, Gem Cutter) or sell at the **Ore Trader** for money.
5. Craft at the **workshop**: pick (harder ores), lantern (more light), backpack (more haul), Mine Cart (deeper caves),
   drills (helpers). Each upgrade needs money + products, so every system matters.
6. Deeper caves -> richer ores -> better products -> ... -> **Rebirth** (x1.5 sell bonus per rebirth).

## Progression (route the tablet follows)
Stone Pick -> Smelter -> Copper Pick -> Lantern 4:00 -> Backpack 48 -> Crusher -> Iron Pick -> Deep Caverns -> Lantern
5:00 -> Backpack 96 -> Gold Pick -> Gem Cutter -> Crystal Grotto -> Lantern 6:30 -> Backpack 160 -> Diamond Pick ->
Magma Core -> Lantern 8:00 -> Backpack 256 -> Rebirth. (`ROUTE` in `BP/scripts/workshop.js`.)

| Pick (Pickaxe Station) | Mines | Needs |
|---|---|---|
| Wooden Pick | Coal | start |
| Stone Pick | + Copper | $50 |
| Copper Pick | + Iron | 4 Copper Bar + $150 |
| Iron Pick | + Gold | 6 Iron Bar + $1.2K |
| Gold Pick | + Ruby | 6 Gold Bar + $9K |
| Diamond Pick | + Diamond | 8 Gold Bar + 4 Cut Ruby + $60K |

| Level | Lantern (Gear Bench) | Backpack (Gear Bench) | Cave (Mine Cart) |
|---|---|---|---|
| 1 | 3:00 (start) | 24 (start) | Shallow Caves (start) |
| 2 | 4:00 - 3 Copper Bar + $300 | 48 - 4 Copper Bar + $200 | Deep Caverns - 8 Iron Bar + $3K |
| 3 | 5:00 - 5 Iron Bar + $2.5K | 96 - 6 Iron Bar + $1.8K | Crystal Grotto - 8 Gold Bar + $25K |
| 4 | 6:30 - 5 Gold Bar + $20K | 160 - 6 Gold Bar + $15K | Magma Core - 4 Cut Diamond + $150K |
| 5 | 8:00 - 3 Cut Ruby + $90K | 256 - 2 Cut Diamond + $120K | |

| Machine (bay) | Cost | Makes | s per item (speed levels 1-5) | Next speed level |
|---|---|---|---|---|
| Smelter | $250 | Chunk or Crushed ore -> Bar. Fuel: 1 Coal Chunk per 4 items | 6, 4.5, 3.4, 2.5, 1.8 | $400 x 2.2^(level-1) |
| Crusher | $3K | Copper/Iron/Gold Chunk -> 2 Crushed ore | 5, 3.8, 2.8, 2, 1.4 | $4K x 2.2^(level-1) |
| Gem Cutter | $8K | Rough Ruby/Diamond -> Cut Ruby/Diamond | 15, 11, 8, 6, 4 | $10K x 2.2^(level-1) |

| Drill (Pickaxe Station) | Unlocks with | Needs | Digs (one chunk every) |
|---|---|---|---|
| Stone Drill | Copper Pick | 4 Copper Bar + $2K | coal, copper (20 s) |
| Iron Drill | Iron Pick | 8 Iron Bar + $20K | copper, iron, gold (15 s) |
| Diamond Drill | Diamond Pick | 3 Cut Diamond + $200K | iron, gold, ruby, diamond (12 s) |

Rebirth: $1M x 4^rebirths; +50 % sell price per rebirth.

## Content
- Ores (custom blocks `mining_tycoon:ore_*`, drop nothing themselves; the script gives the resource item): coal (pick
  1), copper (2), iron (3), gold (4), ruby (5), diamond (6). `ore_rock` (Mine Rock) is no longer used; old veins are
  re-rolled. Hardness = seconds to break by hand; a pick divides it by its speed (`minecraft:digger` in
  `BP/items/pick_*.json`, only on blocks tagged `mining_tycoon_ore`).
- Resources (sell): Coal Chunk $6, Copper Chunk $16, Iron Chunk $45, Gold Chunk $130, Rough Ruby $380, Rough Diamond $1.1K.
- Products (sell): Crushed Copper $10, Crushed Iron $28, Crushed Gold $80, Copper Bar $40, Iron Bar $110, Gold Bar
  $320, Cut Ruby $1K, Cut Diamond $3K. One Gold Chunk: $130 raw, $320 smelted, $640 crushed + smelted.
- Blocks: lift, trader (market stall), machine_frame (empty bay), smelter / crusher / gem_cutter and their working
  `_on` blocks, pick_station, gear_bench, cart_depot, drills `generator_t1..3`, ores.

## Systems
- **Goods and costs** (`BP/scripts/goods.js`): resources + products are "goods"; upgrades cost `needs`
  (`{ money: 150, copper_bar: 4 }`): money of the active session plus goods from the inventory. Menus show progress
  (`Copper Bar 1/4, $150`, green when there is enough); paying takes nothing and names what is missing when short.
- **Economy** (`BP/scripts/economy.js`): per session (player properties `mining_tycoon:s<slot>:<name>`): money,
  rebirths, pick, lantern, backpack, cart (levels start at 1). Sell multiplier = 1 + 0.5 x rebirths. No cash per ore,
  no mine levels, no ore value upgrade any more (old properties are ignored and removed with the session).
- **Home vein** (`BP/scripts/mining.js`): 13 x 4 x 4 in the north wall. Every ore gives its resource item (`+1 Coal
  Chunk` card, counting up while you mine: `+4 Coal Chunk`) and grows back after ~4-5 s, rolled from `CONFIG.vein` (coal 50, copper 35, iron 15) among the ores the
  session's pick can mine - a Wooden Pick sees a coal vein. Crafting a pick (or rebirth) re-rolls the vein; arriving
  replaces empty cells, Mine Rock and ores the pick can't mine (retried while the mine loads).
- **Ore Trader** (`BP/scripts/trader.js`, market stall at x 10, z 1): **Sell everything** / **Sell products only**
  (keeps chunks for the machines) / **Close** - at most 3 buttons so it fits a phone.
- **Workshop** (`BP/scripts/workshop.js`): three stations on the landing east of the tunnel (x 2, 4, 6 at z 11), part
  of the mine layout (put back on entry if missing). One menu each, at most 3 buttons:
  - **Pickaxe Station**: craft the next pick (shows what it mines); build the best drill your pick unlocks.
  - **Gear Bench**: next lantern level, next backpack level.
  - **Mine Cart**: unlock the next cave level (with its description).
  - Crafting: sound, "Crafted!" notification card; the HUD shows the next goal. `nextGoal()` = the first unfinished step of
    `ROUTE`; shown in the tablet and in the home HUD (`Next: Copper Pick at the Pickaxe Station`).
- **Machines** (`BP/scripts/machines.js`): bays west of the tunnel (x -6, -4, -2 at z 11). Empty bay = Machine Bay frame
  (tap: build). Built machine menu (at most 4 buttons): **Collect N items**, **Load N** (everything it accepts + just
  enough coal), **Speed: level N**, **Close**. They work one item at a time, one second per second while you play that
  session (also on expeditions), message when done / out of fuel, smoke or sparkle while working. The bay block is the
  working `_on` model (animated fire, turning rollers, spinning blade) while it has work and fuel, the still model
  otherwise (synced every second while you are in your mine). State: `s<slot>:machines`. Rebirth takes them down and
  gives their contents back.
- **Drills** (`BP/scripts/drills.js`): crafted at the Pickaxe Station, placed on the west drill pads only (max 12 per
  session). They dig chunks into the session's drill bin (`s<slot>:drill_bin`, max 256) while you play that session;
  tap any drill: **Collect N** / **Close**. Only the owner breaks them, from their session; a rebuilt mine hands them
  back. Placed drills live in the world property `mining_tycoon:generators` (old name kept for old worlds).
- **Miner's Tablet** (`main.js`): body = session, money (+ sell bonus), pick, light, backpack, deepest cave, the quest
  or next goal with progress. Pages: **How to play**, **Rebirth** (confirm); buttons **Perks & records**, **Main menu**. On an
  expedition the tablet shows the run instead (Keep mining / Give up with a confirm page).
- **Rebirth**: needs the money; resets money, pick, lantern, backpack, cart, machines (contents returned) and drills
  (and the bin); +1 rebirth. Announced to everyone.
- **Protection**: in a mine only the owner breaks blocks, and only ores and drills; only drills can be placed (on
  pads, in the active session's mine). Caves: see Expeditions. Monsters that spawn by themselves in mines and caves
  are removed.

## Expeditions - `BP/scripts/expedition.js`, `BP/scripts/cave_builder.js`, config `expedition`
- **Lift** (`mining_tycoon:lift`): in the back wall of the home tunnel - tap: the two deepest unlocked cave levels
  (with their descriptions) + Not now; body: light time, backpack size, which ores your pick mines there. In each
  cave's lift room - tap: **Extract** / **Keep mining** with the haul and its value.
- **Cave levels** (unlocked with the Mine Cart):
  | Level | Box | Rock | Ores near lift -> far | Creatures (max) |
  |---|---|---|---|---|
  | Shallow Caves | 45 x 45 | stone, andesite, tuff, cobblestone, deepslate low down, dripstone, cobwebs | coal/copper -> iron/gold, some ruby/diamond | zombies, skeletons, spiders (6) |
  | Deep Caverns | 49 x 49 | deepslate, tuff, smooth basalt, sculk patches, cobwebs | copper/iron/gold -> gold/ruby/diamond | zombies, husks, skeletons, cave spiders (8) |
  | Crystal Grotto | 53 x 53 | calcite, amethyst, smooth basalt, moss floors, glowing amethyst clusters | iron/gold/ruby -> ruby/diamond | strays, cave spiders, zombies (9) |
  | Magma Core | 57 x 57 | blackstone, basalt, gilded blackstone, netherrack floors, magma | gold/ruby/diamond -> diamond | wither skeletons, magma cubes, blazes (10) |
  All 17 high (y 0..16). One cave slot per session (its plot index) in a grid at x -20000, z 10000, y 150, 128 apart.
- **Generation** (new seed every run): lift room (7 x 7 timber floor, two lanterns, the lift in its south wall; arrival
  in its middle looking north) with three exits; "diggers" wander out on one gently rolling level, branch and open
  chambers (more and longer in bigger caves); ledges where tunnels meet are cut into steps until every floor can be
  reached (sim: 99-100 % on every level, nothing you can fall into and not climb out of); rock skin by seeded noise
  from the level's palette; ore deposits (2-5 blocks, growing into the wall) blend from `near` to `far` weights.
  Built across ticks behind the loading screen around the player (rock fills around the room, column runs, hanging
  blocks last); what was left of the previous run is removed first.
- **Rules in caves**: only ores can be broken (with the same pick tiers as at home), nothing can be placed, other
  players can't break anything in your cave. Ores give **resource items** (Coal Chunk, Copper Chunk, Iron Chunk, Gold
  Chunk, Rough Ruby, Rough Diamond) - the haul.
- **No natural spawns**: the caves are dark, so any monster that spawns by itself in a cave box (or in a home mine)
  is removed at once (`entitySpawn`), as are item drops in caves that are not add-on items (creature loot).
- **Light** = the lantern level's seconds (3:00 to 8:00): night vision while over 30 %; 30-10 % it flickers and darkness
  pulses; under 10 % no night vision; at 0 blindness and magic damage every second that grows. Warnings at 1:00, 0:30,
  0:10 and when it is out (toasts). The run HUD (top-left) shows the light bar, time left and `Haul 12/48`.
- **Backpack**: a run's haul is capped at the backpack size; when full, ores can't be mined ("get back to the lift").
- **Creatures**: the level's creatures, spawned on cave floors 10-20 blocks from the player after 10 quiet seconds:
  1 at full light up to the level's max at 0, one every 5-15 s (faster as the light fades). Tagged
  `mining_tycoon:creature` + `mining_tycoon:cave_<i>`, removed when the run ends; non-add-on item drops in caves vanish.
- **Ending a run**: **Extract** (haul safe, "Expedition complete!" notice with its value); **death** (on respawn the
  haul mined on that run is taken: "The dark took you!"; goods carried in before are safe); **Give up** from the
  tablet (same loss); **leaving the game** (haul taken on the next join, moved out of the cave at once). Run state on
  the player (`mining_tycoon:run`: slot, cave, seed, level, light, max, room, haul, phase), saved on every ore and every
  5 s. After a script reload a player still in their cave carries on.
- `keepInventory` is on (world load): picks and the tablet are never dropped.

## Guide, HUD and later goals
- **Tutorial** (`BP/scripts/tutorial.js`, config `quests`): 9 quests for a new session, each with a money reward:
  mine 5 Coal ($25) -> sell at the Ore Trader ($25) -> Stone Pick ($50) -> mine 8 Copper ($50) -> build the Smelter
  ($75) -> smelt and collect 4 Copper Bars ($100) -> Copper Pick ($150) -> ride the lift ($50) -> extract a haul ($250).
  Count quests use the session records; pick / machine quests are checked every second. Done quests pay at once with a
  toast naming the next one and a gold burst. Sessions already on their way (Copper Pick, Smelter or a
  rebirth) skip the tutorial. After it, the workshop route (`nextGoal`) takes over.
- **Guide marker**: every second gold sparkles (`mining_tycoon:guide`, only that player sees them) float over the place
  of the current quest or goal: the vein, the trader's stall, a station or bay, the lift - in a cave, the cave lift.
- **Quiet first expedition**: the first expedition of a session sends at most 2 creatures, the first after 40 s.
- **Studio HUD** (`BP/scripts/hud.js`, `tools/gen_hud.py` -> `RP/ui/hud_screen.json`): scripts send the HUD inside
  the title text behind an invisible prefix and keep such a title up all the time; the game's title control
  (`hud_title_text`) is replaced by our panels, which read the title text, so no title is ever shown big. (Hiding the plain title with a
  binding instead failed in caves, where the title changes every second.) Titles from elsewhere (other add-ons,
  `/title`) are not shown while the HUD owns the title. Every HUD visibility test is a single "contains" test
  `(not ((#s - 'code') = #s))`: on the phone the negated form and compound `(not (A or B))` tests came out true when
  they should not (`tools/check_ui.py` rejects them). The light bar gets one mark per lit segment, drawn over an
  always-visible empty segment.
  - **The board** (top-left, below the hearts phones show there; the top centre is under the phone's buttons): MINE-OS
    glass (cyan rim, chamfered corners with bright ticks, scanlines, gold accent strip), a header `MINE-OS // MINE
    CONTROL` (or `// EXPEDITION`) with a turning mini radar and a blinking status LED (green at home, red in a cave),
    a glowing rule under it, a scan beam running down and a light sheen across now and then. The board may be rebuilt
    with every new title (every second in a cave), so its loops last a second (coin, radar, LED) and the slow effects
    wait over a second before they first play.
  - Home: a turning gold coin + money (and sell bonus), a hologram target + the quest (`Quest 3/9: ...`, progress and
    reward) or the next goal (`Next: Copper Pick at the Pickaxe Station`, then what you have / need in green and red),
    and a 10-segment cyan progress bar (quest count, or how much of the goal's goods and money you have:
    `guideLines()` -> `progressRatio()`), one mark per 10 % like the light bar.
  - Expedition: lantern + a 10-segment light bar (last 3 segments red), time left, backpack + haul `12/48`, the cave
    level.
  - **Notifications** = the action bar, drawn as a MINE-OS card above the hotbar (`hud_actionbar_text` replaced): dark
    cyan glass with chamfered corners, a gold accent strip, a pulsing hologram icon. Every card slides up with a
    flicker, a flash and a sonar ping, wipes its text in, sweeps a light streak over the glass and drains a timer line,
    then fades (about 3.7 s). Toasts (gold first line, white second line): crafted, quest done, sold, machine done /
    out of fuel, rebirth, perk, light warnings, cave arrival. Small cards: pickups (`+3 Coal Chunk`, counting up) and
    refusals. `hud.js` queues them: a toast stays at least 2 s before the next toast (1.5 s before a small card), at
    most two toasts wait (a newer one pushes out the oldest), small cards keep 0.7 s apart (only the latest shows) and
    a toast cuts a small card short.
  - **Profile** (top right, below the hunger bar phones show there; `BP/scripts/profile.js`, config `profile`): a
    MINE-OS panel `MINE-OS // PROFILE` with the player's own model (the game's paper doll renderer, always on) in a
    24 x 32 portrait holo frame (the renderer draws the body ~1.7x as tall as its control, from the control's top: a
    16 px control, clipped to the frame) with a scan beam and the rank badge, the name, `Prospector Lv 12 45/185 XP` and a gold 10-segment XP
    bar. It rides in the subtitle of the HUD title (`§p§f§1` + rank `§z§z§<n>` + XP marks). XP belongs to the player
    (`mining_tycoon:xp`, all sessions, survives rebirth): every ore mined at home or in a cave gives its pick tier
    (Coal 1 ... Diamond 6). Level L -> L + 1 takes 20 + 15 x (L - 1) XP (Lv 10 at 720 XP, max 99). Ranks: Rookie (1),
    Digger (5), Prospector (10), Miner (15), Expert (20), Master (30), Legend (40), badge = that tier's pick (Legend:
    a cut diamond). Level up: a card (`Level 5!` / `New rank: Digger`), a sound and a gold burst. The tablet shows
    the profile line too.
  - **No chat**: every message is a card (refusals, results, warnings, rebirths of other players); scripts never
    write to chat (the sim fails a suite on any chat line).
- **Records** (`BP/scripts/progress.js`, `s<slot>:records`, survive rebirth): mined per resource, ores, sold, earned,
  made per product, crafted, expeditions, extracts, deaths, best haul, deepest level.
- **Rebirth stars and perks** (config `perks`): one star per rebirth; tablet > **Perks & records** shows the records
  and buys perks for the session: Bright Lantern (+30 s light per level), Deep Pockets (+16 backpack), Quick Machines
  (15 % faster); 3 levels each, costing 1, 2, 3 stars.

## Robustness
- Every per-second loop runs players one by one through `eachPlayer` (`lib/safe.js`): an error is logged once (with
  a label) and the other players carry on. Break protections fail safe (an error cancels the break).
- Mining (home and caves) is refused while the inventory has no room for the chunk, instead of dropping it.
- Drills are stored on their owner (`mining_tycoon:drills`), not in one world property that would run out of room on
  a big server; the old world record is moved onto each owner when they join.
- Magma Core floors are crimson nylium (fire from blazes burns out) instead of netherrack.
- `tools/check_ui.py` checks every property name in `RP/ui/*.json` against the documented JSON UI properties and
  rejects compound text tests (run it after the UI generators): typos like `clip_children` (it is `clips_children`) used to reach the phone as content-log
  errors. Particles are our own (`mining_tycoon:smoke`, `dust`, `guide`, `burst`): vanilla ones such as
  `basic_crit_particle` expect values (a direction) that scripts don't pass and log Molang errors.
- Tests (simulator, before every push): sessions, mine, migration, expeditions, machines, the whole loop, the tutorial
  and perks, all cave levels, and a chaos test (3 players doing random things for 1500 steps on several seeds) - every
  suite fails on any logged script error.

## Look
- **3D models** (`tools/gen_models.py` -> `RP/models/blocks/*.geo.json`, BP block files, `blocks/props.png` and the
  animated `blocks/props_on.png` + `RP/textures/flipbook_textures.json`): smelter (brick furnace with chimney, fire when
  working), crusher (steel body, hazard band, hopper, turning rollers), gem cutter (workbench with a spinning saw and a
  ruby), machine bay (timber scaffold with a blueprint), Pickaxe Station (anvil with a diamond pick), Gear Bench
  (workbench with a lantern and a backpack), Mine Cart (minecart full of ore on rails), Ore Trader (market stall with a
  striped awning, 1.5 blocks tall). All share one 128 x 128 atlas of 16 x 16 tiles (front faces north; "picture" tiles
  are drawn whole, material tiles are cropped). Menu icons `blocks/<model>_front.png` come from the same tiles.
- Cave levels each have their own palette (see the table); the home mine has arches, lanterns, froglights, rails.

## Menus and sessions
- **MINE-OS welcome menu** (the start menu only; `tools/gen_tech.py` renders the art, `tools/gen_server_form.py` the
  layout): the start menu is a holo terminal over the dimmed cave.
  - Power-on like a CRT: black screen, a bright line across the middle opens into the screen (0.6 s), the menu flickers
    on, corner brackets lock into the screen corners.
  - **Holo-Scan** (left): a holographic ore block printed layer by layer by a rising laser ring (18 frames, 1 s), then
    turning in its projector beam with a scan pass every turn (18 frames, 2 s loop). Rendered by a small 3D rasteriser.
  - **Ore radar** (right): a sweep with a fading trail that lights ore blips (gold, ruby, diamond) which fade until it
    comes round again (20 frames, 2 s loop).
  - Boot lines type themselves at the bottom left (`> MINE-OS v4.2 // DEPTH LINK ONLINE` ...), scanlines drift, a scan
    line runs down the screen every 6 s, the logo glitches into a red/cyan split every ~4.6 s.
  - Glass buttons and navs (chamfered, cyan rim, gold when selected) with a light streak sweeping across them.
  - Animations are `flip_book` strips (frames side by side, at most 2048 px wide for older phones), one-shot `seq`
    chains and looping `chain`s; the other menus keep the stone & gold look.
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
- Loading screen = **MINE-OS transit** (every `travel()`: entering a session, the lift down and up; tag `§m§t§l`, no
  buttons; art and doors: `tools/transit.py`): two steel blast doors (plate grid, hazard stripes and a glowing cyan
  seam where the halves of the MINE-OS emblem meet) slide in over the dark world and slam shut with a shake, a flash
  on the seam and a heavy door sound; the emblem then steps back and the transit panel lights up under the logo and
  the travel text: `MINE-OS // TRANSIT` with a mini radar and a blinking LED, a segmented loading bar with a glint and
  a percent counter (a flip-book: 90 % in 2.5 s, then crawling to 99 % until the screen closes), and boot lines that
  type themselves (`LIFT LINK ... OK`, `MAPPING STRATA ... OK`, `STABILIZING SHAFT ...`). It opens a moment after the
  teleport (teleports close open forms), comes back if anything closes it while the area is still loading, stays at
  least 2 s and closes (`uiManager.closeAllForms`, repeated until it is really gone) 1 s after the player stands
  there. **Arrival**: `openDoors()` (hud.js) puts the door code `§d§o§r` in the HUD title for under a second: the same
  doors stand shut over the world in the HUD, unlock with a flash and slide apart (0.65 s), with a door-open sound.
- Sessions (`BP/scripts/sessions.js`, world property `mining_tycoon:sessions`): 2 save slots per player (config
  `sessions.slots`). Each session is its own save: own mine plot, money, upgrades, rebirths (player properties
  `mining_tycoon:s<slot>:<name>`), placed drills (`slot` in each drill record) and unplaced drill items (stashed when
  you switch away, handed back when you return). Only the active session (`mining_tycoon:active_session`) earns.
  A new session starts with $0, a Wooden Pick, Lantern 3:00, Backpack 24 and the Shallow Caves. Deleting one frees its plot; the next owner gets it rebuilt clean.
  Worlds from before sessions: the old plot, money, upgrades and rebirths become session 1.
- Full-screen menus, one form per menu (`RP/ui/server_form.json` + `BP/scripts/menu_layout.js`, both generated by
  `tools/gen_server_form.py` - edit the menu tree there and run it):
  - A form whose title starts with a form tag (`§m§t§s` start menu, `§m§t§t` tablet, `§m§t§l` loading, `§m§t§n` notice, `§m§t§e` tablet on an expedition) is drawn full screen: cave
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
    exit, back, delete, upgrades, drills, rebirth, home, coin, lock, expedition, extract, sell.
- The mine (`BP/scripts/mine_builder.js`, config `mine`, layout **version 4**): an enclosed cave, 31 x 31 blocks around
  its plot centre (floor y 0, roof y 10), in a 16-wide grid at x/z 10000, y 80, 48 apart.
  - Hall about 27 x 20, rough rock walls by seeded noise, ceiling 7-9 high with stalactites, three spruce arches with
    lanterns, lanterns on chains, froglights in the roof.
  - North: the vein (x -6..6, z -12..-9, y 1..4) in a timber frame. West: drill pads (polished tuff in deepslate-tile
    frames, x -12..-9, z -4..6). East: the market (timber floor in a tile frame) with the trader's stall at (10, 1, 1)
    and barrels.
  - South: the landing (x -6..6, z 9..11) with the row of bays at z 11 - machines at x -6/-4/-2, workshop at x 2/4/6 -
    and the tunnel (x -1..1) with the lift in its back wall. Rails run from the tunnel to the vein. Players arrive at
    (0, 1, 7.5) facing the landing; the respawn point is set there.
  - Built across ticks behind the loading screen (one teleport, a safety floor, column runs bottom-up, attached blocks
    last). Mines with an older `version` are rebuilt on entry (their drills go back to the inventory).

## Balance notes - TO TUNE LATER
Every number is a first guess (all in `BP/scripts/config.js`; ore hardness in `BP/blocks/ore_*.json`, pick speed in
`BP/items/pick_*.json`).
- [ ] Play the first 30 minutes: how long to the Stone Pick (~1 min?), the Smelter, the Copper Pick, the first
  expedition that pays off; write a minute -> money table here.
- [ ] Home vein vs caves: the vein must stay a fallback, caves the real money (vein regrow 4 s, weights).
- [ ] Craft costs vs what an expedition at each level brings home (light time, backpack size, ore density).
- [ ] Machine speed and fuel; drill rates and bin size; rebirth cost and bonus.
- [ ] Creature counts per level (Magma Core with blazes and wither skeletons may be too hard).

## Roadmap
- [x] **Foundation, menus, sessions, underground mine, hand mining** (see Menus and sessions).
- [x] **E1 Expeditions:** lift, generated caves, light, creatures, resource items, extract or lose the haul, Ore Trader.
- [x] **E2 Machines:** smelter, crusher, gem cutter.
- [x] **E3 Workshop + overhaul:** one loop (every ore is an item, no mine levels / ore value / cash drills), Pickaxe
  Station, Gear Bench (lantern, backpack), Mine Cart (cave levels 2-4: Deep Caverns, Crystal Grotto, Magma Core),
  drills as helpers with a bin, tablet hub with the next goal, mine layout 4, 3D models with animated machines.
- [ ] **E4 Depths:** hazards (falling gravel, lava pockets, gas), custom creatures, a boss at the Magma Core.
- [ ] **E5 Balance:** tune every price from real play (see Balance notes).
- [x] **Guide + HUD + later goals:** tutorial quests with rewards, guide markers, studio HUD and toasts, quiet first
  expedition, records, rebirth stars and perks, robustness pass (see STYLE.md for the studio look).
- [ ] **Extras:** offline machine/drill progress, leaderboard, daily bonus, co-op expeditions.
