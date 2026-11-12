// One record per player, built only from Jorge's pinned data files
// (data/sources.lock.json, downloaded to .cache/sources/ by pull-data.mjs).
//
//   buildPlayers() -> { players: [player], units: Map(unitId -> unit) }
//
// player = { id, name, slug, link, country, draftYear, pick, college,
//            seasons:[{y, code, unit, gp, min}], units:Set, gp, min,
//            allStar:[{y, units}], allRookie, allDefense, allNba, rings:[{y, unit}],
//            fame }
//
// A "unit" is a team as it was named in those seasons (Jorge: "SuperSonics,
// not Thunder"). Era names come from rules/franchises.json, copied from the
// NBA Crossword (Jorge, Nov 10, 2026). Seasons are stored by ending year
// (1968 = 1967-68), as in the data.
import { readFileSync } from 'node:fs';

const ROOT = new URL('../..', import.meta.url).pathname;
const src = (id) => JSON.parse(readFileSync(`${ROOT}.cache/sources/${id}.json`, 'utf8'));
const F = JSON.parse(readFileSync(ROOT + 'rules/franchises.json', 'utf8')).franchises;

// Eras that share a name are one unit, plus two merges a fan would expect:
// the 2005-06 and 2006-07 New Orleans/Oklahoma City Hornets count as the New
// Orleans Hornets, and the 1972-73 to 1974-75 Kansas City-Omaha Kings as the
// Kansas City Kings.
const MERGE = { 'New Orleans/Oklahoma City Hornets': 'New Orleans Hornets', 'Kansas City-Omaha Kings': 'Kansas City Kings' };

export const seasonLabel = (y) => `${y - 1}-${String(y).slice(2)}`;

// unitOf(code, year) -> unit id ("OKC|Seattle SuperSonics") or null
const UNITS = new Map();
function unitFor(code, era) {
  let name = `${era.city} ${era.nickname}`;
  name = MERGE[name] || name;
  const id = `${code}|${name}`;
  if (!UNITS.has(id)) UNITS.set(id, { id, code, name, from: era.from, to: era.to, defunct: !!era.defunct });
  const u = UNITS.get(id);
  u.from = Math.min(u.from, era.from);
  u.to = u.to === null || era.to === null ? null : Math.max(u.to, era.to);
  return u;
}
const ERA = {};
for (const [code, eras] of Object.entries(F)) ERA[code] = eras.map((e) => ({ ...e, unit: unitFor(code, e) }));
export function unitOf(code, y) {
  const e = (ERA[code] || []).find((x) => y >= x.from && (x.to === null || y <= x.to));
  return e ? e.unit.id : null;
}
// Display name: "Seattle SuperSonics". A name two franchises' eras share
// gets its years: both Charlotte Hornets ("(1988-2002)", "(2014-present)").
// A one-season defunct namesake (the 1949-50 Denver Nuggets) gets years
// itself but does not add them to today's team.
export function unitName(id) {
  const u = UNITS.get(id);
  const twins = [...UNITS.values()].filter((x) => x !== u && x.name === u.name && (u.defunct || !x.defunct));
  if (!twins.length) return u.name;
  return `${u.name} (${u.from - 1}-${u.to === null ? 'present' : u.to})`;
}
export const unitInfo = (id) => UNITS.get(id);

// College names: salary-season-finder spells them one way ("Michigan St"),
// nba-career-map another ("Michigan State", "Duke (2017–2018)"). Canonical is
// the salary-season-finder spelling, learned from players in both files.
function cleanCareerCollege(s) {
  if (!s) return null;
  s = s.replace(/\s*\(\d{4}[–-]\d{4}\)\s*/g, '').replace(/\*/g, '').trim();
  return s || null;
}
const COLLEGE_DISPLAY = {
  'North Carolina St': 'NC State', 'Connecticut': 'UConn', 'Brigham Young': 'BYU', 'Southern Methodist': 'SMU',
  'Alabama-Birmingham': 'UAB', 'Nevada-Las Vegas': 'UNLV', 'Louisiana St': 'LSU', 'Texas-El Paso': 'UTEP',
  'Southern California': 'USC', 'Virginia Commonwealth': 'VCU', 'Miami': 'Miami (FL)',
};
export function collegeName(c) {
  if (COLLEGE_DISPLAY[c]) return COLLEGE_DISPLAY[c];
  return c.replace(/ St$/, ' State').replace(/ St /, ' State ');
}
// High schools, prep schools, junior colleges and pro clubs are not "college".
const NOT_COLLEGE = /\b(HS|High School|Academy|Prep|CC|JC|Community College|Junior College)\b|\([A-Z]{2}\)$/;

const pct = (a, b) => (b ? a / b : 0);

