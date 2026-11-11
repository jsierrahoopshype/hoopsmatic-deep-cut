// Deep Cut prompt generator. Run once; the schedule is committed and no daily
// job runs.
//
//   node scripts/pull-data.mjs          (pinned source files -> .cache/sources/)
//   node scripts/generate-prompts.mjs   [--samples 14] [--days 365] [--start 2026-12-01]
//
// Writes
//   .cache/prompts.json          every scheduled day with its full answer list
//                                (answers stay out of git until step 2 locks them)
//   .cache/candidates.json       every prompt that passed the rules, by type
//   docs/step1-samples.md        the sample prompts with full answer lists
//
// Rules for a prompt (Jorge, Nov 11, 2026):
//   - built only from Jorge's data; team names as they were in those seasons
//   - at least 15 valid answers, a mix of stars and deep cuts
// Plus our own: at most 150 answers (a prompt anyone can answer with a
// random name is no game), at least 2 stars and 3 deep cuts, stars at most
// half the list, and the two parts of a prompt must each narrow it.
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildPlayers, unitName, unitInfo, collegeName, seasonLabel } from './lib/players.mjs';
import { instantScore, tierOf } from './lib/score.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = +arg('days', 365);
const SAMPLES = +arg('samples', 14);
const START = arg('start', '2026-12-01');   // placeholder until Jorge picks launch day
const MIN_ANSWERS = 15, MAX_ANSWERS = 150, MIN_STARS = 2, MIN_DEEP = 3;

const { players } = buildPlayers();
const the = (u) => 'the ' + unitName(u);

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
    text: `Name a player who went to college at ${collegeName(c)} and came from a ${d}s draft class (drafted or undrafted).`,
    test: (p) => p.college === c && p.draftYear >= d && p.draftYear <= d + 9 });
  add({ key: `colstar:${c}`, type: 'team-college', units: [],
    text: `Name a player who went to college at ${collegeName(c)} and made at least one All-Star team.`,
    test: (p) => p.college === c && p.allStar.length > 0 });
}

