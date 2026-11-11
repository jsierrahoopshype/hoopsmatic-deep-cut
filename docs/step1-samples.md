# Deep Cut, step 1: sample prompts

Built by `node scripts/generate-prompts.mjs` from the files pinned in `data/sources.lock.json`. These 14 prompts are never scheduled (data/excluded.json), so this page spoils no real day.

Score = instant score (0-100, obscurity in the data; formula in `scripts/lib/score.mjs`). Tier: star = fame 25+, known = 8 to 25, deep = under 8 (the NBA Crossword's fame formula). Each list is sorted from most to least famous.

## 1. Name a player who played for the Boston Celtics and the Dallas Mavericks.

Type: two-teams. Valid answers: 48 (3 stars, 19 known, 26 deep cuts).

Examples: star **Kyrie Irving** 13 · mid **Dwight Powell** 48 · deep cut **Jonathan Gibson** 90

Kyrie Irving (13), Rajon Rondo (16), Kemba Walker (18), Antoine Walker (40), Jason Terry (40), Sam Cassell (40), Michael Finley (41), David Lee (42), Isaiah Thomas (44), Kristaps Porzingis (46), Jae Crowder (47), Jameer Nelson (47), Dwight Powell (48), Josh Richardson (50), Courtney Lee (51), Fred Roberts (51), Kris Humphries (51), Mark Bryant (51), Stacey King (51), Grant Williams (52), Mike James (52), Justin Jackson (53), Brandon Bass (68), Troy Murphy (68), Damon Jones (70), Gerald Green (70), Aleksandar Pavlovic (72), Marquis Daniels (72), Popeye Jones (72), Raef LaFrentz (72), Tony Delk (72), Erick Strickland (73), Adrian Griffin (74), Eric Montross (74), Ryan Hollins (74), Brandan Wright (75), Danny Fortson (75), Delonte West (75), Dan Dickau (78), Doug Smith (78), Lorenzo Williams (79), Shane Larkin (79), Terry Duerod (80), Eric Riley (82), Sean Williams (83), Kelvin Upshaw (84), Bruno Sundov (86), Jonathan Gibson (90)

## 2. Name a player who played for the Cleveland Cavaliers and the Phoenix Suns.

Type: two-teams. Valid answers: 57 (3 stars, 26 known, 28 deep cuts).

Examples: star **Shaquille O'Neal** 1 · mid **Mark West** 48 · deep cut **Jimmy Oliver** 86

Shaquille O'Neal (1), Shawn Marion (16), Kevin Johnson (17), Dan Majerle (41), James Edwards (42), JaVale McGee (42), Larry Nance (42), Steve Kerr (42), Isaiah Thomas (44), Robin Lopez (46), Dick Snyder (47), Jae Crowder (47), James Jones (47), Marcus Morris (47), Scott Williams (47), Channing Frye (48), Mark West (48), Tyrone Corbin (48), Ricky Rubio (49), Chris Dudley (50), Hot Rod Williams (50), Jim Jackson (50), Chucky Brown (51), Mark Bryant (51), Seth Curry (51), Brandon Knight (52), Cameron Payne (52), Damian Jones (52), Shannon Brown (53), Brevin Knight (68), McCoy McLemore (68), Wesley Person (68), Mike Sanders (70), Brian Skinner (71), Corie Blount (71), Marquese Chriss (72), Mike Bratz (72), Sebastian Telfair (72), Walt Wesley (72), Jeff Cook (73), Ty Jerome (73), Jumaine Jones (74), Milt Palacio (74), Louis Amundson (75), Jon Leuer (76), AJ Price (79), Smush Parker (79), Tim Kempton (79), Earl Clark (80), Jordan McRae (80), Antonio Lang (83), Tony Dumas (83), Sedric Toney (84), Greg Howard (85), Joe Courtney (85), Dwayne Jones (86), Jimmy Oliver (86)

## 3. Name a player who played for the Houston Rockets and the Miami Heat.

Type: two-teams. Valid answers: 35 (3 stars, 20 known, 12 deep cuts).

Examples: star **Joe Johnson** 13 · mid **James Posey** 47 · deep cut **Briante Weber** 87

Joe Johnson (13), Kyle Lowry (14), Glen Rice (17), Goran Dragic (39), Kevin Willis (39), Juwan Howard (41), Otis Thorpe (42), Trevor Ariza (42), Victor Oladipo (42), PJ Tucker (45), Shane Battier (45), Brent Barry (46), Rod Strickland (46), James Posey (47), Kelly Olynyk (47), Avery Bradley (49), Clarence Weatherspoon (49), Jim Jackson (50), Ryan Anderson (50), Shandon Anderson (50), Derek Anderson (51), Mike James (52), James Ennis (53), Rafer Alston (69), Walt Williams (69), Gerald Green (70), Michael Beasley (71), Josh Christopher (76), Toney Douglas (76), Luther Head (77), Daequan Cook (78), Sam Mack (79), Loren Woods (81), Bobby Jones (85), Briante Weber (87)

## 4. Name a player who played for the Los Angeles Clippers and went to college at UCLA.

Type: team-college. Valid answers: 16 (4 stars, 6 known, 6 deep cuts).

Examples: star **Russell Westbrook** 4 · mid **Darren Collison** 48 · deep cut **Kenny Fields** 82

Russell Westbrook (4), Bill Walton (13), Jamaal Wilkes (16), Marques Johnson (17), Baron Davis (44), Norman Powell (45), Kiki Vandeweghe (46), Darren Collison (48), Matt Barnes (48), Jordan Farmar (51), Luc Mbah a Moute (69), Pooh Richardson (70), Darrick Martin (73), Ryan Hollins (74), Moses Brown (76), Kenny Fields (82)

## 5. Name a player who went to college at Duke and started his NBA career in the 2010s.

Type: team-college. Valid answers: 32 (2 stars, 12 known, 18 deep cuts).

Examples: star **Kyrie Irving** 13 · mid **Luke Kennard** 51 · deep cut **Trevon Duval** 96

Kyrie Irving (13), Jayson Tatum (14), Brandon Ingram (43), Mason Plumlee (47), Tyus Jones (48), Austin Rivers (49), Zion Williamson (49), Gary Trent Jr (51), Luke Kennard (51), Seth Curry (51), Wendell Carter Jr (51), Grayson Allen (52), RJ Barrett (52), Rodney Hood (52), Justise Winslow (70), Marvin Bagley (70), Jabari Parker (71), Cam Reddish (72), Jahlil Okafor (73), Frank Jackson (74), Harry Giles (75), Quinn Cook (75), Lance Thomas (76), Kyle Singler (77), Miles Plumlee (77), Ryan Kelly (82), Marques Bolden (84), Nolan Smith (86), Marshall Plumlee (89), Amile Jefferson (90), Andre Dawkins (95), Trevon Duval (96)

## 6. Name a player who started his NBA career in the 2010s and played for the Philadelphia 76ers.

Type: team-draft. Valid answers: 126 (4 stars, 36 known, 86 deep cuts).

Examples: star **Paul George** 10 · mid **Landry Shamet** 50 · deep cut **Jacob Pullen** 96

Paul George (10), Jimmy Butler (13), Joel Embiid (13), Jaylen Brown (16), Andre Drummond (39), Nikola Vucevic (40), Ben Simmons (41), Kentavious Caldwell-Pope (42), Reggie Jackson (45), Tobias Harris (45), Ishmael Smith (46), Justin Holiday (47), Marcus Morris (47), Alec Burks (48), Buddy Hield (48), Jerami Grant (48), TJ McConnell (48), Greg Monroe (49), Kelly Oubre (49), Montrezl Harrell (49), Patrick Beverley (49), Josh Richardson (50), Landry Shamet (50), Michael Carter-Williams (50), Robert Covington (50), Dario Saric (51), Dewayne Dedmon (51), Georges Niang (51), Mike Muscala (51), Seth Curry (51), Trey Burke (51), Anfernee Simons (52), Cameron Payne (52), De'Anthony Melton (52), Nerlens Noel (52), Raul Neto (52), Richaun Holmes (52), Willie Cauley-Stein (52), James Ennis (53), Oshae Brissett (54), Caleb Martin (69), Evan Turner (69), Matisse Thybulle (69), Christian Wood (70), Dean Wade (70), Lonnie Walker (70), Mo Bamba (70), Nik Stauskas (70), Shake Milton (70), Tyler Johnson (70), Boban Marjanovic (71), Danuel House (71), Furkan Korkmaz (71), Timothe Luwawu (71), Markelle Fultz (72), Mike Scott (72), Tim Frazier (72), Darius Bazley (73), Haywood Highsmith (73), Jahlil Okafor (73), Jalen McDaniels (73), Justin Anderson (73), Tiago Splitter (73), Tony Bradley (73), Trevor Booker (73), Guerschon Yabusele (74), Kyle O'Quinn (74), Shelvin Mack (74), Gary Clark (75), DJ Wilson (76), Lavoy Allen (76), Glenn Robinson III (78), James Michael McAdoo (78), Thomas Robinson (78), Hollis Thompson (79), Ignas Brazdeikis (79), Jonathon Simmons (79), Isaiah Canaan (80), JaKarr Sampson (80), James Anderson (80), Charlie Brown (81), Norvel Pelle (81), Terrance Ferguson (81), Alexey Shved (82), Kendall Marshall (82), Louis King (82), Rayjon Tucker (82), Tacko Fall (82), Tony Wroten (82), Christapher Johnson (83), Henry Sims (83), KJ McDaniels (83), Phil Pressey (83), Charles Jenkins (84), Chasson Randle (84), Darius Morris (84), Elliot Williams (84), James Young (85), Jeremy Pargo (85), Lorenzo Brown (85), Brandon Davies (86), Alex Poythress (87), Arnett Moultrie (87), Daniel Orton (87), Jonah Bolden (87), Furkan Aldemir (88), Jarvis Varnado (88), Malcolm Lee (88), Malcolm Thomas (88), James Nunnally (89), Maalik Wayns (89), Demetrius Jackson (90), Justin Harper (90), Justin Patton (90), Larry Drew II (90), Shawn Long (90), Vincent Poirier (90), Craig Brackins (91), Zhaire Smith (91), Casper Ware (92), Drew Gordon (92), Adonis Thomas (94), Darius Johnson-Odom (94), Marial Shayok (94), Xavier Silas (94), Jacob Pullen (96)

## 7. Name a player who started his NBA career in the 1960s and played for the Milwaukee Bucks.

Type: team-draft. Valid answers: 37 (3 stars, 12 known, 22 deep cuts).

Examples: star **Kareem Abdul-Jabbar** 0 · mid **Lucius Allen** 50 · deep cut **John Arthurs** 92

Kareem Abdul-Jabbar (0), Oscar Robertson (1), Bob Dandridge (16), Bob Love (40), Norm Van Lier (42), Bob Boozer (46), Jon McGlocklin (47), Steve Mix (49), Bob Weiss (50), Lucius Allen (50), Flynn Robinson (51), John Block (51), Len Chappell (51), Steve Kuberski (51), Wali Jones (52), Jim Fox (68), McCoy McLemore (68), Greg Smith (69), Bob Rule (70), Fred Carter (71), Toby Kimball (72), Walt Wesley (72), Ron Williams (73), Zaid Abdul-Aziz (73), Dick Cunningham (74), Fred Hetzel (75), Dick Garrett (77), Freddie Crawford (78), Gary Gregor (78), Bill Dinwiddie (81), Bob Warlick (82), Charlie Paulk (84), Bob Greacen (85), Samuel Williams (86), Rich Niemann (89), Jay Miller (92), John Arthurs (92)

## 8. Name a player who won an NBA title with the Philadelphia Warriors.

Type: award-team. Valid answers: 20 (4 stars, 2 known, 14 deep cuts).

Examples: star **Paul Arizin** 9 · mid **Joe Graboski** 49 · deep cut **Petey Rosenberg** 83

Paul Arizin (9), Neil Johnston (13), Tom Gola (16), Joe Fulks (18), Jack George (46), Joe Graboski (49), George Senesky (70), Walt Davis (71), Howie Dallmar (72), Ernie Beck (73), George Dempsey (74), Jerry Fleishman (76), Angelo Musi (79), Jackie Moore (80), Jerry Rullo (81), Ralph Kaplowitz (81), Art Hillhouse (82), Larry Hennessy (83), Matt Guokas, Sr. (83), Petey Rosenberg (83)

## 9. Name a player who made an All-Rookie team as a member of the Los Angeles Lakers.

Type: award-team. Valid answers: 18 (3 stars, 11 known, 4 deep cuts).

Examples: star **Kobe Bryant** 0 · mid **Norm Nixon** 43 · deep cut **Dick Garrett** 77

Kobe Bryant (0), Magic Johnson (1), James Worthy (9), Vlade Divac (38), Eddie Jones (40), Brandon Ingram (43), Byron Scott (43), Jordan Clarkson (43), Norm Nixon (43), Brian Winters (47), D'Angelo Russell (47), Nick Van Exel (47), Kyle Kuzma (48), Jim Price (52), Lonzo Ball (70), Travis Knight (73), Bill Hewitt (77), Dick Garrett (77)

## 10. Name a player born outside the United States who played for the Oklahoma City Thunder.

Type: country-team. Valid answers: 40 (2 stars, 13 known, 25 deep cuts).

Examples: star **Shai Gilgeous-Alexander** 10 · mid **Steven Adams** 48 · deep cut **Saer Sene** 88

Shai Gilgeous-Alexander (10), Al Horford (15), Reggie Jackson (45), Serge Ibaka (45), Dennis Schroeder (46), Bismack Biyombo (47), Danilo Gallinari (48), Enes Kanter (48), Steven Adams (48), Luguentz Dort (50), Thabo Sefolosha (50), Dario Saric (51), Ersan Ilyasova (51), Sviatoslav Mykhailiuk (51), Davis Bertans (52), Josh Giddey (70), Timothe Luwawu (71), Ousmane Dieng (72), Abdel Nader (74), Ajay Mitchell (74), Johan Petro (74), Theo Maledon (74), Vit Krejci (74), Aleksej Pokusevski (75), Nenad Krstic (75), Mamadi Diakite (77), Vasilije Micic (77), Eugene Omoruyi (78), Olivier Sarr (80), Hasheem Thabeet (81), Jaylen Hoard (81), Joffrey Lauvergne (81), Alex Abrines (82), Malevy Leons (82), Gabriel Deck (83), Aday Mara (84), Alex Ducas (84), Georgios Kalaitzakis (84), Nikola Topic (84), Saer Sene (88)

## 11. Name a player born outside the United States who played for the San Antonio Spurs.

Type: country-team. Valid answers: 54 (6 stars, 17 known, 31 deep cuts).

Examples: star **Tim Duncan** 0 · mid **Jakob Poeltl** 49 · deep cut **Alex Garcia** 92

Tim Duncan (0), Dominique Wilkins (7), Tony Parker (9), Pau Gasol (11), Manu Ginobili (14), Victor Wembanyama (20), Steve Kerr (42), Boris Diaw (44), Cory Joseph (45), Hidayet Turkoglu (46), Mychal Thompson (46), Beno Udrih (47), Bismack Biyombo (47), Kelly Olynyk (47), Jakob Poeltl (49), Marco Belinelli (49), Trey Lyles (49), Gorgui Dieng (50), Carl Herrera (52), Cedi Osman (52), Davis Bertans (52), Ian Mahinmi (52), Joel Anthony (52), Tomas Satoransky (69), Aron Baynes (70), Juan Hernangomez (70), Boban Marjanovic (71), Francisco Elson (71), Jock Landale (71), Tiago Splitter (73), Fabricio Oberto (74), Matt Carroll (75), Mike Smrek (75), Charles Bassey (77), Mamadi Diakite (77), Sidy Cissoko (77), Luka Samanic (78), Josh Primo (79), Donatas Motiejunas (80), Joffrey Lauvergne (81), Sean Marks (81), Uwe Blab (81), Petur Gudmundsson (83), Nando De Colo (84), Chris Welp (85), David Jones (85), Emanuel Miller (85), Pops Mensah-Bonsu (87), Mengke Bateer (88), Shane Heal (88), Andrew Gaze (90), Nicolas Laprovittola (90), Zarko Paspalj (90), Alex Garcia (92)

## 12. Name a player who was a teammate of Moses Malone on the Buffalo Braves.

Type: teammate. Valid answers: 18 (2 stars, 3 known, 13 deep cuts).

Examples: star **Bob McAdoo** 10 · mid **George Johnson** 48 · deep cut **Clyde Mayes** 86

Bob McAdoo (10), Adrian Dantley (14), Randy Smith (42), George Johnson (48), Jim Price (52), John Gianelli (69), Tom McMillen (69), Ernie DiGregorio (72), Don Adams (73), Fred Foster (73), Zaid Abdul-Aziz (73), John Shumate (77), Gus Gerard (79), Bird Averitt (83), Chuck Williams (83), Johnny Neumann (85), Claude Terry (86), Clyde Mayes (86)

## 13. Name a player who was a teammate of Kevin Garnett on the Brooklyn Nets.

Type: teammate. Valid answers: 28 (2 stars, 10 known, 16 deep cuts).

Examples: star **Paul Pierce** 6 · mid **Mason Plumlee** 47 · deep cut **Tornike Shengelia** 88

Paul Pierce (6), Joe Johnson (13), Brook Lopez (39), Deron Williams (39), Jason Terry (40), Thaddeus Young (44), Shaun Livingston (46), Mason Plumlee (47), Andrei Kirilenko (48), Bojan Bogdanovic (48), Jarrett Jack (50), Reggie Evans (51), Jason Collins (68), Andray Blatche (72), Marcus Thornton (74), Alan Anderson (77), Mirza Teletovic (78), Earl Clark (80), Darius Morris (84), Markel Brown (84), Marquis Teague (85), Sergey Karasev (85), Brandon Davies (86), Cory Jefferson (87), Jerome Jordan (87), Tyshawn Taylor (87), Jorge Gutierrez (88), Tornike Shengelia (88)

## 14. Name a player who made an All-Rookie team as a member of the New York Knicks.

Type: award-team. Valid answers: 22 (3 stars, 13 known, 6 deep cuts).

Examples: star **Patrick Ewing** 5 · mid **Tim Hardaway Jr** 46 · deep cut **Art Heyman** 82

Patrick Ewing (5), Willis Reed (6), Walt Frazier (8), Mark Jackson (40), Bill Cartwright (42), Dick Van Arsdale (42), Cazzie Russell (46), Kristaps Porzingis (46), Rod Strickland (46), Tim Hardaway Jr (46), Channing Frye (48), Phil Jackson (49), Darrell Walker (50), Mitchell Robinson (51), Immanuel Quickley (52), Langston Galloway (52), Howard Komives (68), Willy Hernangomez (70), Iman Shumpert (71), Jim Barnes (75), Landry Fields (79), Art Heyman (82)
