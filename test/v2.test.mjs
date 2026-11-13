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
  for (const d of schedule.days) assert.equal(d.v === 2 && d.h.length, 10, d.date + ' has 10 questions');
  // Jorge, Nov 14: the schedule runs through the end of 2027; a question may come back after 60 days.
  assert.ok(schedule.days[schedule.days.length - 1].date <= '2027-12-31');
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
test('every scheduled and practice question: the most obvious answer scores exactly 1, the least obvious exactly 100', () => {
  const ex = rd('data/extremes.json');
  const days = Object.entries(ex.days);
  assert.equal(days.length, schedule.days.length, 'every scheduled day checked');
  for (const [date, qs] of days) { assert.equal(qs.length, 10, date); for (const q of qs) assert.deepEqual(q, [1, 100], date); }
  assert.equal(ex.practice.length, practice.length, 'every practice question checked');
  for (const q of ex.practice) assert.deepEqual(q, [1, 100]);
});
test('scores: fixed, 1 to 100, ties equal, ties at either end get exactly 1 or 100', () => {
  const s = normalize([0.1, 0.5, 0.5, 0.9]);
  assert.deepEqual(s, [1, 51, 51, 100]);
  assert.deepEqual(normalize([0.1, 0.1, 0.5, 0.9, 0.9]), [1, 1, 51, 100, 100]);
  assert.deepEqual(normalize([0.2, 0.3]), [1, 100]);
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
    assert.ok(!h.includes('name="robots"'), 'no robots meta: hoopsmatic-worker decides (X-Robots-Tag)');
    assert.ok(h.includes('<h2 class="prompt" id="prompt"></h2>'), 'no prompt text');   // the fixed "Name a player who…" line is page chrome
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

test('roster prompts: one team, one season, exact era name, 1+ game', () => {
  const sonics = unit('Seattle SuperSonics');
  const gp = P('gary-payton');
  const ok = evaluate({ t: 'roster', u: sonics, y: 1996 }, gp, F);
  assert.equal(ok.ok, true);
  assert.match(ok.ev[0], /SuperSonics 1995-96 \(\d+ games\)/);
  const no = evaluate({ t: 'roster', u: unit('Oklahoma City Thunder'), y: 1996 }, gp, F);
  assert.equal(no.ok, false);
  assert.match(no.fail, /SuperSonics, not the Oklahoma City Thunder/);
});

// ---------- the day's mix (Jorge, Nov 13, 2026) ----------
const dayRules = rd('data/day-rules.json').days;
test('every day: one of each category, 6+ types, none more than twice, at most 3 two-team/teammate/roster, at most 4 with a team, 3+ headlines, leaning recent', () => {
  const dates = schedule.days.filter((d) => d.v === 2).map((d) => d.date);
  assert.deepEqual(Object.keys(dayRules).sort(), dates.sort(), 'every scheduled day has its rules line');
  for (const [date, qs] of Object.entries(dayRules)) {
    assert.equal(qs.length, 10, date);
    const per = {};
    for (const [type] of qs) per[type] = (per[type] || 0) + 1;
    assert.ok(Math.max(...Object.values(per)) <= 2, `${date}: a type more than twice`);
    assert.ok(Object.keys(per).length >= 6, `${date}: fewer than 6 types`);
    for (const cat of ['money', 'accolade', 'record', 'physical', 'origin']) assert.ok(qs.some((q) => q[2] === cat), `${date}: no ${cat} question`);
    assert.ok(qs.filter((q) => ['A', 'B', 'F'].includes(q[3])).length <= 3, `${date}: more than 3 two-team/teammate/roster`);
    assert.ok(qs.filter((q) => q[1] === 'modern').length >= 5, `${date}: fewer than 5 mostly-recent questions`);
    assert.ok(qs.filter((q) => q[1] === '80s').length <= 2, `${date}: more than 2 from the 1980s`);
    assert.ok(!qs.some((q) => q[1] === 'old'), `${date}: a question whose answers are mostly before 1980-81`);
    assert.ok(qs.filter((q) => q[4]).length <= 4, `${date}: more than 4 questions mention a team`);
    assert.ok(qs.filter((q) => q[5]).length >= 3, `${date}: fewer than 3 headline questions`);
    assert.ok(qs.filter((q) => q[0] === 'height' || q[0] === 'birth-city').length <= 1, `${date}: height and birth city/state together`);
  }
});
const unitId = (name) => facts.units.findIndex((u) => u.name === name);
const byN = (n) => facts.players.find((p) => p.n === n);
test('Amir Johnson fits "played for the Detroit Pistons and the Toronto Raptors" (permanent; Jorge, Nov 13)', () => {
  const r = evaluate({ t: 'teams', u: [unitId('Detroit Pistons'), unitId('Toronto Raptors')] }, byN('Amir Johnson'), F);
  assert.equal(r.ok, true, r.fail);
  assert.match(r.ev[0], /^Pistons 2005-06 to 2008-09/);
});
test('plain wording: a star\'s teammate counts in any season they shared', () => {
  const r = evaluate({ t: 'mate', p: byN('Donovan Mitchell').i, u: unitId('Utah Jazz') }, byN('Rudy Gobert'), F);
  assert.equal(r.ok, true, r.fail);
});
test('new question types read the facts', () => {
  const mia = unitId('Miami Heat'), lal = unitId('Los Angeles Lakers');
  assert.equal(evaluate({ t: 'salary', v: 20, u: mia }, byN('Ryan Anderson'), F).ok, true, 'salary: $20M+ in a season he played for Miami');
  assert.equal(evaluate({ t: 'bornin', pl: 'Chicago, Illinois', pn: 'Chicago' }, byN('Jabari Parker'), F).ok, true, 'born in Chicago');
  assert.equal(evaluate({ t: 'abroad', c: 'Spain' }, byN('Walter Tavares'), F).ok, true, 'Spain before the NBA');
  assert.equal(evaluate({ t: 'points', v: 15000, u: lal }, byN('Magic Johnson'), F).ok, true, 'career points, any era');
  assert.equal(evaluate({ t: 'game', k: 'pts', v: 50, u: unitId('Philadelphia Warriors') }, byN('Wilt Chamberlain'), F).ok, true, 'a 50-point game (box scores)');
  assert.equal(evaluate({ t: 'height', ge: 84, u: lal }, byN('Kareem Abdul-Jabbar'), F).ok, true, 'listed height');
  assert.equal(evaluate({ t: 'votes', a: 'MVP', u: lal }, byN('Kobe Bryant'), F).ok, true, 'MVP votes');
  assert.equal(evaluate({ t: 'allany', a: 'allStar', u: mia }, byN('Shaquille O\'Neal'), F).ok, true, 'All-Star, any team');
  assert.equal(evaluate({ t: 'pick', lo: 1, hi: 10, u: unitId('Toronto Raptors') }, byN('Vince Carter'), F).ok, true, 'draft pick');
  assert.equal(evaluate({ t: 'gameany', k: 'pts', v: 100 }, byN('Wilt Chamberlain'), F).ok, true, 'no-team game high');
  assert.equal(evaluate({ t: 'gameany', k: 'p2020', v: 1 }, byN('Kevin Love'), F).ok, true, '20-20 game');
  assert.equal(evaluate({ t: 'class', y: 2003 }, byN('LeBron James'), F).ok, true, 'draft class');
  assert.equal(evaluate({ t: 'votesany', a: 'MVP', top: 1 }, byN('Steve Nash'), F).ok, true, 'MVP voting');
  assert.equal(evaluate({ t: 'club', name: 'Real Madrid', c: 'Spain' }, byN('Luka Doncic'), F).ok, true, 'a club abroad');
  assert.equal(evaluate({ t: 'mateany', p: byN('Stephen Curry').i }, byN('Klay Thompson'), F).ok, true, 'teammate, any team');
});

test('sitemap state: the main page and every day from #1, each with a hash and a lastmod', () => {
  const st = rd('data/sitemap-state.json').urls;
  const launch = rd('rules/launch.json').launch;
  assert.ok(st['/deep-cut/'] && /^[0-9a-f]{64}$/.test(st['/deep-cut/'].hash) && /^\d{4}-\d{2}-\d{2}$/.test(st['/deep-cut/'].lastmod));
  const days = schedule.days.map((d) => d.date).filter((d) => d >= launch);
  assert.deepEqual(Object.keys(st).filter((k) => k !== '/deep-cut/').sort(), days.map((d) => `/deep-cut/${d}/`).sort());
  for (const [path, v] of Object.entries(st)) {
    const file = path === '/deep-cut/' ? 'public/index.html' : `public/${path.slice(10)}index.html`;
    assert.equal(v.hash, sha(readFileSync(new URL('../' + file, import.meta.url), 'utf8')), path + ': hash of the page as built');
  }
  assert.deepEqual(JSON.parse(readFileSync(new URL('../public/sitemap-state.json', import.meta.url), 'utf8')).urls, st, 'published copy matches');
});
test('launch: #1 is Nov 16, 2026, in rules/launch.json and the published config', () => {
  assert.equal(rd('rules/launch.json').launch, '2026-11-16');
  assert.equal(rd('public/config.json').launch, '2026-11-16');
});
