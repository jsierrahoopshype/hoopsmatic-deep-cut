// The Daily schedule, one encrypted lock per day, and the practice pool.
//
//   node scripts/pull-data.mjs && node scripts/generate-prompts.mjs && node scripts/build.mjs [--start YYYY-MM-DD]
//
// Reads .cache/candidates.json (generate-prompts.mjs), data/excluded.json,
// data/schedule.json and data/practice.json (if any). Writes
//   data/schedule.json            one entry per Daily (hashes only)
//   public/prompts/<date>.lock    the Daily: 5 rounds (v2); days made before
//                                 the five-round format keep their v1 lock
//   data/practice.json            the practice-only prompt keys
//   public/practice/<n>.lock      one practice round each, and index.json
//   public/config.json            the launch day (rules/launch.json)
//
// DAILY (Jorge, Nov 12, 2026): 5 rounds, every prompt used at most once in a
// year, no team twice in a day, at most 2 rounds from one group (A two
// teams, B teammate, C title/award, D team plus another fact, E stat
// season). The schedule covers as many days (up to 365) as the pool allows;
// the weekly refresh extends it.
//
// PRACTICE (Jorge, Nov 12): Unlimited practice only ever uses past Dailies
// and a practice-only pool that is never scheduled: every 10th prompt in the
// seeded order is set aside for it here, and data/practice.json keeps that
// set stable from one refresh to the next.
//
// FROZEN DAYS: every day up to tomorrow (9:00 AM ET day) already in
// data/schedule.json keeps its lock byte for byte. Later days keep their
// prompts while they still pass, with answers rebuilt from new data; a lock
// is rewritten only when its rounds change.
//
// data/schedule.json is public, so it holds only hashes: h = sha256(date +
// ':' + key) per round, a = sha256 of the day's rounds.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { lock, fetchPubkey } from './lib/lock.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const MAX_DAYS = 365;
const ROUNDS = 5;
const PRACTICE_EVERY = 10;
const DAY_MS = 86400000;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const rd = (f) => JSON.parse(readFileSync(ROOT + f, 'utf8'));
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);

const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
export function dailyDate(ms) {
  const p = Object.fromEntries(etFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  let d = Date.UTC(+p.year, +p.month - 1, +p.day);
  if (+p.hour < 9) d -= DAY_MS;
  return new Date(d).toISOString().slice(0, 10);
}

const today = dailyDate(Date.now());
const frozenThrough = addDays(today, 1);
const cand = rd('.cache/candidates.json');
const excluded = new Set(rd('data/excluded.json').keys);
const old = existsSync(ROOT + 'data/schedule.json') ? rd('data/schedule.json') : null;
const START = old ? old.start : arg('start', today);
const all = new Map(cand.prompts.map((c) => [c.key, c]));
const hashOf = (date, key) => sha(date + ':' + key);
function keyFor(date, h) { for (const k of all.keys()) if (hashOf(date, k) === h) return k; return null; }

// The launch day for the page's numbers.
const LAUNCH = rd('rules/launch.json').launch;
if (!/^\d{4}-\d{2}-\d{2}$/.test(LAUNCH)) throw new Error('rules/launch.json: launch must be YYYY-MM-DD');
mkdirSync(ROOT + 'public/prompts', { recursive: true });
mkdirSync(ROOT + 'public/practice', { recursive: true });
writeFileSync(ROOT + 'public/config.json', JSON.stringify({ launch: LAUNCH }) + '\n');

// Seeded order (same data, same schedule).
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20261112);
const order = [...cand.prompts].sort((a, b) => a.key.localeCompare(b.key));
for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

// Practice-only pool: kept from the last build, topped up to every 10th prompt.
const prevPractice = existsSync(ROOT + 'data/practice.json') ? rd('data/practice.json').keys : null;
let practiceKeys;
if (prevPractice) practiceKeys = prevPractice.filter((k) => all.has(k));
else practiceKeys = order.filter((c, i) => i % PRACTICE_EVERY === PRACTICE_EVERY - 1 && !excluded.has(c.key)).map((c) => c.key);
const practice = new Set(practiceKeys);

const pub = await fetchPubkey();
const used = new Set([...excluded, ...practice]);
const days = [];
const recent = [];   // units of the last days
let kept = 0, wrote = 0, replaced = 0;

const roundOf = (c) => ({ key: c.key, type: c.type, group: c.group, text: c.text, rule: c.rule, teams: c.teams, cond: c.cond, answers: c.answers.map((a) => [a.i, a.s]) });
const GROUP_ORDER = { A: 0, D: 1, E: 2, B: 3, C: 4 };

