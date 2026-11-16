# Who designs what a blind person hears?

A seven-screen static site for a 5-minute presentation. Everything on screen comes from
data collected from https://www.rami-levy.co.il/he and from saved model answers.
Nothing loads from the network.

## Run

Open `presentation.html` in **Chrome** (double-click, or drag it into Chrome). It is the whole
presentation in one file: no server, no internet, and it can be copied to a USB stick on its own.
For the classroom view press `Cmd+Ctrl+F` (full screen).

A small grey line in the bottom corner says what the next key does. Press `H` to hide it before presenting.
While the voice is speaking in the dark, the line and the mouse pointer disappear on their own:
the screen is completely black. `Space` always moves on.

`presentation.html` is built from the files in `site/`. After editing anything there, rebuild it with
`node collect/build-single.mjs`.
The site speaks Hebrew using the macOS system voice "Carmit"; check that the sound is on.
To test the voice in any browser, open `site/speech-test.html`.

The order is: hear, ask, see, compare, why, what a listener is given, asked again.
The site shows collected material only. Apart from the opening sentence and short labels, no sentence on screen was written for it.

| Screen | What it is | Controls |
| --- | --- | --- |
| 1 | One sentence of setup and the request. Then the screen goes black and only the voice remains, reading part of the model's description | `Space` to start the voice, `Space` again to move on |
| 2 | Still nothing to see. Three requests a person might make; choose one and hear the model's saved answer. After the first one (the products on sale) the screen asks for one detail from what was just heard; `Space` asks again and the answer is read from the start | `Up` / `Down` to choose, `Space` to ask, `Space` to stop, `Enter` to continue |
| 3 | The real page, as a screenshot | Scroll. The corner button (or `Enter`) continues |
| 4 | Four things the model said, each spoken and shown, then the real place on the page beside it | `Space` next step, `Backspace` previous step |
| 5 | What the agent receives: the full accessibility tree, flat | Scroll. `Enter` continues |
| 6 | One product card as it is seen, then the words a listener is given for the same card (spoken; a piece of the card's line in the tree) | `Space` next step, `Backspace` back |
| 7 | The allergy question. Two short pieces of two saved answers are heard in the dark, one after the other, then shown side by side | `Space` for each step |

Keys `1` to `7` jump to a screen from anywhere. `Enter` always goes to the next screen.

What the voice reads on screen 1 is one continuous, unedited section of the saved description
(the footer section). To change it, edit `HEARD_FROM` and `HEARD_TO` at the top of `site/app.js`.

`site/game-mockup.html` is a separate sketch of a "design it yourself" game. It is not linked from the presentation.

## Swap fonts

The two variables are at the top of `site/style.css`:

```css
:root {
  --font-human: ...;   /* questions, labels, buttons */
  --font-agent: ...;   /* the accessibility tree and everything the model says */
}
```

They currently point at one family installed on this computer, in two forms: Index for people,
and Index Mono (the same letters at one fixed width) for the agent's Hebrew, with Courier New for
its Latin letters and digits. On another computer the site falls back to Ploni / Arial Hebrew and
Courier New. The three colours (`--dark`, `--light`, `--mute`) are in the same block.

To use font files instead, put them in `site/assets/` and add above `:root`:

```css
@font-face { font-family: "MyFont"; src: url("assets/MyFont.woff2") format("woff2"); }
```

then set `--font-human: "MyFont", serif;`. Local files keep the site offline.

Voice speed and typing speeds are the first three settings at the top of `site/app.js`.

## Where the data comes from

| File | What it is |
| --- | --- |
| `data/screenshot-full.png`, `data/screenshot-top.png` | Screenshots at 1440px width |
| `data/accessibility-snapshot.yml` | Playwright accessibility (ARIA) snapshot of `<body>`, untouched |
| `data/innerText.txt` | `document.body.innerText`, untouched. This is what the model was given |
| `data/dom-counts.json`, `data/numbers.json` | Counts taken on the live page and derived from the files above |
| `data/image-positions.json` | What each of the 96 empty-alt images is |
| `data/agent-answers.json` | Five questions, one call each, answers verbatim (screen 1 uses question 5; screen 2 uses questions 2, 3 and 4; screen 4 uses questions 5, 4 and 1) |
| `data/agent-q1-second-run.json` | Question 1 asked a second time, same model, same input. Saved, no longer shown |
| `data/agent-stakes.json` | Three questions where a wrong answer costs something, each asked three times. Screen 7 uses two lines each from allergy runs 1 and 3; the full answers and the other questions are saved, not shown |
| `data/agent-run.json` | The purchase task answer. Saved, not shown on the site |
| `data/crop-proposals/` | The crops and their pixel coordinates in the screenshot |
| `data/not-used/` | An earlier answer from a different model. Not shown |

Model: requested `gemini-3.5-flash` through the Google Gemini API; the API reports `gemini-3.6-flash`
as the model that answered. No system instruction, default settings. Each message was the full
`innerText.txt`, a blank line, then the question.

The four statements on screen 4 are continuous, unedited pieces of the saved answers. Markdown
symbols (`**`, `#`) are shown as the model wrote them; the voice does not read them aloud.

To rebuild `site/data.js` after changing anything in `data/`: `node collect/build-data.mjs`.
To re-collect the page (needs internet; the live page changes, so everything downstream changes):
`node collect/collect.mjs && node collect/analyze.mjs`.
