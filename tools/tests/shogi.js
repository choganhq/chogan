'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;

  // #945: Shogi (Japanese chess), drops and promotion, a bot at three levels or two on one phone
  function testShogi() {
    head('Japanese chess (#945)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/shogi/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    if (!fs.existsSync(file)) { ok(false, 'the Shogi page is missing, so nothing else can be checked'); return; }
    const E = loadEngine('shogi', 'ShogiEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const sq = (file9, rank) => (rank - 1) * 9 + (9 - file9); // shogi notation: file 9..1 left to right, rank 1 at the top
    // drops come from f -1
    const has = (ms, m) => ms.some((x) => x.f === m.f && x.t === m.t && (x.d || 0) === (m.d || 0) && (x.pr ? 1 : 0) === (m.pr ? 1 : 0));

    // the start
    const S = E.deal({});
    ok(S.b.filter((v) => v > 0).length === 20 && S.b.filter((v) => v < 0).length === 20 && S.turn === 0 && E.validState(S), 'each side starts with 20 pieces and the bottom side moves first');
    ok(E.legal(S).length === 30, 'the opening position has 30 legal moves (' + E.legal(S).length + ')');
    ok(!E.play(E.deal({}), { f: sq(7, 7), t: sq(7, 5), d: 0, pr: 0 }), 'a move the rules do not allow is refused');

    // hand-made positions
    const mk = (pieces, hand0, hand1, turn) => {
      const B = E.blank();
      pieces.forEach((p) => { B.b[sq(p[0], p[1])] = p[2]; });
      if (hand0) B.hand[0] = hand0.slice();
      if (hand1) B.hand[1] = hand1.slice();
      B.turn = turn || 0;
      return E.fix(B);
    };
    const kings = [[5, 1, -8], [5, 9, 8]];
    // nifu: no second unpromoted pawn on a file
    let P = mk(kings.concat([[3, 7, 1]]), [0, 1, 0, 0, 0, 0, 0, 0]);
    let L = E.legal(P);
    ok(!L.some((m) => m.d === 1 && m.t % 9 === sq(3, 5) % 9) && L.some((m) => m.d === 1 && m.t === sq(4, 5)), 'a pawn cannot be dropped on a file that already holds one of your unpromoted pawns (nifu)');
    P = mk(kings.concat([[3, 3, 9]]), [0, 1, 0, 0, 0, 0, 0, 0]);
    ok(E.legal(P).some((m) => m.d === 1 && m.t === sq(3, 5)), 'a promoted pawn on the file does not block a pawn drop');
    // dead drops: pawn and lance never on the last rank, knight never on the last two
    P = mk(kings, [0, 1, 1, 1, 0, 0, 0, 0]);
    L = E.legal(P);
    ok(!L.some((m) => (m.d === 1 || m.d === 2) && m.t < 9) && !L.some((m) => m.d === 3 && m.t < 18) && L.some((m) => m.d === 3 && m.t === sq(1, 3)), 'no drop where the piece could never move again');
    // forced and optional promotion
    P = mk(kings.concat([[1, 2, 1], [2, 4, 4], [3, 4, 3]]));
    L = E.legal(P);
    ok(has(L, { f: sq(1, 2), t: sq(1, 1), d: 0, pr: 1 }) && !has(L, { f: sq(1, 2), t: sq(1, 1), d: 0, pr: 0 }), 'a pawn reaching the last rank must promote');
    ok(has(L, { f: sq(2, 4), t: sq(2, 3), d: 0, pr: 1 }) && has(L, { f: sq(2, 4), t: sq(2, 3), d: 0, pr: 0 }), 'a silver entering the zone may promote or not');
    ok(has(L, { f: sq(3, 4), t: sq(2, 2), d: 0, pr: 1 }) && !has(L, { f: sq(3, 4), t: sq(2, 2), d: 0, pr: 0 }), 'a knight landing on the second-to-last rank must promote');
    // uchifuzume: a dropped pawn may check but not mate
    P = mk([[1, 1, -8], [1, 3, 4], [2, 3, 3], [5, 9, 8], [3, 2, 5]], [0, 1, 0, 0, 0, 0, 0, 0]);
    // gote king in the corner, its escapes covered; P*1b would mate
    L = E.legal(P);
    ok(!has(L, { f: -1, t: sq(1, 2), d: 1, pr: 0 }), 'a pawn drop that would checkmate is not allowed (uchifuzume)');
    P = mk([[1, 1, -8], [5, 9, 8]], [0, 1, 0, 0, 0, 0, 0, 0]);
    ok(has(E.legal(P), { f: -1, t: sq(1, 2), d: 1, pr: 0 }), 'a pawn drop that only checks is allowed');
    // a known mate with a gold drop
    P = mk([[5, 1, -8], [5, 3, 1], [5, 9, 8]], [0, 0, 0, 0, 0, 1, 0, 0]);
    const h = E.play(P, { f: -1, t: sq(5, 2), d: 5, pr: 0 });
    const st = E.status(P);
    ok(!!h && h.chk === 1 && st.over && st.winner === 0 && st.reason === 'mate', 'a gold dropped in front of the king, backed by a pawn, is checkmate');
    // captures go to the hand as the unpromoted piece, and undo puts everything back
    P = mk(kings.concat([[4, 4, 7], [4, 2, -13]]));
    const before = JSON.stringify([P.b, P.hand]);
    ok(!!E.play(P, { f: sq(4, 4), t: sq(4, 2), d: 0, pr: 1 }) && P.hand[0][6] === 1 && P.b[sq(4, 2)] === 14, 'a captured horse goes to the hand as a bishop, and the rook promotes to a dragon');
    E.undo(P);
    ok(JSON.stringify([P.b, P.hand]) === before, 'undo restores the board and the hands');
    // repetition and the move limit
    P = E.deal({});
    const shuffle = [[sq(2, 8), sq(3, 8)], [sq(8, 2), sq(7, 2)], [sq(3, 8), sq(2, 8)], [sq(7, 2), sq(8, 2)]];
    let rep = null;
    for (let i = 0; i < 12 && !rep; i++) {
      const mv = shuffle[i % 4];
      E.play(P, { f: mv[0], t: mv[1], d: 0, pr: 0 });
      const s2 = E.status(P);
      if (s2.over) rep = s2;
    }
    ok(rep && rep.reason === 'rep' && rep.winner === -1 && P.hist.length === 12, 'the same position four times is a draw (sennichite)');

    // save and restore
    P = E.deal({ level: 3, mode: 'two', daily: '2026-11-18', seed: 'abc' });
    E.play(P, E.legal(P)[5]);
    E.play(P, E.legal(P)[3]);
    const saved = JSON.parse(JSON.stringify({ b: P.b, hand: P.hand, turn: P.turn, hist: P.hist, keys: P.keys, level: P.level, mode: P.mode, daily: P.daily, undos: 0, seed: P.seed }));
    const R = E.clone(saved);
    ok(E.validState(saved) && R.turn === 0 && R.hist.length === 2 && E.legal(R).length === E.legal(P).length && R.daily === '2026-11-18', 'a saved game restores to the same position');
    const bad = JSON.parse(JSON.stringify(saved)); bad.b[sq(5, 9)] = 0;
    const bad2 = JSON.parse(JSON.stringify(saved)); bad2.hand[0][1] = 3;
    ok(!E.validState(bad) && !E.validState(bad2) && !E.validState(null), 'a damaged save is refused');

    // the bot
    for (const lv of [1, 2, 3]) {
      const G = E.deal({});
      const tt = Date.now(), m = E.think(G, lv, 'x'), ms = Date.now() - tt;
      ok(!!m && !!E.play(G, m), 'level ' + lv + ' opens with a legal move (' + ms + ' ms)');
    }
    const Q = mk([[5, 1, -8], [5, 3, 1], [5, 9, 8]], [0, 0, 0, 0, 0, 1, 0, 0]);
    const qm = E.think(Q, 2, 'y');
    ok(!!qm && qm.d === 5 && qm.t === sq(5, 2), 'the medium bot finds a mate in one');
    const same = E.think(E.deal({}), 2, '2026-11-18:0');
    ok(JSON.stringify(same) === JSON.stringify(E.think(E.deal({}), 2, '2026-11-18:0')), 'the bot plays the same move for the same seed, so a daily game repeats');
    // easy against medium for 30 plies with fixed seeds; a whole game cost 3.6 s on CI (#947)
    const G = E.deal({});
    let sane = true;
    for (let i = 0; i < 30 && !E.status(G).over; i++) {
      const m = E.think(G, G.turn === 0 ? 1 : 2, 'g' + G.hist.length);
      if (!m || !E.play(G, m)) { sane = false; break; }
    }
    ok(sane && G.hist.length > 0 && E.validState({ b: G.b, hand: G.hand, turn: G.turn, hist: G.hist, keys: G.keys }),
      'thirty plies of easy against medium are all legal and leave a valid save (' + G.hist.length + ' plies)');

    // the page
    ok(/new Worker\(/.test(html) && /ShogiEngineFactory\.toString\(\)/.test(html) && /E\.play\(S, m\)/.test(html), 'the bot thinks in a worker on the same engine, and the engine plays its move');
    ok(/newGame\(\{ daily: dailyDate, level: 2, mode: 'ai' \}\)/.test(html) && /seed: o\.daily \|\|/.test(html), 'the daily game is against the medium bot, seeded by the date');
    const ids = ['sg-win', 'sg-hard', 'sg-drop'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bsg: 'shogi'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'sg-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'sg-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowUp/.test(html) && /C\.undoKey\(e\)/.test(html) && !/dir === 'rtl'|isRtl|C\.rtl/.test(html), 'arrows move by the drawn board in every language, and undo goes through the core key helper');
    ok(/ch-fit/.test(html) && /--fit-ar: calc\(/.test(html) && /ch-split/.test(html) && /document\.fonts\.ready/.test(html) && /ResizeObserver/.test(html), 'the board uses the core layout and redraws on resize and after fonts load');
    ok(/\.sg-status \{[^}]*min-height: 52px/.test(html), 'the status row keeps its height, so the board never moves between taps');
    ok(/\.sg-red \.sg-glyph \{ fill: var\(--sg-red\)/.test(html), 'promoted pieces are written in their own colour');
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const mm = blk.match(/^\s*([a-z]{2}): \{/); if (mm) langs[mm[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 7 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close'];
    const own = (langs.fa || '').split(',');
    ok(own.length > 30 && own.every((k) => coreKeys.indexOf(k) < 0), 'no game string is named like a core string');
    const help = (html.match(/function showHelp\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
    ok(/C\.icon\('gear', 20\)/.test(html) && /function showSettings/.test(html) && help.length > 0 && !/segmented|levelT|switch\(/.test(help) && /promoText/.test(help) && /'pN'/.test(help),
      'the options sit behind a gear; help holds the pieces, promotion and keys only');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html), 'a new player sees the tutorial');
    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'shogi');
    ok(!!gm && gm.cat === 'board' && gm.people === 2 && list.filter((g) => g.id === 'shogi').length === 1, 'Japanese chess is listed once, as a board game for up to two players');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'shogi');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/shogi/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map(lin).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), fx = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * fx(Y) - 16, 500 * (fx(X) - fx(Y)), 200 * (fx(Y) - fx(Z))];
    };
    const dE = (a, c) => { const P2 = lab(a), Q2 = lab(c); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && near[1] >= 15 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    // an empty hand looked like a blank box, and a reporter took the drops for missing (#955)
    ok((html.match(/^ {8}handLbl: '/gm) || []).length === LOCALE_CODES.length && /sg-stand'[^\n]*C\.t\('handLbl'\)/.test(html) && /sg-stand--full/.test(html),
      'each hand says what it is for while empty: a label in every language, hidden once it holds a piece');
    ok(Date.now() - t0 < 3000, 'the Japanese chess tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testShogi };
};
