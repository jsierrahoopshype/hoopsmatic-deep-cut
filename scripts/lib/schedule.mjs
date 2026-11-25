// Which questions go on which Daily (scripts/build.mjs writes the locks).
//
// STABLE ASSIGNMENT (Nov 25, 2026): a day that is not frozen keeps every
// question it already has that is still in the pool and still free. When
// a question drops out (a data fix, an exclusion), only its slot is picked
// again, the other questions stay in their slots, and the replacement
// comes from questions no later locked day holds within the reuse window,
// so it never takes a question from a later day. Before this, a day that
// lost one question was rebuilt from scratch, and its new questions were
// taken from later days, which were then rebuilt in turn: one dropped
// question rewrote hundreds of unplayed days. A replacement keeps the day
// rules (dayOk) and the soft rules against both neighbours (teams of the
// two days around it, themes of the three days around it). New days past
// the end of the old schedule are filled as before.
import { createHash } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const DAY_MS = 86400000;
export const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);

export const ROUNDS = 10;
export const REUSE_DAYS = 60;   // a question may come back after 60 days, never sooner (Jorge, Nov 14:
                                // 120 left the day rules unfillable after day 61)

// Seeded order (same data, same schedule).
export function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function seededOrder(prompts) {
  const rand = rng(20261112);
  const order = [...prompts].sort((a, b) => a.key.localeCompare(b.key));
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

// Day rules (see fillDay).
const TYPE_CAP = 2, MIN_MODERN = 5, MAX_80S = 2, MIN_TYPES = 6, MAX_ABF = 3, MAX_TEAM = 4, MIN_HEAD = 3;
const HB = new Set(['height', 'birth-city']);   // at most one of the two a day
const ABF = new Set(['A', 'B', 'F']);   // two teams, teammate, roster
const CATS = ['money', 'accolade', 'record', 'physical', 'origin'];

// Ten questions a day (Jorge, Nov 13, 2026; the first four rules Nov 14):
//   - at most 4 questions that mention a team;
//   - at least 3 headline questions (no team: game highs, combine, award
//     votes, clubs abroad, single-season salary, draft, medals, birthplace);
//   - height and birth city/state: at most 1 of the two;
//   - one threshold of a family a day (never "25+ rebounds" and "26+");
//   - no theme (a question with its team taken out) from the 3 days before
//     (and, for a replacement, the 3 days after), where the pool allows;
//   - at least one question from each category: money (exactly one: the
//     scarcest pool), accolade, record, physical (or draft), origin;
//   - at least 6 different question types, none more than twice;
//   - two-team, teammate and roster questions together at most 3;
//   - leaning recent: 5+ 'modern' questions, at most 2 '80s', never 'old'
//     (era: generate-prompts.mjs, from the answers, never a condition);
//   - no team twice in a day, never two rosters of one franchise, teams
//     from the last two days (and, for a replacement, the next two) avoided
//     when possible;
//   - within those, the type with the fewest questions today and the most
//     of its pool left comes next.
// dayOk checks a full day; with partial, only the caps (what a day being
// repaired keeps must leave room for the rest).
export function dayOk(picks, partial = false) {
  const perType = {}, cats = new Set(), units = new Set();
  let modern = 0, eighties = 0, abf = 0, team = 0, head = 0, hb = 0;
  const fams = new Set();
  for (const c of picks) {
    if (c.team) team++;
    if (c.headline) head++;
    if (HB.has(c.type)) hb++;
    if (fams.has(c.family)) return false;
    fams.add(c.family);
    perType[c.type] = (perType[c.type] || 0) + 1;
    if (perType[c.type] > TYPE_CAP) return false;
    if (c.cat) cats.add(c.cat);
    if (c.era === 'old') return false;
    if (c.era === 'modern') modern++;
    if (c.era === '80s') eighties++;
    if (ABF.has(c.group)) abf++;
    for (const u of c.units) { if (units.has(u)) return false; units.add(u); }
  }
  const caps = team <= MAX_TEAM && hb <= 1 && eighties <= MAX_80S && abf <= MAX_ABF;
  if (partial) return picks.length <= ROUNDS && caps;
  return picks.length === ROUNDS && caps && head >= MIN_HEAD && modern >= MIN_MODERN
    && Object.keys(perType).length >= MIN_TYPES && CATS.every((k) => cats.has(k));
}

// The days from start, at most maxDays, until the pool runs out.
//   prompts  every candidate question (generate-prompts.mjs)
//   never    keys that are never a Daily (excluded, practice-only)
//   prev[i]  the old schedule's day start+i: { keys: [key or null per slot],
//            frozen }, or null for a day it did not have. A null key is a
//            question no longer in the pool.
// Returns [{ date, how, picks }]: how is 'frozen' (picks null: the old lock
// stays), 'kept' (same questions, same slots), 'repaired' (the questions
// that dropped out replaced, the rest in their slots), 'rebuilt' (what it
// kept broke a day rule, or no replacement fit) or 'new'.
export function planDays({ prompts, never = new Set(), start, maxDays, prev = [], reuseDays = REUSE_DAYS, order = seededOrder(prompts) }) {
  const all = new Map(prompts.map((c) => [c.key, c]));
  const typeTotal = {};
  for (const c of order) if (c.era !== 'old') typeTotal[c.type] = (typeTotal[c.type] || 0) + 1;
  const typeUsed = {};
  const lastDay = new Map();   // key -> index of the day it was last used
  let dayIdx = 0;
  const used = { has: (k) => never.has(k) || (lastDay.has(k) && dayIdx - lastDay.get(k) < reuseDays) };
  // Questions held by later days that are not frozen: a day being filled
  // leaves them alone when the later day is inside the reuse window.
  const prevKeys = (j) => (prev[j] && prev[j].keys ? prev[j].keys : []).filter((k) => k && all.has(k) && !never.has(k));
  const ahead = new Map();
  prev.forEach((p, j) => { if (p && !p.frozen) for (const k of prevKeys(j)) { if (!ahead.has(k)) ahead.set(k, []); ahead.get(k).push(j); } });
  let reserve = true;
  const reserved = (k) => reserve && (ahead.get(k) || []).some((j) => j > dayIdx && j - dayIdx < reuseDays);
  const unitsOf = (j) => prevKeys(j).flatMap((k) => all.get(k).units);
  const themesOf = (j) => prevKeys(j).map((k) => all.get(k).theme);
  const recent = [];   // units of the last days
  const recentT = [];  // themes of the last days
  const out = [];

  function fillDayOnce(picks, recentUnits, recentThemes, ord) {
    if (!dayOk(picks, true)) return null;
    const perType = {}, cats = new Set();
    const dayUnits = new Set(), dayCodes = new Set();
    let modern = 0, eighties = 0, abf = 0, team = 0, head = 0, hb = 0;
    const fams = new Set();
    const take = (c) => {
      picks.push(c);
      if (c.team) team++;
      if (c.headline) head++;
      if (HB.has(c.type)) hb++;
      fams.add(c.family);
      perType[c.type] = (perType[c.type] || 0) + 1;
      if (c.cat) cats.add(c.cat);
      c.units.forEach((u) => dayUnits.add(u));
      if (c.group === 'F') c.units.forEach((u) => dayCodes.add(u.split('|')[0]));
      if (c.era === 'modern') modern++;
      if (c.era === '80s') eighties++;
      if (ABF.has(c.group)) abf++;
    };
    const kept = picks; picks = [];
    for (const c of kept) take(c);
    const free = (c) => !used.has(c.key) && !reserved(c.key) && !picks.includes(c) && c.era !== 'old';
    for (const strict of [true, false]) {
      while (picks.length < ROUNDS) {
        const left = ROUNDS - picks.length;
        const needCats = CATS.filter((k) => !cats.has(k));
        const needTypes = Math.max(0, MIN_TYPES - Object.keys(perType).length);
        const needModern = Math.max(0, MIN_MODERN - modern);
        const needHead = Math.max(0, MIN_HEAD - head);
        const fits = (c, soft = strict) => free(c) && (perType[c.type] || 0) < TYPE_CAP
          && (!c.team || team < MAX_TEAM) && (!HB.has(c.type) || hb < 1) && !fams.has(c.family)
          // keep team slots for missing categories (often only team questions have them left)
          && (!c.team || needCats.includes(c.cat) || MAX_TEAM - team - 1 >= needCats.length)
          && (needHead < left || c.headline)
          && (!ABF.has(c.group) || abf < MAX_ABF)
          && (c.cat !== 'money' || !cats.has('money'))   // money is the scarcest pool: one a day
          && (c.era !== '80s' || eighties < MAX_80S)
          && !c.units.some((u) => dayUnits.has(u))
          && (c.group !== 'F' || !c.units.some((u) => dayCodes.has(u.split('|')[0])))
          && (!soft || !c.units.some((u) => recentUnits.includes(u)))
          && (!soft || !recentThemes.includes(c.theme)) && !picks.some((x) => x.theme === c.theme)
          // what this pick leaves must still be able to meet the day's minimums
          && (needCats.length < left || needCats.includes(c.cat))
          && (needTypes < left || !perType[c.type])
          && (needModern < left || c.era === 'modern');
        // Scarcest category first while one is missing; then modern first.
        const want = needCats.length ? needCats.sort((a, b) => catLeft(a) - catLeft(b))[0] : null;
        const types = Object.keys(typeTotal).filter((t) => (perType[t] || 0) < TYPE_CAP)
          .sort((a, b) => (perType[a] || 0) - (perType[b] || 0) || (typeUsed[a] || 0) / typeTotal[a] - (typeUsed[b] || 0) / typeTotal[b]);
        let got = null;
        // A missing category is filled first, even from a team or theme of the
        // last days (soft rules) rather than leaving the day short.
        const prefs = [(c) => (!want || c.cat === want) && (head >= MIN_HEAD || c.headline) && (modern >= MIN_MODERN || c.era === 'modern'),
          (c) => (!want || c.cat === want) && (head >= MIN_HEAD || c.headline), (c) => !want || c.cat === want];
        for (const [pref, soft] of [...prefs.map((f) => [f, strict]), ...(want ? prefs.map((f) => [f, false]) : []), [() => true, strict]]) {
          for (const t of types) { got = ord.find((c) => c.type === t && fits(c, soft) && pref(c)); if (got) break; }
          if (got) break;
        }
        if (!got) break;
        take(got);
      }
    }
    return dayOk(picks) ? picks : null;
  }
  // The greedy fill can paint itself into a corner (the last slot has to be a
  // headline, modern and of a missing category at once), so a day is tried
  // again with the candidates in other seeded orders. A day being repaired
  // tries every order with what it keeps before it is rebuilt.
  function fillDay(picks, recentUnits, recentThemes) {
    const tries = picks.length ? [picks, []] : [[]];
    for (const base of tries) {
      for (let a = 0; a < 60; a++) {
        let ord = order;
        if (a) {
          const r = rng(a * 7919 + picks.length);
          ord = order.map((c) => [r(), c]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
        }
        const got = fillDayOnce([...base], recentUnits, recentThemes, ord);
        if (got) return got;
      }
    }
    return [];
  }
  // How many no-team questions of a category are left: the category with the
  // fewest goes first, since team slots are the scarce ones.
  function catLeft(k) { let n = 0; for (const c of order) if (c.cat === k && !c.team && !used.has(c.key) && !reserved(c.key) && c.era !== 'old') n++; return n; }
  // Groups take turns: A G D C F E P B H ...
  // A seeded shuffle per date, so the days don't share a slot pattern;
  // no two team questions or two of one category back to back where avoidable.
  function slotOrder(date, picks) {
    const r = rng(parseInt(sha('order:' + date).slice(0, 8), 16));
    const pool = [...picks].sort((a, b) => a.key.localeCompare(b.key));
    for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
    const res = [];
    while (pool.length) {
      const p = res[res.length - 1];
      let k = pool.findIndex((c) => !p || ((!c.team || !p.team) && (!c.cat || c.cat !== p.cat)));
      if (k < 0) k = 0;
      res.push(pool.splice(k, 1)[0]);
    }
    return res;
  }

  for (let i = 0; i < maxDays; i++) {
    dayIdx = i;
    const date = addDays(start, i);
    const p = prev[i];
    if (p && p.frozen) {
      for (const k of p.keys || []) if (k) lastDay.set(k, i);
      recent.push(unitsOf(i));
      recentT.push(themesOf(i));
      out.push({ date, how: 'frozen', picks: null });
      continue;
    }
    // The slots this day keeps: still in the pool and free.
    const slots = p && p.keys ? p.keys.map((k) => (k && all.has(k) && !used.has(k) ? all.get(k) : null)) : null;
    const keep = slots ? slots.filter(Boolean) : [];
    let picks, how;
    if (slots && keep.length === slots.length && slots.length === ROUNDS && dayOk(keep)) {
      picks = keep; how = 'kept';
    } else {
      // Neighbours both ways: the last days and, for a day of the old
      // schedule, the locked days after it.
      const nextU = slots ? [i + 1, i + 2].flatMap(unitsOf) : [];
      const nextT = slots ? [i + 1, i + 2, i + 3].flatMap(themesOf) : [];
      const ru = [...recent.slice(-2).flat(), ...nextU], rt = [...recentT.slice(-3).flat(), ...nextT];
      picks = fillDay(keep, ru, rt);
      // Nothing fits without a question a later day holds: take one rather
      // than end the schedule here (that later day is then repaired).
      if (picks.length < ROUNDS && slots) { reserve = false; picks = fillDay(keep, ru, rt); reserve = true; }
      if (picks.length < ROUNDS) break;   // the pool is used up: the schedule ends here
      if (keep.length && keep.every((c) => picks.includes(c)) && slots.length === ROUNDS) {
        // Repaired: what it kept stays in its slot, replacements fill the gaps.
        const extra = picks.filter((c) => !keep.includes(c));
        picks = slots.map((c) => c || extra.shift());
        how = 'repaired';
      } else {
        picks = slotOrder(date, picks);
        how = slots ? 'rebuilt' : 'new';
      }
    }
    for (const c of picks) typeUsed[c.type] = (typeUsed[c.type] || 0) + 1;
    for (const c of picks) lastDay.set(c.key, i);
    recent.push(picks.flatMap((c) => c.units));
    recentT.push(picks.map((c) => c.theme));
    out.push({ date, how, picks });
  }
  return out;
}
