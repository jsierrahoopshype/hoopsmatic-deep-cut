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
test('every scheduled and practice question passes the answer check', { skip: !has && 'no .cache/candidates.json (run the build first)' }, () => {
  const rd = (f) => JSON.parse(readFileSync(R + f, 'utf8'));
  const facts = rd('data/facts.json'), F = index(facts);
  const cand = rd('.cache/candidates.json').prompts;
  const byHash = new Map();
  const sched = rd('data/schedule.json');
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const want = new Set(rd('data/practice.json').keys);
  for (const d of sched.days) for (const c of cand) if (d.h.includes(sha(d.date + ':' + c.key))) byHash.set(d.date + c.key, c);
  for (const c of cand) if (want.has(c.key)) byHash.set('p' + c.key, c);
  assert.ok(byHash.size >= sched.days.length * 10 + want.size, 'every question found');
  const errs = [...byHash.values()].flatMap((c) => checkQuestion(c, facts, F));
  assert.deepEqual(errs, []);
});
