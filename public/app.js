// Deep Cut page. Talks only to the Deep Cut server (/deep-cut/api/*); the
// valid answers never reach this page before a day is over.
//
// Views, by query string:
//   (none)          today's prompt (ranked; one play per device)
//   ?d=YYYY-MM-DD   a past day, played unranked (tries kept in this browser)
//   ?r=YYYY-MM-DD   a past day's answers, % picked, your final score and rank
//   ?view=archive   every past day
(function () {
  'use strict';
  const API = '/deep-cut/api/';
  const SITE = 'https://hoopsmatic.com/deep-cut/';
  const START = '2026-11-11';     // Deep Cut #1 (data/schedule.json start)
  const TRIES = 3;
  const DAY_MS = 86400000;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: fine */ } },
  };

  // A random id for this browser; the server keeps only a keyed hash of it.
  function device() {
    let d = store.get('dc-device');
    if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(d)) {
      const b = crypto.getRandomValues(new Uint8Array(16));
      d = btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      store.set('dc-device', d);
    }
    return d;
  }

  // The 9:00 AM ET day, as the server's.
  const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  function dailyDate(ms) {
    const p = {};
    for (const x of etFmt.formatToParts(new Date(ms))) p[x.type] = x.value;
    let d = Date.UTC(+p.year, +p.month - 1, +p.day);
    if (+p.hour < 9) d -= DAY_MS;
    return new Date(d).toISOString().slice(0, 10);
  }
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
  const dayNumber = (d) => Math.round((Date.parse(d) - Date.parse(START)) / DAY_MS) + 1;
  const longDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && s >= START;

  async function api(path, body) {
    const opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    const r = await fetch(API + path, opt);
    let j = null;
    try { j = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok && r.status !== 409) { const e = new Error((j && j.error) || 'http_' + r.status); e.status = r.status; throw e; }
    return j;
  }

  // ---------- players (the suggestion list) ----------
  // public/players.json: [id, name, career years, birth year or 0]. The birth
  // year shows only here, to tell two players of the same name apart.
  let PLAYERS = null, BY_ID = new Map();
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  async function loadPlayers() {
    if (PLAYERS) return PLAYERS;
    const r = await fetch('/deep-cut/players.json');
    const j = await r.json();
    PLAYERS = j.players.map((p) => ({ id: p[0], name: p[1], years: p[2], born: p[3], key: norm(p[1]), words: norm(p[1]).split(' ') }));
    for (const p of PLAYERS) BY_ID.set(p.id, p);
    return PLAYERS;
  }
  const nameOf = (id) => (BY_ID.get(id) || {}).name || id;
  // Every typed word must start a word of the name ("lebron", "le ja",
  // "james leb"). Full-name prefix matches first, then alphabetical.
  function search(q, skip) {
    const qs = norm(q);
    if (qs.length < 2 || !PLAYERS) return [];
    const parts = qs.split(' ');
    const out = [];
    for (const p of PLAYERS) {
      if (skip.has(p.id)) continue;
      if (parts.every((w) => p.words.some((x) => x.startsWith(w)))) out.push(p);
    }
    out.sort((a, b) => (b.key.startsWith(qs) - a.key.startsWith(qs)) || a.name.localeCompare(b.name));
    return out.slice(0, 6);
  }

  // ---------- state ----------
  const params = new URLSearchParams(location.search);
  const today = dailyDate(Date.now());
  const yday = addDays(today, -1);
  const view = params.get('view') === 'archive' ? 'archive'
    : validDate(params.get('r')) && params.get('r') < today ? 'results'
    : validDate(params.get('d')) && params.get('d') < today ? 'past' : 'today';
  const S = { date: view === 'past' ? params.get('d') : today, day: null, play: null, busy: false, sel: -1, list: [] };

  if (yday >= START) $('link-yday').href = '/deep-cut/?r=' + yday; else $('yday-wrap').classList.add('hide');

  // ---------- today / past ----------
  async function startGame() {
    $('sub').textContent = (view === 'past' ? 'Past day, unranked · ' : '') + '#' + dayNumber(S.date) + ' · ' + longDate(S.date);
    try {
      S.day = await api((view === 'past' ? 'day/' + S.date : 'today') + '?device=' + encodeURIComponent(device()));
    } catch (e) {
      $('prompt').textContent = e.status === 404 ? 'No prompt today. Check back at 9:00 AM ET.' : 'Could not load today’s prompt. Try again in a minute.';
      return;
    }
    if (view === 'today') S.date = S.day.date;
    $('sub').textContent = (view === 'past' ? 'Past day, unranked · ' : '') + '#' + S.day.n + ' · ' + longDate(S.date);
    $('prompt').textContent = S.day.text;
    $('meta').textContent = S.day.count + ' players fit. You get ' + TRIES + ' tries.';
    S.play = view === 'past' ? (store.get('dc-past-' + S.date) || { picks: [], triesLeft: TRIES, done: false }) : (S.day.play || { picks: [], triesLeft: TRIES, done: false });
    await loadPlayers();
    render();
  }

  function render() {
    const p = S.play;
    const misses = p.picks.filter((x) => !x.ok);
    $('misses').textContent = '';
    for (const m of misses) { const li = el('li', null, nameOf(m.id)); li.appendChild(el('span', 'why', ' doesn’t fit')); $('misses').appendChild(li); }
    $('dots').textContent = '';
    for (let i = 0; i < TRIES; i++) { const d = el('i', i < TRIES - p.triesLeft ? 'used' : ''); $('dots').appendChild(d); }
    $('tries-text').textContent = p.done ? '' : p.triesLeft + (p.triesLeft === 1 ? ' try left' : ' tries left');
    if (p.done) { $('ask').classList.add('hide'); showResult(); }
    else { $('ask').classList.remove('hide'); $('result').classList.add('hide'); }
  }

  async function pick(player) {
    if (S.busy || S.play.done) return;
    S.busy = true;
    $('msg').textContent = 'Checking…'; $('msg').className = 'msg';
    try {
      const body = { id: player.id };
      if (view === 'past') body.date = S.date; else body.device = device();
      const r = await api('pick', body);
      if (view === 'past') {
        const p = S.play;
        if (!p.picks.some((x) => x.id === player.id)) {
          p.picks.push({ id: player.id, ok: r.ok });
          if (r.ok) { p.done = true; p.score = r.answer.score; p.answer = r.answer; }
          else { p.triesLeft--; if (p.triesLeft <= 0) { p.done = true; p.score = 0; } }
        }
        store.set('dc-past-' + S.date, p);
      } else {
        S.play = r.play;
        if (r.ranked === false) S.unranked = true;
      }
      $('msg').textContent = r.ok ? '' : r.repeat ? 'Already tried. Pick someone else.' : S.play.done ? '' : player.name + ' doesn’t fit. Try again.';
      $('msg').className = r.ok ? 'msg' : 'msg err';
      $('q').value = ''; S.list = []; drawSugg();
      render();
      if (!S.play.done) $('q').focus();
    } catch (e) {
      $('msg').textContent = 'Could not check that pick. Try again.'; $('msg').className = 'msg err';
    } finally { S.busy = false; }
  }

  // Suggestions, inline under the box. Tap or Enter picks.
  function drawSugg() {
    const ul = $('sugg');
    ul.textContent = '';
    if ($('q').value.trim().length >= 2 && !S.list.length) { const li = el('li'); li.appendChild(el('div', 'none', 'No player by that name in the data.')); ul.appendChild(li); return; }
    S.list.forEach((p, i) => {
      const li = el('li');
      const b = el('button');
      b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(i === S.sel));
      b.appendChild(el('span', 'nm', p.name + (p.born ? ' (b. ' + p.born + ')' : '')));
      b.appendChild(el('span', 'yr', p.years));
      b.addEventListener('click', () => pick(p));
      li.appendChild(b); ul.appendChild(li);
    });
  }
  $('q').addEventListener('input', () => {
    const skip = new Set((S.play ? S.play.picks : []).map((x) => x.id));
    S.list = search($('q').value, skip); S.sel = S.list.length ? 0 : -1; drawSugg();
  });
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && S.list.length) { S.sel = (S.sel + 1) % S.list.length; drawSugg(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && S.list.length) { S.sel = (S.sel - 1 + S.list.length) % S.list.length; drawSugg(); e.preventDefault(); }
    else if (e.key === 'Enter' && S.sel >= 0 && S.list[S.sel]) { pick(S.list[S.sel]); e.preventDefault(); }
  });

  // ---------- result + share ----------
  function showResult() {
    const p = S.play;
    $('result').classList.remove('hide');
    const ok = !!p.answer;
    $('r-pick').textContent = ok ? p.answer.name + ' fits.' : 'Three misses. Score 0.';
    $('r-pick').className = 'r-pick' + (ok ? ' ok' : '');
    $('r-score').textContent = String(p.score || 0);
    $('r-line').textContent = ok ? 'Instant score: how deep a cut ' + p.answer.name + ' is in the data.' : '';
    const next = $('r-next');
    next.textContent = '';
    if (view === 'past') {
      next.append('Unranked. ');
      const a = el('a', null, 'See this day’s answers'); a.href = '/deep-cut/?r=' + S.date; next.appendChild(a);
    } else {
      next.append(S.unranked ? 'Unranked (too many plays from your network today). ' : 'Your final score, the full answer list and your rank: tomorrow at 9:00 AM ET, once everyone’s picks are in.');
    }
    drawShare();
  }
  function shareUrl(channel) { return SITE + (channel ? '?ref=share-deepcut-' + channel : ''); }
  function shareText(channel) { return 'Deep Cut #' + S.day.n + ' · ' + (S.play.score || 0) + '\n' + shareUrl(channel); }
  function drawShare() {
    $('r-sharetext').textContent = shareText('');
    const box = $('r-shares');
    box.textContent = '';
    const enc = encodeURIComponent;
    const targets = [
      ['X', 'x', (t) => 'https://x.com/intent/post?text=' + enc(t)],
      ['Bluesky', 'bluesky', (t) => 'https://bsky.app/intent/compose?text=' + enc(t)],
      ['Facebook', 'facebook', (t, u) => 'https://www.facebook.com/sharer/sharer.php?u=' + enc(u)],
      ['WhatsApp', 'whatsapp', (t) => 'https://wa.me/?text=' + enc(t)],
      ['Reddit', 'reddit', (t, u) => 'https://www.reddit.com/submit?url=' + enc(u) + '&title=' + enc(t.split('\n')[0])],
      ['Telegram', 'telegram', (t, u) => 'https://t.me/share/url?url=' + enc(u) + '&text=' + enc(t.split('\n')[0])],
    ];
    for (const [name, ch, url] of targets) {
      const a = el('a', null, name); a.href = url(shareText(ch), shareUrl(ch)); a.target = '_blank'; a.rel = 'noopener';
      box.appendChild(a);
    }
    const copy = el('button', null, 'Copy'); copy.type = 'button';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(shareText('copy')); copy.textContent = 'Copied'; } catch (e) { copy.textContent = 'Copy failed'; }
      setTimeout(() => { copy.textContent = 'Copy'; }, 2000);
    });
    box.appendChild(copy);
  }

  // ---------- results ----------
  async function showResults(date) {
    $('game').classList.add('hide');
    $('results').classList.remove('hide');
    $('sub').textContent = '#' + dayNumber(date) + ' · ' + longDate(date);
    $('res-title').textContent = 'Answers';
    let r;
    try { r = await api('results/' + date + '?device=' + encodeURIComponent(device())); }
    catch (e) { $('res-prompt').textContent = e.status === 404 ? 'No prompt that day.' : 'Could not load the answers.'; return; }
    $('res-prompt').textContent = r.text;
    const you = r.you;
    $('res-you').textContent = you ? (you.id ? 'Your final score: ' + you.final + (you.rank ? ', #' + you.rank + ' of ' + you.of : ' (unranked)') + ' · instant ' + you.instant
      : 'Three misses: 0' + (you.rank ? ', #' + you.rank + ' of ' + you.of : '')) : 'You didn’t play this day. ';
    if (!you) { const a = el('a', null, 'Play it now (unranked)'); a.href = '/deep-cut/?d=' + date; $('res-you').appendChild(a); }
    $('res-meta').textContent = r.answers.length + ' players fit · ' + r.plays + (r.plays === 1 ? ' player' : ' players') + ' played';
    const max = Math.max(1, ...r.answers.map((a) => a.pct));
    const ol = $('res-list');
    ol.textContent = '';
    for (const a of r.answers) {
      const li = el('li', you && you.id === a.id ? 'me' : '');
      const nm = el('span');
      if (a.link) { const l = el('a', null, a.name); l.href = a.link; nm.appendChild(l); } else nm.textContent = a.name;
      nm.appendChild(el('span', 'sc', ' · instant ' + a.score));
      li.appendChild(nm);
      li.appendChild(el('span', 'pct', a.pct + '%'));
      const bar = el('span', 'bar'); const i = el('i'); i.style.width = (100 * a.pct / max) + '%'; bar.appendChild(i); li.appendChild(bar);
      ol.appendChild(li);
    }
  }

  // ---------- archive ----------
  function showArchive() {
    $('game').classList.add('hide');
    $('archive').classList.remove('hide');
    $('sub').textContent = 'Every past Deep Cut';
    const ul = $('arc-list');
    for (let d = yday; d >= START; d = addDays(d, -1)) {
      const li = el('li');
      li.appendChild(el('span', null, '#' + dayNumber(d) + ' · ' + longDate(d)));
      const links = el('span');
      const play = el('a', null, 'Play'); play.href = '/deep-cut/?d=' + d;
      const ans = el('a', null, 'Answers'); ans.href = '/deep-cut/?r=' + d;
      links.append(play, ' · ', ans);
      li.appendChild(links);
      ul.appendChild(li);
    }
    if (!ul.children.length) ul.appendChild(el('li', 'muted', 'Deep Cut #1 is today’s. Past days show up here from tomorrow.'));
  }

  if (view === 'results') showResults(params.get('r'));
  else if (view === 'archive') showArchive();
  else startGame();
})();
