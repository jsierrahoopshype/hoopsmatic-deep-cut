// Answer check (Jorge, Nov 13, 2026), run by scripts/build.mjs on every
// scheduled and practice question before any lock is written, and by
// test/answers.test.mjs wherever .cache/candidates.json exists.
//
//   1. The 3 best-known valid answers (the lowest scores: the most obvious
//      players) are accepted by the evaluator the server uses.
//   2. For questions about teams, a roster or a teammate (any team too), the full answer
//      list is worked out a second time, independently and plainly, from the
//      season rows alone (played 1+ regular-season game for that era's team,
//      any season), and must match exactly. This is what caught Amir Johnson
//      (Pistons 2005-09, Raptors 2009-15) being refused by a "since 2010-11"
//      condition the wording didn't show.
import { evaluate } from './cond.mjs';

function plainSet(cond, facts) {
  const out = new Set();
  for (const p of facts.players) {
    const on = (u) => p.s.some((s) => s[1] === u);
    if (cond.t === 'teams' && on(cond.u[0]) && on(cond.u[1])) out.add(p.i);
    if (cond.t === 'roster' && p.s.some((s) => s[1] === cond.u && s[0] === cond.y)) out.add(p.i);
    if (cond.t === 'mateany' && p.i !== cond.p) {
      const star = facts.players.find((x) => x.i === cond.p);
      const ys = new Set(star.s.map((s) => s[0] + '|' + s[1]));
      if (p.s.some((s) => ys.has(s[0] + '|' + s[1]))) out.add(p.i);
    }
    if (cond.t === 'mate' && p.i !== cond.p) {
      const star = facts.players.find((x) => x.i === cond.p);
      const ys = new Set(star.s.filter((s) => s[1] === cond.u).map((s) => s[0]));
      if (p.s.some((s) => s[1] === cond.u && ys.has(s[0]))) out.add(p.i);
    }
  }
  return out;
}

/** Problems with one question (empty = fine). q: { key, text, cond, answers: [[id, score]] | [{i, s}] } */
export function checkQuestion(q, facts, F) {
  const errs = [];
  const ans = q.answers.map((a) => (Array.isArray(a) ? { i: a[0], s: a[1] } : a));
  if (q.cond.m) errs.push(`${q.key}: carries a season window (m), a condition the wording doesn't show`);
  if (/since \d{4}|\d{4}-\d{2} or later|\d{4}-\d{2} on\b/.test(q.text) && q.cond.t !== 'roster') errs.push(`${q.key}: era clause in the text: ${q.text}`);
  const known = [...ans].sort((a, b) => a.s - b.s || a.i.localeCompare(b.i)).slice(0, 3);
  if (known.length < 3) errs.push(`${q.key}: fewer than 3 answers`);
  for (const a of known) {
    const p = F.byId.get(a.i);
    const r = p ? evaluate(q.cond, p, F) : { ok: false, fail: 'not in facts' };
    if (!r.ok) errs.push(`${q.key}: well-known answer ${p ? p.n : a.i} refused: ${r.fail}`);
  }
  if (['teams', 'roster', 'mate', 'mateany'].includes(q.cond.t)) {
    const want = plainSet(q.cond, facts), got = new Set(ans.map((a) => a.i));
    const missing = [...want].filter((i) => !got.has(i)), extra = [...got].filter((i) => !want.has(i));
    if (missing.length) errs.push(`${q.key}: refuses players who fit the plain wording: ${missing.slice(0, 5).map((i) => F.byId.get(i).n).join(', ')}`);
    if (extra.length) errs.push(`${q.key}: accepts players who don't fit: ${extra.slice(0, 5).map((i) => F.byId.get(i).n).join(', ')}`);
  }
  return errs;
}
