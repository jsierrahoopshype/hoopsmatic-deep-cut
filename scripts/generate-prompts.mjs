// Deep Cut prompt generator. Run once; the schedule is committed and no daily
// job runs.
//
//   node scripts/pull-data.mjs          (pinned source files -> .cache/sources/)
//   node scripts/generate-prompts.mjs   [--samples 14]
//   node scripts/build.mjs              (the schedule and the day locks)
//
// Writes
//   .cache/candidates.json       every prompt that passed the rules, by type
//   docs/step1-samples.md        the sample prompts with full answer lists
//   data/excluded.json           their keys, never scheduled
//   public/players.json          the suggestion list
//
// Rules for a prompt (Jorge, Nov 11, 2026):
//   - built only from Jorge's data; team names as they were in those seasons
//   - at least 15 valid answers, a mix of stars and deep cuts
// Plus our own: at most 150 answers (a prompt anyone can answer with a
// random name is no game), at least 2 stars and 3 deep cuts, stars at most
// half the list, and the two parts of a prompt must each narrow it.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { buildPlayers, unitName, unitInfo, collegeName, seasonLabel } from './lib/players.mjs';
import { instantScore, tierOf } from './lib/score.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SAMPLES = +arg('samples', 14);
const MIN_ANSWERS = 15, MAX_ANSWERS = 150, MIN_STARS = 2, MIN_DEEP = 3;

const { players } = buildPlayers();
const the = (u) => 'the ' + unitName(u);
// Decade of the first NBA season, by its starting year (1979-80 -> 1970).
const startDecade = (p) => Math.floor((p.firstYear - 1) / 10) * 10;

// ---------- candidate prompts ----------
// Each: { key, type, text, units:[...], test(p) -> bool }
const cands = [];
const add = (c) => cands.push(c);

const unitCount = new Map();
for (const p of players) for (const u of p.units) unitCount.set(u, (unitCount.get(u) || 0) + 1);
const UNITS = [...unitCount.keys()].filter((u) => unitCount.get(u) >= 40);
const sameFranchise = (a, b) => unitInfo(a).code === unitInfo(b).code;

// 1. Two teams
for (let i = 0; i < UNITS.length; i++) for (let j = i + 1; j < UNITS.length; j++) {
  const [a, b] = [UNITS[i], UNITS[j]].sort((x, y) => unitName(x).localeCompare(unitName(y)));
  if (sameFranchise(a, b)) continue;
  add({ key: `teams:${a}:${b}`, type: 'two-teams', units: [a, b],
    text: `Name a player who played for ${the(a)} and ${the(b)}.`,
    test: (p) => p.units.has(a) && p.units.has(b) });
}

// 2. Team + college
const collegeCount = new Map();
for (const p of players) if (p.college) collegeCount.set(p.college, (collegeCount.get(p.college) || 0) + 1);
const COLLEGES = [...collegeCount.keys()].filter((c) => collegeCount.get(c) >= 15);
for (const u of UNITS) for (const c of COLLEGES) add({ key: `college:${u}:${c}`, type: 'team-college', units: [u],
  text: `Name a player who played for ${the(u)} and went to college at ${collegeName(c)}.`,
  test: (p) => p.units.has(u) && p.college === c });

// College + draft decade and college + All-Star: a single team + college
// rarely reaches 15 answers, so these carry the college days.
for (const c of COLLEGES) {
  for (let d = 1950; d <= 2020; d += 10) add({ key: `coldec:${c}:${d}`, type: 'team-college', units: [],
    text: `Name a player who went to college at ${collegeName(c)} and started his NBA career in the ${d}s.`,
    test: (p) => p.college === c && startDecade(p) === d });
  add({ key: `colstar:${c}`, type: 'team-college', units: [],
    text: `Name a player who went to college at ${collegeName(c)} and made at least one All-Star team.`,
    test: (p) => p.college === c && p.allStar.length > 0 });
}

