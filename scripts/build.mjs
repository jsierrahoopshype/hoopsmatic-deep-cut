// The schedule and one encrypted lock per day.
//
//   node scripts/pull-data.mjs && node scripts/generate-prompts.mjs && node scripts/build.mjs [--start YYYY-MM-DD]
//
// Reads .cache/candidates.json (generate-prompts.mjs), data/excluded.json and
// data/schedule.json (if any). Writes data/schedule.json and
// public/prompts/YYYY-MM-DD.lock, one per day for DAYS days from the start.
//
// FROZEN DAYS (Jorge, Nov 11, 2026: the weekly refresh "never changes a past
// or current day"): every day up to tomorrow (by the 9:00 AM ET day) that is
// already in data/schedule.json keeps its lock byte for byte. Tomorrow is
// frozen too, so a refresh that finishes after 9:00 AM ET cannot touch the
// day that just started.
//
// LATER DAYS: the same prompt as before if it still passes the rules, with
// its answer list rebuilt from the new data; only a changed answer list gets
// a new lock. A prompt that no longer passes is replaced by a new one.
//
// data/schedule.json is public, so it never says what a day's prompt is: it
// keeps h = sha256(date + ':' + prompt key) and a = sha256 of the answer
// list. Finding a prompt from h means running this generator over the data,
// which is no shortcut over working the prompt out yourself.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { lock, fetchPubkey } from './lib/lock.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DAYS = 365;
const DAY_MS = 86400000;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const rd = (f) => JSON.parse(readFileSync(ROOT + f, 'utf8'));
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);

// The 9:00 AM ET day, as the server's dailyDate().
const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
export function dailyDate(ms) {
  const p = Object.fromEntries(etFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  let d = Date.UTC(+p.year, +p.month - 1, +p.day);
  if (+p.hour < 9) d -= DAY_MS;
  return new Date(d).toISOString().slice(0, 10);
}

const now = Date.now();
const today = dailyDate(now);
const frozenThrough = addDays(today, 1);
const byType = rd('.cache/candidates.json');
const excluded = new Set(rd('data/excluded.json').keys);
const old = existsSync(ROOT + 'data/schedule.json') ? rd('data/schedule.json') : null;
const START = old ? old.start : arg('start', today);

// Candidates by key, and every key's hash for each day it could sit on.
const all = new Map();
for (const list of Object.values(byType)) for (const c of list) all.set(c.key, c);
const answersOf = (c) => c.answers.map((a) => ({ id: a.id, name: a.name, score: a.score, link: a.link || null }));
const answersHash = (c) => sha(JSON.stringify(answersOf(c)));
function keyFor(date, h) {
  for (const k of all.keys()) if (sha(date + ':' + k) === h) return k;
  return null;
}

// Seeded order per type, as generate-prompts.mjs (same data, same schedule).
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20261112);
for (const t in byType) for (let i = byType[t].length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [byType[t][i], byType[t][j]] = [byType[t][j], byType[t][i]]; }
const ROTATION = ['two-teams', 'award-team', 'team-college', 'teammate', 'country-team', 'two-teams', 'team-draft'];

const pub = await fetchPubkey();
mkdirSync(ROOT + 'public/prompts', { recursive: true });

const used = new Set(excluded);
const recent = [];   // candidates of the days so far (null where unknown)
const days = [];
let wrote = 0, kept = 0, replaced = 0;
for (let i = 0; i < DAYS; i++) {
  const date = addDays(START, i);
  const prev = old && old.days[i] && old.days[i].date === date ? old.days[i] : null;
  const lockPath = `${ROOT}public/prompts/${date}.lock`;
  if (prev && date <= frozenThrough && existsSync(lockPath)) {
    // Frozen: lock untouched. Its prompt, if still a candidate, is used up.
    const k = keyFor(date, prev.h);
    if (k) used.add(k);
    recent.push(k ? all.get(k) : null);
    days.push(prev);
    kept++;
    continue;
  }
  let c = prev ? (() => { const k = keyFor(date, prev.h); return k && !used.has(k) ? all.get(k) : null; })() : null;
  if (prev && !c) replaced++;
  if (!c) c = choose(i);
  if (!c) throw new Error(`ran out of prompts on ${date}`);
  used.add(c.key);
  recent.push(c);
  const entry = { n: i + 1, date, h: sha(date + ':' + c.key), a: answersHash(c) };
  if (!prev || prev.a !== entry.a || prev.h !== entry.h || !existsSync(lockPath)) {
    const plain = { v: 1, game: 'deep-cut', n: i + 1, date, text: c.text, answers: answersOf(c) };
    writeFileSync(lockPath, JSON.stringify(await lock(plain, pub)) + '\n');
    wrote++;
  }
  days.push(entry);
}

function choose(i) {
  const recentUnits = new Set(recent.slice(-6).filter(Boolean).flatMap((c) => c.units));
  const recentStars = new Set(recent.slice(-30).filter(Boolean).map((c) => c.star).filter(Boolean));
  for (let k = 0; k < ROTATION.length; k++) {
    const list = byType[ROTATION[(i + k) % ROTATION.length]] || [];
    for (const strict of [true, false]) for (const c of list) {
      if (used.has(c.key)) continue;
      if (strict && c.units.some((u) => recentUnits.has(u))) continue;
      if (c.star && recentStars.has(c.star)) continue;
      return c;
    }
  }
  return null;
}

writeFileSync(ROOT + 'data/schedule.json', JSON.stringify({
  _about: 'Deep Cut days (scripts/build.mjs). h = sha256(date:prompt key), a = sha256(answer list). The prompts themselves are only in the encrypted public/prompts/<date>.lock files.',
  v: 1, start: START, days,
}, null, 1) + '\n');
console.log(`start ${START}, today ${today}, frozen through ${frozenThrough}: ${kept} kept, ${wrote} locks written, ${replaced} prompts replaced`);
