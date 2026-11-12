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
//                 r: [[season, unit#]] titles, a: { allStar|allRookie|allDefense|allNba: [[season, unit#]] },
//                 $: [[season, salary $M]], w: { roy|smoy|mip|dpoy|asmvp: [season] },
//                 pw: [[season, unit#]] Player of the Week, x: [[G|O, club, from, to, country]],
//                 ht: listed height (in), cb: [wingspan, max vertical, height w/o shoes, year, reach] | null,
//                 vt: [[season, award, rank, unit#]], md: medals, pt: [[season, unit#]] highest-paid,
//                 ce: career earnings $M, gh: [[season, unit#, pts, reb, ast, threes, triple-doubles,
//                 40+ games, 50+ games, 20-20 games, steals, blocks]] (box-score highs) } ] }
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
//   { t: 'roster', u, y }            played for u in season y (1+ regular-season game)
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
//   { t: 'salary', v, u }            a salary of $v million+ in a season he played for u
//   { t: 'bornin', pl, pn, u? }      born in city or U.S. state pl ("Chicago, Illinois",
//                                    "Texas"; pn = its short name), played for u (or
//                                    any NBA game in the seasons that count)
//   { t: 'solo', a }                 won a single-winner award a (roy|smoy|mip|dpoy|asmvp)
//   { t: 'potw', u }                 a Player of the Week award with u
//   { t: 'abroad', c?, u? }          a pro club outside the U.S. (in country c) that ended
//                                    before his first NBA season; played for u
//   { t: 'gleague', u }              a G League (D-League) team, and played for u
//   { t: 'points', v, u }            v+ regular-season points, played for u
//   { t: 'height', ge|le: inches, u }  listed height (bio) at least / at most, played for u
//   { t: 'combine', k: ws|vert|hgt|reach, v, u? }  draft combine wingspan, max vertical or height
//                                    without shoes of v inches or more (2000 on)
//   { t: 'pick', lo, hi, u }         drafted with pick lo to hi, played for u
//   { t: 'votes', a, top?, u }       received votes for award a (MVP|DPOY|MIP|Sixth Man|ROY),
//                                    finishing top-N if top, as a member of u
//   { t: 'allany', a, u }            made an allStar|allNba|allDefense team (any team), played for u
//   { t: 'medal', u }                won an Olympic or World Cup medal, played for u
//   { t: 'ringany', u }              won a title with any team, played for u
//   No team at all (Jorge, Nov 13: headline questions):
//   { t: 'mateany', p }              a teammate of star p (same team, same season)
//   { t: 'statany', k, v }           a season averaging v+ of k with 40+ games for one team
//   { t: 'gameany', k, v }           a regular-season game with v+ of k (pts|reb|ast|tpm), or
//                                    k = 'p2020' (20+ points and 20+ rebounds), or a career
//                                    count of v+ games of kind k = 'td'|'n40'|'n50'
//   { t: 'salaryany', v } / { t: 'earnany', v }  a $v M+ season / career
//   { t: 'votesany', a, top? }       received votes for award a (top-N if top)
//   { t: 'heightany', ge|le }        listed height
//   { t: 'collegeany', c, cn }       went to college c
//   { t: 'bornc', c }                born in country c
//   { t: 'class', y }                drafted in the y draft
//   { t: 'debut', y }                first NBA season y
//   { t: 'career', k, v }            v+ career regular-season k (pts|reb|ast|stl|blk|tpm|g)
//   { t: 'count', k, v }             v+ allStar|allNba|allDefense selections, rings, franchises or seasons
//   { t: 'medalkind', kind }         an Olympic Gold|Silver|Bronze or World Cup ... medal (kind: 'Olympic', 'Olympic Gold', ...)
//   { t: 'abroadafter', c }          a pro club in country c that started after his NBA debut
//   { t: 'club', name, c }           played for club name (country c), any time, in his career history
//   { t: 'game', k: pts|reb|ast|tpm|td, v, u }  a regular-season game with v+ of k for u
//                                    (td: a triple-double)
//   { t: 'paytop', u }               the highest-paid player on u in a season
//   { t: 'earn', v, u }              career earnings of $v million+, played for u
//   NO HIDDEN CONDITIONS (Jorge, Nov 13, 2026): every player who fits the plain
//   wording counts, whatever the season. An optional m (only seasons from m
//   on) is still understood for old locks but no new question uses it.
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
const SOLO = { roy: 'Rookie of the Year', smoy: 'Sixth Man of the Year', mip: 'Most Improved Player', dpoy: 'Defensive Player of the Year', asmvp: 'All-Star MVP' };
export const SOLO_NAMES = SOLO;
const ft = (i) => `${Math.floor(i / 12)}-${Math.round((i % 12) * 100) / 100}`;
const ordinal = (n) => (!n ? 'votes' : n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'));
const VOTE_NAME = { MVP: 'MVP', DPOY: 'Defensive Player of the Year', MIP: 'Most Improved Player', 'Sixth Man': 'Sixth Man of the Year', ROY: 'Rookie of the Year' };
const GAME_WORD = { pts: 'points', reb: 'rebounds', ast: 'assists', tpm: 'threes', td: 'triple-doubles', stl: 'steals', blk: 'blocks' };
const money = (v) => '$' + (v >= 10 ? Math.floor(v) : v.toFixed(1)) + 'M';
const clubText = (x) => `${x[1]}${x[0] === 'O' ? ` (${x[4]})` : ' (G League)'} ${x[2] === x[3] ? x[2] : x[2] + '-' + (x[3] === 9999 ? 'present' : x[3])}`;
const pts = (n) => n.toLocaleString('en-US');
// Only seasons from m on (see CONDITIONS).
function windowed(p, m) {
  const a = {};
  for (const [k, v] of Object.entries(p.a || {})) a[k] = v.filter((x) => x[0] >= m);
  const w = {};
  for (const [k, v] of Object.entries(p.w || {})) w[k] = v.filter((y) => y >= m);
  return { ...p, s: p.s.filter((x) => x[0] >= m), r: p.r.filter((x) => x[0] >= m), a, w,
    $: (p.$ || []).filter((x) => x[0] >= m), pw: (p.pw || []).filter((x) => x[0] >= m), x: (p.x || []).filter((x) => x[0] !== 'G' || x[3] >= m - 1) };
}
const AWARD = { allStar: 'an All-Star team', allRookie: 'an All-Rookie team', allDefense: 'an All-Defensive team', allNba: 'an All-NBA team' };

export function index(facts) {
  return { units: facts.units, byId: new Map(facts.players.map((p) => [p.i, p])), asOf: facts.asOf || null, boxThrough: facts.boxThrough || null };
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
  if (!c.m) return evalCore(c, p, F);
  const r = evalCore(c, windowed(p, c.m), F);
  if (!r.ok && evalCore(c, p, F).ok) return { ...r, fail: `Only before ${seasonLabel(c.m)}. This question counts ${seasonLabel(c.m)} and later.` };
  return r;
}
function evalCore(c, p, F) {
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
    case 'roster': {
      const rows = p.s.filter((s) => s[1] === c.u && s[0] === c.y);
      if (!rows.length) {
        if (!has(c.u)) return no(teamFail(F, p, c.u));
        return no(`Played for the ${F.units[c.u].short} (${seasonsText(stint(p, c.u).years)}), but not in ${seasonLabel(c.y)}.`);
      }
      const g = rows.reduce((a, s) => a + s[2], 0);
      return { ok: true, link: g, ev: [`${F.units[c.u].short} ${seasonLabel(c.y)} (${plural(g, 'game')})`], fail: null };
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
    case 'salary': {
      const sal = p.$ || [];
      const big = sal.filter((x) => x[1] >= c.v);
      if (!big.length) {
        const top = [...sal].sort((a, b) => b[1] - a[1])[0];
        return no(top ? `His top salary was ${money(top[1])} (${seasonLabel(top[0])}), under ${money(c.v)}.` : 'No salary in the data for him (salaries are kept from 1990-91).');
      }
      const rows = p.s.filter((x) => x[1] === c.u && big.some((b) => b[0] === x[0]));
      if (!rows.length) return no(has(c.u) ? `Earned ${money(c.v)}+ in ${seasonsText(big.map((b) => b[0]))}, but not in a season he played for the ${F.units[c.u].short}.` : teamFail(F, p, c.u));
      const g = rows.reduce((a, x) => a + x[2], 0);
      return { ok: true, link: g, ev: rows.map((x) => `${money(big.find((b) => b[0] === x[0])[1])} in ${seasonLabel(x[0])}, ${plural(x[2], 'game')} for the ${F.units[c.u].short}`), fail: null };
    }
    case 'bornin': {
      if (!p.bp) return no('His birthplace is not in the data.');
      const hit = p.bp === c.pl || p.bp.endsWith(', ' + c.pl);
      if (!hit) return no(`Born in ${p.bp}, not in ${c.pn}.`);
      if (c.u === undefined) {
        if (!p.s.length) return no(`Born in ${p.bp}, but no NBA game in the seasons that count.`);
        return { ok: true, link: p.s.reduce((a, x) => a + x[2], 0), ev: [`Born in ${p.bp}`, `NBA seasons ${seasonsText(p.s.map((x) => x[0]))}`], fail: null };
      }
      if (!has(c.u)) return no(`Born in ${p.bp}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`Born in ${p.bp}`, stintText(F, p, c.u)], fail: null };
    }
    case 'solo': {
      const ys = (p.w || {})[c.a] || [];
      if (!ys.length) return no(`Never won ${SOLO[c.a]}.`);
      return { ok: true, link: p.g, ev: [`${SOLO[c.a]} ${ys.map(seasonLabel).join(', ')}`, `${plural(p.g, 'career game')}`], fail: null };
    }
    case 'potw': {
      const mine = (p.pw || []).filter((x) => x[1] === c.u);
      if (!mine.length) {
        if (!has(c.u)) return no(teamFail(F, p, c.u));
        return no((p.pw || []).length ? `His Player of the Week awards came with another team.` : `Never won a Player of the Week award.`);
      }
      return { ok: true, link: stint(p, c.u).games, ev: [`Player of the Week with the ${F.units[c.u].short}: ${seasonsText(mine.map((x) => x[0]))}`, stintText(F, p, c.u)], fail: null };
    }
    case 'abroad': {
      const abroad = (p.x || []).filter((x) => x[0] === 'O');
      const before = abroad.filter((x) => x[3] <= p.f - 1);
      const want = c.c ? before.filter((x) => x[4] === c.c) : before;
      if (!want.length) {
        if (c.c && before.length) return no(`Played abroad before the NBA in ${[...new Set(before.map((x) => x[4]))].join(' and ')}, not ${c.c}.`);
        if (abroad.length) return no(`His clubs outside the U.S. came after his NBA debut (${seasonLabel(p.f)}).`);
        return no('No pro club outside the United States in his career history.');
      }
      if (c.u !== undefined && !has(c.u)) return no(`${clubText(want[0])}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: c.u !== undefined ? stint(p, c.u).games : p.g,
        ev: [...want.slice(0, 3).map(clubText), `First NBA season ${seasonLabel(p.f)}`, ...(c.u !== undefined ? [stintText(F, p, c.u)] : [])], fail: null };
    }
    case 'gleague': {
      const g = (p.x || []).filter((x) => x[0] === 'G');
      if (!g.length) return no(has(c.u) ? `Played for the ${F.units[c.u].short}, but no G League team in his career history.` : 'No G League team in his career history.');
      if (!has(c.u)) return no(`${clubText(g[0])}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [...g.slice(0, 3).map(clubText), stintText(F, p, c.u)], fail: null };
    }
    case 'points': {
      const total = p.s.reduce((a, x) => a + x[3], 0);
      if (total < c.v) return no(`${pts(total)} regular-season points, under ${pts(c.v)}.`);
      if (!has(c.u)) return no(`${pts(total)} points. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`${pts(total)} regular-season points`, stintText(F, p, c.u)], fail: null };
    }
    case 'height': {
      if (!p.ht) return no('His height is not in the data.');
      const fits = c.ge ? p.ht >= c.ge : p.ht <= c.le;
      if (!fits) return no(`Listed at ${ft(p.ht)}, not ${c.ge ? ft(c.ge) + ' or taller' : ft(c.le) + ' or shorter'}.`);
      if (!has(c.u)) return no(`Listed at ${ft(p.ht)}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`Listed at ${ft(p.ht)}`, stintText(F, p, c.u)], fail: null };
    }
    case 'combine': {
      const cb = p.cb, i = { ws: 0, vert: 1, hgt: 2, reach: 4 }[c.k], label = { ws: 'wingspan', vert: 'max vertical', hgt: 'height without shoes', reach: 'standing reach' }[c.k];
      if (!cb || cb[i] == null) return no(`No ${label} at the draft combine for him in the data.`);
      if (cb[i] < c.v) return no(`${label[0].toUpperCase() + label.slice(1)} at the ${cb[3]} combine: ${c.k === 'vert' ? cb[i] + ' in' : ft(cb[i])}.`);
      if (c.u !== undefined && !has(c.u)) return no(`${label}: ${c.k === 'vert' ? cb[i] + ' in' : ft(cb[i])}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: c.u !== undefined ? stint(p, c.u).games : p.g,
        ev: [`${cb[3]} combine ${label}: ${c.k === 'vert' ? cb[i] + ' in' : ft(cb[i])}`, ...(c.u !== undefined ? [stintText(F, p, c.u)] : [])], fail: null };
    }
    case 'pick': {
      if (!(p.k >= c.lo && p.k <= c.hi)) return no(p.k ? `Pick ${p.k} in the ${p.d} draft.` : 'No draft pick in the data for him (undrafted, or not recorded).');
      if (!has(c.u)) return no(`Pick ${p.k} in ${p.d}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`No. ${p.k} pick, ${p.d} draft`, stintText(F, p, c.u)], fail: null };
    }
    case 'votes': {
      const all = (p.vt || []).filter((v) => v[1] === c.a && (!c.top || (v[2] && v[2] <= c.top)));
      const mine = all.filter((v) => v[3] === c.u);
      if (!mine.length) {
        if (all.length) return no(`His ${VOTE_NAME[c.a]} votes came with the ${F.units[all[0][3]] ? F.units[all[0][3]].name : 'another team'}.`);
        return no(c.top ? `Never finished in the top ${c.top} of ${VOTE_NAME[c.a]} voting.` : `Never received ${VOTE_NAME[c.a]} votes.`);
      }
      return { ok: true, link: stint(p, c.u).games, ev: [...mine.map((v) => `${VOTE_NAME[c.a]} voting ${seasonLabel(v[0])}: ${ordinal(v[2])}`), stintText(F, p, c.u)], fail: null };
    }
    case 'allany': {
      const list = p.a[c.a] || [];
      if (!list.length) return no(`Never made ${AWARD[c.a]}.`);
      if (!has(c.u)) return no(`${AWARD[c.a].replace(/^an? /, '')}: ${list.map((x) => seasonLabel(x[0])).join(', ')}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`${AWARD[c.a].replace(/^an? /, '')}: ${list.map((x) => seasonLabel(x[0])).join(', ')}`, stintText(F, p, c.u)], fail: null };
    }
    case 'ringany': {
      if (!p.r.length) return no('Never won an NBA title (on the title team with at least 1 playoff game for them).');
      if (!has(c.u)) return no(`Titles: ${p.r.map((r) => r[0]).join(', ')}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`Title${p.r.length > 1 ? 's' : ''}: ${p.r.map((r) => `${seasonLabel(r[0])} ${F.units[r[1]].short}`).join(', ')}`, stintText(F, p, c.u)], fail: null };
    }
    case 'medal': {
      const md = Array.isArray(p.md) ? p.md.length : p.md || 0;
      if (!md) return no('No Olympic or World Cup medal in the data.');
      if (!has(c.u)) return no(`${plural(md, 'medal')}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`Olympic/World Cup medals: ${Array.isArray(p.md) ? p.md.join(', ') : md}`, stintText(F, p, c.u)], fail: null };
    }
    case 'game': {
      const col = { pts: 2, reb: 3, ast: 4, tpm: 5, td: 6 }[c.k];
      const rows = (p.gh || []).filter((g) => g[1] === c.u);
      const hit = rows.filter((g) => (c.k === 'td' ? g[6] > 0 : g[col] >= c.v));
      if (!hit.length) {
        if (!has(c.u)) return no(teamFail(F, p, c.u));
        const best = Math.max(0, ...rows.map((g) => g[col]));
        return no(c.k === 'td' ? `No triple-double for the ${F.units[c.u].short} in the box scores.` : `His best for the ${F.units[c.u].short}: ${best} ${GAME_WORD[c.k]}.`);
      }
      const ev = c.k === 'td' ? hit.map((g) => `${plural(g[6], 'triple-double')} in ${seasonLabel(g[0])}`) : hit.map((g) => `${g[col]} ${GAME_WORD[c.k]} in ${seasonLabel(g[0])}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`${F.units[c.u].short} high${hit.length > 1 ? 's' : ''}: ${ev.slice(0, 4).join(', ')}`, stintText(F, p, c.u)], fail: null };
    }
    case 'paytop': {
      const mine = (p.pt || []).filter((x) => x[1] === c.u);
      if (!mine.length) return no(has(c.u) ? `Never the highest-paid player on the ${F.units[c.u].short} (salaries from 1990-91).` : teamFail(F, p, c.u));
      return { ok: true, link: stint(p, c.u).games, ev: [`Highest-paid ${F.units[c.u].short}: ${seasonsText(mine.map((x) => x[0]))}`, stintText(F, p, c.u)], fail: null };
    }
    case 'earn': {
      if (!(p.ce >= c.v)) return no(p.ce ? `Career earnings ${money(p.ce)}, under ${money(c.v)}.` : 'No salary in the data for him (salaries from 1990-91).');
      if (!has(c.u)) return no(`Career earnings ${money(p.ce)}. ${teamFail(F, p, c.u)}`);
      return { ok: true, link: stint(p, c.u).games, ev: [`Career earnings ${money(p.ce)}`, stintText(F, p, c.u)], fail: null };
    }
    case 'mateany': {
      const star = F.byId.get(c.p);
      if (p.i === c.p) return no(`That's ${star.n} himself.`);
      const sy = new Set(star.s.map((s) => s[0] + '|' + s[1]));
      const rows = p.s.filter((s) => sy.has(s[0] + '|' + s[1]));
      if (!rows.length) return no(`Never on the same team in the same season as ${star.n}.`);
      const g = rows.reduce((a, s) => a + s[2], 0);
      const byU = new Map(); for (const r of rows) (byU.get(r[1]) || byU.set(r[1], []).get(r[1])).push(r[0]);
      return { ok: true, link: g, ev: [...byU].map(([u, ys]) => `${F.units[u].short} ${seasonsText(ys)} with ${star.n}`).concat(`${plural(g, 'game')} together`), fail: null };
    }
    case 'statany': {
      const m = STAT[c.k];
      const rows = p.s.filter((s) => s[2] >= STAT_MIN_GAMES && (!m.from || s[0] >= m.from));
      const q = rows.filter((s) => s[m.col] / s[2] >= c.v);
      if (!q.length) {
        const best = [...rows].sort((a, b) => b[m.col] / b[2] - a[m.col] / a[2])[0];
        return no(best ? `Best season with ${STAT_MIN_GAMES}+ games for one team: ${(best[m.col] / best[2]).toFixed(1)} ${m.word} a game (${seasonLabel(best[0])}).` : `Never played ${STAT_MIN_GAMES}+ games in a season for one team.`);
      }
      return { ok: true, link: q.reduce((a, s) => a + s[2], 0), ev: q.slice(0, 4).map((s) => `${(s[m.col] / s[2]).toFixed(1)} ${m.word} a game, ${seasonLabel(s[0])} ${F.units[s[1]].short}`), fail: null };
    }
    case 'gameany': {
      const gh = p.gh || [];
      if (!gh.length) return no('No box scores for him in the archive.');
      const COUNT = { td: 6, n40: 7, n50: 8 };
      if (COUNT[c.k] !== undefined) {
        const n = gh.reduce((a, g) => a + (g[COUNT[c.k]] || 0), 0);
        const w = { td: 'triple-double', n40: '40-point game', n50: '50-point game' }[c.k];
        if (n < c.v) return no(`${plural(n, w)} in the box scores.`);
        return { ok: true, link: n, ev: [`${plural(n, w)} in the regular season`], fail: null };
      }
      if (c.k === 'p2020') {
        const hit = gh.filter((g) => (g[9] || 0) > 0);
        if (!hit.length) return no('No 20-point, 20-rebound game in the box scores.');
        return { ok: true, link: hit.reduce((a, g) => a + g[9], 0), ev: hit.slice(0, 4).map((g) => `${plural(g[9], '20-20 game')}, ${seasonLabel(g[0])} ${F.units[g[1]].short}`), fail: null };
      }
      const col = { pts: 2, reb: 3, ast: 4, tpm: 5, stl: 10, blk: 11 }[c.k];
      const best = gh.reduce((b, g) => (g[col] > b[col] ? g : b), gh[0]);
      if (best[col] < c.v) return no(`His best game: ${best[col]} ${GAME_WORD[c.k]}.`);
      const hit = gh.filter((g) => g[col] >= c.v);
      return { ok: true, link: hit.length, ev: hit.slice(0, 4).map((g) => `${g[col]} ${GAME_WORD[c.k]}, ${seasonLabel(g[0])} ${F.units[g[1]].short}`), fail: null };
    }
    case 'salaryany': {
      const big = (p.$ || []).filter((x) => x[1] >= c.v);
      if (!big.length) { const top = [...(p.$ || [])].sort((a, b) => b[1] - a[1])[0]; return no(top ? `His top salary: ${money(top[1])} (${seasonLabel(top[0])}).` : 'No salary in the data for him (salaries are kept from 1990-91).'); }
      return { ok: true, link: big.length, ev: big.slice(0, 4).map((x) => `${money(x[1])} in ${seasonLabel(x[0])}`), fail: null };
    }
    case 'earnany': {
      if (!(p.ce >= c.v)) return no(p.ce ? `Career earnings ${money(p.ce)}.` : 'No salary in the data for him (salaries are kept from 1990-91).');
      return { ok: true, link: p.g, ev: [`Career earnings ${money(p.ce)}`], fail: null };
    }
    case 'votesany': {
      const all = (p.vt || []).filter((v) => v[1] === c.a && (!c.top || (v[2] && v[2] <= c.top)));
      if (!all.length) return no(c.top ? `Never finished in the top ${c.top} of ${VOTE_NAME[c.a]} voting.` : `Never received ${VOTE_NAME[c.a]} votes.`);
      return { ok: true, link: all.length, ev: all.slice(0, 5).map((v) => `${VOTE_NAME[c.a]} voting ${seasonLabel(v[0])}: ${ordinal(v[2])}`), fail: null };
    }
    case 'heightany': {
      if (!p.ht) return no('His height is not in the data.');
      if (!(c.ge ? p.ht >= c.ge : p.ht <= c.le)) return no(`Listed at ${ft(p.ht)}.`);
      return { ok: true, link: p.g, ev: [`Listed at ${ft(p.ht)}`], fail: null };
    }
    case 'collegeany': {
      if (p.c !== c.c) return no(p.cn ? `Went to ${p.cn}, not ${c.cn}.` : 'No college in the data for him.');
      return { ok: true, link: p.g, ev: [`College: ${p.cn}`, `${plural(p.g, 'NBA game')}`], fail: null };
    }
    case 'bornc': {
      if (!p.b) return no('His birthplace is not in the data.');
      if (p.b !== c.c) return no(`Born in ${p.bp}.`);
      return { ok: true, link: p.g, ev: [`Born in ${p.bp}`], fail: null };
    }
    case 'class': {
      if (p.d !== c.y) return no(p.d ? `Drafted in ${p.d}.` : 'Not drafted, or no draft year in the data.');
      return { ok: true, link: p.g, ev: [`${p.d} draft${p.k ? `, No. ${p.k}` : ''}`, `${plural(p.g, 'NBA game')}`], fail: null };
    }
    case 'debut': {
      if (p.f !== c.y) return no(`His first NBA season was ${seasonLabel(p.f)}.`);
      return { ok: true, link: p.g, ev: [`First NBA season ${seasonLabel(p.f)}`, `${plural(p.g, 'NBA game')}`], fail: null };
    }
    case 'career': {
      const col = { pts: 3, reb: 4, ast: 5, stl: 6, blk: 7, tpm: 8 }[c.k];
      const n = c.k === 'g' ? p.g : p.s.reduce((a, s) => a + s[col], 0);
      const w = { pts: 'points', reb: 'rebounds', ast: 'assists', stl: 'steals', blk: 'blocks', tpm: 'three-pointers', g: 'games' }[c.k];
      if (n < c.v) return no(`${pts(n)} career regular-season ${w}.`);
      return { ok: true, link: p.g, ev: [`${pts(n)} career regular-season ${w}`], fail: null };
    }
    case 'count': {
      const n = c.k === 'rings' ? p.r.length : c.k === 'teams' ? new Set(p.s.map((s) => F.units[s[1]].code)).size
        : c.k === 'seasons' ? new Set(p.s.map((s) => s[0])).size : (p.a[c.k] || []).length;
      const w = { rings: 'title', teams: 'franchise', seasons: 'season', allStar: 'All-Star selection', allNba: 'All-NBA selection', allDefense: 'All-Defensive selection' }[c.k];
      if (n < c.v) return no(`${plural(n, w)}.`);
      return { ok: true, link: p.g, ev: [plural(n, w)], fail: null };
    }
    case 'medalkind': {
      const md = Array.isArray(p.md) ? p.md : [];
      const hit = md.filter((m) => m.startsWith(c.kind));
      if (!hit.length) return no(md.length ? `Medals: ${md.join(', ')}.` : 'No Olympic or World Cup medal in the data.');
      return { ok: true, link: p.g, ev: [`${hit.join(', ')}`], fail: null };
    }
    case 'club': {
      const x = (p.x || []).filter((x) => x[0] === 'O' && x[1] === c.name && x[4] === c.c);
      if (!x.length) return no(`No ${c.name} stint in his career history.`);
      return { ok: true, link: p.g, ev: x.slice(0, 3).map(clubText), fail: null };
    }
    case 'abroadafter': {
      const x = (p.x || []).filter((x) => x[0] === 'O' && x[4] === c.c && x[2] >= p.f);
      if (!x.length) return no(`No pro club in ${c.c} after his NBA debut in his career history.`);
      return { ok: true, link: p.g, ev: [...x.slice(0, 3).map(clubText), `First NBA season ${seasonLabel(p.f)}`], fail: null };
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
  if (c.t === 'ringany') parts.push('A title with any team (on the title team, at least 1 playoff game that season).');
  if (c.t === 'mate') parts.push('Same team in the same season.');
  if (c.t === 'roster') parts.push(`At least 1 regular-season game for them in ${seasonLabel(c.y)}.`);
  if (c.t === 'award') parts.push('The award counts for the team he played the most games for that season.');
  if (c.t === 'stat') parts.push(`A single season with ${STAT_MIN_GAMES}+ games for them${STAT[c.k].from ? ` (${STAT[c.k].word} are recorded from ${seasonLabel(STAT[c.k].from)})` : ''}.`);
  if (c.t === 'born' || c.t === 'bornout') parts.push('Birthplace, not nationality. U.S. territories count as outside the United States.');
  if (c.t === 'start' || c.t === 'colstart') parts.push(`His first NBA season started in the ${c.d}s.`);
  if (c.t === 'top10') parts.push('Picks 1 to 10 in the 1990 to 2025 drafts.');
  if (c.t === 'salary') parts.push('That season\'s salary (Salary Season Finder, from 1990-91), in a season he played at least 1 game for them.');
  if (c.t === 'bornin') parts.push('Birthplace, not hometown.');
  if (c.t === 'solo') parts[0] = `Won ${SOLO[c.a]} at least once.`;
  if (c.t === 'potw') parts.push('The team named on the award.');
  if (c.t === 'abroad') parts.push('A pro club outside the United States, in his career history, that ended before his first NBA season.');
  if (c.t === 'gleague') parts.push('Any G League or D-League team (2001-02 on), at any point in his career.');
  if (c.t === 'points') parts.push('Regular-season points, whole career.');
  if (c.m) parts.push(`Only ${seasonLabel(c.m)} and later counts.`);
  if (c.t === 'height') parts.push('His listed height (NBA.com).');
  if (c.t === 'combine') parts.push('Measured at the NBA Draft Combine (2000 on).');
  if (c.t === 'pick') parts.push('His pick number in the NBA draft.');
  if (c.t === 'votes') parts.push(`${VOTE_NAME[c.a]} voting; the season counts for the team he played the most games for.`);
  if (c.t === 'allany') parts.push('A selection with any team; then at least 1 game for them at any time.');
  if (c.t === 'medal') parts.push('Olympic or FIBA World Cup medal, any country.');
  if (c.t === 'game' || c.t === 'gameany') parts.push(`Regular-season games (box scores${F.boxThrough ? ' through ' + seasonLabel(F.boxThrough) : ''}${c.k === 'stl' || c.k === 'blk' ? '; steals and blocks are recorded from 1973-74' : ''}).`);
  if (c.t === 'statany') parts.push(`A single season with ${STAT_MIN_GAMES}+ games for one team${STAT[c.k].from ? ` (${STAT[c.k].word} are recorded from ${seasonLabel(STAT[c.k].from)})` : ''}.`);
  if (c.t === 'salaryany') parts.push('That season\'s salary (Salary Season Finder, from 1990-91).');
  if (c.t === 'earnany') parts.push('Career earnings in Salary Season Finder (salaries from 1990-91).');
  if (c.t === 'votesany') parts.push(`${VOTE_NAME[c.a]} voting, any season.`);
  if (c.t === 'heightany') parts.push('His listed height (NBA.com).');
  if (c.t === 'bornc') parts.push('Birthplace, not nationality.');
  if (c.t === 'career') parts.push('Regular-season totals, whole career.');
  if (c.t === 'medalkind') parts.push('Olympic or FIBA World Cup, any country.');
  if (c.t === 'club') parts.push('Any time in his career history (Wikipedia, via the NBA Career Map).');
  if (c.t === 'abroadafter') parts.push('A pro club in his career history that started after his first NBA season.');
  if (c.t === 'paytop') parts.push('Top salary on the team that season (Salary Season Finder, from 1990-91).');
  if (c.t === 'earn') parts.push('Career earnings in Salary Season Finder (salaries from 1990-91).');
  return parts.join(' ');
}

// ---------- the one-line reason after a valid pick ----------
// Plain words on why a score is high or low, from the same two things the
// score uses: how well known the player is (MVPs, Hall of Fame, All-Star
// selections, titles, career games) and how memorable his link to the
// prompt is (the games behind it). Never rank math. The page prefixes
// "<Name>: <score>/100."
//   whyText(cond, player, F, score, link) -> "A two-time All-Star, so one of
//   the better-known answers here."
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const times = (n) => (n < NUM.length ? NUM[n] : String(n)) + '-time';
export function fameText(p) {
  const [mvp, fmvp, hof] = p.h || [0, 0, 0];
  const as = (p.a.allStar || []).length, rings = p.r.length;
  if (mvp) return mvp > 1 ? `A ${times(mvp)} MVP` : 'An MVP';
  if (hof) return 'A Hall of Famer';
  if (fmvp) return 'A Finals MVP';
  if (as) return as > 1 ? `A ${times(as)} All-Star` : 'An All-Star';
  if (rings) return rings > 1 ? `A ${times(rings)} champion` : 'A champion';
  return null;
}
export function whyText(c, p, F, score, link) {
  const fame = fameText(p);
  const us = c.u === undefined ? [] : Array.isArray(c.u) ? c.u : [c.u];
  const team = us.length ? F.units[us[us.length === 2 ? (stint(p, us[0]).games <= stint(p, us[1]).games ? 0 : 1) : 0]] : null;
  const g = (n) => `${n} game${n === 1 ? '' : 's'}`;
  let linkText = null;
  if (c.t === 'stat') { const n = evaluate(c, p, F).ev.length; linkText = `${n === 1 ? 'one season' : (NUM[n] || n) + ' seasons'} like that for the ${team.short}`; }
  else if (c.t === 'mate') linkText = `${g(link)} alongside ${F.byId.get(c.p).n}`;
  else if (c.t === 'roster') linkText = `${g(link)} for the ${team.short} that season`;
  else if (team && c.t !== 'colstart' && c.t !== 'colstar') linkText = `${g(link)} for the ${team.short}`;
  const career = p.g < 100 ? `Only ${g(p.g)} in his whole NBA career` : null;
  if (score >= 70) {
    if (fame && linkText && link <= 82 && c.t !== 'stat') return `${fame}, but only ${linkText}, an easy one to forget.`;
    if (linkText && link <= 40 && c.t !== 'stat') return `Only ${linkText}, an easy one to forget.`;
    if (career) return `${career}, one of the least obvious answers here.`;
    return `${fame || 'Never an All-Star'}${linkText ? `, with ${linkText}` : ''}: one of the least obvious answers here.`;
  }
  if (score <= 30) {
    if (fame) return `${fame}, so one of the better-known answers here.`;
    if (linkText) return `${linkText[0].toUpperCase() + linkText.slice(1)}, one of the more familiar links here.`;
    return `${g(p.g)} in his NBA career, one of the better-known answers here.`;
  }
  if (fame && linkText) return `${fame}, with ${linkText}: a middle-of-the-pack answer.`;
  if (linkText) return `${linkText[0].toUpperCase() + linkText.slice(1)}: a middle-of-the-pack answer.`;
  return `${fame || g(p.g) + ' in his career'}: a middle-of-the-pack answer.`;
}
