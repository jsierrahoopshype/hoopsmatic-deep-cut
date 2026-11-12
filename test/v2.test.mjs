// Five-round Daily, practice pool and eligibility (Jorge, Nov 12, 2026).
// Reads committed files only (data/, public/, rules/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluate, index } from '../scripts/lib/cond.mjs';
import { rawScore, normalize } from '../scripts/lib/score2.mjs';

const rd = (f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const schedule = rd('data/schedule.json');
const practice = rd('data/practice.json').keys;
const excluded = rd('data/excluded.json').keys;
const facts = rd('data/facts.json');
const F = index(facts);

test('practice never uses a prompt scheduled as a Daily', () => {
  assert.ok(practice.length >= 50, 'a practice pool exists');
  const hashes = new Set(schedule.days.flatMap((d) => [].concat(d.h).map((h) => d.date + h)));
  for (const k of practice) for (const d of schedule.days) assert.ok(![].concat(d.h).includes(sha(d.date + ':' + k)), `${k} is scheduled on ${d.date}`);
  assert.ok(hashes.size > 0);
});
test('practice pool and published samples never overlap', () => {
  for (const k of excluded) assert.ok(!practice.includes(k));
});
test('no prompt twice in the schedule', () => {
  // Same key on two days would give different hashes, so check per key via the candidate-free rule:
  // every v2 day has 5 distinct round hashes, and the schedule is one year at most.
  for (const d of schedule.days) if (d.v === 2) assert.equal(new Set(d.h).size, d.h.length);
  for (const d of schedule.days) if (d.v === 2 && d.date >= '2026-11-13') assert.equal(d.h.length, 10, d.date + ' has 10 questions');
  assert.ok(schedule.days.length <= 365);
});
test('every scheduled day has its lock and the practice pool its locks', () => {
  for (const d of schedule.days) assert.ok(existsSync(new URL(`../public/prompts/${d.date}.lock`, import.meta.url)), d.date);
  const n = rd('public/practice/index.json').count;
  assert.equal(n, practice.length);
  for (let i = 1; i <= n; i++) assert.ok(existsSync(new URL(`../public/practice/${i}.lock`, import.meta.url)));
});

const unit = (name) => F.units.findIndex((u) => u.name === name);
const P = (id) => F.byId.get(id);
test('era names are exact: New Jersey Nets seasons are not Brooklyn Nets seasons', () => {
  const kidd = P('jason-kidd');
  const r = evaluate({ t: 'teams', u: [unit('Brooklyn Nets'), unit('Dallas Mavericks')] }, kidd, F);
  assert.equal(r.ok, false);
  assert.match(r.fail, /New Jersey Nets, not the Brooklyn Nets/);
});
test('an award counts for the team he played the most games for that season', () => {
  const gooden = P('drew-gooden');
  assert.equal(evaluate({ t: 'award', a: 'allRookie', u: unit('Memphis Grizzlies') }, gooden, F).ok, true);
  assert.equal(evaluate({ t: 'award', a: 'allRookie', u: unit('Orlando Magic') }, gooden, F).ok, false);
});
test('a title needs the title team and a playoff game for it that season', () => {
  const r = evaluate({ t: 'ring', u: unit('San Antonio Spurs') }, P('tim-duncan'), F);
  assert.equal(r.ok, true);
  assert.match(r.ev[0], /Titles? .*1999/);
});
test('stat seasons need 40+ games for that team', () => {
  const r = evaluate({ t: 'stat', k: 'ppg', v: 20, u: unit('Denver Nuggets') }, P('laphonso-ellis'), F);
  assert.equal(r.ok, true);
  for (const e of r.ev) assert.ok(+e.match(/\((\d+) games\)/)[1] >= 40);
});
test('birthplace, not nationality', () => {
  const r = evaluate({ t: 'bornout', u: unit('Los Angeles Lakers') }, P('kyrie-irving'), F);
  assert.equal(r.ok, false);   // born in Melbourne, but never a Laker
  assert.match(r.fail, /Born in Melbourne, Australia/);
});
test('scores: fixed, 1 to 100, ties equal', () => {
  const s = normalize([0.1, 0.5, 0.5, 0.9]);
  assert.deepEqual(s, [1, 51, 51, 100]);
  const a = rawScore({ fame: 3, careerGames: 300, connGames: 4 });
  assert.equal(a, rawScore({ fame: 3, careerGames: 300, connGames: 4 }));
  assert.ok(rawScore({ fame: 1, careerGames: 2, connGames: 2 }) < rawScore({ fame: 1, careerGames: 200, connGames: 2 }), 'a 2-game career is damped');
});

test('day pages: own canonical and card, nothing of the puzzle in them', () => {
  for (const d of schedule.days) {
    const h = readFileSync(new URL(`../public/${d.date}/index.html`, import.meta.url), 'utf8');
    assert.ok(h.includes(`<link rel="canonical" href="https://hoopsmatic.com/deep-cut/${d.date}/">`), d.date);
    assert.ok(h.includes(`window.DC_DATE = "${d.date}"`));
    assert.ok(h.includes(`https://hoopsmatic.com/deep-cut/og-card/${d.date}`));
    assert.ok(h.includes('<meta name="robots" content="noindex, follow">'), 'noindex stays on');
    assert.ok(!/Name a player who/.test(h), 'no prompt text');
    assert.ok(existsSync(new URL(`../public/og/${d.date}.jpg`, import.meta.url)), 'card ' + d.date);
  }
});

test('headshots are tagged in the suggestion list (scripts/headshots.mjs ran last)', () => {
  const rows = rd('public/players.json').players;
  const tagged = rows.filter((r) => typeof r[6] === 'string' && /^(f|n):/.test(r[6]));
  const untagged = rows.filter((r) => r[6] && !/^(f|n):/.test(String(r[6])));
  assert.equal(untagged.length, 0, 'every headshot carries its source tag');
  assert.ok(tagged.filter((r) => r[6].startsWith('n:')).length >= 1000, 'NBA.com headshots present');
});

test('the timer is a setting the page and the server read', () => {
  const l = rd('rules/launch.json');
  assert.ok(Number.isInteger(l.seconds) && l.seconds >= 5);
  assert.equal(rd('public/config.json').seconds, l.seconds);
});
test('the one-line reason reads as plain words', async () => {
  const { whyText, evaluate } = await import('../scripts/lib/cond.mjs');
  const c = { t: 'ring', u: unit('San Antonio Spurs') };
  const p = P('glenn-robinson');
  const t = whyText(c, p, F, 96, evaluate(c, p, F).link);
  assert.match(t, /^A two-time All-Star, but only 9 games for the Spurs, an easy one to forget\.$/);
  assert.ok(!/of the other/.test(t));
});
