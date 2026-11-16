// Packs the raw files into site/data.js so the site works from file:// with no server and no network.
// Content is embedded verbatim (JSON.stringify), nothing is cleaned.
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const read = (f) => readFile(root + 'data/' + f, 'utf8');
const pick = (a) => ({ question: a.question, answer: a.answer, model: a.model, askedAt: a.askedAt });

const answers = JSON.parse(await read('agent-answers.json')).answers;
const stakes = JSON.parse(await read('agent-stakes.json')).answers;
const allergy = stakes.filter((a) => a.question === stakes[0].question).sort((a, b) => a.run - b.run);
const crops = JSON.parse(await read('crop-proposals/crops.json'));
// second stakes round: the finished file, or the answers saved so far if the run is still going
const s2raw = JSON.parse(await read(existsSync(root + 'data/agent-stakes-2.json') ? 'agent-stakes-2.json' : 'agent-stakes-2.partial.json'));
const stakes2 = Array.isArray(s2raw) ? s2raw : s2raw.answers;
const rvs = JSON.parse(await read('agent-read-vs-seen.json')).answers;
const fs1 = JSON.parse(await read('agent-first-screen.json')).answers;
// One question, one model, different things handed to it. Every column is one saved answer, whole.
const SHOT = 'assets/first-screen.png', CARD = 'assets/crops/vitaminchik.png';
const given = (word, kinds) => {
  const cols = kinds.map((k) => (k === 'read' ? rvs : fs1).find((a) => a.input === k && a.question.includes(word)));
  if (cols.some((c) => !c) || cols.some((c) => c.model !== cols[0].model || c.question !== cols[0].question)) throw new Error('not comparable: ' + word);
  return { question: cols[0].question, model: cols[0].model, cols: cols.map((c) => ({ got: c.input, image: c.input === 'screen' ? SHOT : c.input === 'card' ? CARD : null, answer: c.answer })) };
};
const s2 = (word, run) => stakes2.find((a) => a.question.includes(word) && a.run === run);

const data = {
  aria: await read('accessibility-snapshot.yml'),
  innerText: await read('innerText.txt'),             // the text the model was given
  given: [given('הכי בולט', ['read', 'screen']), given('אילו מוצרים', ['read', 'screen']), given('ל-100', ['read', 'screen', 'card'])],
  direct: pick(s2('תענה בכן או לא', 1)),              // asked directly: is it safe?
  act: pick(s2('ותוסיף לסל', 2)),                     // asked to choose and add to the basket
  numbers: JSON.parse(await read('numbers.json')),
  describe: pick(answers[4]),                    // "תאר את הדף הזה למישהו שלא רואה אותו."
  asks: [pick(answers[1]), pick(answers[2]), pick(answers[3])], // three more requests, answered once each
  first: pick(answers[0]),                       // "מה הדבר הכי חשוב בדף הזה?"
  runs: allergy.map(pick),                       // the allergy question, three times, same model, same input
  crops: { footer: crops['claim-footer'], pasta: crops['claim-pasta'], grizzlyPtitim: crops['claim-grizzly-ptitim'] },
};
if (data.runs.length !== 3 || data.runs.some((r) => r.question !== data.runs[0].question || r.model !== data.runs[0].model)) throw new Error('runs are not comparable');

await writeFile(root + 'site/data.js', 'window.DATA = ' + JSON.stringify(data) + ';\n');
await mkdir(root + 'site/assets/crops', { recursive: true });
await copyFile(root + 'data/screenshot-full.png', root + 'site/assets/screenshot-full.png');
await copyFile(root + 'data/screenshot-top.png', root + 'site/assets/first-screen.png');
for (const [to, from] of [['footer', 'claim-footer'], ['pasta', 'claim-pasta'], ['grizzly-ptitim', 'claim-grizzly-ptitim']])
  await copyFile(root + `data/crop-proposals/${from}.png`, root + `site/assets/crops/${to}.png`);
console.log('site/data.js written', (JSON.stringify(data).length / 1024).toFixed(0) + ' KB');
