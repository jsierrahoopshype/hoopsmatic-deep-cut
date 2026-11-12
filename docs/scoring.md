# Deep Cut scoring (version 2)

Approved by Jorge on Nov 12, 2026. Code: `scripts/lib/score2.mjs`. Prompts and their eligibility rules: `scripts/lib/cond.mjs`.

Every valid answer to a prompt scores **10 to 100**. The score is fixed when the day is built and frozen in that day's lock. The same player on the same prompt always gets the same score, and other people's picks never change it. Wrong or skipped rounds score 0, and the most a Daily can score is 500.

1. **Recognition (half the weight).** How well known the player is overall. This is the NBA Crossword's fame formula: MVPs, Finals MVPs, All-Star and All-NBA teams, titles, Hall of Fame, Top 75, other major awards and games played. Current players get +4, and recent top-10 picks get a bonus. Fame is put on a log scale capped at 150.
2. **Connection (half the weight).** How memorable the link to the prompt is, measured by the games behind it:
   - games with the team for a team prompt;
   - the shorter of the two stints for a two-team prompt;
   - games alongside the star for a teammate prompt;
   - games in the qualifying seasons for a stat prompt;
   - the whole career when the prompt has no team.

   Half comes from the games themselves (log scale, capped at 500) and half from their share of his career. That way a famous player's short, forgotten stint scores well.
3. **Short careers.** A player with very few NBA games is obscure but not automatically the best answer. His value is multiplied by 0.8 + 0.2 × min(1, ln(1 + games) / ln(1 + 150)): a 3-game career keeps about 85%, and 150+ games keep all of it.
4. **Normalized per prompt.** Answers are ranked by that value, rounded to 4 decimals. Score = 10 + 90 × (L + (T − 1) / 2) / (N − 1), rounded, where:
   - N = the number of valid answers;
   - L = answers with a lower value;
   - T = answers sharing this value.

   The most obvious answer scores 10 and the least obvious 100. Ties get the same score.

A prompt is used only with 15 to 150 valid answers and a raw spread of at least 0.3 between its most and least obvious answers.

The score does not claim to measure what share of fans would remember a player. No language model judges answers or sets scores.
