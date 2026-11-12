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
// DAILY (Jorge, Nov 13, 2026): 10 questions, every prompt used at most once
// in a year; the day's mix is in fillDay (one question from each category,
// 6+ types, at most 3 two-team/teammate/roster, leaning recent); groups take
// turns through the day. The schedule covers as many days (up to 365) as the pool allows;
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
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, rmSync } from 'node:fs';
import { lock, fetchPubkey } from './lib/lock.mjs';
import { checkQuestion } from './lib/answer-check.mjs';
import { index } from './lib/cond.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const MAX_DAYS = 365;
const ROUNDS = 10;
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
// Frozen: today and tomorrow, but only from the public launch day on (Jorge,
// Nov 12, 2026: nobody else plays before launch, so preview days are rebuilt
// freely). Before launch nothing is frozen.
const LAUNCH_DAY = JSON.parse(readFileSync(ROOT + 'rules/launch.json', 'utf8')).launch;
const frozenThrough = addDays(today, 1) < LAUNCH_DAY ? '0000-00-00' : addDays(today, 1);
const isFrozen = (date) => date >= LAUNCH_DAY && date <= frozenThrough;
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
const SECONDS = rd('rules/launch.json').seconds;
if (!Number.isInteger(SECONDS) || SECONDS < 5 || SECONDS > 120) throw new Error('rules/launch.json: seconds must be a whole number, 5 to 120');
writeFileSync(ROOT + 'public/config.json', JSON.stringify({ launch: LAUNCH, seconds: SECONDS }) + '\n');

// Seeded order (same data, same schedule).
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20261112);
const order = [...cand.prompts].sort((a, b) => a.key.localeCompare(b.key));
for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

// Practice-only pool: kept from the last build, topped up to every 10th prompt.
const prevPractice = existsSync(ROOT + 'data/practice.json') ? rd('data/practice.json').keys : null;
let practiceKeys;
if (prevPractice) practiceKeys = prevPractice.filter((k) => all.has(k));
else practiceKeys = order.filter((c, i) => i % PRACTICE_EVERY === PRACTICE_EVERY - 1 && !excluded.has(c.key) && c.era !== 'old' && !c.headline).map((c) => c.key);
const practice = new Set(practiceKeys);

const pub = await fetchPubkey();
const used = new Set([...excluded, ...practice]);
const days = [];
const recent = [];   // units of the last days
const recentT = [];  // themes of the last days
let kept = 0, wrote = 0, replaced = 0;

// Every question: its most obvious answer scores exactly 1 and its least
// obvious exactly 100 (Jorge, Nov 12). The build stops if not; the pairs go
// to data/extremes.json for the tests.
const extremes = { days: {}, practice: [] };
// Every question's answers are checked before anything is written (lib/answer-check.mjs).
const FACTS = rd('data/facts.json'), FI = index(FACTS);
const checkErrs = [];
// Each day's questions as [type, era, category, group] (no keys, no
// answers), for the tests: data/day-rules.json.
const dayMeta = {};
function checkExtremes(c, where) {
  const sc = c.answers.map((a) => a.s);
  const lo = Math.min(...sc), hi = Math.max(...sc);
  if (lo !== 1 || hi !== 100) throw new Error(`${where} ${c.key}: scores run ${lo}-${hi}, not 1-100`);
  return [lo, hi];
}
const roundOf = (c) => ({ key: c.key, type: c.type, group: c.group, text: c.text, rule: c.rule, teams: c.teams, cond: c.cond, answers: c.answers.map((a) => [a.i, a.s]) });
const GROUP_ORDER = { A: 0, G: 1, D: 2, C: 3, F: 4, E: 5, P: 6, B: 7, H: 8 };

// Day rules (see fillDay).
const TYPE_CAP = 2, MIN_MODERN = 5, MAX_80S = 2, MIN_TYPES = 6, MAX_ABF = 3, MAX_TEAM = 4, MIN_HEAD = 3;
const HB = new Set(['height', 'birth-city']);   // at most one of the two a day
const ABF = new Set(['A', 'B', 'F']);   // two teams, teammate, roster
const CATS = ['money', 'accolade', 'record', 'physical', 'origin'];
const typeTotal = {};
for (const c of order) if (c.era !== 'old') typeTotal[c.type] = (typeTotal[c.type] || 0) + 1;
const typeUsed = {};

