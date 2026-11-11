# Deep Cut, step 1: prompt generator

Samples with full answer lists: [step1-samples.md](step1-samples.md).

## What the generator does

`node scripts/pull-data.mjs` downloads the pinned source files, then `node scripts/generate-prompts.mjs` builds every candidate prompt, checks it, and lays out a seeded 365-day schedule (same data, same schedule). It takes about 2 seconds and needs no GitHub Action.

Sources (`data/sources.lock.json`): Jorge's public repos, at the same commits the NBA Crossword pins.

| File | Used for |
|---|---|
| nba-player-data `bio.json` | player list, nationality, draft class |
| nba-player-data `rsStats.json` | team per season, games, minutes |
| nba-player-data `poStats.json` | which team a title was won with |
| nba-player-data `awards.json` | All-Star, All-Rookie, All-Defensive, All-NBA, titles, fame |
| salary-season-finder `data/data.json` | college, draft pick (1990-91 on). Salaries are not read. |
| salary-season-finder `data/slugs.json` | HoopsMatic player page slugs |
| nba-career-map `nba_players_careers.json` | college for players before 1990-91 |
| `rules/franchises.json` (copied from the crossword) | team names as they were each season |

Prompt types and how many pass the rules (at least 15 answers, at most 150, 2+ stars, 3+ deep cuts, stars no more than half):

| Type | Example | Pass | Days in schedule |
|---|---|---|---|
| Two teams | Celtics and Mavericks | 244 | 144 |
| Teammate of a star | teammate of Scottie Pippen on the Bulls | 144 | 123 |
| Team + draft class | 1970s draft class, Atlanta Hawks | 179 | 52 |
| Award + team | won a title with the Bucks | 29 | 26 |
| Country + team | from outside the U.S., Lakers | 15 | 13 |
| College (+ team or draft decade) | Clippers and UCLA | 9 | 7 |

Answers per day: min 15, median 44, max 145. The 14 samples are taken out of the schedule, so the report spoils no real day.

## Decisions I made (flag any you want changed)

- **Team names.** Each era's own name. Two merges: the 2005-07 New Orleans/Oklahoma City Hornets count as New Orleans Hornets; Kansas City-Omaha Kings count as Kansas City Kings. Both Charlotte Hornets eras carry years: "(1988-2002)" and "(2014-present)".
- **Draft class.** `bio.json` DRAFT includes undrafted players (Ben Wallace = 1996), so draft prompts say "(drafted or undrafted)".
- **Awards with a team.** awards.json's TEAM column is unreliable (the crossword found the same), so an award counts for the team(s) the player played for that season. A player traded during an award season counts for both teams.
- **Fame.** The crossword's fame formula, plus one Deep Cut rule: draft classes 2022 on, picks 1-3 get +12 and picks 4-10 get +6. Otherwise a No. 1 pick in his first year would score as a deep cut.
- **Instant score.** In `scripts/lib/score.mjs`: tier band (star 0-40, known 35-70, deep 65-100), then games, minutes and fame within the band. The final-score formula is in the same file. The crowd's weight is 7% at 10 answers, 40% at 100 and 73% at 1,000.
- **College is thin.** A single team plus a college rarely reaches 15 answers, because college data is short for older players. I added "college + draft decade". College days come to 7 a year.

## Open questions for Jorge

1. **Answers in git.** If the 365 prompts are committed as plain JSON, anyone can read tomorrow's answers in the public repo. I'd do it the crossword way: commit one encrypted `.lock` per day, readable only by the Deep Cut server. Prompt text could stay plain or be locked too. I'm holding the schedule (`.cache/prompts.json`, gitignored) until you choose.
2. **Current season.** The data is a snapshot (the 2026-27 season so far). A player who first plays for a team after the snapshot would be refused for that team's prompts. Options: accept it, or count only seasons through 2025-26 for teams that are still active.
3. **Wrong tries.** Should a pick that doesn't fit the prompt cost points (for example, -10 per miss), or only use up a try?
4. **Launch date.** The schedule starts 2026-12-01 as a placeholder (`--start`).

## Where the server will live

- **Code:** `hoopsmatic-worker/deep-cut-server/`, a new Worker `hoopsmatic-deep-cut-server` with one SQLite Durable Object, built like `crossword-server/`. Its own route is `hoopsmatic.com/deep-cut/api/*`, and it is deployed only by a new `deploy-deep-cut-server.yml` on merge to main. It copies `scripts/lib/score.mjs` exactly.
- **Main Worker changes (step 2, after the state check):** `/deep-cut/` is served from this repo's GitHub Pages as a subtree tool like `/crossword/`, with noindex on until you approve. `/deep-cut/prompts/*` passes through to the lock files, and a no-store 404 is served if the API route is missing. The sitemap with per-URL lastmod from a content hash comes later.
- **Files the server reads at runtime:** only `https://hoopsmatic.com/deep-cut/prompts/YYYY-MM-DD.lock`, one per day. Each holds the prompt, every valid player id with its instant score, name and HoopsMatic link. The server never reads the raw source files. The page reads a public `players.json` (name, id, years) for the suggestion list, with nothing about any prompt in it.
- **Endpoints (step 2):** `GET today` (prompt, number), `POST pick {device, id}` (valid or not, tries left, instant score), `GET results/YYYY-MM-DD` (after 9:00 AM ET the next day: every answer with its %, your rank and final score), `GET archive/YYYY-MM-DD`. The day changes at 9:00 AM ET using the crossword's `dailyDate()`. Archive plays are never ranked.

## Draft text for hoopsmatic.com/privacy

> **Deep Cut.** When you play Deep Cut, we store the player you picked, the day's prompt, your tries and your score, so we can show tomorrow how many people picked each player and where you rank. To tell your answers apart from other people's, your browser keeps a random ID that we create. We store only a scrambled form of it (a keyed hash), which cannot be turned back into the ID or linked to you. We do not ask for or store your name, email or account, and we do not store your IP address. To limit abuse, we count answers per network with a code that changes every day and is deleted after two days. Answers are kept for up to 400 days and then deleted. Daily totals (how many people picked each player) may be kept longer, but they contain nothing about any one person. If a later version lets you add a name to a leaderboard, the name is stored only when you submit it.

This mirrors what the crossword server does (keyed-hash device ID, daily-salted network count deleted after 2 days, 400-day retention). Check it against the live crossword paragraph before publishing.
