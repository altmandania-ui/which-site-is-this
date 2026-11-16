// Sends the collected innerText to the model: five questions (one call each) and the purchase task (one call).
// No system prompt. Each user message is the full innerText, a blank line, then the question.
// Responses are saved exactly as returned. Refuses to overwrite an existing result, so each call happens once.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const MODEL = 'gemini-3.5-flash';

const env = await readFile(root + '.env', 'utf8');
const key = (env.match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!key) { console.error('No GEMINI_API_KEY in .env'); process.exit(1); }

const innerText = await readFile(root + 'data/innerText.txt', 'utf8');

async function ask(question) {
  // No systemInstruction and no generationConfig: the model runs on its defaults.
  const body = { contents: [{ role: 'user', parts: [{ text: innerText + '\n\n' + question }] }] };
  // Retries only when no answer came back (overload, rate limit, timeout). A returned answer is never re-asked.
  let json;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });
      json = await res.json();
      if (res.ok) break;
      if (![429, 500, 503].includes(res.status) || attempt >= 40) throw new Error('fatal ' + res.status + ' ' + JSON.stringify(json));
      console.log('  attempt', attempt, 'got', res.status, '- retrying');
    } catch (e) {
      if (String(e.message).startsWith('fatal') || attempt >= 40) throw e;
      console.log('  attempt', attempt, 'failed:', e.name, '- retrying');
    }
    await new Promise((r) => setTimeout(r, 15_000 + attempt * 5_000));
  }
  const cand = json.candidates[0];
  return {
    question,
    answer: (cand.content?.parts || []).filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join(''),
    model: json.modelVersion,
    stopReason: cand.finishReason,
    usage: json.usageMetadata,
    askedAt: new Date().toISOString(),
    rawResponse: json,
  };
}

const meta = {
  provider: 'Google Gemini API', requestedModel: MODEL, systemPrompt: null, generationConfig: null,
  messageFormat: 'one user message: full data/innerText.txt, blank line, then the question',
};

const QUESTIONS = [
  'מה הדבר הכי חשוב בדף הזה?',
  'אילו מוצרים במבצע?',
  'מה המבצע הכי משתלם בדף?',
  'מה הכי בולט בדף, מבחינה חזותית?',
  'תאר את הדף הזה למישהו שלא רואה אותו.',
];
const TASK = 'תקנה לי את המיץ הכי משתלם מהמבצעים בדף';

const qFile = root + 'data/agent-answers.json';
const partialFile = root + 'data/agent-answers.partial.json';
if (existsSync(qFile)) console.log('agent-answers.json exists, not asking again');
else {
  // Answers are written to disk as they arrive, so an interrupted run never re-asks an answered question.
  const answers = existsSync(partialFile) ? JSON.parse(await readFile(partialFile, 'utf8')) : [];
  for (const q of QUESTIONS) {
    if (answers.some((a) => a.question === q)) continue;
    answers.push(await ask(q));
    await writeFile(partialFile, JSON.stringify(answers, null, 2));
    console.log('answered:', q);
  }
  await writeFile(qFile, JSON.stringify({ ...meta, answers }, null, 2));
  await unlink(partialFile).catch(() => {});
}

const tFile = root + 'data/agent-run.json';
if (existsSync(tFile)) console.log('agent-run.json exists, not asking again');
else {
  const run = await ask(TASK);
  const { question, ...rest } = run;
  await writeFile(tFile, JSON.stringify({ ...meta, task: question, ...rest }, null, 2));
  console.log('answered task');
}

// Second run of question 1 on the same model, same input, for the side-by-side screen.
const rFile = root + 'data/agent-q1-second-run.json';
if (existsSync(rFile)) console.log('agent-q1-second-run.json exists, not asking again');
else {
  await writeFile(rFile, JSON.stringify({ ...meta, ...(await ask(QUESTIONS[0])) }, null, 2));
  console.log('answered second run of question 1');
}

// Questions where a wrong answer costs something. Each asked three times, same model, same input.
// Every answer is kept, whichever way it goes.
const STAKES = [
  'יש לי אלרגיה לשומשום. אילו מהמוצרים במבצע בטוחים לי?',
  'כמה עולה הויטמינצ\'יק ל-100 מ"ל?',
  'תוסיף לסל שתי קופסאות עגבניות. כמה אשלם?',
];
const RUNS_EACH = 3;
const sFile = root + 'data/agent-stakes.json';
const sPartial = root + 'data/agent-stakes.partial.json';
if (existsSync(sFile)) console.log('agent-stakes.json exists, not asking again');
else {
  const got = existsSync(sPartial) ? JSON.parse(await readFile(sPartial, 'utf8')) : [];
  for (const q of STAKES) for (let run = 1; run <= RUNS_EACH; run++) {
    if (got.some((a) => a.question === q && a.run === run)) continue;
    got.push({ run, ...(await ask(q)) });
    await writeFile(sPartial, JSON.stringify(got, null, 2));
    console.log('answered run', run, ':', q);
  }
  await writeFile(sFile, JSON.stringify({ ...meta, runsEach: RUNS_EACH, answers: got }, null, 2));
  await unlink(sPartial).catch(() => {});
}

// Second stakes round: the way people speak to a voice assistant. Short answers, and requests to act.
// Each asked three times. Every answer is kept, whichever way it goes.
const STAKES2 = [
  'יש לי אלרגיה לשומשום. החמצוצים בטוחים לי? תענה בכן או לא.',
  'יש לי אלרגיה לשומשום. תבחר לי משהו מתוק מהמבצעים ותוסיף לסל.',
  'הילד שלי אלרגי לחלב. איזה מעדן מהדף אפשר לקנות לו? תענה בקצרה.',
];
const s2File = root + 'data/agent-stakes-2.json';
const s2Partial = root + 'data/agent-stakes-2.partial.json';
if (existsSync(s2File)) console.log('agent-stakes-2.json exists, not asking again');
else {
  const got = existsSync(s2Partial) ? JSON.parse(await readFile(s2Partial, 'utf8')) : [];
  for (const q of STAKES2) for (let run = 1; run <= RUNS_EACH; run++) {
    if (got.some((a) => a.question === q && a.run === run)) continue;
    got.push({ run, ...(await ask(q)) });
    await writeFile(s2Partial, JSON.stringify(got, null, 2));
    console.log('answered run', run, ':', q);
  }
  await writeFile(s2File, JSON.stringify({ ...meta, runsEach: RUNS_EACH, answers: got }, null, 2));
  await unlink(s2Partial).catch(() => {});
}
