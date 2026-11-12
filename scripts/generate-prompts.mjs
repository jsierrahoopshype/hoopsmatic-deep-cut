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
import { evaluate, index, ruleText, seasonLabel } from './lib/cond.mjs';
import { rawScore, normalize, VERSION } from './lib/score2.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (id) => JSON.parse(readFileSync(`${ROOT}.cache/sources/${id}.json`, 'utf8'));
const MIN_ANSWERS = 15, MAX_ANSWERS = 150, MAX_NO_TEAM = 400, MIN_SPREAD = 0.3;

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
  // the last season in the box-score archive (single-game questions)
  boxThrough: JSON.parse(readFileSync(ROOT + 'data/game-highs.json', 'utf8')).through || null,
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
      gh: p.highs.map((x) => [x.y, u(x.unit), x.h[0], x.h[1], x.h[2], x.h[3], x.h[4], x.h[5], x.h[6], x.h[7] || 0, x.h[8] || 0, x.h[9] || 0]) };
  }),
};
mkdirSync(ROOT + 'data', { recursive: true });
writeFileSync(ROOT + 'data/facts.json', JSON.stringify(facts));
const F = index(facts);
const fameOf = new Map(players.map((p) => [p.id, p.fame]));

// ---------- candidates ----------
// Every question reads plainly, and every player who fits the plain wording
// counts, whatever the season (Jorge, Nov 13, 2026: no era clauses, no
// hidden conditions). The page shows "Name a player who..." once above the
// question, so each text is the short rest of the sentence ("Scored 50+
// points in a game."). Which questions get scheduled leans recent: see era
// below and scripts/build.mjs.
//
// group (for the day's mix): A two teams, B teammate, F one team's roster in
// one season, C accolades, D origin and other facts, E records and game
// stats, G money, P physical and draft, H clubs outside the NBA.
// category (one of each a day): money, accolade, record, physical, origin.
// headline: a question with no team from the headline families (Jorge, Nov
// 13): game highs, combine, award votes, clubs abroad, single-season salary,
// draft, medals, birthplace.
const cands = [];
const the = (u) => 'the ' + factsUnits[u].name;
const add = (key, group, type, cond, text, extra = {}) => cands.push({ key, group, type, cond, text, family: key, ...extra });
const unitCount = new Map();
for (const p of facts.players) for (const u of new Set(p.s.map((s) => s[1]))) unitCount.set(u, (unitCount.get(u) || 0) + 1);
const U = [...unitCount.keys()].filter((u) => unitCount.get(u) >= 40);
const U_PICKS = U.filter((u) => factsUnits[u].from >= 1991);
// Game questions for a team only if every player-season it has in the
// archive's span is in the box scores (rebounds and triple-doubles also need
// 1950-51 on).
const BOX_THROUGH = facts.boxThrough || 0;
const gap = new Set();
for (const p of facts.players) for (const s of p.s) if (s[0] <= BOX_THROUGH && !p.gh.some((g) => g[0] === s[0] && g[1] === s[1])) gap.add(s[1]);
const U_GAMES = U.filter((u) => !gap.has(u));
const gapPlayers = new Set();
for (const p of facts.players) for (const s of p.s) if (s[0] <= BOX_THROUGH && !p.gh.some((g) => g[0] === s[0] && g[1] === s[1])) gapPlayers.add(p.i);

