// Deep Cut prompt generator (scoring v2, Jorge, Nov 12, 2026).
//
//   node scripts/pull-data.mjs          pinned source files -> .cache/sources/
//   node scripts/generate-prompts.mjs   every prompt that passes the rules
//   node scripts/build.mjs              the schedule, day locks, practice pool
//
// Writes
//   data/facts.json          the player facts the Deep Cut server checks picks
//                            against (scripts/lib/cond.mjs). Public data only.
//   .cache/candidates.json   every prompt that passed, with its scored answers
//   public/players.json      the suggestion list (every player, never which
//                            ones qualify)
//
// A prompt is a condition (scripts/lib/cond.mjs). It passes when it has 15
// to 150 valid answers and a useful spread of scores: the raw obscurity of
// its answers (score2.mjs) spans at least MIN_SPREAD, so a deep pick really
// beats an obvious one. Scores: score2.mjs (fixed, 1-100, ties equal).
// Team names are as they were in those seasons (players.mjs units).
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildPlayers, unitName, collegeName, allUnits } from './lib/players.mjs';
import { evaluate, index, ruleText, seasonLabel, SOLO_NAMES } from './lib/cond.mjs';
import { rawScore, normalize, VERSION } from './lib/score2.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (id) => JSON.parse(readFileSync(`${ROOT}.cache/sources/${id}.json`, 'utf8'));
const MIN_ANSWERS = 15, MAX_ANSWERS = 150, MIN_SPREAD = 0.3;

const { players } = buildPlayers();

// ---------- facts ----------
const units = allUnits();
const uIndex = new Map(units.map((u, i) => [u.id, i]));
const factsUnits = units.map((u) => {
  const name = unitName(u.id);
  const nick = u.name.split(' ').pop() === 'Blazers' ? 'Trail Blazers' : u.name.split(' ').slice(-1)[0];
  // Short name for badges and evidence: the nickname ("SuperSonics"); the
  // full name with years only where two eras share the full name (the
  // Charlotte Hornets). The rule beside the prompt names the exact era.
  return { id: u.id, name, short: name !== u.name ? name : (u.name.endsWith('Trail Blazers') ? 'Trail Blazers' : nick),
    code: u.code, from: u.from, to: u.to };
});
const teamSlug = new Map(src('teams').map((t) => [t.abbrev, t.slug]));
// Team logo paths under nba-headshots' teams/logos/: today's logo for a
// current era, the era's own logo where Jorge's set has one, else none (the
// page shows a text badge, never a later era's logo).
const HISTORICAL_LOGOS = {
  'Seattle SuperSonics': 'seattle-supersonics', 'New Jersey Nets': 'new-jersey-nets', 'Vancouver Grizzlies': 'vancouver-grizzlies',
  'Washington Bullets': 'washington-bullets', 'San Diego Clippers': 'san-diego-clippers', 'Charlotte Bobcats': 'charlotte-bobcats',
  'New Orleans Hornets': 'new-orleans-hornets', 'Charlotte Hornets (1988-2002)': 'charlotte-hornets-original',
};
function logoOf(u) {
  if (u.to === null) { const slug = teamSlug.get(u.code); return slug ? 'current/svg/' + slug : null; }
  return HISTORICAL_LOGOS[u.name] ? 'historical/' + HISTORICAL_LOGOS[u.name] : null;
}
const asOf = new Date().toISOString().slice(0, 10);
const facts = {
  _about: 'Deep Cut player facts (scripts/generate-prompts.mjs), from the pinned sources in data/sources.lock.json. The Deep Cut server checks picks against these with scripts/lib/cond.mjs.',
  v: 1, asOf, units: factsUnits,
  players: players.map((p) => {
    const u = (id) => uIndex.get(id);
    const a = {};
    for (const k of ['allStar', 'allRookie', 'allDefense', 'allNba']) if (p[k].length) a[k] = p[k].filter((x) => x.units[0]).map((x) => [x.y, u(x.units[0])]);
    return { i: p.id, n: p.name.replace(/ \(\d{4}\)$/, ''), c: p.college || null, cn: p.college ? collegeName(p.college) : null,
      b: p.bornIn || null, bp: p.birthplace || null, f: p.firstYear, l: p.lastYear, d: p.draftYear || null, k: p.pick || null, g: p.gp,
      s: p.seasons.map((s) => [s.y, u(s.unit), s.gp, s.pts, s.reb, s.ast, s.stl, s.blk, s.tpm]), r: p.rings.map((r) => [r.y, u(r.unit)]), a,
      // MVPs, Finals MVPs, Hall of Fame (for the one-line reason after a pick)
      h: [p.aw['Most Valuable Player'] || 0, p.aw['Finals MVP'] || 0, p.aw['Hall of Fame'] ? 1 : 0],
      // salaries in $ millions by season; single-winner awards by season;
      // Player of the Week [season, unit#]; clubs outside the NBA
      $: Object.entries(p.salary).map(([y, v]) => [+y, Math.floor(v / 1e5) / 10]),
      w: p.solo, pw: p.potw.map((x) => [x.y, u(x.unit)]), x: p.clubs,
      // listed height; draft combine; award votes; medals; highest-paid seasons;
      // career earnings ($M); single-game highs per team-season
      ht: p.ht, cb: p.combine, vt: p.votes.map((v) => [v.y, v.award, v.rank, v.unit ? u(v.unit) : -1]), md: p.medals,
      pt: p.payTop.map((x) => [x.y, u(x.unit)]), ce: Math.floor(p.earnings / 1e5) / 10,
      gh: p.highs.map((x) => [x.y, u(x.unit), x.h[0], x.h[1], x.h[2], x.h[3], x.h[4]]) };
  }),
};
mkdirSync(ROOT + 'data', { recursive: true });
writeFileSync(ROOT + 'data/facts.json', JSON.stringify(facts));
const F = index(facts);
const fameOf = new Map(players.map((p) => [p.id, p.fame]));

