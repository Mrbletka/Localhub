# Star Miner

Namespace: `star_miner` · Studio style: MINE-OS (see `projects/mining-tycoon/STYLE.md`) · Built on the Mining Tycoon
engine (sessions, economy, runs, machines, HUD, notification cards, profile, transit, menus).

## Pitch
You captain a mining starship floating in deep space. Drop to planets, mine what you can before your oxygen runs
out, get back aboard, refine and sell your haul, and grow the ship room by room: every upgrade is a room you can
walk through, and a bigger, better ship reaches farther, richer worlds. Bring friends aboard as your crew.

## Where things are
- **Space = the End dimension.** The ship floats high above the void (y ~180) far out from the main island. The End's
  dark sky is our space; the outer End islands far below read as an asteroid field. Every session (ship) has its own
  slot in a grid, far apart.
- **Joining:** Minecraft always spawns players in the Overworld. The MINE-OS boot menu covers that at once, and
  **Play** runs the transit (boarding shuttle) straight to your ship. The Overworld is never part of the game; later it
  can get a small spaceport lobby.
- **Planets** are generated run areas (the Mining Tycoon cave builder, grown into surfaces + caves) placed in the
  dimension that gives them the right sky: the End (black sky), the Overworld (high-altitude boxes with planet fog) or
  the Nether (red sky). Each has its own fog, gravity and hazards.

## Core loop
1. On the **Bridge**, pick a planet on the star map (needs nav range and fuel).
2. Step into the **Airlock** drop pod: transit (pod descent) to the planet.
3. Mine with your **mining laser** (tool tier) into your **cargo pod**; watch your **oxygen**; dodge hazards and creatures.
4. Get back to the pod beacon and extract (or lose that haul if you die / run out of air).
5. Unload into the **Cargo Hold**; refine in the **Refinery**; sell at the **Trade Terminal** for credits (CR).
6. Spend credits + planet materials on **room builds and upgrades** -> more oxygen, cargo, fuel, range, tools.
7. Reach new planets -> rarer ores -> bigger upgrades. At the end of a sector: **Warp** (prestige).

## The ship (the heart of the game)
A **modular ship that physically grows**. A central spine corridor runs bow to stern; rooms are modules docked to
bays along it. A new room = a new hull segment + module, **built in front of you**: a construction sequence where
drones lay the frame, plating and interior layer by layer (particles, sounds, a MINE-OS build card with progress).
Every room has **levels 1-5**: each level changes the interior (more machines, consoles, lights, animated parts) and
the hull outside it (windows, plating, lights, antennas). Room layouts are data-driven builders in code (like the
Mining Tycoon mine builder), so a rebuild or a migration can always put a room back exactly.

| Room | Start | What it does | Levels raise |
|---|---|---|---|
| **Bridge** | yes | Star map (pick a planet), ship status terminal, crew console | nav range (planets 2..5), jump autopilot (shorter transits), sector scanner (planet events, bonus deposits) |
| **Airlock / Drop Bay** | yes | Launch pad to the selected planet | drop pod tiers: return beacon / recall (L3), emergency recall keeps 50 % cargo on death (L4), crew pod (group drops) |
| **Cargo Hold** | yes | Ship storage, Trade Terminal | capacity, auto-sort, cargo drone (unloads you on arrival) |
| **Refinery** | yes (L1: Smelter) | Machines: Smelter, Crusher, Laser Cutter, Fuel Cracker | unlock machines, speed, parallel slots |
| **Fabricator** | build | Mining lasers (tool tiers), suits, cargo pods | tool tiers 2..6, suit tiers, pod size |
| **Life Support** | build | Oxygen time on planets, suit regen | oxygen +time; L3 med bay (respawn aboard, keep 25 % cargo) |
| **Engine Room** | build | Fuel tank, jump cost | tank size, fuel per jump, L5 **Warp Drive** (prestige) |
| **Drone Bay** | build | Mining drones work planets you have visited (idle income) | drone count, speed, planet slots |
| **Research Lab** | build | Tech tree from research data (rare finds) | perks: laser speed, oxygen, prices, drone yield... |
| **Crew Quarters** | build | Crew slots and bunks (crew spawn point) | crew slots 2 / 4 / 6 / 8, lounge |
| **Observation Deck** | late | Glass dome over the stars, trophy wall (records), ship-class badge | cosmetic + prestige display |

