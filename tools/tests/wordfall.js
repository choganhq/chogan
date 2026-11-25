'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #1022: words fall toward a garden; typing a word letter by letter bursts it
  function testWordfall() {
    const games = T.games();
    head('Word Shower (#1022)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/wordfall/index.html');
    ok(fs.existsSync(file), 'the Word Shower page exists');
    const E = loadEngine('wordfall', 'WordfallEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(E.WAVES === 8 && E.LIVES === 5 && JSON.stringify(E.LEVELS) === '["easy","medium","hard"]', 'eight waves, five flowers, three speeds');

    // keyboards and word lists: every word typable on its own keyboard, 3 to 9 letters
    const ALPHAS = ['fa', 'en', 'de', 'es', 'pl', 'fr', 'ru', 'ar', 'pt'];
    ok(JSON.stringify(Object.keys(E.KB).sort()) === JSON.stringify(ALPHAS.slice().sort()), 'a keyboard for each of the nine alphabets');
    ok(E.alpha('zh') === 'en' && E.alpha('hi') === 'en' && E.alpha('xx') === 'en', 'Chinese and Hindi (and anything unknown) play the English words');
    const listBad = [];
    for (const a of ALPHAS) {
      const keys = E.KB[a].join('');
      if (new Set(keys).size !== keys.length) listBad.push(a + ': a key twice');
      const L = E.list(a);
      if (L.length < 80) listBad.push(a + ': only ' + L.length + ' words');
      const folded = L.map((w) => E.foldWord(a, w));
      if (new Set(folded).size !== L.length) listBad.push(a + ': a word twice');
      folded.forEach((f, i) => {
        if (f.length < 3 || f.length > 9) listBad.push(a + ': ' + L[i] + ' has ' + f.length + ' letters');
        for (const c of f) if (keys.indexOf(c) < 0) listBad.push(a + ': ' + L[i] + ' needs ' + c);
      });
      // every wave's length band has words to pick from
      for (let w = 0; w < E.WAVES; w++) if (L.filter((x) => x.length >= E.LO[w] && x.length <= E.HI[w]).length < 6) listBad.push(a + ': wave ' + (w + 1) + ' short of words');
    }
    ok(!listBad.length, 'every word list is typable on its keyboard, 3–9 letters, no word twice, every wave stocked' + (listBad.length ? ' (' + listBad.slice(0, 6).join('; ') + ')' : ''));
    // keys found by position (e.code) for the scripts a Latin keyboard cannot type
    ok(['fa', 'ru'].every((a) => E.KB[a].every((row, r) => row.length === E.CODES[r].length)) &&
      E.KB.ar[0].length === E.CODES[0].length && E.KB.ar[1].length === E.CODES[1].length && E.KB.ar[2].length === E.CODES3.ar.length,
      'the Persian, Russian and Arabic rows match their physical key positions one for one');
    ok(E.fold('fa', 'ي') === 'ی' && E.fold('fa', 'ك') === 'ک' && E.fold('ru', 'ё') === 'е' && E.fold('pl', 'ł') === 'l' && E.fold('en', 'Q') === 'q' && E.foldWord('fr', 'été') === 'ete' && E.foldWord('pt', 'avião') === 'aviao' && E.fold('pt', 'ç') === 'ç',
      'Arabic yeh and kaf type as the Persian keys, accents as their plain letter, capitals as small');

    // engine rules on a fixed run
    const S = E.newRun({ seed: 42, lang: 'en', level: 'medium' });
    ok(S.status === 'run' && S.lives === 5 && S.wave === 1 && S.words.length === 0, 'a run starts empty, in wave 1, with five flowers');
    ok(E.key(S, 'a').type === 'none' && S.misses === 0, 'a key before any word falls does nothing');
    let t = 0;
    while (!S.words.length && t < 10) { E.step(S, 0.05); t += 0.05; }
    const w = S.words[0];
    ok(!!w && w.y >= 0 && w.y < 0.1, 'the first word appears after the short break at the top');
    const wrong = 'abcdefghijklmnopqrstuvwxyz'.split('').find((c) => S.words.every((o) => o.f[0] !== c));
    ok(E.key(S, wrong).type === 'miss' && S.misses === 1 && S.lives === 5, 'a wrong first letter counts a miss and costs no flower');
    const r1 = E.key(S, w.f[0]);
    ok(r1.type === (w.f.length > 1 ? 'hit' : 'kill') && S.target === w.id && w.typed === 1 && S.hits === 1, 'the right first letter locks onto the word');
    const bad = 'abcdefghijklmnopqrstuvwxyz'.split('').find((c) => c !== w.f[1]);
    ok(E.key(S, bad).type === 'miss' && w.typed === 1 && S.target === w.id, 'a wrong next letter is a miss and keeps the word and its progress');
    ok(E.drop(S) && S.target === -1 && w.typed === 0, 'letting go forgets the letters typed');
    let last = null;
    for (const c of w.f) last = E.key(S, c);
    const pts = 10 * w.f.length + Math.round(10 * w.f.length * (1 - w.y));
    ok(last.type === 'kill' && last.points === pts && S.score === pts && S.kills === 1 && S.words.indexOf(w) < 0, 'typing the whole word bursts it for 10 a letter plus a height bonus (' + pts + ')');
    ok(E.points({ f: 'abcd', y: 0 }) === 80 && E.points({ f: 'abcd', y: 0.5 }) === 60 && E.points({ f: 'abcd', y: 1 }) === 40, 'points: higher catches are worth more, never less than 10 a letter');
    // the lowest word with a shared first letter is picked
    {
      const P = E.newRun({ seed: 1, lang: 'en', level: 'easy' });
      P.pause = 0; P.left = 3;
      P.words = [{ id: 1, w: 'cat', f: 'cat', x: 0.3, y: 0.2, v: 0.1, typed: 0 }, { id: 2, w: 'cup', f: 'cup', x: 0.6, y: 0.5, v: 0.1, typed: 0 }];
      P.next = 3;
      E.key(P, 'c');
      ok(P.target === 2, 'the first letter picks the lowest word that starts with it');
      // a word on the ground takes a flower
      P.words[0].y = 0.999; P.lives = 2; P.spawnT = 99;
      const ev = E.step(P, 0.1);
      ok(ev.some((e) => e.type === 'ground') && P.lives === 1 && P.words.length === 1, 'a word reaching the ground takes one flower');
      P.words[0].y = 0.999; P.left = 0;
      const ev2 = E.step(P, 0.1);
      ok(P.status === 'lost' && ev2.some((e) => e.type === 'lose') && E.result(P).stars === 0 && !E.result(P).won, 'the last flower lost ends the run, with no stars');
    }
    // a cleared wave starts the next; the last one wins
    {
      const P = E.newRun({ seed: 2, lang: 'en', level: 'easy' });
      P.pause = 0; P.left = 0; P.words = [];
      const ev = E.step(P, 0.01);
      ok(ev.some((e) => e.type === 'wave' && e.wave === 2) && P.wave === 2 && P.left === E.count(2) && P.pause > 0, 'an empty sky with no words left starts the next wave after a break');
      P.wave = 8; P.left = 0; P.pause = 0; P.words = [];
      const ev2 = E.step(P, 0.01);
      ok(P.status === 'won' && ev2.some((e) => e.type === 'win'), 'clearing the eighth wave wins');
      P.hits = 100; P.misses = 0; P.score = 1000; P.lives = 5;
      const R = E.result(P);
      ok(R.won && R.stars === 3 && R.score === 1000 + 5 * 25 && R.acc === 1, 'final score: points scaled by accuracy, plus 25 a flower left; full flowers and accuracy give three stars');
      P.misses = 100;
      ok(E.result(P).score === 750 + 125 && E.result(P).stars === 1, 'half accuracy keeps three quarters of the points and one star');
    }

    // bots: a steady typist at each speed's rate wins; a slower one and an idle one lose
    const play = (lang, level, rate, seed) => {
      const P = E.newRun({ seed, lang, level });
      let acc = 0, time = 0;
      const dt = 1 / 20;
      while (P.status === 'run' && time < 1200) {
        E.step(P, dt); time += dt; acc += rate * dt;
        while (acc >= 1 && P.status === 'run') { acc -= 1; const k = E.nextKey(P); if (k == null) { acc = 0; break; } E.key(P, k); }
      }
      return P;
    };
    const bands = { easy: [1.0, 1.7], medium: [1.3, 2.2], hard: [2.0, 3.0] };
    const runs = [];
    for (const lv of E.LEVELS) {
      for (const [lang, seed] of [['en', 11], ['fa', 23], ['ru', 37]]) {
        const fast = play(lang, lv, bands[lv][1], seed), slow = play(lang, lv, bands[lv][0], seed);
        runs.push([lv, lang, fast.status, slow.status, fast.t]);
      }
    }
    ok(runs.length === 9 && runs.every((r) => r[2] === 'won'), 'a perfect typist wins at 1.7, 2.2 and 3.0 letters a second on easy, medium and hard (' + runs.map((r) => r[0] + '/' + r[1] + ' ' + r[2]).join(', ') + ')');
    ok(runs.every((r) => r[3] === 'lost'), 'a typist at 1.0, 1.3 and 2.0 letters a second loses on easy, medium and hard, so the speeds differ');
    ok(runs.every((r) => r[4] > 90 && r[4] < 600), 'a winning run lasts between 1.5 and 10 minutes (' + runs.map((r) => Math.round(r[4])).join(', ') + ' s)');
    {
      const P = E.newRun({ seed: 5, lang: 'de', level: 'easy' });
      let time = 0;
      while (P.status === 'run' && time < 600) { E.step(P, 0.1); time += 0.1; }
      ok(P.status === 'lost' && P.wave === 1, 'a player who types nothing loses in the first wave');
    }

    // the daily shower: the same seed gives the same words; the page seeds it from the day
    {
      const words = (seed) => { const P = E.newRun({ seed, lang: 'fa', level: 'medium' }); const out = []; for (let i = 0; i < 400; i++) E.step(P, 0.05).forEach((e) => { if (e.type === 'spawn') out.push(e.word.w + '@' + e.word.x.toFixed(4)); }); return out.join(' '); };
      const a = words(20261122), b = words(20261122), c = words(20261123);
      ok(a.length > 0 && a === b && a !== c, 'a seed always gives the same words in the same places, and another seed others');
      ok(/C\.daily\('wordfall', dailyDate\)\.seed/.test(html) && /level: dailyDate \? 'medium' : prefs\.level/.test(html) && /mine = !dailyDate && useCustom/.test(html),
        'the daily run is seeded from the day, always at medium speed and never with custom words');
      const Q = E.newRun({ seed: 9, lang: 'en', level: 'medium' });
      for (let i = 0; i < 300; i++) E.step(Q, 0.05);
      const saved = JSON.parse(JSON.stringify(Q)), cont = JSON.parse(JSON.stringify(Q));
      ok(E.valid(saved), 'a run in progress survives a save and passes validation');
      for (let i = 0; i < 100; i++) { E.step(Q, 0.05); E.step(cont, 0.05); }
      ok(JSON.stringify(Q) === JSON.stringify(cont), 'a reloaded run goes on with exactly the words it would have had');
      ok(!E.valid(Object.assign({}, saved, { lives: 9 })) && !E.valid(Object.assign({}, saved, { lang: 'xx' })) && !E.valid(Object.assign({}, saved, { custom: ['ab'] })) && !E.valid(null), 'a damaged save is refused');
    }

    // custom words
    {
      const v = E.validateCustom;
      ok(v('en', 'Rocket', []).ok && v('fa', 'كتاب', []).ok && v('pl', 'żółw', []).ok && v('ru', 'ёж', []).ok, 'own words in each script are accepted, Arabic letters and accents folded');
      ok(v('en', 'a', []).reason === 'length' && v('en', 'abcdefghijklm', []).reason === 'length' && v('en', '   ', []).reason === 'length' && v('en', 'ab', []).ok && v('en', 'abcdefghijkl', []).ok, 'two to twelve letters');
      ok(v('en', 'hi there', []).reason === 'letters' && v('en', 'cat1', []).reason === 'letters' && v('en', 'کتاب', []).reason === 'letters' && v('fa', 'book', []).reason === 'letters' && v('de', 'straße', []).ok,
        'only letters of the keyboard in play: no spaces, digits or other scripts');
      ok(v('en', 'CAT', ['cat']).reason === 'dup' && v('fa', 'كتاب', ['کتاب']).reason === 'dup', 'the same word twice is refused, whatever its case or Arabic letters');
      const fifty = Array.from({ length: 50 }, (_, i) => 'w' + 'abcdefghijklmnopqrstuvwxyz'[i % 26] + 'abcdefghijklmnopqrstuvwxyz'[Math.floor(i / 26)]);
      ok(v('en', 'zebra', fifty).reason === 'full' && v('en', 'zebra', fifty.slice(1)).ok, 'at most fifty words');
      const C = E.newRun({ seed: 3, lang: 'en', level: 'easy', custom: ['ab', 'cd', 'ef', 'gh', 'ij'] });
      const few = E.newRun({ seed: 3, lang: 'en', level: 'easy', custom: ['ab', 'cd'] });
      const seen = new Set();
      for (let i = 0; i < 2000 && C.status === 'run'; i++) E.step(C, 0.05).forEach((e) => { if (e.type === 'spawn') seen.add(e.word.w); });
      ok(C.custom && few.custom === null && seen.size > 0 && [...seen].every((x) => C.custom.indexOf(x) >= 0), 'a custom run falls only its own words, and needs at least ' + E.MIN_CUSTOM);
      ok(/var R = E\.result\(S\)[^\n]*mine = !!S\.custom/.test(html) && /if \(!mine\) \{[\s\S]{0,400}achievements\.unlock\('wf-win'\)[\s\S]{0,600}C\.stats\.best/.test(html),
        'a custom run earns no award, record, daily result or coins');
    }

    // strings: every key the page uses is in every locale, none shadows a core label
    const strBlock = html.slice(html.indexOf('strings: {'), html.indexOf('\n  var params'));
    const keys = [...new Set([...html.matchAll(/C\.t\('([A-Za-z0-9]+)'/g)].map((m) => m[1]))];
    const CORE_KEYS = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close'];
    const CORE_USED = CORE_KEYS.concat(['easy', 'medium', 'hard']);
    const own = keys.filter((k) => CORE_USED.indexOf(k) < 0);
    ok(own.length >= 25 && LOCALE_CODES.length >= 10, 'the page names its own strings (' + own.length + ' keys, ' + LOCALE_CODES.length + ' locales)');
    const missing = [], shadow = [];
    for (const loc of LOCALE_CODES) {
      const m = strBlock.match(new RegExp('\\n      ' + loc + ': \\{([\\s\\S]*?)\\n      \\}'));
      if (!m) { missing.push(loc + ':*'); continue; }
      for (const k of own) if (!new RegExp('(^|[\\s,{])' + k + ': \'').test(m[1])) missing.push(loc + ':' + k);
      for (const k of CORE_KEYS) if (new RegExp('(^|[\\s,{])' + k + ': \'').test(m[1])) shadow.push(loc + ':' + k);
    }
    ok(!missing.length, 'every string the page uses is in all ' + LOCALE_CODES.length + ' locales' + (missing.length ? ' (missing ' + missing.slice(0, 8).join(', ') + ')' : ''));
    ok(!shadow.length, 'no string of the page redefines a core label' + (shadow.length ? ' (' + shadow.slice(0, 6).join(', ') + ')' : ''));
    const gm = games.find((g) => g.id === 'wordfall');
    ok(!!gm && games.filter((g) => g.id === 'wordfall').length === 1 && gm.cat === 'skill' && gm.people === 1 && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'Word Shower is listed once, as a one-player skill game, with a name and summary in every locale');
    ok(gm && !/type/i.test(gm.name.en) && !/type/i.test(gm.id), 'its name is its own, not a typing product\'s');

    // awards: three in the core with every locale, unlocked by the page, titles unique
    const AW = ['wf-win', 'wf-hard', 'wf-clean'];
    const awLines = AW.map((id) => core.split('\n').find((l) => l.indexOf("{ id: '" + id + "'") >= 0) || '');
    ok(awLines.every((l, i) => l && html.indexOf("unlock('" + AW[i] + "')") > 0 && LOCALE_CODES.every((loc) => new RegExp('[{,]\\s*' + loc + ": '[^']+'").test(l) && new RegExp('[{,]\\s*d' + loc + ": '[^']+'").test(l))), 'the three awards are in the core with a title and description in every locale, and the game unlocks them');
    ok(/\bwf: 'wordfall'/.test(core), 'the core maps the wf- award prefix to Word Shower');
    {
      const allAw = core.split('\n').filter((l) => /\{ id: '[a-z0-9]+-[a-z0-9-]+'/.test(l));
      const dupTitles = [];
      for (const loc of ['en', 'fa']) {
        const title = (l) => { const m = l.match(new RegExp('[{,]\\s*' + loc + ": '([^']+)'")); return m ? m[1] : null; };
        const mine = awLines.map(title);
        for (const l of allAw) { if (awLines.indexOf(l) >= 0) continue; const tt = title(l); if (tt && mine.indexOf(tt) >= 0) dupTitles.push(loc + ':' + tt); }
      }
      ok(allAw.length > 100 && !dupTitles.length, 'no other award has the same title (' + allAw.length + ' awards compared)' + (dupTitles.length ? ': ' + dupTitles.join(', ') : ''));
    }

    // the accent: ΔE (CIE76) ≥ 15 from the same category, ≥ 8 from every other, white text 4.5:1
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => { const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
    const dE = (p, q) => { const a = lab(p), b = lab(q); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
    const lum = (x) => rgb(x).map(lin).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const col = gm ? gm.color : '';
    const others = games.filter((g) => g.id !== 'wordfall' && /^#[0-9A-Fa-f]{6}$/.test(g.color));
    const same = others.filter((g) => gm && g.cat === gm.cat);
    ok(others.length > 50 && same.length > 5, 'the accent is compared against ' + others.length + ' games, ' + same.length + ' of them skill games');
    const near = (arr) => arr.reduce((b, g) => { const d = dE(col, g.color); return d < b[0] ? [d, g.id] : b; }, [1e9, '']);
    const nearSame = near(same), nearAll = near(others);
    ok(nearSame[0] >= 15, 'the accent ' + col + ' is at least ΔE 15 from every skill game (nearest ' + nearSame[1] + ', ' + nearSame[0].toFixed(1) + ')');
    ok(nearAll[0] >= 8, 'the accent is at least ΔE 8 from every other game (nearest ' + nearAll[1] + ', ' + nearAll[0].toFixed(1) + ')');
    ok(1.05 / (lum(col) + 0.05) >= 4.5, 'white text on the accent reads at 4.5:1 or more (' + (1.05 / (lum(col) + 0.05)).toFixed(2) + ')');
    ok(html.indexOf("var ACCENT = '" + col + "'") >= 0, 'the page uses the listed accent');

    // layout and input rules from earlier bugs
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/wordfall/icon.svg'), 'utf8');
    ok(gm && icon.indexOf('fill="' + gm.soft + '"') > 0, 'the icon sits on the listed soft tint');
    ok(/\.wf-box canvas \{[^}]*width: 100%; height: 100%/.test(html), 'the canvas is sized by CSS width and height, so it does not keep its backing-store size (#919)');
    ok(/document\.fonts\.ready\.then/.test(html) && /ResizeObserver/.test(html) && /cv\.width !== [^;]*\|\| cv\.height !== /.test(html), 'the board redraws when the web font arrives and when its box changes, checking both sides of the backing store');
    ok(/class: 'ch-fit'/.test(html) && /ch-split/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html) && !/localStorage|history\.(push|replace)State/.test(html), 'core layout, a tutorial, no direct storage or history');
    ok(!/<input[^>]*hidden|\.focus\(\)/.test(html.slice(html.indexOf('function buildKeys'), html.indexOf('function buildKeys') + 4000)) && /pointerdown/.test(html), 'the on-screen keyboard types on pointerdown and never focuses a hidden input');
    ok(/C\.keyIs\(/.test(html) && /e\.code/.test(html), 'a physical keyboard works: Latin letters through C.keyIs, the other scripts by key position');
    // #1095: the lit next key can be turned off behind the gear for a harder game;
    // it stays on by default, and turning it off keeps the run going
    const hintFn = (html.match(/function hintKeys\(\) \{[\s\S]*?\n  \}/) || [''])[0];
    ok(/hintOn\(\)/.test(hintFn) && /function hintOn\(\) \{ return prefs\.hint !== false; \}/.test(html),
      'the next-key light obeys the saved choice, on unless turned off');
    const setFn = (html.match(/function showSettings\(\) \{[\s\S]*?\n  \}/) || [''])[0];
    ok(/C\.t\('wfHint'\)/.test(setFn) && /prefs\.hint = v; ctx\.store\.set\('prefs', prefs\); hintKeys\(\);/.test(setFn),
      'the gear offers the key light, saves it and repaints the keyboard without a new run');
    const strBlocks = LOCALE_CODES.map((l) => (html.match(new RegExp('\\n      ' + l + ': \\{[\\s\\S]*?\\n      \\}')) || [''])[0]);
    ok(strBlocks.length > 0 && strBlocks.every((b) => /wfHint: '[^']+'/.test(b) && /wfHintOn: '[^']+'/.test(b) && /wfHintOff: '[^']+'/.test(b)),
      'the key-light labels exist in every language');
    ok(Date.now() - t0 < 3000, 'the Word Shower tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testWordfall };
};
