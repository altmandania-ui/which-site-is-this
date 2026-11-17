// Collects the two extra sites for the game: the page text (document.body.innerText) untouched,
// and a picture of the whole page, top to foot. The supermarket round reuses data/innerText.txt and
// data/screenshot-full.png. Needs internet; live pages change, so every run gives different text.
// The text is taken first, as the page stands when it opens. Then the page is walked to its foot so
// that pictures which load late are there, and only then is the picture taken.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../data/guess/', import.meta.url).pathname;
const SITES = {
  ikea: { url: 'https://www.ikea.com/il/he/', dismiss: 'אישור' },   // the cookie notice is closed before the picture
  netflix: { url: 'https://www.netflix.com/il/' },
};

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [id, site] of Object.entries(SITES)) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const page = await context.newPage();
  await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  if (site.dismiss) {
    await page.getByRole('button', { name: site.dismiss, exact: true }).first().click({ timeout: 5000 }).catch(() => console.log(id, 'nothing to dismiss'));
    await page.waitForTimeout(1500);
  }
  const text = await page.evaluate(() => document.body.innerText);
  let h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 600) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(350);
    h = await page.evaluate(() => document.documentElement.scrollHeight);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + id + '-full.jpg', fullPage: true, type: 'jpeg', quality: 80 });
  await writeFile(OUT + id + '.txt', text);
  await writeFile(OUT + id + '.json', JSON.stringify({ url: site.url, collectedAt: new Date().toISOString(), title: await page.title() }, null, 2));
  console.log(id, 'chars:', text.length);
  await context.close();
}
await browser.close();
