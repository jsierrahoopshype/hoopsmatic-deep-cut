// Scoring check for Jorge's review (spec item 2): 6 prompt types, top and
// bottom 10 answers under scripts/lib/score2.mjs. Not used by the game yet.
//   node scripts/score-check.mjs
import { buildPlayers, unitName } from './lib/players.mjs';
import { rawScore, normalize } from './lib/score2.mjs';
const { players } = buildPlayers();
const byName = new Map(players.map((p) => [p.name, p]));
const gIn = (p, u) => p.seasons.filter((s) => s.unit === u).reduce((a, s) => a + s.gp, 0);
const U = (name) => { for (const p of players) for (const s of p.seasons) if (unitName(s.unit) === name) return s.unit; throw name; };
const sd = (p) => Math.floor((p.firstYear - 1) / 10) * 10;
const prompts = [];
{ const a = U('Boston Celtics'), b = U('Dallas Mavericks');
  prompts.push({ type: 'Two teams', text: 'played for the Boston Celtics and the Dallas Mavericks', conn: (p) => (p.units.has(a) && p.units.has(b) ? Math.min(gIn(p, a), gIn(p, b)) : null), why: 'games = smaller of the two stints' }); }
{ const st = byName.get('Scottie Pippen'), u = U('Chicago Bulls');
  const yrs = new Set(st.seasons.filter((s) => s.unit === u).map((s) => s.y));
  prompts.push({ type: 'Teammate', text: 'was a teammate of Scottie Pippen on the Chicago Bulls', conn: (p) => { if (p === st) return null; const g = p.seasons.filter((s) => s.unit === u && yrs.has(s.y)).reduce((a, s) => a + s.gp, 0); return g > 0 ? g : null; }, why: 'games = his Bulls games in Pippen seasons' }); }
{ const u = U('San Antonio Spurs');
  prompts.push({ type: 'Title + team', text: 'won an NBA title with the San Antonio Spurs', conn: (p) => (p.rings.some((r) => r.unit === u) ? gIn(p, u) : null), why: 'games = his Spurs games' }); }
{ const u = U('Los Angeles Lakers');
  prompts.push({ type: 'Birthplace + team', text: 'was born outside the United States and played for the Los Angeles Lakers', conn: (p) => (p.bornIn && p.bornIn !== 'United States' && p.units.has(u) ? gIn(p, u) : null), why: 'games = his Lakers games' }); }
{ const u = U('Phoenix Suns');
  prompts.push({ type: 'Career start + team', text: 'started his NBA career in the 1990s and played for the Phoenix Suns', conn: (p) => (sd(p) === 1990 && p.units.has(u) ? gIn(p, u) : null), why: 'games = his Suns games' }); }
{ const u = U('Denver Nuggets');
  prompts.push({ type: 'Stat season + team (new)', text: 'averaged 20+ points in a season for the Denver Nuggets (40+ games for them that season)', conn: (p) => { const q = p.seasons.filter((s) => s.unit === u && s.gp >= 40 && s.pts / s.gp >= 20); return q.length ? q.reduce((a, s) => a + s.gp, 0) : null; }, why: 'games = his games in those 20-point seasons' }); }
for (const pr of prompts) {
  const ans = []; for (const p of players) { const c = pr.conn(p); if (c != null) ans.push({ p, c, raw: rawScore({ fame: p.fame, careerGames: p.gp, connGames: c }) }); }
  const sc = normalize(ans.map((a) => a.raw)); ans.forEach((a, i) => (a.s = sc[i]));
  ans.sort((x, y) => y.s - x.s || x.p.name.localeCompare(y.p.name));
  const f = (a) => `${a.p.name.replace(/ \(\d{4}\)$/, '')} ${a.s} (fame ${Math.round(a.p.fame)}, ${a.p.gp} career g, ${a.c} link g)`;
  console.log(`\n## ${pr.type}: Name a player who ${pr.text}. ${ans.length} answers. [${pr.why}]`);
  console.log('TOP 10:    ' + ans.slice(0, 10).map(f).join('; '));
  console.log('BOTTOM 10: ' + ans.slice(-10).reverse().map(f).join('; '));
}