// ----- with a team -----
for (let i = 0; i < U.length; i++) for (let j = i + 1; j < U.length; j++) {
  const [a, b] = [U[i], U[j]].sort((x, y) => factsUnits[x].name.localeCompare(factsUnits[y].name));
  if (factsUnits[a].code === factsUnits[b].code) continue;
  add(`teams:${factsUnits[a].id}:${factsUnits[b].id}`, 'A', 'two-teams', { t: 'teams', u: [a, b] }, `Played for ${the(a)} and ${the(b)}.`);
}
const stars = facts.players.filter((p) => (fameOf.get(p.i) || 0) >= 30);
for (const st of stars) {
  add(`mateany:${st.i}`, 'B', 'teammate', { t: 'mateany', p: st.i }, `Was a teammate of ${st.n}.`, { star: st.i });
  for (const u of new Set(st.s.map((s) => s[1]))) if (U.includes(u))
    add(`mate:${st.i}:${factsUnits[u].id}`, 'B', 'teammate', { t: 'mate', p: st.i, u }, `Was a teammate of ${st.n} on ${the(u)}.`, { star: st.i });
}
const seasonsOf = new Map();
for (const p of facts.players) for (const s of p.s) { const k = s[1] + '|' + s[0]; seasonsOf.set(k, (seasonsOf.get(k) || 0) + 1); }
for (const [k, n] of seasonsOf) {
  if (n < 15) continue;
  const [u, y] = k.split('|').map(Number);
  add(`roster:${factsUnits[u].id}:${y}`, 'F', 'roster', { t: 'roster', u, y }, `Played for the ${seasonLabel(y)} ${factsUnits[u].name.replace(/ \(\d{4}-(\d{4}|present)\)$/, '')}.`);
}
const count = (f) => { const m = new Map(); for (const p of facts.players) { const k = f(p); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
const born = count((p) => (p.b && p.b !== 'United States' ? p.b : null));
const colleges = count((p) => p.c);
const COLS = [...colleges.keys()].filter((c) => colleges.get(c) >= 15);
const CITY_NAME = { 'Washington, D.C.': 'Washington, D.C.', 'Brooklyn, New York': 'Brooklyn', 'The Bronx, New York': 'the Bronx', 'Queens, New York': 'Queens' };
const STATE_NAME = { Washington: 'Washington State', 'New York': 'New York State' };
const cityStates = new Map();
for (const p of facts.players) if (p.bp && p.bp.includes(', ')) { const [ci, ...rest] = p.bp.split(', '); (cityStates.get(ci) || cityStates.set(ci, new Set()).get(ci)).add(rest.join(', ')); }
const cities = [...count((p) => (p.bp && p.bp.includes(', ') ? p.bp : null))].filter(([, n]) => n >= 15)
  .map(([pl]) => [pl, CITY_NAME[pl] || (cityStates.get(pl.split(', ')[0]).size > 1 ? pl : pl.split(', ')[0])]);
const states = [...count((p) => (p.bp && p.b === 'United States' && p.bp.includes(', ') ? p.bp.split(', ').pop() : null))]
  .filter(([st, n]) => n >= 15 && st !== 'Georgia' && st !== 'D.C.').map(([st]) => [st, STATE_NAME[st] || st]);
for (const u of U) {
  const T = factsUnits[u].id;
  add(`award:rings:${T}`, 'C', 'title', { t: 'ring', u }, `Won an NBA title with ${the(u)}.`);
  add(`ringany:${T}`, 'C', 'title', { t: 'ringany', u }, `Won an NBA title at some point and played for ${the(u)}.`);
  for (const [k, w] of [['allStar', 'an All-Star team'], ['allRookie', 'an All-Rookie team'], ['allDefense', 'an All-Defensive team'], ['allNba', 'an All-NBA team']]) {
    add(`award:${k}:${T}`, 'C', 'award', { t: 'award', a: k, u }, `Made ${w} as a member of ${the(u)}.`);
    add(`allany:${k}:${T}`, 'C', 'all-team', { t: 'allany', a: k, u }, `Made ${w} at some point and played for ${the(u)}.`);
  }
  for (const [a, w] of [['MVP', 'MVP votes'], ['DPOY', 'Defensive Player of the Year votes'], ['Sixth Man', 'Sixth Man of the Year votes'], ['MIP', 'Most Improved Player votes'], ['ROY', 'Rookie of the Year votes']])
    add(`votes:${a}:${T}`, 'C', 'award-votes', { t: 'votes', a, u }, `Received ${w} as a member of ${the(u)}.`);
  add(`medal:${T}`, 'C', 'medal', { t: 'medal', u }, `Won an Olympic or World Cup medal and played for ${the(u)}.`);
  add(`bornout:${T}`, 'D', 'birthplace', { t: 'bornout', u }, `Was born outside the United States and played for ${the(u)}.`);
  for (const [c, n] of born) if (n >= 15) add(`born:${T}:${c}`, 'D', 'birthplace', { t: 'born', c, u }, `Was born in ${c} and played for ${the(u)}.`);
  for (const [st, pn] of states) add(`bornin:${T}:${st}`, 'D', 'birth-city', { t: 'bornin', pl: st, pn, u }, `Was born in ${pn} and played for ${the(u)}.`);
  for (const c of COLS) add(`college:${T}:${c}`, 'D', 'college', { t: 'college', c, cn: collegeName(c), u }, `Played for ${the(u)} and went to college at ${collegeName(c)}.`);
  add(`abroad:any:${T}`, 'H', 'abroad', { t: 'abroad', u }, `Played for a pro club outside the U.S. before his NBA debut, then for ${the(u)}.`);
  add(`gleague:${T}`, 'H', 'g-league', { t: 'gleague', u }, `Played in the G League (or D-League) and for ${the(u)}.`);
  for (const [k, v, w] of [['ppg', 25, 'points'], ['ppg', 20, 'points'], ['rpg', 12, 'rebounds'], ['rpg', 10, 'rebounds'], ['apg', 9, 'assists'], ['apg', 7, 'assists'],
    ['spg', 2, 'steals'], ['bpg', 2, 'blocks'], ['tpg', 3, 'three-pointers']])
    add(`stat:${k}${v}:${T}`, 'E', 'stat', { t: 'stat', k, v, u }, `Averaged ${v}+ ${w} a game in a season for ${the(u)}.`);
  for (const v of [10000, 15000]) add(`points:${v}:${T}`, 'E', 'points', { t: 'points', v, u }, `Scored ${v.toLocaleString('en-US')}+ career points and played for ${the(u)}.`);
  if (U_GAMES.includes(u)) {
    const early = factsUnits[u].from < 1951;
    for (const [k, v, txt] of [['pts', 40, 'Scored 40+ points in a game'], ['pts', 50, 'Scored 50+ points in a game'], ['reb', 20, 'Had a 20-rebound game'],
      ['ast', 15, 'Had a 15-assist game'], ['tpm', 8, 'Made 8+ threes in a game'], ['td', 1, 'Had a triple-double']]) {
      if (early && (k === 'reb' || k === 'td')) continue;
      add(`game:${k}${v}:${T}`, 'E', 'game-high', { t: 'game', k, v, u }, `${txt} for ${the(u)}.`);
    }
  }
  for (const v of [5, 7.5, 10, 12.5, 15, 17.5, 20, 25, 30, 35, 40, 45]) add(`salary:${v}:${T}`, 'G', 'salary', { t: 'salary', v, u }, `Earned $${v}M+ in a season with ${the(u)}.`, { family: 'salary:' + T });
  for (const v of [25, 50, 75, 100, 150, 200, 250]) add(`earn:${v}:${T}`, 'G', 'earnings', { t: 'earn', v, u }, `Earned $${v}M+ in his career and played for ${the(u)}.`, { family: 'earn:' + T });
  for (const [k, op, v, txt] of [['ge84', 'ge', 84, 'Is listed at 7-0 or taller'], ['le73', 'le', 73, 'Is listed at 6-1 or shorter']])
    add(`height:${k}:${T}`, 'P', 'height', { t: 'height', [op]: v, u }, `${txt} and played for ${the(u)}.`);
  add(`combine:ws84:${T}`, 'P', 'combine', { t: 'combine', k: 'ws', v: 84, u }, `Measured a 7-0+ wingspan at the draft combine and played for ${the(u)}.`);
  if (U_PICKS.includes(u)) {
    add(`pick:1-10:${T}`, 'P', 'draft', { t: 'pick', lo: 1, hi: 10, u }, `Was a top-10 draft pick and played for ${the(u)}.`);
    add(`pick:31-60:${T}`, 'P', 'draft', { t: 'pick', lo: 31, hi: 60, u }, `Was drafted 31st or later and played for ${the(u)}.`);
    add(`paytop:${T}`, 'G', 'pay-top', { t: 'paytop', u }, `Was the highest-paid player on ${the(u)} in a season.`);
  }
}

// ----- no team (headlines and others) -----
const H = { headline: true };
// game highs (every game in the archive; a few player-seasons are missing
// from it, see gapPlayers, and are reported by the build). Several
// thresholds per stat; build.mjs uses one threshold of a family per day.
const range = (lo, hi, st = 1) => { const o = []; for (let v = lo; v <= hi + 1e-9; v += st) o.push(Math.round(v * 10) / 10); return o; };
for (const [k, vs, w] of [['pts', range(42, 70, 2), 'points'], ['reb', range(18, 32), 'rebounds'], ['ast', range(14, 25), 'assists'], ['tpm', range(7, 13), 'threes'],
  ['stl', range(7, 10), 'steals'], ['blk', range(8, 13), 'blocks']])
  for (const v of vs) add(`gameany:${k}${v}`, 'E', 'game-high', { t: 'gameany', k, v }, k === 'pts' ? `Scored ${v}+ points in a game.` : k === 'tpm' ? `Made ${v}+ threes in a game.` : `Had ${v}+ ${w} in a game.`, { ...H, family: 'gameany:' + k });
add('gameany:p2020', 'E', 'game-high', { t: 'gameany', k: 'p2020', v: 1 }, 'Had a 20-20 game (20+ points, 20+ rebounds).', H);
for (const v of [2, 3, 5, 10, 15, 20, 30, 50, 75, 100]) add(`gameany:td${v}`, 'E', 'game-high', { t: 'gameany', k: 'td', v }, `Had ${v}+ triple-doubles.`, { ...H, family: 'gameany:td' });
for (const v of [2, 3, 5, 10, 15, 25, 50]) add(`gameany:n40${v}`, 'E', 'game-high', { t: 'gameany', k: 'n40', v }, `Had ${v}+ 40-point games.`, { ...H, family: 'gameany:n40' });
for (const v of [1, 2, 3, 5]) add(`gameany:n50${v}`, 'E', 'game-high', { t: 'gameany', k: 'n50', v }, v === 1 ? 'Scored 50+ points in a game.' : `Had ${v}+ 50-point games.`, { ...H, family: 'gameany:n50' });
// combine
const inch = (i) => `${Math.floor(i / 12)}-${i % 12}`;
for (const v of range(80, 91)) add(`combine:ws${v}`, 'P', 'combine', { t: 'combine', k: 'ws', v }, `Measured a ${inch(v)}+ wingspan at the draft combine.`, { ...H, family: 'combine:ws' });
for (const v of range(33, 45)) add(`combine:vert${v}`, 'P', 'combine', { t: 'combine', k: 'vert', v }, `Had a ${v}-inch+ max vertical at the draft combine.`, { ...H, family: 'combine:vert' });
for (const v of range(80, 86)) add(`combine:hgt${v}`, 'P', 'combine', { t: 'combine', k: 'hgt', v }, `Measured ${inch(v)}+ without shoes at the draft combine.`, { ...H, family: 'combine:hgt' });
for (const v of range(106, 116)) add(`combine:reach${v}`, 'P', 'combine', { t: 'combine', k: 'reach', v }, `Had a standing reach of ${inch(v)}+ at the draft combine.`, { ...H, family: 'combine:reach' });
// award votes
for (const [a, w] of [['MVP', 'MVP'], ['DPOY', 'Defensive Player of the Year'], ['Sixth Man', 'Sixth Man of the Year'], ['MIP', 'Most Improved Player'], ['ROY', 'Rookie of the Year']]) {
  add(`votesany:${a}`, 'C', 'award-votes', { t: 'votesany', a }, `Received ${w} votes.`, { ...H, family: 'votesany:' + a });
  for (const top of range(2, 10)) add(`votesany:${a}:${top}`, 'C', 'award-votes', { t: 'votesany', a, top }, `Finished top ${top} in ${w} voting.`, { ...H, family: 'votesany:' + a });
}
// clubs abroad
const abroadBefore = count((p) => { const x = (p.x || []).find((x) => x[0] === 'O' && x[3] <= p.f - 1); return x ? x[4] : null; });
for (const [c, n] of abroadBefore) if (n >= 15) add(`abroad:${c}`, 'H', 'abroad', { t: 'abroad', c }, `Played for a pro club in ${c} before the NBA.`, H);
const abroadAfter = count((p) => { const x = (p.x || []).find((x) => x[0] === 'O' && x[2] >= p.f); return x ? x[4] : null; });
for (const [c, n] of abroadAfter) if (n >= 15) add(`abroadafter:${c}`, 'H', 'abroad', { t: 'abroadafter', c }, `Played for a pro club in ${c} after his NBA debut.`, H);
// clubs outside the NBA with 25+ NBA players in their history
{
  const m = new Map();
  for (const p of facts.players) for (const k of new Set((p.x || []).filter((x) => x[0] === 'O').map((x) => x[1] + '|' + x[4]))) m.set(k, (m.get(k) || 0) + 1);
  for (const [k, n] of m) if (n >= 25) { const [name, c] = k.split('|'); add(`club:${k}`, 'H', 'club', { t: 'club', name, c }, `Played for ${name} in ${c}.`, H); }
}
// single-season salary and career earnings
for (const v of range(10, 60, 2.5)) add(`salaryany:${v}`, 'G', 'salary', { t: 'salaryany', v }, `Earned $${v}M+ in a season.`, { ...H, family: 'salaryany' });
for (const v of range(50, 450, 25)) add(`earnany:${v}`, 'G', 'earnings', { t: 'earnany', v }, `Earned $${v}M+ in his career.`, { family: 'earnany' });
// draft classes (the bio data has every player's draft year)
for (let y = 1960; y <= 2025; y++) add(`class:${y}`, 'P', 'draft', { t: 'class', y }, `Was drafted in the ${y} NBA draft.`, H);
// medals
for (const [kind, w] of [['Olympic', 'an Olympic medal'], ['Olympic Gold', 'Olympic gold'], ['Olympic Silver', 'Olympic silver'], ['Olympic Bronze', 'Olympic bronze'],
  ['World Cup', 'a World Cup medal'], ['World Cup Gold', 'World Cup gold'], ['World Cup Silver', 'World Cup silver'], ['World Cup Bronze', 'World Cup bronze']])
  add(`medalkind:${kind}`, 'C', 'medal', { t: 'medalkind', kind }, `Won ${w}.`, H);
// birthplace
for (const [c, n] of born) if (n >= 15) add(`bornc:${c}`, 'D', 'birthplace', { t: 'bornc', c }, `Was born in ${c}.`, H);
for (const [pl, pn] of cities) add(`bornin:${pl}`, 'D', 'birth-city', { t: 'bornin', pl, pn }, `Was born in ${pn}.`, H);
for (const [st, pn] of states) add(`bornin:${st}`, 'D', 'birth-city', { t: 'bornin', pl: st, pn }, `Was born in ${pn}.`, H);
// others with no team
for (const [k, vs, w] of [['ppg', [24, 26, 28, 30], 'points'], ['rpg', [12, 13, 14, 15], 'rebounds'], ['apg', [9, 10, 11, 12], 'assists'], ['spg', [2, 2.3, 2.5], 'steals'], ['bpg', [2.5, 3, 3.5], 'blocks'], ['tpg', [3, 3.5, 4, 4.5], 'three-pointers']])
  for (const v of vs) add(`statany:${k}${v}`, 'E', 'stat', { t: 'statany', k, v }, `Averaged ${v}+ ${w} a game in a season.`, { family: 'statany:' + k });
for (const [k, vs, w] of [['pts', [15000, 20000, 25000], 'points'], ['reb', [8000, 10000, 12000], 'rebounds'], ['ast', [5000, 7000, 9000], 'assists'], ['stl', [1200, 1500, 1800], 'steals'],
  ['blk', [1200, 1600, 2000], 'blocks'], ['tpm', [1000, 1500, 2000], 'three-pointers'], ['g', [1000, 1200, 1300], 'regular-season games']])
  for (const v of vs) add(`career:${k}${v}`, 'E', 'career', { t: 'career', k, v }, k === 'g' ? `Played ${v.toLocaleString('en-US')}+ ${w}.` : `Had ${v.toLocaleString('en-US')}+ career ${w}.`, { family: 'career:' + k });
for (const [k, vs, w] of [['allStar', [5, 8, 10, 12], 'All-Star teams'], ['allNba', [3, 5, 8], 'All-NBA teams'], ['allDefense', [3, 5, 7], 'All-Defensive teams'], ['rings', [2, 3, 4], 'NBA titles']])
  for (const v of vs) add(`count:${k}${v}`, 'C', 'accolade-count', { t: 'count', k, v }, k === 'rings' ? `Won ${v}+ ${w}.` : `Made ${v}+ ${w}.`);
for (const v of [8, 10, 12]) add(`count:teams${v}`, 'E', 'journeyman', { t: 'count', k: 'teams', v }, `Played for ${v}+ NBA franchises.`);
for (const v of [17, 18, 19, 20]) add(`count:seasons${v}`, 'E', 'journeyman', { t: 'count', k: 'seasons', v }, `Played ${v}+ NBA seasons.`);
for (const v of [86, 87, 88]) add(`heightany:ge${v}`, 'P', 'height', { t: 'heightany', ge: v }, `Is listed at ${inch(v)} or taller.`);
for (const v of [70, 71, 72]) add(`heightany:le${v}`, 'P', 'height', { t: 'heightany', le: v }, `Is listed at ${inch(v)} or shorter.`);
for (const c of COLS) {
  add(`collegeany:${c}`, 'D', 'college', { t: 'collegeany', c, cn: collegeName(c) }, `Went to college at ${collegeName(c)}.`);
  add(`colstar:${c}`, 'D', 'college', { t: 'colstar', c, cn: collegeName(c) }, `Went to college at ${collegeName(c)} and made an All-Star team.`);
}
for (let y = 1960; y <= 2026; y++) add(`debut:${y}`, 'D', 'debut', { t: 'debut', y }, `Made his NBA debut in ${seasonLabel(y)}.`);

const CATEGORY = { salary: 'money', earnings: 'money', 'pay-top': 'money', title: 'accolade', award: 'accolade', 'all-team': 'accolade', 'award-votes': 'accolade', medal: 'accolade', 'accolade-count': 'accolade',
  stat: 'record', points: 'record', 'game-high': 'record', career: 'record', journeyman: 'record', height: 'physical', combine: 'physical', draft: 'physical',
  birthplace: 'origin', 'birth-city': 'origin', college: 'origin', abroad: 'origin', club: 'origin' };
// theme: the question with its team taken out ('bornin:*:California'), so a
// day never repeats a theme from the 3 days before it (build.mjs).
for (const c of cands) { c.theme = ['two-teams', 'roster', 'teammate'].includes(c.type) || c.cond.u === undefined ? c.key : c.key.replace(/[A-Z]{3}\|[^:]+/g, '*').replace(/:\d+(\.\d+)?$/, ''); c.cat = CATEGORY[c.type] || null; c.team = c.cond.u !== undefined; c.headline = !!c.headline && !c.team; }

// ---------- era: how recent a question's answers are ----------
// Only for picking questions (scripts/build.mjs), never a condition. A
// player's year is the middle of his career. modern: half or more of the
// answers from 2010-11 on; 80s: half or more from 1980-81 to 1989-90; old:
// more than half before 1980-81 (never scheduled); else open. Roster
// questions go by their season.
const midOf = new Map(facts.players.map((p) => [p.i, (p.f + p.l) / 2]));
function eraOf(c, ans) {
  if (c.cond.t === 'roster') return c.cond.y >= 2011 ? 'modern' : c.cond.y < 1981 ? 'old' : c.cond.y <= 1990 ? '80s' : 'open';
  const m = ans.map((a) => midOf.get(a.i));
  const share = (f) => m.filter(f).length / m.length;
  if (share((y) => y < 1981) > 0.5) return 'old';
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
  const max = c.cond.u === undefined ? MAX_NO_TEAM : MAX_ANSWERS;   // Jorge, Nov 13: up to 400 with no team
  const bad = ans.length < MIN_ANSWERS ? 'under 15' : ans.length > max ? 'too many' : spread < MIN_SPREAD ? 'low spread' : null;
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