// ---------- candidates ----------
// Every question reads plainly, and every player who fits the plain wording
// counts, whatever the season (Jorge, Nov 13, 2026: no era clauses and no
// hidden conditions). Which questions get scheduled leans recent: see era
// below and scripts/build.mjs.
//
// group (for the day's mix): A two teams, B teammate, F one team's roster in
// one season, C accolades, D origin and other team facts, E records and game
// stats, G money, P physical and draft, H clubs outside the NBA.
// category (one of each a day): money, accolade, record, physical, origin.
const cands = [];
const the = (u) => 'the ' + factsUnits[u].name;
const add = (key, group, type, cond, text, extra = {}) => cands.push({ key, group, type, cond, text, ...extra });
const unitCount = new Map();
for (const p of facts.players) for (const u of new Set(p.s.map((s) => s[1]))) unitCount.set(u, (unitCount.get(u) || 0) + 1);
const U = [...unitCount.keys()].filter((u) => unitCount.get(u) >= 40);
// Units every one of whose players has a draft pick on record if drafted
// (Salary Season Finder picks start with 1990-91 players): teams born in
// 1990-91 or later.
const U_PICKS = U.filter((u) => factsUnits[u].from >= 1991);
// Box-score coverage: a unit gets game questions only if every player-season
// it has through 2025-26 is in the box-score archive (rebounds and
// triple-doubles also need 1950-51 on).
const gap = new Set();
for (const p of facts.players) for (const s of p.s) if (s[0] <= 2026 && !p.gh.some((g) => g[0] === s[0] && g[1] === s[1])) gap.add(s[1]);
const U_GAMES = U.filter((u) => !gap.has(u));

