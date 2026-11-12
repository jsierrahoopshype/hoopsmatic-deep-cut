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
      w: p.solo, pw: p.potw.map((x) => [x.y, u(x.unit)]), x: p.clubs };
  }),
};
mkdirSync(ROOT + 'data', { recursive: true });
writeFileSync(ROOT + 'data/facts.json', JSON.stringify(facts));
const F = index(facts);
const fameOf = new Map(players.map((p) => [p.id, p.fame]));

// ---------- candidates ----------
// group: A two teams, B teammate, C title/award, D team plus another fact
// (birthplace, college, career start, draft), E stat season or career
// points, F one team's roster in one season, G salary, H clubs outside the
// NBA (abroad before the NBA, G League).
//
// ERAS (Jorge, Nov 12, 2026): no question depends on anything before
// 1980-81. Every condition carries m = 1981 (only 1980-81 and later counts),
// and conditions that name their own seasons (a roster season, a decade, a
// draft range) start at 1980-81 or later. Most questions also come in a
// "since 2010-11" version (m = 2011). era: 'modern' (about 2010-11 or later),
// '80s' (about the 1980s), else 'open'; build.mjs puts 5+ modern and at most
// 2 '80s' questions in a day.
const OPEN = 1981, MODERN = 2011;
const cands = [];
const the = (u) => 'the ' + factsUnits[u].name;
const add = (key, group, type, cond, text, extra = {}) => cands.push({ key, group, type, cond, text, era: 'open', ...extra });
// A question in both versions: from 1980-81, and since 2010-11.
const both = (key, group, type, cond, text, extra = {}) => {
  add(key, group, type, { ...cond, m: OPEN }, text, extra);
  add(key + ':m2011', group, type, { ...cond, m: MODERN }, text.replace(/\.$/, ' since 2010-11.'), { ...extra, era: 'modern' });
};
const unitCount = new Map();
for (const p of facts.players) for (const u of new Set(p.s.filter((s) => s[0] >= OPEN).map((s) => s[1]))) unitCount.set(u, (unitCount.get(u) || 0) + 1);
const U = [...unitCount.keys()].filter((u) => unitCount.get(u) >= 40);

for (let i = 0; i < U.length; i++) for (let j = i + 1; j < U.length; j++) {
  const [a, b] = [U[i], U[j]].sort((x, y) => factsUnits[x].name.localeCompare(factsUnits[y].name));
  if (factsUnits[a].code === factsUnits[b].code) continue;
  both(`teams:${factsUnits[a].id}:${factsUnits[b].id}`, 'A', 'two-teams', { t: 'teams', u: [a, b] }, `Name a player who played for ${the(a)} and ${the(b)}.`);
}
// Teammate prompts: stars of fame 45+.
const stars = facts.players.filter((p) => (fameOf.get(p.i) || 0) >= 45);
for (const st of stars) for (const u of new Set(st.s.filter((s) => s[0] >= OPEN).map((s) => s[1]))) {
  both(`mate:${st.i}:${factsUnits[u].id}`, 'B', 'teammate', { t: 'mate', p: st.i, u }, `Name a player who was a teammate of ${st.n} on ${the(u)}.`, { star: st.i });
}
// Since 2010-11 only: teammates of the next tier of stars (fame 30 to 45).
for (const st of facts.players.filter((p) => (fameOf.get(p.i) || 0) >= 30 && (fameOf.get(p.i) || 0) < 45))
  for (const u of new Set(st.s.filter((s) => s[0] >= MODERN).map((s) => s[1])))
    add(`mate:${st.i}:${factsUnits[u].id}:m2011`, 'B', 'teammate', { t: 'mate', p: st.i, u, m: MODERN }, `Name a player who was a teammate of ${st.n} on ${the(u)} since 2010-11.`, { star: st.i, era: 'modern' });