// 3. Team + draft class (a run of draft classes when one year is too thin).
// bio.json DRAFT is the player's draft class, undrafted players included
// (Ben Wallace: 1996), so the prompt says so.
for (const u of UNITS) for (let y = 1950; y <= 2025; y++) {
  add({ key: `draft:${u}:${y}`, type: 'team-draft', units: [u],
    text: `Name a player from the ${y} draft class (drafted or undrafted) who played for ${the(u)}.`,
    test: (p) => p.draftYear === y && p.units.has(u) });
}
for (const u of UNITS) for (let d = 1950; d <= 2020; d += 10) {
  add({ key: `draftdec:${u}:${d}`, type: 'team-draft', units: [u],
    text: `Name a player from a ${d}s draft class (drafted or undrafted) who played for ${the(u)}.`,
    test: (p) => p.draftYear >= d && p.draftYear <= d + 9 && p.units.has(u) });
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

// 5. Country + team (one country, or "born outside the U.S." when no single
// country has 15 for that team)
const countryCount = new Map();
for (const p of players) if (p.country && p.country !== 'United States') countryCount.set(p.country, (countryCount.get(p.country) || 0) + 1);
const COUNTRIES = [...countryCount.keys()].filter((c) => countryCount.get(c) >= 15);
const DEMONYM = { Canada: 'Canadian', France: 'French', Australia: 'Australian', Serbia: 'Serbian', Spain: 'Spanish',
  Germany: 'German', Nigeria: 'Nigerian', Brazil: 'Brazilian', Croatia: 'Croatian', Lithuania: 'Lithuanian',
  Argentina: 'Argentine', Greece: 'Greek', Turkey: 'Turkish', Italy: 'Italian', Senegal: 'Senegalese', Slovenia: 'Slovenian',
  Cameroon: 'Cameroonian', Russia: 'Russian', Latvia: 'Latvian', 'Democratic Republic of the Congo': 'Congolese (DR Congo)',
  'United Kingdom': 'British', Ukraine: 'Ukrainian', China: 'Chinese', Israel: 'Israeli', Montenegro: 'Montenegrin',
  'Bosnia and Herzegovina': 'Bosnian', Japan: 'Japanese', Sudan: 'Sudanese', Georgia: 'Georgian', 'Dominican Republic': 'Dominican',
  'Puerto Rico': 'Puerto Rican', 'New Zealand': 'New Zealander', 'Czech Republic': 'Czech', Mali: 'Malian', Jamaica: 'Jamaican' };
for (const u of UNITS) {
  for (const c of COUNTRIES) if (DEMONYM[c]) add({ key: `country:${u}:${c}`, type: 'country-team', units: [u],
    text: `Name a ${DEMONYM[c]} player who played for ${the(u)}.`,
    test: (p) => p.country === c && p.units.has(u) });
  add({ key: `intl:${u}`, type: 'country-team', units: [u],
    text: `Name a player from outside the United States who played for ${the(u)}.`,
    test: (p) => p.country && p.country !== 'United States' && p.units.has(u) });
}
// Country + college-or-draft would also work; kept to Jorge's list for now.

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
  return { id: p.id, name: p.name, score: instantScore(p), tier: tierOf(p.fame), fame: p.fame, gp: p.gp, min: Math.round(p.min),
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

const days = [];
const recentDays = [];
for (let d = 0; d < DAYS; d++) {
  const date = new Date(Date.parse(START + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
  const recentUnits = new Set(recentDays.slice(-6).flatMap((c) => c.units));
  const recentStars = new Set(recentDays.slice(-30).map((c) => c.star).filter(Boolean));
  let c = null;
  for (let k = 0; k < ROTATION.length && !c; k++) c = pick(ROTATION[(d + k) % ROTATION.length], recentUnits, usedKeys, recentStars);
  if (!c) throw new Error(`ran out of prompts on day ${d + 1}`);
  usedKeys.add(c.key);
  recentDays.push(c);
  days.push({ n: d + 1, date, ...strip(c) });
}

function strip(c) { return { key: c.key, type: c.type, text: c.text, count: c.n, tiers: c.tiers, answers: c.answers }; }

mkdirSync(ROOT + '.cache', { recursive: true });
writeFileSync(ROOT + '.cache/prompts.json', JSON.stringify({ v: 1, start: START, days }, null, 1) + '\n');
writeFileSync(ROOT + '.cache/candidates.json', JSON.stringify(Object.fromEntries(Object.entries(byType).map(([t, l]) => [t, l.map(strip)]))) + '\n');

// ---------- report ----------
const typeCount = {};
for (const d of days) typeCount[d.type] = (typeCount[d.type] || 0) + 1;
console.log('players', players.length, 'candidates', cands.length, 'passed', passed.length);
console.log('by type (checked):', JSON.stringify(reasons, null, 1));
console.log('schedule by type:', typeCount);
const counts = days.map((d) => d.count).sort((a, b) => a - b);
console.log('answers per day: min', counts[0], 'median', counts[counts.length >> 1], 'max', counts[counts.length - 1]);

const md = [];
md.push('# Deep Cut, step 1: sample prompts', '');
md.push(`Built by \`node scripts/generate-prompts.mjs\` from the files pinned in \`data/sources.lock.json\`. These ${samples.length} prompts are taken out of the 365-day schedule, so this page spoils no real day.`, '');
md.push('Score = instant score (0-100, obscurity in the data; formula in `scripts/lib/score.mjs`). Tier: star = fame 25+, known = 8 to 25, deep = under 8 (the NBA Crossword\'s fame formula). Each list is sorted from most to least famous.', '');
samples.forEach((c, i) => {
  const ex = examples(c.answers);
  md.push(`## ${i + 1}. ${c.text}`, '');
  md.push(`Type: ${c.type}. Valid answers: ${c.n} (${c.tiers.star} stars, ${c.tiers.known} known, ${c.tiers.deep} deep cuts).`, '');
  md.push(`Examples: star **${ex.star.name}** ${ex.star.score} · mid **${ex.mid.name}** ${ex.mid.score} · deep cut **${ex.deep.name}** ${ex.deep.score}`, '');
  md.push(c.answers.map((a) => `${a.name} (${a.score})`).join(', '), '');
});
writeFileSync(ROOT + 'docs/step1-samples.md', md.join('\n'));

// Star: the lowest-scoring (most famous) answer. Mid: the known-tier answer
// in the middle (else the median). Deep cut: the highest-scoring answer.
function examples(ans) {
  const star = ans[0];
  const known = ans.filter((a) => a.tier === 'known');
  const mid = known.length ? known[known.length >> 1] : ans[ans.length >> 1];
  const deep = ans[ans.length - 1];
  return { star, mid, deep };
}
