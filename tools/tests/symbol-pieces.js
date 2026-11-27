'use strict';
// #1246: a player who reads neither Chinese nor Japanese, and for whom Shogi's Latin
// letters are not the initials of their own language, could not tell the pieces apart.
// Shogi and Xiangqi now offer our own drawn symbols behind the gear, from one shared set
// in the core (Chogan.pieceArt); the characters stay the default.
module.exports = function (T) {
  const { ok, head, vm, fs, path, ROOT, LOCALE_CODES, loadEngine } = T;
  const CORE = path.join(ROOT, 'www/lib/chogan.js');
  const SHOGI = path.join(ROOT, 'www/games/shogi/index.html');
  const XQ = path.join(ROOT, 'www/games/xiangqi/index.html');

  function loadArt() {
    const src = fs.readFileSync(CORE, 'utf8');
    const m = src.match(/\/\* ==== PIECE ART START ==== \*\/([\s\S]*?)\/\* ==== PIECE ART END ==== \*\//);
    if (!m) return null;
    const box = { Chogan: {} };
    vm.createContext(box);
    vm.runInContext(m[1], box, { filename: 'piece-art.js' });
    return box.Chogan.pieceArt || null;
  }

  // the strings object of C.game({ ... strings: { fa: {...}, ... } })
  function strings(html) {
    const i = html.indexOf('strings: {');
    if (i < 0) return {};
    let j = i + 'strings: '.length, depth = 0;
    for (; j < html.length; j++) {
      if (html[j] === '{') depth++;
      else if (html[j] === '}' && --depth === 0) break;
    }
    return vm.runInNewContext('(' + html.slice(i + 'strings: '.length, j + 1) + ')');
  }

  function everyLang(S, keys) {
    const miss = [];
    for (const lang of LOCALE_CODES) for (const k of keys) {
      if (!S[lang] || typeof S[lang][k] !== 'string' || !S[lang][k].trim()) miss.push(lang + '.' + k);
    }
    return miss;
  }

  function testSymbolPieces() {
    head('Drawn piece symbols in Shogi and Xiangqi (#1246)');
    ok(LOCALE_CODES.length >= 6, 'the language list is not empty (' + LOCALE_CODES.length + ')');

    // the shared art
    const art = loadArt();
    ok(typeof art === 'function', 'the core has Chogan.pieceArt between the PIECE ART markers');
    const NEED = ['king', 'rook', 'knight', 'bishop', 'pawn', 'advisor', 'elephant', 'cannon', 'gold', 'silver', 'lance'];
    const names = art && art.names ? art.names : [];
    ok(names.length > 0 && NEED.every((n) => names.indexOf(n) >= 0), 'the symbol set holds every piece both games need (' + names.join(', ') + ')');
    const out = NEED.map((n) => (art ? art(n, '#fff') : ''));
    ok(out.every((s) => /^<g fill="currentColor">/.test(s) && /<(path|circle)\b/.test(s)), 'every symbol is drawn shapes in currentColor');
    ok(out.every((s) => !/<text\b/.test(s)), 'no symbol is a written character');
    ok(new Set(out).size === NEED.length, 'every symbol is a different drawing');
    ok(art && art('nope') === '', 'an unknown piece draws nothing');
    ok(art && art('pawn', '#fff', { star: true }).length > art('pawn', '#fff').length, 'a promoted piece can wear a star');
    ok(art && /fill:var\(--x\)/.test(art('knight', 'var(--x)')), 'the details take the colour the game passes');

    // Shogi
    const sh = fs.readFileSync(SHOGI, 'utf8');
    const E = loadEngine('shogi', 'ShogiEngineFactory');
    const i0 = sh.indexOf('var KANJI ='), i1 = sh.indexOf('function pieceNode(');
    ok(i0 > 0 && i1 > i0, 'Shogi has its piece tables and face() before pieceNode()');
    const run = (stored) => {
      const box = { ctx: { store: { get: () => stored } }, E, C: { pieceArt: A }, Math, Object, Array };
      vm.createContext(box);
      vm.runInContext(sh.slice(i0, i1) + ';this.face = face; this.prefs = prefs; this.SYMBOL = typeof SYMBOL === "undefined" ? null : SYMBOL;', box);
      return box;
    };
    // without the shared art the face checks below still run and fail, instead of throwing
    const A = art || (() => '<missing art>');
    let B = null;
    try { B = run(null); } catch (e) { ok(false, 'Shogi face() runs on its own: ' + e.message); }
    const SY = B && B.SYMBOL;
    ok(Array.isArray(SY) && SY.length === 15, 'Shogi maps each of its 14 piece types to a symbol');
    if (Array.isArray(SY)) {
      ok(SY.slice(1).every((n) => NEED.indexOf(n) >= 0), 'every Shogi symbol exists in the shared set');
      ok(new Set(SY.slice(1, 9)).size === 8, 'the eight unpromoted Shogi pieces all have different symbols');
      // a promoted piece is its base piece in red with a star, as a real piece turns over to red
      const base = { 9: 1, 10: 2, 11: 3, 12: 4, 13: 6, 14: 7 };
      ok(Object.keys(base).every((t) => SY[t] === SY[base[t]]), 'a promoted Shogi piece keeps the symbol of the piece it was');
    }
    if (B) {
      ok(B.prefs.faces === 'k' && !B.prefs.latin, 'with nothing saved Shogi shows the Japanese characters, as before');
      ok(run({ latin: true }).prefs.faces === 'l', 'an older save with letters on keeps the letters');
      ok(run({ faces: 's' }).prefs.faces === 's', 'a saved symbol choice is read back');
      ok(run({ faces: 'x' }).prefs.faces === 'k', 'an unknown saved value falls back to the characters');
      const k = B.face(1, false, {}), s = B.face(1, false, { faces: 's' }), l = B.face(1, false, { faces: 'l' });
      ok(/<text[^>]*>歩<\/text>/.test(k), 'the default face is still the kanji');
      ok(/<text[^>]*>P<\/text>/.test(l), 'the letters option still writes P');
      ok(!/<text\b/.test(s) && s.indexOf(A('pawn', 'var(--sg-tile)')) > 0, 'with symbols the pawn is the drawn pawn and no text');
      const g = B.face(1, true, { faces: 's' });
      ok(/rotate\(180 50 50\)/.test(g) && g.indexOf(A('pawn', 'var(--sg-tile-gote)')) > 0, 'the top side\'s symbol turns with its piece and takes its tile colour');
      const p = B.face(9, false, { faces: 's' });
      ok(/class="sg-red/.test(p) && p.indexOf(A('pawn', 'var(--sg-tile)', { star: true })) > 0, 'a promoted pawn is the red pawn with a star');
      const all = []; for (let t = 1; t <= 14; t++) all.push(B.face(t, false, { faces: 's', marks: false }));
      ok(new Set(all).size === 14, 'all fourteen Shogi faces differ with symbols');
    }
    ok(/value: 's', label: C\.t\('faceSymbols'\)/.test(sh), 'Shogi\'s gear offers the symbols beside Japanese and Letters');
    const ss = strings(sh);
    let miss = everyLang(ss, ['faceSymbols', 'symNote']);
    ok(!miss.length, 'Shogi\'s new strings are in every language' + (miss.length ? ': missing ' + miss.join(', ') : ''));

    // Xiangqi
    const xq = fs.readFileSync(XQ, 'utf8');
    const sm = xq.match(/var SYMBOL = (\{[^}]*\});/);
    ok(!!sm, 'Xiangqi has a SYMBOL table');
    if (sm) {
      const XS = vm.runInNewContext('(' + sm[1] + ')');
      const red = 'KABNRCP'.split('');
      ok(red.every((c) => NEED.indexOf(XS[c]) >= 0 && XS[c] === XS[c.toLowerCase()]), 'each Xiangqi piece has one symbol for both sides');
      ok(new Set(red.map((c) => XS[c])).size === 7, 'the seven Xiangqi pieces all have different symbols');
    }
    const nm = xq.match(/function normPrefs\(p\) \{[\s\S]*?\n {2}\}/);
    ok(!!nm, 'Xiangqi reads its saved options through normPrefs()');
    if (nm) {
      const norm = vm.runInNewContext('(' + nm[0] + ')');
      ok(norm(null).pieces === 'c' && norm(null).level === 2 && norm(null).mode === 'ai', 'with nothing saved Xiangqi shows the characters, as before');
      ok(norm({ level: 3, mode: 'two', face: true }).pieces === 'c' && norm({ level: 3, mode: 'two', face: true }).face === true, 'an older save keeps its options and gets the characters');
      ok(norm({ pieces: 's' }).pieces === 's', 'a saved symbol choice is read back');
    }
    // every write of the options goes through one place, so no setting drops another
    const writes = xq.match(/ctx\.store\.set\('prefs'/g) || [];
    ok(writes.length === 1 && /function storePrefs\(\) \{\s*ctx\.store\.set\('prefs', normPrefs\(prefs\)\);/.test(xq), 'Xiangqi saves its options in one place (' + writes.length + ' writes)');
    ok(/value: 's', label: C\.t\('styleSyms'\)/.test(xq), 'Xiangqi\'s gear offers characters or symbols');
    ok(/C\.pieceArt\(SYMBOL\[p/.test(xq), 'Xiangqi draws its symbols from the shared set');
    const xs = strings(xq);
    miss = everyLang(xs, ['styleT', 'styleChars', 'styleSyms', 'piecesT', 'mK', 'mA', 'mB', 'mN', 'mR', 'mC', 'mP']);
    ok(!miss.length, 'Xiangqi\'s new strings are in every language' + (miss.length ? ': missing ' + miss.join(', ') : ''));
    ok(/function legendRow\(/.test(xq) && /legendRow\('K'\)/.test(xq), 'Xiangqi\'s help shows a legend of the pieces');
  }

  return { testSymbolPieces };
};
