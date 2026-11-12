// Deep Cut page. Talks only to the Deep Cut server (/deep-cut/api/*). The
// valid answers never reach this page before a question is played; the
// full lists come only after a finished run, behind an inline warning.
//
// THE GAME (Jorge, Nov 12, 2026): 10 questions, all answered, one pick and a
// timer each (seconds from /deep-cut/config.json). A right answer scores
// 1-100, a wrong name or a timeout 0; the final score is the average. The
// clock runs on the server: refreshing or leaving during a question counts
// it as timed out. After each answer a short reveal: the pick, its score and
// why, then the most and least obvious valid answers.
//
// Views:
//   /deep-cut/                 today's Daily
//   /deep-cut/YYYY-MM-DD/      that exact Daily (its own page; ?d= also works)
//   ?c=<0-100>                 a challenge: someone's score on it, as a target
//   ?mode=practice             Unlimited practice (past Dailies + practice-only pool)
//   ?view=archive              every past Daily
//
// Everything about you stays in this browser (localStorage): the run (the
// server's signed token), first Daily attempts, replays, practice, streaks.
(function () {
  'use strict';
  const API = '/deep-cut/api/';
  const SITE = 'https://hoopsmatic.com/deep-cut/';
  const START = '2026-11-11';     // first scheduled day (data/schedule.json start)
  let LAUNCH = '2026-12-01';      // from /deep-cut/config.json (rules/launch.json)
  let SECONDS = 20;               // likewise
  // Headshots (public/players.json row[6], scripts/headshots.mjs): "f:<file>"
  // Jorge's nba-headshots face-fill set, "n:<id>" NBA.com by player ID; both
  // transparent, shown on a light-grey circle. Logos: nba-headshots
  // teams/logos/<path>.svg, current eras and the historical ones it has.
  const HEADS = 'https://jsierrahoopshype.github.io/nba-headshots/players/headshots/face-fill/';
  const NBA_HEADS = 'https://cdn.nba.com/headshots/nba/latest/260x190/';
  const LOGOS = 'https://jsierrahoopshype.github.io/nba-headshots/teams/logos/';
  const DAY_MS = 86400000;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: progress lives for this visit only */ } },
  };

  // ---------- dates (the 9:00 AM ET day, daylight saving included) ----------
  const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  function dailyDate(ms) {
    const p = {};
    for (const x of etFmt.formatToParts(new Date(ms))) p[x.type] = x.value;
    let d = Date.UTC(+p.year, +p.month - 1, +p.day);
    if (+p.hour < 9) d -= DAY_MS;
    return new Date(d).toISOString().slice(0, 10);
  }
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
  const longDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && s >= START;
  const dayNumber = (d) => Math.round((Date.parse(d) - Date.parse(LAUNCH)) / DAY_MS) + 1;
  const dayLabel = (d) => (d >= LAUNCH ? '#' + dayNumber(d) : 'Preview');
  const shareName = (d) => (d >= LAUNCH ? 'Deep Cut #' + dayNumber(d) : 'Deep Cut preview');
  let configLoaded = null;
  function loadConfig() {
    return configLoaded || (configLoaded = fetch('/deep-cut/config.json', { cache: 'no-store' }).then((r) => r.json())
      .then((c) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(c.launch || '')) LAUNCH = c.launch;
        if (Number.isInteger(c.seconds) && c.seconds >= 5) SECONDS = c.seconds;
        for (const e of document.querySelectorAll('.secs')) e.textContent = String(SECONDS);
      }).catch(() => {}));
  }

  // ---------- network ----------
  async function api(path, body) {
    const opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    let r;
    try { r = await fetch(API + path, opt); } catch (e) { const x = new Error('network'); x.network = true; throw x; }
    let j = null;
    try { j = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok && r.status !== 409) { const x = new Error((j && j.error) || 'http_' + r.status); x.status = r.status; x.network = r.status >= 500; throw x; }
    return j;
  }

  // ---------- players (suggestions) ----------
  // public/players.json rows: [id, name, career years, birth-year tag or 0,
  // nicknames or 0, page ("s:"/"c:" slug) or 0, headshot file or 0]. Every
  // player is listed: the list never shows which ones fit a prompt.
  let PLAYERS = null;
  const BY_ID = new Map();
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const SHORT = {
    maurice: ['mo'], mohamed: ['mo'], mohammed: ['mo'], morris: ['mo'],
    robert: ['bob', 'bobby', 'rob'], william: ['bill', 'billy', 'will'], michael: ['mike'], christopher: ['chris'],
    anthony: ['tony'], joseph: ['joe', 'joey'], james: ['jim', 'jimmy'], charles: ['charlie', 'chuck'],
    richard: ['rich', 'rick', 'dick'], thomas: ['tom', 'tommy'], edward: ['ed', 'eddie'], daniel: ['dan', 'danny'],
    matthew: ['matt'], nicholas: ['nick'], alexander: ['alex'], benjamin: ['ben'], jonathan: ['jon'],
    kenneth: ['ken', 'kenny'], ronald: ['ron'], donald: ['don'], gerald: ['jerry'], lawrence: ['larry'],
    frederick: ['fred'], patrick: ['pat'], samuel: ['sam'], stephen: ['steph', 'steve'], steven: ['steve'],
    timothy: ['tim'], zachary: ['zach'], andrew: ['andy', 'drew'], david: ['dave'], douglas: ['doug'],
    gregory: ['greg'], jeffrey: ['jeff'], joshua: ['josh'], theodore: ['ted', 'teddy'], vincent: ['vince'],
    walter: ['walt'], clifford: ['cliff'], raymond: ['ray'], leonard: ['lenny'], nathaniel: ['nate'],
    nathan: ['nate'], eugene: ['gene'], henry: ['hank'], cornelius: ['corey'], dwayne: ['dewayne'],
  };
  const LONG = {};
  for (const [full, shorts] of Object.entries(SHORT)) for (const sh of shorts) (LONG[sh] = LONG[sh] || []).push(full);
  function shortForms(name) {
    const w = norm(name).split(' ');
    if (w.length < 2) return [];
    const rest = w.slice(1).join(' ');
    return [...(SHORT[w[0]] || []), ...(LONG[w[0]] || [])].map((f) => f + ' ' + rest);
  }
  async function loadPlayers() {
    if (PLAYERS) return PLAYERS;
    const j = await (await fetch('/deep-cut/players.json')).json();
    PLAYERS = j.players.map((p) => {
      const keys = [p[1], ...(p[4] || []), ...shortForms(p[1])].map(norm).filter((k, i, a) => k && a.indexOf(k) === i);
      return { id: p[0], name: p[1], years: p[2], born: p[3], nicks: p[4] || [], page: p[5] || null, head: p[6] || null, keys: keys.map((k) => ({ k, words: k.split(' ') })) };
    });
    for (const p of PLAYERS) BY_ID.set(p.id, p);
    return PLAYERS;
  }
  const playerOf = (id) => BY_ID.get(id) || { id, name: id, page: null, head: null };
  const pageUrl = (p) => (!p.page ? null : p.page.startsWith('s:') ? 'https://hoopsmatic.com/salary-season-finder/player/' + p.page.slice(2) + '/' : 'https://hoopsmatic.com/nba-career-map/player/' + p.page.slice(2) + '.html');
  function search(q, skip) {
    const qs = norm(q);
    if (qs.length < 2 || !PLAYERS) return [];
    const parts = qs.split(' ');
    const out = [];
    for (const p of PLAYERS) {
      if (skip.has(p.id)) continue;
      const hit = p.keys.find((k) => parts.every((w) => k.words.some((x) => x.startsWith(w))));
      if (!hit) continue;
      const rank = p.keys.some((k) => k.k === qs) ? 0 : p.keys[0].k.startsWith(qs) ? 1 : p.keys.some((k) => k.k.startsWith(qs)) ? 2 : 3;
      out.push({ p, rank, nick: hit === p.keys[0] ? null : p.nicks.find((n) => norm(n) === hit.k) || null });
    }
    out.sort((a, b) => a.rank - b.rank || a.p.name.localeCompare(b.p.name));
    return out.slice(0, 6).map((x) => ({ ...x.p, matched: x.nick }));
  }
  function nameNode(p, cls) {
    const url = pageUrl(p);
    if (!url) return el('span', cls, p.name);
    const a = el('a', cls, p.name); a.href = url; return a;
  }
  // Initials sit under every photo, so a slow or missing image still shows
  // something; the photo covers them once it loads.
  function headNode(p, size) {
    const box = el('span', 'head' + (size ? ' ' + size : ''));
    box.appendChild(el('span', 'ini', initials(p.name)));
    const src = !p.head ? null : p.head.startsWith('n:') ? NBA_HEADS + p.head.slice(2) + '.png' : HEADS + p.head.replace(/^f:/, '') + '.webp';
    if (src) {
      const img = new Image(); img.alt = ''; img.loading = 'lazy'; img.src = src;
      if (p.head.startsWith('n:')) box.classList.add('nba');
      img.onerror = () => img.remove();
      box.appendChild(img);
    }
    return box;
  }

  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  function teamsNode(teams) {
    const box = el('div', 'teams');
    for (const t of teams || []) {
      const b = el('span', 'team');
      // Days built before historical logos carry a bare current-era slug.
      if (t.logo) { const img = new Image(); img.alt = ''; img.src = LOGOS + (t.logo.includes('/') ? t.logo : 'current/svg/' + t.logo) + '.svg'; img.className = 'logo-img'; b.appendChild(img); }
      else b.appendChild(el('span', 'logo-txt', t.short.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()));
      b.appendChild(el('span', 'team-name', t.short));
      b.title = t.name;
      box.appendChild(b);
    }
    return box;
  }

  // ---------- state ----------
  // RUN: { kind:'daily'|'practice', date?, replay?, rounds:[public question],
  //        token, state, out:{[i]: server outcome}, cur }
  const params = new URLSearchParams(location.search);
  const today = dailyDate(Date.now());
  const view = params.get('view') === 'archive' ? 'archive' : params.get('mode') === 'practice' ? 'practice' : 'daily';
  const pageDate = isDate(window.DC_DATE) ? window.DC_DATE : isDate(params.get('d')) ? params.get('d') : null;
  const notYet = pageDate && pageDate > today ? pageDate : null;
  const wantDate = pageDate && pageDate <= today ? pageDate : today;
  const dayUrl = (d) => SITE + d + '/';
  const challenge = /^\d{1,3}$/.test(params.get('c') || '') && +params.get('c') <= 100 ? +params.get('c') : null;
  // A challenge link duplicates the day's page: never indexed.
  if (params.has('c') && !document.querySelector('meta[name="robots"][content^="noindex"]')) {
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex, follow'; document.head.appendChild(m);
  }
  let RUN = null, sel = null, list = [], hi = -1, busy = false, tick = null, endsAt = 0, opening = false;
  const runKey = () => (RUN.kind === 'practice' ? 'dc-run-practice' : (RUN.replay ? 'dc-replay-' : 'dc-run-') + RUN.date);
  const save = () => { if (RUN) store.set(runKey(), RUN); };
  const scoreOf = (v) => (v && typeof v === 'object' ? v.s : v === null ? null : 0);
  const show = (id) => { for (const s of ['intro', 'card', 'reveal', 'result']) $(s).classList.toggle('hide', s !== id); };

  function renderStatus() {
    const s = RUN.state, n = s.n;
    const answered = s.rounds.filter((v) => v !== null).length;
    $('qcount').textContent = `${answered} of ${n} answered`;
    $('avg').textContent = answered ? `${Math.round(s.rounds.reduce((a, v) => a + (scoreOf(v) || 0), 0) / answered)}/100 so far` : '';
    const ol = $('chips'); ol.textContent = '';
    ol.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    s.rounds.forEach((v, i) => {
      const sc = scoreOf(v);
      const li = el('li', 'chip' + (sc === null ? (i === RUN.cur && !s.done ? ' cur' : '') : sc > 0 ? ' ok' : ' zero'), sc === null ? String(i + 1) : String(sc));
      li.setAttribute('aria-label', `Question ${i + 1}: ` + (sc === null ? 'not played yet' : sc + ' points'));
      ol.appendChild(li);
    });
  }

  // ---------- one question ----------
  async function openQuestion() {
    const i = RUN.cur, r = RUN.rounds[i];
    renderStatus();
    $('q-label').textContent = `Question ${i + 1} of ${RUN.rounds.length}` + (RUN.kind === 'practice' ? ' · practice' : RUN.replay ? ' · replay' : '');
    $('teams').replaceWith(Object.assign(teamsNode(r.teams), { id: 'teams' }));
    $('prompt').textContent = r.text;
    $('rule').textContent = r.rule || '';
    $('q').value = ''; sel = null; list = []; drawSugg(); $('submit').disabled = true; $('msg').textContent = ''; $('msg').className = 'msg';
    $('timer').textContent = String(SECONDS); $('timefill').style.width = '100%';
    // The box stays closed until the server has started this question's clock,
    // so a pick can never go out before the question is open.
    $('q').disabled = true; opening = true;
    show('card');
    let o;
    try { o = await api('open', { token: RUN.token, round: i }); if (!o || !o.state) throw new Error('no_state'); }
    catch (e) { opening = false; $('msg').textContent = 'Couldn’t reach the server. Check your connection and refresh; the question’s clock hasn’t started.'; $('msg').className = 'msg err'; return; }
    opening = false; $('q').disabled = false;
    RUN.token = o.token; RUN.state = o.state; save();
    if (o.already) { RUN.out[i] = o; save(); return showReveal(i); }
    endsAt = Date.now() + o.endsIn;
    startClock(i);
    $('q').focus();
  }
  function startClock(i) {
    clearInterval(tick);
    const total = SECONDS * 1000;
    const paint = () => {
      const left = Math.max(0, endsAt - Date.now());
      $('timer').textContent = String(Math.ceil(left / 1000));
      $('timer').classList.toggle('low', left <= 5000);
      $('timefill').style.width = (100 * left / total) + '%';
      if (left <= 0) { clearInterval(tick); if (!busy) timeUp(i); }
    };
    paint();
    tick = setInterval(paint, 250);
  }
  async function timeUp(i) {
    busy = true;
    try {
      const r = await api('timeout', { token: RUN.token, round: i });
      RUN.token = r.token; RUN.state = r.state; RUN.out[i] = r; save();
      showReveal(i);
    } catch (e) { $('msg').textContent = 'Time’s up, but the server couldn’t be reached. Refresh to continue.'; $('msg').className = 'msg err'; }
    finally { busy = false; }
  }

  // Suggestions, inline under the box. Choosing fills it; "Submit pick" commits.
  function drawSugg() {
    const ul = $('sugg'); ul.textContent = '';
    if ($('q').value.trim().length >= 2 && !list.length && !sel) { const li = el('li'); li.appendChild(el('div', 'none', 'No player by that name in the data.')); ul.appendChild(li); return; }
    list.forEach((p, i) => {
      const li = el('li');
      const b = el('button'); b.type = 'button'; b.id = 'opt-' + i;
      b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(i === hi));
      const nm = el('span', 'nm', p.name + (p.born ? ' (b. ' + p.born + ')' : ''));
      if (p.matched) nm.appendChild(el('span', 'aka', ' “' + p.matched + '”'));
      b.appendChild(nm); b.appendChild(el('span', 'yr', p.years));
      b.addEventListener('click', () => choose(p));
      li.appendChild(b); ul.appendChild(li);
    });
    $('q').setAttribute('aria-activedescendant', hi >= 0 ? 'opt-' + hi : '');
  }
  function choose(p) { sel = p; $('q').value = p.name; list = []; hi = -1; drawSugg(); $('submit').disabled = false; $('submit').focus(); }
  $('q').addEventListener('input', () => { sel = null; $('submit').disabled = true; list = search($('q').value, new Set()); hi = list.length ? 0 : -1; drawSugg(); });
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && list.length) { hi = (hi + 1) % list.length; drawSugg(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && list.length) { hi = (hi - 1 + list.length) % list.length; drawSugg(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (list.length && hi >= 0) choose(list[hi]); else if (sel) submit(); e.preventDefault(); }
    else if (e.key === 'Escape') { list = []; hi = -1; drawSugg(); }
  });
  $('submit').addEventListener('click', submit);
  async function submit() {
    if (!sel || busy || opening || !RUN || RUN.state.done) return;
    const i = RUN.cur, p = sel;
    busy = true; $('submit').disabled = true; $('submit').textContent = 'Checking…'; $('msg').textContent = '';
    try {
      const r = await api('pick', { token: RUN.token, round: i, id: p.id });
      if (!r || !r.state) throw new Error((r && r.error) || 'no_state');   // nothing changed: try again
      clearInterval(tick);
      RUN.token = r.token; RUN.state = r.state; RUN.out[i] = r; save();
      showReveal(i);
    } catch (e) {
      // Nothing changed on the server; the clock keeps running. Try again.
      $('msg').textContent = e.network ? 'Couldn’t reach the server. Your pick wasn’t sent; press Submit pick again.' : 'Something went wrong. Press Submit pick again.';
      $('msg').className = 'msg err'; $('submit').disabled = false;
    } finally { busy = false; $('submit').textContent = 'Submit pick'; }
  }

  // ---------- the reveal after each question ----------
  function playerLine(p, score, cls) {
    const line = el('p', 'rv-line' + (cls ? ' ' + cls : ''));
    line.appendChild(nameNode(p)); line.append(': '); line.appendChild(el('span', 'pts', `${score}/100`)); line.append('.');
    return line;
  }
  function showReveal(i) {
    renderStatus();
    const o = RUN.out[i] || {}, r = RUN.rounds[i];
    $('rv-label').textContent = `Question ${i + 1}: ${r.text.replace(/^Name a player (who )?/, '… ')}`;
    const box = $('rv-body'); box.textContent = '';
    if (o.timeout || !o.pick) {
      box.appendChild(el('p', 'rv-line zero', '⏱ Time’s up: 0/100.'));
    } else {
      const p = { ...playerOf(o.pick.id), name: o.pick.name };
      const main = el('div', 'rv-main');
      main.appendChild(headNode(p));
      const t = el('div');
      if (o.pick.ok) {
        t.appendChild(playerLine(p, o.pick.score));
        if (o.pick.why) t.appendChild(el('p', 'rv-why', o.pick.why));
      } else {
        const line = el('p', 'rv-line zero'); line.append('✗ '); line.appendChild(nameNode(p)); line.append(': '); line.appendChild(el('span', 'pts', '0/100')); line.append('.');
        t.appendChild(line);
        t.appendChild(el('p', 'rv-why', o.pick.fail || 'He doesn’t fit this question.'));
      }
      main.appendChild(t); box.appendChild(main);
      if (o.pick.ok && o.pick.ev && o.pick.ev.length) { const ul = el('ul', 'ev'); for (const x of o.pick.ev) ul.appendChild(el('li', null, x)); box.appendChild(ul); }
    }
    if (o.extremes) {
      const e = el('div', 'ends');
      for (const [k, x] of [['Most obvious', o.extremes.low], ['Least obvious', o.extremes.high]]) {
        const row = el('p'); row.appendChild(el('span', 'k', k)); const pl = { ...playerOf(x.id), name: x.name };
        row.appendChild(headNode(pl, 'sm')); row.appendChild(nameNode(pl)); row.append(` ${x.score}/100`);
        e.appendChild(row);
      }
      e.appendChild(el('p', 'muted', `${o.extremes.count} players fit this question.`));
      box.appendChild(e);
    }
    const last = RUN.state.done;
    $('next').textContent = last ? 'See your final score' : 'Next question';
    show('reveal');
    $('next').focus();
  }
  $('next').addEventListener('click', () => {
    if (RUN.state.done) return showEnd(true);
    RUN.cur = RUN.state.rounds.findIndex((v) => v === null); save();
    openQuestion();
  });

  // ---------- end of run ----------
  function showEnd(fresh) {
    clearInterval(tick);
    const s = RUN.state;
    if (fresh && !RUN.recorded) { record(); RUN.recorded = true; save(); }
    renderStatus();
    $('end-title').textContent = RUN.kind === 'practice' ? 'Practice score' : 'Final score';
    $('end-score').textContent = `${s.score}/100`;
    const ol = $('end-list'); ol.textContent = '';
    RUN.rounds.forEach((r, i) => {
      const v = s.rounds[i], o = RUN.out[i] || {};
      const sc = scoreOf(v) || 0;
      const li = el('li');
      li.appendChild(el('span', 'es' + (sc ? '' : ' zero'), String(sc)));
      li.appendChild(el('span', 'eq', `${i + 1}. ${r.text.replace(/^Name a player (who )?/, '')}`));
      const pk = el('span', 'ep');
      if (v === 't') pk.textContent = '⏱ Time ran out';
      else if (v && typeof v === 'object') { const p = { ...playerOf(v.i), name: (o.pick && o.pick.name) || playerOf(v.i).name }; pk.append(v.w ? '✗ ' : '✓ '); pk.appendChild(nameNode(p)); if (v.w) pk.append(' (doesn’t fit)'); }
      li.appendChild(pk);
      ol.appendChild(li);
    });
    drawShare();
    show('result');
  }
  function puzzleUrl(extra) { return RUN.kind === 'practice' ? SITE + '?mode=practice' : dayUrl(RUN.date) + (extra ? '?' + extra : ''); }
  // Share text (Jorge, Nov 12): no answers anywhere.
  //   Deep Cut #1 · 74/100
  //   one square per question: green 67-100, yellow 34-66, orange 1-33, black 0
  //   Deepest cut: 96/100
  //   Can you go deeper? <exact puzzle link>
  const square = (sc) => (!sc ? '\u2B1B' : sc >= 67 ? '\uD83D\uDFE9' : sc >= 34 ? '\uD83D\uDFE8' : '\uD83D\uDFE7');
  function shareText(channel) {
    const s = RUN.state, scores = s.rounds.map((v) => scoreOf(v) || 0);
    const head = RUN.kind === 'practice' ? 'Deep Cut practice' : shareName(RUN.date);
    const deepest = Math.max(...scores);
    return `${head} \u00B7 ${s.score}/100\n${scores.map(square).join('')}\n` + (deepest ? `Deepest cut: ${deepest}/100\n` : '') + `Can you go deeper? ${puzzleUrl(channel ? 'ref=share-deepcut-' + channel : '')}`;
  }
  // The result image (spoiler-free): the score and one square per question.
  function resultCanvas() {
    const s = RUN.state, scores = s.rounds.map((v) => scoreOf(v) || 0);
    const W = 1080, H = 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#15153a'); bg.addColorStop(1, '#0a0a1a');
    g.fillStyle = '#0b0b1c'; g.fillRect(0, 0, W, H); g.fillStyle = bg; g.fillRect(40, 40, W - 80, H - 80);
    g.strokeStyle = '#3a3a6a'; g.lineWidth = 3; g.strokeRect(40, 40, W - 80, H - 80);
    g.textAlign = 'center';
    g.fillStyle = '#aaaadd'; g.font = '600 34px Oswald, sans-serif'; g.fillText('HOOPSMATIC', W / 2, 150);
    const tg = g.createLinearGradient(260, 0, 820, 0); tg.addColorStop(0, '#ff6b35'); tg.addColorStop(1, '#ffd700');
    g.fillStyle = tg; g.font = '700 120px Oswald, sans-serif'; g.fillText('DEEP CUT', W / 2, 280);
    g.fillStyle = '#ffd700'; g.font = '600 44px Oswald, sans-serif';
    g.fillText((RUN.kind === 'practice' ? 'PRACTICE' : dayLabel(RUN.date).toUpperCase() + ' \u00B7 ' + longDate(RUN.date).toUpperCase()), W / 2, 350);
    g.fillStyle = '#ffffff'; g.font = '700 170px "JetBrains Mono", monospace'; g.fillText(`${s.score}`, W / 2, 560);
    g.fillStyle = '#aaaadd'; g.font = '600 44px "JetBrains Mono", monospace'; g.fillText('/100', W / 2, 620);
    const n = scores.length, sz = Math.min(72, Math.floor((W - 200) / n) - 12), gap = 12, x0 = (W - (n * sz + (n - 1) * gap)) / 2;
    scores.forEach((sc, k) => {
      g.fillStyle = !sc ? '#2a2a3a' : sc >= 67 ? '#4ade80' : sc >= 34 ? '#facc15' : '#fb923c';
      g.fillRect(x0 + k * (sz + gap), 690, sz, sz);
    });
    const deepest = Math.max(...scores);
    g.fillStyle = '#e0e0ff'; g.font = '500 40px "DM Sans", sans-serif';
    if (deepest) g.fillText(`Deepest cut: ${deepest}/100`, W / 2, 860);
    g.fillStyle = '#888899'; g.font = '500 34px "DM Sans", sans-serif'; g.fillText('hoopsmatic.com/deep-cut', W / 2, 960);
    return cv;
  }