// Fame: the NBA Crossword's formula (scripts/build-words.mjs fame()), so a
// "star" means the same thing in both games. Tier: 25+ star, 8+ known, else
// deep cut.
function fameOf(p) {
  const n = (k) => p.aw[k] || 0;
  let s = 3 * p.allStar.length + 10 * n('Most Valuable Player') + 6 * n('Finals MVP') + 2 * p.rings.length
    + 4 * n('All-NBA First Team') + 2 * (n('All-NBA Second Team') + n('All-NBA Third Team'))
    + 8 * n('Hall of Fame') + 8 * n('NBA Top-75')
    + 3 * (n('Rookie of the Year') + n('Defensive Player of the Year') + n('Sixth Man of the Year') + n('Most Improved Player'))
    + p.gp / 100;
  if (p.lastYear >= 2022) s += 4;   // current players are easier to recall
  return Math.round(s * 10) / 10;
}
export const tierOf = (fame) => (fame >= 25 ? 'star' : fame >= 8 ? 'known' : 'deep');

// Birth country from a Born & Died birthplace ("Melbourne, Australia",
// "Portland, Oregon"). Birthplace only: nationality and national teams never
// count (Jorge, Nov 11, 2026). The 50 states and D.C. are the United States;
// territories (Puerto Rico, U.S. Virgin Islands) are not. null = unknown.
const US_STATES = new Set(['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming','D.C.','District of Columbia','United States']);
const CA_PROVINCES = new Set(['Ontario','Quebec','British Columbia','Alberta','Manitoba','Saskatchewan','Nova Scotia','New Brunswick','Newfoundland and Labrador','Prince Edward Island']);
// The few rows whose last part is a city, checked by hand. Panama City is
// left unknown (Panama or Florida).
const CITY_COUNTRY = { Northridge: 'United States', 'Glens Falls': 'United States', Chatsworth: 'United States', 'Las Cruces': 'United States',
  Southaven: 'United States', 'New Orleans': 'United States', 'San Juan': 'Puerto Rico', Hermosillo: 'Mexico', Frankston: 'Australia',
  'Luperon pto pta': 'Dominican Republic', 'The Bahamas': 'Bahamas', 'Soviet Union': 'Soviet Union' };
