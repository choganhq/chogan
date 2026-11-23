'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #1059: Apiary, a hive game of five insects on a hex grid with no board
  function testApiary() {
    head('Apiary (#1059)');
    const t0 = Date.now();
    // no early return when the game is missing: loadEngine throws, and a thrown group fails the run
    const file = path.join(ROOT, 'www/games/apiary/index.html');
    const E = loadEngine('apiary', 'ApiaryEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const { QUEEN: Q, BEETLE: B, HOPPER: G, SPIDER: S, ANT: A } = E;
    const k = (q, r) => E.key(q, r);
    const W = (y) => y, K = (y) => 8 + y;
    // a position from [q, r, code, code…] cells; hands lose what is on the board
    const mk = (cells, turn, plies) => {
      const P = E.newGame();
      cells.forEach((c) => { P.st[k(c[0], c[1])] = c.slice(2); c.slice(2).forEach((x) => { P.hand[x >> 3][x & 7]--; }); });
      P.turn = turn || 0;
      P.plies = plies !== undefined ? plies : E.cells(P).length + 4;
      return P;
    };
    const set = (list) => list.slice().sort((a, b) => a - b).join();
    const keys = (list) => set(list.map((c) => k(c[0], c[1])));
    const destsOf = (P, q, r) => set(E.destsFrom(P, k(q, r)));
    const brutePinned = (P) => {
      const out = [];
      E.cells(P).forEach((c) => { const x = E.clone(P); delete x.st[c]; if (E.cells(x).length && !E.connected(x)) out.push(c); });
      return set(out);
    };

    // the start
    const N = E.newGame();
    ok(E.START.join() === '1,2,3,2,3' && E.valid(N) && N.turn === 0 && N.winner === -1, 'each side starts with a queen, two beetles, three grasshoppers, two spiders and three ants');
    ok(set(E.placeCells(N, 0)) === String(E.ORIGIN) && E.moves(N).length === 5, 'the first piece goes in the middle, any of the five insects');
    E.apply(N, [0, A, E.ORIGIN]);
    ok(set(E.placeCells(N, 1)) === set(E.D.map((d) => E.ORIGIN + d)), 'the second piece may touch the first on any of its six sides');

    // placement: touching your own pieces and none of the other side's
    const P1 = mk([[0, 0, W(A)], [1, 0, K(A)]], 0, 2);
    ok(set(E.placeCells(P1, 0)) === keys([[0, -1], [-1, 0], [-1, 1]]) && set(E.placeCells(P1, 1)) === keys([[2, 0], [2, -1], [1, 1]]),
      'from the third piece on, a new piece touches its own side and never the other');
    const P1b = mk([[0, 0, W(A), K(B)], [1, 0, K(A)]], 0, 3);
    ok(E.placeCells(P1b, 0).length === 0 && set(E.placeCells(P1b, 1)).length > 0, 'a beetle on top of a stack gives the cell its colour for placing');

    // the queen by the fourth piece, and no moving before her
    const P2 = mk([[0, 0, W(A)], [1, 0, K(A)], [-1, 0, W(G)], [2, 0, K(G)], [-1, 1, W(S)], [2, -1, K(S)]], 0, 6);
    const m2 = E.moves(P2);
    ok(E.mustQueen(P2, 0) && m2.length > 0 && m2.every((m) => m[0] === 0 && m[1] === Q), 'a side that has placed three pieces without its queen must place her now');
    ok(E.movements(P2, 0).length === 0 && E.movements(mk([[0, 0, W(A)], [1, 0, K(Q)], [-1, 0, W(A)]], 1, 3), 0).length === 0,
      'no piece moves while its queen is still in the hand');
    const P2b = mk([[0, 0, W(Q)], [1, 0, K(A)], [-1, 0, W(G)], [2, 0, K(G)], [-1, 1, W(S)], [2, -1, K(S)]], 0, 6);
    ok(!E.mustQueen(P2b, 0) && E.moves(P2b).some((m) => m[1] !== Q), 'with the queen down, any piece may be placed');

    // the insects, all on one board: a line of three, and the piece being tested beside it
    const line = (y) => mk([[-1, 0, W(y)], [0, 0, W(Q)], [1, 0, K(Q)], [2, 0, K(A)]], 0);
    ok(destsOf(line(Q), -1, 0) === keys([[0, -1], [-1, 1]]), 'the queen slides one cell along the hive');
    ok(destsOf(line(A), -1, 0) === keys([[0, -1], [1, -1], [2, -1], [3, -1], [3, 0], [2, 1], [1, 1], [0, 1], [-1, 1]]), 'the ant reaches every cell around the hive');
    ok(destsOf(line(S), -1, 0) === keys([[2, -1], [1, 1]]), 'the spider walks exactly three cells, never back over its path');
    ok(destsOf(line(G), -1, 0) === keys([[3, 0]]), 'the grasshopper jumps in a straight line over the pieces to the first gap');
    ok(destsOf(line(B), -1, 0) === keys([[0, 0], [0, -1], [-1, 1]]), 'the beetle slides one cell or climbs onto the hive');
    const hop = mk([[0, 0, W(G)], [1, 0, K(Q)], [2, 0, K(A)], [0, 1, W(Q)]], 0);
    ok(destsOf(hop, 0, 0) === keys([[3, 0], [0, 2]]), 'a grasshopper may jump in every direction that has a piece next to it, never over a gap');

    // freedom to move: a piece in a pocket cannot squeeze out through a narrow gate
    const pocketOf = (y) => mk([[0, 0, W(y)], [1, -1, W(Q)], [0, -1, K(Q)], [-1, 0, K(A)], [-1, 1, K(G)], [0, 1, W(A)]], 0);
    ok(destsOf(pocketOf(Q), 0, 0) === '' && destsOf(pocketOf(A), 0, 0) === '' && destsOf(pocketOf(S), 0, 0) === '',
      'a queen, ant or spider in a pocket with one narrow opening cannot slide out');
    ok(destsOf(pocketOf(B), 0, 0) === keys([[1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]), 'a beetle in the same pocket climbs out over its neighbours, but cannot slide through the gate');
    ok(destsOf(pocketOf(G), 0, 0) === keys([[2, -2], [0, -2], [-2, 0], [-2, 2], [0, 2]]), 'a grasshopper jumps out of the pocket');
    // the gate up on the hive: a beetle cannot pass between two higher stacks
    const up = mk([[0, 0, W(Q), W(B)], [1, 0, K(Q)], [0, 1, W(A), K(B)], [1, -1, W(G), K(B)]], 0);
    const upD = E.destsFrom(up, k(0, 0));
    ok(upD.indexOf(k(1, 0)) < 0 && upD.indexOf(k(0, 1)) >= 0 && upD.indexOf(k(-1, 0)) >= 0 && upD.length === 5,
      'a beetle on the hive cannot pass between two stacks higher than both ends of its step');

    // the one-hive rule
    const pin = line(S);
    ok(set(Object.keys(E.pinnedSet(pin)).map(Number)) === keys([[0, 0], [1, 0]]) && !E.movements(pin, 0).some((m) => m[1] === k(0, 0)),
      'a piece that holds the hive together cannot move');
    const cov = mk([[-1, 0, W(S)], [0, 0, W(Q), W(B)], [1, 0, K(Q)], [2, 0, K(A)]], 0);
    const covM = E.movements(cov, 0).filter((m) => m[1] === k(0, 0));
    ok(covM.length === 6 && set(covM.map((m) => m[2])) === set(E.D.map((d) => k(0, 0) + d)), 'a beetle on top of a holding piece still moves, to any of the six cells');
    ok(!E.movements(mk([[0, 0, W(Q), K(B)], [1, 0, K(Q)], [-1, 0, W(A)]], 0, 4), 0).some((m) => m[1] === k(0, 0)), 'a piece under a beetle cannot move');

    // passing
    const stuck = mk([[0, 0, W(A)], [1, 0, K(Q)], [-1, 0, K(A)]], 0, 3);
    ok(E.moves(stuck).length === 1 && E.moves(stuck)[0][0] === 2 && E.play(stuck, [2, 0, 0]) && stuck.turn === 1, 'a side with no legal move passes');

    // the end: a surrounded queen loses, two at once is a draw, and a long game stops
    const winP = mk([[0, 0, K(Q)], [1, -1, W(Q)], [0, -1, W(B)], [-1, 0, W(G)], [-1, 1, W(S)], [0, 1, W(A)], [1, 1, W(A)]], 0, 8);
    ok(E.legal(winP, [1, k(1, 1), k(1, 0)]) && E.play(winP, [1, k(1, 1), k(1, 0)]) && winP.winner === 0 && E.moves(winP).length === 0,
      'surrounding the other queen on all six sides wins, and the game stops');
    const drawP = mk([[0, 0, W(Q)], [1, 0, K(Q)], [1, -1, W(B)], [0, -1, W(G)], [-1, 0, W(G)], [-1, 1, W(S)], [0, 2, W(A)], [2, 0, K(B)], [2, -1, K(G)], [1, 1, K(S)]], 0, 12);
    ok(E.play(drawP, [1, k(0, 2), k(0, 1)]) && drawP.winner === 2, 'surrounding both queens with one move is a draw');
    const capP = mk([[0, 0, W(Q)], [1, 0, K(Q)]], 0, E.CAP - 1);
    ok(E.play(capP, [1, k(0, 0), k(1, -1)]) && capP.winner === 2, 'a game that reaches ' + E.CAP + ' plies is a draw');
    const winBot = mk([[0, 0, K(Q)], [1, -1, W(Q)], [0, -1, W(B)], [-1, 0, W(G)], [-1, 1, W(S)], [0, 1, W(A)], [1, 1, W(A)]], 0, 8);
    ok(E.LEVELS.join() === 'easy,medium,hard' && E.LEVELS.every((lv) => [1, 2, 3].every((s) => { const m = E.think(winBot, lv, rng(s)); return E.winner !== 0 && E.apply(E.clone(winBot), m).winner === 0; })),
      'every bot level takes a win in one move');

    // random games: every move keeps the hive whole, placing obeys the rule, and the one-hive check matches brute force
    let states = 0, moved = 0, badHive = 0, badPin = 0, badPlace = 0, badMove = 0;
    for (let g = 0; g < 6; g++) {
      const R = rng(500 + g), P = E.newGame();
      for (let ply = 0; ply < 70 && P.winner < 0; ply++) {
        states++;
        if (brutePinned(P) !== set(Object.keys(E.pinnedSet(P)).map(Number))) badPin++;
        const ms = E.moves(P);
        ms.forEach((m) => {
          const n = E.apply(E.clone(P), m);
          if (!E.connected(n)) badHive++;
          if (m[0] === 0 && E.cells(P).length >= 2) {
            const around = E.D.map((d) => E.top(P, m[2] + d)).filter((x) => x >= 0);
            if (P.st[m[2]] || !around.some((x) => E.sideOf(x) === P.turn) || around.some((x) => E.sideOf(x) !== P.turn)) badPlace++;
          }
          if (m[0] === 1) { moved++; if (E.sideOf(E.top(P, m[1])) !== P.turn || m[1] === m[2]) badMove++; }
        });
        E.apply(P, ms[Math.floor(R() * ms.length)]);
      }
    }
    ok(states >= 300 && moved > 5000, 'random games reach many positions and moves (' + states + ' positions, ' + moved + ' moves)');
    ok(badPin === 0, 'the one-hive check names exactly the pieces whose lifting splits the hive (' + badPin + ' wrong)');
    ok(badHive === 0 && badPlace === 0 && badMove === 0, 'no move splits the hive, no placement touches the other side, no side moves the other\'s piece (' + [badHive, badPlace, badMove].join('/') + ')');

    // bot games: every move legal, every state valid, every game ends
    let bm = 0, badBot = 0, slow = 0, ends = 0;
    const games = [['medium', 'easy', 11], ['easy', 'medium', 12]];
    games.forEach(([l0, l1, seed]) => {
      const R = rng(seed), P = E.newGame();
      while (P.winner < 0) {
        const t1 = Date.now(), m = E.think(P, P.turn ? l1 : l0, R);
        if (Date.now() - t1 > 400) slow++;
        if (!E.play(P, m)) { badBot++; break; }
        bm++;
        if (P.winner < 0 && !E.valid(P)) badBot++;
      }
      if (P.winner >= 0) ends++;
    });
    ok(ends === games.length && badBot === 0 && bm > 30, 'bot games finish with only legal moves and valid states (' + games.length + ' games, ' + bm + ' moves)');
    const H = E.newGame(), RH = rng(77);
    E.dailyOpening(rng(3)).forEach((m) => E.play(H, m));
    let hardMax = 0;
    for (let i = 0; i < 10 && H.winner < 0; i++) {
      const t1 = Date.now(), m = E.think(H, i % 2 ? 'medium' : 'hard', RH);
      hardMax = Math.max(hardMax, Date.now() - t1);
      if (!E.play(H, m)) badBot++;
    }
    ok(badBot === 0 && slow === 0 && hardMax < 1200, 'the hard bot plays legal moves within its time budget (slowest ' + hardMax + ' ms)');

    // the daily opening
    const o1 = E.dailyOpening(rng(42)), o2 = E.dailyOpening(rng(42));
    let dailyOk = true;
    for (let s = 1; s <= 60; s++) { const o = E.dailyOpening(rng(s)), P = E.newGame(); if (!o.every((m) => m[1] !== Q && E.play(P, m)) || !E.valid(P)) dailyOk = false; }
    ok(JSON.stringify(o1) === JSON.stringify(o2) && dailyOk, 'the daily opening is the same for the same day, legal, and never a queen');

    // saves
    const V = mk([[0, 0, W(Q)], [1, 0, K(Q)], [-1, 0, W(A), K(B)]], 1, 6);
    const bad = (f) => { const x = JSON.parse(JSON.stringify(V)); f(x); return !E.valid(x); };
    ok(E.valid(JSON.parse(JSON.stringify(V))) && !E.valid(null) && bad((x) => { x.hand[0][A]--; }) && bad((x) => { x.st[k(5, 5)] = [W(G)]; x.hand[0][G]--; }) &&
      bad((x) => { x.st[k(1, 0)].push(W(A)); x.hand[0][A]--; }) && bad((x) => { x.turn = 2; }) && bad((x) => { x.st[k(0, 0)] = [13]; }) && bad((x) => { x.plies = E.CAP; }),
      'a save is checked before it is restored (counts, a split hive, a non-beetle on a stack, turn, codes, length)');
    ok(/ctx\.autosave\(/.test(html) && /ctx\.store\./.test(html) && !/localStorage/.test(html) && /validSave\(saved\)/.test(html), 'progress is saved through the core and checked before an unfinished game resumes');

    // the page
    const aw = ['ap-win', 'ap-hard', 'ap-beetle'];
    ok(aw.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bap: 'apiary'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, i) => {
        if (!/id: 'ap-/.test(l)) return;
        if (!titles[i]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[i]).length > 1) dupes.push(lang + ':' + titles[i]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'ap-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/C\.daily\('apiary'/.test(html) && /C\.stats\.daily\('apiary'/.test(html) && /G\.daily \? C\.daily\('apiary', G\.daily \+ '\|' \+ G\.S\.plies\)\.rng/.test(html),
      'the daily game is seeded by the day, and the bot\'s choices too, so everyone meets the same game');
    ok(/cv\.width !== Math\.round\(W \* dpr\) \|\| cv\.height !== Math\.round\(H \* dpr\)/.test(html) && /document\.fonts\.ready\.then\(draw\)/.test(html) && /ResizeObserver/.test(html),
      'the canvas backing follows both sides of its box and redraws when the font arrives');
    ok(/ArrowRight/.test(html) && /e\.key === 'Enter'/.test(html) && /\^\[1-5\]\$/.test(html) && /e\.key === 'Escape'/.test(html) && /C\.undoKey\(e\)/.test(html),
      'the arrows move the cursor, Enter taps, 1–5 pick a piece from the tray, Esc lets go, U or Ctrl+Z undoes');
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((x) => x.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 10 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const ownKeys = (langs.fa || '').split(',');
    const used = (html.match(/C\.t\('([A-Za-z0-9]+)'/g) || []).map((x) => x.slice(5, -1));
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close'];
    ok(ownKeys.length > 30 && ownKeys.every((x) => coreKeys.indexOf(x) < 0), 'no game string is named like a core string');
    const missing = used.filter((x) => ownKeys.indexOf(x) < 0 && coreKeys.indexOf(x) < 0 && !new RegExp('\\b' + x + ": '").test(core));
    ok(used.length > 20 && missing.length === 0, 'every literal key the page reads exists in its strings or the core (' + (missing.join(', ') || 'none missing') + ')');
    const help = (html.match(/function showHelp\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
    ok(/C\.icon\('gear', 20\)/.test(html) && help.length > 0 && !/segmented|modeT|levelT/.test(help) && /C\.t\('rules'\)/.test(help),
      'the options (mode, level) sit behind a gear; help holds the rules and the keys');

    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'apiary');
    ok(!!gm && gm.cat === 'board' && gm.people === 2 && list.filter((g) => g.id === 'apiary').length === 1 && gm.added === '2026-11-22',
      'Apiary is listed once, as a board game for two on one phone');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'apiary');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const iconFile = path.join(ROOT, 'www/games/apiary/icon.svg');
    const icon = fs.existsSync(iconFile) ? fs.readFileSync(iconFile, 'utf8') : '';
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (q) => q <= 0.04045 ? q / 12.92 : Math.pow((q + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map(lin).reduce((s, q, i) => s + q * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const P2 = lab(x), Q2 = lab(y); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const nearest = (pool) => gm && pool.length ? pool.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    const nBoard = nearest(others.filter((g) => g.cat === 'board')), nAll = nearest(others);
    ok(!!gm && nBoard[1] >= 15 && nAll[1] >= 8 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs by ΔE ≥ 15 from every board game (nearest ' + nBoard[0] + ', ' + (nBoard[1] || 0).toFixed(1) + ') and ≥ 8 from all others (nearest ' + nAll[0] + ', ' + (nAll[1] || 0).toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 6000, 'the Apiary tests finish in under 6 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testApiary };
};
