// Deep Cut page. Talks only to the Deep Cut server (/deep-cut/api/*). The
// valid answers never reach this page before a round is played; the full
// lists come only after a finished run, behind an inline warning.
//
// Views, by query string:
//   (none)            today's Daily (5 rounds)
//   ?d=YYYY-MM-DD     that exact Daily (today's, or a past one as a replay)
//   &c=<0-500>        a challenge: someone's score on it, shown as a target
//   ?mode=practice    Unlimited practice (past Dailies + practice-only pool)
//   ?view=archive     every past Daily
//
// Everything about you stays in this browser (localStorage): run progress
// (the server's signed run token), first Daily attempts, replays, practice
// results, streaks. Nothing is sent but the picks.
(function () {
  'use strict';
  const API = '/deep-cut/api/';
  const SITE = 'https://hoopsmatic.com/deep-cut/';
  const START = '2026-11-11';     // first scheduled day (data/schedule.json start)
  let LAUNCH = '2026-12-01';      // from /deep-cut/config.json (rules/launch.json)
  const MISTAKES = 3;
  const HEADS = 'https://jsierrahoopshype.github.io/nba-headshots/players/headshots/face-fill/';
  const LOGOS = 'https://jsierrahoopshype.github.io/nba-headshots/teams/logos/current/svg/';
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
  const shortDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && s >= START;
  const dayNumber = (d) => Math.round((Date.parse(d) - Date.parse(LAUNCH)) / DAY_MS) + 1;
  const dayLabel = (d) => (d >= LAUNCH ? '#' + String(dayNumber(d)).padStart(3, '0') : 'Preview');
  const shareName = (d) => (d >= LAUNCH ? 'Deep Cut #' + String(dayNumber(d)).padStart(3, '0') : 'Deep Cut preview (' + shortDate(d) + ')');
  let configLoaded = null;
  function loadConfig() {
    return configLoaded || (configLoaded = fetch('/deep-cut/config.json').then((r) => r.json())
      .then((c) => { if (/^\d{4}-\d{2}-\d{2}$/.test(c.launch || '')) LAUNCH = c.launch; }).catch(() => {}));
  }

  // ---------- network: one request at a time, failures never cost a mistake ----------
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
  function headNode(p, size) {
    const box = el('span', 'head' + (size ? ' ' + size : ''));
    if (p.head) {
      const img = new Image(); img.alt = ''; img.loading = 'lazy'; img.src = HEADS + p.head + '.webp';
      img.onerror = () => { box.textContent = initials(p.name); };
      box.appendChild(img);
    } else box.textContent = initials(p.name);
    return box;
  }
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  function teamsNode(teams) {
    const box = el('div', 'teams');
    for (const t of teams || []) {
      const b = el('span', 'team');
      if (t.logo) { const img = new Image(); img.alt = ''; img.src = LOGOS + t.logo + '.svg'; img.className = 'logo'; b.appendChild(img); }
      else b.appendChild(el('span', 'logo-txt', t.short.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()));
      b.appendChild(el('span', 'team-name', t.short));
      b.title = t.name;
      box.appendChild(b);
    }
    return box;
  }

  // ---------- state ----------
  // A run: { kind:'daily'|'practice', date?, replay?, rounds:[public round], token,
  //          state:{rounds, mistakes, tried, done, score, max}, log:[{round, ok, id, score, ev, fail, skip}], cur }
  const params = new URLSearchParams(location.search);
  const today = dailyDate(Date.now());
  const view = params.get('view') === 'archive' ? 'archive' : params.get('mode') === 'practice' ? 'practice' : 'daily';
  const wantDate = isDate(params.get('d')) && params.get('d') <= today ? params.get('d') : today;
  const challenge = /^\d{1,3}$/.test(params.get('c') || '') && +params.get('c') <= 500 ? +params.get('c') : null;
  let RUN = null, sel = null, list = [], hi = -1, busy = false;
  const runKey = () => (RUN.kind === 'practice' ? 'dc-run-practice' : (RUN.replay ? 'dc-replay-' : 'dc-run-') + RUN.date);
  const save = () => { if (RUN) store.set(runKey(), RUN); };

  // ---------- render ----------
  function renderStatus() {
    const s = RUN.state;
    const ol = $('rounds'); ol.textContent = '';
    RUN.rounds.forEach((r, i) => {
      const v = s.rounds[i];
      const li = el('li', 'rd' + (i === RUN.cur && !s.done ? ' cur' : '') + (v && typeof v === 'object' ? ' ok' : v === 's' ? ' skip' : v === 'x' ? ' miss' : ''));
      li.textContent = v && typeof v === 'object' ? String(v.s) : v === 's' ? 'skip' : v === 'x' ? '0' : String(i + 1);
      li.setAttribute('aria-label', `Round ${i + 1}: ` + (v && typeof v === 'object' ? v.s + ' points' : v === 's' ? 'skipped' : v === 'x' ? '0, run ended' : i === RUN.cur ? 'current' : 'to play'));
      ol.appendChild(li);
    });
    $('total').textContent = `${s.score}/${s.max}`;
    const left = MISTAKES - s.mistakes;
    $('lives').textContent = '';
    for (let i = 0; i < MISTAKES; i++) $('lives').appendChild(el('span', 'life' + (i < left ? '' : ' used'), i < left ? '●' : '×'));
    $('lives').appendChild(el('span', 'lives-txt', ` ${left} mistake${left === 1 ? '' : 's'} left`));
  }

  function renderRound() {
    const s = RUN.state, i = RUN.cur, r = RUN.rounds[i];
    renderStatus();
    $('round-label').textContent = `Round ${i + 1} of ${RUN.rounds.length}` + (RUN.kind === 'practice' ? ' · practice' : RUN.replay ? ' · replay' : '');
    $('teams').replaceWith(Object.assign(teamsNode(r.teams), { id: 'teams' }));
    $('prompt').textContent = r.text;
    $('rule').textContent = r.rule || '';
    $('count').textContent = `${r.count} players fit.`;
    const resolved = s.rounds[i] !== null;
    $('ask').classList.toggle('hide', resolved || s.done);
    $('next').classList.toggle('hide', !resolved || s.done);
    if (!resolved) { $('feedback').classList.add('hide'); $('feedback').textContent = ''; }
    // The last feedback for this round (after a refresh too).
    const last = [...RUN.log].reverse().find((e) => e.round === i);
    if (last) showFeedback(last, r); else { $('feedback').classList.add('hide'); }
    if (s.done) showEnd();
  }

  function showFeedback(e, r) {
    const fb = $('feedback'); fb.textContent = ''; fb.classList.remove('hide');
    fb.className = 'feedback ' + (e.ok ? 'good' : e.skip ? 'skipped' : 'bad');
    if (e.skip) { fb.appendChild(el('p', 'fb-title', '↷ Round skipped: 0 points.')); return; }
    const p = playerOf(e.id);
    if (e.ok) {
      const top = el('div', 'fb-top');
      top.appendChild(headNode(p));
      const t = el('div', 'fb-name');
      const line = el('p', 'fb-title'); line.append('✓ '); line.appendChild(nameNode(p)); line.append(' fits.');
      t.appendChild(line);
      t.appendChild(el('p', 'fb-score', `${e.score}/100`));
      top.appendChild(t);
      fb.appendChild(top);
      if (r.teams && r.teams.length) fb.appendChild(teamsNode(r.teams));
      const ul = el('ul', 'ev');
      for (const x of e.ev || []) ul.appendChild(el('li', null, x));
      if (ul.children.length) fb.appendChild(ul);
      // Factual: where the score sits among this prompt's valid answers.
      const n = r.count, deeper = Math.round(((e.score - 10) / 90) * (n - 1));
      fb.appendChild(el('p', 'why small', n > 1
        ? `${e.score}/100: a less obvious pick than ${deeper} of the other ${n - 1} players who fit, judged by his career fame and how memorable this link is. 10 is the most obvious answer, 100 the least.`
        : `${e.score}/100: the only player who fits.`));
    } else {
      const line = el('p', 'fb-title'); line.append('✗ '); line.appendChild(nameNode(p)); line.append(' doesn’t fit.');
      fb.appendChild(line);
      if (e.fail) fb.appendChild(el('p', 'why', e.fail));
      const left = MISTAKES - RUN.state.mistakes;
      fb.appendChild(el('p', 'small muted', RUN.state.done ? 'That was your third mistake: the run is over.' : `${left} mistake${left === 1 ? '' : 's'} left. Try another player.`));
    }
  }

  // ---------- picking ----------
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
  // Choosing fills the box; "Submit pick" commits (spec 8).
  function choose(p) {
    sel = p; $('q').value = p.name; list = []; hi = -1; drawSugg();
    $('submit').disabled = false; $('submit').focus();
  }
  $('q').addEventListener('input', () => {
    sel = null; $('submit').disabled = true;
    const tried = new Set((RUN ? RUN.state.tried : []));
    list = search($('q').value, tried); hi = list.length ? 0 : -1; drawSugg();
  });
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && list.length) { hi = (hi + 1) % list.length; drawSugg(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && list.length) { hi = (hi - 1 + list.length) % list.length; drawSugg(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (list.length && hi >= 0) choose(list[hi]); else if (sel) submit(); e.preventDefault(); }
    else if (e.key === 'Escape') { list = []; hi = -1; drawSugg(); }
  });
  $('submit').addEventListener('click', submit);

  async function submit() {
    if (!sel || busy || !RUN || RUN.state.done) return;
    const i = RUN.cur, p = sel;
    busy = true; $('submit').disabled = true; $('submit').textContent = 'Checking…'; $('msg').textContent = ''; $('msg').className = 'msg';
    try {
      const r = await api('pick', { token: RUN.token, round: i, id: p.id });
      if (r.repeat) { $('msg').textContent = 'You already tried him. Pick someone else.'; $('msg').className = 'msg err'; return; }
      RUN.token = r.token; RUN.state = r.state;
      if (r.already) { save(); renderRound(); return; }
      RUN.log.push(r.ok ? { round: i, ok: true, id: p.id, score: r.answer.score, ev: r.answer.ev } : { round: i, ok: false, id: p.id, fail: r.fail });
      save();
      $('q').value = ''; sel = null;
      renderRound();
      if (RUN.state.done) finish();
      else if (!r.ok) $('q').focus(); else $('next').focus();
    } catch (e) {
      // Network or server trouble: nothing changed, nothing counted. Try again.
      $('msg').textContent = e.network ? 'Couldn’t reach the server. Your pick wasn’t counted; press Submit pick to try again.' : 'Something went wrong with that pick. Try again.';
      $('msg').className = 'msg err';
    } finally { busy = false; $('submit').textContent = 'Submit pick'; $('submit').disabled = !sel; }
  }

  $('skip').addEventListener('click', () => { $('skip-confirm').classList.remove('hide'); $('skip-no').focus(); });
  $('skip-no').addEventListener('click', () => { $('skip-confirm').classList.add('hide'); $('q').focus(); });
  $('skip-yes').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await api('skip', { token: RUN.token, round: RUN.cur });
      RUN.token = r.token; RUN.state = r.state;
      if (!r.already) RUN.log.push({ round: RUN.cur, skip: true });
      save();
      $('skip-confirm').classList.add('hide');
      renderRound();
      if (RUN.state.done) finish(); else $('next').focus();
    } catch (e) { $('msg').textContent = 'Couldn’t reach the server. The round wasn’t skipped; try again.'; $('msg').className = 'msg err'; }
    finally { busy = false; }
  });
  $('next').addEventListener('click', () => { RUN.cur = nextOpen(); save(); renderRound(); $('q').focus(); });
  const nextOpen = () => { const k = RUN.state.rounds.findIndex((v) => v === null); return k < 0 ? RUN.cur : k; };

  // ---------- end of run ----------
  function finish() { record(); showEnd(); }
  function showEnd() {
    const s = RUN.state;
    $('result').classList.remove('hide');
    $('card').classList.add('hide');
    renderStatus();
    $('end-title').textContent = RUN.kind === 'practice' ? 'Practice set complete' : s.mistakes >= MISTAKES ? 'Run over: three mistakes' : 'Run complete';
    $('end-score').textContent = `${s.score}/${s.max}`;
    const ol = $('end-rounds'); ol.textContent = '';
    RUN.rounds.forEach((r, i) => {
      const v = s.rounds[i];
      const li = el('li');
      li.appendChild(el('span', 'er-score', v && typeof v === 'object' ? String(v.s) : '0'));
      const txt = el('span', 'er-text', r.text.replace(/^Name a player who /, ''));
      li.appendChild(txt);
      if (v && typeof v === 'object') { const pl = el('span', 'er-pick'); pl.append(' · '); pl.appendChild(nameNode(playerOf(v.i))); li.appendChild(pl); }
      else li.appendChild(el('span', 'er-pick muted', v === 's' ? ' · skipped' : ' · no answer'));
      ol.appendChild(li);
    });
    $('end-line').textContent = (RUN.kind === 'practice' ? 'Practice: kept apart from your Daily records.' : RUN.replay ? 'Replay: your first attempt is the one in your records.' : '') ;
    drawShare();
    $('reveal').classList.remove('hide');
  }

  const missText = (m) => (m === 0 ? 'No misses.' : m === 1 ? 'One miss.' : m === 2 ? 'Two misses.' : 'Three misses: run over.');
  function puzzleUrl(extra) { return RUN.kind === 'practice' ? SITE + '?mode=practice' : SITE + '?d=' + RUN.date + (extra || ''); }
  function shareText(channel) {
    const s = RUN.state;
    const scores = s.rounds.map((v) => (v && typeof v === 'object' ? v.s : 0)).join(' · ');
    const head = RUN.kind === 'practice' ? 'Deep Cut practice' : shareName(RUN.date);
    return `${head} · ${s.score}/${s.max}\n${scores}\n${missText(s.mistakes)}\n${puzzleUrl(channel ? '&ref=share-deepcut-' + channel : '')}`;
  }
  function challengeUrl() { return puzzleUrl('&c=' + RUN.state.score); }
  function drawShare() {
    $('share-text').textContent = shareText('');
    const box = $('shares'); box.textContent = '';
    const enc = encodeURIComponent;
    if (navigator.share) {
      const b = el('button', 'primary', 'Share'); b.type = 'button';
      b.addEventListener('click', () => navigator.share({ text: shareText('native') }).catch(() => {}));
      box.appendChild(b);
    }
    const copy = (label, get) => {
      const b = el('button', null, label); b.type = 'button';
      b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(get()); b.textContent = 'Copied'; } catch (e) { b.textContent = 'Copy failed'; }
        setTimeout(() => { b.textContent = label; }, 2000);
      });
      box.appendChild(b);
    };
    copy('Copy result', () => shareText('copy'));
    if (RUN.kind !== 'practice') { copy('Copy puzzle link', () => puzzleUrl('')); copy('Copy challenge link', challengeUrl); }
    const targets = [
      ['X', 'x', (t) => 'https://x.com/intent/post?text=' + enc(t)],
      ['Bluesky', 'bluesky', (t) => 'https://bsky.app/intent/compose?text=' + enc(t)],
      ['Facebook', 'facebook', (t, u) => 'https://www.facebook.com/sharer/sharer.php?u=' + enc(u)],
      ['WhatsApp', 'whatsapp', (t) => 'https://wa.me/?text=' + enc(t)],
      ['Reddit', 'reddit', (t, u) => 'https://www.reddit.com/submit?url=' + enc(u) + '&title=' + enc(t.split('\n')[0])],
      ['Telegram', 'telegram', (t, u) => 'https://t.me/share/url?url=' + enc(u) + '&text=' + enc(t.split('\n').slice(0, -1).join('\n'))],
    ];
    for (const [name, ch, url] of targets) {
      const a = el('a', null, name); a.href = url(shareText(ch), puzzleUrl('&ref=share-deepcut-' + ch)); a.target = '_blank'; a.rel = 'noopener';
      box.appendChild(a);
    }
  }

  // Answer browser: only after a finished run, behind an inline warning.
  $('reveal').addEventListener('click', () => { $('reveal').classList.add('hide'); $('reveal-confirm').classList.remove('hide'); $('reveal-no').focus(); });
  $('reveal-no').addEventListener('click', () => { $('reveal-confirm').classList.add('hide'); $('reveal').classList.remove('hide'); });
  $('reveal-yes').addEventListener('click', async () => {
    $('reveal-confirm').classList.add('hide');
    const box = $('answers'); box.textContent = 'Loading answers…';
    try {
      const r = await api('reveal', { token: RUN.token });
      box.textContent = '';
      r.rounds.forEach((rd, i) => {
        const det = el('details', 'ans-round'); if (i === 0) det.open = true;
        det.appendChild(el('summary', null, `Round ${i + 1}: ${rd.text.replace(/^Name a player who /, '')} (${rd.answers.length})`));
        const total = rd.answers.reduce((a, x) => a + (x.picked || 0), 0);
        const ol = el('ol', 'ans-list');
        const mine = RUN.state.rounds[i] && typeof RUN.state.rounds[i] === 'object' ? RUN.state.rounds[i].i : null;
        for (const a of rd.answers) {
          const li = el('li', a.id === mine ? 'me' : '');
          const p = playerOf(a.id);
          li.appendChild(headNode(p, 'sm'));
          li.appendChild(nameNode({ ...p, name: a.name }, 'an'));
          li.appendChild(el('span', 'as', `${a.s}/100`));
          if (a.picked !== undefined && total) li.appendChild(el('span', 'ap muted', `${Math.round((100 * a.picked) / total)}% picked`));
          ol.appendChild(li);
        }
        det.appendChild(ol);
        box.appendChild(det);
      });
    } catch (e) { box.textContent = 'Couldn’t load the answers. Try again.'; $('reveal').classList.remove('hide'); }
  });

  // ---------- personal records (this browser only) ----------
  // A completed Daily = a finished run, ended by mistakes or not. Only the
  // first attempt at a date counts; replays and practice are kept apart.
  function record() {
    const R = store.get('dc-records') || { daily: {}, practice: { played: 0, best: 0, total: 0 } };
    if (RUN.kind === 'practice') { R.practice.played++; R.practice.total += RUN.state.score; R.practice.best = Math.max(R.practice.best, RUN.state.score); }
    else if (!RUN.replay && !R.daily[RUN.date]) R.daily[RUN.date] = { score: RUN.state.score, max: RUN.state.max, mistakes: RUN.state.mistakes };
    store.set('dc-records', R);
    drawRecords();
  }
  function drawRecords() {
    const R = store.get('dc-records');
    const box = $('records'); box.textContent = '';
    if (!R) return;
    const days = Object.keys(R.daily).sort();
    const five = days.filter((d) => R.daily[d].max === 500);
    let streak = 0;
    for (let d = R.daily[today] ? today : addDays(today, -1); R.daily[d]; d = addDays(d, -1)) streak++;
    const rows = [];
    if (days.length) {
      rows.push(['Dailies completed', String(days.length)], ['Streak', `${streak} day${streak === 1 ? '' : 's'}`]);
      if (five.length) {
        rows.push(['Best Daily', `${Math.max(...five.map((d) => R.daily[d].score))}/500`]);
        rows.push(['Average Daily', `${Math.round(five.reduce((a, d) => a + R.daily[d].score, 0) / five.length)}/500`]);
      }
    }
    if (R.practice.played) rows.push(['Practice sets', String(R.practice.played)], ['Best practice', `${R.practice.best}/500`], ['Average practice', `${Math.round(R.practice.total / R.practice.played)}/500`]);
    if (!rows.length) return;
    const dl = el('dl', 'rec');
    for (const [k, v] of rows) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
    box.appendChild(el('h3', null, 'Your record (this browser)'));
    box.appendChild(dl);
  }

  // ---------- next reset, in the player's own time ----------
  function resetLine(endsAt) {
    const t = new Date(endsAt);
    const local = t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const mins = Math.max(0, Math.round((t - Date.now()) / 60000));
    return `Next puzzle in ${Math.floor(mins / 60)}h ${mins % 60}m (${local} your time, 9:00 AM ET).`;
  }

  // ---------- start a view ----------
  async function startDaily() {
    $('game').classList.remove('hide');
    await loadConfig();
    let day;
    try { day = await api('day/' + wantDate); }
    catch (e) { $('sub').textContent = e.status === 404 ? 'No puzzle for that day.' : 'Couldn’t load the puzzle. Refresh to try again.'; $('game').classList.add('hide'); return; }
    const isToday = wantDate === today;
    $('sub').textContent = `${dayLabel(wantDate)} · ${longDate(wantDate)}` + (isToday ? ' · ' + resetLine(day.endsAt) : ' · past puzzle');
    if (!isToday) $('go-daily').classList.remove('hide');
    if (challenge !== null) { $('challenge').textContent = `Challenge: a friend scored ${challenge}/${day.rounds.length * 100} on this puzzle. That’s their shared score, not a verified record.`; $('challenge').classList.remove('hide'); }
    await loadPlayers();
    // First attempt saved? Resume it. Finished and opening again? Show it,
    // with a replay option for past days.
    const first = store.get('dc-run-' + wantDate);
    const replay = params.get('replay') === '1';
    if (first && !replay) RUN = first;
    else if (replay && store.get('dc-replay-' + wantDate) && !store.get('dc-replay-' + wantDate).state.done) RUN = store.get('dc-replay-' + wantDate);
    else {
      let st;
      try { st = await api('start', { date: wantDate }); } catch (e) { $('sub').textContent = 'Couldn’t start the puzzle. Refresh to try again.'; return; }
      RUN = { kind: 'daily', date: wantDate, replay: !!(first && replay), rounds: day.rounds, token: st.token, state: st.state, log: [], cur: 0 };
      save();
    }
    RUN.cur = RUN.state.done ? RUN.cur : nextOpen();
    renderRound();
    if (RUN.state.done && !RUN.replay) {
      const line = $('end-line');
      const a = el('a', null, 'Play it again (replay, not recorded)'); a.href = SITE + '?d=' + RUN.date + '&replay=1';
      line.append(' '); line.appendChild(a);
    }
  }

  async function startPractice() {
    $('game').classList.remove('hide');
    $('go-daily').classList.remove('hide');
    $('go-practice').textContent = 'New practice set';
    await loadConfig();
    $('sub').textContent = 'Unlimited practice: five prompts from past days and a practice-only set. Not part of your Daily record.';
    await loadPlayers();
    const cur = store.get('dc-run-practice');
    if (cur && !cur.state.done && params.get('new') !== '1') { RUN = cur; }
    else {
      const seen = store.get('dc-seen') || [];
      let r;
      try { r = await api('practice/new', { seen: seen.slice(-500) }); } catch (e) { $('sub').textContent = 'Couldn’t start a practice set. Refresh to try again.'; return; }
      store.set('dc-seen', seen.concat(r.refs).slice(-500));
      RUN = { kind: 'practice', refs: r.refs, rounds: r.rounds, token: r.token, state: r.state, log: [], cur: 0 };
      save();
    }
    $('go-practice').href = SITE + '?mode=practice&new=1';
    RUN.cur = RUN.state.done ? RUN.cur : nextOpen();
    renderRound();
  }

  async function showArchive() {
    await loadConfig();
    $('archive').classList.remove('hide');
    $('go-daily').classList.remove('hide');
    $('sub').textContent = 'Every past Deep Cut puzzle.';
    const R = store.get('dc-records') || { daily: {} };
    const ul = $('arc-list');
    for (let d = addDays(today, -1); d >= START; d = addDays(d, -1)) {
      const li = el('li');
      const a = el('a', null, `${dayLabel(d)} · ${longDate(d)}`); a.href = SITE + '?d=' + d;
      li.appendChild(a);
      if (R.daily[d]) li.appendChild(el('span', 'muted', `${R.daily[d].score}/${R.daily[d].max}`));
      ul.appendChild(li);
    }
    if (!ul.children.length) ul.appendChild(el('li', 'muted', 'Past puzzles show up here from tomorrow.'));
  }

  drawRecords();
  if (view === 'archive') showArchive();
  else if (view === 'practice') startPractice();
  else startDaily();
})();
