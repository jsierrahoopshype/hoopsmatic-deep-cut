// Headshots for every player in the suggestion list (Jorge, Nov 12, 2026:
// most correct answers are deep cuts, so initials must be the exception).
//
//   node scripts/headshots.mjs        (after generate-prompts.mjs)
//
// Sources, best first:
//   f:<file>   Jorge's nba-headshots "face-fill" set (THE HoopsMatic headshot,
//              transparent WebP, recent players);
//   n:<nbaId>  NBA.com's headshot by player ID (cdn.nba.com, transparent PNG,
//              shown on the page's light-grey circle).
// Jorge's Born & Died faces are not used: they sit on a dark background
// (Jorge: white or light-grey only).
//              NBA.com answers every unknown ID with one placeholder image; a
//              player whose image is that placeholder has no NBA.com headshot.
// No source: the page shows initials on a light-grey circle.
//
// NBA IDs come from Jorge's NBA Head to Head site (data/search.json: id,
// name, slug, first and last season), matched by name and career years.
// Results are kept in data/headshots.json, so a refresh only checks players
// it has not seen; public/players.json gets the tag (row[6]).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const H2H = 'https://jsierrahoopshype.github.io/nba-head-to-head/data/search.json';
const CDN = 'https://cdn.nba.com/headshots/nba/latest/260x190/';
const PLACEHOLDER_MD5 = '7475ba9619305909d7998dd9dba02481';
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const plist = JSON.parse(readFileSync(ROOT + 'public/players.json', 'utf8'));
const cachePath = ROOT + 'data/headshots.json';
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : { players: {}, nba: {} };

// NBA IDs by name (+ years to tell namesakes apart).
const search = await (await fetch(H2H)).json();
if (!Array.isArray(search) || search.length < 4000) throw new Error('head-to-head search.json looks wrong');
const byName = new Map();
for (const s of search) { const k = norm(s[1]); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(s); }
function nbaIdOf(row) {
  const cands = byName.get(norm(row[1])) || [];
  if (cands.length === 1) return cands[0];
  // Namesakes: the one whose first season matches the career years ("1996-10").
  const first = +row[2].split('-')[0];
  return cands.find((s) => Math.abs(s[3] - first) <= 1) || null;
}

async function cdnHas(id) {
  if (id in cache.nba) return cache.nba[id];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(CDN + id + '.png');
      if (res.status === 404) return (cache.nba[id] = false);
      if (!res.ok) throw new Error(String(res.status));
      const buf = Buffer.from(await res.arrayBuffer());
      return (cache.nba[id] = createHash('md5').update(buf).digest('hex') !== PLACEHOLDER_MD5);
    } catch (e) { await new Promise((r) => setTimeout(r, 1000 * attempt)); }
  }
  return null;   // unknown this run: try again next time
}

const rows = plist.players;
const todo = [];
let fFace = 0, nFace = 0, none = 0, noId = 0;
for (const row of rows) {
  if (typeof row[6] === 'string' && row[6] && !row[6].includes(':')) { row[6] = 'f:' + row[6]; fFace++; continue; }
  if (typeof row[6] === 'string' && row[6].startsWith('f:')) { fFace++; continue; }
  const s = nbaIdOf(row);
  if (!s) { noId++; row[6] = 0; continue; }
  todo.push([row, s[0]]);
}
// NBA.com, 8 at a time.
for (let i = 0; i < todo.length; i += 8) {
  await Promise.all(todo.slice(i, i + 8).map(async ([row, id]) => {
    const ok = await cdnHas(id);
    if (ok) { row[6] = 'n:' + id; nFace++; } else { row[6] = 0; none++; }
  }));
}
for (const row of rows) cache.players[row[0]] = row[6] || 0;
writeFileSync(cachePath, JSON.stringify({ _about: 'Headshot source per player (scripts/headshots.mjs): f: nba-headshots face-fill, n: NBA.com by player ID, 0: none. nba: NBA.com ID -> has a real headshot.', ...cache }) + '\n');
writeFileSync(ROOT + 'public/players.json', JSON.stringify(plist));
console.log(`players ${rows.length}: face-fill ${fFace}, NBA.com ${nFace}, none ${none}, no NBA ID ${noId}`);
