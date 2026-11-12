// The suggestion list's nicknames (public/players.json, scripts/generate-prompts.mjs)
// and the launch setting. Reads committed files only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
const P = rd('public/players.json').players;
const nicks = (name) => (P.find((p) => p[1] === name) || [])[4] || [];

test('nicknames reach the right player', () => {
  assert.ok(nicks('Anfernee Hardaway').includes('Penny'));
  assert.ok(nicks('Allen Iverson').includes('The Answer'));
  assert.ok(nicks('Karl Malone').includes('The Mailman'));
  assert.ok(nicks('Magic Johnson').includes('Earvin Johnson'));
});
test('no nickname lands on a namesake', () => {
  assert.ok(!nicks('Buck Johnson').includes('Earvin Johnson'));
  assert.ok(!nicks('Anfernee Simons').includes('Penny'));
  assert.ok(!nicks('John Williams').includes('Hot Rod'));
});
test('the real name is never replaced', () => {
  for (const p of P) assert.ok(typeof p[1] === 'string' && p[1].length > 1);
});
test('launch setting is a date and the page gets it', () => {
  const l = rd('rules/launch.json').launch;
  assert.match(l, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(rd('public/config.json').launch, l);
});
