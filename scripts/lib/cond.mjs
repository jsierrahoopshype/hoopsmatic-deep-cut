// Deep Cut prompt conditions: one evaluator for the build and the server.
// Pure, data-only; the Deep Cut server (hoopsmatic-worker deep-cut-server/src/
// cond.js) keeps an exact copy, so "valid", the evidence shown and "which
// condition failed" are worked out the same way everywhere.
//
// FACTS (data/facts.json, built by scripts/generate-prompts.mjs):
//   { v, asOf, units: [{ id, name, short, code, from, to }],
//     players: [{ i: id, n: name, c: college|null, cn: college display|null,
//                 b: birth country|null, bp: birthplace|null,
//                 f: first season, l: last season, d: draft class|null, k: pick|null,
//                 g: career regular-season games,
//                 s: [[season, unit#, games, points, rebounds, assists, steals, blocks, threes made]],
//                 r: [[season, unit#]] titles, a: { allStar|allRookie|allDefense|allNba: [[season, unit#]] } }] }
//   Seasons are stored by ending year (1997 = 1996-97). unit# indexes units.
//
// ELIGIBILITY (Jorge, Nov 12, 2026):
//   - regular-season games only, at least 1 game played (appearances, not
//     roster spots: the data has no roster-only rows);
//   - titles: on the title team and played at least 1 playoff game for it
//     that season;
//   - team names exactly as they were that season (units);
//   - season awards count for the team he played the most regular-season
//     games for that season;
//   - the current season counts as of the weekly data refresh.
//
// CONDITIONS
//   { t: 'teams', u: [a, b] }        played for both
//   { t: 'mate', p: id, u }          played for u in a season the star p did
//   { t: 'ring', u }                 won a title with u
//   { t: 'award', a, u }             a in allStar | allRookie | allDefense | allNba, with u
//   { t: 'born', c, u }              born in country c, played for u
//   { t: 'bornout', u }              born outside the United States, played for u
//   { t: 'start', d, u }             first season started in decade d, played for u
//   { t: 'college', c, u }           college c, played for u
//   { t: 'colstart', c, d }          college c, first season started in decade d
//   { t: 'colstar', c }              college c, at least one All-Star selection
//   { t: 'top10', u }                top-10 pick in the 1990-2025 drafts, played for u
//   { t: 'stat', k, v, u }           a season averaging v+ of k (ppg|rpg|apg|spg|bpg|tpg)
//                                    with 40+ games for u that season
//
// evaluate(cond, player, F) -> { ok, link, ev: [text], fail: text|null }
//   link = the games behind the qualifying connection (scoring, score.mjs);
//   ev   = the exact qualifying evidence (seasons, games, the stat line);
//   fail = which condition failed, in plain words.
// F = { units: [...], byId: Map(id -> player) } (index(facts) builds it).

export const STAT_MIN_GAMES = 40;
const STAT = {
  ppg: { col: 3, word: 'points' },
  rpg: { col: 4, word: 'rebounds', from: 1951 },   // rebounds are kept from 1950-51 on
  apg: { col: 5, word: 'assists' },
  spg: { col: 6, word: 'steals', from: 1974 },          // steals and blocks from 1973-74
  bpg: { col: 7, word: 'blocks', from: 1974 },
  tpg: { col: 8, word: 'three-pointers', from: 1980 },  // the three-point line, 1979-80
};
const AWARD = { allStar: 'an All-Star team', allRookie: 'an All-Rookie team', allDefense: 'an All-Defensive team', allNba: 'an All-NBA team' };

export function index(facts) {
  return { units: facts.units, byId: new Map(facts.players.map((p) => [p.i, p])), asOf: facts.asOf || null };
}

export const seasonLabel = (y) => `${y - 1}-${String(y).slice(2)}`;
const decadeOf = (p) => Math.floor((p.f - 1) / 10) * 10;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// "1996-97 to 1998-99, 2003-04" from a list of seasons.
export function seasonsText(years) {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  const runs = [];
  for (const y of ys) {
    const last = runs[runs.length - 1];
    if (last && y === last[1] + 1) last[1] = y; else runs.push([y, y]);
  }
  return runs.map(([a, b]) => (a === b ? seasonLabel(a) : `${seasonLabel(a)} to ${seasonLabel(b)}`)).join(', ');
}

