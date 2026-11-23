'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #1062: Hillside, chiefs and three kinds of soldier on a mirrored 7 × 7 height map
  function testHillside() {
    head('Hillside (#1062)');
    const t0 = Date.now();
    // no early return when the game is missing: loadEngine throws, and a thrown group fails the run
    const file = path.join(ROOT, 'www/games/hillside/index.html');
    const E = loadEngine('hillside', 'HillsideEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const { CHIEF: C1, CLIMBER: CL, RUNNER: RU, JUMPER: JU, N, NN } = E;
    const at = (r, c) => r * N + c;
    const set = (list) => list.slice().sort((a, b) => a - b).join();
    const K = (t) => 8 + t;
    // a position on a hand-made map: heights from a { cell: height } table (0 elsewhere), pieces from [cell, code]
    const mk = (hs, pieces, turn) => {
      const S = E.newGame(1);
      const h = new Array(NN).fill(0);
      Object.keys(hs).forEach((k) => { h[k] = hs[k]; });
      S.h = h; S.dist = E.hillDist(h); S.b = new Array(NN).fill(0);
      pieces.forEach((p) => { S.b[p[0]] = p[1]; });
      S.turn = turn || 0;
      return S;
    };

    // the start
    const S0 = E.newGame(12345);
    const mine = (S, s) => S.b.map((p, i) => [p, i]).filter((x) => x[0] && E.sideOf(x[0]) === s);
    ok(mine(S0, 0).length === 8 && mine(S0, 1).length === 8 && S0.b[E.HILL[0]] === C1 && S0.b[E.HILL[1]] === K(C1) && S0.turn === 0 && S0.winner === -1,
      'each side starts with eight pieces, its chief on its own hilltop, and the bottom side moves first');
    ok(S0.b.every((p, i) => (p ? (E.sideOf(p) === 0 ? S0.b[NN - 1 - i] === p + 8 : S0.b[NN - 1 - i] === p - 8) : !S0.b[NN - 1 - i])),
      'the two armies stand as mirror images of each other');
    ok(E.moves(S0).length > 8, 'the first player has a real choice of moves (' + E.moves(S0).length + ')');

    // the chief: one step any way, never up or down more than one level
    const cHs = { [at(3, 3)]: 1, [at(2, 3)]: 3, [at(3, 4)]: 3, [at(3, 2)]: 2, [at(2, 2)]: 0, [at(4, 4)]: 1 };
    const cS = mk(cHs, [[at(3, 3), C1]]);
    ok(set(E.targets(cS, at(3, 3))) === set([at(2, 2), at(2, 4), at(3, 2), at(4, 2), at(4, 3), at(4, 4)]),
      'the chief steps one cell in any of eight directions, but not up a cliff of two levels');
    const cS2 = mk({ [at(3, 3)]: 3 }, [[at(3, 3), C1]]);
    ok(E.targets(cS2, at(3, 3)).length === 0, 'a chief on a lone peak three levels above its neighbours cannot climb down');

    // the climber: one straight step, any height
    const clS = mk(cHs, [[at(3, 3), CL], [at(4, 3), CL]]);
    ok(set(E.targets(clS, at(3, 3))) === set([at(2, 3), at(3, 4), at(3, 2)]), 'the climber steps one cell straight, up or down any height, never onto its own side');
    ok(E.targets(clS, at(3, 3)).indexOf(at(2, 2)) < 0, 'the climber never moves diagonally');

    // the runner: slides straight while each step is at most one level, stops at a piece
    const rHs = { [at(3, 3)]: 1, [at(3, 2)]: 1, [at(3, 4)]: 2, [at(3, 5)]: 0, [at(3, 6)]: 0 };
    const rS = mk(rHs, [[at(3, 3), RU], [at(1, 3), K(CL)], [at(5, 3), CL]]);
    ok(set(E.targets(rS, at(3, 3))) === set([at(3, 2), at(3, 1), at(3, 0), at(3, 4), at(2, 3), at(1, 3), at(4, 3)]),
      'the runner slides any distance straight, stops before a two-level step, takes the first enemy and stops short of a friend');

    // the jumper: exactly two cells in any of eight directions, over anything, any height
    const jS = mk({ [at(1, 3)]: 3, [at(2, 3)]: 3 }, [[at(3, 3), JU], [at(2, 3), K(C1)], [at(1, 1), JU], [at(1, 5), K(RU)]]);
    ok(set(E.targets(jS, at(3, 3))) === set([at(1, 3), at(5, 3), at(3, 1), at(3, 5), at(1, 5), at(5, 1), at(5, 5)]),
      'the jumper leaps exactly two cells in eight directions, over pieces and heights, onto an enemy but never a friend');

    // moving the other side's piece, or out of turn, is refused
    const lS = mk({}, [[at(3, 3), CL], [at(0, 0), K(CL)], [at(6, 6), C1], [at(0, 6), K(C1)]]);
    ok(!E.play(lS, [at(0, 0), at(0, 1)]) && !E.play(lS, [at(3, 3), at(2, 2)]) && E.play(lS, [at(3, 3), at(2, 3)]) && lS.turn === 1 && lS.winner === -1,
      'only the side to move moves, and only to a target its piece allows');

    // the ends: capture the chief, reach the other hilltop, leave the other side stuck, or run out of plies
    const w1 = mk({}, [[at(3, 3), CL], [at(2, 3), K(C1)], [at(6, 6), C1]]);
    ok(E.play(w1, [at(3, 3), at(2, 3)]) && w1.winner === 0 && w1.how === 'chief' && E.moves(w1).length === 0, 'taking the other chief wins and the game stops');
    const hillH = { [E.HILL[1]]: 3, [E.HILL[1] + 7]: 2, [E.HILL[0]]: 3 };
    const w2 = mk(hillH, [[E.HILL[1] + 7, C1], [at(3, 0), K(C1)], [at(3, 6), K(CL)]]);
    ok(E.play(w2, [E.HILL[1] + 7, E.HILL[1]]) && w2.winner === 0 && w2.how === 'hill', 'a chief that steps onto the other side\'s hilltop wins');
    const w3 = mk(hillH, [[E.HILL[1] + 7, CL], [at(6, 6), C1], [at(3, 0), K(C1)]]);
    ok(E.play(w3, [E.HILL[1] + 7, E.HILL[1]]) && w3.winner === -1, 'any other piece on the hilltop does not win');
    const w3b = mk(hillH, [[E.HILL[0] - 1, C1], [at(3, 0), K(C1)]]);
    w3b.h[E.HILL[0] - 1] = 2;
    ok(E.play(w3b, [E.HILL[0] - 1, E.HILL[0]]) && w3b.winner === -1, 'a chief back on its own hilltop does not win');
    const w4 = mk({ [at(0, 1)]: 2, [at(1, 0)]: 2, [at(1, 1)]: 2 }, [[at(0, 0), K(C1)], [at(6, 6), C1], [at(5, 5), CL]], 0);
    ok(E.play(w4, [at(5, 5), at(4, 5)]) && w4.winner === 0 && w4.how === 'stuck', 'a side left with no move loses');
    const w5 = mk({}, [[at(6, 6), C1], [at(0, 0), K(C1)]]);
    w5.plies = E.CAP - 1;
    ok(E.play(w5, [at(6, 6), at(5, 5)]) && w5.winner === 2 && w5.how === 'cap', 'a game that reaches ' + E.CAP + ' plies is a draw');
    ok(!E.play(w1, [at(6, 6), at(5, 5)]), 'no move is accepted once the game is over');

    // the maps: many seeds, each mirrored, using every height, and connected for every piece.
    // Connectivity is computed here again, not with the engine's own reach(), so a broken reach() cannot pass it.
    const nb = (i, ds) => ds.map((d) => [Math.floor(i / N) + d[0], i % N + d[1]]).filter((x) => x[0] >= 0 && x[0] < N && x[1] >= 0 && x[1] < N).map((x) => at(x[0], x[1]));
    const K8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]], O4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const J8 = K8.map((d) => [d[0] * 2, d[1] * 2]);
    const flood = (h, type, from) => {
      const seen = new Set([from]), q = [from];
      while (q.length) {
        const a = q.shift();
        nb(a, type === C1 ? K8 : type === JU ? J8 : O4).forEach((k) => {
          if (seen.has(k)) return;
          if ((type === C1 || type === RU) && Math.abs(h[k] - h[a]) > 1) return;
          seen.add(k); q.push(k);
        });
      }
      return seen;
    };
    let maps = 0, notMirror = 0, badRange = 0, noHill = 0, notAllHeights = 0, chiefCut = 0, pieceCut = 0, fallbacks = 0;
    const distinct = new Set();
    for (let seed = 1; seed <= 400; seed++) {
      const S = E.newGame(seed * 7919), h = S.h;
      maps++;
      distinct.add(h.join(''));
      if (h.join() === E.FALLBACK.join()) fallbacks++;
      if (h.some((v, i) => v !== h[NN - 1 - i])) notMirror++;
      if (h.length !== NN || h.some((v) => v !== (v | 0) || v < 0 || v > 3)) badRange++;
      if (h[E.HILL[0]] !== 3 || h[E.HILL[1]] !== 3) noHill++;
      if ([0, 1, 2, 3].some((v) => h.filter((x) => x === v).length < 5)) notAllHeights++;
      if (!flood(h, C1, E.HILL[0]).has(E.HILL[1]) || !flood(h, C1, E.HILL[1]).has(E.HILL[0])) chiefCut++;
      // every starting piece of either side can get to the other side's two home rows
      for (let i = 0; i < NN; i++) {
        const p = S.b[i];
        if (!p) continue;
        const r = flood(h, E.typeOf(p), i), far = E.sideOf(p) === 0 ? [0, 13] : [35, 48];
        let reached = false;
        for (let k = far[0]; k <= far[1]; k++) if (r.has(k)) { reached = true; break; }
        if (!reached) pieceCut++;
      }
    }
    ok(maps === 400, 'the map test ran over ' + maps + ' seeds');
    ok(notMirror === 0 && badRange === 0 && noHill === 0, 'every map is its own point reflection, uses heights 0–3 only and has both hilltops at 3 (' + [notMirror, badRange, noHill].join('/') + ' wrong)');
    ok(notAllHeights === 0, 'every map uses each of the four heights on at least five cells');
    ok(chiefCut === 0, 'on every map each chief can walk to the other hilltop (' + chiefCut + ' cut off)');
    ok(pieceCut === 0, 'on every map every starting piece of both sides can reach the other side (' + pieceCut + ' cut off)');
    ok(fallbacks === 0 && distinct.size > 390, 'the generator makes its own map for every seed, almost all different (' + distinct.size + ' distinct, ' + fallbacks + ' fallbacks)');
    ok(E.valid(E.FALLBACK) && E.symmetric(E.FALLBACK), 'the fallback map passes the same checks');
    ok(E.newGame(42).h.join() === E.newGame(42).h.join() && E.newGame(42).h.join() !== E.newGame(43).h.join(), 'the same seed always gives the same map, so the daily map is the same for everyone');
    // the checker refuses unfair and cut-off maps
    const broken = E.FALLBACK.slice(); broken[0] = (broken[0] + 1) % 4;
    const walled = E.FALLBACK.slice();
    [at(1, 0), at(1, 1), at(1, 2), at(1, 4), at(1, 5), at(1, 6), at(0, 2), at(0, 4)].forEach((k) => { walled[k] = 0; walled[NN - 1 - k] = 0; });
    ok(!E.valid(broken) && !E.valid(walled) && !E.valid(null), 'the map checker refuses a lopsided map and one whose hilltop is walled off by cliffs');

    // the bot: every level takes a win in one, plays only legal moves, and games end
    const wb = mk({}, [[at(3, 3), CL], [at(2, 3), K(C1)], [at(6, 6), C1], [at(0, 6), K(RU)]]);
    ok(E.LEVELS.join() === 'easy,medium,hard' && E.LEVELS.every((lv) => [1, 2].every((s) => { const m = E.think(wb, lv, rng(s), 200); const n = E.clone(wb); return E.play(n, m) && n.winner === 0; })),
      'every bot level takes a win that is one move away');
    const guard = mk({}, [[at(5, 3), C1], [at(3, 3), K(RU)], [at(6, 0), CL], [at(0, 0), K(C1)]], 0);
    const gm = E.think(guard, 'medium', rng(3));
    const gn = E.clone(guard); E.play(gn, gm);
    ok(!E.moves(gn).some((m) => { const x = E.clone(gn); E.apply(x, m); return x.winner === 1; }), 'the medium bot does not leave its chief to be taken next move');
    let bm = 0, badBot = 0, ends = 0, slowest = 0, wins = [0, 0, 0];
    // seeds picked for short games: CI runs about three times slower than this laptop
    const games = [['medium', 'easy', 11], ['easy', 'medium', 12], ['medium', 'easy', 13], ['easy', 'medium', 14], ['medium', 'medium', 17], ['medium', 'medium', 19]];
    games.forEach(([l0, l1, seed]) => {
      const R = rng(seed), P = E.newGame(seed * 101), g0 = Date.now();
      while (P.winner < 0) {
        const m = E.think(P, P.turn ? l1 : l0, R);
        if (!E.play(P, m)) { badBot++; break; }
        bm++;
      }
      slowest = Math.max(slowest, Date.now() - g0);
      if (P.winner >= 0) { ends++; wins[P.winner]++; }
    });
    ok(ends === games.length && badBot === 0 && bm > 20, 'bot games finish with only legal moves (' + games.length + ' games, ' + bm + ' moves)');
    ok(slowest < 300, 'each bot game takes well under a second (slowest ' + slowest + ' ms)');
    const H = E.newGame(777), RH = rng(77);
    let hardMax = 0;
    for (let i = 0; i < 2 && H.winner < 0; i++) {
      const t1 = Date.now(), m = E.think(H, 'hard', RH, 300);
      hardMax = Math.max(hardMax, Date.now() - t1);
      if (!E.play(H, m)) badBot++;
    }
    ok(badBot === 0 && hardMax < 700, 'the hard bot plays legal moves within its time budget (slowest ' + hardMax + ' ms for 300 ms)');

    // playable: the medium bot beats one that moves at random from either side, on many maps, and
    // games end by a real win, not the ply cap
    let mWins = 0, rGames = 0, capped = 0, byHill = 0, byChief = 0;
    for (let g = 0; g < 8; g++) {
      const R = rng(900 + g), P = E.newGame(5000 + g), side = g % 2;
      while (P.winner < 0) {
        const ms = E.moves(P);
        E.apply(P, P.turn === side ? E.think(P, 'medium', R) : ms[Math.floor(R() * ms.length)]);
      }
      rGames++;
      if (P.winner === side) mWins++;
      if (P.how === 'cap') capped++;
      if (P.how === 'hill') byHill++;
      if (P.how === 'chief') byChief++;
    }
    ok(rGames === 8 && mWins >= 7 && capped === 0, 'the medium bot beats random play from either side (' + mWins + ' of ' + rGames + ', ' + byChief + ' by the chief, ' + byHill + ' by the hill)');
    ok(wins[0] > 0 && wins[1] > 0, 'either side can win a bot game, so the map does not hand it to one side (' + wins.join('/') + ')');

    // saves: the map seed and the moves, replayed and checked on load
    ok(/ctx\.autosave\(/.test(html) && /ctx\.store\./.test(html) && !/localStorage/.test(html) && /validSave\(saved\)/.test(html) && /E\.play\(S, \[m\[0\], m\[1\]\]\)/.test(html),
      'progress is saved through the core as seed and moves, and replayed move by move before an unfinished game resumes');

    // the page
    const aw = ['hs-win', 'hs-hard', 'hs-flag'];
    ok(aw.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bhs: 'hillside'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, i) => {
        if (!/id: 'hs-/.test(l)) return;
        if (!titles[i]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[i]).length > 1) dupes.push(lang + ':' + titles[i]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'hs-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/C\.daily\('hillside', daily\)\.rng\(\)/.test(html) && /C\.stats\.daily\('hillside'/.test(html) && /G\.daily \? C\.daily\('hillside', G\.daily \+ '\|' \+ G\.S\.plies\)\.rng/.test(html) && /level: daily \? 'medium'/.test(html),
      'the daily map is seeded by the day, played against the medium bot, and the bot\'s choices are seeded too');
    ok(/cv\.width !== Math\.round\(W \* dpr\) \|\| cv\.height !== Math\.round\(H \* dpr\)/.test(html) && /document\.fonts\.ready\.then\(draw\)/.test(html) && /ResizeObserver/.test(html) && /\.hs-canvas \{[^}]*width: 100%; height: 100%/.test(html),
      'the canvas fills its box, its backing follows both sides of the box, and it redraws when the font arrives');
    ok(/ArrowRight/.test(html) && /e\.key === 'Enter'/.test(html) && /e\.key === 'Escape'/.test(html) && /C\.undoKey\(e\)/.test(html),
      'the arrows move the cursor, Enter or Space taps, Esc lets go, U or Ctrl+Z undoes');
    ok(!/dir\s*===?\s*'rtl'|C\.rtl|isRtl/.test(html.slice(html.indexOf('function cellAt'), html.indexOf('function cellAt') + 600)) && /NN - 1 - cur/.test(html),
      'the board is never mirrored for a right-to-left language; it turns round only when you take the top side against the bot');
    ok(/sameMap/.test(html) && /seed: G\.S\.seed, human:/.test(html) && /C\.t\('newMap'\)/.test(html), 'a new map and the same map with sides swapped are both offered');
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {}, blocks = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) { blocks[m[1]] = blk; langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((x) => x.slice(0, -3)).sort().join(); } });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 10 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    // a name can be «you»: no third-person verb straight after it
    ok(!!blocks.de && !!blocks.es && !/\{[an]\} (ist|gewinnt|würfelt|kann|hat|passt|zieht)\b/.test(blocks.de) &&
      !/\{[an]\} (gana|pierde|es|está|tiene|puede|juega|tira|mueve|pasa|empieza|lleva)\b/.test(blocks.es),
      'German and Spanish strings put no third-person verb right after a name that can be «you»');
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
    const g = list.find((x) => x.id === 'hillside');
    ok(!!g && g.cat === 'board' && g.people === 2 && list.filter((x) => x.id === 'hillside').length === 1 && g.added === '2026-11-23',
      'Hillside is listed once, as a board game for two on one phone');
    ok(!!g && LOCALE_CODES.every((l) => g.name[l] && g.summary[l] && html.indexOf(l + ": '" + g.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((x) => x.id !== 'hillside');
    ok(!!g && LOCALE_CODES.every((l) => others.every((x) => x.name[l].toLowerCase() !== g.name[l].toLowerCase())), 'no other game has the same name in any language');
    const iconFile = path.join(ROOT, 'www/games/hillside/icon.svg');
    const icon = fs.existsSync(iconFile) ? fs.readFileSync(iconFile, 'utf8') : '';
    ok(!!g && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + g.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (q) => q <= 0.04045 ? q / 12.92 : Math.pow((q + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map(lin).reduce((s, q, i) => s + q * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const P2 = lab(x), Q2 = lab(y); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const nearest = (pool) => g && pool.length ? pool.map((x) => [x.id, dE(x.color, g.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    const nBoard = nearest(others.filter((x) => x.cat === 'board')), nAll = nearest(others);
    ok(!!g && nBoard[1] >= 15 && nAll[1] >= 8 && 1.05 / (lumC(g.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + g.color + "'") > 0,
      'the accent differs by ΔE ≥ 15 from every board game (nearest ' + nBoard[0] + ', ' + (nBoard[1] || 0).toFixed(1) + ') and ≥ 8 from all others (nearest ' + nAll[0] + ', ' + (nAll[1] || 0).toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    // every store description names the game and stays inside Play's 4000 characters
    const fl = path.join(ROOT, 'fastlane/metadata/android');
    const descs = fs.readdirSync(fl).map((d) => path.join(fl, d, 'full_description.txt')).filter((f) => fs.existsSync(f));
    const lacking = descs.filter((f) => { const tx = fs.readFileSync(f, 'utf8'); return !g || !Object.keys(g.name).some((l) => tx.indexOf('* ' + g.name[l] + ' ') >= 0) || [...tx].length > 4000; });
    ok(descs.length >= 10 && lacking.length === 0, 'every store description lists the game and stays within 4000 characters (' + (lacking.map((f) => path.basename(path.dirname(f))).join(', ') || 'all ' + descs.length + ' fine') + ')');
    ok(Date.now() - t0 < 6000, 'the Hillside tests finish in under 6 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testHillside };
};