export function birthCountry(place) {
  if (!place) return null;
  const last = place.split(',').pop().trim();
  if (!last || last === 'Panama City') return null;
  if (US_STATES.has(last)) return 'United States';
  if (CA_PROVINCES.has(last)) return 'Canada';
  return CITY_COUNTRY[last] || last;
}
const normName = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function buildPlayers() {
  const bio = src('bio'), awards = src('awards'), rs = src('rsStats'), po = src('poStats');
  const ssf = src('ssf').seasons, slugs = src('slugs').slugs.player, careers = src('careers');
  const births = new Map();
  for (const [n, pl] of Object.entries(src('births'))) births.set(normName(n), pl);

  const ssfBy = new Map();
  for (const s of ssf) if (!ssfBy.has(s.player) || (s.draft_pick && !ssfBy.get(s.player).draft_pick) || (s.college && !ssfBy.get(s.player).college)) ssfBy.set(s.player, s);
  const carBy = new Map(careers.map((c) => [c.player, c]));

  // Career-map college spelling -> salary-season-finder spelling, by majority.
  const votes = {};
  for (const b of bio) {
    const a = cleanCareerCollege(carBy.get(b.PLAYER)?.college), z = ssfBy.get(b.PLAYER)?.college;
    if (a && z) { votes[a] ??= {}; votes[a][z] = (votes[a][z] || 0) + 1; }
  }
  const alias = {};
  for (const [a, v] of Object.entries(votes)) alias[a] = Object.entries(v).sort((x, y) => y[1] - x[1])[0][0];
  // Only an alias seen at least twice, or an exact match, is trusted.
  for (const [a, v] of Object.entries(votes)) if (Object.values(v).reduce((s, x) => s + x, 0) < 2 && alias[a] !== a) {
    if (!/State$/.test(a)) delete alias[a]; else alias[a] = a.replace(/State$/, 'St');
  }

  const players = [];
  const byName = new Map();
  for (const b of bio) {
    if (byName.has(b.PLAYER)) continue;
    const s = ssfBy.get(b.PLAYER), c = carBy.get(b.PLAYER);
    let college = s?.college || null;
    if (!college) { const a = cleanCareerCollege(c?.college); college = a ? (alias[a] || a.replace(/ State$/, ' St')) : null; }
    if (college && NOT_COLLEGE.test(college)) college = null;
    const slug = slugs[b.PLAYER] || null;
    const link = slug ? `https://hoopsmatic.com/salary-season-finder/player/${slug}/`
      : c ? `https://hoopsmatic.com/nba-career-map/player/${slugify(b.PLAYER)}.html` : null;
    const p = {
      id: slug || slugify(b.PLAYER), name: b.PLAYER, link,
      country: b.NATIONALITY || null,
      birthplace: births.get(normName(b.PLAYER)) || null,
      bornIn: birthCountry(births.get(normName(b.PLAYER))),
      draftYear: /^\d{4}$/.test(b.DRAFT || '') ? +b.DRAFT : null,
      pick: s?.draft_pick || null, college,
      seasons: [], units: new Set(), gp: 0, min: 0,
      allStar: [], allRookie: [], allDefense: [], allNba: [], rings: [], aw: {},
      firstYear: null, lastYear: null,
    };
    players.push(p);
    byName.set(p.name, p);
  }
  // Two different players can share a name in the data's slugs; keep ids unique.
  const seen = new Map();
  for (const p of players) { const n = (seen.get(p.id) || 0) + 1; seen.set(p.id, n); if (n > 1) p.id += '-' + n; }

  for (const r of rs) {
    const p = byName.get(r.PLAYER);
    if (!p) continue;
    const y = +r.YEAR, gp = +r.GP || 0;
    const unit = unitOf(r.TEAM, y);
    if (!unit || gp < 1) continue;
    // Early seasons have MIN 0 (not kept then): count 20 a game.
    const min = +r.MIN > 0 ? +r.MIN : gp * 20;
    p.seasons.push({ y, code: r.TEAM, unit, gp, min, pts: +r.PTS || 0 });
    p.units.add(unit);
    p.gp += gp; p.min += min;
    p.firstYear = p.firstYear ? Math.min(p.firstYear, y) : y;
    p.lastYear = p.lastYear ? Math.max(p.lastYear, y) : y;
  }

  // Titles: as the crossword, the champion team comes from playoff stats
  // (awards.json "NBA Champion" TEAM is unreliable), and a ring counts only if
  // the player's own playoff team that year is that team.
  const poTeam = new Map();
  for (const r of po) poTeam.set(r.PLAYER + '|' + r.YEAR, r.TEAM);
  const champ = {};
  {
    const v = {};
    for (const a of awards) if (a.AWARD === 'NBA Champion') {
      const t = poTeam.get(a['PLAYER / COACH'] + '|' + a.YEAR);
      if (t) { v[a.YEAR] ??= {}; v[a.YEAR][t] = (v[a.YEAR][t] || 0) + 1; }
    }
    for (const [y, x] of Object.entries(v)) champ[y] = Object.entries(x).sort((a, b) => b[1] - a[1])[0][0];
  }
  // Season awards are tied to the team the player played the most games for
  // that season (awards.json TEAM is unreliable too; Jorge, Nov 11, 2026). A
  // tie goes to the later row in rsStats. Kept as a one-item list.
  const unitsIn = (p, y) => {
    const rows = p.seasons.filter((s) => s.y === y);
    if (!rows.length) return [];
    let best = rows[0];
    for (const r of rows) if (r.gp >= best.gp) best = r;
    return [best.unit];
  };
  const LIST = { 'All-Star': 'allStar', 'All-Rookie First Team': 'allRookie', 'All-Rookie Second Team': 'allRookie',
    'All-Defensive First Team': 'allDefense', 'All-Defensive Second Team': 'allDefense',
    'All-NBA First Team': 'allNba', 'All-NBA Second Team': 'allNba', 'All-NBA Third Team': 'allNba' };
  for (const a of awards) {
    const p = byName.get(a['PLAYER / COACH']);
    if (!p || !p.seasons.length) continue;   // coaches and non-players
    const y = /^\d{4}$/.test(a.YEAR) ? +a.YEAR : null;
    p.aw[a.AWARD] = (p.aw[a.AWARD] || 0) + 1;
    if (a.AWARD === 'NBA Champion') {
      const t = champ[a.YEAR];
      if (!t || poTeam.get(p.name + '|' + a.YEAR) !== t) continue;
      const unit = unitOf(t, y);
      if (unit) p.rings.push({ y, unit });
    } else if (LIST[a.AWARD] && y) {
      p[LIST[a.AWARD]].push({ y, units: unitsIn(p, y) });
    }
  }
  for (const p of players) {
    p.fame = fameOf(p);
    // Deep Cut only: a recent high pick is known before he has the games to
    // show it (a No. 1 pick in his first season would otherwise score as a
    // deep cut). Draft classes 2022 on: picks 1-3 +12, 4-10 +6.
    if (p.draftYear >= 2022 && p.pick) p.fame += p.pick <= 3 ? 12 : p.pick <= 10 ? 6 : 0;
  }
  return { players: players.filter((p) => p.seasons.length), units: UNITS };
}

function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