const SOC_ICON={
    x:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93zM17.61 20.64h2.04L6.49 3.24H4.3z"/></svg>',
    bsky:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 10.8C10.91 8.69 7.95 4.75 5.2 2.81 2.57.94 1.56 1.27.9 1.57.14 1.91 0 3.08 0 3.77c0 .69.38 5.65.62 6.48.82 2.74 3.71 3.66 6.38 3.36-3.91.58-7.39 2.01-2.83 7.08 5.01 5.19 6.87-1.11 7.82-4.31.95 3.2 2.05 9.27 7.73 4.31 4.27-4.31 1.17-6.5-2.74-7.08 2.67.3 5.57-.63 6.38-3.36C23.62 9.42 24 4.46 24 3.77c0-.69-.14-1.86-.9-2.2-.66-.3-1.66-.62-4.3 1.24C16.05 4.75 13.09 8.69 12 10.8z"/></svg>',
    fb:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8v8.44C19.61 23.08 24 18.09 24 12.07z"/></svg>',
    wa:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15s-.77.97-.94 1.16c-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.14-.18.19-.3.29-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.43 9.88-9.88 9.88M20.46 3.49A11.81 11.81 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.42"/></svg>',
    reddit:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.74c.69 0 1.25.56 1.25 1.25a1.25 1.25 0 0 1-2.5.06l-2.6-.55-.8 3.75c1.83.07 3.48.63 4.68 1.49.31-.31.73-.49 1.21-.49.97 0 1.75.79 1.75 1.75 0 .72-.44 1.33-1.01 1.61.03.17.04.34.04.52 0 2.7-3.13 4.87-7 4.87-3.88 0-7-2.17-7-4.87 0-.18.01-.37.04-.53A1.75 1.75 0 0 1 4.03 12c0-.97.79-1.75 1.75-1.75.46 0 .9.2 1.21.49 1.21-.88 2.88-1.43 4.74-1.49l.89-4.18a.34.34 0 0 1 .14-.2.35.35 0 0 1 .24-.04l2.91.62a1.21 1.21 0 0 1 1.11-.7zM9.25 12c-.69 0-1.25.56-1.25 1.25 0 .69.56 1.25 1.25 1.25.69 0 1.25-.56 1.25-1.25 0-.69-.56-1.25-1.25-1.25zm5.5 0c-.69 0-1.25.56-1.25 1.25 0 .69.56 1.25 1.25 1.25.69 0 1.25-.56 1.25-1.25 0-.69-.56-1.25-1.25-1.25zm-5.47 3.99a.33.33 0 0 0-.23.09.33.33 0 0 0 0 .47c.84.84 2.48.91 2.96.91.48 0 2.11-.06 2.96-.91a.36.36 0 0 0 .03-.47.33.33 0 0 0-.46 0c-.55.53-1.69.73-2.51.73-.83 0-1.98-.2-2.51-.73a.33.33 0 0 0-.24-.09z"/></svg>',
    telegram:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11.94 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.06 0zm4.96 7.22c.1 0 .32.02.47.14a.51.51 0 0 1 .17.33c.02.09.04.31.02.47-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.82 1.23-.7.06-1.23-.46-1.9-.9-1.06-.7-1.65-1.12-2.68-1.8-1.19-.78-.42-1.21.26-1.91.18-.18 3.25-2.98 3.31-3.23 0-.03.01-.15-.06-.21-.07-.06-.17-.04-.25-.02-.1.02-1.79 1.14-5.06 3.34-.48.33-.91.49-1.3.48-.43 0-1.25-.24-1.86-.44-.75-.24-1.35-.37-1.3-.79.03-.21.33-.43.89-.66 3.5-1.52 5.83-2.53 7-3.01 3.33-1.39 4.02-1.63 4.48-1.63z"/></svg>'
  };
  const SOC = [['x', 'X'], ['bsky', 'Bluesky'], ['fb', 'Facebook'], ['wa', 'WhatsApp'], ['reddit', 'Reddit'], ['telegram', 'Telegram']];
  function socialUrl(kind) {
    const url = puzzleUrl('ref=share-deepcut-' + kind), text = shareText(kind).replace(/\nCan you go deeper\? .*$/, '\nCan you go deeper?');
    const u = encodeURIComponent(url), t = encodeURIComponent(text), tu = encodeURIComponent(text + ' ' + url);
    switch (kind) {
      case 'x': return 'https://twitter.com/intent/tweet?text=' + t + '&url=' + u;
      case 'bsky': return 'https://bsky.app/intent/compose?text=' + tu;
      case 'fb': return 'https://www.facebook.com/sharer/sharer.php?u=' + u + '&quote=' + t;
      case 'wa': return 'https://wa.me/?text=' + tu;
      case 'reddit': return 'https://www.reddit.com/submit?url=' + u + '&title=' + encodeURIComponent(text.split('\n')[0]);
      case 'telegram': return 'https://t.me/share/url?url=' + u + '&text=' + t;
    }
    return url;
  }
  let shareBlob = null;
  function drawShare() {
    const cv = resultCanvas();
    $('share-img').src = cv.toDataURL('image/png');
    cv.toBlob((b) => { shareBlob = b; }, 'image/png');
    $('share-url').value = puzzleUrl('');
    const soc = $('share-social'); soc.textContent = '';
    for (const [k, name] of SOC) {
      const b = el('button', 'soc soc-' + k); b.type = 'button'; b.setAttribute('aria-label', 'Share on ' + name);
      b.innerHTML = SOC_ICON[k]; b.appendChild(el('span', null, name));
      b.addEventListener('click', () => window.open(socialUrl(k), '_blank', 'noopener,noreferrer'));
      soc.appendChild(b);
    }
    $('sh-copy').classList.toggle('hide', !(navigator.clipboard && window.ClipboardItem));
    $('sh-again').textContent = RUN.kind === 'practice' ? 'New set' : 'Play again';
    // 73-9 has no challenge link: here it is a small text link below the block.
    const small = $('share-small'); small.textContent = '';
    if (RUN.kind === 'practice') small.textContent = 'A practice link starts a fresh set of ten for whoever opens it.';
    else {
      const a = el('a', null, 'Copy a challenge link'); a.href = '#';
      a.addEventListener('click', async (e) => { e.preventDefault(); try { await navigator.clipboard.writeText(puzzleUrl('c=' + RUN.state.score)); msg('Challenge link copied. It shows your score as a target, not a verified record.'); } catch (x) { msg('Copy blocked here.'); } });
      small.appendChild(a); small.append(' (your score as a target, not a verified record)');
    }
  }
  const msg = (t) => { $('share-msg').textContent = t; };
  $('share-url').addEventListener('click', () => $('share-url').select());
  $('share-copylink').addEventListener('click', async () => { try { await navigator.clipboard.writeText(shareText('')); msg('Text + link copied.'); } catch (e) { msg('Copy blocked here.'); } });
  $('sh-download').addEventListener('click', () => {
    const a = document.createElement('a'); a.href = $('share-img').src; a.download = 'deep-cut-result.png'; document.body.appendChild(a); a.click(); a.remove(); msg('Saved to your downloads.');
  });
  $('sh-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': shareBlob })]); msg('Image copied. Paste it anywhere.'); } catch (e) { msg('Copy blocked here. Use Download.'); }
  });
  $('sh-again').addEventListener('click', () => { location.href = SITE + '?mode=practice&new=1'; });
  // Every answer: only after a finished run, behind an inline warning.
  $('show-all').addEventListener('click', () => { $('show-all').classList.add('hide'); $('show-confirm').classList.remove('hide'); $('show-no').focus(); });
  $('show-no').addEventListener('click', () => { $('show-confirm').classList.add('hide'); $('show-all').classList.remove('hide'); });
  $('show-yes').addEventListener('click', async () => {
    $('show-confirm').classList.add('hide');
    const box = $('answers'); box.textContent = 'Loading answers…';
    try {
      const r = await api('reveal', { token: RUN.token });
      box.textContent = '';
      r.rounds.forEach((rd, i) => {
        const det = el('details', 'ans-round');
        det.appendChild(el('summary', null, `${i + 1}. ${rd.text.replace(/^Name a player (who )?/, '')} (${rd.answers.length})`));
        const total = rd.answers.reduce((a, x) => a + (x.picked || 0), 0);
        const ol = el('ol', 'ans-list');
        const v = RUN.state.rounds[i], mine = v && typeof v === 'object' ? v.i : null;
        for (const a of rd.answers) {
          const li = el('li', a.id === mine ? 'me' : '');
          const p = { ...playerOf(a.id), name: a.name };
          li.appendChild(headNode(p, 'sm')); li.appendChild(nameNode(p, 'an')); li.appendChild(el('span', 'as', `${a.s}/100`));
          if (a.picked !== undefined && total) li.appendChild(el('span', 'muted', `${Math.round((100 * a.picked) / total)}% picked`));
          ol.appendChild(li);
        }
        det.appendChild(ol); box.appendChild(det);
      });
    } catch (e) { box.textContent = 'Couldn’t load the answers. Try again.'; $('show-all').classList.remove('hide'); }
  });

  // ---------- personal records (this browser only) ----------
  // A completed Daily = all its questions answered. Only the first attempt at
  // a date counts; replays and practice are kept apart.
  function record() {
    const R = store.get('dc-records-v3') || { daily: {}, practice: { played: 0, best: 0, total: 0 } };
    if (RUN.kind === 'practice') { R.practice.played++; R.practice.total += RUN.state.score; R.practice.best = Math.max(R.practice.best, RUN.state.score); }
    else if (!RUN.replay && !R.daily[RUN.date]) R.daily[RUN.date] = { score: RUN.state.score, n: RUN.state.n };
    store.set('dc-records-v3', R);
    drawRecords();
  }
  function drawRecords() {
    const R = store.get('dc-records-v3');
    const box = $('records'); box.textContent = '';
    if (!R) return;
    const days = Object.keys(R.daily).sort();
    let streak = 0;
    for (let d = R.daily[today] ? today : addDays(today, -1); R.daily[d]; d = addDays(d, -1)) streak++;
    const rows = [];
    if (days.length) {
      const sc = days.map((d) => R.daily[d].score);
      rows.push(['Dailies completed', String(days.length)], ['Streak', `${streak} day${streak === 1 ? '' : 's'}`],
        ['Best Daily', `${Math.max(...sc)}/100`], ['Average Daily', `${Math.round(sc.reduce((a, x) => a + x, 0) / sc.length)}/100`]);
    }
    if (R.practice.played) rows.push(['Practice runs', String(R.practice.played)], ['Best practice', `${R.practice.best}/100`], ['Average practice', `${Math.round(R.practice.total / R.practice.played)}/100`]);
    if (!rows.length) return;
    const dl = el('dl', 'rec');
    for (const [k, v] of rows) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
    box.appendChild(el('h3', 'panel-sub', 'Your record (this browser)'));
    box.appendChild(dl);
  }

  function resetLine(endsAtIso) {
    const t = new Date(endsAtIso);
    const local = t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const mins = Math.max(0, Math.round((t - Date.now()) / 60000));
    return `Next puzzle in ${Math.floor(mins / 60)}h ${mins % 60}m (${local} your time, 9:00 AM ET).`;
  }

  // Where a run stands: a question left open (refresh, another tab) is timed
  // out on the server first; then the next unanswered question, or the end.
  async function resume() {
    const s = RUN.state;
    if (s.done) { RUN.cur = s.n - 1; return showEnd(false); }
    const left = s.rounds.findIndex((v, k) => v === null && s.opened[k]);
    if (left >= 0) {
      RUN.cur = left;
      try {
        const r = await api('timeout', { token: RUN.token, round: left });
        RUN.token = r.token; RUN.state = r.state; RUN.out[left] = r; save();
        return showReveal(left);
      } catch (e) { $('sub').textContent = 'Couldn’t reach the server. Refresh to try again.'; return; }
    }
    // Never start a clock on page load: the player presses the button.
    RUN.cur = s.rounds.findIndex((v) => v === null);
    renderStatus();
    $('intro-text').textContent = RUN.cur === 0
      ? `${s.n} questions, ${SECONDS} seconds each, one pick per question. The clock starts when you press the button.`
      : `Welcome back. ${RUN.cur} of ${s.n} answered. The clock for question ${RUN.cur + 1} starts when you press the button.`;
    $('begin').textContent = `Start question ${RUN.cur + 1}`;
    drawMosaic();
    show('intro');
  }
  // Start screen: a mosaic of real headshots (public/mosaic.json), light grey.
  let mosaicDone = false;
  function drawMosaic() {
    if (mosaicDone) return;
    mosaicDone = true;
    fetch('/deep-cut/mosaic.json').then((r) => r.json()).then((j) => {
      const box = $('mosaic');
      for (const p of j.players.slice(0, 18)) { const sp = el('span'); const img = new Image(); img.alt = ''; img.src = HEADS + p[2] + '.webp'; img.onerror = () => sp.remove(); sp.appendChild(img); box.appendChild(sp); }
    }).catch(() => {});
  }
  $('begin').addEventListener('click', () => { $('begin').disabled = true; openQuestion().finally(() => { $('begin').disabled = false; }); });

  async function startDaily() {
    await loadConfig();
    if (notYet) {
      $('sub').textContent = `${dayLabel(notYet)} · ${longDate(notYet)} · opens at 9:00 AM ET that day.`;
      $('go-daily').classList.remove('hide');
      return;
    }
    $('game').classList.remove('hide');
    let day;
    try { day = await api('day/' + wantDate); }
    catch (e) { $('sub').textContent = e.status === 404 ? 'No puzzle for that day.' : 'Couldn’t load the puzzle. Refresh to try again.'; $('game').classList.add('hide'); return; }
    const isToday = wantDate === today;
    $('sub').textContent = `${dayLabel(wantDate)} · ${longDate(wantDate)}` + (isToday ? ' · ' + resetLine(day.endsAt) : ' · past puzzle');
    if (!isToday) $('go-daily').classList.remove('hide');
    if (challenge !== null) { $('challenge').textContent = `Challenge: a friend scored ${challenge}/100 on this puzzle. That’s their shared score, not a verified record.`; $('challenge').classList.remove('hide'); }
    await loadPlayers();
    const key = 'dc-run-' + wantDate;
    const first = store.get(key);
    const replay = params.get('replay') === '1' && first && first.state && first.state.done;
    const saved = replay ? store.get('dc-replay-' + wantDate) : first;
    if (saved && saved.v === 4 && !(replay && saved.state.done)) RUN = saved;
    else {
      let st;
      try { st = await api('start', { date: wantDate }); } catch (e) { $('sub').textContent = 'Couldn’t start the puzzle. Refresh to try again.'; return; }
      RUN = { v: 4, kind: 'daily', date: wantDate, replay: !!replay, rounds: day.rounds, token: st.token, state: st.state, out: {}, cur: 0 };
      save();
    }
    await resume();
    if (RUN.state.done && !RUN.replay) {
      const a = el('a', null, 'Play it again (replay, not recorded)'); a.href = dayUrl(RUN.date) + '?replay=1';
      const p = el('p', 'note'); p.appendChild(a); $('end-list').after(p);
    }
  }

  async function startPractice() {
    await loadConfig();
    $('game').classList.remove('hide');
    $('go-daily').classList.remove('hide');
    $('go-practice').textContent = 'New practice run';
    $('go-practice').href = SITE + '?mode=practice&new=1';
    $('sub').textContent = 'Unlimited practice: ten questions from past days and a practice-only set. Not part of your Daily record.';
    await loadPlayers();
    const cur = store.get('dc-run-practice');
    if (cur && cur.v === 4 && !cur.state.done && params.get('new') !== '1') RUN = cur;
    else {
      const seen = store.get('dc-seen') || [];
      let r;
      try { r = await api('practice/new', { seen: seen.slice(-1000) }); } catch (e) { $('sub').textContent = 'Couldn’t start a practice run. Refresh to try again.'; return; }
      store.set('dc-seen', seen.concat(r.refs).slice(-1000));
      RUN = { v: 4, kind: 'practice', refs: r.refs, rounds: r.rounds, token: r.token, state: r.state, out: {}, cur: 0 };
      save();
    }
    await resume();
  }

  async function showArchive() {
    await loadConfig();
    $('archive').classList.remove('hide');
    $('go-daily').classList.remove('hide');
    $('sub').textContent = 'Every past Deep Cut puzzle.';
    const R = store.get('dc-records-v3') || { daily: {} };
    const ul = $('arc-list');
    for (let d = addDays(today, -1); d >= START; d = addDays(d, -1)) {
      const li = el('li');
      const a = el('a', null, `${dayLabel(d)} · ${longDate(d)}`); a.href = dayUrl(d);
      li.appendChild(a);
      if (R.daily[d]) li.appendChild(el('span', 'muted', `${R.daily[d].score}/100`));
      ul.appendChild(li);
    }
    if (!ul.children.length) ul.appendChild(el('li', 'muted', 'Past puzzles show up here from tomorrow.'));
  }

  drawRecords();
  if (view === 'archive') showArchive();
  else if (view === 'practice') startPractice();
  else startDaily();
})();
