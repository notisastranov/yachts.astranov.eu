import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'core/match-presets.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'core/match-engine.js'), 'utf8'), ctx);

const E = ctx.window.AstranovMatchEngine;
const cfg = E.resolveConfig({ businessType: 'yacht_charter' });

const assert = (name, cond) => {
  if (!cond) throw new Error(`FAIL: ${name}`);
  console.log(`ok ${name}`);
};

assert('crewFloor 13m', E.crewFloor(13) === 3);
assert('crewFloor 12m', E.crewFloor(12) === 1);
assert('effectiveMinimumCrew enforces floor', E.effectiveMinimumCrew({ length_m: 15, minimum_crew: 2 }) === 3);
assert('effectiveMinimumCrew respects higher count', E.effectiveMinimumCrew({ length_m: 20, minimum_crew: 5 }) === 5);
assert('buildRequiredCrew 3', JSON.stringify(E.buildRequiredCrew(3)) === JSON.stringify({ captain: 1, vice_captain: 1, cadet: 1 }));

const supply = [
  E.legacyYachtToSupply({ id: 'a', name: 'Big', length_m: 24, minimum_crew: 3, guest_capacity: 10, price_week: 40000, active: true }),
  E.legacyYachtToSupply({ id: 'b', name: 'Small', length_m: 10, minimum_crew: 1, guest_capacity: 6, price_week: 12000, active: true }),
];
const matches = E.matchLocal(supply, [], { start_date: '2026-07-01', end_date: '2026-07-08', guests: 6 }, cfg);
assert('match returns both yachts', matches.length === 2);
assert('big yacht min crew 3', matches.find((m) => m.supply.id === 'a').minimum_crew === 3);
assert('small yacht min crew 1', matches.find((m) => m.supply.id === 'b').minimum_crew === 1);
assert('big yacht roster size', matches.find((m) => m.supply.id === 'a').resources.length === 3);
assert('small yacht roster size', matches.find((m) => m.supply.id === 'b').resources.length === 1);

console.log('All crew tests passed.');