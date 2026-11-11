# Deep Cut, step 1: sample prompts

Built by `node scripts/generate-prompts.mjs` from the files pinned in `data/sources.lock.json`. These 14 prompts are taken out of the 365-day schedule, so this page spoils no real day.

Score = instant score (0-100, obscurity in the data; formula in `scripts/lib/score.mjs`). Tier: star = fame 25+, known = 8 to 25, deep = under 8 (the NBA Crossword's fame formula). Each list is sorted from most to least famous.

## 1. Name a player who played for the Boston Celtics and the Dallas Mavericks.

Type: two-teams. Valid answers: 48 (3 stars, 19 known, 26 deep cuts).

Examples: star **Kyrie Irving** 13 · mid **Dwight Powell** 48 · deep cut **Jonathan Gibson** 90

Kyrie Irving (13), Rajon Rondo (16), Kemba Walker (18), Antoine Walker (40), Jason Terry (40), Sam Cassell (40), Michael Finley (41), David Lee (42), Isaiah Thomas (44), Kristaps Porzingis (46), Jae Crowder (47), Jameer Nelson (47), Dwight Powell (48), Josh Richardson (50), Courtney Lee (51), Fred Roberts (51), Kris Humphries (51), Mark Bryant (51), Stacey King (51), Grant Williams (52), Mike James (1975) (52), Justin Jackson (53), Brandon Bass (68), Troy Murphy (68), Damon Jones (70), Gerald Green (70), Aleksandar Pavlovic (72), Marquis Daniels (72), Popeye Jones (72), Raef LaFrentz (72), Tony Delk (72), Erick Strickland (73), Adrian Griffin (74), Eric Montross (74), Ryan Hollins (74), Brandan Wright (75), Danny Fortson (75), Delonte West (75), Dan Dickau (78), Doug Smith (78), Lorenzo Williams (79), Shane Larkin (79), Terry Duerod (80), Eric Riley (82), Sean Williams (83), Kelvin Upshaw (84), Bruno Sundov (86), Jonathan Gibson (90)

## 2. Name a player who played for the Cleveland Cavaliers and the Phoenix Suns.

Type: two-teams. Valid answers: 57 (3 stars, 26 known, 28 deep cuts).

Examples: star **Shaquille O'Neal** 1 · mid **Mark West** 48 · deep cut **Jimmy Oliver** 86

Shaquille O'Neal (1), Shawn Marion (16), Kevin Johnson (17), Dan Majerle (41), James Edwards (42), JaVale McGee (42), Larry Nance (42), Steve Kerr (42), Isaiah Thomas (44), Robin Lopez (46), Dick Snyder (47), Jae Crowder (47), James Jones (47), Marcus Morris (47), Scott Williams (47), Channing Frye (48), Mark West (48), Tyrone Corbin (48), Ricky Rubio (49), Chris Dudley (50), Hot Rod Williams (50), Jim Jackson (50), Chucky Brown (51), Mark Bryant (51), Seth Curry (51), Brandon Knight (52), Cameron Payne (52), Damian Jones (52), Shannon Brown (53), Brevin Knight (68), McCoy McLemore (68), Wesley Person (68), Mike Sanders (70), Brian Skinner (71), Corie Blount (71), Marquese Chriss (72), Mike Bratz (72), Sebastian Telfair (72), Walt Wesley (72), Jeff Cook (73), Ty Jerome (73), Jumaine Jones (74), Milt Palacio (74), Louis Amundson (75), Jon Leuer (76), AJ Price (79), Smush Parker (79), Tim Kempton (79), Earl Clark (80), Jordan McRae (80), Antonio Lang (83), Tony Dumas (83), Sedric Toney (84), Greg Howard (85), Joe Courtney (85), Dwayne Jones (86), Jimmy Oliver (86)

## 3. Name a player who played for the Houston Rockets and the Miami Heat.

Type: two-teams. Valid answers: 35 (3 stars, 20 known, 12 deep cuts).

Examples: star **Joe Johnson** 13 · mid **James Posey** 47 · deep cut **Briante Weber** 87

Joe Johnson (13), Kyle Lowry (14), Glen Rice (17), Goran Dragic (39), Kevin Willis (39), Juwan Howard (41), Otis Thorpe (42), Trevor Ariza (42), Victor Oladipo (42), PJ Tucker (45), Shane Battier (45), Brent Barry (46), Rod Strickland (46), James Posey (47), Kelly Olynyk (47), Avery Bradley (49), Clarence Weatherspoon (49), Jim Jackson (50), Ryan Anderson (50), Shandon Anderson (50), Derek Anderson (51), Mike James (1975) (52), James Ennis (53), Rafer Alston (69), Walt Williams (69), Gerald Green (70), Michael Beasley (71), Josh Christopher (76), Toney Douglas (76), Luther Head (77), Daequan Cook (78), Sam Mack (79), Loren Woods (81), Bobby Jones (1984) (85), Briante Weber (87)

## 4. Name a player who played for the Los Angeles Clippers and went to college at UCLA.

Type: team-college. Valid answers: 16 (4 stars, 6 known, 6 deep cuts).

Examples: star **Russell Westbrook** 4 · mid **Darren Collison** 48 · deep cut **Kenny Fields** 82

Russell Westbrook (4), Bill Walton (13), Jamaal Wilkes (16), Marques Johnson (17), Baron Davis (44), Norman Powell (45), Kiki Vandeweghe (46), Darren Collison (48), Matt Barnes (48), Jordan Farmar (51), Luc Mbah a Moute (69), Pooh Richardson (70), Darrick Martin (73), Ryan Hollins (74), Moses Brown (76), Kenny Fields (82)

## 5. Name a player who went to college at Duke and came from a 2010s draft class (drafted or undrafted).

Type: team-college. Valid answers: 32 (2 stars, 12 known, 18 deep cuts).

Examples: star **Kyrie Irving** 13 · mid **Luke Kennard** 51 · deep cut **Trevon Duval** 96

Kyrie Irving (13), Jayson Tatum (14), Brandon Ingram (43), Mason Plumlee (47), Tyus Jones (48), Austin Rivers (49), Zion Williamson (49), Gary Trent Jr (51), Luke Kennard (51), Seth Curry (51), Wendell Carter Jr (51), Grayson Allen (52), RJ Barrett (52), Rodney Hood (52), Justise Winslow (70), Marvin Bagley (70), Jabari Parker (71), Cam Reddish (72), Jahlil Okafor (73), Frank Jackson (74), Harry Giles (75), Quinn Cook (75), Lance Thomas (76), Kyle Singler (77), Miles Plumlee (77), Ryan Kelly (82), Marques Bolden (84), Nolan Smith (86), Marshall Plumlee (89), Amile Jefferson (90), Andre Dawkins (95), Trevon Duval (96)

## 6. Name a player from a 1970s draft class (drafted or undrafted) who played for the Atlanta Hawks.

Type: team-draft. Valid answers: 65 (4 stars, 13 known, 48 deep cuts).

Examples: star **Moses Malone** 0 · mid **Fast Eddie Johnson** 47 · deep cut **Bob Riley** 93

Moses Malone (0), Pete Maravich (13), Sidney Moncrief (13), Maurice Cheeks (15), Gus Williams (39), Dan Roundfield (42), Randy Smith (42), Reggie Theus (43), Truck Robinson (43), John Drew (46), Fast Eddie Johnson (47), Tree Rollins (47), George Johnson (1948) (48), John Long (48), Johnny Davis (1955) (50), Tom Henderson (51), Mark Landsberger (52), Dwight Jones (68), Ollie Johnson (69), Steve Hawes (69), Tom McMillen (69), Billy Paultz (70), Joe Meriweather (70), Ray Williams (70), Dudley Bradley (71), Dean Meminger (72), Mike Glenn (72), Don Adams (73), Armond Hill (74), Bill Willoughby (74), John Brown (74), Charlie Criss (75), Jim McElroy (75), Ron Lee (75), Tom Burleson (75), George Trapp (76), Ron Behagen (76), Freeman Williams (78), Kenny Charles (78), Sly Williams (78), Steve Bracey (78), Wilbur Holland (78), Terry Furlow (80), Butch Lee (81), Mike Sojourner (81), Sam Pellom (81), Jack Givens (82), Keith Herron (83), John Tschogl (84), Tom Barker (84), Jeff Halliburton (85), John Vallely (85), Claude Terry (86), Ron Davis (86), Tony Robertson (86), Randy Denton (87), Rick Wilson (87), Dennis DuVal (88), Tom Ingelsby (88), Art Collins (89), Herb White (89), Jim Creighton (89), Tom Payne (89), Henry Dickerson (90), Bob Riley (93)

## 7. Name a player from a 2000s draft class (drafted or undrafted) who played for the San Antonio Spurs.

Type: team-draft. Valid answers: 74 (5 stars, 18 known, 51 deep cuts).

Examples: star **Chris Paul** 1 · mid **Hidayet Turkoglu** 46 · deep cut **Alex Scales** 99

Chris Paul (1), Tony Parker (9), Pau Gasol (11), DeMar DeRozan (13), LaMarcus Aldridge (13), David West (40), Danny Green (42), David Lee (42), Boris Diaw (44), Rudy Gay (44), Thaddeus Young (44), Patrick Mills (45), Richard Jefferson (45), George Hill (46), Hidayet Turkoglu (46), Beno Udrih (47), Garrett Temple (48), Matt Bonner (48), Marco Belinelli (49), Rasual Butler (51), Ian Mahinmi (52), Joel Anthony (52), Shannon Brown (53), Drew Gooden (67), Anthony Tolliver (69), Bobby Simmons (69), Dante Cunningham (69), Kevin Martin (69), Aron Baynes (70), Keith Bogans (70), Devin Brown (71), DeMarre Carroll (72), Roger Mason (73), Tiago Splitter (73), Speedy Claxton (74), Alonzo Gee (75), Austin Daye (75), DeJuan Blair (75), Matt Carroll (75), Steve Novak (75), TJ Ford (75), Melvin Ely (76), DerMarr Johnson (77), Gary Neal (77), Jason Hart (77), Jeff Ayres (77), Ime Udoka (78), Chris Quinn (80), Ike Diogu (81), Mike Wilks (81), Reggie Williams (1986) (81), Linton Johnson (83), Nando De Colo (84), Bobby Jones (1984) (85), Marcus Haislip (85), Jackie Butler (86), James White (87), Malik Hairston (87), Pops Mensah-Bonsu (87), Jeremy Richardson (88), Othyus Jeffers (88), Blake Ahearn (90), Larry Owens (90), Darius Washington (91), Melvin Sanders (91), Alex Garcia (92), Cedric Jackson (92), Desmon Farmer (92), Justin Dentmon (92), Marcus E. Williams (92), Eric Dawson (94), Derrick Byars (95), Keith Langford (96), Alex Scales (99)

## 8. Name a player who won an NBA title with the Milwaukee Bucks.

Type: award-team. Valid answers: 29 (5 stars, 15 known, 9 deep cuts).

Examples: star **Kareem Abdul-Jabbar** 0 · mid **Pat Connaughton** 48 · deep cut **Marv Winkler** 92

Kareem Abdul-Jabbar (0), Oscar Robertson (1), Giannis Antetokounmpo (2), Bob Dandridge (16), Jrue Holiday (17), Khris Middleton (38), Brook Lopez (39), PJ Tucker (45), Bob Boozer (46), Jeff Teague (46), Bobby Portis (47), Jon McGlocklin (47), Pat Connaughton (48), Donte DiVincenzo (49), Lucius Allen (50), Bryn Forbes (51), Justin Jackson (53), Jordan Nwora (54), Sam Merrill (54), Thanasis Antetokounmpo (55), McCoy McLemore (68), Greg Smith (1947) (69), Dick Cunningham (74), Mamadi Diakite (77), Jeff Webb (83), Axel Toupane (85), Bob Greacen (85), Elijah Bryant (92), Marv Winkler (92)

## 9. Name a player who made an All-Rookie team as a member of the Orlando Magic.

Type: award-team. Valid answers: 16 (3 stars, 5 known, 8 deep cuts).

Examples: star **Shaquille O'Neal** 1 · mid **Victor Oladipo** 42 · deep cut **Stanley Roberts** 78

Shaquille O'Neal (1), Dwight Howard (4), Anfernee Hardaway (17), Paolo Banchero (39), Mike Miller (40), Victor Oladipo (42), Jameer Nelson (47), Elfrid Payton (51), Drew Gooden (67), Michael Doleac (68), Chucky Atkins (69), Dennis Scott (70), Franz Wagner (70), Matt Harpring (70), Gordan Giricek (76), Stanley Roberts (78)

## 10. Name a player from outside the United States who played for the Los Angeles Lakers.

Type: country-team. Valid answers: 54 (4 stars, 19 known, 31 deep cuts).

Examples: star **Steve Nash** 2 · mid **Chris Kaman** 49 · deep cut **Elias Harris** 96

Steve Nash (2), Pau Gasol (11), Luka Doncic (13), Marc Gasol (17), Vlade Divac (38), Jordan Clarkson (43), Rick Fox (44), Luol Deng (45), Dennis Schroeder (46), Mychal Thompson (46), Roy Hibbert (48), Alex Len (49), Andrew Bogut (49), Chris Kaman (49), Ivica Zubac (50), Jose Calderon (50), Deandre Ayton (51), Sasha Vujacic (51), Sviatoslav Mykhailiuk (51), Maxi Kleber (52), Rui Hachimura (52), Moritz Wagner (53), Juan Toscano-Anderson (55), Vladimir Radmanovic (68), Matisse Thybulle (69), Gabe Vincent (70), Ronny Turiaf (71), Timofey Mozgov (71), Sandro Mamukelashvili (72), Swen Nater (73), Didier Ilunga-Mbenga (74), Mike Smrek (75), Isaac Bonga (76), Stanislav Medvedenko (76), Wenyen Gabriel (76), Christian Koloko (77), Rumeal Robinson (77), Ime Udoka (78), Sekou Doumbouya (78), Butch Lee (81), Robert Sacre (82), Tyler Ennis (82), Xavier Henry (82), Petur Gudmundsson (83), Armel Traore (85), D'Moi Hodge (86), Marcelo Huertas (86), Christian Eyenga (87), Soumaila Samake (88), Kostas Antetokounmpo (91), Steve Bucknall (91), Scott Machado (93), Sun Yue (93), Elias Harris (96)

## 11. Name a player from outside the United States who played for the Denver Nuggets.

Type: country-team. Valid answers: 52 (2 stars, 13 known, 37 deep cuts).

Examples: star **Nikola Jokic** 2 · mid **Trey Lyles** 49 · deep cut **Garth Joseph** 95

Nikola Jokic (2), Dikembe Mutombo (9), Jamal Murray (44), Jonas Valanciunas (45), Danilo Gallinari (48), Roy Hibbert (48), Evan Fournier (49), Nenê (49), Trey Lyles (49), Jusuf Nurkic (50), Sarunas Marciulionis (50), Dario Saric (51), Isaiah Hartenstein (51), Carl Herrera (52), Monte Morris (52), Juan Hernangomez (70), Kosta Koufos (70), Eduardo Najera (71), Emmanuel Mudiay (71), Francisco Elson (71), Timofey Mozgov (71), Carlos Arroyo (72), Vlatko Cancar (73), Johan Petro (74), Julian Strawther (75), Facundo Campazzo (76), Linas Kleiza (76), Rudy Fernandez (79), Ryan Nembhard (79), Tariq Abdul-Wahad (80), Joffrey Lauvergne (81), Renaldo Balkman (81), Jan Vesely (82), Nikoloz Tskitishvili (82), Yakhouba Diawara (82), Gary Forbes (84), George Zidek (84), Jack White (84), Axel Toupane (85), Carlik Jones (85), Kostas Papanikolaou (86), Petr Cornelie (86), Alpha Diallo (88), Mengke Bateer (88), Darnell Mee (89), Predrag Savovic (89), Cheikh Samb (91), Julius Hodge (91), Luis Flores (91), Rastko Cvetkovic (92), DeVaughn Akoon-Purcell (94), Garth Joseph (95)

## 12. Name a player who was a teammate of Scottie Pippen on the Chicago Bulls.

Type: teammate. Valid answers: 84 (5 stars, 33 known, 46 deep cuts).

Examples: star **Michael Jordan** 1 · mid **Jud Buechler** 48 · deep cut **Ricky Blanton** 96

Michael Jordan (1), Robert Parish (6), Dennis Rodman (12), Artis Gilmore (15), Toni Kukoc (18), Horace Grant (38), Jamal Crawford (38), Tyson Chandler (39), Ron Harper (40), Bill Cartwright (42), James Edwards (42), Steve Kerr (42), Charles Oakley (43), BJ Armstrong (44), John Salley (45), Will Perdue (45), John Paxson (46), Antonio Davis (47), Cliff Levingston (47), Jalen Rose (47), Scott Williams (47), Jud Buechler (48), Randy Brown (48), Bill Wennington (49), Craig Hodges (49), Donyell Marshall (49), Kendall Gill (49), Luc Longley (49), Rodney McCray (49), Sedale Threatt (49), Darrell Walker (50), Dave Corzine (50), Joe Kleine (50), Kirk Hinrich (50), Rory Sparrow (50), Trent Tucker (50), Stacey King (51), Greg Foster (52), Bob Hansen (68), Corie Blount (71), Jason Caffey (71), Jerome Williams (71), Mike Brown (1963) (71), Bison Dele (72), Sam Vincent (72), Ed Nealy (73), Eddy Curry (73), Elston Turner (73), Roger Mason (73), Scott Burrell (73), Dennis Hopson (74), Dickey Simpkins (74), Jannero Pargo (74), Larry Krystkowiak (75), Brad Sellers (76), Charles Davis (76), David Wood (76), Pete Myers (76), Jack Haley (78), Marcus Fizer (78), Rick Brunson (78), Eddie Robinson (79), Chuck Nevitt (80), Granville Waiters (80), Anthony Jones (83), Linton Johnson (83), Lonny Baxter (83), Ronald Dupree (83), David Vaughn (84), Mark Randall (84), Joe Courtney (85), Rusty Larue (85), Chris Jefferies (86), Dave Johnson (87), Jeff Sanders (87), Jo Jo English (87), Tony White (87), Keith Booth (88), Corey Williams (89), Dominic Pressley (91), Paul Shirley (91), Clifford Lett (92), Matt Steigenga (96), Ricky Blanton (96)

## 13. Name a player who was a teammate of Jerry Lucas on the New York Knicks.

Type: teammate. Valid answers: 24 (4 stars, 6 known, 14 deep cuts).

Examples: star **Willis Reed** 6 · mid **Eddie Miles** 51 · deep cut **Allie McGuire** 96

Willis Reed (6), Walt Frazier (8), Dave DeBusschere (11), Earl Monroe (13), Dick Barnett (36), Bill Bradley (39), Phil Jackson (49), Eddie Miles (51), Henry Bibby (51), Mike Riordan (51), John Gianelli (69), Dave Stallworth (70), Dean Meminger (72), Dick Garrett (77), Hathorne Wingo (77), Luther Rackley (81), Mel Davis (82), Charlie Paulk (84), Mike Price (84), Eddie Mast (85), Tom Riker (86), Dennis Bell (87), Greg Fillmore (88), Allie McGuire (96)

## 14. Name a player who made an All-Rookie team as a member of the Memphis Grizzlies.

Type: award-team. Valid answers: 16 (2 stars, 6 known, 8 deep cuts).

Examples: star **Pau Gasol** 11 · mid **Shane Battier** 45 · deep cut **Juan Carlos Navarro** 85

Pau Gasol (11), Marc Gasol (17), Ja Morant (42), Jaren Jackson Jr (44), Rudy Gay (44), Shane Battier (45), Desmond Bane (52), Zach Edey (54), Drew Gooden (67), Brandon Clarke (71), OJ Mayo (72), Jaylen Wells (75), GG Jackson (76), Gordan Giricek (76), Cedric Coward (78), Juan Carlos Navarro (85)