The ship's look: dark steel hull, cyan MINE-OS light strips, glass floors and windows onto the End sky, animated
consoles, hazard-striped airlock doors (the transit doors made real), gold accents on upgraded rooms.

## Planets (sector 1)
| Planet | Look (dimension) | Gravity / hazard | Oxygen drain | Resources | Creatures |
|---|---|---|---|---|---|
| **Luna Prime** | grey craters, black sky (End) | low gravity (jump boost, slow falling) | normal | Ferrite, Cuprite, a little Cryolite | few crawlers |
| **Cryo-9** | ice world, white-blue fog (Overworld) | ice paths, snow storms (whiteouts) | cold: faster | Cryolite, Cobaltite | frost drones |
| **Verdant Ka** | toxic jungle caverns, green fog (Overworld) | spore clouds (poison outside safe air) | normal | Aurium, Plasmite | spore crawlers |
| **Pyros** | lava planet (Nether) | heat near lava, magma floors | hot: faster | Plasmite, Aurium, Voidstone | fire spirits |
| **Void Rift** | shattered asteroid field (End) | very low gravity, jumps between rocks | normal | Voidstone, Star Core | void wraiths |

Runs reuse the expedition system: a new seed every drop, oxygen = the old light timer (warnings at 1:00 / 0:30 /
0:10, damage at 0), cargo pod = backpack, the pod beacon = the cave lift. Planet **events**: meteor showers (rare ore
drops + danger), storms, rich veins. Creatures start as re-themed vanilla mobs; custom alien models come later.

## Resources and products (draft values, tuned by the Economy Designer)
| Tier (laser) | Ore | Sells | Refined into | Sells |
|---|---|---|---|---|
| 1 | Ferrite | 2 CR | Steel Plate | 8 |
| 2 | Cuprite | 5 | Copper Wire | 18 |
| 3 | Cryolite | 9 | Coolant / **Fuel Cell** | 30 |
| 3 | Cobaltite | 16 | Cobalt Ingot | 55 |
| 4 | Aurium | 30 | Gold Circuit | 100 |
| 5 | Plasmite | 55 | Plasma Cell | 190 |
| 6 | Voidstone | 100 | Void Lens | 350 |
| 6 | Star Core | 400 | Star Engine Part | 1,400 |

- **Fuel:** Fuel Cells from Cryolite (Refinery: Fuel Cracker). Luna Prime is in orbit (no fuel); farther planets
  cost more cells per jump (Engine Room lowers it).
- **Room costs:** credits + products, and planet-only materials from L3 on (Coolant for Life Support, Gold Circuits
  for the Bridge, Void Lenses for the Engine Room...), so every planet stays worth visiting. Roughly x3 per level.
- **Mining lasers** replace picks (tiers 1-6, crafted at the Fabricator); lasers mine faster and look like tools of
  the future (custom item models).

## Progression and prestige
- First hour: Luna Prime only, starter rooms, the tutorial ("First Flight" quests, gold guide sparkles -> cyan holo
  markers) up to building the Fabricator and the first jump to Cryo-9.
- Midgame: build Life Support / Engine Room / Fabricator, unlock Verdant Ka and Pyros, start drones.
- Late: Research Lab, Void Rift, Star Cores, Crew Quarters full, Observation Deck.
- **Warp (prestige):** Engine Room L5 + credits -> warp to the next sector. The ship is rebuilt as a bigger **ship
  class** (Scout -> Freighter -> Cruiser -> Dreadnought: a larger starting hull and a badge), sell bonus up, a research
  star for perks. Planets of the next sector are richer variants with new names and palettes.
