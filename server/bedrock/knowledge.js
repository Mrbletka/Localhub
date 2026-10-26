// Curated Minecraft Bedrock reference the agents pull in with the bedrock_reference tool.
// Keep entries practical: exact file shapes, the rules that break packs, and proven patterns.
import { BEDROCK } from './versions.js';

const SERVER = BEDROCK.scriptModules['@minecraft/server'];
const UI = BEDROCK.scriptModules['@minecraft/server-ui'];
const FV = BEDROCK.formatVersions;

export const CORE_RULES = `Bedrock add-on ground rules (always follow):
- A project = folder with BP/ (behavior pack) and RP/ (resource pack), each with manifest.json, plus project.json and DESIGN.md.
- Every header and module UUID is unique and never changes after release. Get new ones with new_uuid; never invent them.
- Identifiers are "namespace:name", lowercase, using the project namespace. Never use "minecraft:" for new content.
- Scripts target @minecraft/server ${SERVER} and @minecraft/server-ui ${UI} (stable, no experiments). Imports need the full ".js" file name. No npm packages, no Node APIs, no setTimeout/setInterval (use system.runTimeout/runInterval).
- Scripts run in early execution: subscribe to events at the top level, but read/write world state only inside events, system.run callbacks or world.afterEvents.worldLoad.
- Every item icon key must exist in RP/textures/item_texture.json, every block texture key in RP/textures/terrain_texture.json, and every PNG they point to must exist. Display names go in RP/texts/en_US.lang.
- Run validate_project after changes and fix every error before you finish.`;

