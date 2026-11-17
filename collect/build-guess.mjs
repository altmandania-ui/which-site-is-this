// Packs the game into site/data.js and copies its three pictures into site/assets/guess/.
// The page text is embedded as collected, with two changes only: empty lines are dropped, and every
// letter of the site's own name is replaced by a block (█) so the room has to guess it.
// The picture of each site is its whole page, top to foot, 1440 pixels wide.
//
// Each site also carries a task: the room is the agent, and has to do it from the text alone.
//   ask      the task, as the room reads it
//   from     how the first line of the passage that answers it begins; `count` lines are shown
//   spot     where the eye finds the answer on the real page: [x, y, width, height] in pixels of the picture
//   caption  what the design did there
//   got      lines of the text that stand for the answer (none, if it never arrived); shown again
//            on the summary screen beside a cut-out of the page
//   absent   words that are on the real page but must not be anywhere in the text (checked)
// The build fails if any of this stops being true of the collected text.
//
// The picture case. An agent that is given the page as one picture gets it cut into pieces. How
// many is measured: in data/agent-read-vs-seen.json the model was sent the supermarket page
// (1440x6259) and reported 1,104 picture tokens; the first screenful (1440x900) came to 1,092.
// Both numbers are what one rule gives: a grid of square pieces, about 1,120 at most, so
// columns = floor(sqrt(1120 * width / height)) and rows = floor(height / piece). That rule is used
// for all three pages; the build fails if it stops giving 1,104 for the supermarket. For the other
// two pages the number is computed, not measured.
// The page and the text together. collect/measure-lines.mjs found where each line of the saved text
// sits on its live page (data/guess/<id>-lines.json). Each line gets one number here: how far down
// the picture it is. A line that was not found is put evenly between the found lines around it.
//   seenNote  something a model said after being given that page as a picture; `seenQuote` must be
//             in the saved answers (checked).
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const SITES = [
  { id: 'ikea', name: 'IKEA', text: 'data/guess/ikea.txt', shot: 'data/guess/ikea-full.jpg', hide: /איקאה|ikea/gi,
    task: { ask: 'מה הכי חשוב בעמוד הזה?', from: 'ברוכים הבאים למתחם', count: 7,
      spot: [1048, 506, 344, 344], absent: 'מרעננים את הבית', got: [],
      caption: 'העין הולכת ישר לכתום. בטקסט שהסוכן קיבל הכתום לא קיים: המילים שעליו לא הגיעו אליו.' } },
  { id: 'netflix', name: 'Netflix', text: 'data/guess/netflix.txt', shot: 'data/guess/netflix-full.jpg', hide: /netflix|נטפליקס/gi,
    task: { ask: 'מה במקום 4 בפופולריים כרגע?', from: 'לופן', count: 9,
      spot: [412, 905, 216, 265], got: ['רק לא זה', '4', '4', 'הדיפלומטית'],
      caption: 'בעמוד: 4 ענק, צמוד לפוסטר אחד. בטקסט: 4 פעמיים, בין שני שמות, ושום דבר לא אומר לאיזה מהם הוא שייך.' } },
  { id: 'supermarket', name: 'רמי לוי', text: 'data/innerText.txt', shot: 'data/guess/supermarket-full.jpg', hide: /רמי לוי|rami-levy|שיווק השקמה|השקמה/gi,
    task: { ask: 'מה המוצר הכי זול בעמוד?', from: 'גריזלי גריל', count: 8,
      spot: [1078, 1322, 112, 46], got: ['0.00 ₪', '0.17 ל-1 יחידה', '3.50 ₪'],
      caption: 'בעמוד: מחיר של מוצר גדול וכחול, מחיר ל-100 גרם קטן ואפור, והסל בצד. בטקסט: 0.00, 0.17 ו-3.50 נראים בדיוק אותו דבר.',
      seenQuote: "עוגת אספונג'יק טרופי",
      seenNote: 'מודל שקיבל את העמוד הזה כתמונה קרא לוויטמינצ׳יק טרופי ״עוגת אספונג׳יק טרופי״.' } },
];

await mkdir(root + 'site/assets/guess', { recursive: true });
const seenRuns = JSON.parse(await readFile(root + 'data/agent-read-vs-seen.json', 'utf8')).answers.filter((a) => a.input === 'seen');
const measured = seenRuns[0].usage.promptTokensDetails.find((d) => d.modality === 'IMAGE').tokenCount;
const sites = [];
for (const s of SITES) {
  const raw = await readFile(root + s.text, 'utf8');
  let hidden = 0;
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(s.hide, (m) => { hidden++; return m.replace(/[^\s-]/g, '█'); }));
  const file = s.id + '.jpg';
  await copyFile(root + s.shot, root + 'site/assets/guess/' + file);
  const size = (k) => +execFileSync('sips', ['-g', k, root + s.shot]).toString().match(/: (\d+)/)[1];
  if (size('pixelWidth') !== 1440) throw new Error(s.id + ': the picture is not 1440 wide');

  const t = s.task;
  const rawLines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const start = rawLines.findIndex((l) => l.startsWith(t.from));
  if (start < 0) throw new Error(s.id + ': the passage is not in the text');
  if (t.absent && raw.includes(t.absent)) throw new Error(s.id + ': "' + t.absent + '" is in the text after all');
  for (const g of t.got) if (!lines.includes(g)) throw new Error(s.id + ': "' + g + '" is not a line of the text');
  const height = size('pixelHeight');
  const cols = Math.floor(Math.sqrt(1120 * 1440 / height)), rows = Math.floor(height / (1440 / cols));
  if (s.id === 'supermarket' && cols * rows !== measured) throw new Error('the grid rule gives ' + cols * rows + ' pieces, the model reported ' + measured);
  if (t.seenQuote && !seenRuns.some((a) => a.answer.includes(t.seenQuote))) throw new Error(s.id + ': the model never said "' + t.seenQuote + '"');
  const where = JSON.parse(await readFile(root + 'data/guess/' + s.id + '-lines.json', 'utf8'));
  if (where.ys.length !== lines.length) throw new Error(s.id + ': positions were measured for ' + where.ys.length + ' lines, the text has ' + lines.length);
  const ys = where.ys.map((y) => (y ? Math.max(0, Math.min(height, Math.round((y[0] + y[1]) / 2))) : null));
  for (let k = 0; k < ys.length; k++) {
    if (ys[k] !== null) continue;
    let a = k - 1, b = k + 1;
    while (b < ys.length && ys[b] === null) b++;
    const before = a >= 0 ? ys[a] : null, after = b < ys.length ? ys[b] : null;
    ys[k] = before === null ? after : after === null ? before : Math.round(before + (after - before) * (k - a) / (b - a));
  }
  const task = { seenNote: t.seenNote || '', ask: t.ask, got: t.got, lines: lines.slice(start, start + t.count), caption: t.caption, spot: t.spot };
  sites.push({ id: s.id, name: s.name, image: 'assets/guess/' + file, height, grid: { cols, rows }, lines, ys, task });
  console.log(s.id, 'lines:', lines.length, '| name hidden', hidden, 'times | page height', height, '| pieces', cols + ' x ' + rows + ' = ' + cols * rows, '| lines placed on the page', where.found, 'of', lines.length, '| page height when placed', where.pageHeight);
}
await writeFile(root + 'site/data.js', 'window.DATA = ' + JSON.stringify({ sites }) + ';\n');