// 3. Team + decade the player's NBA career started (first NBA season, by the
// year it began: 1979-80 is the 1970s). Replaces draft class (Jorge, Nov 11).
for (const u of UNITS) for (let d = 1940; d <= 2020; d += 10) {
  add({ key: `start:${u}:${d}`, type: 'team-draft', units: [u],
    text: `Name a player who started his NBA career in the ${d}s and played for ${the(u)}.`,
    test: (p) => startDecade(p) === d && p.units.has(u) });
}
// Lottery-era top-10 picks with a team
for (const u of UNITS) add({ key: `top10:${u}`, type: 'team-draft', units: [u],
  text: `Name a player who was a top-10 draft pick (1990 draft or later) and played for ${the(u)}.`,
  test: (p) => p.draftYear >= 1990 && p.pick && p.pick <= 10 && p.units.has(u) });

// 4. Award + team
const AWARDS = [
  ['allStar', (u) => `Name a player who made an All-Star team as a member of ${the(u)}.`],
  ['allRookie', (u) => `Name a player who made an All-Rookie team as a member of ${the(u)}.`],
  ['allDefense', (u) => `Name a player who made an All-Defensive team as a member of ${the(u)}.`],
  ['allNba', (u) => `Name a player who made an All-NBA team as a member of ${the(u)}.`],
  ['rings', (u) => `Name a player who won an NBA title with ${the(u)}.`],
];
for (const u of UNITS) for (const [k, t] of AWARDS) add({ key: `award:${k}:${u}`, type: 'award-team', award: k, units: [u],
  text: t(u),
  test: (p) => p[k].some((a) => (a.units ? a.units.includes(u) : a.unit === u)) });

// 5. Birth country + team: born in one country, or born outside the United
// States. Birthplace only (Born & Died), never nationality or national team.
const countryCount = new Map();
for (const p of players) if (p.bornIn && p.bornIn !== 'United States') countryCount.set(p.bornIn, (countryCount.get(p.bornIn) || 0) + 1);
const COUNTRIES = [...countryCount.keys()].filter((c) => countryCount.get(c) >= 15);
for (const u of UNITS) {
  for (const c of COUNTRIES) add({ key: `born:${u}:${c}`, type: 'country-team', units: [u],
    text: `Name a player born in ${c} who played for ${the(u)}.`,
    test: (p) => p.bornIn === c && p.units.has(u) });
  add({ key: `bornout:${u}`, type: 'country-team', units: [u],
    text: `Name a player born outside the United States who played for ${the(u)}.`,
    test: (p) => p.bornIn && p.bornIn !== 'United States' && p.units.has(u) });
}

// 6. Teammate of a star (same team, same season)
const stars = players.filter((p) => p.fame >= 60);
const teamSeasons = new Map();   // "unit|year" -> Set(player)
for (const p of players) for (const s of p.seasons) {
  const k = s.unit + '|' + s.y;
  if (!teamSeasons.has(k)) teamSeasons.set(k, new Set());
  teamSeasons.get(k).add(p);
}
for (const st of stars) for (const u of new Set(st.seasons.map((s) => s.unit))) {
  const yrs = st.seasons.filter((s) => s.unit === u).map((s) => s.y);
  const mates = new Set();
  for (const y of yrs) for (const q of teamSeasons.get(u + '|' + y)) if (q !== st) mates.add(q);
  add({ key: `mate:${st.id}:${u}`, type: 'teammate', units: [u], star: st.id,
    text: `Name a player who was a teammate of ${st.name} on ${the(u)}.`,
    test: (p) => mates.has(p) });
}

// ---------- check every candidate ----------
const passed = [];
const reasons = {};
for (const c of cands) {
  const ans = players.filter(c.test);
  const n = ans.length;
  const tiers = { star: 0, known: 0, deep: 0 };
  for (const p of ans) tiers[tierOf(p.fame)]++;
  let why = null;
  if (n < MIN_ANSWERS) why = 'under 15';
  else if (n > MAX_ANSWERS) why = 'over 150';
  else if (tiers.star < MIN_STARS) why = 'too few stars';
  else if (tiers.deep < MIN_DEEP) why = 'too few deep cuts';
  else if (tiers.star > n / 2) why = 'too many stars';
  reasons[c.type] ??= {}; reasons[c.type][why || 'ok'] = (reasons[c.type][why || 'ok'] || 0) + 1;
  if (why) continue;
  passed.push({ ...c, n, tiers, answers: ans.map(answerOf).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)) });
}

