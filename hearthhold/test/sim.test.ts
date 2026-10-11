import { createColony, canBuild, startBuild, autoAssign } from '../src/sim/colony';
import { runSync, applyOfflineCap } from '../src/sim/step';
import { netPerHour, storageCap, offlineCapMs } from '../src/sim/derived';
import { RESOURCES, RESOURCE_IDS } from '../src/content/resources';
import { BUILDINGS, BUILDING_IDS, costEntries } from '../src/content/buildings';
import { BALANCE } from '../src/content/balance';
import { HOUR, fmtNum } from '../src/core/time';
import type { BuildingId, Colony } from '../src/core/types';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log('  FAIL', msg); }
}

const T0 = Date.UTC(2026, 9, 12, 8, 0, 0);

/** A greedy "player" who checks in every 30 min, builds what it can and assigns idlers. */
function play(seed: number, hours: number, verbose = false, milestones: number[] = []): Colony {
  const c = createColony({ id: 'c1', name: 'Oakridge', owner: 'p1', slot: 0, biome: 'pine_forest', now: T0, seed });
  let coins = 300;
  const order: BuildingId[] = ['rathouse', 'house', 'dock', 'lumber_camp', 'quarry', 'storehouse', 'house', 'rathouse', 'house', 'watchtower', 'market'];
  for (let t = 0; t < hours * 2; t++) {
    runSync(c, T0 + (t + 1) * HOUR / 2);
    autoAssign(c);
    for (const b of order) {
      if (canBuild(c, b, coins).ok) { coins -= startBuild(c, b); break; }
    }
    // sell surplus like a player would
    for (const r of RESOURCE_IDS) if (c.storage[r] > storageCap(c) * 0.8) { coins += c.storage[r] * 0.2 * RESOURCES[r].price; c.storage[r] *= 0.8; }
    for (const o of Object.values(c.owed)) { coins += o.coins; o.coins = 0; }
    if (milestones.includes((t + 1) / 2)) console.log(`  ${String((t + 1) / 2).padStart(4)}h  rathouse ${c.buildings.rathouse}  settlers ${String(c.settlers.length).padStart(2)}  houses ${c.buildings.house}  storehouse ${c.buildings.storehouse}  skills ${c.skills.lumber.level}/${c.skills.mining.level}/${c.skills.fishing.level}  coins ${fmtNum(coins)}`);
  }
  if (verbose) {
    console.log(`after ${hours}h: settlers=${c.settlers.length} buildings=${JSON.stringify(c.buildings)}`);
    console.log(`  storage ${RESOURCE_IDS.map((r) => `${r}=${fmtNum(c.storage[r])}`).join(' ')}  coins=${fmtNum(coins)}`);
    console.log(`  net/h ${JSON.stringify(Object.fromEntries(Object.entries(netPerHour(c, c.simTime)).map(([k, v]) => [k, Math.round(v)])))}`);
    console.log(`  skills ${JSON.stringify(c.skills)}  stats ${JSON.stringify(c.stats)}`);
    for (const e of c.chronicle.slice(-12)) console.log(`  [${e.tone}] +${((e.at - T0) / HOUR).toFixed(1)}h ${e.title} — ${e.detail}`);
  }
  return c;
}

console.log('balance: every cost fits in the storage you can have by then');
for (const b of BUILDING_IDS) {
  const def = BUILDINGS[b];
  for (let l = 1; l <= def.maxLevel; l++) {
    const rat = b === 'rathouse' ? l - 1 : Math.max(1, def.requires(l));
    let store = 0;
    while (store < BUILDINGS.storehouse.maxLevel && BUILDINGS.storehouse.requires(store + 1) <= rat) store++;
    if (b === 'storehouse') store = l - 1;
    const cap = Math.round(BALANCE.storageBase * Math.pow(BALANCE.storageGrowth, store));
    for (const [k, n] of costEntries(def.cost(l))) if (k !== 'coins') check(n <= cap, `${b} Lv ${l} needs ${n} ${k} but cap is ${cap}`);
  }
}

console.log('sim: pacing (bot checks in every 30 min, 7 days)');
play(42, 168, false, [0.5, 1, 2, 4, 8, 24, 48, 72, 120, 168]);

console.log('sim: 48h greedy playthrough');
const a = play(42, 48, true);
check(a.buildings.rathouse >= 2 && a.buildings.rathouse <= 5, 'rathouse should be Lv 2-5 after 48h');
check(a.settlers.length >= 6, 'colony should grow to 6+ settlers');
for (const r of RESOURCE_IDS) {
  check(Number.isFinite(a.storage[r]) && a.storage[r] >= 0, `${r} is a sane number`);
  check(a.storage[r] <= storageCap(a) + 1e-6, `${r} respects cap`);
}
for (const s of a.settlers) check(s.mood >= 0 && s.mood <= 100, `mood in range for ${s.name}`);

console.log('sim: determinism');
const b = play(42, 48);
check(JSON.stringify(a) === JSON.stringify(b), 'same seed → identical colony');
const d = play(7, 48);
check(JSON.stringify(a) !== JSON.stringify(d), 'different seed → different story');

console.log('sim: offline catch-up cap');
const c = play(3, 2);
const away = T0 + 2 * HOUR + 30 * HOUR;
const skipped = applyOfflineCap(c, away, offlineCapMs(c));
check(skipped > 0 && away - c.simTime === offlineCapMs(c), 'catch-up is capped by storehouse hours');
const steps = runSync(c, away);
check(steps === offlineCapMs(c) / 15000, `ran ${steps} steps for the capped window`);

console.log('sim: save/load round trip mid-run');
const e = play(9, 6);
const copy = JSON.parse(JSON.stringify(e)) as Colony;
runSync(e, e.simTime + 5 * HOUR);
runSync(copy, copy.simTime + 5 * HOUR);
check(JSON.stringify(e) === JSON.stringify(copy), 'JSON save/load does not change the future');
check(JSON.stringify(e).length < 30000, `save fits a dynamic property (${JSON.stringify(e).length} chars)`);

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall sim checks passed');
