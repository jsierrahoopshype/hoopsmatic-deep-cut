// Download every source file at the commit data/sources.lock.json pins, into
// .cache/sources/<id>.json (not committed; some are 10+ MB), and refuse any
// file whose sha256 differs from the lock. Public files, no token.
//
//   node scripts/pull-data.mjs            exactly what the lock pins
//   node scripts/pull-data.mjs --latest   each repo's latest commit, and the
//                                         lock is updated (the weekly refresh)
// --latest refuses a file whose row count fell by more than 10% (a broken
// source), as the crossword's pull does.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const lock = JSON.parse(readFileSync(ROOT + 'data/sources.lock.json', 'utf8'));
mkdirSync(ROOT + '.cache/sources', { recursive: true });

const latest = process.argv.includes('--latest');
const heads = {};
const head = (repo) => heads[repo] ??= execFileSync('git', ['ls-remote', `https://github.com/${repo}.git`, 'HEAD'], { encoding: 'utf8' }).split(/\s/)[0];
const rowsOf = (j) => (Array.isArray(j) ? j.length : Array.isArray(j.players) ? j.players.length : Object.keys(j.seasons || j.slugs?.player || j).length);
if (latest) for (const s of lock.sources) s.commit = head(s.repo);
if (latest) lock.births.commit = head(lock.births.repo);

let bad = 0;
for (const s of lock.sources) {
  const url = `https://raw.githubusercontent.com/${s.repo}/${s.commit}/${s.path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  const sha = createHash('sha256').update(text).digest('hex');
  if (latest) {
    const rows = rowsOf(JSON.parse(text));
    if (rows < s.rows * 0.9) { console.error(`${s.id}: rows fell from ${s.rows} to ${rows}`); bad++; continue; }
    Object.assign(s, { sha256: sha, bytes: text.length, rows });
  } else if (sha !== s.sha256) { console.error(`${s.id}: sha256 differs from the lock`); bad++; continue; }
  writeFileSync(`${ROOT}.cache/sources/${s.id}.json`, text);
  console.log(`${s.id.padEnd(9)} ${s.commit.slice(0, 7)} ok`);
}
if (bad) process.exit(1);

// Birthplaces: Jorge's Born & Died site (public repo nba-born-died) lists
// every player's birthplace as "City, State" or "City, Country" on its
// born/<year>/ pages. Pinned by commit in the lock (lock.births); only the
// derived name -> birthplace table is kept, in .cache/sources/births.json.
{
  const b = lock.births;
  // One page per birth year that has players; a year with none is a 404.
  const out = {};
  let pages = 0;
  for (let y = 1900; y <= new Date().getUTCFullYear() - 15; y++) {
    const res = await fetch(`https://raw.githubusercontent.com/${b.repo}/${b.commit}/born/${y}/index.html`);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`births: ${res.status} for ${y}`);
    pages++;
    const html = await res.text();
    for (const row of html.split('<tr')) {
      const m = row.match(/href="\.\.\/\.\.\/player\/[^/]+\/">([^<]+)<\/a>/);
      const pl = row.match(/data-label="Birthplace" data-v="([^"]*)"/);
      if (m && pl) out[decode(m[1])] = decode(pl[1]);
    }
  }
  if (pages < 80 || Object.keys(out).length < 5000) throw new Error(`births: only ${pages} pages, ${Object.keys(out).length} players`);
  writeFileSync(ROOT + '.cache/sources/births.json', JSON.stringify(out));
  console.log(`births    ${b.commit.slice(0, 7)} ${Object.keys(out).length} players`);
}
if (latest) writeFileSync(ROOT + 'data/sources.lock.json', JSON.stringify(lock, null, 1) + '\n');
function decode(s) { return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
