// Packs the raw files into site/data.js so the site works from file:// with no server and no network.
// Content is embedded verbatim (JSON.stringify), nothing is cleaned.
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url).pathname;
const read = (f) => readFile(root + 'data/' + f, 'utf8');
const pick = (a) => ({ question: a.question, answer: a.answer, model: a.model, askedAt: a.askedAt });

const answers = JSON.parse(await read('agent-answers.json')).answers;
const stakes = JSON.parse(await read('agent-stakes.json')).answers;
const allergy = stakes.filter((a) => a.question === stakes[0].question).sort((a, b) => a.run - b.run);
const crops = JSON.parse(await read('crop-proposals/crops.json'));

const data = {
  aria: await read('accessibility-snapshot.yml'),
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
for (const [to, from] of [['footer', 'claim-footer'], ['pasta', 'claim-pasta'], ['grizzly-ptitim', 'claim-grizzly-ptitim']])
  await copyFile(root + `data/crop-proposals/${from}.png`, root + `site/assets/crops/${to}.png`);
console.log('site/data.js written', (JSON.stringify(data).length / 1024).toFixed(0) + ' KB');
