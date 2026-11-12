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

export function buildPlayers() {
  const bio = src('bio'), awards = src('awards'), rs = src('rsStats'), po = src('poStats');
  const ssf = src('ssf').seasons, slugs = src('slugs').slugs.player, careers = src('careers');
  // Headshots: Jorge's nba-headshots face-fill set, by exact name (recent players only).
  const heads = new Map(src('hsPlayers').players.filter((h) => h.headshot && h.headshot.filename).map((h) => [h.full_name, h.headshot.filename.replace(/\.png$/, '')]));
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
      id: slug || slugify(b.PLAYER), name: b.PLAYER, link, head: heads.get(b.PLAYER) || null,
      country: b.NATIONALITY || null,
      birthplace: births.get(normName(b.PLAYER)) || null,
      bornIn: birthCountry(births.get(normName(b.PLAYER))),
      draftYear: /^\d{4}$/.test(b.DRAFT || '') ? +b.DRAFT : null,
      pick: s?.draft_pick || null, college,
      seasons: [], units: new Set(), gp: 0, min: 0,
      allStar: [], allRookie: [], allDefense: [], allNba: [], rings: [], aw: {},
      salary: {}, solo: {}, potw: [], clubs: [], payTop: [], earnings: 0, votes: [], medals: 0, combine: null, highs: [],
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
  for (const c of careers) {
    const p = byName.get(c.player);
    if (!p) continue;
    for (const h of c.career_history || []) {
      if (NBA_NAMES.has(h.team)) continue;
      const m = String(h.years || '').match(/^(\d{4})(?:\s*[-–]\s*(\d{4}|present))?$/);
      if (!m) continue;
      const from = +m[1], to = m[2] === 'present' ? 9999 : +(m[2] || m[1]);
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
    if (!p || !y) continue;
    const award = v.AWARD === 'Sixth' ? 'Sixth Man' : v.AWARD;
    if (['MVP', 'DPOY', 'MIP', 'Sixth Man', 'ROY'].includes(award)) p.votes.push({ y, award, rank: +v.RNK || null, unit: unitsIn(p, y)[0] || null });
  }
  // Olympic and World Cup medals.
  for (const a of awards) if (/^(Olympic|World Cup) (Gold|Silver|Bronze)$/.test(a.AWARD)) { const p = byName.get(a['PLAYER / COACH']); if (p) p.medals++; }
  // Draft combine (nba-player-data combine-v3.json): wingspan, max vertical,
  // height without shoes (inches), combine year.
  for (const c of src('combine')) {
    const p = byName.get(c.PLAYER);
    if (!p) continue;
    const ws = inches(c.WINGSPAN), hn = inches(c['HEIGHT W/O SHOES'] || c['HEIGHT\u00a0W/O\u00a0SHOES']), mv = +c['MAX VERT'] || null;
    if (ws || mv || hn) p.combine = [ws, mv, hn, +c.YEAR || null];
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
