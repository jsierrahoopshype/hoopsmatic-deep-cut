// Stable assignment (Nov 25, 2026): dropping, replacing or adding questions
// changes only the days that used the dropped ones; every other day keeps
// its exact questions in the same slots. A made-up pool, no data download.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { planDays, dayOk, REUSE_DAYS } from '../scripts/lib/schedule.mjs';

const CATS = ['money', 'accolade', 'record', 'physical', 'origin'];
const START = '2027-01-01', DAYS = 150, FROZEN = 3;
function question(key, i) {
  const team = i % 4 === 0;
  return {
    key, type: 't' + (i % 12), cat: CATS[i % 5], team, headline: !team && i % 3 !== 0,
    era: i % 9 === 0 ? '80s' : i % 3 === 2 ? 'open' : 'modern',
    group: team ? (i % 8 === 0 ? 'A' : 'C') : 'G', family: 'fam:' + key, theme: 'theme:' + key,
    units: team ? [`T${i % 30}|Team ${i % 30}`] : [], answers: [{ i: i, s: 1 }, { i: i + 1, s: 100 }],
  };
}
const POOL = Array.from({ length: 900 }, (_, i) => question('q' + String(i).padStart(4, '0'), i));
// What a lock is made of: the questions, slot by slot (build.mjs hashes the rounds).
const bytes = (d) => (d.picks ? createHash('sha256').update(JSON.stringify(d.picks)).digest('hex') : 'frozen');
const asPrev = (plan) => plan.map((d, i) => ({ keys: d.picks.map((c) => c.key), frozen: i < FROZEN }));

function checkPlan(plan, prompts, never = new Set()) {
  const last = new Map();
  plan.forEach((d, i) => {
    if (!d.picks) return;
    assert.ok(dayOk(d.picks), d.date + ' keeps the day rules');
    for (const c of d.picks) {
      assert.ok(prompts.some((x) => x.key === c.key) && !never.has(c.key), `${d.date}: ${c.key} is in the pool`);
      if (last.has(c.key)) assert.ok(i - last.get(c.key) >= REUSE_DAYS, `${c.key} back after ${i - last.get(c.key)} days`);
      last.set(c.key, i);
    }
  });
}
const base = planDays({ prompts: POOL, start: START, maxDays: DAYS });
const dayOf = (key) => base.map((d, i) => (d.picks.some((c) => c.key === key) ? i : -1)).filter((i) => i >= 0);

test('the made-up pool fills every day under the day rules', () => {
  assert.equal(base.length, DAYS);
  checkPlan(base, POOL);
  // and re-running on the same pool changes nothing
  const again = planDays({ prompts: POOL, start: START, maxDays: DAYS, prev: asPrev(base) });
  again.forEach((d, i) => { if (i >= FROZEN) { assert.equal(d.how, 'kept'); assert.equal(bytes(d), bytes(base[i])); } });
});

test('dropping one question changes only the days that used it, and only its slot', () => {
  for (const at of [FROZEN, 40, 100, DAYS - 1]) {
    const gone = base[at].picks[3].key;
    const hit = dayOf(gone);
    const prompts = POOL.filter((c) => c.key !== gone);
    const plan = planDays({ prompts, start: START, maxDays: DAYS, prev: asPrev(base) });
    assert.equal(plan.length, DAYS);
    checkPlan(plan, prompts);
    plan.forEach((d, i) => {
      if (i < FROZEN) return assert.equal(d.how, 'frozen');
      if (!hit.includes(i)) return assert.equal(bytes(d), bytes(base[i]), `${d.date} untouched when ${gone} drops (day ${at})`);
      assert.equal(d.how, 'repaired', d.date);
      const slot = base[i].picks.findIndex((c) => c.key === gone);
      d.picks.forEach((c, s) => (s === slot ? assert.notEqual(c.key, gone) : assert.equal(c.key, base[i].picks[s].key)));
    });
  }
});

test('an excluded question is replaced the same way, without taking a later day\'s question', () => {
  const gone = base[20].picks[0].key;
  const never = new Set([gone]);
  const plan = planDays({ prompts: POOL, never, start: START, maxDays: DAYS, prev: asPrev(base) });
  checkPlan(plan, POOL, never);
  const changed = plan.map((d, i) => (bytes(d) !== bytes(base[i]) && i >= FROZEN ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(changed, dayOf(gone).filter((i) => i >= FROZEN));
  // the replacement was not locked on any later day
  const fresh = plan[20].picks.find((c) => !base[20].picks.includes(c));
  assert.ok(fresh);
  for (let j = 21; j < Math.min(DAYS, 20 + REUSE_DAYS); j++) assert.ok(!base[j].picks.some((c) => c.key === fresh.key), `${fresh.key} still on day ${j}`);
});

test('replacing a question (one key out, a new one in) touches only its days', () => {
  const gone = base[60].picks[5].key;
  const prompts = [...POOL.filter((c) => c.key !== gone), question('zz-new', 5)];
  const plan = planDays({ prompts, start: START, maxDays: DAYS, prev: asPrev(base) });
  checkPlan(plan, prompts);
  const changed = plan.map((d, i) => (i >= FROZEN && bytes(d) !== bytes(base[i]) ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(changed, dayOf(gone).filter((i) => i >= FROZEN));
});

test('new pool questions reshuffle nothing; new days past the end are added', () => {
  const extra = Array.from({ length: 120 }, (_, i) => question('new' + String(i).padStart(3, '0'), i + 7));
  const prompts = [...extra, ...POOL];
  const plan = planDays({ prompts, start: START, maxDays: DAYS + 20, prev: asPrev(base) });
  assert.equal(plan.length, DAYS + 20);
  checkPlan(plan, prompts);
  for (let i = FROZEN; i < DAYS; i++) { assert.equal(plan[i].how, 'kept'); assert.equal(bytes(plan[i]), bytes(base[i]), plan[i].date); }
  for (let i = DAYS; i < DAYS + 20; i++) assert.equal(plan[i].how, 'new');
});