for (let i = 0; i < MAX_DAYS; i++) {
  const date = addDays(START, i);
  const prev = old && old.days[i] && old.days[i].date === date ? old.days[i] : null;
  const lockPath = `${ROOT}public/prompts/${date}.lock`;
  if (prev && date <= frozenThrough && existsSync(lockPath)) {
    for (const h of [].concat(prev.h)) { const k = keyFor(date, h); if (k) used.add(k); }
    recent.push([]);
    days.push(prev);
    kept++;
    continue;
  }
  // Keep this day's prompts if they still pass and are free.
  let picks = [];
  if (prev && Array.isArray(prev.h)) {
    picks = prev.h.map((h) => keyFor(date, h)).filter((k) => k && !used.has(k)).map((k) => all.get(k));
    if (picks.length !== prev.h.length) replaced++;
  }
  picks = fillDay(picks, recent.slice(-2).flat());
  if (picks.length < ROUNDS) break;   // the pool is used up: the schedule ends here
  picks.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group]);
  for (const c of picks) used.add(c.key);
  recent.push(picks.flatMap((c) => c.units));
  const rounds = picks.map(roundOf);
  const entry = { date, v: 2, h: picks.map((c) => hashOf(date, c.key)), a: sha(JSON.stringify(rounds)) };
  if (!prev || prev.a !== entry.a || !existsSync(lockPath)) {
    const plain = { v: 2, game: 'deep-cut', date, scoring: cand.prompts[0].scoring, asOf: cand.asOf, rounds };
    writeFileSync(lockPath, JSON.stringify(await lock(plain, pub)) + '\n');
    wrote++;
  }
  days.push(entry);
}
// Locks past the end of the schedule (a shorter schedule than before) go.
const scheduled = new Set(days.map((d) => d.date));
for (const f of readdirSync(ROOT + 'public/prompts')) if (f.endsWith('.lock') && !scheduled.has(f.slice(0, 10)) && f.slice(0, 10) > frozenThrough) unlinkSync(ROOT + 'public/prompts/' + f);

// Five rounds: no team twice in a day, teams from the last two days avoided
// when possible, the scarcest groups first. Passes: 1 per group, then 2 per
// group, then (when the pool runs thin) up to 3 from group D, whose types
// differ (birthplace, career start, college, draft), never more than 2 of
// one type and never more than 2 two-team rounds.
function fillDay(picks, recentUnits) {
  const per = {}, perType = {};
  const dayUnits = new Set();
  for (const c of picks) { per[c.group] = (per[c.group] || 0) + 1; perType[c.type] = (perType[c.type] || 0) + 1; c.units.forEach((u) => dayUnits.add(u)); }
  const cap = (pass, g) => (pass === 0 ? 1 : pass === 1 ? 2 : g === 'D' ? 3 : 2);
  const free = (c) => !used.has(c.key) && !picks.includes(c);
  const remaining = {};
  for (const c of order) if (free(c)) remaining[c.group] = (remaining[c.group] || 0) + 1;
  for (const pass of [0, 1, 2]) {
    const strict = pass === 0;
    while (picks.length < ROUNDS) {
      const groups = Object.keys(remaining).filter((g) => remaining[g] > 0 && (per[g] || 0) < cap(pass, g))
        .sort((a, b) => (per[a] || 0) - (per[b] || 0) || remaining[b] - remaining[a]);
      let got = null;
      for (const g of groups) {
        got = order.find((c) => c.group === g && free(c) && (perType[c.type] || 0) < 2 && !c.units.some((u) => dayUnits.has(u)) && (!strict || !c.units.some((u) => recentUnits.includes(u))));
        if (got) break;
      }
      if (!got) break;
      picks.push(got);
      per[got.group] = (per[got.group] || 0) + 1;
      perType[got.type] = (perType[got.type] || 0) + 1;
      remaining[got.group]--;
      got.units.forEach((u) => dayUnits.add(u));
    }
  }
  return picks;
}

// Practice locks, numbered 1..N in a stable (sorted) order.
for (const f of readdirSync(ROOT + 'public/practice')) if (f.endsWith('.lock')) unlinkSync(ROOT + 'public/practice/' + f);
const pk = [...practice].sort();
for (let n = 1; n <= pk.length; n++) {
  const c = all.get(pk[n - 1]);
  writeFileSync(`${ROOT}public/practice/${n}.lock`, JSON.stringify(await lock({ v: 2, game: 'deep-cut', practice: n, scoring: c.scoring, asOf: cand.asOf, round: roundOf(c) }, pub)) + '\n');
}
writeFileSync(ROOT + 'public/practice/index.json', JSON.stringify({ v: 1, count: pk.length }) + '\n');
writeFileSync(ROOT + 'data/practice.json', JSON.stringify({ _about: 'Practice-only prompt keys (scripts/build.mjs): never scheduled as a Daily.', keys: pk }, null, 1) + '\n');

writeFileSync(ROOT + 'data/schedule.json', JSON.stringify({
  _about: 'Deep Cut days (scripts/build.mjs). v2 days: h = sha256(date:key) per round, a = sha256(rounds). v1 days (before five rounds): one h. The prompts are only in the encrypted public/prompts/<date>.lock files.',
  v: 2, start: START, days,
}, null, 1) + '\n');
const last = days[days.length - 1].date;
console.log(`start ${START}, today ${today}, frozen through ${frozenThrough}: ${kept} kept, ${wrote} locks written, ${replaced} days with a prompt replaced; schedule ends ${last} (${days.length} days); practice pool ${pk.length}`);
