// Step 0: collect raw data from the live page. Nothing here cleans or fixes the content.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';

const PAGE_URL = 'https://www.rami-levy.co.il/he';
const OUT = new URL('../data/', import.meta.url).pathname;
const HEADING = 'מבצעים שבועיים';

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED ? false : true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'he-IL',
  timezoneId: 'Asia/Jerusalem',
});
const page = await context.newPage();

await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(3000);

// Scroll the whole page so lazy content loads, repeating until the height stops growing.
let lastHeight = 0;
for (let pass = 0; pass < 6; pass++) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 450) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(250);
  }
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const newHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  if (newHeight === lastHeight) break;
  lastHeight = newHeight;
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(2000);

await page.screenshot({ path: OUT + 'screenshot-top.png' });
await page.screenshot({ path: OUT + 'screenshot-full.png', fullPage: true });

const innerText = await page.evaluate(() => document.body.innerText);
await writeFile(OUT + 'innerText.txt', innerText);

const aria = await page.locator('body').ariaSnapshot();
await writeFile(OUT + 'accessibility-snapshot.yml', aria);

const dom = await page.evaluate((HEADING) => {
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')];
  const heading = headings.find((h) => h.textContent.trim() === HEADING)
    || headings.find((h) => h.textContent.includes(HEADING));
  const before = (el) =>
    heading ? !!(heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) : null;
  const links = [...document.querySelectorAll('a[href], [role="link"]')];
  const buttons = [...document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')];
  const imgs = [...document.querySelectorAll('img')];
  return {
    headingFound: !!heading,
    headingTag: heading ? heading.tagName : null,
    headingText: heading ? heading.textContent.trim() : null,
    headingMatches: headings.filter((h) => h.textContent.includes(HEADING)).length,
    linksTotal: links.length,
    buttonsTotal: buttons.length,
    linksBeforeHeading: heading ? links.filter(before).length : null,
    buttonsBeforeHeading: heading ? buttons.filter(before).length : null,
    imagesTotal: imgs.length,
    imagesNoAltAttribute: imgs.filter((i) => !i.hasAttribute('alt')).length,
    imagesEmptyAlt: imgs.filter((i) => i.hasAttribute('alt') && i.getAttribute('alt').trim() === '').length,
    pageHeight: document.documentElement.scrollHeight,
    title: document.title,
  };
}, HEADING);

await writeFile(OUT + 'dom-counts.json', JSON.stringify({ url: PAGE_URL, collectedAt: new Date().toISOString(), ...dom }, null, 2));
console.log(dom);
console.log('innerText chars:', innerText.length, '| aria lines:', aria.split('\n').length);
await browser.close();
