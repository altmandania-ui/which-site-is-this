(function () {
  'use strict';
  var DATA = window.DATA;

  // ---------- presenter settings ----------
  var SPEECH_RATE = 1;        // 1 = the voice's normal speed
  var TYPE_CPS = 45;          // characters per second when text appears without a voice
  var RUNS_CPS = 70;          // characters per second on the two-runs screen

  // What the voice reads on the opening screen: one continuous, unedited section of the saved
  // description, from the line that starts with HEARD_FROM to the end of the line containing HEARD_TO.
  // If either marker is missing, the whole description is read.
  var HEARD_FROM = '#### 4.';
  var HEARD_TO = 'קישורים נפוצים';
  var heard = (function () {
    var a = DATA.describe.answer, s = a.indexOf(HEARD_FROM);
    var t = s === -1 ? -1 : a.indexOf(HEARD_TO, s);
    if (t === -1) return a;
    var e = a.indexOf('\n', t);
    return a.slice(s, e === -1 ? a.length : e);
  })();

  // The four statements. Each is a continuous, unedited piece of a saved answer; a piece
  // that is not found in the saved answer is not shown at all.
  var CLAIMS = [
    { from: DATA.describe, text: 'תחתית הדף צבועה ברקע כהה', crop: 'assets/crops/footer.png' },
    { from: DATA.first, text: '**מבצעי המותג הפרטי של רמי לוי:** פסטה ב-6 ש"ח', crop: 'assets/crops/pasta.png' },
    { from: DATA.first, text: '4 פתיתים/גריזלי ב-11 ש"ח', crop: 'assets/crops/grizzly-ptitim.png' },
    { from: DATA.asks[2], text: 'מה שהכי בולט בדף הוא **המבצעים הכמותיים ("X ב-Y") והמחירים המוזלים**', crop: 'assets/crops/banner.png' },
  ].filter(function (c) { return c.from.answer.indexOf(c.text) !== -1; });

  var LAST = 7;
  var $ = function (id) { return document.getElementById(id); };
  var screens = Array.prototype.slice.call(document.querySelectorAll('.screen'));
  var current = 1;
  var step = { 1: 0, 4: 0, 5: 0, 6: 0 };
  var STEPS = { 1: 2, 4: 0, 5: 0, 6: 5 };

  // ---------- voice ----------
  var synth = window.speechSynthesis || null;
  function hebrewVoice() {
    if (!synth) return null;
    var v = synth.getVoices().filter(function (x) { return /^he/i.test(x.lang); });
    return v.filter(function (x) { return x.localService; })[0] || v[0] || null;
  }
  if (synth) synth.getVoices(); // some browsers load the list lazily

  // Markdown symbols are shown on screen but not read aloud. map[i] = position in the
  // original text of the i-th spoken character.
  function spokenForm(text, offset) {
    var out = '', map = [];
    var isRule = /^\s*-{3,}\s*$/.test(text);
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var code = text.charCodeAt(i);
      // symbols and emoji are shown but not read aloud
      if (ch === '*' || ch === '#' || (isRule && ch === '-') || (code >= 0x2190 && code <= 0x2BFF) || (code >= 0xD800 && code <= 0xDFFF) || code === 0xFE0F) continue;
      out += ch; map.push(offset + i);
    }
    return { text: out, map: map };
  }

  // Reads `full` aloud and, when `el` is given, reveals it there in step with the voice.
  // With no Hebrew voice it types silently.
  var active = null;
  function stopTelling() {
    if (active) { active.dead = true; clearInterval(active.timer); active = null; }
    if (synth) synth.cancel();
  }
  function tell(el, full, cps, withVoice) {
    stopTelling();
    var job = active = { dead: false, timer: null, shown: 0 };
    function show(n) {
      if (job.dead || n <= job.shown) return;
      job.shown = Math.min(n, full.length);
      if (!el) return;
      el.textContent = full.slice(0, job.shown);
      el.scrollTop = el.scrollHeight;
    }
    function typeTo(end, rate) {
      clearInterval(job.timer);
      var pos = job.shown, last = performance.now();
      job.timer = setInterval(function () {
        var now = performance.now();
        pos += (now - last) / 1000 * rate; last = now;
        show(Math.floor(pos));
        if (pos >= end) { clearInterval(job.timer); show(end); }
      }, 30);
    }

    var voice = withVoice ? hebrewVoice() : null;
    if (!voice) { typeTo(full.length, cps); return; }

    // One utterance per line keeps long passages reliable and the text in step with the voice.
    var lines = [], at = 0;
    full.split('\n').forEach(function (line) { lines.push({ start: at, end: at + line.length + 1, text: line }); at += line.length + 1; });
    var i = 0, boundarySeen = false;
    (function next() {
      if (job.dead) return;
      if (i >= lines.length) return show(full.length);
      var ln = lines[i++];
      var sp = spokenForm(ln.text, ln.start);
      if (!sp.text.trim()) { show(ln.end); return next(); }
      var u = new SpeechSynthesisUtterance(sp.text);
      u.voice = voice; u.lang = voice.lang; u.rate = SPEECH_RATE;
      u.onstart = function () {
        // Until the browser proves it reports word boundaries, pace the text by estimate.
        if (!boundarySeen) typeTo(ln.end, 13 * SPEECH_RATE);
      };
      u.onboundary = function (e) {
        if (job.dead) return;
        if (!boundarySeen) { boundarySeen = true; clearInterval(job.timer); }
        var endOfWord = sp.text.slice(e.charIndex).search(/\s/);
        var j = endOfWord === -1 ? sp.text.length - 1 : e.charIndex + endOfWord;
        show(sp.map[Math.min(j, sp.map.length - 1)] + 1);
      };
      u.onend = function () { if (job.dead) return; clearInterval(job.timer); show(ln.end); next(); };
      u.onerror = function () { if (job.dead) return; clearInterval(job.timer); typeTo(full.length, cps); };
      synth.speak(u);
    })();
  }

  // ---------- 1. the premise, then only the voice ----------
  function renderScreen1(fromKey) {
    stopTelling();
    $('s1-question').textContent = DATA.describe.question;
    $('s1-words').classList.toggle('gone', step[1] === 1);
    if (step[1] === 1 && fromKey) tell(null, heard, TYPE_CPS, true);
  }

  // ---------- 2. asking: choose a request, hear the saved answer, see nothing ----------
  // After the list of products on sale has been heard once, the screen asks for one detail from it.
  // There is nothing to look back at: the only way to find it is to ask again and listen from the start.
  var RECALL_AFTER = 0; // which request is followed by the detail question
  var ask = { at: 0, asking: false, asked: {}, recall: false, again: false };
  var askItems = DATA.asks.map(function (a, i) {
    var li = document.createElement('li');
    li.textContent = a.question;
    li.addEventListener('click', function () { if (ask.asking || ask.recall) return; ask.at = i; askNow(); });
    $('ask-list').appendChild(li);
    return li;
  });
  function renderAsk() {
    askItems.forEach(function (li, i) {
      li.classList.toggle('at', i === ask.at);
      li.classList.toggle('asked', !!ask.asked[i]);
    });
    $('ask-words').classList.toggle('gone', ask.asking || ask.recall);
    $('ask-recall').classList.toggle('on', ask.recall);
    if (!ask.asking) { $('ask-answer').hidden = true; $('ask-answer').textContent = ''; }
  }
  function askNow() {
    ask.asking = true; renderAsk(); updateHint();
    // With a voice the paper stays empty. Only if this browser has no Hebrew voice is the answer written out.
    var panel = hebrewVoice() ? null : $('ask-answer');
    if (panel) panel.hidden = false;
    tell(panel, DATA.asks[ask.at].answer, TYPE_CPS, true);
  }
  function askKey(e) {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (ask.asking) {
        stopTelling(); ask.asking = false;
        if (ask.at === RECALL_AFTER && !ask.again) ask.recall = true;
        else { ask.asked[ask.at] = true; ask.again = false; }
        renderAsk(); updateHint();
      } else if (ask.recall) { ask.recall = false; ask.again = true; askNow(); }
      else askNow();
    } else if (!ask.asking && !ask.recall && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      ask.at = (ask.at + (e.key === 'ArrowDown' ? 1 : askItems.length - 1)) % askItems.length;
      renderAsk();
    }
  }

  // ---------- 4. what was said, what is there ----------
  // per statement: the words (spoken), then the place on the page
  var BEATS = [];
  CLAIMS.forEach(function (c) { BEATS.push({ c: c, kind: 'said' }, { c: c, kind: 'place' }); });
  STEPS[4] = BEATS.length;
  function renderScreen3(fromKey) {
    var beat = BEATS[step[4]];
    var claim = $('s3-claim'), crop = $('s3-crop');
    stopTelling();
    if (!beat) return;
    $('s3-question').textContent = beat.c.from.question;
    if (beat.kind === 'said') {
      crop.hidden = true;
      claim.textContent = '';
      tell(claim, beat.c.text, TYPE_CPS, fromKey);
    } else {
      claim.textContent = beat.c.text;
      if (crop.getAttribute('src') !== beat.c.crop) crop.src = beat.c.crop;
      crop.hidden = false;
    }
  }

  // ---------- 5. one product card: what is on the screen, what the listener is given ----------
  // HEARD_PRICE is a continuous, unedited piece of the card's line in the collected accessibility tree.
  var HEARD_PRICE = 'מחיר קודם 14.20 שקלים חדשים 1 ב-10 מחיר נוכחי 10.00 שקלים חדשים';
  var priceLine = DATA.aria.split('\n').filter(function (l) { return l.indexOf("ויטמינצ'יק טרופי " + HEARD_PRICE) !== -1; })[0];
  STEPS[5] = priceLine ? 2 : 0;
  // steps: 0 the card as it is seen | 1 the words a listener is given for the same card, spoken
  function renderWritten(fromKey) {
    var s = step[5], main = $('w-main');
    stopTelling();
    $('w-crop').src = 'assets/crops/vitaminchik.png';
    main.classList.add('agent');
    if (s === 0) {
      $('w-label').textContent = 'מה שרואים';
      main.textContent = '';
    } else {
      $('w-label').textContent = 'מה שמקבל מי שלא רואה';
      main.textContent = '';
      tell(main, HEARD_PRICE, TYPE_CPS, fromKey);
    }
  }

  // ---------- 6. asked directly, then asked to act ----------
  // Two saved answers about the same product. The first is heard and shown whole.
  // Of the second, the voice reads its opening, up to the end of ACT_UNTIL; the screen then shows it whole.
  var ACT_UNTIL = 'בטוח לשימוש מבחינת רכיבי שומשום.';
  var actHeard = (function () {
    var i = DATA.act.answer.indexOf(ACT_UNTIL);
    return i === -1 ? DATA.act.answer : DATA.act.answer.slice(0, i + ACT_UNTIL.length);
  })();
  // Each column shows exactly what the voice read. Markdown symbols stay, as the model wrote them, but dimmed.
  function dimmed(node, text) {
    text.split(/([*#]+)/).forEach(function (part, i) {
      if (!part) return;
      if (i % 2) { var m = document.createElement('span'); m.className = 'mark'; m.textContent = part; node.appendChild(m); }
      else node.appendChild(document.createTextNode(part));
    });
  }
  [[DATA.direct, DATA.direct.answer], [DATA.act, actHeard]].forEach(function (r) {
    var col = document.createElement('div'); col.className = 'run';
    var q = document.createElement('p'); q.className = 'ask-q'; q.textContent = r[0].question;
    var t = document.createElement('div'); t.className = 'piece'; t.dir = 'auto'; dimmed(t, r[1]);
    col.appendChild(q); col.appendChild(t);
    $('s7-runs').appendChild(col);
  });
  // steps: 0 the first request | 1 its answer, heard | 2 the second request | 3 its answer, heard | 4 both shown
  function renderRuns(fromKey) {
    stopTelling();
    var s = step[6], ear = s === 1 || s === 3;
    $('s7-question').textContent = s < 2 ? DATA.direct.question : DATA.act.question;
    $('screen-6').classList.toggle('ear', ear);
    $('screen-6').classList.toggle('both', s === 4);
    $('s7-runs').classList.toggle('on', s === 4);
    if (ear && fromKey) tell(null, s === 1 ? DATA.direct.answer : actHeard, TYPE_CPS, true);
  }

  // ---------- presenter hint ----------
  var hintEl = $('hint');
  var hintsOn = true;
  try { hintsOn = localStorage.getItem('hints') !== 'off'; } catch (e) {}
  function updateHint() {
    var t = '';
    if (current === 1) t = step[1] === 0 ? 'רווח: להשמיע' : 'רווח: להמשיך';
    if (current === 2) t = ask.asking ? 'רווח: לעצור' : (ask.recall ? 'רווח: לשאול שוב ולהקשיב מההתחלה · Enter: להמשיך אל הדף' : 'חצים למעלה ולמטה: לבחור · רווח: לשאול · Enter: להמשיך אל הדף');
    if (current === 3) t = 'לגלול · Enter: להמשיך';
    if (current === 4) { var bt = BEATS[step[4]], nx = BEATS[step[4] + 1]; t = (bt && bt.kind === 'said' ? 'רווח: להראות את המקום בדף' : (nx ? 'רווח: המשפט הבא' : 'רווח: להמשיך')) + ' · Backspace: צעד אחורה'; }
    if (current === 5) t = (step[5] === 0 ? 'רווח: להשמיע מה מקבל מי שלא רואה' : 'רווח: להמשיך') + ' · Backspace: צעד אחורה';
    if (current === 6) t = (step[6] === 0 || step[6] === 2) ? 'רווח: לשמוע תשובה' : 'רווח: להמשיך';
    if (current === 7) t = 'סוף · 1: להתחלה';
    // While the voice speaks in the dark there is nothing on the screen at all: no hint, no pointer.
    var listening = (current === 1 && step[1] === 1) || (current === 2 && ask.asking) || (current === 6 && (step[6] === 1 || step[6] === 3));
    document.body.classList.toggle('blackout', listening);
    hintEl.textContent = t + ' · H: להסתיר';
    hintEl.hidden = !hintsOn || listening;
  }

  // ---------- navigation ----------
  function render(fromKey) {
    if (current === 1) renderScreen1(fromKey);
    if (current === 2) { ask.asking = false; ask.recall = false; ask.again = false; renderAsk(); }
    if (current === 4) renderScreen3(fromKey);
    if (current === 5) renderWritten(fromKey);
    if (current === 6) renderRuns(fromKey);
    updateHint();
  }
  function show(n, fromKey) {
    var target = $('screen-' + n);
    if (!target) return;
    stopTelling();
    current = n;
    screens.forEach(function (s) { s.hidden = s !== target; });
    document.title = target.dataset.title;
    if (location.hash !== '#' + n) history.pushState(null, '', '#' + n);
    window.scrollTo(0, 0);
    if (step[n] !== undefined) step[n] = 0;
    render(fromKey);
  }
  function advance(dir) {
    if (STEPS[current] === undefined) return;
    var s = step[current] + dir;
    if (s < 0) return;
    if (s >= STEPS[current]) { if (current < LAST) show(current + 1, true); return; }
    step[current] = s; render(true);
  }

  window.addEventListener('popstate', function () { show(parseInt(location.hash.slice(1), 10) || 1, false); });
  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[1-7]$/.test(e.key)) return show(parseInt(e.key, 10), true);
    if (e.key === 'h' || e.key === 'H' || e.key === 'י') { hintsOn = !hintsOn; try { localStorage.setItem('hints', hintsOn ? 'on' : 'off'); } catch (err) {} return updateHint(); }
    if (e.key === 'Enter') { e.preventDefault(); if (current < LAST) show(current + 1, true); return; }
    if (current === 2) return askKey(e);
    if (STEPS[current] === undefined) return; // on the scrolling screen Space scrolls, as in any page
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); advance(1); }
    else if (e.key === 'Backspace') { e.preventDefault(); advance(-1); }
  });
  $('to-next').addEventListener('click', function () { show(4, true); });
  window.addEventListener('pagehide', stopTelling);

  show(parseInt(location.hash.slice(1), 10) || 1, false);
})();