function stint(p, u) {
  const rows = p.s.filter((s) => s[1] === u);
  return { rows, games: rows.reduce((a, s) => a + s[2], 0), years: rows.map((s) => s[0]) };
}
function stintText(F, p, u) {
  const st = stint(p, u);
  return `${F.units[u].short} ${seasonsText(st.years)} (${plural(st.games, 'game')})`;
}
// Played for the same franchise under another era's name?
function otherEra(F, p, u) {
  const code = F.units[u].code;
  const other = [...new Set(p.s.filter((s) => s[1] !== u && F.units[s[1]].code === code).map((s) => s[1]))];
  return other.length ? F.units[other[0]].name : null;
}
function teamFail(F, p, u) {
  const o = otherEra(F, p, u);
  return o ? `Played for the ${o}, not the ${F.units[u].name} (a different era name).` : `Never played a regular-season game for the ${F.units[u].name}.`;
}

export function evaluate(c, p, F) {
  const no = (fail) => ({ ok: false, link: 0, ev: [], fail });
  const has = (u) => p.s.some((s) => s[1] === u);
  switch (c.t) {
    case 'teams': {
      const [a, b] = c.u, ha = has(a), hb = has(b);
      if (!ha && !hb) {
        const oa = otherEra(F, p, a), ob = otherEra(F, p, b);
        return no(oa || ob ? `${oa ? teamFail(F, p, a) : ''} ${ob ? teamFail(F, p, b) : ''}`.trim() : `Never played for the ${F.units[a].short} or the ${F.units[b].short}.`);
      }
      if (!ha) return no(`Played for the ${F.units[b].short}. ${teamFail(F, p, a)}`);
      if (!hb) return no(`Played for the ${F.units[a].short}. ${teamFail(F, p, b)}`);
      return { ok: true, link: Math.min(stint(p, a).games, stint(p, b).games), ev: [stintText(F, p, a), stintText(F, p, b)], fail: null };
    }
    case 'mate': {
      const star = F.byId.get(c.p);
      if (p.i === c.p) return no(`That's ${star.n} himself.`);
      if (!has(c.u)) return no(teamFail(F, p, c.u));
      const starYears = new Set(star.s.filter((s) => s[1] === c.u).map((s) => s[0]));
      const rows = p.s.filter((s) => s[1] === c.u && starYears.has(s[0]));
      if (!rows.length) return no(`Played for the ${F.units[c.u].short} (${seasonsText(stint(p, c.u).years)}), but never in the same season as ${star.n}.`);
      const g = rows.reduce((a, s) => a + s[2], 0);
      return { ok: true, link: g, ev: [`${F.units[c.u].short} ${seasonsText(rows.map((s) => s[0]))} with ${star.n} (${plural(g, 'game')})`], fail: null };
    }
    case 'ring': {
      const rings = p.r.filter((r) => r[1] === c.u);
      if (!rings.length) {
        if (!has(c.u)) return no(teamFail(F, p, c.u) + (p.r.length ? ` His title came with the ${F.units[p.r[0][1]].name}.` : ''));
        return no(`Played for the ${F.units[c.u].short} but never won a title with them (title team plus at least 1 playoff game for them that season).`);
      }
      return { ok: true, link: stint(p, c.u).games, ev: [`Title${rings.length > 1 ? 's' : ''} ${rings.map((r) => r[0]).join(', ')} with the ${F.units[c.u].short}`, stintText(F, p, c.u)], fail: null };
    }
    case 'award': {
      const list = (p.a[c.a] || []);
      const mine = list.filter((x) => x[1] === c.u);
      if (!mine.length) {
        if (list.length) return no(`Made ${AWARD[c.a]} with the ${F.units[list[0][1]].name}, not the ${F.units[c.u].name} (the team he played most games for that season counts).`);
        return no(`Never made ${AWARD[c.a]}.`);
      }
      return { ok: true, link: stint(p, c.u).games, ev: [`${AWARD[c.a].replace(/^an? /, '')}: ${mine.map((x) => seasonLabel(x[0])).join(', ')} with the ${F.units[c.u].short}`, stintText(F, p, c.u)], fail: null };
    }
    case 'born':
    case 'bornout': {
      const want = c.t === 'born' ? (p.b === c.c) : (p.b && p.b !== 'United States');
      if (!p.b) return no('His birthplace is not in the data.');
      if (!want) return no(c.t === 'born' ? `Born in ${p.bp}, not in ${c.c}.` : `Born in ${p.bp}, inside the United States.`);
      if (!has(c.u)) return no(`Born in ${p.bp}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`Born in ${p.bp}`, stintText(F, p, c.u)], fail: null };
    }
    case 'start': {
      const d = decadeOf(p);
      if (d !== c.d) return no(`His first NBA season was ${seasonLabel(p.f)}, not in the ${c.d}s.`);
      if (!has(c.u)) return no(`Started in ${seasonLabel(p.f)}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`First NBA season ${seasonLabel(p.f)}`, stintText(F, p, c.u)], fail: null };
    }
    case 'college': {
      if (p.c !== c.c) return no(p.cn ? `Went to ${p.cn}, not ${c.cn}.` : `No college in the data for him.`);
      if (!has(c.u)) return no(`Went to ${p.cn}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`College: ${p.cn}`, stintText(F, p, c.u)], fail: null };
    }
    case 'colstart': {
      if (p.c !== c.c) return no(p.cn ? `Went to ${p.cn}, not ${c.cn}.` : `No college in the data for him.`);
      if (decadeOf(p) !== c.d) return no(`Went to ${p.cn}, but his first NBA season was ${seasonLabel(p.f)}, not in the ${c.d}s.`);
      return { ok: true, link: p.g, ev: [`College: ${p.cn}`, `First NBA season ${seasonLabel(p.f)} (${plural(p.g, 'career game')})`], fail: null };
    }
    case 'colstar': {
      if (p.c !== c.c) return no(p.cn ? `Went to ${p.cn}, not ${c.cn}.` : `No college in the data for him.`);
      const as = p.a.allStar || [];
      if (!as.length) return no(`Went to ${p.cn}, but never made an All-Star team.`);
      return { ok: true, link: p.g, ev: [`College: ${p.cn}`, `All-Star ${as.map((x) => seasonLabel(x[0])).join(', ')}`], fail: null };
    }
    case 'top10': {
      if (!(p.d >= 1990 && p.d <= 2025 && p.k && p.k <= 10)) return no(p.k ? `Pick ${p.k} in the ${p.d} draft, not a top-10 pick.` : `Not a top-10 pick in the 1990 to 2025 drafts.`);
      if (!has(c.u)) return no(`No. ${p.k} pick in ${p.d}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`No. ${p.k} pick, ${p.d} draft`, stintText(F, p, c.u)], fail: null };
    }
    case 'stat': {
      const m = STAT[c.k];
      if (!has(c.u)) return no(teamFail(F, p, c.u));
      const rows = p.s.filter((s) => s[1] === c.u && (!m.from || s[0] >= m.from));
      const q = rows.filter((s) => s[2] >= STAT_MIN_GAMES && s[m.col] / s[2] >= c.v);
      if (!q.length) {
        const best = rows.filter((s) => s[2] >= STAT_MIN_GAMES).sort((a, b) => b[m.col] / b[2] - a[m.col] / a[2])[0];
        return no(best ? `Best season for the ${F.units[c.u].short} with ${STAT_MIN_GAMES}+ games: ${(best[m.col] / best[2]).toFixed(1)} ${m.word} a game (${seasonLabel(best[0])}).`
          : `Never played ${STAT_MIN_GAMES}+ regular-season games in a season for the ${F.units[c.u].short}.`);
      }
      return { ok: true, link: q.reduce((a, s) => a + s[2], 0),
        ev: q.map((s) => `${(s[m.col] / s[2]).toFixed(1)} ${m.word} a game, ${seasonLabel(s[0])} (${plural(s[2], 'game')})`), fail: null };
    }
    default: return no('Unknown prompt.');
  }
}

