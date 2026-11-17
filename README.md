# Which site is this?

A short presentation for designers, in which the room plays the agent. Three well-known sites are shown
the way an AI agent receives them, each with a task to do:

1. as an agent that reads gets it: the page's whole text, with no colour, size, position or pictures,
   and with the site's own name blocked out;
2. as an agent that looks gets it: the whole page as one picture, shrunk, cut into pieces, and the
   pieces put one after another in a numbered array;
3. the real page;
4. the two side by side: where the eye found the answer, and what the agent had instead.

## Run

Open `presentation.html` in **Chrome** (double-click, or drag it into Chrome). It is the whole
presentation in one file: no server, no internet, and it can be copied to a USB stick on its own.
For the classroom view press `Cmd+Ctrl+F` (full screen).

| Stop | What it is | Controls |
| --- | --- | --- |
| 1 | The premise, one sentence | `Space` |
| 2, 3, 4 | One round per site (IKEA, Netflix, Rami Levy), under a task ("What matters most on this page?", "What is number 4 in the popular list?", "What is the cheapest product on the page?"). First the whole text, to scroll through. Then the page as an array of numbered pieces, twelve to a row, so the page does not come back together on the screen; above it, the first numbers of piece 0. The room has to find the answer here too: click the piece it calls out. A wrong piece goes dim and is counted (shown as ✕ beside the clock); a right one lights every piece the answer is spread over. Then the real page, whole, to scroll through. Then one screenful of the page with only the answer lit, beside the lines the agent had for it, and one sentence on what the design did there | scroll, or `↓` `↑` `PageDown` `PageUp` `Home` `End`; `Space` for the next step |
| 5 | All three texts side by side, then each site's picture above its text | `Space` |
| 6 | The bill: a cut-out of each page where the design spoke, and beside it what reached the agent, one site per press; then one sentence, and how long the room spent as the agent | `Space` |
| 7 | The closing sentence | `1` returns to the start |

`Space` (or `Enter`) moves forward, `Backspace` moves back, keys `1` to `7` jump to a stop.
A small grey line in the bottom corner says what the next key does; `H` hides it. It never shows the answer.

## Change it

- How sharp the page-in-pieces is, and how many lines the three-column screen shows: the settings at the top of `site/app.js`.
- The written sentences (opening, the bill, closing): `site/index.html`.
- A clock runs beside the round number while the room is the agent (text and pieces) and stops at the real page.
  The time comes back under the page-beside-text step and, added up, on the bill.
- Fonts and the three colours: the `:root` block at the top of `site/style.css`. The fonts are
  Index and Index Mono, installed on this computer; elsewhere the site falls back to Arial Hebrew and Courier New.
- Which sites, which words are blocked out, and each round's task (the question, the lit area of the
  page, the passage and the sentence under it): the `SITES` list in `collect/build-guess.mjs`,
  then `node collect/build-guess.mjs`. The build stops if a task no longer matches the collected text.

After any change in `site/`, rebuild the single file: `node collect/build-single.mjs`.

## Where the content comes from

| File | What it is |
| --- | --- |
| `data/guess/ikea.txt`, `data/guess/netflix.txt` | `document.body.innerText` of each home page, untouched |
| `data/guess/ikea-full.jpg`, `data/guess/netflix-full.jpg` | Each whole page, 1440 wide (IKEA's cookie notice was closed first) |
| `data/innerText.txt`, `data/guess/supermarket-full.jpg` | The same two things for rami-levy.co.il; the picture is `data/screenshot-full.png` saved as JPEG |
| `data/agent-read-vs-seen.json` | An earlier run in which a model was sent the Rami Levy page as a picture. Two things are taken from it: the number of pieces, and one thing the model said |

`node collect/build-guess.mjs` packs these into `site/data.js`. It changes the text in two ways only:
empty lines are dropped, and every letter of the site's own name is replaced by a block.
`node collect/collect-guess.mjs` collects IKEA and Netflix again (needs internet; the live pages change).

Three things to know about how true the pictures are:

- **IKEA's picture shows a little more than its text.** The text is the page as it opens. The picture was
  taken after walking to the foot of the page, which loads a few more products (10 more lines of text).
  The Netflix text and picture were collected together on 17 November 2026; IKEA's text is from the day before
  and was identical when the picture was taken.
- **The number of pieces is measured for one page and computed for the other two.** The model reported
  1,104 picture tokens for the Rami Levy page; a grid of 16 by 69 square pieces gives exactly that, and
  the same rule gives 1,092 for one screenful, which the model also reported. IKEA (918) and Netflix
  (1,081) come from that rule and were not measured.
- **The array is shown twelve pieces to a row** (`PIECES_PER_ROW`), which is none of the pages' own
  widths in pieces (9, 23, 16). A model is also told where each piece was; the room is not. That is
  what makes the step hard, and it is harder than what a model faces.
- **How blurred each piece looks is an illustration.** The page is shrunk until each piece holds 32 by
  32 pixels (`PIXELS_PER_PIECE` in `site/app.js`). What a model keeps of a piece is not a small picture,
  so this is a way of showing the cut, not a measurement of what the model sees.

## Earlier version

The first version of this project was a different presentation, about what a blind person hears through
an AI agent. It is in the git history (commit `51c7418` and before). Its data and collection scripts are
still in `data/` and `collect/`; `site/game-mockup.html` and `site/speech-test.html` belong to it too.
