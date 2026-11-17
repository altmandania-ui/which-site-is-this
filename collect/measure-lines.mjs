// Measures where each line of the collected text sits on its page, so the presentation can show the
// page and the text side by side and move them together.
// It opens each live page the way the collectors did (1440 wide, walked to its foot and back), takes
// every piece of text the page draws with its distance from the top, and matches the lines already
// saved in data/ to those pieces, in order. Nothing saved is changed: a line the page no longer has
// gets no position (null), and the build places it between its neighbours.
// Writes data/guess/<id>-lines.json. Needs internet. The page may have moved since its picture was
// taken; the page height found now is saved beside the positions so the build can compare.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url).pathname;
const SITES = {
  ikea: { url: 'https://www.ikea.com/il/he/', dismiss: 'אישור', text: 'data/guess/ikea.txt' },
  netflix: { url: 'https://www.netflix.com/il/', text: 'data/guess/netflix.txt' },
  supermarket: { url: 'https://www.rami-levy.co.il/he', text: 'data/innerText.txt' },
};
const only = process.argv.slice(2);
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const browser = await chromium.launch();
for (const [id, site] of Object.entries(SITES)) {
  if (only.length && !only.includes(id)) continue;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const page = await context.newPage();
  await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  if (site.dismiss) {
    await page.getByRole('button', { name: site.dismiss, exact: true }).first().click({ timeout: 5000 }).catch(() => console.log(id, 'nothing to dismiss'));
    await page.waitForTimeout(1500);
  }
  let h = 0;
  for (let pass = 0; pass < 4; pass++) {
    const before = h;
    h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 500) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(300);
      h = await page.evaluate(() => document.documentElement.scrollHeight);
    }
    if (h === before) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2000);

  // every text node the page draws, in document order, with the top and bottom of its box
  const nodes = await page.evaluate(() => {
    const out = [], walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), range = document.createRange();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const tag = n.parentElement && n.parentElement.closest('script,style,noscript,template');
      if (tag) continue;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (!range.getClientRects().length) continue;   // not drawn at all; text hidden from the eye only is kept
      out.push({ t, top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY) });
    }
    return out;
  });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const nowText = await page.evaluate(() => document.body.innerText);

  const lines = (await readFile(root + site.text, 'utf8')).split('\n').map(norm).filter(Boolean);
  // The page's text is its pieces one after another. With spaces taken out of both, each saved line
  // is looked for in that run of letters, starting where the line before it ended.
  const bare = (s) => s.toLowerCase().replace(/\s+/g, '');
  let run = '';
  const owner = [];   // for every letter of the run, the piece it came from
  nodes.forEach((n, k) => { const b = bare(n.t); run += b; for (let c = 0; c < b.length; c++) owner.push(k); });
  const ys = [];
  let pos = 0, found = 0;
  for (const line of lines) {
    // Close after the line before it; or, if the page has this line in one place only, there
    // (pages reorder what they list, and the matching picks up again from that place).
    const L = bare(line);
    let hit = run.indexOf(L, pos);
    if (hit < 0 || hit - pos > 600) {
      const one = run.indexOf(L);
      hit = L.length >= 6 && one >= 0 && run.indexOf(L, one + 1) < 0 ? one : -1;
    }
    if (hit < 0) { ys.push(null); continue; }
    found++;
    const first = nodes[owner[hit]], last = nodes[owner[hit + L.length - 1]];
    ys.push([Math.min(first.top, last.top), Math.max(first.bottom, last.bottom)]);
    pos = hit + L.length;
  }
  const nowLines = new Set(nowText.split('\n').map(norm).filter(Boolean));
  const still = lines.filter((l) => nowLines.has(l)).length;
  await writeFile(root + 'data/guess/' + id + '-lines.json', JSON.stringify({ url: site.url, measuredAt: new Date().toISOString(), pageHeight: height, lines: lines.length, found, ys }));
  console.log(id, '| lines', lines.length, '| placed', found, '| still on the page word for word', still, '| page height now', height);
  await context.close();
}
await browser.close();
