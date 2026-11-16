// Locates every empty-alt image relative to the saved accessibility snapshot.
// Empty-alt images do not appear in the tree at all, so to learn WHERE each one is missing from,
// this script (after confirming the live tree is identical to the saved one) temporarily gives each
// such image a marker name, snapshots again, and records the line each marker lands before.
// The saved raw files are not modified. Output: data/image-positions.json
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const PAGE_URL = 'https://www.rami-levy.co.il/he';
const DATA = new URL('../data/', import.meta.url).pathname;
const saved = await readFile(DATA + 'accessibility-snapshot.yml', 'utf8');
const savedCounts = JSON.parse(await readFile(DATA + 'dom-counts.json', 'utf8'));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })).newPage();
await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(3000);
let lastHeight = 0;
for (let pass = 0; pass < 6; pass++) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 450) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(250); }
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const h2 = await page.evaluate(() => document.documentElement.scrollHeight);
  if (h2 === lastHeight) break;
  lastHeight = h2;
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(2000);

const live = await page.locator('body').ariaSnapshot();
const sameTree = live === saved;

const images = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')];
  let n = 0;
  const out = [];
  for (const img of imgs) {
    if (!(img.hasAttribute('alt') && img.getAttribute('alt').trim() === '')) continue;
    const r = img.getBoundingClientRect();
    const btn = img.closest('button, [role="button"], a');
    out.push({
      id: n,
      src: img.currentSrc || img.src,
      width: Math.round(r.width), height: Math.round(r.height),
      pageY: Math.round(r.top + window.scrollY),
      ariaHidden: !!img.closest('[aria-hidden="true"]'),
      insideProductButton: !!(btn && (btn.getAttribute('aria-label') || btn.textContent || '').includes('פתח תיאור המוצר')),
    });
    img.setAttribute('alt', 'EMPTYALTMARK' + n + 'X');
    n++;
  }
  return { total: imgs.length, empty: out };
});

const marked = (await page.locator('body').ariaSnapshot()).split('\n');
await browser.close();

// Strip markers; what remains must be the saved tree, otherwise positions are not trustworthy.
const stripped = [];
const position = {};
for (const line of marked) {
  const own = line.match(/^\s*- img "EMPTYALTMARK(\d+)X"$/);
  if (own) { position[own[1]] = stripped.length + 1; continue; } // 1-based: the saved line it sits just before
  stripped.push(line.replace(/ ?EMPTYALTMARK\d+X/g, ''));
}
const strippedMatches = stripped.join('\n') === saved;
const inlineLeak = marked.filter((l) => /EMPTYALTMARK/.test(l) && !/^\s*- img "EMPTYALTMARK\d+X"$/.test(l)).length;

for (const im of images.empty) im.beforeTreeLine = position[im.id] ?? null;
const result = {
  collectedAt: new Date().toISOString(),
  liveTreeIdenticalToSaved: sameTree,
  markerStrippedTreeIdenticalToSaved: strippedMatches,
  markerLinesLeakedIntoOtherNames: inlineLeak,
  imagesTotal: images.total,
  imagesWithEmptyAlt: images.empty.length,
  matchesSavedCounts: images.total === savedCounts.imagesTotal && images.empty.length === savedCounts.imagesEmptyAlt,
  located: images.empty.filter((i) => i.beforeTreeLine !== null).length,
  notLocated: images.empty.filter((i) => i.beforeTreeLine === null).length,
  insideProductButtons: images.empty.filter((i) => i.insideProductButton).length,
  images: images.empty,
};
await writeFile(DATA + 'image-positions.json', JSON.stringify(result, null, 2));
const { images: _, ...summary } = result;
console.log(summary);
if (!strippedMatches) {
  const a = stripped, b = saved.split('\n');
  console.log('lens', a.length, b.length);
  for (let i = 0, shown = 0; i < Math.max(a.length, b.length) && shown < 8; i++) if (a[i] !== b[i]) { console.log(i + 1, '\n  new:', a[i], '\n  old:', b[i]); shown++; }
}
