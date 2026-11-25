// Relock one frozen Daily with today's facts, same questions, same order
// (owner's decision, Nov 25, 2026: Nov 26 was locked before the namesake fix
// and still counted Tim Hardaway for his son's Sixth Man votes).
//
//   node scripts/pull-data.mjs && node scripts/generate-prompts.mjs && node scripts/relock-day.mjs YYYY-MM-DD
//
// scripts/build.mjs never rewrites a frozen day (today and tomorrow); this
// does it by hand, for a day that is not live yet only (a Daily goes live at
// 9:00 AM ET, the Deep Cut server's day). The day's questions are found from
// its round hashes in data/schedule.json; each must still be in
// .cache/candidates.json (same key), or nothing is written. Only the valid
// answers and their scores change. The questions must pass the build's answer
// check and the 1-100 score check first.
// Writes public/prompts/<date>.lock and the day's `a` in data/schedule.json.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { lock, fetchPubkey } from './lib/lock.mjs';
import { checkQuestion } from './lib/answer-check.mjs';
import { index } from './lib/cond.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const rd = (f) => JSON.parse(readFileSync(ROOT + f, 'utf8'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
// The Daily's date at a moment: 9:00 AM to 9:00 AM Eastern (as build.mjs and the server).
const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
function dailyDate(ms) {
  const p = Object.fromEntries(etFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  let d = Date.UTC(+p.year, +p.month - 1, +p.day);
  if (+p.hour < 9) d -= 86400000;
  return new Date(d).toISOString().slice(0, 10);
}
const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('usage: node scripts/relock-day.mjs YYYY-MM-DD');
if (date <= dailyDate(Date.now())) throw new Error(`${date} is already live (or over): it is never relocked`);

const cand = rd('.cache/candidates.json');
const sched = rd('data/schedule.json');
const entry = sched.days.find((d) => d.date === date);
if (!entry || entry.v !== 2) throw new Error(`${date}: no v2 day in data/schedule.json`);
const picks = entry.h.map((h) => cand.prompts.find((c) => sha(date + ':' + c.key) === h));
if (picks.some((c) => !c)) throw new Error(`${date}: a question is no longer in the pool; not relocked`);

// Same shape as build.mjs roundOf.
const rounds = picks.map((c) => ({ key: c.key, type: c.type, group: c.group, text: c.text, rule: c.rule, teams: c.teams, cond: c.cond, answers: c.answers.map((a) => [a.i, a.s]) }));
const FACTS = rd('data/facts.json'), FI = index(FACTS);
const errs = picks.flatMap((c) => checkQuestion(c, FACTS, FI));
for (const c of picks) {
  const sc = c.answers.map((a) => a.s);
  if (Math.min(...sc) !== 1 || Math.max(...sc) !== 100) errs.push(`${c.key}: scores run ${Math.min(...sc)}-${Math.max(...sc)}, not 1-100`);
}
if (errs.length) { console.error(errs.join('\n')); throw new Error(`answer check: ${errs.length} problems; not relocked`); }

const a = sha(JSON.stringify(rounds));
if (a === entry.a) { console.log(`${date}: answers unchanged, lock kept`); process.exit(0); }
const pub = await fetchPubkey();
const plain = { v: 2, game: 'deep-cut', date, scoring: cand.prompts[0].scoring, asOf: cand.asOf, rounds };
writeFileSync(`${ROOT}public/prompts/${date}.lock`, JSON.stringify(await lock(plain, pub)) + '\n');
entry.a = a;
writeFileSync(ROOT + 'data/schedule.json', JSON.stringify(sched, null, 1) + '\n');
console.log(`${date}: relocked (${rounds.length} questions, same order)`);