for (let i = 0; i < MAX_DAYS; i++) {
  const date = addDays(START, i);
  const prev = old && old.days[i] && old.days[i].date === date ? old.days[i] : null;
  const lockPath = `${ROOT}public/prompts/${date}.lock`;
  if (prev && isFrozen(date) && existsSync(lockPath)) {
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
  picks = fillDay(picks, recent.slice(-2).flat(), recentT.slice(-3).flat());
  if (picks.length < ROUNDS) break;   // the pool is used up: the schedule ends here
  // Groups take turns: A G D C F E P B H ...
  // A seeded shuffle per date, so the days don't share a slot pattern;
  // no two team questions or two of one category back to back where avoidable.
  {
    const r = rng(parseInt(sha('order:' + date).slice(0, 8), 16));
    const pool = [...picks].sort((a, b) => a.key.localeCompare(b.key));
    for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
    const out = [];
    while (pool.length) {
      const prev = out[out.length - 1];
      let k = pool.findIndex((c) => !prev || ((!c.team || !prev.team) && (!c.cat || c.cat !== prev.cat)));
      if (k < 0) k = 0;
      out.push(pool.splice(k, 1)[0]);
    }
    picks = out;
  }
  for (const c of picks) used.add(c.key);
  recent.push(picks.flatMap((c) => c.units));
  recentT.push(picks.map((c) => c.theme));
  const rounds = picks.map(roundOf);
  for (const c of picks) checkErrs.push(...checkQuestion(c, FACTS, FI));
  extremes.days[date] = picks.map((c) => checkExtremes(c, date));
  dayMeta[date] = picks.map((c) => [c.type, c.era, c.cat, c.group, c.team ? 1 : 0, c.headline ? 1 : 0, c.family]);
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

// Ten questions a day (Jorge, Nov 13, 2026; the first four rules Nov 14):
//   - at most 4 questions that mention a team;
//   - at least 3 headline questions (no team: game highs, combine, award
//     votes, clubs abroad, single-season salary, draft, medals, birthplace);
//   - height and birth city/state: at most 1 of the two;
//   - one threshold of a family a day (never "25+ rebounds" and "26+");
//   - no theme (a question with its team taken out) from the 3 days before,
//     where the pool allows;
//   - at least one question from each category: money (exactly one: the
//     scarcest pool), accolade, record, physical (or draft), origin;
//   - at least 6 different question types, none more than twice;
//   - two-team, teammate and roster questions together at most 3;
//   - leaning recent: 5+ 'modern' questions, at most 2 '80s', never 'old'
//     (era: generate-prompts.mjs, from the answers, never a condition);
//   - no team twice in a day, never two rosters of one franchise, teams
//     from the last two days avoided when possible;
//   - within those, the type with the fewest questions today and the most
//     of its pool left comes next.
function dayOk(picks) {
  const perType = {}, cats = new Set(), units = new Set();
  let modern = 0, eighties = 0, abf = 0, team = 0, head = 0, hb = 0;
  const fams = new Set();
  for (const c of picks) {
    if (c.team) team++;
    if (c.headline) head++;
    if (HB.has(c.type)) hb++;
    if (fams.has(c.family)) return false;
    fams.add(c.family);
    perType[c.type] = (perType[c.type] || 0) + 1;
    if (perType[c.type] > TYPE_CAP) return false;
    if (c.cat) cats.add(c.cat);
    if (c.era === 'old') return false;
    if (c.era === 'modern') modern++;
    if (c.era === '80s') eighties++;
    if (ABF.has(c.group)) abf++;
    for (const u of c.units) { if (units.has(u)) return false; units.add(u); }
  }
  return picks.length === ROUNDS && team <= MAX_TEAM && head >= MIN_HEAD && hb <= 1 && modern >= MIN_MODERN && eighties <= MAX_80S && abf <= MAX_ABF
    && Object.keys(perType).length >= MIN_TYPES && CATS.every((k) => cats.has(k));
}
function fillDay(picks, recentUnits, recentThemes = []) {
  if (picks.length && !dayOk(picks)) picks = [];
  const perType = {}, cats = new Set();
  const dayUnits = new Set(), dayCodes = new Set();
  let modern = 0, eighties = 0, abf = 0, team = 0, head = 0, hb = 0;
  const fams = new Set();
  const take = (c) => {
    picks.push(c);
    if (c.team) team++;
    if (c.headline) head++;
    if (HB.has(c.type)) hb++;
    fams.add(c.family);
    perType[c.type] = (perType[c.type] || 0) + 1;
    if (c.cat) cats.add(c.cat);
    c.units.forEach((u) => dayUnits.add(u));
    if (c.group === 'F') c.units.forEach((u) => dayCodes.add(u.split('|')[0]));
    if (c.era === 'modern') modern++;
    if (c.era === '80s') eighties++;
    if (ABF.has(c.group)) abf++;
  };
  const kept = picks; picks = [];
  for (const c of kept) take(c);
  const free = (c) => !used.has(c.key) && !picks.includes(c) && c.era !== 'old';
  for (const strict of [true, false]) {
    while (picks.length < ROUNDS) {
      const left = ROUNDS - picks.length;
      const needCats = CATS.filter((k) => !cats.has(k));
      const needTypes = Math.max(0, MIN_TYPES - Object.keys(perType).length);
      const needModern = Math.max(0, MIN_MODERN - modern);
      const needHead = Math.max(0, MIN_HEAD - head);
      const fits = (c) => free(c) && (perType[c.type] || 0) < TYPE_CAP
        && (!c.team || team < MAX_TEAM) && (!HB.has(c.type) || hb < 1) && !fams.has(c.family)
        && (needHead < left || c.headline)
        && (!ABF.has(c.group) || abf < MAX_ABF)
        && (c.cat !== 'money' || !cats.has('money'))   // money is the scarcest pool: one a day
        && (c.era !== '80s' || eighties < MAX_80S)
        && !c.units.some((u) => dayUnits.has(u))
        && (c.group !== 'F' || !c.units.some((u) => dayCodes.has(u.split('|')[0])))
        && (!strict || !c.units.some((u) => recentUnits.includes(u)))
        && (!strict || !recentThemes.includes(c.theme)) && !picks.some((x) => x.theme === c.theme)
        // what this pick leaves must still be able to meet the day's minimums
        && (needCats.length < left || needCats.includes(c.cat))
        && (needTypes < left || !perType[c.type])
        && (needModern < left || c.era === 'modern');
      // Scarcest category first while one is missing; then modern first.
      const want = needCats.length ? needCats.sort((a, b) => catLeft(a) - catLeft(b))[0] : null;
      const types = Object.keys(typeTotal).filter((t) => (perType[t] || 0) < TYPE_CAP)
        .sort((a, b) => (perType[a] || 0) - (perType[b] || 0) || (typeUsed[a] || 0) / typeTotal[a] - (typeUsed[b] || 0) / typeTotal[b]);
      let got = null;
      for (const pref of [(c) => (!want || c.cat === want) && (head >= MIN_HEAD || c.headline) && (modern >= MIN_MODERN || c.era === 'modern'),
        (c) => (!want || c.cat === want) && (head >= MIN_HEAD || c.headline), (c) => !want || c.cat === want, () => true]) {
        for (const t of types) { got = order.find((c) => c.type === t && fits(c) && pref(c)); if (got) break; }
        if (got) break;
      }
      if (!got) break;
      take(got);
    }
  }
  if (!dayOk(picks)) return [];
  for (const c of picks) typeUsed[c.type] = (typeUsed[c.type] || 0) + 1;
  return picks;
}
function catLeft(k) { let n = 0; for (const c of order) if (c.cat === k && !used.has(c.key) && c.era !== 'old') n++; return n; }

// Practice locks, numbered 1..N in a stable (sorted) order.
for (const f of readdirSync(ROOT + 'public/practice')) if (f.endsWith('.lock')) unlinkSync(ROOT + 'public/practice/' + f);
const pk = [...practice].sort();
for (let n = 1; n <= pk.length; n++) {
  const c = all.get(pk[n - 1]);
  extremes.practice.push(checkExtremes(c, 'practice ' + n));
  checkErrs.push(...checkQuestion(c, FACTS, FI));
  writeFileSync(`${ROOT}public/practice/${n}.lock`, JSON.stringify(await lock({ v: 2, game: 'deep-cut', practice: n, scoring: c.scoring, asOf: cand.asOf, round: roundOf(c) }, pub)) + '\n');
}
writeFileSync(ROOT + 'public/practice/index.json', JSON.stringify({ v: 1, count: pk.length }) + '\n');
writeFileSync(ROOT + 'data/practice.json', JSON.stringify({ _about: 'Practice-only prompt keys (scripts/build.mjs): never scheduled as a Daily.', keys: pk }, null, 1) + '\n');

// ---------- one page per day (item 10) ----------
// public/<date>/index.html: the game page with the day's own title,
// description, canonical, og: tags and preview card. Nothing of the puzzle
// (no prompt, no answer) is in it, so a day's page can exist before its day.
// noindex stays on (Jorge, Nov 12): the template's robots meta is kept.
const TEMPLATE = readFileSync(ROOT + 'public/index.html', 'utf8');
const DAY_MS_ = 86400000;
const longDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export function dayIdentity(date) {
  const n = Math.round((Date.parse(date) - Date.parse(LAUNCH)) / DAY_MS_) + 1;
  return date >= LAUNCH ? { label: `Deep Cut #${n}`, n } : { label: 'Deep Cut preview', n: null };
}
function dayPage(date) {
  const { label } = dayIdentity(date);
  const url = `https://hoopsmatic.com/deep-cut/${date}/`;
  const title = `${label}: NBA trivia for ${longDate(date)} | HoopsMatic`;
  const desc = `${label}, ${longDate(date)}: ten NBA questions. Name the least obvious player who fits each one; your score is out of 100. No spoilers on this page.`;
  const card = `https://hoopsmatic.com/deep-cut/og-card/${date}`;
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let h = TEMPLATE
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(label + ' · ' + longDate(date))}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="Ten NBA questions. Name the least obvious player who fits. Play this puzzle: no spoilers here.">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${card}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(">)/, `$1${card}$2`)
    .replace(/(<meta property="og:image:alt" content=")[^"]*(">)/, `$1${esc(label + ', ' + longDate(date) + ': Deep Cut by HoopsMatic')}$2`)
    .replace('<script src="/deep-cut/app.js" defer></script>', `<script>window.DC_DATE = "${date}";</script>\n<script src="/deep-cut/app.js" defer></script>`);
  if (!h.includes(`window.DC_DATE = "${date}"`) || !h.includes(`href="${url}"`)) throw new Error('day page template changed: ' + date);
  mkdirSync(`${ROOT}public/${date}`, { recursive: true });
  writeFileSync(`${ROOT}public/${date}/index.html`, h);
}
for (const d of days) dayPage(d.date);
for (const f of readdirSync(ROOT + 'public')) if (/^\d{4}-\d{2}-\d{2}$/.test(f) && !scheduled.has(f) && f > frozenThrough) rmSync(`${ROOT}public/${f}`, { recursive: true, force: true });

if (checkErrs.length) { console.error(checkErrs.slice(0, 30).join('\n')); throw new Error(`answer check: ${checkErrs.length} problems`); }
writeFileSync(ROOT + 'data/day-rules.json', JSON.stringify({ _about: 'Per scheduled day, each question\'s [type, era, category, group, mentions a team, headline, threshold family] (scripts/build.mjs). The tests check the day rules against it.', days: dayMeta }) + '\n');
writeFileSync(ROOT + 'data/extremes.json', JSON.stringify({ _about: 'Lowest and highest score of every scheduled and practice question (scripts/build.mjs): always [1, 100].', ...extremes }) + '\n');
writeFileSync(ROOT + 'data/schedule.json', JSON.stringify({
  _about: 'Deep Cut days (scripts/build.mjs). v2 days: h = sha256(date:key) per round, a = sha256(rounds). v1 days (before five rounds): one h. The prompts are only in the encrypted public/prompts/<date>.lock files.',
  v: 2, start: START, days,
}, null, 1) + '\n');
const last = days[days.length - 1].date;
console.log(`start ${START}, today ${today}, frozen through ${frozenThrough}: ${kept} kept, ${wrote} locks written, ${replaced} days with a prompt replaced; schedule ends ${last} (${days.length} days); practice pool ${pk.length}`);
