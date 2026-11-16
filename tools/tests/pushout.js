'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #936: Push Out, marbles pushed off a hexagon board, against a bot at three levels or two on one phone
  function testPushOut() {
    head('Push Out (#936)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/pushout/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    if (!fs.existsSync(file)) return;
    const E = loadEngine('pushout', 'PushOutEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const at = E.at;

    // the board and the start
    const rows = {};
    for (let i = 0; i < E.CELLS; i++) rows[E.RR[i]] = (rows[E.RR[i]] || 0) + 1;
    ok(E.CELLS === 61 && Object.keys(rows).sort((a, b) => a - b).map((r) => rows[r]).join() === '5,6,7,8,9,8,7,6,5',
      'the board is a hexagon of 61 pits in rows of 5 to 9');
    ok(E.NB[at(0, 0)].every((n) => n >= 0) && E.NB[at(4, 0)].filter((n) => n < 0).length === 3 && E.NB[at(4, -2)].filter((n) => n < 0).length === 2,
      'a middle pit has six neighbours, a corner three, an edge pit four');
    const S = E.newGame(0);
    const count = (s, t) => s.cells.filter((c) => c === t).length;
    ok(count(S, 0) === 14 && count(S, 1) === 14 && S.turn === 0 && S.winner < 0 && S.lost.join() === '0,0' && E.valid(S),
      'each side starts with 14 marbles and black moves first');
    ok(E.newGame(1).turn === 1 && E.valid(E.newGame(1)), 'white may start instead');
    ok(E.moves(S).length === 44, 'the opening position has 44 legal moves (' + E.moves(S).length + ')');

    // move generation on hand-made boards
    const empty = () => new Array(E.CELLS).fill(-1);
    const put = (cells, list, t) => { list.forEach((p) => { cells[at(p[0], p[1])] = t; }); return cells; };
    const has = (list, c, d) => list.find((mv) => E.key(mv) === E.key({ c: c.map((p) => at(p[0], p[1])), d: d }));
    let b = put(empty(), [[0, 0]], 0);
    ok(E.genMoves(b, 0).length === 6 && E.genMoves(b, 0).every((mv) => !mv.side && mv.c.length === 1), 'a lone marble steps to any of its six neighbours');
    b = put(empty(), [[4, 0]], 0);
    ok(E.genMoves(b, 0).length === 3, 'a marble never moves itself off the board');
    b = put(empty(), [[0, 0], [1, 0]], 0);
    let L = E.genMoves(b, 0);
    ok(has(L, [[0, 0], [1, 0]], 0) && has(L, [[1, 0], [0, 0]], 3) && L.filter((mv) => mv.c.length === 2 && mv.side).length === 4,
      'two in a line move along their line either way, and sideways in the four other directions');
    b = put(put(empty(), [[0, 0], [1, 0]], 0), [[0, -1]], 1);
    L = E.genMoves(b, 0);
    ok(!L.some((mv) => mv.side && mv.c.length === 2 && mv.d === 2) && L.some((mv) => mv.side && mv.c.length === 2 && mv.d === 4),
      'a sideways move needs every pit it enters empty, and never pushes');
    b = put(empty(), [[-1, 0], [0, 0], [1, 0], [2, 0]], 0);
    ok(!E.genMoves(b, 0).some((mv) => mv.c.length > 3) && !has(E.genMoves(b, 0), [[-1, 0], [0, 0], [1, 0]], 0),
      'four marbles in a row cannot move together, and three cannot move into the fourth');
    // pushes: only by outnumbering, into an empty pit or over the edge
    b = put(put(empty(), [[-2, 0], [-1, 0]], 0), [[0, 0]], 1);
    let m = has(E.genMoves(b, 0), [[-2, 0], [-1, 0]], 0);
    ok(m && m.push === 1 && !m.off, 'two push one into an empty pit');
    b = put(put(empty(), [[-3, 0], [-2, 0], [-1, 0]], 0), [[0, 0], [1, 0]], 1);
    m = has(E.genMoves(b, 0), [[-3, 0], [-2, 0], [-1, 0]], 0);
    ok(m && m.push === 2 && !m.off, 'three push two');
    b = put(put(empty(), [[1, 0], [2, 0], [3, 0]], 0), [[4, 0]], 1);
    m = has(E.genMoves(b, 0), [[1, 0], [2, 0], [3, 0]], 0);
    ok(m && m.push === 1 && m.off, 'three push one over the edge');
    b = put(put(empty(), [[-1, 0], [0, 0]], 0), [[1, 0], [2, 0]], 1);
    ok(!has(E.genMoves(b, 0), [[-1, 0], [0, 0]], 0) && !has(E.genMoves(b, 0), [[0, 0]], 0), 'equal numbers do not push (two against two, one against one)');
    b = put(put(empty(), [[-2, 0], [-1, 0], [0, 0]], 0), [[1, 0], [2, 0], [3, 0]], 1);
    ok(!has(E.genMoves(b, 0), [[-2, 0], [-1, 0], [0, 0]], 0), 'three against three do not push');
    b = put(put(put(empty(), [[-2, 0], [-1, 0]], 0), [[0, 0]], 1), [[1, 0]], 0);
    ok(!has(E.genMoves(b, 0), [[-2, 0], [-1, 0]], 0), 'a push is refused when one of your own marbles sits behind theirs');
    b = put(put(empty(), [[-3, 0], [-2, 0], [-1, 0]], 0), [[0, 0], [1, 0], [2, 0]], 1);
    b[at(3, 0)] = 0;
    ok(!has(E.genMoves(b, 0), [[-3, 0], [-2, 0], [-1, 0]], 0), 'three cannot push three, even with room behind');

    // playing, pushing off and winning
    const mk = (c0, c1, lost, turn) => {
      const s = E.newGame(0);
      s.cells = put(put(empty(), c0, 0), c1, 1);
      s.lost = lost.slice(); s.turn = turn; s.first = 0; s.plies = turn;
      return s;
    };
    const filler = (n, rows2) => { const out = []; rows2.forEach((r) => { for (let q = -4; q <= 4 && out.length < n; q++) if (at(q, r) >= 0) out.push([q, r]); }); return out.slice(0, n); };
    let P = mk([[1, 0], [2, 0], [3, 0]].concat(filler(11, [4, 3])), [[4, 0]].concat(filler(8, [-4, -3])), [0, 5], 0);
    ok(E.valid(P), 'a hand-made board with five white marbles already off is a valid game');
    let f = E.play(P, { c: [at(1, 0), at(2, 0), at(3, 0)], d: 0 });
    ok(f && f.off && P.lost[1] === 6 && P.winner === 0 && count(P, 1) === 8 && P.cells[at(4, 0)] === 0 && E.valid(P),
      'pushing the sixth marble off wins, and the pushed-off count is kept');
    ok(!E.play(P, E.moves(E.newGame(0))[0]) && P.plies === 1, 'no move is played after the game is won');
    P = mk([[1, 0], [2, 0], [3, 0]].concat(filler(11, [4, 3])), [[4, 0]].concat(filler(9, [-4, -3])), [0, 4], 0);
    E.play(P, { c: [at(1, 0), at(2, 0), at(3, 0)], d: 0 });
    ok(P.lost[1] === 5 && P.winner < 0 && P.turn === 1 && E.valid(P), 'a fifth marble off is counted and the game goes on');
    ok(!E.play(P, { c: [at(0, 4)], d: 0 }) && P.turn === 1, 'a move the engine did not list is refused and the turn stays');

    // the move cap
    P = E.newGame(0);
    P.plies = E.MAX_PLIES - 2; P.turn = 0;
    ok(E.MAX_PLIES === 200 && E.valid(P), 'a game is capped at 200 moves');
    E.play(P, E.moves(P)[0]); E.play(P, E.moves(P)[0]);
    ok(P.plies === 200 && P.winner === 2 && E.valid(P), 'at the cap with equal marbles off, the game is a draw');
    P = mk([[1, 0], [2, 0], [3, 0]].concat(filler(9, [4, 3])), [[4, 0]].concat(filler(10, [-4, -3])), [2, 3], 0);
    P.plies = E.MAX_PLIES - 1; P.turn = 1; P.first = 0; P.plies = 199;
    P.turn = (P.first + P.plies) % 2;
    ok(E.valid(P), 'a hand-made board one move before the cap is valid');
    E.play(P, E.moves(P).find((mv) => !mv.push));
    ok(P.winner === 0, 'at the cap, whoever pushed off more wins');

    // saves
    const V = E.newGame(0); E.play(V, E.moves(V)[0]);
    const back = JSON.parse(JSON.stringify(V));
    ok(E.valid(back) && E.moves(back).length === E.moves(V).length && !!E.play(back, E.moves(back)[0]), 'a saved game reads back and plays on');
    ok(!E.valid(Object.assign(E.clone(V), { turn: 0 })) && !E.valid(Object.assign(E.clone(V), { plies: 2 })) &&
      !E.valid(Object.assign(E.clone(V), { cells: V.cells.slice(1) })) && !E.valid(Object.assign(E.clone(V), { lost: [1, 0] })) &&
      !E.valid(Object.assign(E.clone(V), { winner: 0 })) && !E.valid(null),
      'a save is checked before it is restored (turn, move count, size, marbles off, winner)');
    ok(/ctx\.autosave\(/.test(html) && /restore\(saved\.g\)/.test(html) && /E\.valid\(g\.S\)/.test(html) && /function act\([\s\S]*?save\(\);/.test(html),
      'the page saves after every move and restores a valid save on load');

    // the bot
    const K = mk([[1, 0], [2, 0], [3, 0]].concat(filler(11, [4, 3])), [[4, 0]].concat(filler(9, [-4, -3])), [0, 4], 0);
    ok(['medium', 'hard'].every((l) => { const mv = E.think(K, l, rng(3)); return mv && mv.off; }), 'medium and hard push a marble off when they can');
    let sane = 0, ended = 0;
    const game = (l0, l1, seed) => {
      const G = E.newGame(0), R = rng(seed);
      let good = true;
      while (G.winner < 0) {
        const mv = E.think(G, G.turn === 0 ? l0 : l1, R);
        if (!mv || !E.play(G, mv) || !E.valid(G)) { good = false; break; }
      }
      if (G.winner >= 0) ended++;
      if (good) sane++;
      return G;
    };
    // A hard game costs 1.4–3.3 s here (CI is ~3× slower), so the suite plays easy against
    // medium whole and times hard on one opening move
    const W = game('easy', 'medium', 936);
    ok(ended === 1 && sane === 1, 'an easy-against-medium game ends and every move keeps the game valid (' + W.plies + ' moves, ' + W.lost.join('–') + ' off)');
    ok(W.winner === 1, 'medium beats easy');
    const H = E.newGame(0);
    const th = Date.now(), hm = E.think(H, 'hard', rng(7)), slow = Date.now() - th;
    ok(hm && E.play(H, hm) && E.valid(H), 'hard opens with a legal move');
    ok(slow < 400, 'a hard move takes under 400 ms here (' + slow + ' ms), so a phone stays near a second');

    // the page
    ok(/C\.daily\('pushout', daily\)\.rng\(\)/.test(html) && /level: daily \? 'medium'/.test(html) && /C\.daily\('pushout', G\.daily \+ '\|' \+ G\.S\.plies\)\.rng/.test(html),
      'the daily game is against the medium bot, who starts and every bot move come from the day\'s seed');
    const ids = ['po-win', 'po-hard', 'po-clean'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bpo: 'pushout'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'po-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'po-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowUp/.test(html) && /C\.undoKey\(e\)/.test(html) && !/dir === 'rtl'|isRtl|C\.rtl/.test(html),
      'arrows move by the drawn board in every language (a canvas never flips), and undo goes through the core key helper');
    ok(/G\.mode === 'bot' \? \(isBot\(G\.S\.turn\) \? 1 : 2\) : 1/.test(html), 'against the bot one undo takes back the bot\'s reply and your move');
    ok(/cv\.width !== Math\.round\(W \* dpr\) \|\| cv\.height !== Math\.round\(H \* dpr\)/.test(html) && /document\.fonts\.ready/.test(html) && /ResizeObserver/.test(html),
      'the canvas backing follows both sides of its box, and redraws on resize and after fonts load (#359)');
    ok(/\.po-canvas \{[^}]*width: 100%; height: 100%/.test(html), 'the canvas is sized by CSS on both sides, so a high pixel ratio cannot double it (#919)');
    ok(/ch-fit/.test(html) && /--fit-ar/.test(html) && /ch-split/.test(html), 'the board uses the core layout');
    const boxRule = (html.match(/\.ch-fit > \.po-box \{([^}]*)\}/) || [])[1];
    ok(boxRule !== undefined && !/(^|[\s;])(width|height)\s*:/.test(boxRule), 'the board slot takes its size from the core rule, never its own (#736)');
    ok(/\.po-status \{[^}]*min-height: 52px/.test(html), 'the status row keeps its height, so the board never moves between taps');
    ok(/view = geo\(W, H\)/.test(html) && /function toUnit[\s\S]*?view \|\|/.test(html), 'a tap is read against the board last drawn');
    // strings: every language, the same keys, none named like a core key
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
    ok(/C\.icon\('gear', 20\)/.test(html) && /C\.t\('levelT'\)/.test(html) && help.length > 0 && !/segmented|levelT|firstT/.test(help),
      'the options (players, level, who starts) sit behind a gear; help holds the rules and keys only');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html), 'a new player sees the tutorial');
    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'pushout');
    ok(!!gm && gm.cat === 'board' && gm.people === 2 && list.filter((g) => g.id === 'pushout').length === 1, 'Push Out is listed once, as a board game for up to two players');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'pushout');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/pushout/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), fx = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * fx(Y) - 16, 500 * (fx(X) - fx(Y)), 200 * (fx(Y) - fx(Z))];
    };
    const dE = (a, c) => { const P2 = lab(a), Q2 = lab(c); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && near[1] >= 15 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 3000, 'the Push Out tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testPushOut };
};
