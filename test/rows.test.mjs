// The weekly pull's row guard counts each source's real rows (scripts/lib/rows.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { rowsOf } from '../scripts/lib/rows.mjs';

test('Salary Season Finder data.json counts its season rows, not its players name list', () => {
  const ssf = { seasons: [{ player: 'A' }, { player: 'A' }, { player: 'B' }], players: ['A', 'B'], teams: ['ATL'], meta: {} };
  assert.equal(rowsOf(ssf), 3);
  assert.equal(rowsOf({ generated_at: 'x', players: [{}, {}] }), 2);                 // nba-headshots
  assert.equal(rowsOf({ readme: 'x', slugs: { player: { a: 1, b: 2, c: 3 } } }), 3);  // slugs
  assert.equal(rowsOf([1, 2]), 2);
});

const lock = JSON.parse(readFileSync(new URL('../data/sources.lock.json', import.meta.url), 'utf8'));
const cached = (s) => new URL(`../.cache/sources/${s.id}.json`, import.meta.url);
const have = lock.sources.every((s) => existsSync(cached(s)));
test('every pinned source counts the rows the lock records', { skip: !have && 'no .cache/sources (run scripts/pull-data.mjs first)' }, () => {
  for (const s of lock.sources) {
    const text = readFileSync(cached(s), 'utf8');
    if (text.length !== s.bytes) continue;   // a different commit's file
    assert.equal(rowsOf(JSON.parse(text)), s.rows, s.id);
  }
});
