'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;
  // #1079: sew tiles cut into four triangles so touching sides match, close patches to score
  function testQuilt() {
    const games = T.games();
    head('Quilt (#1079)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/quilt/index.html');
    ok(fs.existsSync(file), 'the Quilt page exists');
    const E = loadEngine('quilt', 'QuiltEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(JSON.stringify(E.SIZES) === '[5,6]' && E.DAILY_N === 6 && E.TRAY === 3 && E.K === 3 && E.SWAPS === 3, 'two sizes, 5 and 6, a 6×6 daily quilt, three tiles in the tray, three colours and three swaps');

    // The rules written again here, apart from the engine: a tile [N, E, S, W] fits at i when
    // the cell is empty and every placed neighbour shows the same colour on the shared side.
    const OFF = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    const nbr = (n, i, d) => { const r = Math.floor(i / n) + OFF[d][0], c = i % n + OFF[d][1]; return r < 0 || c < 0 || r >= n || c >= n ? -1 : r * n + c; };
    const legal = (B, n, i, t) => {
      if (!Number.isInteger(i) || i < 0 || i >= n * n || B[i]) return false;
      for (let d = 0; d < 4; d++) { const j = nbr(n, i, d); if (j >= 0 && B[j] && B[j][(d + 2) % 4] !== t[d]) return false; }
      return true;
    };
    const turn = (t, k) => { let x = t.slice(); for (let q = 0; q < k; q++) x = [x[3], x[0], x[1], x[2]]; return x; };
    // a whole board agrees on every shared side
    const agrees = (B, n) => { for (let i = 0; i < n * n; i++) { if (!B[i]) continue; for (const d of [1, 2]) { const j = nbr(n, i, d); if (j >= 0 && B[j] && B[j][(d + 2) % 4] !== B[i][d]) return false; } } return true; };

    // turning
    ok(JSON.stringify(E.rot([0, 1, 2, 0])) === '[0,0,1,2]' && JSON.stringify(E.rotN([0, 1, 2, 1], 4)) === '[0,1,2,1]' && JSON.stringify(E.rotN([0, 1, 2, 1], 2)) === '[2,1,0,1]' && JSON.stringify(E.rotN([0, 1, 2, 1], -1)) === JSON.stringify(E.rotN([0, 1, 2, 1], 3)),
      'a quarter turn is clockwise (west comes to the top), four turns give the tile back, and −1 equals three turns');
    ok(E.nb(5, 0, E.N) === -1 && E.nb(5, 0, E.W) === -1 && E.nb(5, 4, E.E) === -1 && E.nb(5, 24, E.S) === -1 && E.nb(5, 6, E.N) === 1 && E.nb(5, 6, E.S) === 11 && E.nb(5, 5, E.W) === -1, 'no wrap-around at the edges');

    // edge matching on a hand-built board: a tile in the middle of a 5×5 quilt
    {
      const B = E.empty(5);
      B[12] = [0, 1, 2, 0];
      ok(E.fits(B, 5, 7, [1, 1, 0, 1]) && !E.fits(B, 5, 7, [0, 1, 1, 1]), 'above it a tile fits only with the same colour on its south side as the north side below');
      ok(E.fits(B, 5, 13, [2, 2, 2, 1]) && !E.fits(B, 5, 13, [2, 2, 2, 0]), 'to its right a tile needs the matching colour on its west side');
      ok(E.fits(B, 5, 0, [2, 2, 2, 2]) && !E.fits(B, 5, 12, [0, 1, 2, 0]), 'a cell with no neighbour takes any tile, and a filled cell takes none');
      B[18] = [1, 2, 2, 2];
      // cell 13 touches 12 (west) and 18 (south): both must agree
      ok(E.fits(B, 5, 13, [2, 2, 1, 1]) && !E.fits(B, 5, 13, [2, 2, 2, 1]) && !E.fits(B, 5, 13, [2, 2, 1, 2]), 'a cell between two tiles must match both of them');
      ok(E.turnsTo(B, 5, 13, [1, 1, 2, 2]) === 2 && legal(B, 5, 13, turn([1, 1, 2, 2], 2)) && !legal(B, 5, 13, [1, 1, 2, 2]) && E.turnsTo(B, 5, 13, [0, 0, 0, 0]) === -1, 'turnsTo finds the quarter turns that make a tile fit, and −1 when no turn does');
      const P = E.spots(B, 5, [1, 1, 2, 2]);
      let spotsOk = true;
      for (let i = 0; i < 25; i++) {
        const now = legal(B, 5, i, [1, 1, 2, 2]), later = !now && [1, 2, 3].some((k) => legal(B, 5, i, turn([1, 1, 2, 2], k)));
        if (now !== P.now.includes(i) || later !== P.turn.includes(i)) spotsOk = false;
      }
      ok(spotsOk && P.now.length + P.turn.length > 0, 'the lit and dashed cells are exactly those where the tile fits now or after a turn (' + P.now.length + ' now, ' + P.turn.length + ' after a turn)');
    }

    // patches: within a tile only neighbouring triangles join (N meets E and W, never S)
    {
      const B = E.empty(5);
      B[6] = [0, 1, 0, 1];
      ok(E.region(B, 5, 6 * 4 + E.N).tris.length === 1 && E.region(B, 5, 6 * 4 + E.E).tris.length === 1, 'opposite triangles of one colour do not join across the centre');
      B[6] = [0, 0, 1, 1];
      ok(JSON.stringify(E.region(B, 5, 6 * 4 + E.N).tris) === JSON.stringify([24, 25]) && JSON.stringify(E.region(B, 5, 6 * 4 + E.S).tris) === JSON.stringify([26, 27]), 'neighbouring triangles of one colour join across the diagonal');
      B[7] = [2, 2, 2, 0];
      ok(JSON.stringify(E.region(B, 5, 25).tris) === JSON.stringify([24, 25, 31]) && !E.region(B, 5, 25).closed, 'across a shared side the facing triangles join, and a patch beside an empty cell is open');
    }
    // closing a patch in the corner of a 5×5 quilt: the board edge closes a side
    {
      const st = E.fresh(5);
      st.tray = [[0, 0, 0, 0], [1, 1, 1, 0], [0, 2, 2, 2]];
      const a = E.move(st, [], 0, 0, 0), b = E.move(st, [], 1, 1, 0);
      ok(a && a.length === 0 && b && b.length === 0 && st.score === 0, 'an orange tile in the corner and a neighbour do not close anything while a side still faces an empty cell');
      const c = E.move(st, [], 2, 5, 0);
      ok(c && c.length === 1 && c[0].color === 0 && c[0].tris.length === 6 && c[0].points === 6 && st.score === 6 && st.patches === 1 && st.best === 6, 'the tile below closes the orange patch of six triangles and scores 6 (' + (c && c[0] ? c[0].tris.length + ' triangles, ' + c[0].points + ' points' : 'nothing closed') + ')');
      const R = E.regions(st.board, 5);
      ok(R.filter((x) => x.closed).length === 1 && R.reduce((s, x) => s + x.tris.length, 0) === 12, 'every placed triangle is in exactly one patch, and only the orange one is closed');
      ok(E.value(9) === 9 && E.value(10) === 20 && E.value(1) === 1, 'a patch scores a point a triangle, two a triangle from ten up');
      ok(E.move(st, [], 0, 3, 0) === null && st.moves === 3, 'an empty tray slot cannot be played');
    }
    // an illegal move is refused and changes nothing
    {
      const st = E.fresh(5);
      st.tray = [[0, 0, 0, 0], [1, 1, 1, 1], [2, 2, 2, 2]];
      E.move(st, [], 0, 12, 0);
      const before = JSON.stringify(st);
      ok(E.move(st, [], 1, 13, 0) === null && E.move(st, [], 1, 12, 0) === null && E.move(st, [], 1, 25, 0) === null && E.move(st, [], 1, 1.5, 0) === null && JSON.stringify(st) === before, 'a mismatched side, a filled cell or a cell off the board is refused, and the state is unchanged');
    }

    // the generator: a hidden finished quilt that agrees on every side, cut into the bag
    let gens = 0, solBad = 0, bagBad = 0;
    const key = (t) => [0, 1, 2, 3].map((k) => turn(t, k).join('')).sort()[0];
    const rG = rng(1079);
    for (const n of E.SIZES) for (let k = 0; k < 40; k++) {
      const G = E.generate(n, rng(1 + Math.floor(rG() * 4294967294)));
      gens++;
      if (G.sol.length !== n * n || !agrees(G.sol, n) || G.sol.some((t) => t.length !== 4 || t.some((c) => c < 0 || c >= E.K))) solBad++;
      const left = {};
      for (const t of G.bag) left[key(t)] = (left[key(t)] || 0) + 1;
      for (const t of G.sol) left[key(t)] = (left[key(t)] || 0) - 1;
      if (G.bag.length !== n * n + E.EXTRA || Object.values(left).some((x) => x < 0)) bagBad++;
    }
    ok(gens === 80, 'the generator ran over ' + gens + ' quilts, 40 of each size');
    ok(!solBad && !bagBad, 'every hidden quilt agrees on all its sides and the bag holds each of its tiles, plus the spares (' + solBad + ' bad quilts, ' + bagBad + ' bad bags)');

    // determinism and the daily seed, by the core's own formula: FNV-1a of chogan|quilt|date
    const A = E.generate(6, rng(4242)), B2 = E.generate(6, rng(4242)), Cq = E.generate(6, rng(4243));
    ok(JSON.stringify(A) === JSON.stringify(B2) && JSON.stringify(A.bag) !== JSON.stringify(Cq.bag), 'the same seed rebuilds the same bag, and the next seed a different one');
    const hash32 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
    ok(/function hash32\(\w+\) \{[\s\S]{0,200}2166136261[\s\S]{0,200}16777619/.test(core) && /hash32\('chogan\|' \+ (gameId|id)/.test(core), 'the core still seeds a daily game with FNV-1a of chogan|id|date');
    const dSeed = (date) => hash32('chogan|quilt|' + date);
    const D1 = E.generate(E.DAILY_N, rng(dSeed('2026-11-24'))), D1b = E.generate(E.DAILY_N, rng(dSeed('2026-11-24'))), D2 = E.generate(E.DAILY_N, rng(dSeed('2026-11-25')));
    ok(JSON.stringify(D1.bag) === JSON.stringify(D1b.bag) && JSON.stringify(D1.bag) !== JSON.stringify(D2.bag), 'the daily bag is the same all day for everyone and changes the next day');
    ok(/C\.daily\('quilt', dailyDate\)\.seed/.test(html) && /E\.DAILY_N/.test(html) && /E\.generate\(S\.n, C\.rng\(S\.seed\)\)/.test(html), 'the page takes the daily quilt from Chogan.daily and rebuilds every bag from its seed with the core rng');

    // bot playouts by the rules written above: every move the bot makes must be legal by the
    // independent checker and accepted by the engine; a deliberately wrong move must be
    // refused; the game must end, and end only when it should
    let games2 = 0, illegal = 0, refusedLegal = 0, acceptedBad = 0, endBad = 0, scoreBad = 0, neverEnded = 0, fulls = 0, replayBad = 0;
    const starsSeen = [0, 0, 0, 0];
    const rB = rng(10790);
    for (const n of E.SIZES) for (let g = 0; g < 60; g++) {
      const G = E.generate(n, rng(1 + Math.floor(rB() * 4294967294))), bag = G.bag, st = E.start(n, bag), moves = [];
      const pick = rng(500 + g * 7 + n), greedy = g % 2 === 0;
      games2++;
      let steps = 0;
      while (!E.over(st, bag) && steps < 200) {
        steps++;
        const opts = [];
        for (let k = 0; k < st.tray.length; k++) if (st.tray[k]) for (let r = 0; r < 4; r++) { const t = turn(st.tray[k], r); for (let i = 0; i < n * n; i++) if (legal(st.board, n, i, t)) opts.push([k, i, r, t]); }
        // a move the checker says is illegal is tried first and must be refused
        const k0 = st.tray.findIndex(Boolean), filled = st.board.findIndex(Boolean);
        if (k0 >= 0 && filled >= 0) { const snap = JSON.stringify(st); if (E.move(st, bag, k0, filled, 0) !== null || JSON.stringify(st) !== snap) acceptedBad++; }
        for (let k = 0; k < st.tray.length && opts.length; k++) if (st.tray[k]) for (let i = 0; i < n * n; i++) if (!st.board[i] && !legal(st.board, n, i, st.tray[k])) { const snap = JSON.stringify(st); if (E.move(st, bag, k, i, 0) !== null || JSON.stringify(st) !== snap) acceptedBad++; i = n * n; k = 3; }
        if (!opts.length) {
          // stuck: the engine must agree and offer a swap, since the game is not over
          if (!E.stuck(st) || !E.canSwap(st, bag)) endBad++;
          const k = st.tray.findIndex(Boolean);
          if (!E.swap(st, bag, k)) { endBad++; break; }
          moves.push([k, -1, 0]);
          continue;
        }
        if (E.stuck(st)) endBad++;
        let m = opts[Math.floor(pick() * opts.length)];
        if (greedy) {
          // prefer the cell with the most placed neighbours, as a player fills holes
          let bestV = -1;
          for (const o of opts) { const v = [0, 1, 2, 3].filter((d) => { const j = nbr(n, o[1], d); return j < 0 || st.board[j]; }).length + pick() * 0.5; if (v > bestV) { bestV = v; m = o; } }
        }
        if (!legal(st.board, n, m[1], m[3])) illegal++;
        const before = JSON.stringify(st.board);
        const res = E.move(st, bag, m[0], m[1], m[2]);
        if (!res) { refusedLegal++; break; }
        if (JSON.stringify(st.board[m[1]]) !== JSON.stringify(m[3]) || JSON.stringify(st.board.filter((t, i) => i !== m[1])) !== JSON.stringify(JSON.parse(before).filter((t, i) => i !== m[1]))) illegal++;
        moves.push([m[0], m[1], m[2]]);
      }
      if (!E.over(st, bag)) { neverEnded++; continue; }
      if (!agrees(st.board, n)) illegal++;
      // over only when full, or when nothing in the tray fits by the independent rules and no swap is left
      const anyLegal = st.tray.some((t) => t && [0, 1, 2, 3].some((r) => { for (let i = 0; i < n * n; i++) if (legal(st.board, n, i, turn(t, r))) return true; return false; }));
      const full = st.board.every(Boolean);
      if (!full && (anyLegal || E.canSwap(st, bag))) endBad++;
      if (full) fulls++;
      // each patch scores once: the score is the value of every closed patch on the final board
      const closed = E.regions(st.board, n).filter((R) => R.closed);
      if (closed.reduce((s, R) => s + E.value(R.tris.length), 0) !== st.score || closed.length !== st.patches) scoreBad++;
      starsSeen[E.stars(st)]++;
      const re = E.replay(n, bag, moves);
      if (!re || JSON.stringify(re) !== JSON.stringify(st)) replayBad++;
    }
    ok(games2 === 120, 'the bots played ' + games2 + ' games, 60 on each size, half picking at random and half filling holes');
    ok(!illegal && !refusedLegal, 'no bot move broke the edge rule as checked apart from the engine, and the engine accepted every legal one (' + illegal + ' illegal, ' + refusedLegal + ' legal moves refused)');
    ok(!acceptedBad, 'a move that breaks the edge rule or lands on a filled cell is always refused and leaves the game unchanged (' + acceptedBad + ' accepted)');
    ok(!neverEnded && !endBad, 'every game ended, and only when the quilt was full or nothing fits with no swap left (' + neverEnded + ' never ended, ' + endBad + ' ended wrongly)');
    ok(!scoreBad, 'the score is always the value of the closed patches on the final quilt, so no patch scores twice (' + scoreBad + ' wrong)');
    ok(!replayBad, 'replaying the saved moves rebuilds every game exactly (' + replayBad + ' differ)');
    ok(starsSeen[2] + starsSeen[3] > 0 && starsSeen[1] + starsSeen[2] + starsSeen[3] === 120, 'stars run from one to three (' + starsSeen.slice(1).join(' / ') + ' games with 1 / 2 / 3 stars, ' + fulls + ' full quilts)');

    // stars from the share of the quilt that is sewn
    {
      const st = E.fresh(6), fill = (k) => { st.board = E.empty(6); for (let i = 0; i < k; i++) st.board[i] = [0, 0, 0, 0]; return E.stars(st); };
      ok(fill(36) === 3 && fill(33) === 3 && fill(32) === 2 && fill(27) === 2 && fill(26) === 1 && fill(0) === 1, 'three stars from nine tenths of the quilt, two from three quarters, else one: never a loss');
    }
    // saves: replayed through the rules, so an edited save is refused
    {
      const G = E.generate(5, rng(77)), st = E.start(5, G.bag);
      ok(E.replay(5, G.bag, []) && E.replay(5, G.bag, [[0, 12, 0]]) && E.replay(4, G.bag, []) === null && E.replay(5, G.bag, 'x') === null, 'a save of a known size replays, an unknown size is refused');
      const t0b = st.tray[0], bad = [0, 1, 2, 3].map((r) => turn(t0b, r)).findIndex((t) => t.join('') !== t0b.join('')) >= 0;
      const two = E.replay(5, G.bag, [[0, 12, 0]]);
      const nb2 = two.tray.findIndex(Boolean), wrong = [0, 1, 2, 3].find((r) => !legal(two.board, 5, 13, turn(two.tray[nb2], r)));
      ok(bad && (wrong === undefined || E.replay(5, G.bag, [[0, 12, 0], [nb2, 13, wrong]]) === null) && E.replay(5, G.bag, [[0, 12, 0], [0, 12, 0]]) === null && E.replay(5, G.bag, [[3, 12, 0]]) === null && E.replay(5, G.bag, [[0, 12, 4]]) === null, 'a save with a move that breaks the rules, a filled cell, a fourth slot or a fifth turn is refused');
      ok(/E\.replay\(S\.n, G\.bag, S\.moves\)/.test(html) && /\(saved\.daily \|\| null\) === \(dailyDate \|\| null\)/.test(html), 'the page rebuilds a saved game through the rules and never resumes a daily save outside its day');
    }

    // the tutorial's hand-made pictures: the patch shown as closed really is, and scores what it says
    {
      const part = html.slice(html.indexOf('// a closed patch:'), html.indexOf('// a full quilt'));
      const tiles = [...part.matchAll(/tTile\((\d+), (\d+), 40, \[([0-9, ]+)\]\)/g)].map((m) => ({ x: +m[1], y: +m[2], t: m[3].split(',').map(Number) }));
      const B = E.empty(2);
      for (const q of tiles) B[((q.y - 15) / 40) * 2 + (q.x - 56) / 40] = q.t;
      const R = B.every(Boolean) ? E.regions(B, 2).find((x) => x.color === 0) : null, label = part.match(/>\+(\d+)<\/text>/);
      ok(tiles.length === 4 && agrees(B, 2) && R && R.closed && label && E.value(R.tris.length) === +label[1], 'the tutorial\'s closed patch agrees on every side, is closed, and scores the number it shows (' + (R ? R.tris.length : 0) + ' triangles, label ' + (label ? label[1] : '?') + ')');
      const part1 = html.slice(html.indexOf('// matching:'), html.indexOf('// a closed patch:'));
      const left = part1.match(/tTile\(40, 10, 40, \[([0-9, ]+)\]\)/), pale = part1.match(/tTile\(84, 14, 32, \[([0-9, ]+)\]/);
      ok(!!left && !!pale && left[1].split(',').map(Number)[E.E] === pale[1].split(',').map(Number)[E.W], 'the tutorial\'s tile on the lit cell matches its neighbour\'s side');
    }

    // strings: every key the page uses is in every locale
    const strBlock = html.slice(html.indexOf('strings: {'), html.indexOf('\n  var params'));
    const keys = [...new Set([...html.matchAll(/C\.t\('([A-Za-z0-9]+)'/g)].map((m) => m[1]))];
    // keys built at run time: the colour names
    keys.push('col0', 'col1', 'col2');
    const CORE_KEYS = ['help', 'keyboard', 'tutorial', 'done', 'daily', 'time', 'resetWarn', 'dailyDone'];
    const own = keys.filter((k) => CORE_KEYS.indexOf(k) < 0 && k !== 'col');
    ok(own.length >= 20 && LOCALE_CODES.length >= 9, 'the page names its own strings (' + own.length + ' keys, ' + LOCALE_CODES.length + ' locales)');
    const missing = [];
    for (const loc of LOCALE_CODES) {
      const m = strBlock.match(new RegExp('\\n      ' + loc + ': \\{([\\s\\S]*?)\\n      \\}'));
      if (!m) { missing.push(loc + ':*'); continue; }
      for (const k of own) if (!new RegExp('(^|[\\s,{])' + k + ': \'').test(m[1])) missing.push(loc + ':' + k);
    }
    ok(!missing.length, 'every string the page uses is in all ' + LOCALE_CODES.length + ' locales' + (missing.length ? ' (missing ' + missing.slice(0, 8).join(', ') + ')' : ''));
    ok(own.indexOf('again') < 0, 'the page does not redefine the core\'s play-again label');
    // the first tutorial card says what the first tap is (#1060)
    ok(LOCALE_CODES.every((loc) => { const m = strBlock.match(new RegExp('\\n      ' + loc + ': \\{([\\s\\S]*?)\\n      \\}')); return m && /tutTitle0: '[^']+'/.test(m[1]) && /tutText0: '[^']+'/.test(m[1]); }) &&
      /var TUT = \[\s*\{ title: C\.t\('tutTitle0'\), text: C\.t\('tutText0'\)/.test(html) && (html.match(/\{ title: C\.t\('tutTitle\d'\)/g) || []).length === 4,
      'four tutorial cards, the first saying what the first tap does, in every locale (#1060)');
    const gm = games.find((g) => g.id === 'quilt');
    ok(!!gm && games.filter((g) => g.id === 'quilt').length === 1 && gm.cat === 'puzzle' && gm.people === 1 && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'Quilt is listed once, as a one-player puzzle, with a name and summary in every locale');
    ok(!!gm && LOCALE_CODES.every((l) => new RegExp(l + ": '" + gm.name[l] + "'").test(html.slice(html.indexOf('name: {'), html.indexOf('accent: ACCENT')))), 'the page and games.json give the game the same name in every locale');

    // awards: all four in the core with every locale, unlocked by the page, mapped to the game
    const AW = ['ql-win', 'ql-full', 'ql-big', 'ql-daily'];
    const awLines = AW.map((id) => core.split('\n').find((l) => l.indexOf("{ id: '" + id + "'") >= 0) || '');
    ok(awLines.every((l, i) => l && html.indexOf("unlock('" + AW[i] + "')") > 0 && LOCALE_CODES.every((loc) => new RegExp('[{,]\\s*' + loc + ": '[^']+'").test(l) && new RegExp('[{,]\\s*d' + loc + ": '[^']+'").test(l))), 'the four awards are in the core with a title and description in every locale, and the game unlocks them');
    ok(/\bql: 'quilt'/.test(core), 'the core maps the ql- award prefix to Quilt');

    // the accent: ΔE (CIE76) ≥ 15 from games in the same category, ≥ 8 from every other,
    // and white text on it at 4.5:1 or more. Some forty games also ask every other accent to
    // keep ΔE 15 from theirs, and Chain Reaction, Ludo and Gridlock 15° of hue: the first
    // rose (#B5345A) passed the two rules above but sat 12.4 from Checkers and broke its test,
    // and the magenta tried next was 10° from Chain Reaction (#1079). Those games are read
    // from their own tests, so one added later is guarded here too.
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => { const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
    const dE = (p, q) => { const a = lab(p), b = lab(q); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
    const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const col = gm ? gm.color : '';
    const others = games.filter((g) => g.id !== 'quilt' && /^#[0-9A-Fa-f]{6}$/.test(g.color));
    const same = others.filter((g) => gm && g.cat === gm.cat);
    ok(others.length > 50 && same.length > 5, 'the accent is compared against ' + others.length + ' games, ' + same.length + ' of them puzzles');
    const nearSame = same.reduce((b, g) => { const d = dE(col, g.color); return d < b[0] ? [d, g.id] : b; }, [1e9, '']);
    const nearAll = others.reduce((b, g) => { const d = dE(col, g.color); return d < b[0] ? [d, g.id] : b; }, [1e9, '']);
    ok(nearSame[0] >= 15, 'the accent ' + col + ' is at least ΔE 15 from every puzzle game (nearest ' + nearSame[1] + ', ' + nearSame[0].toFixed(1) + ')');
    ok(nearAll[0] >= 8, 'the accent is at least ΔE 8 from every other game (nearest ' + nearAll[1] + ', ' + nearAll[0].toFixed(1) + ')');
    const testSrc = [path.join(ROOT, 'tools/test.js')].concat(fs.readdirSync(path.join(ROOT, 'tools/tests')).filter((f) => f.endsWith('.js') && f !== 'quilt.js').map((f) => path.join(ROOT, 'tools/tests', f))).map((f) => fs.readFileSync(f, 'utf8'));
    const guards = new Set();
    let guardLines = 0;
    testSrc.forEach((src) => {
      for (const m of src.matchAll(/differs from every other game by ΔE ≥ 15/g)) {
        guardLines++;
        const ids = [...src.slice(Math.max(0, m.index - 3000), m.index).matchAll(/\b[a-z]+\.id !== '([a-z0-9]+)'/g)];
        if (ids.length) guards.add(ids[ids.length - 1][1]);
      }
    });
    const guarded = others.filter((g) => guards.has(g.id));
    const nearGuard = guarded.reduce((b, g) => { const d = dE(col, g.color); return d < b[0] ? [d, g.id] : b; }, [1e9, '']);
    ok(guardLines >= 40 && guards.size === guardLines && guarded.length === guards.size && nearGuard[0] >= 15,
      'the accent keeps ΔE 15 from the ' + guards.size + ' games whose tests ask it of every accent (' + guardLines + ' found; nearest ' + nearGuard[1] + ', ' + nearGuard[0].toFixed(1) + ')');
    const hue = (h) => { const [x, y, z] = rgb(h), mx = Math.max(x, y, z), d = mx - Math.min(x, y, z); if (!d) return 0; const q = mx === x ? ((y - z) / d) % 6 : mx === y ? (z - x) / d + 2 : (x - y) / d + 4; return (q * 60 + 360) % 360; };
    const hd = (p, q) => { const d = Math.abs(p - q) % 360; return Math.min(d, 360 - d); };
    const hueGuard = others.filter((g) => ['chain', 'ludo', 'gridlock'].includes(g.id));
    ok(!!gm && hueGuard.length === 3 && hueGuard.every((g) => hd(hue(g.color), hue(col)) >= 15), 'the hue keeps 15° from Chain Reaction, Ludo and Gridlock (' + hueGuard.map((g) => g.id + ' ' + hd(hue(g.color), hue(col)).toFixed(0) + '°').join(', ') + ')');
    const con = 1.05 / (lum(col) + 0.05);
    ok(con >= 4.5, 'white text on the accent reads at 4.5:1 or more (' + con.toFixed(2) + ')');
    ok(html.indexOf("var ACCENT = '" + col + "'") >= 0, 'the page uses the listed accent');
    // the cloth colours: three apart from one another, each with its own mark
    ok(/var CLOTH = \['#D55E00', '#0072B2', '#F0E442'\]/.test(html) && Math.min(dE('#D55E00', '#0072B2'), dE('#D55E00', '#F0E442'), dE('#0072B2', '#F0E442')) > 40, 'the three cloth colours come from the Okabe–Ito set and stay far apart');
    ok(/if \(c === 0\) \{ g\.beginPath\(\); g\.arc/.test(html) && /else if \(c === 1\)/.test(html) && /if \(c === 0\) s \+= '<circle/.test(html), 'each colour carries its own mark on the board and in the tray, so colour is never the only cue');

    // layout and drawing rules from earlier canvas bugs
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/quilt/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') === icon.indexOf('<rect'), 'the icon sits on the game\'s soft tint');
    ok(/\.ql-box canvas \{[^}]*width: 100%; height: 100%/.test(html), 'the canvas is sized by CSS width and height, so it does not keep its backing-store size (#919)');
    ok(/document\.fonts\.ready\.then/.test(html) && /ResizeObserver/.test(html) && /cv\.width !== [^;]*\|\| cv\.height !== /.test(html), 'the board redraws when the web font arrives and when its box changes, checking both sides of the backing store');
    ok(/C\.ui\.reduceMotion\(\) \|\| !drawn\.k\) return;\s*[\s\S]{0,400}C\.ui\.burst\(/.test(html), 'a closed patch bursts in its colour, and nothing moves under reduced motion');
    ok(/class: 'ch-fit'/.test(html) && /ch-split/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html) && !/localStorage|history\.(push|replace)State|fetch\(|XMLHttpRequest/.test(html), 'core layout, a tutorial, no direct storage, history or network');
    ok(Date.now() - t0 < 3000, 'the Quilt tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testQuilt };
};