// The eligibility note shown beside a prompt, before anyone submits.
export function ruleText(c, F) {
  const parts = ['Regular-season games only, at least 1 game played.'];
  const us = c.u === undefined ? [] : Array.isArray(c.u) ? c.u : [c.u];
  for (const u of us) {
    const others = F.units.filter((x) => x.code === F.units[u].code && x.id !== F.units[u].id).map((x) => x.name);
    if (others.length) parts.push(`The ${F.units[u].name} only, not the ${[...new Set(others)].join(' or the ')}.`);
  }
  if (c.t === 'ring') parts[0] = 'On the title team and played at least 1 playoff game for them that season.';
  if (c.t === 'mate') parts.push('Same team in the same season.');
  if (c.t === 'award') parts.push('The award counts for the team he played the most games for that season.');
  if (c.t === 'stat') parts.push(`A single season with ${STAT_MIN_GAMES}+ games for them${STAT[c.k].from ? ` (${STAT[c.k].word} are recorded from ${seasonLabel(STAT[c.k].from)})` : ''}.`);
  if (c.t === 'born' || c.t === 'bornout') parts.push('Birthplace, not nationality. U.S. territories count as outside the United States.');
  if (c.t === 'start' || c.t === 'colstart') parts.push(`His first NBA season started in the ${c.d}s.`);
  if (c.t === 'top10') parts.push('Picks 1 to 10 in the 1990 to 2025 drafts.');
  return parts.join(' ');
}
