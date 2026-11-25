// Fathers, sons and other namesakes (owner's decision, Nov 25, 2026): sources
// are joined by the data's own player ID plus a check that the row fits the
// player's life and career, never by a name alone (scripts/lib/players.mjs,
// HOW SOURCES ARE JOINED). Reads committed files only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, index } from '../scripts/lib/cond.mjs';
import { careerFits, birthplaceFor, birthRowsByName } from '../scripts/lib/players.mjs';

const facts = JSON.parse(readFileSync(new URL('../data/facts.json', import.meta.url), 'utf8'));
const F = index(facts);
const P = (id) => { const p = F.byId.get(id); assert.ok(p, id + ' is in facts.json'); return p; };
const clubs = (id) => P(id).x.filter((x) => x[0] === 'O').map((x) => x[1]);
const ok = (cond, id) => evaluate(cond, P(id), F).ok;

// The four sons who had their fathers' clubs abroad.
const SONS = {
  'jabari-smith': ['Granada', 'Beşiktaş', 'Pardis Mottahed Qazvin BC', 'Vaqueros de Bayamón', 'Conquistadores de Guaynabo', 'Pioneros de Quintana Roo'],
  'kevin-porter': ['Toyota Super Corollas'],
  'santiago-aldama': ['Zaragoza', 'Huesca La Magia', 'Valladolid', 'Gran Canaria', 'FC Porto', 'Inca', 'Club Ourense Baloncesto'],
  'walker-russell': ['Purefoods TJ Hotdogs'],
};
for (const [id, theirs] of Object.entries(SONS)) {
  test(`${id}: none of his father's clubs, and no club-abroad question takes him`, () => {
    const mine = clubs(id);
    for (const c of theirs) assert.ok(!mine.includes(c), `${id} has ${c}`);
    assert.ok(!P(id).x.some((x) => x[3] < 2000), `${id} has a club from before he was a teenager`);
    assert.equal(ok({ t: 'abroad' }, id), false);
    for (const c of ['Spain', 'Turkey', 'Philippines', 'Portugal', 'Iran', 'Mexico', 'Puerto Rico']) {
      assert.equal(ok({ t: 'abroad', c }, id), false, `abroad ${c}`);
      assert.equal(ok({ t: 'abroadafter', c }, id), false, `abroadafter ${c}`);
    }
    assert.equal(ok({ t: 'abroadreg', cs: ['Philippines', 'Japan', 'China', 'Iran'], when: 'before' }, id), false);
  });
}

test('the fathers keep their own clubs (joined to the right person)', () => {
  assert.ok(clubs('jabari-smith-sr').includes('Beşiktaş'));
  assert.ok(clubs('kevin-porter-1950').includes('Toyota Super Corollas'));
  assert.ok(clubs('walker-russell-sr').includes('Purefoods TJ Hotdogs'));
  assert.equal(ok({ t: 'abroadafter', c: 'Philippines' }, 'kevin-porter-1950'), true);
  assert.equal(ok({ t: 'abroadafter', c: 'Philippines' }, 'walker-russell-sr'), true);
  // the sons' own facts stay theirs
  assert.equal(P('jabari-smith').c, 'Auburn');
  assert.equal(P('jabari-smith').k, 3);
  assert.equal(P('jabari-smith-sr').c, 'LSU');
  assert.equal(P('kevin-porter').bp, 'Seattle, Washington');
  assert.equal(P('kevin-porter-1950').bp, 'Chicago, Illinois');
});

test("father/son by ID: a son's award votes never count for his father", () => {
  // nba-player-data files Tim Hardaway Jr.'s and Jaren Jackson Jr.'s votes
  // under their fathers' names; outside the father's career they don't count.
  for (const [id, last] of [['tim-hardaway', 2003], ['jaren-jackson', 2002]]) {
    assert.ok(P(id).vt.every((v) => v[0] <= last), `${id} has votes after his career`);
  }
  assert.equal(ok({ t: 'votesany', a: 'Sixth Man' }, 'tim-hardaway'), false);
  assert.equal(ok({ t: 'votesany', a: 'DPOY', top: 3 }, 'jaren-jackson'), false);
  assert.equal(ok({ t: 'votesany', a: 'ROY' }, 'tim-hardaway'), false);
  assert.equal(ok({ t: 'votesany', a: 'MVP' }, 'tim-hardaway'), true);   // his own votes stay
});

test('namesakes: combine and Career Map records go to the right person', () => {
  assert.equal(P('tyler-smith').cb[3], 2024);         // not the 2009 Tyler Smith
  assert.equal(P('justin-hamilton').cb, null);        // the 2003 combine was a namesake's
  assert.equal(clubs('nate-williams').length, 0);     // the 1970s one; the Chiba Jets are Jeenathan's
  assert.ok(clubs('jeenathan-williams').includes('Chiba Jets'));
  assert.equal(P('nate-williams').c, null);
});

test('careerFits: a career that is clearly another person by years is refused', () => {
  const father = { career_history: [{ years: '2000-2001', team: 'Sacramento Kings' }, { years: '2002', team: 'Granada' }, { years: '2009', team: 'Vaqueros de Bayamón' }] };
  assert.equal(careerFits(father, 1977), true);        // the father, born 1977
  assert.equal(careerFits(father, 2003), false);       // his son, born 2003
  assert.equal(careerFits({ birth_date: '1999-02-12', career_history: [] }, 1950), false);   // another birth year
  assert.equal(careerFits({ birth_date: '1997-08-25', career_history: [] }, 1998), true);    // a one-year typo is still him
  assert.equal(careerFits({ career_history: [{ years: '1966-1977', team: 'Indiana Pacers' }] }, 1921), false);   // he'd be 45+
  assert.equal(careerFits({ career_history: [{ years: '2009', team: 'Zrinjevac' }] }, 1994), true);   // a pro at 15
});

test('birthplaceFor: namesakes are told apart by birth date, never by name alone', () => {
  const rows = birthRowsByName([
    ['Kevin Porter', '1950-04-17', 'Chicago, Illinois'],
    ['Kevin Porter', '2000-05-04', 'Seattle, Washington'],
    ['Gene Gillette', '1921-02-22', 'San Francisco, California'],
  ]);
  assert.equal(birthplaceFor(rows, { PLAYER: 'Kevin Porter', BIRTHDAY: '5/4/2000' }), 'Seattle, Washington');
  assert.equal(birthplaceFor(rows, { PLAYER: 'Kevin Porter (1950)', BIRTHDAY: '4/17/1950' }), 'Chicago, Illinois');
  assert.equal(birthplaceFor(rows, { PLAYER: 'Kevin Porter', BIRTHDAY: '1/1/1975' }), null);   // neither of the two
  assert.equal(birthplaceFor(rows, { PLAYER: 'Gene Gillette', BIRTHDAY: '2/22/1919' }), 'San Francisco, California');   // one of a kind, a typo apart
});