function answerOf(p) {
  return { id: p.id, name: p.name.replace(/ \(\d{4}\)$/, ''), score: instantScore(p), tier: tierOf(p.fame), fame: p.fame, gp: p.gp, min: Math.round(p.min),
    years: `${seasonLabel(p.firstYear)} to ${seasonLabel(p.lastYear)}`, link: p.link };
}

// ---------- seeded schedule ----------
// Mulberry32 with a fixed seed: the same data gives the same schedule.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20261111);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const byType = {};
for (const c of passed) (byType[c.type] ??= []).push(c);
for (const t in byType) shuffle(byType[t]);
// A week's rotation; teammate and two-teams days are the most fun, so twice.
const ROTATION = ['two-teams', 'award-team', 'team-college', 'teammate', 'country-team', 'two-teams', 'team-draft'];

function pick(type, recentUnits, usedKeys, recentStars) {
  const list = byType[type] || [];
  // Prefer prompts that reuse no team from the last 6 days; fall back to any.
  for (const strict of [true, false]) for (const c of list) {
    if (usedKeys.has(c.key)) continue;
    if (strict && c.units.some((u) => recentUnits.has(u))) continue;
    if (c.star && recentStars.has(c.star)) continue;
    // keep the award days varied
    return c;
  }
  return null;
}

// Samples first, taken out of the schedule so the report spoils no real day.
const usedKeys = new Set();
const samples = [];
{
  const want = ['two-teams', 'two-teams', 'two-teams', 'team-college', 'team-college', 'team-draft', 'team-draft',
    'award-team', 'award-team', 'country-team', 'country-team', 'teammate', 'teammate', 'award-team'].slice(0, SAMPLES);
  const recent = new Set(), rs = new Set();
  for (const t of want) {
    const c = pick(t, recent, usedKeys, rs) || pick(t, new Set(), usedKeys, new Set());
    if (!c) continue;
    usedKeys.add(c.key); c.units.forEach((u) => recent.add(u)); if (c.star) rs.add(c.star);
    samples.push(c);
  }
}

function strip(c) { return { key: c.key, type: c.type, text: c.text, units: c.units, star: c.star || null, count: c.n, tiers: c.tiers, answers: c.answers }; }

mkdirSync(ROOT + '.cache', { recursive: true });
// The sample prompts are public (docs/step1-samples.md), so the schedule
// never uses them (scripts/build.mjs reads this).
// --keep-samples (the weekly refresh): the published samples and their
// excluded keys stay as they are.
const KEEP = process.argv.includes('--keep-samples');
if (!KEEP) writeFileSync(ROOT + 'data/excluded.json', JSON.stringify({ _about: 'Prompt keys shown in docs/step1-samples.md; never scheduled.', keys: samples.map((c) => c.key) }, null, 1) + '\n');
// The suggestion list (public): every player, id, name without the data's
// birth-year tag, career years, that tag (shown only in the list, 0 if none)
// and the nicknames the box also matches (data/nicknames.json, Jorge, Nov 12).
// First-name short forms (Mo for Maurice) are added in the page (app.js).
const nickOf = nicknamesByPlayer(players);
const plist = players.map((p) => {
  const m = p.name.match(/^(.*) \((\d{4})\)$/);
  const row = [p.id, m ? m[1] : p.name, `${p.firstYear - 1}-${String(p.lastYear).slice(2)}`, m ? +m[2] : 0];
  if (nickOf.has(p.id)) row.push(nickOf.get(p.id));
  return row;
}).sort((a, b) => a[1].localeCompare(b[1]));
console.log('nicknames matched to players:', [...nickOf.values()].reduce((s, x) => s + x.length, 0), 'on', nickOf.size, 'players');

