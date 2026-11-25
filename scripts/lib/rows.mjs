// Row count of a source file, for the weekly pull's guard (scripts/pull-data.mjs
// --latest refuses a file whose rows fell by more than 10%):
//   an array                      its length (nba-player-data, Career Map, teams)
//   Salary Season Finder data.json its season rows (`seasons`; the file also
//                                  has `players`, a list of names, which is
//                                  not its rows: counting that one tripped
//                                  the guard, 18855 -> 3330)
//   nba-headshots players.json     its `players` list
//   Salary Season Finder slugs     its player slugs
export const rowsOf = (j) => (Array.isArray(j) ? j.length
  : j.seasons ? Object.keys(j.seasons).length
  : Array.isArray(j.players) ? j.players.length
  : Object.keys(j.slugs?.player || j).length);
