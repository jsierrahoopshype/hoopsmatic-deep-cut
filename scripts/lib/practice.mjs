// Practice locks (scripts/build.mjs): public/practice/<n>.lock, one round each.
//
// A lock is rewritten only when its content changes. The build cannot open a
// lock (only the server holds the private key), so data/practice.json keeps
// a = sha256 of each lock's content, as data/schedule.json does for the
// Daily: everything in the lock but asOf (the build date, which moves every
// run). An unchanged lock is left byte for byte; a new or changed one gets a
// fresh random key and IV from lock(). A lock made with another key id is
// rewritten too.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';

const sha = (s) => createHash('sha256').update(s).digest('hex');

// What a practice lock holds, without asOf.
export const practiceBody = (n, scoring, round) => ({ v: 2, game: 'deep-cut', practice: n, scoring, round });
export const practiceHash = (body) => sha(JSON.stringify(body));

function lockKid(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')).kid; } catch { return null; }
}

// bodies[i] is lock n = i + 1; prevHashes[i] the hash its file was made
// from (data/practice.json's a; [] if none). Returns the new hashes and how
// many files were written. Lock files past the pool's end are removed.
export async function writePracticeLocks({ dir, bodies, prevHashes = [], asOf, pub, lock }) {
  const a = [];
  let wrote = 0;
  for (let n = 1; n <= bodies.length; n++) {
    const body = bodies[n - 1], h = practiceHash(body), path = `${dir}/${n}.lock`;
    a.push(h);
    if (prevHashes[n - 1] === h && existsSync(path) && lockKid(path) === pub.kid) continue;
    const { v, game, practice, scoring, round } = body;
    writeFileSync(path, JSON.stringify(await lock({ v, game, practice, scoring, asOf, round }, pub)) + '\n');
    wrote++;
  }
  const keep = new Set(bodies.map((_, i) => `${i + 1}.lock`));
  for (const f of readdirSync(dir)) if (f.endsWith('.lock') && !keep.has(f)) unlinkSync(`${dir}/${f}`);
  return { a, wrote };
}
