'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #908: Dicelands, a dice-war over a generated map of regions, against bots at three
  // levels or two on one phone
  function testDicelands() {
    head('Dicelands (#908)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/dicelands/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    if (!fs.existsSync(file)) return;
    const E = loadEngine('dicelands', 'DicelandsEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');

    // the hex grid: every cell has six neighbour slots, the ones off the grid are -1
    const at = (r, c) => r * E.COLS + c;
    ok(E.NB.length === E.CELLS && E.NB.every((l) => l.length === 6), 'every cell lists six neighbour slots');
    ok(E.NB.every((l, i) => l.every((j) => j < 0 || E.NB[j].indexOf(i) >= 0)), 'neighbours are mutual');
    const mid = at(10, 10);
    ok(E.NB[mid].every((j) => j >= 0) && E.NB[at(0, 0)].filter((j) => j >= 0).length <= 3, 'an inner cell has six neighbours, a corner at most three');

    // generated maps: connected, the right size, every side alike in regions and dice
    let good = 0, conn = 0, sized = 0, fair = 0, adjOk = 0, centred = 0, total = 0, smallest = 99;
    for (let s = 1; s <= 300; s++) {
      const sides = 2 + (s % 3), S = E.newGame(sides, rng(s * 7919));
      total++;
      if (E.valid(S)) good++;
      if (E.connected(S)) conn++;
      if (S.n >= 24 && S.n <= 32 && S.n % sides === 0) sized++;
      const cnt = [], dice = [];
      for (let k = 0; k < sides; k++) { cnt.push(0); dice.push(0); }
      for (let r = 0; r < S.n; r++) { cnt[S.owner[r]]++; dice[S.owner[r]] += S.dice[r]; }
      if (cnt.every((x) => x === cnt[0]) && dice.every((x) => x === dice[0]) && S.dice.every((d) => d >= 1 && d <= E.MAXD)) fair++;
      // adjacency must match the cells exactly
      let match = true;
      for (let i = 0; i < E.CELLS && match; i++) {
        const a = S.cells[i];
        if (a < 0) continue;
        E.NB[i].forEach((j) => { if (j >= 0 && S.cells[j] >= 0 && S.cells[j] !== a && S.adj[a].indexOf(S.cells[j]) < 0) match = false; });
      }
      if (match && S.adj.every((l, a) => l.every((b) => b !== a && S.adj[b].indexOf(a) >= 0))) adjOk++;
      const sizes = new Array(S.n).fill(0);
      S.cells.forEach((a) => { if (a >= 0) sizes[a]++; });
      smallest = Math.min(smallest, Math.min.apply(null, sizes));
      const cs = E.centers(S);
      if (cs.length === S.n && cs.every((c, a) => S.cells[c] === a)) centred++;
    }
    ok(total === 300, 'three hundred maps were generated');
    ok(good === total && conn === total, 'all ' + total + ' maps are valid and their regions form one connected land (' + conn + ')');
    ok(sized === total, 'every map has 24 to 32 regions, an equal share for each side (' + sized + ')');
    ok(fair === total, 'every side starts with as many regions and as many dice as each other side, 1 to 8 a region (' + fair + ')');
    ok(adjOk === total, 'the region neighbours match the cells, both ways (' + adjOk + ')');
    ok(smallest >= 4, 'no region is a sliver: the smallest has ' + smallest + ' cells');
    ok(centred === total, 'each region\'s dice sit on one of its own cells');
    const A = E.newGame(3, rng(42)), B = E.newGame(3, rng(42));
    ok(JSON.stringify(A) === JSON.stringify(B) && JSON.stringify(A) !== JSON.stringify(E.newGame(3, rng(43))), 'the same seed makes the same map, another seed another');

    // odds
    ok(Math.abs(E.pwin(2, 1) - 0.8380) < 0.002 && Math.abs(E.pwin(1, 1) - 0) < 1e-9 && Math.abs(E.pwin(3, 3) - 0.4535) < 0.003 && E.pwin(8, 1) > 0.999,
      'win odds come from the real dice sums (2 vs 1 ≈ 84%, 3 vs 3 ≈ 45%, ties to the defender)');
    ok(E.pwin(4, 3) > E.pwin(3, 3) && E.pwin(3, 4) < E.pwin(3, 3), 'more dice raise the odds, more defending dice lower them');

    // attacking
    const find = (S, side) => {
      for (let f = 0; f < S.n; f++) if (S.owner[f] === side) for (const t of S.adj[f]) if (S.owner[t] !== side) return [f, t];
      return null;
    };
    const S = E.newGame(2, rng(5));
    const [f, t] = find(S, 0);
    S.dice[f] = 1;
    ok(!E.legalAttack(S, f, t), 'a region with one die cannot attack');
    S.dice[f] = 5; S.dice[t] = 2;
    const far = S.adj[f].indexOf(S.n - 1) < 0 && S.owner[S.n - 1] === 1 ? S.n - 1 : -1;
    ok(E.legalAttack(S, f, t) && (far < 0 || !E.legalAttack(S, f, far)) && !E.legalAttack(S, t, f), 'an attack goes from your region with two or more dice to a touching enemy region, on your turn only');
    const W = E.clone(S);
    const rw = E.resolve(W, f, t, { a: [6, 6, 6, 6, 6], d: [1, 1] });
    ok(rw.win && W.owner[t] === 0 && W.dice[t] === 4 && W.dice[f] === 1 && E.valid(W), 'a win moves in with all dice but one and leaves one behind');
    const L = E.clone(S);
    const rl = E.resolve(L, f, t, { a: [1, 1, 1, 1, 1], d: [6, 6] });
    ok(!rl.win && L.owner[t] === 1 && L.dice[t] === 2 && L.dice[f] === 1 && E.valid(L), 'a loss leaves the attacker with one die and the defender untouched');
    const Ti = E.clone(S);
    ok(!E.resolve(Ti, f, t, { a: [2, 2, 1, 1, 1], d: [6, 1] }).win && Ti.owner[t] === 1, 'a tie goes to the defender');
    const R = E.clone(S), roll = E.roll(R, f, t, rng(9));
    ok(roll.a.length === 5 && roll.d.length === 2 && roll.a.concat(roll.d).every((x) => x >= 1 && x <= 6 && x === Math.floor(x)), 'each side rolls one six-sided die per die in its stack');

    // reinforcement: as many dice as the largest joined group, capped at 8 a region, the rest kept
    const G = E.newGame(2, rng(11));
    const grp = E.largestGroup(G, 0);
    ok(grp >= 1 && grp <= G.n / 2, 'the largest joined group of a side is counted (' + grp + ')');
    const before = G.dice.reduce((a, d, r) => a + (G.owner[r] === 0 ? d : 0), 0);
    const er = E.endTurn(G, rng(1));
    const after = G.dice.reduce((a, d, r) => a + (G.owner[r] === 0 ? d : 0), 0);
    ok(er.gain === grp && after - before + G.reserve[0] === grp && G.turn === 1 && E.valid(G), 'ending the turn adds dice equal to that group and passes the turn');
    const F = E.newGame(2, rng(12));
    for (let r = 0; r < F.n; r++) if (F.owner[r] === 0) F.dice[r] = 8;
    const fg = E.largestGroup(F, 0);
    E.endTurn(F, rng(2));
    ok(F.reserve[0] === fg && F.dice.every((d) => d <= 8), 'dice that do not fit (every region full at 8) go to the reserve');
    for (let r = 0; r < F.n; r++) if (F.owner[r] === 0) F.dice[r] = 1;
    F.turn = 0;
    const fg2 = E.largestGroup(F, 0), keep = F.reserve[0];
    E.endTurn(F, rng(3));
    ok(F.reserve[0] === 0 && F.dice.reduce((a, d, r) => a + (F.owner[r] === 0 ? d : 0), 0) === F.n / 2 + fg2 + keep, 'the reserve comes back as soon as there is room');

    // the last side standing wins; a side with no regions is skipped
    const K = E.newGame(3, rng(21));
    for (let r = 0; r < K.n; r++) if (K.owner[r] === 2) K.owner[r] = 1;
    K.turn = 1;
    E.endTurn(K, rng(4));
    ok(K.turn === 0 && !E.alive(K, 2), 'a side without regions is out and its turn is skipped');
    const Wn = E.newGame(2, rng(22));
    const [wf, wt] = find(Wn, 0);
    for (let r = 0; r < Wn.n; r++) Wn.owner[r] = 0;
    Wn.owner[wt] = 1; Wn.dice[wf] = 3; Wn.dice[wt] = 1;
    E.resolve(Wn, wf, wt, { a: [6, 6, 6], d: [1] });
    ok(Wn.winner === 0 && E.attacks(Wn).length === 0 && E.valid(Wn), 'taking the last enemy region wins, and nothing more can be played');

    // bots: legal moves, whole games end on fixed seeds, and the levels are ordered
    let slow = 0, ended = 0, sane = 0, capped = 0;
    const play = (sides, lv, seed) => {
      const P = E.newGame(sides, rng(seed)), Rr = rng(seed + 1);
      let guard = 0, okAll = true;
      while (P.winner < 0 && guard < 20000) {
        guard++;
        const ts = Date.now(), m = E.think(P, lv[P.turn], Rr);
        slow = Math.max(slow, Date.now() - ts);
        if (m) {
          if (!E.legalAttack(P, m[0], m[1])) { okAll = false; break; }
          E.attack(P, m[0], m[1], Rr);
        } else E.endTurn(P, Rr);
        if (!E.valid(P)) okAll = false;
      }
      if (P.winner >= 0) ended++;
      if (okAll) sane++;
      if (P.capped) capped++;
      return P.winner;
    };
    const games = [[2, ['medium', 'easy'], 101], [2, ['easy', 'medium'], 102], [3, ['medium', 'easy', 'easy'], 103], [4, ['hard', 'easy', 'medium', 'easy'], 104],
      [2, ['medium', 'medium'], 105], [3, ['easy', 'easy', 'easy'], 106]];
    const wins = games.map((g) => play(g[0], g[1], g[2]));
    ok(ended === games.length && sane === games.length, 'every bot game on fixed seeds ends with a winner, every move legal and every state valid (' + ended + '/' + games.length + ')');
    let mw = 0;
    for (let s = 0; s < 6; s++) if (play(2, s % 2 ? ['easy', 'medium'] : ['medium', 'easy'], 300 + s) === (s % 2 ? 1 : 0)) mw++;
    ok(mw >= 5, 'medium beats easy in at least five of six games (' + mw + '/6; ' + wins.join() + ')');
    // a turn cap ends a game that would drag on: the side with the most regions wins
    const Cp = E.newGame(2, rng(77));
    Cp.round = E.ROUND_CAP; Cp.turn = 1;
    const own0 = Cp.owner.filter((o) => o === 0).length;
    Cp.owner[Cp.owner.indexOf(1)] = 0;
    E.endTurn(Cp, rng(5));
    ok(Cp.winner === 0 && Cp.capped && own0 + 1 > Cp.n / 2 && E.valid(Cp), 'after ' + E.ROUND_CAP + ' rounds the side with the most regions wins (' + capped + ' of the bot games needed it)');
    // the hard bot weighs exposure; timed on a crowded four-side map
    const H = E.newGame(4, rng(808));
    for (let r = 0; r < H.n; r++) H.dice[r] = 1 + (r * 5) % 8;
    for (let k = 0; k < 3; k++) { const ts = Date.now(); E.think(H, 'hard', rng(k)); slow = Math.max(slow, Date.now() - ts); }
    ok(slow < 50, 'no bot decision takes more than 50 ms here (slowest ' + slow + ' ms), so a turn of many attacks stays quick on a phone');
    // easy and medium refuse a hopeless attack
    const Hp = E.newGame(2, rng(31));
    for (let r = 0; r < Hp.n; r++) Hp.dice[r] = Hp.owner[r] === 0 ? 2 : 8;
    ok(['easy', 'medium', 'hard'].every((l) => E.think(Hp, l, rng(1)) === null), 'no level attacks 2 dice into 8: it ends its turn');
    const Gd = E.newGame(2, rng(32));
    for (let r = 0; r < Gd.n; r++) Gd.dice[r] = Gd.owner[r] === 0 ? 1 : 2;
    const [gf] = find(Gd, 0);
    Gd.dice[gf] = 8;
    ok(['medium', 'hard'].every((l) => { const m = E.think(Gd, l, rng(2)); return m && m[0] === gf; }), 'medium and hard take an 8-dice attack into a weak neighbour');

    // the daily map is the same for everyone
    ok(JSON.stringify(E.newGame(4, rng(20261115))) === JSON.stringify(E.newGame(4, rng(20261115))), 'the daily map repeats for the same seed');

    // saves
    const V = E.newGame(3, rng(55));
    ok(E.valid(V) && !E.valid(Object.assign(E.clone(V), { turn: 3 })) && !E.valid(Object.assign(E.clone(V), { dice: V.dice.map(() => 9) })) &&
      !E.valid(Object.assign(E.clone(V), { owner: V.owner.slice(1) })) && !E.valid(Object.assign(E.clone(V), { winner: 0 })) &&
      !E.valid(Object.assign(E.clone(V), { cells: V.cells.map(() => 0) })) && !E.valid(null),
      'a save is checked before it is restored (turn, dice, sizes, winner, map)');

    // the page
    ok(/C\.daily\('dicelands', daily\)\.rng/.test(html) && /daily \? 'medium'/.test(html) && /daily \? 4/.test(html),
      'the daily game opens a map from the day\'s seed, four sides against medium bots');
    ok(/C\.cards\.speedRow\(\)/.test(html) && /C\.cards\.pace\(/.test(html), 'the bots\' pace follows the shared Slow/Normal/Fast setting');
    ok(/C\.ui\.reduceMotion\(\)/.test(html), 'reduced motion is respected');
    const ids = ['dl-win', 'dl-hard', 'dl-crowd'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bdl: 'dicelands'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'dl-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'dl-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowUp/.test(html) && /C\.keyIs\(e, 'e'\)/.test(html) && !/dir === 'rtl'|isRtl|C\.rtl/.test(html),
      'arrows move by the drawn map in every language (a canvas never flips), E ends the turn through the core key helper');
    ok(/cv\.width !== Math\.round\(W \* dpr\) \|\| cv\.height !== Math\.round\(H \* dpr\)/.test(html) && /document\.fonts\.ready/.test(html) && /ResizeObserver/.test(html),
      'the canvas backing follows both sides of its box, and redraws on resize and after fonts load (#359)');
    ok(/ch-fit/.test(html) && /--fit-ar/.test(html) && /ch-split/.test(html) && /min-aspect-ratio: 5 \/ 4/.test(html), 'the map uses the core layout and moves beside the panel in a wide window');
    const boxRule = (html.match(/\.ch-fit > \.dl-box \{([^}]*)\}/) || [])[1];
    ok(boxRule !== undefined && !/(^|[\s;])(width|height)\s*:/.test(boxRule), 'the map slot takes its size from the core rule, never its own (#736)');
    ok(/\.dl-status \{[^}]*min-height: 48px/.test(html), 'the row the dice rolls appear in keeps its height, so the map never moves between taps');
    // strings
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
    ok(/C\.icon\('gear', 20\)/.test(html) && /C\.t\('botsT'\)/.test(html) && help.length > 0 && !/segmented|botsT|speedRow/.test(help),
      'the options (players, bots, level, speed) sit behind a gear; help holds the rules and keys only');
    // side colours: four distinct fills that the dice read on, plus a pattern each
    const ratio = (a, b) => { const lc = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); const x = lc(a), y = lc(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const tokens = (k) => [...html.matchAll(new RegExp('--dl-' + k + ': (#[0-9A-Fa-f]{6})', 'g'))].map((m) => m[1]);
    const ink = tokens('ink'), fills = [0, 1, 2, 3].map((k) => tokens('f' + k));
    ok(ink.length === 3 && fills.every((x) => x.length === 3) && [0, 1, 2].every((k) => fills.every((x) => ratio(x[k], ink[k]) >= 3)),
      'the region numbers read at 3:1 on every side\'s fill, in the light and both dark rules');
    ok(/PATTERNS/.test(html) && /stripes/.test(html) && /dots/.test(html), 'each side carries its own pattern as well as a colour, so sides never differ by colour alone');
    // listing and colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'dicelands');
    ok(!!gm && gm.cat === 'board' && gm.people === 2 && list.filter((g) => g.id === 'dicelands').length === 1, 'Dicelands is listed once as a board game for up to two players');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'dicelands');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/dicelands/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), fq = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * fq(Y) - 16, 500 * (fq(X) - fq(Y)), 200 * (fq(Y) - fq(Z))];
    };
    const dE = (a, b) => { const P2 = lab(a), Q2 = lab(b); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && near[1] >= 15 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 3000, 'the Dicelands tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testDicelands };
};
