// Deep Cut scoring. Pure functions, no data access: the Deep Cut server keeps
// an exact copy of this file, and the prompt build stores each answer's
// instant score in the prompt file, so page, build and server always agree.
//
// INSTANT SCORE (0-100), shown the moment a valid pick is made. Obscurity in
// Jorge's data only: fame tier first, then games, minutes and fame within
// the tier.
//   tier   fame (crossword formula)   band
//   star   25+                         0-40
//   known  8 to 25                    35-70
//   deep   under 8                    65-100
// Within the band: obscurity o = 1 - (0.4 fameN + 0.3 gamesN + 0.3 minutesN),
// each term 0..1 (games and minutes on a log scale, capped at 1,500 games and
// 55,000 minutes), and score = low + o * (high - low).
//
// FINAL SCORE (the next morning, by the server). Crowd rarity of the pick:
//   crowd = 100 * (1 - ln(1 + pickers) / ln(1 + answers))
// pickers = players who picked the same player, answers = all valid picks that
// day. The crowd's weight grows with the day's answers:
//   w = 0.8 * answers / (answers + 100)      (10 -> 7%, 100 -> 40%, 1,000 -> 73%)
//   final = round((1 - w) * instant + w * crowd)
export const BANDS = { star: [0, 40], known: [35, 70], deep: [65, 100] };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const logN = (x, cap) => clamp01(Math.log1p(Math.max(0, x)) / Math.log1p(cap));

export const tierOf = (fame) => (fame >= 25 ? 'star' : fame >= 8 ? 'known' : 'deep');

export function instantScore({ fame, gp, min }) {
  const tier = tierOf(fame);
  const fameN = tier === 'star' ? clamp01((fame - 25) / 75) : tier === 'known' ? clamp01((fame - 8) / 17) : clamp01(fame / 8);
  const o = 1 - (0.4 * fameN + 0.3 * logN(gp, 1500) + 0.3 * logN(min, 55000));
  const [lo, hi] = BANDS[tier];
  return Math.round(lo + o * (hi - lo));
}

export function crowdScore(pickers, answers) {
  if (answers < 1 || pickers < 1) return 100;
  return 100 * (1 - Math.log1p(pickers) / Math.log1p(answers));
}
export const crowdWeight = (answers) => 0.8 * answers / (answers + 100);
export function finalScore(instant, pickers, answers) {
  const w = crowdWeight(answers);
  return Math.round((1 - w) * instant + w * crowdScore(pickers, answers));
}