for (let i = 0; i < U.length; i++) for (let j = i + 1; j < U.length; j++) {
  const [a, b] = [U[i], U[j]].sort((x, y) => factsUnits[x].name.localeCompare(factsUnits[y].name));
  if (factsUnits[a].code === factsUnits[b].code) continue;
  add(`teams:${factsUnits[a].id}:${factsUnits[b].id}`, 'A', 'two-teams', { t: 'teams', u: [a, b] }, `Name a player who played for ${the(a)} and ${the(b)}.`);
}
const stars = facts.players.filter((p) => (fameOf.get(p.i) || 0) >= 30);
for (const st of stars) for (const u of new Set(st.s.map((s) => s[1]))) {
  if (!U.includes(u)) continue;
  add(`mate:${st.i}:${factsUnits[u].id}`, 'B', 'teammate', { t: 'mate', p: st.i, u }, `Name a player who was a teammate of ${st.n} on ${the(u)}.`, { star: st.i });
}
const seasonsOf = new Map();
for (const p of facts.players) for (const s of p.s) { const k = s[1] + '|' + s[0]; seasonsOf.set(k, (seasonsOf.get(k) || 0) + 1); }
for (const [k, n] of seasonsOf) {
  if (n < 15) continue;
  const [u, y] = k.split('|').map(Number);
  add(`roster:${factsUnits[u].id}:${y}`, 'F', 'roster', { t: 'roster', u, y }, `Name a player who played for the ${seasonLabel(y)} ${factsUnits[u].name.replace(/ \(\d{4}-(\d{4}|present)\)$/, '')}.`);
}
const count = (f) => { const m = new Map(); for (const p of facts.players) { const k = f(p); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
const born = count((p) => (p.b && p.b !== 'United States' ? p.b : null));
const colleges = count((p) => p.c);
const COLS = [...colleges.keys()].filter((c) => colleges.get(c) >= 15);
const CITY_NAME = { 'Washington, D.C.': 'Washington, D.C.', 'Brooklyn, New York': 'Brooklyn', 'The Bronx, New York': 'the Bronx', 'Queens, New York': 'Queens' };
const STATE_NAME = { Washington: 'Washington State', 'New York': 'New York State' };
const cityStates = new Map();
for (const p of facts.players) if (p.bp && p.bp.includes(', ')) { const [ci, ...rest] = p.bp.split(', '); (cityStates.get(ci) || cityStates.set(ci, new Set()).get(ci)).add(rest.join(', ')); }
const cities = [...count((p) => (p.bp && p.bp.includes(', ') ? p.bp : null))].filter(([, n]) => n >= 20)
  .map(([pl]) => [pl, CITY_NAME[pl] || (cityStates.get(pl.split(', ')[0]).size > 1 ? pl : pl.split(', ')[0])]);
const states = [...count((p) => (p.bp && p.b === 'United States' && p.bp.includes(', ') ? p.bp.split(', ').pop() : null))]
  .filter(([st, n]) => n >= 40 && st !== 'Georgia' && st !== 'D.C.').map(([st]) => [st, STATE_NAME[st] || st]);
for (const [pl, pn] of cities) add(`bornin:${pl}`, 'D', 'birth-city', { t: 'bornin', pl, pn }, `Name an NBA player born in ${pn}.`);
const abroadC = count((p) => { const x = (p.x || []).find((x) => x[0] === 'O' && x[3] <= p.f - 1); return x ? x[4] : null; });
for (const [c, n] of abroadC) if (n >= 15) add(`abroad:${c}`, 'H', 'abroad', { t: 'abroad', c }, `Name a player who played for a pro club in ${c} before his NBA debut.`);
add('combine:vert40', 'P', 'combine', { t: 'combine', k: 'vert', v: 40 }, 'Name an NBA player who had a max vertical of 40 inches or more at the draft combine.');
add('combine:hgt84', 'P', 'combine', { t: 'combine', k: 'hgt', v: 84 }, 'Name an NBA player who measured 7 feet or taller without shoes at the draft combine.');
add('combine:ws88', 'P', 'combine', { t: 'combine', k: 'ws', v: 88 }, 'Name an NBA player who measured a wingspan of 7-4 or longer at the draft combine.');

for (const u of U) {
  const T = factsUnits[u].id;
  // accolades
  add(`award:rings:${T}`, 'C', 'title', { t: 'ring', u }, `Name a player who won an NBA title with ${the(u)}.`);
  for (const [k, w] of [['allStar', 'an All-Star team'], ['allRookie', 'an All-Rookie team'], ['allDefense', 'an All-Defensive team'], ['allNba', 'an All-NBA team']])
    add(`award:${k}:${T}`, 'C', 'award', { t: 'award', a: k, u }, `Name a player who made ${w} as a member of ${the(u)}.`);
  add(`ringany:${T}`, 'C', 'title', { t: 'ringany', u }, `Name a player who won an NBA title at some point and played for ${the(u)}.`);
  add(`votes:ROY:${T}`, 'C', 'award-votes', { t: 'votes', a: 'ROY', u }, `Name a player who received Rookie of the Year votes as a member of ${the(u)}.`);
  for (const [k, w] of [['allStar', 'an All-Star team'], ['allNba', 'an All-NBA team'], ['allDefense', 'an All-Defensive team'], ['allRookie', 'an All-Rookie team']])
    add(`allany:${k}:${T}`, 'C', 'all-team', { t: 'allany', a: k, u }, `Name a player who made ${w} at some point and played for ${the(u)}.`);
  for (const [a, w] of [['MVP', 'MVP votes'], ['DPOY', 'Defensive Player of the Year votes'], ['Sixth Man', 'Sixth Man of the Year votes'], ['MIP', 'Most Improved Player votes']])
    add(`votes:${a}:${T}`, 'C', 'award-votes', { t: 'votes', a, u }, `Name a player who received ${w} as a member of ${the(u)}.`);
  add(`votes:ROY5:${T}`, 'C', 'award-votes', { t: 'votes', a: 'ROY', top: 5, u }, `Name a player who finished top 5 in Rookie of the Year voting as a member of ${the(u)}.`);
  add(`medal:${T}`, 'C', 'medal', { t: 'medal', u }, `Name a player who won an Olympic or World Cup medal and played for ${the(u)}.`);
  // origin
  add(`bornout:${T}`, 'D', 'birthplace', { t: 'bornout', u }, `Name a player born outside the United States who played for ${the(u)}.`);
  for (const [c, n] of born) if (n >= 15) add(`born:${T}:${c}`, 'D', 'birthplace', { t: 'born', c, u }, `Name a player born in ${c} who played for ${the(u)}.`);
  for (const [st, pn] of states) add(`bornin:${T}:${st}`, 'D', 'birth-city', { t: 'bornin', pl: st, pn, u }, `Name a player born in ${pn} who played for ${the(u)}.`);
  for (const [pl, pn] of cities) add(`bornin:${T}:${pl}`, 'D', 'birth-city', { t: 'bornin', pl, pn, u }, `Name a player born in ${pn} who played for ${the(u)}.`);
  for (const c of COLS) add(`college:${T}:${c}`, 'D', 'college', { t: 'college', c, cn: collegeName(c), u }, `Name a player who played for ${the(u)} and went to college at ${collegeName(c)}.`);
  add(`abroad:any:${T}`, 'H', 'abroad', { t: 'abroad', u }, `Name a player who played for a pro club outside the U.S. before his NBA debut and then for ${the(u)}.`);
  add(`gleague:${T}`, 'H', 'g-league', { t: 'gleague', u }, `Name a player who played in the G League (or D-League) and for ${the(u)}.`);
  for (let d = 1950; d <= 2020; d += 10) add(`start:${T}:${d}`, 'D', 'career-start', { t: 'start', d, u }, `Name a player who started his NBA career in the ${d}s and played for ${the(u)}.`);
  // records and game stats
  for (const [k, v, w] of [['ppg', 25, 'points'], ['ppg', 20, 'points'], ['ppg', 15, 'points'], ['rpg', 12, 'rebounds'], ['rpg', 10, 'rebounds'], ['rpg', 8, 'rebounds'],
    ['apg', 9, 'assists'], ['apg', 7, 'assists'], ['apg', 5, 'assists'], ['spg', 1.5, 'steals'], ['spg', 2, 'steals'], ['bpg', 1.5, 'blocks'], ['bpg', 2, 'blocks'], ['tpg', 2, 'three-pointers'], ['tpg', 3, 'three-pointers']])
    add(`stat:${k}${v}:${T}`, 'E', 'stat', { t: 'stat', k, v, u }, `Name a player who averaged ${v}+ ${w} a game in a season for ${the(u)}.`);
  for (const v of [10000, 15000, 20000]) add(`points:${v}:${T}`, 'E', 'points', { t: 'points', v, u }, `Name a player who scored ${v.toLocaleString('en-US')}+ career points and played for ${the(u)}.`);
  if (U_GAMES.includes(u)) {
    const early = factsUnits[u].from < 1951;
    for (const [k, v, txt] of [['pts', 40, 'scored 40+ points in a game'], ['pts', 50, 'scored 50+ points in a game'], ['pts', 30, 'scored 30+ points in a game'],
      ['reb', 20, 'had a 20-rebound game'], ['ast', 15, 'had a 15-assist game'], ['tpm', 8, 'made 8+ threes in a game'], ['td', 1, 'had a triple-double']]) {
      if (early && (k === 'reb' || k === 'td')) continue;
      add(`game:${k}${v}:${T}`, 'E', 'game-high', { t: 'game', k, v, u }, `Name a player who ${txt} for ${the(u)}.`);
    }
  }
  // money
  for (const v of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]) add(`salary:${v}:${T}`, 'G', 'salary', { t: 'salary', v, u }, `Name a player who earned $${v}M+ in a season with ${the(u)}.`);
  for (const v of [50, 75, 100, 150, 200]) add(`earn:${v}:${T}`, 'G', 'earnings', { t: 'earn', v, u }, `Name a player who earned $${v}M+ in his career and played for ${the(u)}.`);
  // physical and draft
  for (const [k, op, v, txt] of [['ge84', 'ge', 84, 'listed at 7-0 or taller'], ['ge83', 'ge', 83, 'listed at 6-11 or taller'], ['le73', 'le', 73, 'listed at 6-1 or shorter'], ['le74', 'le', 74, 'listed at 6-2 or shorter']])
    add(`height:${k}:${T}`, 'P', 'height', { t: 'height', [op]: v, u }, `Name a player ${txt} who played for ${the(u)}.`);
  add(`combine:ws84:${T}`, 'P', 'combine', { t: 'combine', k: 'ws', v: 84, u }, `Name a player who measured a wingspan of 7-0 or longer at the draft combine and played for ${the(u)}.`);
  add(`combine:vert36:${T}`, 'P', 'combine', { t: 'combine', k: 'vert', v: 36, u }, `Name a player who had a max vertical of 36 inches or more at the draft combine and played for ${the(u)}.`);
  if (U_PICKS.includes(u)) {
    add(`pick:1-10:${T}`, 'P', 'draft', { t: 'pick', lo: 1, hi: 10, u }, `Name a player who was a top-10 draft pick and played for ${the(u)}.`);
    add(`pick:1-5:${T}`, 'P', 'draft', { t: 'pick', lo: 1, hi: 5, u }, `Name a player who was a top-5 draft pick and played for ${the(u)}.`);
    add(`pick:31-60:${T}`, 'P', 'draft', { t: 'pick', lo: 31, hi: 60, u }, `Name a player who was drafted 31st or later and played for ${the(u)}.`);
    add(`paytop:${T}`, 'G', 'pay-top', { t: 'paytop', u }, `Name a player who was the highest-paid player on ${the(u)} in a season.`);
  }
}
for (const c of COLS) {
  for (let d = 1950; d <= 2020; d += 10) add(`colstart:${c}:${d}`, 'D', 'college', { t: 'colstart', c, cn: collegeName(c), d }, `Name a player who went to college at ${collegeName(c)} and started his NBA career in the ${d}s.`);
  add(`colstar:${c}`, 'D', 'college', { t: 'colstar', c, cn: collegeName(c) }, `Name a player who went to college at ${collegeName(c)} and made at least one All-Star team.`);
}
const CATEGORY = { salary: 'money', earnings: 'money', 'pay-top': 'money', title: 'accolade', award: 'accolade', 'all-team': 'accolade', 'award-votes': 'accolade', medal: 'accolade',
  stat: 'record', points: 'record', 'game-high': 'record', height: 'physical', combine: 'physical', draft: 'physical',
  birthplace: 'origin', 'birth-city': 'origin', college: 'origin', abroad: 'origin' };
for (const c of cands) c.cat = CATEGORY[c.type] || null;

// ---------- era: how recent a question's answers are ----------
// Only for picking questions (scripts/build.mjs), never a condition. A
// player's year is the middle of his career. modern: half or more of the
// answers from 2010-11 on; 80s: half or more from 1980-81 to 1989-90; old:
// more than a quarter before 1980-81 (never scheduled); else open. Roster
// questions go by their season.
const midOf = new Map(facts.players.map((p) => [p.i, (p.f + p.l) / 2]));
function eraOf(c, ans) {
  if (c.cond.t === 'roster') return c.cond.y >= 2011 ? 'modern' : c.cond.y < 1981 ? 'old' : c.cond.y <= 1990 ? '80s' : 'open';
  const m = ans.map((a) => midOf.get(a.i));
  const share = (f) => m.filter(f).length / m.length;
  if (share((y) => y < 1981) > 0.25) return 'old';
  if (share((y) => y >= 2011) >= 0.5) return 'modern';
  if (share((y) => y >= 1981 && y < 1991) >= 0.5) return '80s';
  return 'open';
}

// ---------- check and score every candidate ----------
const passed = [];
const why = {};
for (const c of cands) {
  const ans = [];
  for (const p of facts.players) {
    const r = evaluate(c.cond, p, F);
    if (r.ok) ans.push({ i: p.i, raw: rawScore({ fame: fameOf.get(p.i) || 0, careerGames: p.g, connGames: r.link }) });
  }
  const raws = ans.map((a) => a.raw);
  const spread = raws.length ? Math.max(...raws) - Math.min(...raws) : 0;
  const bad = ans.length < MIN_ANSWERS ? 'under 15' : ans.length > MAX_ANSWERS ? 'over 150' : spread < MIN_SPREAD ? 'low spread' : null;
  (why[c.type] ??= {})[bad || 'ok'] = (why[c.type][bad || 'ok'] || 0) + 1;
  if (bad) continue;
  const sc = normalize(raws);
  ans.forEach((a, k) => { a.s = sc[k]; });
  ans.sort((x, y) => y.s - x.s || x.i.localeCompare(y.i));
  const us = c.cond.u === undefined ? [] : Array.isArray(c.cond.u) ? c.cond.u : [c.cond.u];
  passed.push({ ...c, era: eraOf(c, ans), units: us.map((u) => factsUnits[u].id), rule: ruleText(c.cond, F), scoring: VERSION,
    teams: us.map((u) => ({ name: factsUnits[u].name, short: factsUnits[u].short, logo: logoOf(factsUnits[u]) })),
    answers: ans.map((a) => ({ i: a.i, s: a.s })) });
}
mkdirSync(ROOT + '.cache', { recursive: true });
writeFileSync(ROOT + '.cache/candidates.json', JSON.stringify({ v: 2, asOf, prompts: passed }));
console.log('players', facts.players.length, 'candidates', cands.length, 'passed', passed.length);
console.log(JSON.stringify(why));
const byG = {}; for (const c of passed) byG[c.group] = (byG[c.group] || 0) + 1; console.log('passed by group', byG);

// ---------- the suggestion list ----------
// [id, name (no birth-year tag), career years, birth-year tag or 0,
//  nicknames or 0, page ("s:<slug>" Salary Season Finder, "c:<slug>" Career Map) or 0, headshot file or 0]
const nickOf = nicknamesByPlayer(players);
const plist = players.map((p) => {
  const m = p.name.match(/^(.*) \((\d{4})\)$/);
  const link = !p.link ? 0 : p.link.includes('/salary-season-finder/') ? 's:' + p.link.split('/player/')[1].replace(/\/$/, '') : 'c:' + p.link.split('/player/')[1].replace(/\.html$/, '');
  return [p.id, m ? m[1] : p.name, `${p.firstYear - 1}-${String(p.lastYear).slice(2)}`, m ? +m[2] : 0, nickOf.get(p.id) || 0, link, p.head || 0];
}).sort((a, b) => a[1].localeCompare(b[1]));
mkdirSync(ROOT + 'public', { recursive: true });
writeFileSync(ROOT + 'public/players.json', JSON.stringify({ v: 2, players: plist }));

// The start screen's and preview cards' headshot mosaic (Jorge, Nov 12):
// players with a real photo from Jorge's face-fill set only (light-grey
// circles), a mix of stars and deep cuts: 6 of fame 60+, 6 of 8-25, 6 under 8,
// in a stable shuffled order. [id, name, face-fill file].
{
  const h = (x) => createHash('sha256').update('mosaic:' + x).digest('hex');
  const pickTier = (lo, hi) => players.filter((p) => p.head && p.fame >= lo && p.fame < hi).sort((a, b) => h(a.id).localeCompare(h(b.id))).slice(0, 6);
  const tiers = [pickTier(60, 1e9), pickTier(8, 25), pickTier(0, 8)];
  const mosaic = [];
  for (let k = 0; k < 6; k++) for (const t of tiers) if (t[k]) mosaic.push([t[k].id, t[k].name.replace(/ \(\d{4}\)$/, ''), t[k].head]);
  writeFileSync(ROOT + 'public/mosaic.json', JSON.stringify({ v: 1, players: mosaic }));
}

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
