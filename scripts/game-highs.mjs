// Single-game highs per player, team and season, from Alberto's box-score
// archive (aderoa/nba-boxscores: one ndjson line per player per game).
//
//   git clone --depth 1 --filter=blob:none --no-checkout https://github.com/aderoa/nba-boxscores <dir>
//   node scripts/game-highs.mjs <dir>
//
// Writes data/game-highs.json (committed: the weekly refresh can't download
// the 420 MB archive), with the archive's commit in it. Regular-season games only (game
// ids starting 002). Per player name and season ending year:
//   { "<name>|<season>": { "<team code>": [pts, reb, ast, threes, triple-doubles, 40+ games, 50+ games] } }
// Rebounds are null before 1950-51 and threes before 1979-80 in the archive
// (the line didn't exist); a null never counts as a high.
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/game-highs.mjs <nba-boxscores clone>'); process.exit(2); }
const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const files = execFileSync('git', ['-C', dir, 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' }).split('\n').filter((f) => /^data\/\d{4}\/boxscores\.ndjson$/.test(f));
const out = {};
let rows = 0;
for (const f of files) {
  const p = spawn('git', ['-C', dir, 'cat-file', '-p', 'HEAD:' + f]);
  for await (const line of createInterface({ input: p.stdout })) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (!String(r.gameId).startsWith('002') || r.pts == null) continue;
    rows++;
    const k = r.name + '|' + r.sy;
    const t = ((out[k] ??= {})[r.team] ??= [0, 0, 0, 0, 0, 0, 0]);
    t[0] = Math.max(t[0], r.pts);
    if (r.reb != null) t[1] = Math.max(t[1], r.reb);
    if (r.ast != null) t[2] = Math.max(t[2], r.ast);
    if (r.tpm != null) t[3] = Math.max(t[3], r.tpm);
    if (r.reb != null && r.ast != null && [r.pts, r.reb, r.ast, r.stl ?? 0, r.blk ?? 0].filter((x) => x >= 10).length >= 3) t[4]++;
    if (r.pts >= 40) t[5]++;
    if (r.pts >= 50) t[6]++;
  }
  console.log(f, rows);
}
writeFileSync(ROOT + 'data/game-highs.json', JSON.stringify({ _about: 'Single-game regular-season highs (scripts/game-highs.mjs) from aderoa/nba-boxscores: [pts, reb, ast, threes, triple-doubles, 40+ games, 50+ games] per name|season and team code.', repo: 'aderoa/nba-boxscores', commit, rows, highs: out }));
console.log('player-team-seasons', Object.keys(out).length, 'rows', rows, 'commit', commit);
