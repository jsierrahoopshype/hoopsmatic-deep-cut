// Spoiler-free link-preview cards (1200x630 JPEG), one per scheduled day and
// one for the main page: the puzzle's identity and an invitation, never a
// prompt or an answer.
//
//   node scripts/cards.mjs        (after build.mjs; needs the playwright package)
//
// Writes public/og/<date>.jpg, public/og/main.jpg and public/og/index.json
// (date -> label drawn, with the card design version). Only cards that are missing or whose label changed
// (a new launch date renumbers days) are drawn again. Served extension-less
// at hoopsmatic.com/deep-cut/og-card[/<date>] by hoopsmatic-worker.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
// require() (unlike import) also finds a playwright installed outside the repo.
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = new URL('..', import.meta.url).pathname;
const rd = (f) => JSON.parse(readFileSync(ROOT + f, 'utf8'));
const LAUNCH = rd('rules/launch.json').launch;
const days = rd('data/schedule.json').days.map((d) => d.date);
const idxPath = ROOT + 'public/og/index.json';
const index = existsSync(idxPath) ? rd('public/og/index.json') : {};
mkdirSync(ROOT + 'public/og', { recursive: true });

const longDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const labelOf = (d) => (d >= LAUNCH ? `#${Math.round((Date.parse(d) - Date.parse(LAUNCH)) / 86400000) + 1}` : 'Preview');
// The page is about:blank, so the font goes in as a data URL.
const font = 'data:font/woff2;base64,' + readFileSync(ROOT + 'public/fonts/dm-sans-latin-wght-normal.woff2').toString('base64');
const oswald = 'data:font/woff2;base64,' + readFileSync(ROOT + 'public/fonts/oswald-latin-wght-normal.woff2').toString('base64');
const html = (top, sub) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "DM Sans"; font-weight: 100 1000; src: url("${font}") format("woff2"); }
@font-face { font-family: "Oswald"; font-weight: 200 700; src: url("${oswald}") format("woff2"); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #0b0b1c; font-family: "DM Sans", sans-serif; color: #e0e0ff; padding: 48px; }
.card { width: 100%; height: 100%; background: linear-gradient(135deg, #15153a 0%, #0a0a1a 100%); border: 2px solid #3a3a6a; border-radius: 24px; padding: 56px 64px; display: flex; flex-direction: column; }
.brand { font-family: "Oswald", sans-serif; font-size: 28px; letter-spacing: 6px; text-transform: uppercase; color: #aaaadd; }
h1 { font-family: "Oswald", sans-serif; font-size: 112px; line-height: 1; letter-spacing: 10px; text-transform: uppercase; margin-top: 14px;
  background: linear-gradient(90deg, #ff6b35, #ffd700); -webkit-background-clip: text; background-clip: text; color: transparent; }
.top { font-family: "Oswald", sans-serif; font-size: 44px; letter-spacing: 3px; text-transform: uppercase; color: #ffd700; margin-top: 18px; }
.sub { font-size: 32px; color: #e0e0ff; margin-top: auto; line-height: 1.3; }
.url { font-size: 26px; color: #888899; margin-top: 12px; }
.rounds { position: absolute; right: 120px; top: 132px; display: grid; grid-template-columns: repeat(5, 40px); gap: 8px; }
.rounds i { width: 40px; height: 40px; border-radius: 8px; background: #0e0e2a; border: 2px solid #ffd700; display: block; }
</style></head><body><div class="card">
<div class="brand">HoopsMatic</div><h1>Deep Cut</h1><div class="top">${top}</div>
<div class="rounds"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
<div class="sub">${sub}</div><div class="url">hoopsmatic.com/deep-cut</div></div></body></html>`;

const jobs = [];
if (!existsSync(ROOT + 'public/og/main.jpg') || index.main !== 'main-v3') jobs.push(['main', 'Ten NBA questions a day', 'Name the least obvious player who fits. The deeper the cut, the more points.']);
for (const d of days) if (!existsSync(`${ROOT}public/og/${d}.jpg`) || index[d] !== labelOf(d) + '|v3') jobs.push([d, `${labelOf(d)} · ${longDate(d)}`, 'Ten NBA questions. Name the least obvious player who fits each one. Score out of 100.']);
if (!jobs.length) { console.log('cards: nothing to draw'); process.exit(0); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const [key, top, sub] of jobs) {
  await page.setContent(html(top, sub), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${ROOT}public/og/${key}.jpg`, type: 'jpeg', quality: 80 });
  index[key] = key === 'main' ? 'main-v3' : labelOf(key) + '|v3';
}
await browser.close();
writeFileSync(idxPath, JSON.stringify(index, null, 1) + '\n');
console.log(`cards: drew ${jobs.length}`);
