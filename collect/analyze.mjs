// Derives every number shown on the site from the raw files in data/. Reads only; never edits the raw files.
import { readFile, writeFile } from 'node:fs/promises';

const DATA = new URL('../data/', import.meta.url).pathname;
const HEADING = 'מבצעים שבועיים';

const aria = await readFile(DATA + 'accessibility-snapshot.yml', 'utf8');
const innerText = await readFile(DATA + 'innerText.txt', 'utf8');
const dom = JSON.parse(await readFile(DATA + 'dom-counts.json', 'utf8'));

const ariaLines = aria.split('\n');
const role = (line) => (line.match(/^\s*- '?([a-z]+)\b/) || [])[1];
const headingLine = ariaLines.findIndex((l) => role(l) === 'heading' && l.includes(`"${HEADING}"`));
const firstProductLine = ariaLines.findIndex((l, i) => i > headingLine && role(l) === 'button');

const countRoles = (lines) => ({
  links: lines.filter((l) => role(l) === 'link').length,
  buttons: lines.filter((l) => role(l) === 'button').length,
});
const beforeHeading = countRoles(ariaLines.slice(0, headingLine));
const whole = countRoles(ariaLines);

// Unit prices as they appear in innerText, each paired with the product name and shelf price above it.
const textLines = innerText.split('\n');
const unitPrices = [];
textLines.forEach((line, i) => {
  const m = line.match(/^(\d+(?:\.\d+)?) ל-(\d+) (.+)$/);
  if (!m) return;
  let price = null, name = null;
  for (let j = i - 1; j >= 0 && j > i - 14; j--) {
    if (price === null && /^\d+\.\d+ ₪$/.test(textLines[j]) && textLines[j - 1] === 'מחיר נוכחי') price = parseFloat(textLines[j]);
    if (textLines[j] === 'מחיר נוכחי' || textLines[j] === 'מחיר קודם') {
      // product name is the line just above the first price label (skipping a repeated deal label)
      let k = j - 1;
      if (/ב-\d+$|^קנה קבל$/.test(textLines[k])) k--;
      name = textLines[k];
    }
    if (textLines[j].startsWith('פתח תיאור המוצר')) break;
  }
  const unitPrice = parseFloat(m[1]);
  unitPrices.push({
    innerTextLine: i + 1,
    product: name,
    shelfPrice: price,
    unitPriceText: line,
    unitPrice,
    // Rule: a per-unit price more than 5x the price of the whole item cannot be right.
    suspicious: price !== null && unitPrice > price * 5,
  });
});

const numbers = {
  source: dom.url,
  collectedAt: dom.collectedAt,
  viewportWidth: 1440,
  pageHeightPx: dom.pageHeight,
  innerText: { chars: innerText.length, lines: textLines.length },
  accessibilitySnapshot: {
    lines: ariaLines.length,
    headingLine: headingLine + 1,
    firstProductLine: firstProductLine + 1,
    linksBeforeHeading: beforeHeading.links,
    buttonsBeforeHeading: beforeHeading.buttons,
    linksAndButtonsBeforeHeading: beforeHeading.links + beforeHeading.buttons,
    linksTotal: whole.links,
    buttonsTotal: whole.buttons,
  },
  dom: {
    linksBeforeHeading: dom.linksBeforeHeading,
    buttonsBeforeHeading: dom.buttonsBeforeHeading,
    linksAndButtonsBeforeHeading: dom.linksBeforeHeading + dom.buttonsBeforeHeading,
    linksTotal: dom.linksTotal,
    buttonsTotal: dom.buttonsTotal,
    imagesTotal: dom.imagesTotal,
    imagesWithoutAltAttribute: dom.imagesNoAltAttribute,
    imagesWithEmptyAlt: dom.imagesEmptyAlt,
    imagesWithoutAltText: dom.imagesNoAltAttribute + dom.imagesEmptyAlt,
  },
  unitPrices: { total: unitPrices.length, suspicious: unitPrices.filter((u) => u.suspicious), all: unitPrices },
};

await writeFile(DATA + 'numbers.json', JSON.stringify(numbers, null, 2));
const { all, ...rest } = numbers.unitPrices;
console.log(JSON.stringify({ ...numbers, unitPrices: rest }, null, 2));
console.log(all.map((u) => `${u.suspicious ? '!!' : '  '} ${u.unitPriceText} | ${u.shelfPrice} | ${u.product}`).join('\n'));
