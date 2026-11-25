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
export const allUnits = () => [...UNITS.values()];

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
const SOLO = { 'Rookie of the Year': 'roy', 'Sixth Man of the Year': 'smoy', 'Most Improved Player': 'mip',
  'Defensive Player of the Year': 'dpoy', 'All-Star MVP': 'asmvp' };
const MERGE_NAME = (n) => MERGE[n] || n;
const GLEAGUE = JSON.parse(readFileSync(ROOT + 'rules/gleague.json', 'utf8')).teams;
// Every NBA/BAA name in the franchise file, plus the Career Map's spelling of the Clippers.
const NBA_NAMES = new Set(['LA Clippers', ...Object.values(F).flat().map((e) => `${e.city} ${e.nickname}`)]);
// "6-9" -> 81 inches; "7' 1.25''" -> 85.25.
function inches(h) {
  if (!h) return null;
  let m = String(h).match(/^(\d+)-(\d+)$/);
  if (m) return +m[1] * 12 + +m[2];
  m = String(h).match(/^(\d+)'\s*([\d.]+)''?$/);
  return m ? +m[1] * 12 + +m[2] : null;
}
const SUFFIX = /,? (Jr\.?|Sr\.?|II|III|IV)$/i;
const normName = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// bio.json BIRTHDAY "5/13/2003" -> "2003-05-13"
const isoDate = (d) => { const m = String(d || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };

// HOW SOURCES ARE JOINED (owner's decision, Nov 25, 2026: never mix up two
// people who share a name, such as a father and a son).
// None of the pinned files except nba-headshots carries an NBA person ID,
// and bio.json (the player list) has none, so the join key is the player
// ID of nba-player-data itself: its PLAYER name, unique in bio.json, with
// namesakes told apart there ("Kevin Porter (1950)" and "Kevin Porter",
// "Jabari Smith Sr" and "Jabari Smith"). Salary Season Finder uses exactly
// the same names (every shared name has the same draft year). Every source
// from another repo is joined on that key plus a check that the row fits
// the player's own life and career; a row that doesn't, or that two of our
// players could both claim, is dropped, never guessed:
//   - nba-career-map careers: the record's name or one of its aliases ("Kevin
//     Porter (1950)"). The record is not his if its birth year is more than
//     1 from his, or if every dated stint in it (NBA or not) ended before he
//     was 14 or started when he was 45 or older; if two records fit, the one
//     under his exact name; a record (one Wikipedia page) that fits two of
//     our players goes to neither. A club that ended before he was 14 never
//     counts. (Before this, the sons Jabari Smith, Kevin Porter, Santiago
//     Aldama and Walker Russell got their fathers' clubs abroad.)
//   - Salary Season Finder page links: see ssfPage below.
//   - Born & Died births: name and exact birth date; with no exact match,
//     the one Born & Died row of that name if its birth year is within 2
//     of his (a typo in one source), never one of two namesakes.
//   - nba-headshots: exact name, and its seasons must meet his.
//   - season honors and award votes (nba-player-data's own files): only in
//     a season from 3 before his first NBA season (ABA years) to his last;
//     combine: only a year from when he was 17 to his first NBA season.
const careerWindow = (span, y) => span && y >= span[0] - 3 && y <= span[1];
// "2000-2001", "2009", "2025–present" -> [from, to]; null if not dated so.
const stintYears = (h) => { const m = String(h.years || '').match(/^(\d{4})(?:\s*[-–]\s*(\d{4}|present))?$/); return m ? [+m[1], m[2] === 'present' ? 9999 : +(m[2] || m[1])] : null; };
// Can this Career Map record be the player born in year `by`?
export function careerFits(c, by) {
  const cy = /^\d{4}/.test(c.birth_date || '') ? +c.birth_date.slice(0, 4) : null;
  if (cy && by && Math.abs(cy - by) > 1) return false;
  const all = (c.career_history || []).map(stintYears).filter(Boolean);
  if (by && all.length && all.every(([f, t]) => t < by + 14 || f >= by + 45)) return false;
  return true;
}
// Born & Died birthplace for a bio.json row ({PLAYER, BIRTHDAY}), from rows
// [name, birth date, birthplace] grouped by normalized name.
export function birthplaceFor(byNorm, b) {
  const rows = byNorm.get(normName(b.PLAYER.replace(/ \(\d{4}\)$/, ''))) || [];
  const d = isoDate(b.BIRTHDAY);
  const exact = rows.filter((r) => d && r[1] === d);
  if (exact.length === 1) return exact[0][2];
  // A one-off typo in one of the two sources (a day or a year apart) is
  // still him if Born & Died has nobody else of that name.
  if (!exact.length && rows.length === 1 && (!d || !rows[0][1] || Math.abs(+rows[0][1].slice(0, 4) - +d.slice(0, 4)) <= 2)) return rows[0][2];
  return null;
}
export const birthRowsByName = (rows) => { const m = new Map(); for (const r of rows) { const k = normName(r[0]); (m.get(k) || m.set(k, []).get(k)).push(r); } return m; };

export function buildPlayers() {
  const bio = src('bio'), awards = src('awards'), rs = src('rsStats'), po = src('poStats');
  const ssf = src('ssf').seasons, slugs = src('slugs').slugs.player, careers = src('careers');
  // NBA seasons per nba-player-data name, [first, last], for the checks below.
  const span = new Map();
  for (const r of rs) if (+r.GP > 0) { const y = +r.YEAR, x = span.get(r.PLAYER); span.set(r.PLAYER, x ? [Math.min(x[0], y), Math.max(x[1], y)] : [y, y]); }
  const bioOf = new Map(bio.map((b) => [b.PLAYER, b]));
  const birthYear = (name) => { const d = isoDate(bioOf.get(name)?.BIRTHDAY); return d ? +d.slice(0, 4) : null; };
  // Headshots: Jorge's nba-headshots face-fill set, by exact name (recent
  // players only), and only if its seasons meet his (a 2020s Nate Williams
  // is not the 1970s one).
  const heads = new Map();
  for (const h of src('hsPlayers').players) {
    if (!h.headshot || !h.headshot.filename) continue;
    const sp = span.get(h.full_name);
    if (sp && h.seasons_from && h.seasons_to && (+h.seasons_to + 1 < sp[0] || +h.seasons_from + 1 > sp[1])) continue;
    heads.set(h.full_name, h.headshot.filename.replace(/\.png$/, ''));
  }
  // Born & Died: by name (a "(1950)" disambiguator off) and birth date.
  const bd = src('births');
  if (!Array.isArray(bd.rows)) throw new Error('.cache/sources/births.json is the old format: run node scripts/pull-data.mjs');
  const bdBy = birthRowsByName(bd.rows);
  const birthplaceOf = (b) => birthplaceFor(bdBy, b);

  // Salary Season Finder rows for college and draft pick: only rows whose
  // draft year agrees with bio.json's.
  const ssfBy = new Map();
  for (const s of ssf) {
    const dy = bioOf.get(s.player)?.DRAFT;
    if (s.draft_year && /^\d{4}$/.test(dy || '') && s.draft_year !== +dy) continue;
    if (!ssfBy.has(s.player) || (s.draft_pick && !ssfBy.get(s.player).draft_pick) || (s.college && !ssfBy.get(s.player).college)) ssfBy.set(s.player, s);
  }
  // Salary Season Finder pages: its slugs file keeps old keys, so "Bobby
  // Jones", "John Lucas" and "Nate Williams" all lead to a later namesake's
  // page (Bobby Jones (1984), John Lucas III, Jeenathan Williams). A slug is
  // his page only if he has salary rows there or his career reached 1990-91
  // (the site's first season).
  const ssfNames = new Set(ssf.map((r) => r.player));
  const ssfPage = (name) => !!slugs[name] && (ssfNames.has(name) || (span.get(name)?.[1] || 0) >= 1991);
  // Career Map records (see HOW SOURCES ARE JOINED above).
  const carNames = new Map();
  for (const c of careers) for (const k of new Set([c.player, ...(c.aliases || [])])) (carNames.get(k) || carNames.set(k, []).get(k)).push(c);
  const fitsCareer = (c, name) => careerFits(c, birthYear(name));
  const carBy = new Map(), claims = new Map();
  for (const b of bio) {
    let ok = (carNames.get(b.PLAYER) || []).filter((c) => fitsCareer(c, b.PLAYER));
    if (ok.length > 1) ok = ok.filter((c) => c.player === b.PLAYER);
    if (ok.length === 1) { carBy.set(b.PLAYER, ok[0]); const k = ok[0].wikipedia_url || ok[0]; claims.set(k, (claims.get(k) || 0) + 1); }
  }
  for (const [n, c] of carBy) if (claims.get(c.wikipedia_url || c) > 1) carBy.delete(n);

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
    // The id never moves (the Daily locks and the server use it), so it is
    // still made from the slug key as before; the page link is checked.
    const slug = slugs[b.PLAYER] || null;
    const link = ssfPage(b.PLAYER) ? `https://hoopsmatic.com/salary-season-finder/player/${slug}/`
      : c ? `https://hoopsmatic.com/nba-career-map/player/${slugify(c.player)}.html` : null;   // the Career Map page is named after its record
    const p = {
      id: slug || slugify(b.PLAYER), name: b.PLAYER, link, head: heads.get(b.PLAYER) || null,
      country: b.NATIONALITY || null,
      birthplace: birthplaceOf(b) || null,
      bornIn: birthCountry(birthplaceOf(b)),
      draftYear: /^\d{4}$/.test(b.DRAFT || '') ? +b.DRAFT : null,
      pick: s?.draft_pick || null, college,
      seasons: [], units: new Set(), gp: 0, min: 0,
      allStar: [], allRookie: [], allDefense: [], allNba: [], rings: [], aw: {},
      salary: {}, solo: {}, potw: [], clubs: [], payTop: [], earnings: 0, votes: [], medals: [], combine: null, highs: [],
      ht: inches(b.HEIGHT), wt: +b.WEIGHT || null,
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
    // reb is 0 before 1950-51 (not kept then); stat prompts only use rebounds from then on.
    p.seasons.push({ y, code: r.TEAM, unit, gp, min, pts: +r.PTS || 0, reb: +r.REB || 0, ast: +r.AST || 0,
      stl: +r.STL || 0, blk: +r.BLK || 0, tpm: +r['3P'] || 0 });
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
    // A season honor from outside his career is a namesake's (the 1965
    // All-Star Luke Jackson is not the 2005-08 one): it doesn't count.
    if (LIST[a.AWARD] && y && !careerWindow([p.firstYear, p.lastYear], y)) continue;
    p.aw[a.AWARD] = (p.aw[a.AWARD] || 0) + 1;
    if (a.AWARD === 'NBA Champion') {
      const t = champ[a.YEAR];
      if (!t || poTeam.get(p.name + '|' + a.YEAR) !== t) continue;
      const unit = unitOf(t, y);
      if (unit) p.rings.push({ y, unit });
    } else if (LIST[a.AWARD] && y) {
      p[LIST[a.AWARD]].push({ y, units: unitsIn(p, y) });
    } else if (SOLO[a.AWARD] && y) {
      (p.solo[SOLO[a.AWARD]] ??= []).push(y);
    } else if (a.AWARD === 'Player of the Week' && y) {
      // The team named on the award, matched to the era he played for it that season.
      const row = p.seasons.find((s) => s.y === y && unitInfo(s.unit).name === MERGE_NAME(a.TEAM));
      if (row) p.potw.push({ y, unit: row.unit });
    }
  }
  // Salaries (Salary Season Finder): the season's salary, by season ending
  // year, only for seasons already played (the data also lists future deals).
  for (const r of ssf) {
    const p = byName.get(r.player), y = +String(r.season).slice(0, 4) + 1;
    if (!p || !(r.salary > 0) || !p.seasons.some((x) => x.y === y)) continue;
    p.salary[y] = Math.max(p.salary[y] || 0, r.salary);
  }
  // Clubs outside the NBA (the Career Map's Wikipedia career histories):
  // G League teams (rules/gleague.json, from the year each joined) and pro
  // clubs outside the United States. [kind G|O, club, from, to, country].
  // Each record only for the player it was matched to above.
  for (const [name, c] of carBy) {
    const p = byName.get(name);
    if (!p) continue;
    const by = birthYear(name);
    for (const h of c.career_history || []) {
      if (NBA_NAMES.has(h.team)) continue;
      const sy = stintYears(h);
      if (!sy) continue;
      const [from, to] = sy;
      if (by && to < by + 14) continue;   // before he was 14: not his club
      const join = GLEAGUE[h.team];
      if (join !== undefined) { if (from >= join) p.clubs.push(['G', h.team, from, to, h.country || 'USA']); continue; }
      if (h.country && h.country !== 'USA') p.clubs.push(['O', h.team, from, to, h.country]);
    }
  }
  // Highest-paid player on a team in a season (Salary Season Finder's
  // salary_rank_team 1, single-team seasons only), and career earnings.
  for (const r of ssf) {
    const p = byName.get(r.player), y = +String(r.season).slice(0, 4) + 1;
    if (!p) continue;
    if (r.career_earnings > p.earnings && p.seasons.some((x) => x.y <= y)) p.earnings = r.career_earnings;
    if (r.salary_rank_team === 1 && !String(r.team).includes(',') && p.seasons.some((x) => x.y === y)) {
      const unit = unitOf(r.team, y);
      if (unit && p.seasons.some((x) => x.y === y && x.unit === unit)) p.payTop.push({ y, unit });
    }
  }
  // Award voting (nba-player-data awardVotes.json): [season, award, rank].
  for (const v of src('awardVotes')) {
    const p = byName.get(v.PLAYER), y = +v.YEAR;
    // Votes from outside his career are a namesake's (Tim Hardaway Jr.'s
    // votes are filed under "Tim Hardaway", his father's name here).
    if (!p || !y || !careerWindow([p.firstYear, p.lastYear], y)) continue;
    const award = v.AWARD === 'Sixth' ? 'Sixth Man' : v.AWARD;
    if (['MVP', 'DPOY', 'MIP', 'Sixth Man', 'ROY'].includes(award)) p.votes.push({ y, award, rank: +v.RNK || null, unit: unitsIn(p, y)[0] || null });
  }
  // Olympic and World Cup medals.
  for (const a of awards) if (/^(Olympic|World Cup) (Gold|Silver|Bronze)$/.test(a.AWARD)) { const p = byName.get(a['PLAYER / COACH']); if (p) p.medals.push(a.AWARD); }
  // Draft combine (nba-player-data combine-v3.json): wingspan, max vertical,
  // height without shoes (inches), combine year, standing reach.
  for (const c of src('combine')) {
    const p = byName.get(c.PLAYER), by = birthYear(c.PLAYER);
    if (!p) continue;
    // A combine before he was 17 or after his first NBA season is a
    // namesake's (the 2009 Tyler Smith is not the 2024 one).
    if (+c.YEAR && ((by && +c.YEAR < by + 17) || (p.firstYear && +c.YEAR > p.firstYear))) continue;
    const ws = inches(c.WINGSPAN), hn = inches(c['HEIGHT W/O SHOES'] || c['HEIGHT\u00a0W/O\u00a0SHOES']), mv = +c['MAX VERT'] || null;
    const reach = inches(c['STANDING REACH'] || c['STANDING\u00a0REACH']);
    if (ws || mv || hn || reach) p.combine = [ws, mv, hn, +c.YEAR || null, reach];
  }
  // Single-game highs (data/game-highs.json from aderoa/nba-boxscores). The
  // archive's team codes are the season's own (PHW); each is matched to the
  // era unit the player's season row has for that code's franchise.
  {
    const G = {};   // keyed by normalized name, so accents and punctuation never split a player
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(ROOT + 'data/game-highs.json', 'utf8')).highs)) {
      const [nm, y] = k.split('|'), key = normName(nm.replace(SUFFIX, '')) + '|' + y;
      G[key] = G[key] ? { ...G[key], ...v } : v;
    }
    // box code + season -> unit, learned from players with one team that season
    const vote = new Map();
    for (const p of players) {
      const bySeason = new Map();
      for (const x of p.seasons) (bySeason.get(x.y) || bySeason.set(x.y, []).get(x.y)).push(x.unit);
      for (const [y, us] of bySeason) {
        if (new Set(us).size !== 1) continue;
        const g = G[normName(p.name.replace(/ \(\d{4}\)$/, '').replace(SUFFIX, '')) + '|' + y];
        if (!g || Object.keys(g).length !== 1) continue;
        const k = Object.keys(g)[0] + '|' + y, m = vote.get(k) || vote.set(k, new Map()).get(k);
        m.set(us[0], (m.get(us[0]) || 0) + 1);
      }
    }
    const codeUnit = new Map([...vote].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
    // Box rows by season and unit: [name key, last name, highs].
    const boxBy = new Map();
    for (const [key, g] of Object.entries(G)) {
      const [nk, y] = key.split('|');
      for (const [code, h] of Object.entries(g)) {
        const unit = codeUnit.get(code + '|' + y);
        if (!unit) continue;
        const k2 = unit + '|' + y;
        (boxBy.get(k2) || boxBy.set(k2, []).get(k2)).push({ nk, h, used: false });
      }
    }
    const lastOf = (n) => normName(n.replace(/ \(\d{4}\)$/, '').replace(SUFFIX, '').split(' ').pop());
    const pending = [];
    // 1. exact (normalized) name, same season, same era unit
    for (const p of players) {
      const nk = normName(p.name.replace(/ \(\d{4}\)$/, '').replace(SUFFIX, ''));
      for (const x of p.seasons) {
        const rows = boxBy.get(x.unit + '|' + x.y) || [];
        const r = rows.find((z) => z.nk === nk && !z.used);
        if (r) { r.used = true; p.highs.push({ y: x.y, unit: x.unit, h: r.h }); } else pending.push([p, x]);
      }
    }
    // 2. a name spelled differently (Sasha / Aleksandar Pavlovic): the one
    //    unmatched box row of that team-season with the same last name.
    for (const [p, x] of pending) {
      const rows = (boxBy.get(x.unit + '|' + x.y) || []).filter((z) => !z.used && z.nk.endsWith(lastOf(p.name)));
      if (rows.length === 1) { rows[0].used = true; p.highs.push({ y: x.y, unit: x.unit, h: rows[0].h }); x.matched = true; }
    }
    // 3. what's left of a team-season pairs up when exactly one player and
    //    one box row remain (Dennis Schroeder / Schröder).
    const left = new Map();
    for (const [p, x] of pending) if (!x.matched && !p.highs.some((h) => h.y === x.y && h.unit === x.unit)) (left.get(x.unit + '|' + x.y) || left.set(x.unit + '|' + x.y, []).get(x.unit + '|' + x.y)).push([p, x]);
    for (const [k, ours] of left) {
      const rows = (boxBy.get(k) || []).filter((z) => !z.used);
      if (ours.length === 1 && rows.length === 1) { rows[0].used = true; ours[0][0].highs.push({ y: ours[0][1].y, unit: ours[0][1].unit, h: rows[0].h }); }
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
