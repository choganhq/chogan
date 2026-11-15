'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #905: Senet, the Egyptian race game, against a bot at three levels or two on one phone
  function testSenet() {
    head('Senet (#905)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/senet/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    if (!fs.existsSync(file)) return;
    const E = loadEngine('senet', 'SenetEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    // squares are 0-based in the engine: square 15 is index 14, square 26 is 25, and so on
    const sq = (n) => n - 1;
    // a position with the given squares (1-based) for each side; the rest are borne off
    const pos = (light, dark, turn, roll) => {
      const S = E.newGame();
      S.b = S.b.map(() => -1);
      light.forEach((n) => { S.b[sq(n)] = 0; });
      dark.forEach((n) => { S.b[sq(n)] = 1; });
      S.off = [5 - light.length, 5 - dark.length];
      S.turn = turn || 0; S.roll = roll || 0; S.plies = 10; S.throws = 10;
      return S;
    };
    const kind = (S, n, r) => { const d = E.dest(S, sq(n), r); return d ? d.kind + ':' + (d.to === E.OFF ? 'off' : d.to + 1) : 'none'; };

    // the start and the sticks
    const S0 = E.newGame();
    ok(E.N === 30 && E.PIECES === 5 && S0.b.slice(0, 10).join() === '0,1,0,1,0,1,0,1,0,1' && S0.b.slice(10).every((o) => o === -1) &&
      S0.turn === 0 && S0.roll === 0 && E.valid(S0), 'the pieces start on squares 1 to 10, light and dark in turn, and light moves first');
    const counts = [0, 0, 0, 0, 0, 0];
    for (let m = 0; m < 16; m++) counts[E.count([0, 1, 2, 3].map((b) => (m >> b) & 1))]++;
    ok(counts.join() === '0,4,6,4,1,1' && [1, 2, 3, 4, 5].every((r) => Math.abs(E.PROB[r] - counts[r] / 16) < 1e-12),
      'the 16 falls of four sticks give 1, 2, 3, 4 and 5 (none marked up) 4, 6, 4, 1 and 1 times, and the bot uses those odds');
    const R = rng(905), seen = [0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 16000; k++) seen[E.count(E.sticks(R))]++;
    ok([1, 2, 3, 4, 5].every((r) => Math.abs(seen[r] / 16000 - E.PROB[r]) < 0.015), 'thrown sticks follow those odds (' + seen.slice(1).join('/') + ' of 16000)');
    ok(E.count([0, 0, 0, 0]) === 5 && E.count([1, 1, 1, 1]) === 4 && E.count([1, 0, 0, 0]) === 1, 'no marked side up counts as 5');

    // moving, extra throws and passing
    const A = E.newGame();
    // in the opening row no piece has a neighbour of its own colour, so every dark piece is alone
    ok(E.setRoll(A, 1).passed === false && E.moves(A).join() === '0,2,4,6,8' && E.play(A, 8) && A.b[9] === 0 && A.b[8] === 1 && A.turn === 0 && A.roll === 0,
      'with a 1 every light piece can swap with the lone dark piece ahead of it, and a 1 throws again');
    const A2 = E.newGame();
    E.setRoll(A2, 2);
    ok(E.moves(A2).join() === '8' && E.play(A2, 8) && A2.b[10] === 0 && A2.turn === 1, 'a 2 moves one piece two squares and the turn passes');
    ok(!E.play(A2, 9) && A2.plies === 1, 'nothing moves before the sticks are thrown');
    const own = pos([3, 5], [20], 0, 2);
    ok(kind(own, 3, 2) === 'none' && kind(own, 5, 2) === 'step:7', 'a piece cannot land on a piece of its own colour');
    const pass = pos([28], [20], 0);
    ok(E.setRoll(pass, 1).passed === true && pass.turn === 1 && pass.roll === 0 && E.valid(pass), 'with no legal move the turn passes to the other player');
    const ex4 = pos([3], [20], 0, 4); E.play(ex4, sq(3));
    const ex5 = pos([3], [20], 0, 5); E.play(ex5, sq(3));
    const ex3 = pos([3], [20], 0, 3); E.play(ex3, sq(3));
    ok(ex4.turn === 0 && ex5.turn === 0 && ex3.turn === 1, 'a 4 or a 5 also gives another throw, a 3 does not');

    // swaps, protection and blocks
    const sw = pos([4], [7], 0, 3);
    const info = E.play(sw, sq(4));
    ok(info && info.kind === 'swap' && sw.b[sq(7)] === 0 && sw.b[sq(4)] === 1 && E.valid(sw), 'landing on a lone enemy piece swaps the two');
    const pair = pos([4], [7, 8], 0);
    ok(kind(pair, 4, 3) === 'none' && kind(pair, 4, 4) === 'none' && kind(pair, 4, 5) === 'step:9', 'two enemy pieces side by side protect each other, but may be passed');
    const block = pos([4], [6, 7, 8], 0);
    ok(kind(block, 4, 1) === 'step:5' && kind(block, 4, 5) === 'none', 'three enemy pieces in a row cannot be passed');
    const block2 = pos([4], [8, 9, 10], 0);
    ok(kind(block2, 4, 4) === 'none' && kind(block2, 4, 3) === 'step:7', 'a block of three cannot be landed on either');

    // the special squares
    const happy = pos([23], [5], 0);
    ok(kind(happy, 23, 3) === 'step:26' && kind(happy, 23, 4) === 'none' && kind(happy, 23, 5) === 'none', 'every piece must stop on square 26 (happiness)');
    const h26 = pos([26], [5], 0);
    ok(kind(h26, 26, 2) === 'step:28' && kind(h26, 26, 3) === 'step:29' && kind(h26, 26, 4) === 'step:30' && kind(h26, 26, 5) === 'off:off' && kind(h26, 26, 1) === 'water:27',
      'from 26 a 1 falls into the water on 27, 2 to 4 reach 28 to 30, and 5 bears the piece off');
    const wet = pos([26], [5], 0, 1); const wi = E.play(wet, sq(26));
    ok(wi && wi.kind === 'water' && wi.back === sq(15) && wet.b[sq(15)] === 0 && wet.b[sq(27)] === -1 && wet.wet[0] === 1 && E.valid(wet),
      'a piece in the water goes back to square 15, the house of rebirth');
    const wet2 = pos([26], [15, 14], 0, 1); E.play(wet2, sq(26));
    ok(wet2.b[sq(13)] === 0 && wet2.b[sq(15)] === 1 && wet2.b[sq(14)] === 1, 'with 15 taken, it goes to the nearest free square before it, and nobody is swapped');
    const ex = pos([28, 29, 30], [5], 0);
    ok(kind(ex, 28, 3) === 'off:off' && kind(ex, 28, 1) === 'none' && kind(ex, 28, 2) === 'none' && kind(ex, 29, 2) === 'off:off' && kind(ex, 29, 1) === 'none' &&
      kind(ex, 30, 1) === 'off:off' && kind(ex, 30, 2) === 'none', 'squares 28, 29 and 30 bear off only with exactly 3, 2 and 1');
    const safe = pos([26], [28], 0);
    ok(kind(safe, 26, 2) === 'none' && kind(pos([24], [26], 0), 24, 2) === 'none', 'a lone piece on squares 26 to 30 cannot be swapped');
    const win = pos([30], [3, 4], 0, 1);
    E.play(win, sq(30));
    ok(win.winner === 0 && win.off[0] === 5 && E.valid(win) && E.setRoll(win, 2) === null && !E.play(win, sq(3)), 'bearing off the fifth piece wins, and the game stops there');

    // the bots
    const all = pos([5, 12, 26], [8, 16, 20], 0, 2);
    ok(['easy', 'medium', 'hard'].every((l) => E.moves(all).indexOf(E.think(all, l, rng(3), 200)) >= 0), 'every level picks a legal move');
    const fin = pos([28, 13], [29, 16], 0, 3);
    // only medium is held to bearing off here: hard may rightly prefer the swap, since the
    // piece on 28 waits for a 3 either way
    ok(E.think(fin, 'medium', rng(4)) === sq(28), 'medium bears a piece off when it can');
    const dry = pos([26, 10], [3], 0, 1);
    ok(['medium', 'hard'].every((l) => E.think(dry, l, rng(4), 200) === sq(10)), 'medium and hard keep a piece out of the water when another move exists');
    // two moves: swap the dark piece on 14 back to 10, or step from 3 to 7
    const hit = pos([10, 3], [14, 22], 0, 4);
    ok(E.think(hit, 'hard', rng(5), 200) === sq(10) && E.think(hit, 'medium', rng(5)) === sq(10), 'medium and hard swap an enemy piece back');

    // bot against bot: every game ends, every state stays valid, and medium beats easy
    let ended = 0, sane = 0, wins = 0, longest = 0;
    const games = 12;
    for (let g = 0; g < games; g++) {
      const G = E.newGame(), Rg = rng(9050 + g), mediumSide = g % 2;
      let n = 0, good = true;
      while (G.winner < 0 && n < 3000) {
        E.setRoll(G, E.count(E.sticks(Rg)));
        if (G.roll) { const lv = G.turn === mediumSide ? 'medium' : 'easy'; if (!E.play(G, E.think(G, lv, Rg))) good = false; }
        if (!E.valid(G)) good = false;
        n++;
      }
      longest = Math.max(longest, n);
      if (G.winner >= 0) ended++;
      if (good) sane++;
      if (G.winner === mediumSide) wins++;
    }
    ok(ended === games && sane === games, 'all ' + games + ' seeded bot games end with a winner, and every state stays valid (longest ' + longest + ' throws)');
    ok(wins >= games * 0.75, 'medium beats easy in at least three games of four (' + wins + ' of ' + games + ')');
    // hard searches ahead within a time budget; it is timed on a busy middle game, not played out
    const mid = pos([3, 6, 9, 12, 17], [4, 7, 11, 13, 19], 1, 2);
    const th = Date.now(), hm = E.think(mid, 'hard', rng(6), 350), took = Date.now() - th;
    ok(E.moves(mid).indexOf(hm) >= 0 && took < 600, 'hard answers a busy middle game with a legal move inside its budget (' + took + ' ms)');

    // saves
    const V = pos([5, 12], [8, 16], 1, 0);
    ok(E.valid(V) && !E.valid(Object.assign(E.clone(V), { turn: 2 })) && !E.valid(Object.assign(E.clone(V), { off: [3, 4] })) &&
      !E.valid(Object.assign(E.clone(V), { b: V.b.slice(1) })) && !E.valid(Object.assign(E.clone(V), { winner: 0 })) &&
      !E.valid(Object.assign(E.clone(V), { roll: 7 })) && !E.valid(pos([28], [20], 0, 1)) && !E.valid(null),
      'a save is checked before it is restored (turn, piece count, size, winner, throw, a throw with no move left)');

    // the page
    ok(/C\.daily\('senet', G\.daily \+ '\|' \+ G\.S\.throws\)\.rng/.test(html) && /daily \? 'medium'/.test(html),
      'the daily game throws the day\'s sticks, the same for everyone, against the medium bot');
    const ids = ['snt-win', 'snt-hard', 'snt-dry'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bsnt: 'senet'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'snt-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'snt-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowRight/.test(html) && /C\.keyIs\(e, 't'\)/.test(html) && /direction: ltr/.test(html),
      'the arrows pick a piece, T throws through the core key helper, and the board is laid out the same way in every language');
    ok(/ch-fit/.test(html) && /--fit-ar/.test(html) && /ch-split/.test(html) && /min-aspect-ratio: 5 \/ 4/.test(html) && /\.ch-nocq \.ch-gamemain\.ch-wide/.test(html),
      'the board uses the core layout and lies on its side in a wide window');
    const boxRule = (html.match(/\.ch-fit > \.sn-box \{([^}]*)\}/) || [])[1];
    ok(boxRule !== undefined && !/(^|[\s;])(width|height)\s*:/.test(boxRule), 'the board slot takes its size from the core rule, never its own (#736)');
    ok(/\.sn-status \{[^}]*min-height: 48px/.test(html) && /\.sn-throw \{[^}]*min-height: 48px/.test(html),
      'the status row keeps its height, so the board never moves between taps, and the throw button is big enough to tap');
    ok(/C\.ui\.reduceMotion\(\)/.test(html) && /C\.ui\.fly\(/.test(html), 'pieces fly to their squares, and stay still when the system asks for less motion');
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 7 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close'];
    const ownKeys = (langs.fa || '').split(',');
    ok(ownKeys.length > 30 && ownKeys.every((k) => coreKeys.indexOf(k) < 0), 'no game string is named like a core string');
    const help = (html.match(/function showHelp\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
    ok(/C\.icon\('gear', 20\)/.test(html) && /C\.t\('levelT'\)/.test(html) && help.length > 0 && !/segmented|levelT|modeT/.test(help) && /rulesSrc/.test(help),
      'the options (players, bot level) sit behind a gear; help holds the rules, where they come from, and the keys');
    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'senet');
    ok(!!gm && gm.cat === 'board' && gm.people === 2 && list.filter((g) => g.id === 'senet').length === 1 && gm.added === '2026-11-15',
      'Senet is listed once, as a board game for up to two players');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'senet');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.existsSync(path.join(ROOT, 'www/games/senet/icon.svg')) ? fs.readFileSync(path.join(ROOT, 'www/games/senet/icon.svg'), 'utf8') : '';
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
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + (near[1] || 0).toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    // the two sides' pieces must read on a square in both themes: each piece has an edge
    // that reaches 3:1 on the square, since an ivory piece on a light square cannot
    const ratio = (a, b) => { const x = lumC(a), y = lumC(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const tok = (k) => [...html.matchAll(new RegExp('--sn-' + k + ': (#[0-9A-Fa-f]{6})', 'g'))].map((m) => m[1]);
    const cell = tok('sq'), e0 = tok('p0-edge'), e1 = tok('p1-edge');
    ok(cell.length === 3 && e0.length === 3 && e1.length === 3 && [0, 1, 2].every((k) => ratio(e0[k], cell[k]) >= 3 && ratio(e1[k], cell[k]) >= 3),
      'both sides\' piece edges reach 3:1 on a square in the light and both dark rules');
    ok(Date.now() - t0 < 3000, 'the Senet tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testSenet };
};
