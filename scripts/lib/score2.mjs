// Deep Cut scoring, version 2 (fixed, no crowd). Pure functions.
//
// Every valid answer to a prompt gets a raw obscurity from two parts:
//   recognition  how well known the player is overall: the NBA Crossword's
//                fame formula (MVPs, Finals MVPs, All-Star and All-NBA
//                teams, titles, Hall of Fame, Top 75, other awards, games
//                played; +4 for current players; recent top picks get a
//                bonus). rN = ln(1 + fame) / ln(1 + 150), capped at 1.
//   connection   how memorable the qualifying link is: the games behind it
//                (games with the team for a team prompt, the smaller of the
//                two stints for a two-team prompt, games played alongside
//                the star for a teammate prompt, the whole career when the
//                prompt has no team). cN = ln(1 + games) / ln(1 + 500), capped at 1.
//   raw = 0.55 * (1 - rN) + 0.45 * (1 - cN)
// So a famous player's short forgotten stint still scores well, and career
// fame can't outweigh the link on its own.
//
// "Knowable" damping: a player with very few NBA games is obscure but not a
// better answer for it. raw is multiplied by 0.8 + 0.2 * min(1, ln(1 + career
// games) / ln(1 + 150)): a 3-game career keeps about 85% of its raw, 150+
// games keep all of it.
//
// Normalized per prompt: answers are ranked by raw (rounded to 4 decimals,
// so equal raws are a tie). score = 10 + 90 * (L + (T - 1) / 2) / (N - 1),
// rounded, where N = valid answers, L = answers with a lower raw, T = answers
// sharing this raw (itself included). The most obvious answer gets 10, the
// least obvious 100, ties get the same score. Fixed once a day is published.
export const VERSION = 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
export function rawScore({ fame, careerGames, connGames }) {
  const rN = clamp01(Math.log1p(Math.max(0, fame)) / Math.log1p(150));
  const absN = clamp01(Math.log1p(Math.max(0, connGames)) / Math.log1p(500));
  const shareN = Math.sqrt(clamp01(connGames / Math.max(1, careerGames)));
  const cN = 0.5 * absN + 0.5 * shareN;
  const knowable = 0.8 + 0.2 * clamp01(Math.log1p(Math.max(0, careerGames)) / Math.log1p(150));
  return Math.round((0.5 * (1 - rN) + 0.5 * (1 - cN)) * knowable * 10000) / 10000;
}
export function normalize(raws) {
  const n = raws.length;
  if (n === 1) return [100];
  return raws.map((r) => {
    let L = 0, T = 0;
    for (const x of raws) { if (x < r) L++; else if (x === r) T++; }
    return Math.round(10 + 90 * (L + (T - 1) / 2) / (n - 1));
  });
}
