'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #904: Fourfold, sixteen pieces with four traits; the opponent picks the piece you place
  function testFourfold() {
    head('Fourfold (#904)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/fourfold/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    if (!fs.existsSync(file)) return;
    const E = loadEngine('fourfold', 'FourfoldEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');

    // the pieces and the lines
    ok(E.PIECES === 16 && E.TRAITS.join() === '1,2,4,8', 'there are sixteen pieces, each a set of four yes/no traits');
    ok(E.LINES.length === 10 && E.LINES.every((l) => l.length === 4) && new Set(E.LINES.map((l) => l.join())).size === 10, 'there are ten distinct lines of four');
    const want = ['0,1,2,3', '4,5,6,7', '8,9,10,11', '12,13,14,15', '0,4,8,12', '1,5,9,13', '2,6,10,14', '3,7,11,15', '0,5,10,15', '3,6,9,12'];
    ok(want.every((w) => E.LINES.some((l) => l.slice().sort((a, b) => a - b).join() === w)), 'they are the four rows, the four columns and both diagonals');
    ok(E.CELL_LINES[0].length === 3 && E.CELL_LINES[5].length === 3 && E.CELL_LINES[1].length === 2 && E.CELL_LINES[6].length === 3 && E.CELL_LINES[4].length === 2,
      'a corner or a diagonal cell lies on three lines, the others on two');

    // a line wins when all four pieces share a trait, present or absent, for each trait
    let traitsOk = 0;
    E.TRAITS.forEach((t) => {
      const have = [], lack = [];
      for (let p = 0; p < 16; p++) (p & t ? have : lack).push(p);
      if (E.shares(have.slice(0, 4)) && E.shares(lack.slice(0, 4)) && E.shares(have.slice(4, 8))) traitsOk++;
    });
    ok(traitsOk === 4, 'four pieces that all have a trait, or all lack it, share it, for every one of the four traits (' + traitsOk + '/4)');
    ok(!E.shares([0, 15, 3, 12]) && !E.shares([1, 2, 4, 8]) && !E.shares([0, 15, 6, 9]) && !E.shares([0, 1, 2]),
      'pieces with no trait in common, or fewer than four, do not make a line');

    // every line wins, placed in a real game
    let linesOk = 0;
    E.LINES.forEach((line) => {
      // pieces 0, 1, 2 and 3 all lack the round and hollow traits, so together they share
      const P = E.newGame(0);
      let good = true;
      for (let i = 0; i < 4; i++) if (!E.give(P, i) || !E.place(P, line[i])) good = false;
      const wl = E.winningLine(P.board);
      if (good && P.winner === 0 && wl && wl.slice().sort().join() === line.slice().sort().join() && E.valid(P)) linesOk++;
    });
    ok(linesOk === 10, 'filling any of the ten lines with pieces that share a trait wins the game, and the winning line is that line (' + linesOk + '/10)');

    // turn order: give, place, give, place...
    const S = E.newGame(0);
    ok(S.phase === 'give' && S.turn === 0 && S.hand === -1 && E.avail(S).length === 16 && E.valid(S), 'the first player starts by handing over a piece');
    ok(E.give(S, 9) && S.phase === 'place' && S.turn === 1 && S.hand === 9 && E.avail(S).length === 15 && E.valid(S), 'the other player then holds it and must place it');
    ok(!E.give(S, 4) && S.hand === 9, 'nobody gives a second piece before the first is placed');
    ok(E.place(S, 5) && S.board[5] === 9 && S.phase === 'give' && S.turn === 1 && S.hand === -1 && E.valid(S), 'after placing, the same player hands the next piece');
    ok(!E.give(S, 9) && !E.place(S, 6) && S.phase === 'give', 'a piece already on the board cannot be given, and nothing is placed without a piece in hand');
    E.give(S, 4);
    ok(!E.place(S, 5) && S.turn === 0 && S.hand === 4, 'a taken cell is refused and the turn stays');

    // a full board with no line is a draw
    // Find a line-free arrangement by shuffling with a fixed seed, then play it out piece by piece.
    const DR = rng(904);
    let drawBoard = null;
    for (let k = 0; k < 5000 && !drawBoard; k++) {
      const b = Array.from({ length: 16 }, (x, i) => i);
      for (let i = 15; i > 0; i--) { const j = Math.floor(DR() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; }
      if (!E.LINES.some((l) => E.shares(l.map((c) => b[c])))) drawBoard = b;
    }
    const D = E.newGame(0);
    let placedAll = !!drawBoard;
    for (let i = 0; drawBoard && i < 16; i++) if (!E.give(D, drawBoard[i]) || !E.place(D, i)) placedAll = false;
    ok(placedAll && D.draw && D.winner === -1 && E.valid(D) && !E.winningLine(D.board), 'a full board with no shared line ends as a draw');

    // winsAt finds the winning cells for a piece
    const B = E.newGame(0);
    B.board = [0, 2, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
    ok(E.winsAt(B.board, 6).join() === '3' && E.winsAt(B.board, 15).length === 0 && E.winsAt(B.board, 8).join() === '3',
      'the cell that completes a row is found for a piece that shares a trait, and none for one that shares nothing');

    // the bot: wins when it can, and medium and hard never hand over a winning piece when a safe one exists
    const W = E.newGame(1);
    W.board = [0, 2, 4, -1, 1, 13, 15, -1, -1, -1, -1, -1, -1, -1, -1, -1];
    W.plies = 2 * 6 + 1; W.hand = 6; W.phase = 'place'; W.turn = 0; W.first = 1;
    ok(E.valid(W), 'a hand-made position is valid');
    ok(['easy', 'medium', 'hard'].every((l) => { let hits = 0; for (let s = 1; s <= 5; s++) if (E.think(W, l, rng(s)).cell === 3) hits++; return l === 'easy' ? hits >= 1 : hits === 5; }),
      'medium and hard always place the piece where it wins, easy at least sometimes');
    const G = E.newGame(1);
    G.board = [0, 2, 4, -1, 1, 13, 15, 10, -1, -1, -1, -1, -1, -1, -1, -1];
    G.plies = 2 * 7 + 1; G.hand = 11; G.phase = 'place'; G.turn = 0; G.first = 0;
    ok(E.valid(G), 'a second hand-made position is valid');
    const safeGive = (st, mv) => { const c = E.clone(st); E.place(c, mv.cell); if (c.winner >= 0 || c.draw) return true; return E.winsAt(c.board, mv.give).length === 0; };
    ok(['medium', 'hard'].every((l) => [1, 2, 3, 4].every((s) => safeGive(G, E.think(G, l, rng(s))))), 'medium and hard never hand over a piece that wins at once when a safe one exists');

    // bot against bot: whole games end, every state is valid, and medium beats easy over a few seeds
    let ended = 0, sane = 0, slow = 0, medWins = 0, easyWins = 0;
    const play = (l0, l1, seed) => {
      const P = E.newGame(seed % 2), R = rng(seed);
      let good = true, n = 0;
      while (P.winner < 0 && !P.draw && n < 40) {
        const lv = P.turn === 0 ? l0 : l1, t = Date.now();
        if (P.phase === 'give') {
          const mv = E.think(P, lv, R);
          if (!E.give(P, mv.give)) good = false;
        } else {
          const mv = E.think(P, lv, R);
          if (!E.place(P, mv.cell)) good = false;
        }
        slow = Math.max(slow, Date.now() - t);
        if (!E.valid(P)) good = false;
        n++;
      }
      if (P.winner >= 0 || P.draw) ended++;
      if (good) sane++;
      return P.winner;
    };
    for (let s = 1; s <= 6; s++) {
      const medSide = s % 2;
      const w = play(medSide === 0 ? 'medium' : 'easy', medSide === 0 ? 'easy' : 'medium', 904 + s);
      if (w === medSide) medWins++; else if (w === 1 - medSide) easyWins++;
    }
    ok(ended === 6 && sane === 6, 'six bot games end with a winner or a draw, every move legal and every state valid (' + ended + ', ' + sane + ')');
    ok(medWins > easyWins, 'medium beats easy more often than it loses (' + medWins + ' to ' + easyWins + ')');
    // hard: one timed move from the hardest point (a midgame with many choices)
    const H = E.newGame(1), HR = rng(11);
    for (let k = 0; k < 7; k++) { const mv = E.think(H, 'easy', HR); if (H.phase === 'give') E.give(H, mv.give); else E.place(H, mv.cell); }
    const th = Date.now(), hm = E.think(H, 'hard', HR, { budget: 300 }), hardMs = Date.now() - th;
    const c2 = E.clone(H);
    ok((H.phase === 'place' ? E.place(c2, hm.cell) : E.give(c2, hm.give)) && E.valid(c2), 'hard answers a midgame position with a legal move');
    ok(hardMs < 600 && slow < 400, 'hard stays inside its time budget (' + hardMs + ' ms) and no easy or medium move takes over 400 ms (' + slow + ' ms)');

    // the daily position: the same for everyone, fair, and not already lost
    const dp = (s) => JSON.stringify(E.dailyPosition(rng(s)));
    const days = Array.from({ length: 30 }, (x, k) => E.dailyPosition(rng(k + 1)));
    ok(dp(20261115) === dp(20261115) && days.every((d) => E.valid(d) && d.phase === 'place' && d.turn === 0 && d.hand >= 0 && d.winner === -1 &&
      d.board.filter((x) => x >= 0).length === 4 && E.winsAt(d.board, d.hand).length === 0),
      'the daily position repeats for the same seed, has four pieces down and one in hand, and no line to take at once');

    // saves
    const V = E.newGame(0); E.give(V, 3); E.place(V, 7);
    ok(E.valid(V) && !E.valid(Object.assign(E.clone(V), { turn: 0 })) && !E.valid(Object.assign(E.clone(V), { plies: 5 })) &&
      !E.valid(Object.assign(E.clone(V), { board: V.board.slice(1) })) && !E.valid(Object.assign(E.clone(V), { hand: 7 })) &&
      !E.valid(Object.assign(E.clone(V), { board: V.board.map((x, i) => i === 8 ? 3 : x) })) && !E.valid(Object.assign(E.clone(V), { winner: 0 })) && !E.valid(null),
      'a save is checked before it is restored (turn, ply count, size, hand, duplicate pieces, winner)');

    // the page
    ok(/C\.daily\('fourfold', /.test(html) && /daily \? 'medium'/.test(html), 'the daily game opens from the day\'s seed against the medium bot');
    const ids = ['fo-win', 'fo-hard', 'fo-quick'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bfo: 'fourfold'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'fo-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'fo-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowUp/.test(html) && /C\.undoKey\(e\)/.test(html) && /C\.keyIs\(e, /.test(html) && /dir="ltr"|dir', 'ltr'|\.dir = 'ltr'/.test(html),
      'arrows move over grids drawn left to right in every language, and undo and letters go through the core key helpers');
    ok(/ch-fit/.test(html) && /--fit-ar/.test(html) && /ch-split/.test(html) && /min-aspect-ratio: 5 \/ 4/.test(html) && /ch-nocq/.test(html),
      'the board uses the core layout, lies beside the pieces in a wide window, and has the pixel twin for old WebViews');
    const boxRule = (html.match(/\.ch-fit > \.fo-box \{([^}]*)\}/) || [])[1];
    ok(boxRule !== undefined && !/(^|[\s;])(width|height)\s*:/.test(boxRule), 'the board slot takes its size from the core rule, never its own (#736)');
    ok(/\.fo-status \{[^}]*min-height: 48px/.test(html), 'the row the Give button appears in keeps its height, so the board never moves between taps');
    ok(/\.fo-slot \{[^}]*min-(width|height): 44px/.test(html) && /pointer-events: none/.test(html), 'tray slots are at least 44 px and the drawn pieces never take a tap');
    ok(/C\.ui\.reduceMotion\(\)/.test(html) && /C\.ui\.fly\(/.test(html), 'the handed piece flies into the hand, unless motion is reduced');
    ok(!/localStorage|pushState/.test(html.replace(/\/\*[\s\S]*?\*\//g, '')), 'the page uses the core store and never touches localStorage or history directly');
    ok(!/quarto/i.test(html) && !/quarto/i.test(JSON.stringify(T.games().find((g) => g.id === 'fourfold') || {})), 'the trademarked name appears nowhere in the game or its listing');
    // strings: every language, the same keys, none named like a core key
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 7 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close',
      'easy', 'medium', 'hard', 'you', 'cancel', 'confirm', 'start', 'hint', 'difficulty', 'draw'];
    const own = (langs.fa || '').split(',');
    ok(own.length > 30 && own.every((k) => coreKeys.indexOf(k) < 0), 'no game string is named like a core string');
    const help = (html.match(/function showHelp\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
    ok(/C\.icon\('gear', 20\)/.test(html) && /C\.t\('levelT'\)/.test(html) && help.length > 0 && !/segmented|levelT/.test(help),
      'the options (players, level) sit behind a gear; help holds the rules and keys only');
    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'fourfold');
    ok(!!gm && gm.cat === 'board' && gm.people === 2 && list.filter((g) => g.id === 'fourfold').length === 1, 'Fourfold is listed once as a board game for up to two players');
    ok(!!gm && gm.added === '2026-11-15' && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0),
      'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'fourfold');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/fourfold/icon.svg'), 'utf8');
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
    // light and dark pieces must both read on the board cell in every theme rule
    const ratio = (a, b) => { const x = lumC(a), y = lumC(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const tok = (k) => [...html.matchAll(new RegExp('--ff-' + k + ': (#[0-9A-Fa-f]{6})', 'g'))].map((m) => m[1]);
    const cell = tok('cell'), lightEdge = tok('le'), darkFace = tok('d');
    ok(cell.length === 3 && lightEdge.length === 3 && darkFace.length === 3 && [0, 1, 2].every((k) => ratio(lightEdge[k], cell[k]) >= 3 && ratio(darkFace[k], cell[k]) >= 3),
      'the light pieces\' outline and the dark pieces\' face reach 3:1 on the board cell in the light and both dark rules');
    ok(Date.now() - t0 < 3000, 'the Fourfold tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testFourfold };
};
