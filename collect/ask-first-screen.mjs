// Same model and questions as ask-read-vs-seen.mjs, with smaller pictures: the first screenful (screen)
// and, for the unit price, one product card at its real size (card).
// No system instruction, default settings. Responses saved exactly as returned; nothing is asked twice.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const MODEL = 'gemini-3.5-flash-lite';
const IMAGE = 'data/screenshot-top.png';
const CARD = 'site/assets/crops/vitaminchik.png';
const key = ((await readFile(root + '.env', 'utf8')).match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!key) { console.error('No GEMINI_API_KEY in .env'); process.exit(1); }
const b64 = async (f) => (await readFile(root + f)).toString('base64');
const image = await b64(IMAGE), card = await b64(CARD);
const innerText = await readFile(root + 'data/innerText.txt', 'utf8');

const QUESTIONS = [
  'מה הדבר הכי חשוב בדף הזה?',
  'מה הכי בולט בדף, מבחינה חזותית?',
  'אילו מוצרים במבצע?',
  'כמה עולה הויטמינצ\'יק ל-100 מ"ל?',
  'תאר את הדף הזה למישהו שלא רואה אותו.',
];
const img = (data) => ({ inlineData: { mimeType: 'image/png', data } });
const partsFor = {
  screen: (q) => [img(image), { text: q }],
  card: (q) => [img(card), { text: q }],
};
const PLAN = [...QUESTIONS.map((q) => ['screen', q]), ['card', QUESTIONS[3]]];

async function ask(input, question) {
  const body = { contents: [{ role: 'user', parts: partsFor[input](question) }] };
  for (let attempt = 1; ; attempt++) {
    let res, json;
    try {
      res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
        method: 'POST', signal: AbortSignal.timeout(180_000),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
      });
      json = await res.json();
    } catch (e) { if (attempt >= 8) throw e; console.log('  attempt', attempt, 'failed:', e.name); await new Promise((r) => setTimeout(r, 15_000)); continue; }
    if (res.ok) {
      const cand = json.candidates[0];
      return { input, question, answer: (cand.content?.parts || []).filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join(''),
        model: json.modelVersion, stopReason: cand.finishReason, usage: json.usageMetadata, askedAt: new Date().toISOString(), rawResponse: json };
    }
    if (![429, 500, 503].includes(res.status) || attempt >= 8) throw new Error(res.status + ' ' + JSON.stringify(json).slice(0, 500));
    console.log('  attempt', attempt, 'got', res.status);
    await new Promise((r) => setTimeout(r, 20_000));
  }
}

const file = root + 'data/agent-first-screen.json';
const saved = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : {
  provider: 'Google Gemini API', requestedModel: MODEL, systemPrompt: null, generationConfig: null,
  inputs: { screen: 'one user message: ' + IMAGE + ' (the first screenful, as collected), then the question. No page text.', card: 'one user message: ' + CARD + ' (one product card cut from the full screenshot, real size), then the question.' },
  answers: [] };
for (const [input, q] of PLAN) {
  if (saved.answers.some((a) => a.question === q && a.input === input)) continue;
  saved.answers.push(await ask(input, q));
  await writeFile(file, JSON.stringify(saved, null, 2));
  console.log('answered', input, ':', q);
}
