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
//   public/practice/<n>.lock      one practice round each, and index.json;
//                                 a lock is rewritten only when its content changes
//   public/config.json            the launch day (rules/launch.json)
//
// DAILY (Jorge, Nov 13, 2026): 10 questions; a question comes back no
// sooner than 60 days after it was used (Jorge, Nov 14), and the schedule
// runs through END_DAY; the day's mix is in lib/schedule.mjs (one question from each category,
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
// is rewritten only when its rounds change. A question that drops out is
// replaced in its own slot only, never by a question a later day holds
// (lib/schedule.mjs), so the other days keep their locks.
//
// data/schedule.json is public, so it holds only hashes: h = sha256(date +
// ':' + key) per round, a = sha256 of the day's rounds.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, rmSync } from 'node:fs';
import { lock, fetchPubkey } from './lib/lock.mjs';
import { checkQuestion } from './lib/answer-check.mjs';
import { index } from './lib/cond.mjs';
import { planDays, seededOrder } from './lib/schedule.mjs';
import { practiceBody, writePracticeLocks } from './lib/practice.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const END_DAY = '2027-12-31';   // Jorge, Nov 14: build the schedule through the end of 2027
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
// Frozen: every past day, today and tomorrow, once the public launch is near
// (Jorge, Nov 12, 2026: nobody else plays before launch, so before it nothing
// is frozen and preview days were rebuilt freely). Since launch the preview
// days (before the launch day) are past days too, replayed like any other,
// so they stay frozen with the rest.
const LAUNCH_DAY = JSON.parse(readFileSync(ROOT + 'rules/launch.json', 'utf8')).launch;
const frozenThrough = addDays(today, 1) < LAUNCH_DAY ? '0000-00-00' : addDays(today, 1);
const isFrozen = (date) => date <= frozenThrough;
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

const order = seededOrder(cand.prompts);

// Practice-only pool: kept from the last build, topped up to every 10th prompt.
const prevPractice = existsSync(ROOT + 'data/practice.json') ? rd('data/practice.json').keys : null;
let practiceKeys;
if (prevPractice) practiceKeys = prevPractice.filter((k) => all.has(k));
else practiceKeys = order.filter((c, i) => i % PRACTICE_EVERY === PRACTICE_EVERY - 1 && !excluded.has(c.key) && c.era !== 'old' && !c.headline).map((c) => c.key);
const practice = new Set(practiceKeys);

const pub = await fetchPubkey();
const never = new Set([...excluded, ...practice]);   // never a Daily
const days = [];
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
// A frozen day keeps its lock, so it keeps its lines in both files too (they
// describe that lock, not today's pool).
const oldExtremes = existsSync(ROOT + 'data/extremes.json') ? rd('data/extremes.json').days || {} : {};
const oldMeta = existsSync(ROOT + 'data/day-rules.json') ? rd('data/day-rules.json').days || {} : {};
function checkExtremes(c, where) {
  const sc = c.answers.map((a) => a.s);
  const lo = Math.min(...sc), hi = Math.max(...sc);
  if (lo !== 1 || hi !== 100) throw new Error(`${where} ${c.key}: scores run ${lo}-${hi}, not 1-100`);
  return [lo, hi];
}
const roundOf = (c) => ({ key: c.key, type: c.type, group: c.group, text: c.text, rule: c.rule, teams: c.teams, cond: c.cond, answers: c.answers.map((a) => [a.i, a.s]) });
const GROUP_ORDER = { A: 0, G: 1, D: 2, C: 3, F: 4, E: 5, P: 6, B: 7, H: 8 };

const MAX_DAYS = Math.round((Date.parse(END_DAY) - Date.parse(START)) / DAY_MS) + 1;
// The old schedule, day by day, as keys (null: a question no longer in the
// pool). A frozen day keeps its lock; the others are planned in
// lib/schedule.mjs, which keeps their questions wherever it can.
const prev = [];
for (let i = 0; i < MAX_DAYS; i++) {
  const date = addDays(START, i);
  const p = old && old.days[i] && old.days[i].date === date ? old.days[i] : null;
  if (!p) { prev.push(null); continue; }
  const frozen = isFrozen(date) && existsSync(`${ROOT}public/prompts/${date}.lock`);
  prev.push({ entry: p, frozen, keys: frozen || Array.isArray(p.h) ? [].concat(p.h).map((h) => keyFor(date, h)) : null });
}
const plan = planDays({ prompts: cand.prompts, never, start: START, maxDays: MAX_DAYS, prev, order });
const how = {};
for (const [i, d] of plan.entries()) {
  const { date } = d;
  how[d.how] = (how[d.how] || 0) + 1;
  const prevEntry = prev[i] && prev[i].entry;
  const lockPath = `${ROOT}public/prompts/${date}.lock`;
  if (d.how === 'frozen') {
    days.push(prevEntry);
    if (oldExtremes[date]) extremes.days[date] = oldExtremes[date];
    if (oldMeta[date]) dayMeta[date] = oldMeta[date];
    kept++;
    continue;
  }
  if (d.how === 'repaired' || d.how === 'rebuilt') replaced++;
  const picks = d.picks;
  const rounds = picks.map(roundOf);
  for (const c of picks) checkErrs.push(...checkQuestion(c, FACTS, FI));
  extremes.days[date] = picks.map((c) => checkExtremes(c, date));
  dayMeta[date] = picks.map((c) => [c.type, c.era, c.cat, c.group, c.team ? 1 : 0, c.headline ? 1 : 0]);
  const entry = { date, v: 2, h: picks.map((c) => hashOf(date, c.key)), a: sha(JSON.stringify(rounds)) };
  if (!prevEntry || prevEntry.a !== entry.a || !existsSync(lockPath)) {
    const plain = { v: 2, game: 'deep-cut', date, scoring: cand.prompts[0].scoring, asOf: cand.asOf, rounds };
    writeFileSync(lockPath, JSON.stringify(await lock(plain, pub)) + '\n');
    wrote++;
  }
  days.push(entry);
}
// Locks past the end of the schedule (a shorter schedule than before) go.
const scheduled = new Set(days.map((d) => d.date));
for (const f of readdirSync(ROOT + 'public/prompts')) if (f.endsWith('.lock') && !scheduled.has(f.slice(0, 10)) && f.slice(0, 10) > frozenThrough) unlinkSync(ROOT + 'public/prompts/' + f);

