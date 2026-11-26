'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #1155: guess a hidden word letter by letter; a wrong letter lets one petal fall
  function testPetals() {
    const games = T.games();
    head('Word Petals (#1155)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/petals/index.html');
    ok(fs.existsSync(file), 'the Word Petals page exists');
    const E = loadEngine('petals', 'PetalsEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(E.PER === 5 && E.NEED === 3 && JSON.stringify(E.PETALS) === '{"easy":9,"medium":7,"hard":5}' && E.CATS.length === 4, 'five words a game, three to win, 9/7/5 petals by level, four kinds of word');

    // every app language has its own alphabet; an unknown one falls back to English letters
    ok(LOCALE_CODES.every((l) => E.alpha(l) === l && E.KB[l]) && E.alpha('xx') === 'en', 'every locale has its own keyboard (' + LOCALE_CODES.join(', ') + '), and an unknown language uses English');

    // The test player: for every word of every list it presses exactly the keys the word
    // needs, each one taken from that language's on-screen keyboard. Every press must hit,
    // the last must solve the word, and every box must then be open. A word with a letter
    // the keyboard lacks (ß, ç, ё, ة, a Hindi conjunct) would fail here.
    const lists = {};
    let words = 0;
    const bad = [], easy = [], dup = [], thin = [];
    for (const a of LOCALE_CODES) {
      const L = E.list(a);
      lists[a] = L;
      words += L.length;
      if (new Set(L.map((o) => o.w)).size !== L.length) dup.push(a);
      if (L.length < 100 || E.CATS.some((c) => L.filter((o) => o.c === c).length < 25)) thin.push(a + ' ' + L.length);
      const keys = new Set(E.KB[a].join('').split(''));
      for (const o of L) {
        const need = E.letters(a, o.w);
        if (need.length < (a === 'hi' ? 2 : 3)) easy.push(a + ':' + o.w);
        const S = E.newGame({ seed: 7, lang: a, level: 'hard' });
        S.words[0] = { w: o.w, c: o.c };
        let fine = need.length > 0 && need.every((l) => keys.has(l));
        need.forEach((l, i) => { const r = E.guess(S, l).type; if (r !== (i === need.length - 1 ? 'solved' : 'hit')) fine = false; });
        if (!fine || S.over !== 'won' || S.wrong !== 0 || !E.open(S).every(Boolean)) bad.push(a + ':' + o.w);
      }
    }
    ok(words > 1100 && !thin.length, 'every language has at least 100 words and 25 of each kind (' + words + ' in all)' + (thin.length ? '; short: ' + thin.join(', ') : ''));
    ok(!dup.length, 'no word appears twice in a language' + (dup.length ? ' (' + dup.join(', ') + ')' : ''));
    ok(!bad.length, 'a test player types and solves every one of the ' + words + ' words with its own language\'s keys, without a miss' + (bad.length ? ' (fails: ' + bad.slice(0, 8).join(', ') + ')' : ''));
    ok(!easy.length, 'every word needs at least three different guesses (two for Hindi syllables)' + (easy.length ? ' (' + easy.join(', ') + ')' : ''));
    ok(lists.zh.every((o) => /^[a-z]+$/.test(o.w) && /^[一-鿿]+$/.test(o.h)), 'Chinese words are guessed as toneless pinyin and carry their characters');

    // writing systems
    {
      const zw = E.units('fa', 'لاک‌پشت');
      ok(zw.length === 7 && zw[3].gap && !zw[3].need.length && E.letters('fa', 'لاک‌پشت').join('') === 'لاکپشت', 'Persian: the zero-width non-joiner is a gap that needs no guess');
      ok(E.fold('fa', 'آ') === 'ا' && E.fold('fa', 'ي') === 'ی' && E.fold('fa', 'ك') === 'ک' && E.fold('ar', 'إ') === 'ا' && E.fold('ru', 'ё') === 'е', 'آ/ا, ي/ی, ك/ک, إ/ا and ё/е count as one key');
      const S = E.newGame({ seed: 3, lang: 'fa', level: 'easy' });
      S.words[0] = { w: 'آهو', c: 'animals' };
      ok(E.guess(S, 'آ').type === 'none' && E.guess(S, 'ا').type === 'hit' && E.open(S)[0] === true, 'in Persian the key ا opens آ, and آ itself is not a key');
      const hi = E.units('hi', 'मधुमक्खी');
      ok(hi.length === 4 && hi[1].t === 'धु' && JSON.stringify(hi[3].need) === '["क","ख"]', 'Hindi: one box per syllable; a vowel sign rides along and a conjunct needs both consonants');
      const iv = E.units('hi', 'आम');
      ok(iv.length === 2 && !iv[0].need.length && JSON.stringify(E.letters('hi', 'पेड़')) === '["प","ड"]', 'Hindi: a standing vowel needs no guess, and ड opens ड़');
    }

    // the rules
    {
      const S = E.newGame({ seed: 11, lang: 'en', level: 'hard' });
      S.words[0] = { w: 'kitten', c: 'animals' };
      ok(E.guess(S, '1').type === 'none' && E.guess(S, 't').type === 'hit' && E.open(S).filter(Boolean).length === 2, 'a letter opens every box it is in; a non-letter is ignored');
      ok(E.guess(S, 't').type === 'dup' && S.wrong === 0, 'a letter guessed again costs nothing');
      ok(E.guess(S, 'z').type === 'miss' && S.wrong === 1, 'a wrong letter takes one petal');
      ['q', 'x', 'j', 'w'].forEach((l) => E.guess(S, l));
      ok(S.over === 'lost' && S.wrong === 5 && S.found[0] === false && E.guess(S, 'k').type === 'none', 'the last petal ends the word as lost, and no more guesses count');
      ok(E.next(S) && S.i === 1 && S.wrong === 0 && !S.got.length && !S.over, 'the next word starts with a full flower');
      ok(E.valid(S), 'a game in progress passes the save check');
      const bad1 = JSON.parse(JSON.stringify(S)); bad1.petals = 99;
      const bad2 = JSON.parse(JSON.stringify(S)); bad2.words[2].w = 'k1tten';
      const bad3 = JSON.parse(JSON.stringify(S)); bad3.found = [];
      ok(!E.valid(bad1) && !E.valid(bad2) && !E.valid(bad3) && !E.valid(null), 'a tampered or broken save is refused');
      // play the rest perfectly: five found with no petal lost gives three stars
      const W = E.newGame({ seed: 5, lang: 'de', level: 'medium' });
      for (let k = 0; k < E.PER; k++) { E.letters('de', E.current(W).w).forEach((l) => E.guess(W, l)); E.next(W); }
      const R = E.result(W);
      ok(W.status === 'done' && R.won && R.found === 5 && R.kept === R.all && R.stars === 3, 'five words with every petal kept: a win with three stars');
      const L = E.newGame({ seed: 5, lang: 'de', level: 'medium' });
      for (let k = 0; k < E.PER; k++) {
        if (k < 3) E.letters('de', E.current(L).w).forEach((l) => E.guess(L, l));
        else E.KB.de.join('').split('').filter((l) => E.letters('de', E.current(L).w).indexOf(l) < 0).slice(0, 7).forEach((l) => E.guess(L, l));
        E.next(L);
      }
      const R2 = E.result(L);
      ok(R2.won && R2.found === 3 && R2.stars === 1, 'three words found is a win with one star');
      ok(E.result({ found: [true, true, false, false, false], kept: [7, 7, 0, 0, 0], petals: 7 }).won === false, 'two words found is not a win');
    }

    // the daily: the same words for everyone with the same language, different kinds in a row
    {
      const a = E.newGame({ seed: 123456, lang: 'fa', level: 'medium' }), b = E.newGame({ seed: 123456, lang: 'fa', level: 'medium' });
      ok(JSON.stringify(a.words) === JSON.stringify(b.words) && a.words.length === 5 && new Set(a.words.map((o) => o.w)).size === 5, 'one seed gives the same five different words');
      let mixed = 0;
      for (let s = 1; s <= 200; s++) { const g = E.newGame({ seed: s, lang: 'en', level: 'easy' }); if (g.words.every((o, i) => !i || o.c !== g.words[i - 1].c)) mixed++; }
      ok(mixed >= 195, 'two words of the same kind rarely follow each other (' + mixed + ' of 200 games mixed)');
      const seen = lists.en.slice(0, 60).map((o) => o.w);
      const g = E.newGame({ seed: 99, lang: 'en', level: 'easy', seen });
      ok(g.words.every((o) => seen.indexOf(o.w) < 0), 'words played lately are not dealt again');
      ok(/C\.daily\('petals', dailyDate\)\.seed/.test(html) && /prefs\.level/.test(html), 'the daily game is seeded by the core\'s daily seed');
    }

    // strings: every key the page uses is in every locale
    const strBlock = html.slice(html.indexOf('strings: {'), html.indexOf('\n  var params'));
    const keys = [...new Set([...html.matchAll(/C\.t\('([A-Za-z0-9]+)'/g)].map((m) => m[1]))];
    const CORE_KEYS = ['help', 'keyboard', 'tutorial', 'done', 'daily', 'time', 'resetWarn', 'dailyDone', 'easy', 'medium', 'hard', 'level', 'settings', 'newGame', 'stars'];
    const own = keys.filter((k) => CORE_KEYS.indexOf(k) < 0 && new RegExp('\\n      en: \\{[\\s\\S]*?[\\s,{]' + k + ': \'').test(strBlock));
    ok(own.length >= 30, 'the page names its own strings (' + own.length + ' keys)');
    const missing = [];
    for (const loc of LOCALE_CODES) {
      const m = strBlock.match(new RegExp('\\n      ' + loc + ': \\{([\\s\\S]*?)\\n      \\}'));
      if (!m) { missing.push(loc + ':*'); continue; }
      for (const k of own) if (!new RegExp('(^|[\\s,{])' + k + ': \'').test(m[1])) missing.push(loc + ':' + k);
    }
    ok(!missing.length, 'every string the page uses is in all ' + LOCALE_CODES.length + ' locales' + (missing.length ? ' (missing ' + missing.slice(0, 8).join(', ') + ')' : ''));
    const enKeys = [...strBlock.match(/\n {6}en: \{([\s\S]*?)\n {6}\}/)[1].matchAll(/([A-Za-z0-9]+): '/g)].map((m) => m[1]);
    ok(['again', 'help', 'daily', 'done', 'time'].every((k) => enKeys.indexOf(k) < 0), 'the page does not redefine a core label (again, help, daily, done, time)');
    ok((html.match(/\{ title: C\.t\('tutTitle\d'\)/g) || []).length === 3 && LOCALE_CODES.every((loc) => { const m = strBlock.match(new RegExp('\\n      ' + loc + ': \\{([\\s\\S]*?)\\n      \\}')); return m && [1, 2, 3].every((n) => new RegExp('tutTitle' + n + ": '[^']+'").test(m[1]) && new RegExp('tutText' + n + ": '[^']+'").test(m[1])); }),
      'three tutorial cards in every locale');

    const gm = games.find((g) => g.id === 'petals');
    ok(!!gm && games.filter((g) => g.id === 'petals').length === 1 && gm.cat === 'puzzle' && gm.people === 1 && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'Word Petals is listed once, as a one-player puzzle, with a name and summary in every locale');
    ok(!!gm && LOCALE_CODES.every((l) => new RegExp(l + ": '" + gm.name[l] + "'").test(html.slice(html.indexOf('name: {'), html.indexOf('accent: ACCENT')))), 'the page and games.json give the game the same name in every locale');
    ok(!!gm && !/hangman|gallows|دار/i.test(JSON.stringify(gm.name)), 'the name speaks of flowers and words, not of a gallows');

    // awards
    const AW = ['wp-win', 'wp-hard', 'wp-all', 'wp-daily'];
    const awLines = AW.map((id) => core.split('\n').find((l) => l.indexOf("{ id: '" + id + "'") >= 0) || '');
    ok(awLines.every((l, i) => l && html.indexOf("unlock('" + AW[i] + "')") > 0 && LOCALE_CODES.every((loc) => new RegExp('[{,]\\s*' + loc + ": '[^']+'").test(l) && new RegExp('[{,]\\s*d' + loc + ": '[^']+'").test(l))), 'the four awards are in the core with a title and description in every locale, and the game unlocks them');
    ok(/\bwp: 'petals'/.test(core), 'the core maps the wp- award prefix to Word Petals');
    const enTitles = awLines.map((l) => (l.match(/\ben: '([^']+)'/) || [])[1]);
    ok(enTitles.every((t) => t && core.split("en: '" + t + "'").length === 2), 'the award titles are not used by any other award (' + enTitles.join(', ') + ')');

    // the accent: as in tools/tests/quilt.js
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => { const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
    const dE = (p, q) => { const a = lab(p), b = lab(q); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
    const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const col = gm ? gm.color : '';
    const others = games.filter((g) => g.id !== 'petals' && /^#[0-9A-Fa-f]{6}$/.test(g.color));
    const same = others.filter((g) => gm && g.cat === gm.cat);
    ok(others.length > 50 && same.length > 5, 'the accent is compared against ' + others.length + ' games, ' + same.length + ' of them puzzles');
    const nearSame = same.reduce((b, g) => { const d = dE(col, g.color); return d < b[0] ? [d, g.id] : b; }, [1e9, '']);
    const nearAll = others.reduce((b, g) => { const d = dE(col, g.color); return d < b[0] ? [d, g.id] : b; }, [1e9, '']);
    ok(nearSame[0] >= 15, 'the accent ' + col + ' is at least ΔE 15 from every puzzle game (nearest ' + nearSame[1] + ', ' + nearSame[0].toFixed(1) + ')');
    ok(nearAll[0] >= 8, 'the accent is at least ΔE 8 from every other game (nearest ' + nearAll[1] + ', ' + nearAll[0].toFixed(1) + ')');
    const testSrc = [path.join(ROOT, 'tools/test.js')].concat(fs.readdirSync(path.join(ROOT, 'tools/tests')).filter((f) => f.endsWith('.js') && f !== 'petals.js').map((f) => path.join(ROOT, 'tools/tests', f))).map((f) => fs.readFileSync(f, 'utf8'));
    const guards = new Set();
    let guardLines = 0;
    testSrc.forEach((src) => {
      for (const m of src.matchAll(/differs from every other game by ΔE ≥ 15/g)) {
        guardLines++;
        const ids = [...src.slice(Math.max(0, m.index - 3000), m.index).matchAll(/\b[a-z]+\.id !== '([a-z0-9]+)'/g)];
        if (ids.length) guards.add(ids[ids.length - 1][1]);
      }
    });
    const guarded = others.filter((g) => guards.has(g.id));
    const nearGuard = guarded.reduce((b, g) => { const d = dE(col, g.color); return d < b[0] ? [d, g.id] : b; }, [1e9, '']);
    ok(guardLines >= 40 && guards.size === guardLines && guarded.length === guards.size && nearGuard[0] >= 15,
      'the accent keeps ΔE 15 from the ' + guards.size + ' games whose tests ask it of every accent (' + guardLines + ' found; nearest ' + nearGuard[1] + ', ' + nearGuard[0].toFixed(1) + ')');
    const hue = (h) => { const [x, y, z] = rgb(h), mx = Math.max(x, y, z), d = mx - Math.min(x, y, z); if (!d) return 0; const q = mx === x ? ((y - z) / d) % 6 : mx === y ? (z - x) / d + 2 : (x - y) / d + 4; return (q * 60 + 360) % 360; };
    const hd = (p, q) => { const d = Math.abs(p - q) % 360; return Math.min(d, 360 - d); };
    const hueGuard = others.filter((g) => ['chain', 'ludo', 'gridlock'].includes(g.id));
    ok(!!gm && hueGuard.length === 3 && hueGuard.every((g) => hd(hue(g.color), hue(col)) >= 15), 'the hue keeps 15° from Chain Reaction, Ludo and Gridlock (' + hueGuard.map((g) => g.id + ' ' + hd(hue(g.color), hue(col)).toFixed(0) + '°').join(', ') + ')');
    const con = 1.05 / (lum(col) + 0.05);
    ok(con >= 4.5, 'white text on the accent reads at 4.5:1 or more (' + con.toFixed(2) + ')');
    ok(html.indexOf("var ACCENT = '" + col + "'") >= 0, 'the page uses the listed accent');

    // layout and drawing rules from earlier canvas bugs
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/petals/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') === icon.indexOf('<rect'), 'the icon sits on the game\'s soft tint');
    ok(/\.wp-box canvas \{[^}]*width: 100%; height: 100%/.test(html), 'the canvas is sized by CSS width and height (#919)');
    ok(/document\.fonts\.ready\.then/.test(html) && /ResizeObserver/.test(html) && /cv\.width !== [^|]*\|\| cv\.height !== /.test(html), 'the flower redraws when the web font arrives and when its box changes, checking both sides of the backing store');
    ok(/e\.persisted/.test(html) && /C\.keyIs\(e, /.test(html) && /pointerdown/.test(html), 'it handles the back/forward cache, keys go through C.keyIs, and the letter keys answer on pointerdown');
    ok(/class: 'ch-fit'/.test(html) && /ch-split/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html) && !/localStorage|history\.(push|replace)State|fetch\(|XMLHttpRequest|setInterval/.test(html), 'core layout, a tutorial, no direct storage, history, network or timer');
    // an unknown token made the letter boxes' underline invalid, so the word was invisible
    const coreCss = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const usedTokens = [...new Set([...html.matchAll(/var\((--c-[a-z0-9-]+)/g)].map((m) => m[1]))];
    const unknownTokens = usedTokens.filter((v) => coreCss.indexOf(v + ':') < 0);
    ok(usedTokens.length > 3 && unknownTokens.length === 0, 'every core colour token it uses exists in chogan.css (' + usedTokens.length + ' used' + (unknownTokens.length ? '; unknown: ' + unknownTokens.join(', ') : '') + ')');
    ok(/\.wp-slot \{[^}]*border-bottom: 3px solid var\(--c-line\)/.test(html), 'each letter box has a visible underline');
    // a missed word's dot looked like a word not yet played
    ok(/\.wp-dot\.wp-miss \{ background:/.test(html) && /classList\.add\('wp-miss'\)/.test(html), 'a missed word has its own dot in the progress row');
    ok(Date.now() - t0 < 3000, 'the Word Petals tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testPetals };
};
