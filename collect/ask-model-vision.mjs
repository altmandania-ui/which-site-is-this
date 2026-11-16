// The same requests, but the model is given the screenshot of the page instead of its text.
// No system instruction, default settings. One user message: the image, then the question.
// Responses are saved exactly as returned; an answered question is never asked again.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const MODEL = 'gemini-3.5-flash';
const IMAGE = 'data/screenshot-full.png';
const key = ((await readFile(root + '.env', 'utf8')).match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!key) { console.error('No GEMINI_API_KEY in .env'); process.exit(1); }
const image = (await readFile(root + IMAGE)).toString('base64');

const QUESTIONS = [
  'מה הדבר הכי חשוב בדף הזה?',
  'מה הכי בולט בדף, מבחינה חזותית?',
  'אילו מוצרים במבצע?',
  'כמה עולה הויטמינצ\'יק ל-100 מ"ל?',
  'תאר את הדף הזה למישהו שלא רואה אותו.',
];

async function ask(question) {
  const body = { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: image } }, { text: question }] }] };
  for (let attempt = 1; ; attempt++) {
    let res, json;
    try {
      res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
        method: 'POST', signal: AbortSignal.timeout(180_000),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
      });
      json = await res.json();
    } catch (e) { if (attempt >= 30) throw e; console.log('  attempt', attempt, 'failed:', e.name); await new Promise((r) => setTimeout(r, 20_000)); continue; }
    if (res.ok) {
      const cand = json.candidates[0];
      return { question, answer: (cand.content?.parts || []).filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join(''),
        model: json.modelVersion, stopReason: cand.finishReason, usage: json.usageMetadata, askedAt: new Date().toISOString(), rawResponse: json };
    }
    if (![429, 500, 503].includes(res.status) || attempt >= 30) throw new Error(res.status + ' ' + JSON.stringify(json).slice(0, 600));
    console.log('  attempt', attempt, 'got', res.status, (json.error?.message || '').slice(0, 110));
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

const file = root + 'data/agent-vision.json';
const meta = { provider: 'Google Gemini API', requestedModel: MODEL, systemPrompt: null, generationConfig: null,
  messageFormat: 'one user message: ' + IMAGE + ' (1440x6259 PNG), then the question. No page text.' };
const saved = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : { ...meta, answers: [] };
for (const q of QUESTIONS) {
  if (saved.answers.some((a) => a.question === q)) continue;
  saved.answers.push(await ask(q));
  await writeFile(file, JSON.stringify(saved, null, 2));
  console.log('answered:', q);
}
console.log('done', saved.answers.length);
