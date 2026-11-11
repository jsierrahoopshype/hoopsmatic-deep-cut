// Download every source file at the commit data/sources.lock.json pins, into
// .cache/sources/<id>.json (not committed; some are 10+ MB), and refuse any
// file whose sha256 differs from the lock. Public files, no token.
//
//   node scripts/pull-data.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const lock = JSON.parse(readFileSync(ROOT + 'data/sources.lock.json', 'utf8'));
mkdirSync(ROOT + '.cache/sources', { recursive: true });

let bad = 0;
for (const s of lock.sources) {
  const url = `https://raw.githubusercontent.com/${s.repo}/${s.commit}/${s.path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  const sha = createHash('sha256').update(text).digest('hex');
  if (sha !== s.sha256) { console.error(`${s.id}: sha256 differs from the lock`); bad++; continue; }
  writeFileSync(`${ROOT}.cache/sources/${s.id}.json`, text);
  console.log(`${s.id.padEnd(9)} ${s.commit.slice(0, 7)} ok`);
}
if (bad) process.exit(1);