// Practice locks, numbered 1..N in a stable (sorted) order. A lock is
// rewritten only when its content changes (lib/practice.mjs): data/practice.json
// keeps a content hash per lock (a, aligned with keys).
const pk = [...practice].sort();
const bodies = pk.map((k, i) => {
  const c = all.get(k);
  extremes.practice.push(checkExtremes(c, 'practice ' + (i + 1)));
  checkErrs.push(...checkQuestion(c, FACTS, FI));
  return practiceBody(i + 1, c.scoring, roundOf(c));
});
const prevPracticeHashes = existsSync(ROOT + 'data/practice.json') ? rd('data/practice.json').a || [] : [];
const { a: practiceHashes, wrote: practiceWrote } = await writePracticeLocks({ dir: ROOT + 'public/practice', bodies, prevHashes: prevPracticeHashes, asOf: cand.asOf, pub, lock });
writeFileSync(ROOT + 'public/practice/index.json', JSON.stringify({ v: 1, count: pk.length }) + '\n');
writeFileSync(ROOT + 'data/practice.json', JSON.stringify({ _about: 'Practice-only prompt keys (scripts/build.mjs): never scheduled as a Daily. a = sha256 of each practice lock\'s content but asOf (public/practice/<n>.lock is keys[n-1]); a lock is rewritten only when its a changes.', keys: pk, a: practiceHashes }, null, 1) + '\n');

// ---------- one page per day (item 10) ----------
// public/<date>/index.html: the game page with the day's own title,
// description, canonical, og: tags and preview card. Nothing of the puzzle
// (no prompt, no answer) is in it, so a day's page can exist before its day.
// Search is hoopsmatic-worker's job (X-Robots-Tag, deepCutNoindex): the
// template carries no robots meta.
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
// ---------- sitemap state (Jorge, Nov 13, 2026) ----------
// data/sitemap-state.json, committed, and public/sitemap-state.json for the
// worker: per URL (the main page and every day page from #1 on) a sha256 of
// its HTML and the lastmod, which moves only when that hash changes. The
// worker's /deep-cut/sitemap.xml lists the main page and the days already
// over, from the launch moment on.
{
  const prevState = existsSync(ROOT + 'data/sitemap-state.json') ? rd('data/sitemap-state.json').urls : {};
  const urls = {};
  const stamp = (path, file) => {
    const h = sha(readFileSync(file, 'utf8'));
    const old = prevState[path];
    urls[path] = old && old.hash === h ? old : { hash: h, lastmod: today };
  };
  stamp('/deep-cut/', ROOT + 'public/index.html');
  for (const d of days) if (d.date >= LAUNCH) stamp(`/deep-cut/${d.date}/`, `${ROOT}public/${d.date}/index.html`);
  const state = { _about: 'Content hash and lastmod per Deep Cut URL (scripts/build.mjs). A URL\'s lastmod moves only when its hash changes; hoopsmatic-worker builds /deep-cut/sitemap.xml from this.', urls };
  writeFileSync(ROOT + 'data/sitemap-state.json', JSON.stringify(state, null, 1) + '\n');
  writeFileSync(ROOT + 'public/sitemap-state.json', JSON.stringify(state) + '\n');
}
writeFileSync(ROOT + 'data/day-rules.json', JSON.stringify({ _about: 'Per scheduled day, each question\'s [type, era, category, group, mentions a team, headline] (scripts/build.mjs; nothing that names a question). The tests check the day rules against it.', days: dayMeta }) + '\n');
writeFileSync(ROOT + 'data/extremes.json', JSON.stringify({ _about: 'Lowest and highest score of every scheduled and practice question (scripts/build.mjs): always [1, 100].', ...extremes }) + '\n');
writeFileSync(ROOT + 'data/schedule.json', JSON.stringify({
  _about: 'Deep Cut days (scripts/build.mjs). v2 days: h = sha256(date:key) per round, a = sha256(rounds). v1 days (before five rounds): one h. The prompts are only in the encrypted public/prompts/<date>.lock files.',
  v: 2, start: START, days,
}, null, 1) + '\n');
const last = days[days.length - 1].date;
console.log(`start ${START}, today ${today}, frozen through ${frozenThrough}: ${kept} kept, ${wrote} locks written, ${replaced} days with a prompt replaced (${Object.entries(how).map(([k, n]) => `${n} ${k}`).join(', ')}); schedule ends ${last} (${days.length} days); practice pool ${pk.length}, ${practiceWrote} practice locks written`);
