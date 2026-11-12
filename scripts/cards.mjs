// Spoiler-free link-preview cards (1200x630 JPEG), one per scheduled day and
// one for the main page: the puzzle's identity and an invitation, never a
// prompt or an answer.
//
//   node scripts/cards.mjs        (after build.mjs; needs the playwright package)
//
// Writes public/og/<date>.jpg, public/og/main.jpg and public/og/index.json
// (date -> label drawn). Only cards that are missing or whose label changed
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

const pad3 = (n) => String(n).padStart(3, '0');
const longDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const labelOf = (d) => (d >= LAUNCH ? `#${pad3(Math.round((Date.parse(d) - Date.parse(LAUNCH)) / 86400000) + 1)}` : 'Preview');
// The page is about:blank, so the font goes in as a data URL.
const font = 'data:font/woff2;base64,' + readFileSync(ROOT + 'public/fonts/dm-sans-latin-wght-normal.woff2').toString('base64');
const html = (top, sub) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "DM Sans"; font-weight: 100 1000; src: url("${font}") format("woff2"); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #f5f5f7; font-family: "DM Sans", sans-serif; color: #1d1d1f; padding: 56px; }
.card { width: 100%; height: 100%; background: #fff; border: 2px solid #d1d1d6; border-radius: 28px; padding: 60px 64px; display: flex; flex-direction: column; }
.brand { font-size: 30px; font-weight: 700; color: #6e6e73; }
h1 { font-size: 104px; line-height: 1; letter-spacing: -2px; margin-top: 18px; }
.top { font-size: 46px; font-weight: 700; color: #1d4ed8; margin-top: 22px; }
.sub { font-size: 34px; color: #1d1d1f; margin-top: auto; line-height: 1.3; }
.url { font-size: 28px; color: #6e6e73; margin-top: 14px; }
.rounds { position: absolute; right: 120px; top: 132px; display: flex; gap: 12px; }
.rounds i { width: 56px; height: 56px; border-radius: 14px; background: #eaf6ee; border: 2px solid #b9dfc5; display: block; }
</style></head><body><div class="card">
<div class="brand">HoopsMatic</div><h1>Deep Cut</h1><div class="top">${top}</div>
<div class="rounds"><i></i><i></i><i></i><i></i><i></i></div>
<div class="sub">${sub}</div><div class="url">hoopsmatic.com/deep-cut</div></div></body></html>`;

const jobs = [];
if (!existsSync(ROOT + 'public/og/main.jpg') || index.main !== 'main-v1') jobs.push(['main', 'Five NBA prompts a day', 'Name the least obvious player who fits. The deeper the cut, the more points.']);
for (const d of days) if (!existsSync(`${ROOT}public/og/${d}.jpg`) || index[d] !== labelOf(d)) jobs.push([d, `${labelOf(d)} · ${longDate(d)}`, 'Five NBA prompts. Name the least obvious player who fits each one, up to 500 points.']);
if (!jobs.length) { console.log('cards: nothing to draw'); process.exit(0); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const [key, top, sub] of jobs) {
  await page.setContent(html(top, sub), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${ROOT}public/og/${key}.jpg`, type: 'jpeg', quality: 80 });
  index[key] = key === 'main' ? 'main-v1' : labelOf(key);
}
await browser.close();
writeFileSync(idxPath, JSON.stringify(index, null, 1) + '\n');
console.log(`cards: drew ${jobs.length}`);