export const TOPICS = {
  project_layout: `# Project layout
\`\`\`
<slug>/
  project.json            studio metadata (name, type, namespace, version [x,y,z], description, tags, library)
  DESIGN.md               living design doc - concept, systems, content tables, TODO
  BP/                     behavior pack (logic + data)
    manifest.json  pack_icon.png
    scripts/main.js       script entry (ES modules)
    items/  blocks/  entities/  recipes/  loot_tables/  functions/  spawn_rules/  trading/  feature_rules/  features/
  RP/                     resource pack (visuals + text + sound)
    manifest.json  pack_icon.png  blocks.json (block sounds)
    textures/item_texture.json  textures/terrain_texture.json  textures/<namespace>/...png
    texts/en_US.lang  texts/languages.json
    entity/ (client entities)  models/entity/*.geo.json  render_controllers/  animations/  animation_controllers/  attachables/  sounds/  sounds.json  particles/
\`\`\`
- Version: bump project.json "version"; the build stamps it into both manifests and their dependencies.
- Builds produce dist/<slug>/<slug>-vX.Y.Z.mcaddon (both packs) and one .mcpack per pack.
- Put textures under textures/<namespace>/ so they never collide with other packs.`,

  manifest: `# manifest.json (format_version ${BEDROCK.manifestFormatVersion})
Behavior pack:
\`\`\`json
{
  "format_version": 2,
  "header": { "name": "My Pack BP", "description": "...", "uuid": "<uuid-1>", "version": [1, 0, 0], "min_engine_version": [${BEDROCK.minEngineVersion.join(', ')}] },
  "modules": [
    { "type": "data", "uuid": "<uuid-2>", "version": [1, 0, 0] },
    { "type": "script", "language": "javascript", "uuid": "<uuid-3>", "version": [1, 0, 0], "entry": "scripts/main.js" }
  ],
  "dependencies": [
    { "uuid": "<RP header uuid>", "version": [1, 0, 0] },
    { "module_name": "@minecraft/server", "version": "${SERVER}" },
    { "module_name": "@minecraft/server-ui", "version": "${UI}" }
  ]
}
\`\`\`
Resource pack: one module \`{ "type": "resources", ... }\` and (optionally) a dependency on the BP header uuid.
- Script module versions are strings ("${SERVER}"); pack versions are arrays in format_version 2.
- "-beta" script versions need the Beta APIs experiment and break between game updates - avoid for releases.
- Only add @minecraft/server-ui when you use forms.`,

  scripting: `# Script API (@minecraft/server ${SERVER})
\`\`\`js
import { world, system, ItemStack, EquipmentSlot, GameMode, DisplaySlotId, ObjectiveSortOrder } from '@minecraft/server';
\`\`\`
Lifecycle (2.x early execution):
\`\`\`js
// top level: subscribe only
system.beforeEvents.startup.subscribe(({ blockComponentRegistry, itemComponentRegistry }) => {
  // register custom components here (see custom_components)
});
world.afterEvents.worldLoad.subscribe(() => {
  // world is ready: scoreboard, dynamic properties, start intervals
  system.runInterval(tick, 20); // 20 ticks = 1 second
});
\`\`\`
Common events (after = read/write, before = cancellable but read-only):
- world.afterEvents: playerSpawn {player, initialSpawn}, playerLeave {playerId}, itemUse {source, itemStack}, playerPlaceBlock {player, block, dimension}, playerBreakBlock {player, block, brokenBlockPermutation, dimension}, playerInteractWithBlock {player, block, itemStack}, playerInteractWithEntity {player, target}, entityHitEntity {damagingEntity, hitEntity}, entityHurt {hurtEntity, damage, damageSource}, entityDie {deadEntity, damageSource}, entitySpawn {entity}, chatSend (beta only - avoid).
- world.beforeEvents: playerBreakBlock (set event.cancel = true), playerInteractWithBlock, itemUse, explosion, playerLeave.
- In before-events you cannot change the world: wrap changes in system.run(() => ...).
Players & entities:
\`\`\`js
player.sendMessage('§aHello');                 world.sendMessage('to everyone');
player.onScreenDisplay.setActionBar('text');   player.onScreenDisplay.setTitle('Big', { subtitle: 'small', fadeInDuration: 10, stayDuration: 40, fadeOutDuration: 10 });
player.playSound('random.orb', { volume: 1, pitch: 1.2 });
player.teleport({ x: 0, y: 80, z: 0 }, { dimension: world.getDimension('overworld') });
player.addEffect('speed', 200, { amplifier: 1, showParticles: false });
const inv = player.getComponent('minecraft:inventory').container;  inv.addItem(new ItemStack('ns:coin', 5)); inv.getItem(slot); inv.setItem(slot, stack);
const hand = player.getComponent('minecraft:equippable').getEquipment(EquipmentSlot.Mainhand);
player.dimension.spawnEntity('ns:pet', player.location);   dimension.spawnItem(stack, location);  dimension.spawnParticle('minecraft:villager_happy', loc);
dimension.getBlock({ x, y, z })?.setType('ns:generator');  // undefined if chunk not loaded
dimension.runCommand('say hi');  // synchronous; returns { successCount }
world.getAllPlayers(); world.getPlayers({ tags: ['vip'] }); entity.addTag('vip'); entity.hasTag('vip');
\`\`\`
Persistence - dynamic properties (no registration needed in 2.x):
\`\`\`js
player.setDynamicProperty('ns:coins', 100);       // number | boolean | string | Vector3 | undefined (deletes)
const coins = player.getDynamicProperty('ns:coins') ?? 0;
world.setDynamicProperty('ns:state', JSON.stringify(state)); // strings max 32767 chars - shard big data across keys
\`\`\`
Scoreboards (32-bit ints - clamp big numbers):
\`\`\`js
const obj = world.scoreboard.getObjective('ns_money') ?? world.scoreboard.addObjective('ns_money', '§aMoney');
obj.setScore(player, Math.min(2147483647, Math.floor(money)));
world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective: obj, sortOrder: ObjectiveSortOrder.Descending });
\`\`\`
Timing: system.run(fn) next tick, system.runTimeout(fn, ticks), system.runInterval(fn, ticks) -> id, system.clearRun(id), system.currentTick.
Rules: no top-level await on world state; guard entity calls with entity.isValid; catch errors around dimension.getBlock in unloaded chunks; keep per-tick work small (iterate players, not all entities).`,

  custom_components: `# Custom components (@minecraft/server ${SERVER})
Register in system.beforeEvents.startup, reference from block/item JSON.
\`\`\`js
system.beforeEvents.startup.subscribe(({ blockComponentRegistry, itemComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent('ns:bounce', {
    onStepOn({ entity }) { entity?.applyKnockback({ x: 0, z: 0 }, 1.2); },
    onPlayerInteract({ player, block }) { player?.sendMessage(\`Clicked \${block.typeId}\`); },
    onTick({ block }) { /* needs "minecraft:tick" component in the block JSON */ },
  });
  itemComponentRegistry.registerCustomComponent('ns:heal_on_use', {
    onUse({ source }) { source.addEffect('regeneration', 100); },
  });
});
\`\`\`
Block JSON (format ${FV.block}+): add the component id as a key: \`"ns:bounce": {}\` inside components (older formats used "minecraft:custom_components": ["ns:bounce"]). If the game reports an unknown component, fall back to event-based scripting (world.afterEvents.playerInteractWithBlock / itemUse) which works on every version.
Block events: onPlace, onPlayerBreak, onPlayerInteract, onStepOn, onStepOff, onEntityFallOn, onRandomTick, onTick, beforeOnPlayerPlace.
Item events: onUse, onUseOn, onConsume, onHitEntity, onMineBlock, onCompleteUse, onBeforeDurabilityDamage.`,

  ui_forms: `# Forms (@minecraft/server-ui ${UI})
\`\`\`js
import { ActionFormData, ModalFormData, MessageFormData, FormCancelationReason } from '@minecraft/server-ui';
new ActionFormData().title('Shop').body('Pick one').button('Sword\\n§8100 coins', 'textures/ns/sword').button('Close')
  .show(player).then((res) => {
    if (res.canceled) { if (res.cancelationReason === FormCancelationReason.UserBusy) {/* chat open - retry later */} return; }
    // res.selection = button index
  });
new MessageFormData().title('Rebirth?').body('...').button1('Yes').button2('No').show(player).then((r) => { if (r.selection === 0) {/* yes */} });
new ModalFormData().title('Settings').textField('Name', 'placeholder').slider('Volume', 0, 10).toggle('Music').dropdown('Mode', ['Easy', 'Hard'])
  .show(player).then((r) => { if (!r.canceled) { const [name, volume, music, mode] = r.formValues; } });
\`\`\`
- Open forms from after-events (itemUse, playerInteractWithBlock) or system.run - not from before-events.
- Button icons are resource pack texture paths without extension.
- Keep menus shallow: main menu -> category -> confirm. Show balances in body text.
- ModalFormData slider/dropdown option argument shapes changed between versions; if validation or the content log complains, check the signature and keep forms simple.`,

  items: `# Items (format_version "${FV.item}")
\`\`\`json
{
  "format_version": "${FV.item}",
  "minecraft:item": {
    "description": { "identifier": "ns:ruby", "menu_category": { "category": "items" } },
    "components": {
      "minecraft:icon": "ns_ruby",
      "minecraft:display_name": { "value": "item.ns:ruby.name" },
      "minecraft:max_stack_size": 64
    }
  }
}
\`\`\`
menu_category.category: construction | equipment | items | nature | none.
Useful components:
- "minecraft:hand_equipped": true, "minecraft:glint": true, "minecraft:allow_off_hand": true
- "minecraft:damage": 7, "minecraft:durability": { "max_durability": 500 }, "minecraft:enchantable": { "slot": "sword", "value": 10 }
- "minecraft:repairable": { "repair_items": [{ "items": ["ns:ruby"], "repair_amount": 100 }] }
- "minecraft:food": { "nutrition": 4, "saturation_modifier": 0.6, "can_always_eat": true } + "minecraft:use_animation": "eat" + "minecraft:use_modifiers": { "use_duration": 1.6, "movement_modifier": 0.35 }
- "minecraft:cooldown": { "category": "ns_wand", "duration": 0.5 }
- "minecraft:wearable": { "slot": "slot.armor.head", "protection": 3 } (armor also needs an attachable in RP/attachables)
- "minecraft:digger": { "use_efficiency": true, "destroy_speeds": [{ "block": { "tags": "query.any_tag('stone', 'metal')" }, "speed": 8 }] }
- "minecraft:throwable" + "minecraft:projectile" for throwables.
Wiring: RP/textures/item_texture.json -> "texture_data": { "ns_ruby": { "textures": "textures/ns/ruby" } } and RP/texts/en_US.lang -> item.ns:ruby.name=Ruby.
Use the paint_texture tool for the 16x16 PNG.`,

  blocks: `# Blocks (format_version "${FV.block}")
\`\`\`json
{
  "format_version": "${FV.block}",
  "minecraft:block": {
    "description": { "identifier": "ns:ruby_block", "menu_category": { "category": "construction" } },
    "components": {
      "minecraft:display_name": "tile.ns:ruby_block.name",
      "minecraft:geometry": "minecraft:geometry.full_block",
      "minecraft:material_instances": { "*": { "texture": "ns_ruby_block", "render_method": "opaque" } },
      "minecraft:destructible_by_mining": { "seconds_to_destroy": 2 },
      "minecraft:destructible_by_explosion": { "explosion_resistance": 6 },
      "minecraft:map_color": "#c3122a",
      "minecraft:light_emission": 4
    }
  }
}
\`\`\`
- Per-face textures: material_instances keys "up", "down", "north", "south", "east", "west", "*" (or "side" names you define).
- render_method: opaque | alpha_test (cutout leaves/glass edges) | blend (stained glass).
- Block drops itself by default; "minecraft:loot": "loot_tables/blocks/x.json" overrides.
- Other components: "minecraft:collision_box", "minecraft:selection_box" (origin/size in pixels), "minecraft:friction", "minecraft:flammable", "minecraft:tick" { "interval_range": [20, 20] } (for onTick custom components), "minecraft:placement_filter".
- States/permutations: "description.states": { "ns:level": [0, 1, 2] } + "permutations": [{ "condition": "q.block_state('ns:level') == 2", "components": {...} }]. Change with block.setPermutation(block.permutation.withState('ns:level', 2)).
- Custom models: "minecraft:geometry": "geometry.ns_machine" with RP/models/blocks/machine.geo.json.
Wiring: RP/textures/terrain_texture.json -> "texture_data": { "ns_ruby_block": { "textures": "textures/ns/blocks/ruby_block" } }, RP/blocks.json -> { "format_version": [1, 1, 0], "ns:ruby_block": { "sound": "stone" } }, lang tile.ns:ruby_block.name=Block of Ruby.`,

  entities: `# Entities
Behavior (BP/entities/pet.json, format_version "${FV.entity}"):
\`\`\`json
{
  "format_version": "${FV.entity}",
  "minecraft:entity": {
    "description": { "identifier": "ns:pet", "is_spawnable": true, "is_summonable": true },
    "component_groups": { "ns:tamed": { "minecraft:is_tamed": {} } },
    "components": {
      "minecraft:type_family": { "family": ["ns_pet", "mob"] },
      "minecraft:health": { "value": 20, "max": 20 },
      "minecraft:physics": {}, "minecraft:pushable": { "is_pushable": true },
      "minecraft:collision_box": { "width": 0.6, "height": 0.8 },
      "minecraft:movement": { "value": 0.3 }, "minecraft:movement.basic": {}, "minecraft:navigation.walk": { "can_path_over_water": true },
      "minecraft:jump.static": {}, "minecraft:nameable": {},
      "minecraft:behavior.float": { "priority": 0 },
      "minecraft:behavior.follow_owner": { "priority": 2, "speed_multiplier": 1.2, "start_distance": 6, "stop_distance": 2 },
      "minecraft:behavior.random_stroll": { "priority": 6, "speed_multiplier": 0.8 },
      "minecraft:behavior.look_at_player": { "priority": 7, "look_distance": 6 },
      "minecraft:loot": { "table": "loot_tables/entities/pet.json" }
    },
    "events": { "ns:become_tamed": { "add": { "component_groups": ["ns:tamed"] } } }
  }
}
\`\`\`
Client (RP/entity/pet.entity.json):
\`\`\`json
{
  "format_version": "${FV.clientEntity}",
  "minecraft:client_entity": {
    "description": {
      "identifier": "ns:pet",
      "materials": { "default": "entity_alphatest" },
      "textures": { "default": "textures/ns/entity/pet" },
      "geometry": { "default": "geometry.ns_pet" },
      "render_controllers": ["controller.render.default"],
      "spawn_egg": { "base_color": "#c3122a", "overlay_color": "#ffd1d8" }
    }
  }
}
\`\`\`
Geometry (RP/models/entity/pet.geo.json, format "${FV.geometry}"):
\`\`\`json
{ "format_version": "${FV.geometry}", "minecraft:geometry": [{
  "description": { "identifier": "geometry.ns_pet", "texture_width": 32, "texture_height": 32, "visible_bounds_width": 2, "visible_bounds_height": 2, "visible_bounds_offset": [0, 0.5, 0] },
  "bones": [
    { "name": "body", "pivot": [0, 6, 0], "cubes": [{ "origin": [-3, 2, -4], "size": [6, 5, 8], "uv": [0, 0] }] },
    { "name": "head", "parent": "body", "pivot": [0, 7, -4], "cubes": [{ "origin": [-2.5, 5, -9], "size": [5, 5, 5], "uv": [0, 13] }] }
  ] }] }
\`\`\`
- Box UV: a cube of size [w,h,d] at uv [u,v] uses a (2d+2w) x (d+h) area of the texture. Paint the texture to match.
- Lang: entity.ns:pet.name=Pet and item.spawn_egg.entity.ns:pet.name=Pet Spawn Egg.
- Spawn from scripts: dimension.spawnEntity('ns:pet', location); trigger events: entity.triggerEvent('ns:become_tamed').
- Invisible "logic" entities (holograms, markers) can reuse vanilla geometry and an empty texture, or set "runtime_identifier".`,

  recipes: `# Recipes (BP/recipes, format_version "${FV.recipe}")
\`\`\`json
{ "format_version": "${FV.recipe}", "minecraft:recipe_shaped": {
  "description": { "identifier": "ns:ruby_sword" }, "tags": ["crafting_table"],
  "pattern": [" # ", " # ", " / "], "key": { "#": { "item": "ns:ruby" }, "/": { "item": "minecraft:stick" } },
  "unlock": [{ "item": "ns:ruby" }], "result": { "item": "ns:ruby_sword", "count": 1 } } }
\`\`\`
- Shapeless: "minecraft:recipe_shapeless" with "ingredients": [{ "item": "ns:ruby_block" }].
- Furnace: "minecraft:recipe_furnace" with "tags": ["furnace", "blast_furnace"], "input": "ns:raw_ruby", "output": "ns:ruby".
- Every symbol in "pattern" must be in "key". Identifiers must be unique across all recipes.
- "unlock" controls recipe-book unlocking: [{ "item": "..." }] or { "context": "AlwaysUnlocked" }.`,

  loot_tables: `# Loot tables (BP/loot_tables/...)
\`\`\`json
{ "pools": [ {
  "rolls": 1,
  "entries": [
    { "type": "item", "name": "ns:ruby", "weight": 3, "functions": [{ "function": "set_count", "count": { "min": 1, "max": 3 } }] },
    { "type": "item", "name": "minecraft:emerald", "weight": 1 },
    { "type": "empty", "weight": 2 }
  ],
  "conditions": [{ "condition": "killed_by_player" }]
} ] }
\`\`\`
Functions: set_count, set_data, enchant_randomly, looting_enchant, set_name, set_lore, furnace_smelt. Reference from entities ("minecraft:loot": { "table": "loot_tables/entities/x.json" }) or blocks ("minecraft:loot": "loot_tables/blocks/x.json"). Scripts can also drop loot directly with dimension.spawnItem.`,

  functions_commands: `# Functions & commands
- BP/functions/<name>.mcfunction: one command per line, no leading "/". Run with /function <name>.
- BP/functions/tick.json: { "values": ["ns/tick"] } runs functions/ns/tick.mcfunction every tick (keep it tiny).
- From scripts: dimension.runCommand('scoreboard players add @a ns_money 1') (synchronous, returns { successCount }).
- Prefer scripts for logic; use commands for vanilla features without a script API (e.g. some /camera, /fog, /music features).
- Useful in-game during testing: /reload (reload scripts + functions in development packs), /scriptevent ns:debug payload (handled by system.afterEvents.scriptEventReceive).`,

  localization: `# Localization
RP/texts/en_US.lang: one "key=value" per line, "##" comments. RP/texts/languages.json: ["en_US"].
Keys: item.ns:id.name (when display_name points to it), tile.ns:id.name (blocks), entity.ns:id.name, item.spawn_egg.entity.ns:id.name, pack.name, pack.description.
Formatting codes: §0-§9 §a-§f colors, §l bold, §o italic, §r reset. Use \\n in forms for new lines.`,

  textures: `# Textures & the paint_texture tool
- Items/blocks: 16x16 PNG (32x32 for detailed packs). Entities: match geometry texture_width/height (e.g. 32x32, 64x64). Pack icon: square, e.g. 64x64 or 128x128.
- paint_texture({ path, width, height, palette: { "k": "#1b1b1b", "r": "#c3122a", ... }, pixels: ["....kkkk....", ...], rects: [{ x, y, w, h, color }] })
  "." is transparent. Rects paint first, then the pixel grid on top. Colors: #rgb, #rrggbb, #rrggbbaa.
- Pixel art style that reads well in-game: 1px dark outline (darker hue of the main color, not pure black), 3-4 shades per material, light source top-left, highlight pixels on edges, no single-pixel noise on 16x16.
- Keep texture paths under textures/<namespace>/ and register them in item_texture.json / terrain_texture.json.`,

  economy_design: `# Economy & progression design (simulators, tycoons, idle games)
Formulas that feel good:
- Cost of the nth upgrade: base * growth^n with growth 1.07-1.15 for many small upgrades, 1.5-2.0 for few big ones.
- Income tiers: each tier ~10-15x the income of the previous at ~15-25x the cost (payback time grows slowly: tier payback = cost / income; aim for 20s -> 60s -> 3min -> 10min).
- Rebirth/prestige: requirement grows x3-x5 per rebirth; reward a permanent multiplier (+50%..+100% each) so the second run is ~2-3x faster than the first.
- First minute: player should afford 3-5 purchases in the first 60 seconds. First rebirth: 15-30 minutes of play.
- Show numbers with suffixes (K, M, B, T, Qa...) and always show "next goal" (cost of next upgrade, % to rebirth).
- Avoid dead time: if the cheapest next purchase is more than ~2 minutes away, add an intermediate upgrade.
Store: numbers in player dynamic properties (doubles survive past int32), display clamped on scoreboards. Put every tunable number in BP/scripts/config.js so balance changes never touch logic.
Sanity check by simulating: write a quick table in DESIGN.md of minute -> income -> next purchase for the first 30 minutes.`,

  simulator_patterns: `# Simulator patterns
Core loop: action (click/swing/mine) -> resource (power/strength) -> sell (coins) -> upgrades (multipliers) -> rebirth (permanent multiplier) -> new zones.
Building blocks:
- Click item: world.afterEvents.itemUse + per-player cooldown map keyed by player.id (system.currentTick).
- Sell zones: check player.location against an area each 10 ticks, or a custom "sell pad" block with an onStepOn custom component / playerInteractWithBlock.
- Zones/worlds: gate teleport pads behind rebirths; store unlocked zones as a JSON string property.
- Pets: entities that follow the owner (behavior.follow_owner after tame, or teleport to owner every 20 ticks), each pet = multiplier; store pet list on the player.
- Eggs/gacha: weighted random table in config.js; show the roll with setTitle + sounds.
- Boosts: timed multipliers stored as expiry tick or Date.now() timestamp.
- Leaderboards: scoreboard sidebar for the main currency; floating text via an invisible entity's nameTag.`,

  tycoon_patterns: `# Tycoon patterns
Core loop: plot -> generators/droppers -> money -> buy better generators/upgrades -> rebirth.
Building blocks:
- Generator blocks: custom blocks; track placement in world.afterEvents.playerPlaceBlock and store {location -> owner, tier} in a world dynamic property (shard per player if it may exceed 32k characters).
- Ownership: world.beforeEvents.playerBreakBlock -> cancel if not owner (message via system.run).
- Income tick: system.runInterval every 20 ticks, sum generator incomes per online owner, add to a player dynamic property.
- Droppers & conveyors (visual): spawn a small item entity or custom "ore" entity at the dropper, move it with applyImpulse or teleport along a path, "sell" it at a collector block (detect with dimension.getEntities({ location, maxDistance: 1, type: 'ns:ore' })). Keep entity counts low (despawn after N seconds).
- Plots: assign each player an area (e.g. grid of 64x64 plots); store plot index on the player; block placement outside your plot -> undo.
- Buttons/pads to buy: playerInteractWithBlock on a "buy pad" block holding a price in a block state or a lookup table by location.
- Offline earnings: on playerSpawn, compare Date.now() with a saved timestamp and pay capped offline income.`,

  performance: `# Performance & robustness
- Do the minimum per tick: iterate world.getAllPlayers(), cache lookups in Maps, run heavy work every 20+ ticks.
- Avoid dimension.getEntities() without filters every tick; pass { type, location, maxDistance }.
- Dynamic property writes are not free - batch them (save dirty state every few seconds) when values change every tick.
- Wrap world/entity calls that can fail (unloaded chunks, dead entities) in try/catch or check entity.isValid.
- Keep textures small (16x16), entity counts low, particles budgeted.
- Watch the content log (Settings > Creator > Content Log) for script errors in game.`,

  testing: `# Testing an add-on
1. validate_project until it passes.
2. build_project -> open the .mcaddon on the device (Android/iOS/Windows open it with Minecraft) -> create a world with both packs active (enable "Beta APIs" only if you used -beta modules).
3. For iterative work on desktop, deploy to development_behavior_packs/development_resource_packs and use /reload.
4. Turn on Content Log GUI (Settings > Creator) to see script errors with file + line.
5. Bump the version in project.json for every release so Minecraft replaces the old packs.`,

  common_mistakes: `# Common mistakes that break packs
- Copy-pasted UUIDs (two packs share a UUID -> one silently fails to load).
- import './config' without ".js"; importing npm packages; using setTimeout.
- Calling world APIs at script top level in 2.x (early execution) -> "native function cannot be called in early execution".
- worldInitialize (removed in 2.x) instead of system.beforeEvents.startup / world.afterEvents.worldLoad.
- Changing the world inside a before-event (must use system.run).
- Icon/texture key typos between item JSON and item_texture.json; PNG not at the path listed (path has no ".png").
- Forgetting the lang entry -> players see "item.ns:x.name".
- Scoreboard overflow above 2,147,483,647.
- Recipes with pattern symbols missing from "key", or results pointing to items that do not exist.
- Using "minecraft:" as the namespace for new content.`,
};

export function reference(topic) {
  if (!topic || topic === 'index') {
    return `Available topics: ${Object.keys(TOPICS).join(', ')}.\n\n${CORE_RULES}`;
  }
  const keys = String(topic).split(/[,\s]+/).filter(Boolean);
  const out = [];
  for (const key of keys) {
    const doc = TOPICS[key] || TOPICS[Object.keys(TOPICS).find((k) => k.includes(key.toLowerCase())) ?? ''];
    out.push(doc || `Unknown topic "${key}". Available: ${Object.keys(TOPICS).join(', ')}`);
  }
  return out.join('\n\n---\n\n');
}
