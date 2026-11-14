'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #885: Hex on an 11×11 rhombus, against a bot at three levels or two on one phone
  function testHex() {
    head('Hex (#885)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/hex/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    if (!fs.existsSync(file)) return;
    const E = loadEngine('hex', 'HexEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const N = E.N, at = (r, c) => r * N + c;
    ok(N === 11 && E.CELLS === 121, 'the board is 11 by 11');
    ok(E.NB[at(0, 0)].length === 2 && E.NB[at(0, 10)].length === 3 && E.NB[at(10, 0)].length === 3 && E.NB[at(5, 5)].length === 6 &&
      E.NB[at(5, 5)].indexOf(at(4, 6)) >= 0 && E.NB[at(5, 5)].indexOf(at(4, 4)) < 0,
      'a cell touches six others, (r-1, c+1) among them but not (r-1, c-1); the sharp corners touch two');

    // placing and winning
    const S = E.newGame(false);
    ok(S.turn === 0 && S.winner < 0 && E.valid(S), 'red moves first on an empty board');
    for (let r = 0; r < N; r++) { E.play(S, at(r, 5)); if (r < N - 1) E.play(S, at(r, 0)); }
    ok(S.winner === 0 && S.plies === 21 && E.valid(S) && E.path(S, 0).length === 11, 'a red chain from the top row to the bottom row wins, and the win path is that chain');
    ok(!E.play(S, at(3, 3)) && S.plies === 21, 'no stone is placed after the game is won');
    const S2 = E.newGame(false);
    E.play(S2, at(4, 4));
    ok(!E.play(S2, at(4, 4)) && S2.turn === 1 && S2.plies === 1, 'a taken cell is refused and the turn stays');
    const S3 = E.newGame(false);
    for (let c = 0; c < N; c++) { E.play(S3, c < 10 ? at(0, c) : at(1, 0)); E.play(S3, at(c, 10 - c)); }
    ok(S3.winner === 1, 'blue wins by joining the left and right columns, here along the long diagonal');

    // no draws: every full board has exactly one winner
    let oneWinner = 0;
    for (let s = 1; s <= 120; s++) {
      const R = rng(s * 977), cells = [];
      for (let i = 0; i < E.CELLS; i++) cells.push(R() < 0.5 ? 0 : 1);
      if (E.connected(cells, 0) !== E.connected(cells, 1)) oneWinner++;
    }
    ok(oneWinner === 120, 'on 120 random full boards exactly one side is connected (' + oneWinner + '/120)');

    // the swap rule
    const P = E.newGame(false); E.play(P, at(2, 7));
    ok(!E.canSwap(P) && !E.swap(P), 'without the swap rule, blue cannot take red\'s stone');
    const Q = E.newGame(true); E.play(Q, at(2, 7));
    ok(E.canSwap(Q) && E.swap(Q) && Q.cells[at(2, 7)] === -1 && Q.cells[at(7, 2)] === 1 && Q.turn === 0 && Q.plies === 2 && Q.swapped && E.valid(Q),
      'with it, blue takes red\'s opening: the stone is mirrored across the diagonal and turned blue, and red moves again');
    ok(!E.canSwap(Q) && !E.swap(Q), 'the swap is offered only once');
    E.play(Q, at(5, 5));
    ok(!E.canSwap(Q) && E.valid(Q), 'a game after a swap stays valid as it goes on');
    const late = E.newGame(true); E.play(late, at(1, 1)); E.play(late, at(2, 2));
    ok(!E.canSwap(late), 'once blue has played a stone, the swap is gone');
    const centre = E.newGame(true); E.play(centre, at(5, 5));
    const edge = E.newGame(true); E.play(edge, at(0, 3));
    ok(E.think(centre, 'medium', rng(1)) === E.SWAP && E.think(centre, 'hard', rng(1)) === E.SWAP && E.think(edge, 'hard', rng(1)) !== E.SWAP &&
      E.think(centre, 'easy', rng(1)) !== E.SWAP, 'medium and hard take a strong central opening, leave a weak edge one, and easy never swaps');

    // the bot's tactics
    const W = E.newGame(false);
    for (let r = 0; r < N; r++) if (r !== 6) W.cells[at(r, 3)] = 0;
    for (let k = 0; k < 10; k++) W.cells[at(k, 9)] = 1;
    W.plies = 20; W.turn = 0;
    ok(E.valid(W) && E.winningCells(W.cells, 0).join() === String(at(6, 3)), 'the cell that closes a red chain is found');
    ok(['easy', 'medium', 'hard'].every((l) => E.think(W, l, rng(3)) === at(6, 3)), 'every level plays the stone that wins');
    const B = E.clone(W); B.turn = 1;
    ok(['medium', 'hard'].every((l) => E.think(B, l, rng(3)) === at(6, 3)), 'medium and hard block the cell the other side would win on');
    const br = E.newGame(false);
    br.cells[at(5, 5)] = 0; br.cells[at(4, 7)] = 0; br.cells[at(4, 6)] = 1; br.cells[at(9, 9)] = 1; br.plies = 4; br.turn = 0; br.last = at(4, 6);
    ok(E.valid(br) && E.bridgeSave(br, 0) === at(5, 6) && E.think(br, 'medium', rng(5)) === at(5, 6) && E.think(br, 'hard', rng(5)) === at(5, 6),
      'when a bridge is cut into, medium and hard take its other carrier');
    const tpl = E.newGame(false);
    tpl.cells[at(1, 3)] = 0; tpl.cells[at(0, 3)] = 1; tpl.plies = 2; tpl.turn = 0; tpl.last = at(0, 3);
    ok(E.bridgeSave(tpl, 0) === at(0, 4), 'a stone one row from its edge keeps the edge through the other free cell');
    const rs = E.newGame(false); rs.cells[at(5, 5)] = 0;
    ok(E.resistance(rs.cells, 0) < E.resistance(rs.cells, 1) && E.score(rs.cells, 0) > 0 && Math.abs(E.score(E.newGame(false).cells, 0)) < E.score(rs.cells, 0) / 10,
      'a stone makes its side\'s way across easier, and an empty board is even to within a tenth of one stone (the solver stops near, not at, the exact answer)');

    // bot against bot: whole games end, every state is valid, and the levels are ordered
    let ended = 0, sane = 0, slow = 0;
    const res = {};
    const play = (l0, l1, swap, seed) => {
      const G = E.newGame(swap), R = rng(seed);
      let n = 0, good = true;
      while (G.winner < 0 && n < 130) {
        const lv = G.turn === 0 ? l0 : l1, t = Date.now();
        const m = E.think(G, lv, R);
        if (Date.now() - t > slow) slow = Date.now() - t;
        const done = m === E.SWAP ? E.swap(G) : E.play(G, m);
        if (!done || !E.valid(G)) good = false;
        n++;
      }
      if (G.winner >= 0) ended++;
      if (good) sane++;
      return G.winner;
    };
    // A whole game costs ~0.7 s with medium and ~1.5 s with hard here (CI is ~3× slower), so
    // the suite plays one medium game with the swap rule on, and hard is timed on its
    // slowest positions (an empty board has the most replies to search) instead.
    res['easy-medium'] = play('easy', 'medium', true, 885) === 0 ? 'easy' : 'medium';
    ok(ended === 1 && sane === 1, 'a bot game with the swap rule ends with a winner and every move keeps the game valid');
    ok(res['easy-medium'] === 'medium', 'medium beats easy (' + JSON.stringify(res) + ')');
    const H = E.newGame(false), HR = rng(7);
    for (let k = 0; k < 1; k++) { const t = Date.now(), m = E.think(H, 'hard', HR); slow = Math.max(slow, Date.now() - t); E.play(H, m); }
    ok(H.plies === 1 && E.valid(H), 'hard opens a game with a legal move');
    ok(slow < 400, 'no bot move takes more than 400 ms here (slowest ' + slow + ' ms), so a phone stays under its 1.5 s');

    // the daily opening is the same for everyone and fair
    const op = (s) => E.dailyOpening(rng(s));
    ok(op(20261114) === op(20261114) && Array.from({ length: 40 }, (x, k) => op(k + 1)).every((i) => E.rim(i) === 1 || E.rim(i) === 2),
      'the daily opening repeats for the same seed and sits one or two cells from an edge');

    // saves
    const V = E.newGame(false); E.play(V, at(3, 3));
    ok(E.valid(V) && !E.valid(Object.assign(E.clone(V), { turn: 0 })) && !E.valid(Object.assign(E.clone(V), { plies: 5 })) &&
      !E.valid(Object.assign(E.clone(V), { cells: V.cells.slice(1) })) && !E.valid(Object.assign(E.clone(V), { swapped: true })) &&
      !E.valid(Object.assign(E.clone(V), { winner: 0 })) && !E.valid(null),
      'a save is checked before it is restored (turn, ply count, size, swap, winner)');

    // the page
    ok(/C\.daily\('hex', daily\)\.rng/.test(html) && /daily \? 'medium'/.test(html) && /daily \? false/.test(html),
      'the daily game opens from the day\'s seed, against the medium bot, without the swap rule');
    const ids = ['hx-win', 'hx-hard', 'hx-lean'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bhx: 'hex'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'hx-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'hx-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowUp/.test(html) && /C\.undoKey\(e\)/.test(html) && /C\.keyIs\(e, 's'\)/.test(html) && !/dir === 'rtl'|isRtl|C\.rtl/.test(html),
      'arrows move by the drawn board in every language (a canvas never flips), undo and S go through the core key helpers');
    ok(/cv\.width !== Math\.round\(W \* dpr\) \|\| cv\.height !== Math\.round\(H \* dpr\)/.test(html) && /document\.fonts\.ready/.test(html) && /ResizeObserver/.test(html),
      'the canvas backing follows both sides of its box, and redraws on resize and after fonts load (#359)');
    ok(/ch-fit/.test(html) && /--fit-ar/.test(html) && /ch-split/.test(html) && /min-aspect-ratio: 5 \/ 4/.test(html), 'the board uses the core layout and lies on its side in a wide window');
    const boxRule = (html.match(/\.ch-fit > \.hx-box \{([^}]*)\}/) || [])[1];
    ok(boxRule !== undefined && !/(^|[\s;])(width|height)\s*:/.test(boxRule), 'the board slot takes its size from the core rule, never its own (#736)');
    ok(/\.hx-status \{[^}]*min-height: 48px/.test(html), 'the row the swap button appears in keeps its height, so the board never moves between taps');
    // strings: every language, the same keys, none named like a core key
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 7 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close'];
    const own = (langs.fa || '').split(',');
    ok(own.length > 30 && own.every((k) => coreKeys.indexOf(k) < 0), 'no game string is named like a core string');
    const help = (html.match(/function showHelp\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
    ok(/C\.icon\('gear', 20\)/.test(html) && /C\.t\('swapT'\)/.test(html) && help.length > 0 && !/segmented|swapT/.test(help),
      'the options (players, level, swap rule) sit behind a gear; help holds the rules and keys only');
    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'hex');
    ok(!!gm && gm.cat === 'board' && gm.people === 2 && list.indexOf(gm) > list.findIndex((g) => g.id === 'fitten'), 'Hex is listed after Fit Ten as a board game for up to two players');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'hex');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/hex/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, b) => { const P2 = lab(a), Q2 = lab(b); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && near[1] >= 15 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    // the two sides' stones must read on the empty cell in both themes
    const ratio = (a, b) => { const x = lumC(a), y = lumC(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const tok = (k) => [...html.matchAll(new RegExp('--hx-' + k + ': (#[0-9A-Fa-f]{6})', 'g'))].map((m) => m[1]);
    const cell = tok('cell'), red = tok('r'), blue = tok('b');
    ok(cell.length === 3 && red.length === 3 && blue.length === 3 && [0, 1, 2].every((k) => ratio(red[k], cell[k]) >= 3 && ratio(blue[k], cell[k]) >= 3),
      'red and blue stones reach 3:1 on the empty cell in the light and both dark rules');
    ok(Date.now() - t0 < 3000, 'the Hex tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testHex };
};
