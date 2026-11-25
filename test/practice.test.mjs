// Stable practice locks (Nov 25, 2026): building twice on the same data
// leaves every practice lock byte for byte; changing one practice question
// rewrites only its lock, with a fresh key and IV. A made-up pool and a
// throwaway key pair, no data download.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as wc } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lock, unlock } from '../scripts/lib/lock.mjs';
import { practiceBody, writePracticeLocks } from '../scripts/lib/practice.mjs';

const pair = await wc.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
const pubJwk = await wc.subtle.exportKey('jwk', pair.publicKey), privJwk = await wc.subtle.exportKey('jwk', pair.privateKey);
const pub = { kid: 'test-kid', jwk: pubJwk };
const round = (i, s = 100) => ({ key: 'q' + i, type: 't', group: 'G', text: 'Question ' + i, answers: [[i, 1], [i + 1, s]] });
const pool = (n) => Array.from({ length: n }, (_, i) => practiceBody(i + 1, 'v2', round(i)));
const snapshot = (dir) => Object.fromEntries(readdirSync(dir).sort().map((f) => [f, readFileSync(join(dir, f), 'utf8')]));

test('building twice on the same data leaves every practice lock byte for byte', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'practice-'));
  try {
    const first = await writePracticeLocks({ dir, bodies: pool(12), asOf: '2026-11-25', pub, lock });
    assert.equal(first.wrote, 12);
    const before = snapshot(dir);
    // A later build: same content, another build date.
    const second = await writePracticeLocks({ dir, bodies: pool(12), prevHashes: first.a, asOf: '2026-12-02', pub, lock });
    assert.equal(second.wrote, 0);
    assert.deepEqual(second.a, first.a);
    assert.deepEqual(snapshot(dir), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('changing one practice question rewrites only its lock, with a fresh key and IV', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'practice-'));
  try {
    const first = await writePracticeLocks({ dir, bodies: pool(12), asOf: '2026-11-25', pub, lock });
    const before = snapshot(dir);
    const bodies = pool(12);
    bodies[4] = practiceBody(5, 'v2', round(4, 99));
    const second = await writePracticeLocks({ dir, bodies, prevHashes: first.a, asOf: '2026-12-02', pub, lock });
    assert.equal(second.wrote, 1);
    const after = snapshot(dir);
    for (const f of Object.keys(before)) {
      if (f === '5.lock') assert.notEqual(after[f], before[f]);
      else assert.equal(after[f], before[f], f);
    }
    const o = JSON.parse(before['5.lock']), n = JSON.parse(after['5.lock']);
    assert.notEqual(n.iv, o.iv);
    assert.notEqual(n.key, o.key);
    const plain = await unlock(n, privJwk);
    assert.deepEqual(plain.round, bodies[4].round);
    assert.equal(plain.practice, 5);
    assert.equal(plain.asOf, '2026-12-02');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a missing lock, a lock under another key id and no stored hashes are rewritten; extra locks go', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'practice-'));
  try {
    const first = await writePracticeLocks({ dir, bodies: pool(6), asOf: '2026-11-25', pub, lock });
    rmSync(join(dir, '2.lock'));
    const l3 = JSON.parse(readFileSync(join(dir, '3.lock'), 'utf8'));
    writeFileSync(join(dir, '3.lock'), JSON.stringify({ ...l3, kid: 'old-kid' }) + '\n');
    const second = await writePracticeLocks({ dir, bodies: pool(4), prevHashes: first.a, asOf: '2026-11-25', pub, lock });
    assert.equal(second.wrote, 2);
    assert.ok(existsSync(join(dir, '2.lock')));
    assert.equal(JSON.parse(readFileSync(join(dir, '3.lock'), 'utf8')).kid, 'test-kid');
    assert.deepEqual(readdirSync(dir).sort(), ['1.lock', '2.lock', '3.lock', '4.lock']);
    const third = await writePracticeLocks({ dir, bodies: pool(4), asOf: '2026-11-25', pub, lock });
    assert.equal(third.wrote, 4);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('data/practice.json has one content hash per practice key', () => {
  const p = JSON.parse(readFileSync(new URL('../data/practice.json', import.meta.url), 'utf8'));
  assert.equal(p.a.length, p.keys.length);
  for (const h of p.a) assert.match(h, /^[0-9a-f]{64}$/);
});