// Team-season rosters, 1980-81 on.
const seasonsOf = new Map();
for (const p of facts.players) for (const s of p.s) { const k = s[1] + '|' + s[0]; seasonsOf.set(k, (seasonsOf.get(k) || 0) + 1); }
for (const [k, n] of seasonsOf) {
  if (n < 15) continue;
  const [u, y] = k.split('|').map(Number);
  if (y < OPEN) continue;
  add(`roster:${factsUnits[u].id}:${y}`, 'F', 'roster', { t: 'roster', u, y }, `Name a player who played for the ${seasonLabel(y)} ${factsUnits[u].name.replace(/ \(\d{4}-(\d{4}|present)\)$/, '')}.`,
    { era: y >= MODERN ? 'modern' : y <= 1990 ? '80s' : 'open' });
}
for (const u of U) {
  both(`award:rings:${factsUnits[u].id}`, 'C', 'title', { t: 'ring', u }, `Name a player who won an NBA title with ${the(u)}.`);
  for (const [k, w] of [['allStar', 'an All-Star team'], ['allRookie', 'an All-Rookie team'], ['allDefense', 'an All-Defensive team'], ['allNba', 'an All-NBA team']])
    both(`award:${k}:${factsUnits[u].id}`, 'C', 'award', { t: 'award', a: k, u }, `Name a player who made ${w} as a member of ${the(u)}.`);
  both(`potw:${factsUnits[u].id}`, 'C', 'player-of-week', { t: 'potw', u }, `Name a player who won a Player of the Week award with ${the(u)}.`);
}
for (const a of Object.keys(SOLO_NAMES)) both(`solo:${a}`, 'C', 'solo-award', { t: 'solo', a }, `Name a player who won ${SOLO_NAMES[a]}.`);
const count = (f) => { const m = new Map(); for (const p of facts.players) { const k = f(p); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
const born = count((p) => (p.b && p.b !== 'United States' ? p.b : null));
const colleges = count((p) => p.c);
const COLS = [...colleges.keys()].filter((c) => colleges.get(c) >= 15);
// Birth cities (20+ NBA players born there) and U.S. states (40+). Georgia
// is left out (the country shares its name), and the data's bare "New York"
// isn't a city with a state, so it never matches.
const CITY_NAME = { 'Washington, D.C.': 'Washington, D.C.', 'Brooklyn, New York': 'Brooklyn', 'The Bronx, New York': 'the Bronx', 'Queens, New York': 'Queens' };
const STATE_NAME = { Washington: 'Washington State', 'New York': 'New York State' };
// A city goes by its name alone unless another birthplace shares it (Portland, Oregon and Portland, Maine).
const cityStates = new Map();
for (const p of facts.players) if (p.bp && p.bp.includes(', ')) { const [ci, ...rest] = p.bp.split(', '); (cityStates.get(ci) || cityStates.set(ci, new Set()).get(ci)).add(rest.join(', ')); }
const cities = [...count((p) => (p.bp && p.bp.includes(', ') ? p.bp : null))].filter(([, n]) => n >= 20)
  .map(([pl]) => [pl, CITY_NAME[pl] || (cityStates.get(pl.split(', ')[0]).size > 1 ? pl : pl.split(', ')[0])]);
const states = [...count((p) => (p.bp && p.b === 'United States' && p.bp.includes(', ') ? p.bp.split(', ').pop() : null))]
  .filter(([st, n]) => n >= 40 && st !== 'Georgia' && st !== 'D.C.').map(([st]) => [st, STATE_NAME[st] || st]);
for (const [pl, pn] of cities) {
  add(`bornin:${pl}`, 'D', 'birth-city', { t: 'bornin', pl, pn, m: OPEN }, `Name an NBA player born in ${pn}.`);
  add(`bornin:${pl}:m2011`, 'D', 'birth-city', { t: 'bornin', pl, pn, m: MODERN }, `Name a player born in ${pn} who played in the NBA in 2010-11 or later.`, { era: 'modern' });
}
// Countries with 15+ players whose pro clubs there ended before their NBA debut.
const abroadC = count((p) => { const x = p.f >= OPEN && (p.x || []).find((x) => x[0] === 'O' && x[3] <= p.f - 1); return x ? x[4] : null; });
for (const [c, n] of abroadC) if (n >= 15) {
  add(`abroad:${c}`, 'H', 'abroad', { t: 'abroad', c, m: OPEN }, `Name a player who played for a pro club in ${c} before his NBA debut.`);
  add(`abroad:${c}:m2011`, 'H', 'abroad', { t: 'abroad', c, m: MODERN }, `Name a player who played for a pro club in ${c} before making his NBA debut in 2010-11 or later.`, { era: 'modern' });
}
for (const u of U) {
  both(`bornout:${factsUnits[u].id}`, 'D', 'birthplace', { t: 'bornout', u }, `Name a player born outside the United States who played for ${the(u)}.`);
  for (const [c, n] of born) if (n >= 15) both(`born:${factsUnits[u].id}:${c}`, 'D', 'birthplace', { t: 'born', c, u }, `Name a player born in ${c} who played for ${the(u)}.`);
  for (const [st, pn] of states) both(`bornin:${factsUnits[u].id}:${st}`, 'D', 'birth-city', { t: 'bornin', pl: st, pn, u }, `Name a player born in ${pn} who played for ${the(u)}.`);
  for (const [pl, pn] of cities) add(`bornin:${factsUnits[u].id}:${pl}`, 'D', 'birth-city', { t: 'bornin', pl, pn, u, m: OPEN }, `Name a player born in ${pn} who played for ${the(u)}.`);
  for (let d = 1980; d <= 2020; d += 10) add(`start:${factsUnits[u].id}:${d}`, 'D', 'career-start', { t: 'start', d, u, m: OPEN }, `Name a player who started his NBA career in the ${d}s and played for ${the(u)}.`,
    { era: d >= 2010 ? 'modern' : d === 1980 ? '80s' : 'open' });
  add(`top10:${factsUnits[u].id}`, 'D', 'draft', { t: 'top10', u, m: OPEN }, `Name a player who was a top-10 draft pick (1990 to 2025 drafts) and played for ${the(u)}.`);
  for (const c of COLS) both(`college:${factsUnits[u].id}:${c}`, 'D', 'college', { t: 'college', c, cn: collegeName(c), u }, `Name a player who played for ${the(u)} and went to college at ${collegeName(c)}.`);
  for (const [k, v, w] of [['ppg', 25, 'points'], ['ppg', 20, 'points'], ['ppg', 15, 'points'], ['rpg', 12, 'rebounds'], ['rpg', 10, 'rebounds'], ['rpg', 8, 'rebounds'],
    ['apg', 9, 'assists'], ['apg', 7, 'assists'], ['apg', 5, 'assists'], ['spg', 1.5, 'steals'], ['spg', 2, 'steals'], ['bpg', 1.5, 'blocks'], ['bpg', 2, 'blocks'], ['tpg', 2, 'three-pointers'], ['tpg', 3, 'three-pointers']])
    both(`stat:${k}${v}:${factsUnits[u].id}`, 'E', 'stat', { t: 'stat', k, v, u }, `Name a player who averaged ${v}+ ${w} a game in a season for ${the(u)}.`);
  for (const v of [10, 20, 30]) both(`salary:${v}:${factsUnits[u].id}`, 'G', 'salary', { t: 'salary', v, u }, `Name a player who earned $${v}M+ in a season with ${the(u)}.`);
  add(`abroad:any:${factsUnits[u].id}`, 'H', 'abroad', { t: 'abroad', u, m: OPEN }, `Name a player who played for a pro club outside the U.S. before his NBA debut and then for ${the(u)}.`);
  add(`abroad:any:${factsUnits[u].id}:m2011`, 'H', 'abroad', { t: 'abroad', u, m: MODERN }, `Name a player who played for a pro club outside the U.S. before making his NBA debut in 2010-11 or later, and then played for ${the(u)}.`, { era: 'modern' });
  both(`gleague:${factsUnits[u].id}`, 'H', 'g-league', { t: 'gleague', u }, `Name a player who played in the G League (or D-League) and for ${the(u)}.`);
  for (const v of [10000, 15000]) add(`points:${v}:${factsUnits[u].id}`, 'E', 'points', { t: 'points', v, u, m: OPEN }, `Name a player who scored ${v.toLocaleString('en-US')}+ career points and played for ${the(u)}.`);
}
for (const c of COLS) {
  for (let d = 1980; d <= 2020; d += 10) add(`colstart:${c}:${d}`, 'D', 'college', { t: 'colstart', c, cn: collegeName(c), d, m: OPEN }, `Name a player who went to college at ${collegeName(c)} and started his NBA career in the ${d}s.`,
    { era: d >= 2010 ? 'modern' : d === 1980 ? '80s' : 'open' });
  both(`colstar:${c}`, 'D', 'college', { t: 'colstar', c, cn: collegeName(c) }, `Name a player who went to college at ${collegeName(c)} and made at least one All-Star team.`);
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
  passed.push({ ...c, units: us.map((u) => factsUnits[u].id), rule: ruleText(c.cond, F), scoring: VERSION,
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