- **Captain profile** (player-wide, survives warps): XP per ore, levels, ranks Cadet -> Pilot -> Navigator -> Captain
  -> Commander -> Admiral, shown on the profile card with the player's own model.

## Crew (multiplayer)
- A session is a **ship**; its owner is the **Captain**.
- **Invite:** Bridge crew console (or tablet) -> Invite -> pick an online player. They get a MINE-OS invite card and a
  menu ("Captain Efe invites you aboard the ISS Efe - join the crew?"). Accepted ships show in their session list
  as crew ships next to their own.
- **Roles:** Captain (everything), Officer (build/upgrade rooms, launch, invite), Crew (mine, refine, sell, drop).
  The captain promotes, demotes and removes crew; anyone can leave.
- **Shared:** the ship's credits, storage, rooms, fuel, unlocked planets, tool tiers. **Personal:** XP / rank, the
  cargo pod on a run. Crew can play the ship while the captain is offline.
- **Group drops:** everyone standing on the airlock pad drops into the same planet instance; each has their own
  oxygen and pod; extracted cargo goes to the ship.
- Crew slots come from Crew Quarters (2 / 4 / 6 / 8).

## UI and feel (MINE-OS everywhere)
- **HUD:** top-left board = SHIP STATUS (credits, objective, fuel, ship class) aboard, PLANET OPS on a planet (oxygen
  bar, cargo, planet, hazard); top-right captain card; notification cards; no chat.
- **Transit variants:** airlock doors (boarding), drop pod descent (planets), warp jump (star streaks), docking.
- **Star map:** planets as holograms with requirements, fuel cost and what they hold.
- **Captain's Pad** (the tablet): ship overview, rooms and their next upgrades, crew, records, perks.

## Tech plan
- **Port from Mining Tycoon:** sessions + migrations, economy, goods, machines, expedition runs (-> planet runs), cave
  builder (-> planet builder), HUD + notification cards + profile, menus (server_form generator), transit, lib/safe,
  the simulator test suites and chaos test, check_ui.
- **New:** `ship_builder.js` (modular rooms, hull growth, construction sequence), `rooms.js` (levels, costs,
  effects), `starmap.js` (nav range, fuel), `planets.js` (planet definitions, gravity, hazards, events, fog via
  `/fog` with RP fog definitions), `crew.js` (invites, roles, shared ship), `drones.js`, `research.js`.
- **Dimensions:** ship + End planets in the End, other planets as boxes in the Overworld / Nether at high altitude
  (as the caves are now). Natural spawns around ships and planet boxes are removed.
- **Art:** ship blocks (hull plating, grating, glass, light strips, consoles, airlock door), 3D models for consoles and
  machines (the Mining Tycoon model atlas tool), 8 ores, 8 products, 6 lasers, fuel cell, pods, suits; later alien
  entities.

## Roadmap
- [ ] **M1 First Flight:** port the engine; starter ship (Bridge, Airlock, Cargo Hold, Refinery L1); Luna Prime with
  oxygen and low gravity; Trade Terminal; MINE-OS HUD, cards, profile, transit; tutorial. A full playable loop.
- [ ] **M2 Shipwright:** room building and upgrades with hull growth and the construction sequence; Fabricator, Life
  Support, Engine Room; fuel; Cryo-9.
- [ ] **M3 Star Map:** the Bridge star map; Verdant Ka and Pyros; planet fog, hazards, events.
- [ ] **M4 Crew:** invites, roles, shared ship, group drops, Crew Quarters.
- [ ] **M5 Automation & Science:** Drone Bay, Research Lab, Void Rift, Star Cores.
- [ ] **M6 Warp:** sector prestige, ship classes, Observation Deck, custom aliens, polish -> release 1.0.

## Open questions
- Default ship name ("ISS <captain>"), and can the captain rename it?
- Does extracted cargo go straight into ship storage (Cargo Hold) or stay in the player's inventory until unloaded?
- Custom alien mobs from M3 on, or re-themed vanilla mobs until M6?
