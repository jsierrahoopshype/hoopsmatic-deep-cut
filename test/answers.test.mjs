// Answer check (Jorge, Nov 13, 2026): every scheduled and practice question
// accepts its 3 best-known answers, and team, roster and teammate questions
// accept exactly the players who fit the plain wording. Needs the build's
// .cache/candidates.json (the questions are secret until their day, so they
// aren't committed); scripts/build.mjs runs the same check and stops on any
// problem, so no lock is ever written for a question that fails it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { index } from '../scripts/lib/cond.mjs';
import { checkQuestion } from '../scripts/lib/answer-check.mjs';

const R = new URL('..', import.meta.url).pathname;
const has = existsSync(R + '.cache/candidates.json');
// Frozen days (every day through tomorrow, by the 9:00 AM ET day: see
// scripts/build.mjs) keep the lock they were made with, so today's pool may
// no longer hold, or word the same way, a question they used: the build
// checks only the days it locks, and so do these tests.
const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const p = Object.fromEntries(etFmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
const frozenThrough = new Date(Date.UTC(+p.year, +p.month - 1, +p.day) + (+p.hour < 9 ? 0 : 86400000)).toISOString().slice(0, 10);
const LAUNCH = JSON.parse(readFileSync(R + 'rules/launch.json', 'utf8')).launch;
const frozen = (date) => frozenThrough >= LAUNCH && date <= frozenThrough;
test('every scheduled and practice question passes the answer check', { skip: !has && 'no .cache/candidates.json (run the build first)' }, () => {
  const rd = (f) => JSON.parse(readFileSync(R + f, 'utf8'));
  const facts = rd('data/facts.json'), F = index(facts);
  const cand = rd('.cache/candidates.json').prompts;
  const byHash = new Map();
  const sched = rd('data/schedule.json');
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const want = new Set(rd('data/practice.json').keys);
  const open = sched.days.filter((d) => !frozen(d.date));
  for (const d of open) for (const c of cand) if (d.h.includes(sha(d.date + ':' + c.key))) byHash.set(d.date + c.key, c);
  for (const c of cand) if (want.has(c.key)) byHash.set('p' + c.key, c);
  assert.ok(byHash.size >= open.length * 10 + want.size, 'every question found');
  const errs = [...byHash.values()].flatMap((c) => checkQuestion(c, facts, F));
  assert.deepEqual(errs, []);
});

// The schedule rules that need the questions themselves (Jorge, Nov 13-14):
// a question comes back no sooner than 60 days after it was used, and a day
// never has two thresholds of one family ("25+ rebounds" and "20+").
test('a question comes back only after 60 days; one threshold of a family a day', { skip: !has && 'no .cache/candidates.json (run the build first)' }, () => {
  const rd = (f) => JSON.parse(readFileSync(R + f, 'utf8'));
  const cand = rd('.cache/candidates.json').prompts;
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const sched = rd('data/schedule.json');
  const last = new Map();
  const DAY = 86400000;
  let checked = 0;
  for (const d of sched.days) {
    let qs = d.h.map((h) => cand.find((c) => sha(d.date + ':' + c.key) === h));
    if (frozen(d.date)) qs = qs.filter(Boolean);   // what the pool still has of it
    assert.ok(qs.every(Boolean), d.date + ': every question found');
    assert.equal(new Set(qs.map((c) => c.family)).size, qs.length, d.date + ': two thresholds of one family');
    for (const c of qs) {
      if (last.has(c.key)) { const gap = (Date.parse(d.date) - Date.parse(last.get(c.key))) / DAY; assert.ok(gap >= 60, `${c.key}: back after ${gap} days (${last.get(c.key)} -> ${d.date})`); checked++; }
      last.set(c.key, d.date);
    }
  }
  assert.ok(checked > 0, 'the schedule does reuse questions, so the gap is really checked');
});
