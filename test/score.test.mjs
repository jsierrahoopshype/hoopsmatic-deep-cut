// Scoring rules (scripts/lib/score.mjs). No data needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instantScore, finalScore, crowdWeight, tierOf } from '../scripts/lib/score.mjs';

test('tiers follow the crossword fame cutoffs', () => {
  assert.equal(tierOf(25), 'star'); assert.equal(tierOf(24.9), 'known'); assert.equal(tierOf(7.9), 'deep');
});
test('instant score stays in its tier band and in 0-100', () => {
  const star = instantScore({ fame: 100, gp: 1500, min: 55000 });
  const deep = instantScore({ fame: 0.1, gp: 3, min: 20 });
  assert.equal(star, 0);
  assert.ok(deep >= 90 && deep <= 100);
  const known = instantScore({ fame: 15, gp: 600, min: 15000 });
  assert.ok(known >= 35 && known <= 70);
});
test('fewer games and minutes score higher in the same tier', () => {
  assert.ok(instantScore({ fame: 3, gp: 10, min: 100 }) > instantScore({ fame: 3, gp: 300, min: 6000 }));
});
test('crowd weight grows with answers and stays under 0.8', () => {
  assert.ok(crowdWeight(10) < crowdWeight(100) && crowdWeight(100) < crowdWeight(1000));
  assert.ok(crowdWeight(1e9) < 0.8);
});
test('a lone pick beats a popular pick of the same player once the crowd is big', () => {
  assert.ok(finalScore(50, 1, 1000) > finalScore(50, 400, 1000));
  assert.ok(finalScore(50, 1, 1000) > 50);
});
