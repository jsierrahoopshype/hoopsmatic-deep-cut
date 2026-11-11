// Team names are strict by era (Jorge, Nov 11, 2026): "Los Angeles Clippers"
// counts only Los Angeles seasons, never Buffalo Braves or San Diego Clippers
// seasons; the same for every relocated franchise. No data download needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unitOf } from '../scripts/lib/players.mjs';

const F = JSON.parse(readFileSync(new URL('../rules/franchises.json', import.meta.url), 'utf8')).franchises;
// The only two merges: same city's name variants, not relocations.
const MERGED = { 'New Orleans/Oklahoma City Hornets': 'New Orleans Hornets', 'Kansas City-Omaha Kings': 'Kansas City Kings' };

test('Clippers: Buffalo, San Diego and Los Angeles are three different teams', () => {
  assert.equal(unitOf('LAC', 1978), 'LAC|Buffalo Braves');
  assert.equal(unitOf('LAC', 1984), 'LAC|San Diego Clippers');
  assert.equal(unitOf('LAC', 1985), 'LAC|Los Angeles Clippers');
});
test('SuperSonics are not the Thunder; Vancouver is not Memphis; New Jersey is not Brooklyn', () => {
  assert.equal(unitOf('OKC', 2008), 'OKC|Seattle SuperSonics');
  assert.equal(unitOf('OKC', 2009), 'OKC|Oklahoma City Thunder');
  assert.equal(unitOf('MEM', 2001), 'MEM|Vancouver Grizzlies');
  assert.equal(unitOf('BKN', 2012), 'BKN|New Jersey Nets');
});
test('every season of every era maps to that era\'s own city and name', () => {
  for (const [code, eras] of Object.entries(F)) for (const e of eras) {
    const name = `${e.city} ${e.nickname}`;
    const want = `${code}|${MERGED[name] || name}`;
    for (let y = e.from; y <= (e.to ?? 2027); y++) assert.equal(unitOf(code, y), want, `${code} ${y}`);
  }
});
test('no unit spans two different cities', () => {
  const cityOf = {};
  for (const [code, eras] of Object.entries(F)) for (const e of eras) {
    const u = unitOf(code, e.from);
    const city = e.city.replace('/Oklahoma City', '').replace('-Omaha', '');
    assert.ok(!cityOf[u] || cityOf[u] === city, `${u}: ${cityOf[u]} and ${city}`);
    cityOf[u] = city;
  }
});
