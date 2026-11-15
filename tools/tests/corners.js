'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #909: Corner to Corner, polyomino placement on a 14×14 board, against a bot at three
  // levels or two on one phone
  function testCorners() {
    head('Corner to Corner (#909)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/corners/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    if (!fs.existsSync(file)) return;
    const E = loadEngine('corners', 'CornersEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const N = E.N, at = (r, c) => r * N + c;
    ok(N === 14 && E.CELLS === 196, 'the board is 14 by 14');

    // the 21 pieces: every free polyomino of one to five squares, each once
    const sizes = E.PIECES.map((p) => p.length);
    ok(E.PIECES.length === 21 && sizes.join() === '1,2,3,3,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5,5' && E.TOTAL === 89,
      'there are 21 pieces: one each of one and two squares, two of three, five of four and twelve of five (89 squares)');
    const counts = E.ORIENT.map((o) => o.length);
    ok(counts.join() === '1,2,2,4,2,8,4,4,1,8,2,8,8,8,4,4,4,4,1,8,4' && counts.reduce((a, b) => a + b, 0) === 91,
      'each piece has its own number of distinct turns and flips, 91 in all (' + counts.join(' ') + ')');
    const keyOf = (cells) => cells.map((c) => c[0] + ':' + c[1]).sort().join('|');
    const allKeys = [];
    E.ORIENT.forEach((os) => os.forEach((o) => allKeys.push(keyOf(o.cells))));
    ok(new Set(allKeys).size === 91, 'no orientation repeats, within a piece or across two pieces, so no two pieces are the same shape');
    const connected = (cells) => {
      const set = new Set(cells.map((c) => c[0] + ':' + c[1])), seen = new Set([cells[0][0] + ':' + cells[0][1]]), q = [cells[0]];
      while (q.length) { const [r, c] = q.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { const k = (r + a) + ':' + (c + b); if (set.has(k) && !seen.has(k)) { seen.add(k); q.push([r + a, c + b]); } }); }
      return seen.size === cells.length;
    };
    ok(E.ORIENT.every((os, p) => os.every((o) => o.cells.length === sizes[p] && connected(o.cells) && Math.min(...o.cells.map((c) => c[0])) === 0 && Math.min(...o.cells.map((c) => c[1])) === 0)),
      'every orientation is joined edge to edge and starts at row 0, column 0');
    ok(E.ORIENT.every((os, p) => os.every((o, k) => E.ORIENT[p][E.rot(p, E.rot(p, E.rot(p, E.rot(p, k))))] === o && E.flip(p, E.flip(p, k)) === k)),
      'four quarter turns or two flips bring every orientation back to itself');

    // placing
    const S = E.newGame();
    ok(S.turn === 0 && !S.over && E.valid(S) && E.START[0] === at(13, 0) && E.START[1] === at(0, 13), 'side one starts at the bottom left, side two at the top right');
    const mono = 0, dom = 1, sq = 8;
    ok(!E.legal(S, 0, mono, 0, 0, 0) && !E.legal(S, 0, mono, 0, 12, 1) && E.legal(S, 0, mono, 0, 13, 0), 'a first piece must cover its own start corner');
    ok(E.play(S, { p: sq, o: 0, r: 12, c: 0 }) && S.turn === 1 && S.cells[at(12, 0)] === 0 && S.cells[at(13, 1)] === 0 && S.used[0][sq] === 1, 'a legal piece is placed and the turn passes');
    ok(!E.play(S, { p: dom, o: 0, r: 13, c: 2 }) && S.turn === 1 && S.plies === 1, 'side two\'s first piece away from its own corner is refused and the turn stays');
    E.play(S, { p: sq, o: 0, r: 0, c: 12 });
    ok(!E.legal(S, 0, dom, 0, 13, 2), 'a piece that only shares an edge with its own side is refused');
    ok(E.legal(S, 0, mono, 0, 11, 2) && !E.legal(S, 0, mono, 0, 9, 4), 'a piece touching its own side at a corner is allowed, one touching nothing is not');
    ok(!E.legal(S, 0, sq, 0, 10, 2), 'a piece already used is refused');
    ok(!E.legal(S, 0, mono, 0, 12, 1), 'a piece on an occupied square is refused');
    E.play(S, { p: mono, o: 0, r: 11, c: 2 });
    // side two's 2×2 sits at rows 0–1, columns 12–13; a domino right of side one's mono is
    // fine whatever touches it of the other side
    const X = E.newGame();
    E.play(X, { p: mono, o: 0, r: 13, c: 0 }); E.play(X, { p: mono, o: 0, r: 0, c: 13 });
    X.cells[at(11, 2)] = 1; X.cells[at(12, 2)] = 1;
    ok(E.legal(X, 0, dom, 0, 12, 1) === false && E.legal(X, 0, dom, 1, 11, 1), 'a piece may share an edge with the other side');

    // move generation matches a brute-force scan of every placement
    const brute = (G, side) => {
      const out = [];
      for (let p = 0; p < 21; p++) if (!G.used[side][p]) E.ORIENT[p].forEach((o, k) => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (E.legal(G, side, p, k, r, c)) out.push([p, k, r, c].join()); });
      return out.sort().join(';');
    };
    let same = 0, tried = 0;
    const B = E.newGame(), BR = rng(909);
    for (let k = 0; k < 12 && !B.over; k++) {
      if (k % 3 === 0) { tried++; if (brute(B, B.turn) === E.moves(B, B.turn).map((m) => [m.p, m.o, m.r, m.c].join()).sort().join(';')) same++; }
      E.play(B, E.think(B, 'easy', BR));
    }
    ok(tried === 4 && same === 4, 'the move list matches a scan of every piece, turn and square (' + same + '/' + tried + ' positions)');

    // bot against bot: whole games end with both sides passed, every state is valid
    let slow = 0;
    const play = (l0, l1, seed) => {
      const G = E.newGame(), R = rng(seed);
      let n = 0, good = true;
      while (!G.over && n < 60) {
        const lv = G.turn === 0 ? l0 : l1, t = Date.now();
        const m = E.think(G, lv, R);
        slow = Math.max(slow, Date.now() - t);
        if (!m || !E.play(G, m)) good = false;
        n++;
      }
      const sc = E.score(G);
      const sum = (s) => G.used[s].reduce((a, u, p) => a + (u ? sizes[p] : 0), 0);
      return { G, good: good && E.valid(G), over: G.over && G.passed[0] && G.passed[1] && !E.hasMove(G, 0) && !E.hasMove(G, 1),
        counted: sc[0] === sum(0) && sc[1] === sum(1) && sc[0] === G.cells.filter((x) => x === 0).length, sc, n };
    };
    const a = play('easy', 'medium', 909), b = play('medium', 'easy', 1109);
    ok(a.over && b.over && a.n <= 42 && b.n <= 42, 'two bot games end, each once both sides can no longer place and have passed (' + a.n + ' and ' + b.n + ' moves)');
    ok(a.good && b.good && a.counted && b.counted, 'every move keeps the game valid, and the score counts the squares placed');
    ok(E.winner(a.G) === 1 && E.winner(b.G) === 0, 'medium beats easy from either side (' + a.sc.join(':') + ', ' + b.sc.join(':') + ')');
    const H = E.newGame(), HR = rng(7);
    E.play(H, E.think(H, 'medium', HR)); E.play(H, E.think(H, 'medium', HR));
    const th = Date.now(), hm = E.think(H, 'hard', HR, 300), hardMs = Date.now() - th;
    ok(hm && E.play(H, hm) && E.valid(H) && hardMs < 450, 'hard plays a legal move within its time budget (' + hardMs + ' ms for a 300 ms budget)');
    ok(slow < 400, 'no easy or medium move takes more than 400 ms here (slowest ' + slow + ' ms)');
    const pick = (s) => JSON.stringify(E.think(E.newGame(), 'medium', rng(s)));
    ok(pick(20261115) === pick(20261115), 'the bot plays the same move for the same seed, so the daily opponent is the same for everyone');

    // a lone remaining move must be the bot's answer at every level
    const L = E.newGame();
    E.play(L, { p: mono, o: 0, r: 13, c: 0 }); E.play(L, { p: mono, o: 0, r: 0, c: 13 });
    for (let p = 1; p < 21; p++) L.used[0][p] = 1;
    L.used[0][0] = 1; L.used[0][1] = 0;
    const only = E.moves(L, 0);
    ok(only.length > 0 && ['easy', 'medium', 'hard'].every((l) => { const m = E.think(L, l, rng(3), 200); return m && m.p === 1; }), 'with one piece left, every level plays that piece');

    // saves
    const V = E.newGame(); E.play(V, { p: sq, o: 0, r: 12, c: 0 });
    const cl = () => JSON.parse(JSON.stringify(V));
    ok(E.valid(V) && E.valid(cl()) && !E.valid(Object.assign(cl(), { turn: 0 })) && !E.valid(Object.assign(cl(), { plies: 3 })) &&
      !E.valid(Object.assign(cl(), { cells: V.cells.slice(1) })) && !E.valid((() => { const x = cl(); x.cells[at(5, 5)] = 1; return x; })()) &&
      !E.valid((() => { const x = cl(); x.log[0][4] = 3; return x; })()) && !E.valid(Object.assign(cl(), { over: true })) && !E.valid(null),
      'a save is checked by replaying its moves before it is restored (turn, ply count, size, squares, log, end)');

    // the page
    ok(/C\.daily\('corners', G\.daily \+ '\|' \+ G\.S\.plies\)\.rng/.test(html) && /daily \? 'medium'/.test(html) && /daily \? 'bot'/.test(html),
      'the daily game is against the medium bot, which plays from the day\'s seed');
    const ids = ['cn-win', 'cn-hard', 'cn-all'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bcn: 'corners'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'cn-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'cn-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowUp/.test(html) && /C\.undoKey\(e\)/.test(html) && /C\.keyIs\(e, 'r'\)/.test(html) && /C\.keyIs\(e, 'f'\)/.test(html) && /e\.key === 'Tab'/.test(html) && !/dir === 'rtl'|isRtl|C\.rtl/.test(html),
      'arrows move the piece by the drawn board in every language, R, F and Tab go through the key helpers, undo through the core');
    ok(/cv\.width !== Math\.round\(W \* dpr\) \|\| cv\.height !== Math\.round\(H \* dpr\)/.test(html) && /document\.fonts\.ready/.test(html) && /ResizeObserver/.test(html),
      'the canvas backing follows both sides of its box, and redraws on resize and after fonts load (#359)');
    ok(/ch-fit/.test(html) && /--fit-ar/.test(html) && /ch-split/.test(html), 'the board uses the core layout');
    const boxRule = (html.match(/\.ch-fit > \.cn-box \{([^}]*)\}/) || [])[1];
    ok(boxRule !== undefined && !/(^|[\s;])(width|height)\s*:/.test(boxRule), 'the board slot takes its size from the core rule, never its own (#736)');
    ok(/\.cn-tray \{[^}]*overflow-y: auto/.test(html) && /\.cn-piece \{[^}]*min-height: 44px/.test(html) && /\.cn-piece \{[^}]*min-width: 44px/.test(html),
      'the tray scrolls when it is full and every piece in it is at least 44 px to tap');
    ok(/\.cn-drag \{[^}]*will-change: transform/.test(html) && /C\.ui\.reduceMotion\(\)/.test(html), 'a dragged piece gets its own layer, and motion follows the reduce-motion setting');
    ok(/\.cn-status \{[^}]*min-height: 48px/.test(html), 'the status row keeps its height, so the board never moves between taps');
    ok(!/localStorage|history\.pushState/.test(html), 'the page saves only through the core');
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
    ok(/C\.icon\('gear', 20\)/.test(html) && help.length > 0 && !/segmented|levelT|modeT/.test(help),
      'the options (players, level) sit behind a gear; help holds the rules and keys only');
    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'corners');
    ok(!!gm && gm.cat === 'board' && gm.people === 2 && list.filter((g) => g.id === 'corners').length === 1, 'Corner to Corner is listed once, as a board game for up to two players');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'corners');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    ok(!/blokus/i.test(html) && !!gm && !/blokus/i.test(JSON.stringify(gm)), 'the game never uses the trademarked name');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/corners/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X2 = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X2) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const P2 = lab(x), Q2 = lab(y); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && near[1] >= 15 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    // the two sides' squares must read on the empty cell in both themes, and their pattern
    // colour on the square itself, so the sides never rely on colour alone
    const ratio = (x, y) => { const p = lumC(x), q = lumC(y); return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05); };
    const tok = (k) => [...html.matchAll(new RegExp('--cn-' + k + ': (#[0-9A-Fa-f]{6})', 'g'))].map((m) => m[1]);
    const cell = tok('cell'), sa = tok('a'), sb = tok('b'), pa = tok('a-mark'), pb = tok('b-mark');
    ok(cell.length === 3 && sa.length === 3 && sb.length === 3 && pa.length === 3 && pb.length === 3 &&
      [0, 1, 2].every((k) => ratio(sa[k], cell[k]) >= 3 && ratio(sb[k], cell[k]) >= 3 && ratio(pa[k], sa[k]) >= 3 && ratio(pb[k], sb[k]) >= 3),
      'both sides reach 3:1 on the empty cell, and their marks 3:1 on their own squares, in the light and both dark rules');
    ok(/function markA\(/.test(html) && /function markB\(/.test(html), 'the two sides\' squares carry different marks (a dot and stripes)');
    ok(Date.now() - t0 < 3000, 'the Corner to Corner tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testCorners };
};