// Wikipedia names players its own way ("Earvin Johnson" is the data's Magic
// Johnson). Each Wikipedia player is matched once, to:
//   1. a data player stored under one of his nicknames plus his last name
//      ("Hot Rod Williams", "Magic Johnson"), the most famous if several
//      (Magic's "Buck" also spells Buck Johnson, a different player); else
//   2. the one data player with exactly his Wikipedia name; else nobody.
// Rule 1 comes first because an exact name can be someone else (Wikipedia's
// John Williams is Hot Rod Williams, not the data's other John Williams).
// Lowercase fragments ("pretty") are skipped, and so is a nickname that is
// the data name or its first word. Wikipedia's spelling of the name becomes
// a key too when it differs (Earvin Johnson).
function nicknamesByPlayer(list) {
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const clean = (n) => norm(n.replace(/ \(\d{4}\)$/, ''));
  const byName = new Map();
  for (const p of list) { const k = clean(p.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p); }
  const people = new Map();   // Wikipedia name -> its nicknames
  for (const { player, nickname } of JSON.parse(readFileSync(ROOT + 'data/nicknames.json', 'utf8')).nicknames) {
    if (!/^[A-Z0-9"']/.test(nickname)) continue;
    if (!people.has(player)) people.set(player, []);
    people.get(player).push(nickname);
  }
  const out = new Map();
  for (const [player, nicks] of people) {
    const w = norm(player), last = w.split(' ').pop();
    const stored = [...new Set(nicks.flatMap((n) => byName.get(norm(n) + ' ' + last) || []))].sort((a, b) => b.fame - a.fame);
    const exact = byName.get(w) || [];
    const p = stored[0] || (exact.length === 1 ? exact[0] : null);
    if (!p) continue;
    const name = clean(p.name), first = name.split(' ')[0];
    const keys = [];
    for (const k of [...nicks, player]) {
      const nk = norm(k);
      if (!nk || nk === name || nk === first || keys.some((x) => norm(x) === nk)) continue;
      keys.push(k);
    }
    if (keys.length) out.set(p.id, keys);
  }
  return out;
}
mkdirSync(ROOT + 'public', { recursive: true });
writeFileSync(ROOT + 'public/players.json', JSON.stringify({ v: 1, players: plist }));
writeFileSync(ROOT + '.cache/candidates.json', JSON.stringify(Object.fromEntries(Object.entries(byType).map(([t, l]) => [t, l.map(strip)]))) + '\n');

// ---------- report ----------
console.log('players', players.length, 'candidates', cands.length, 'passed', passed.length);
console.log('by type (checked):', JSON.stringify(reasons, null, 1));

const md = [];
md.push('# Deep Cut, step 1: sample prompts', '');
md.push(`Built by \`node scripts/generate-prompts.mjs\` from the files pinned in \`data/sources.lock.json\`. These ${samples.length} prompts are never scheduled (data/excluded.json), so this page spoils no real day.`, '');
md.push('Score = instant score (0-100, obscurity in the data; formula in `scripts/lib/score.mjs`). Tier: star = fame 25+, known = 8 to 25, deep = under 8 (the NBA Crossword\'s fame formula). Each list is sorted from most to least famous.', '');
samples.forEach((c, i) => {
  const ex = examples(c.answers);
  md.push(`## ${i + 1}. ${c.text}`, '');
  md.push(`Type: ${c.type}. Valid answers: ${c.n} (${c.tiers.star} stars, ${c.tiers.known} known, ${c.tiers.deep} deep cuts).`, '');
  md.push(`Examples: star **${ex.star.name}** ${ex.star.score} · mid **${ex.mid.name}** ${ex.mid.score} · deep cut **${ex.deep.name}** ${ex.deep.score}`, '');
  md.push(c.answers.map((a) => `${a.name} (${a.score})`).join(', '), '');
});
if (!KEEP) writeFileSync(ROOT + 'docs/step1-samples.md', md.join('\n'));

// Star: the lowest-scoring (most famous) answer. Mid: the known-tier answer
// in the middle (else the median). Deep cut: the highest-scoring answer.
function examples(ans) {
  const star = ans[0];
  const known = ans.filter((a) => a.tier === 'known');
  const mid = known.length ? known[known.length >> 1] : ans[ans.length >> 1];
  const deep = ans[ans.length - 1];
  return { star, mid, deep };
}
