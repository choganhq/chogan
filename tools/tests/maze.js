'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;
  // #985: lead a ball through a generated maze to the flag
  function testMaze() {
    const games = T.games();
    head('Maze (#985)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/maze/index.html');
    ok(fs.existsSync(file), 'the Maze page exists');
    const E = loadEngine('maze', 'MazeEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const { N, E: Ea, S, W, DIRS } = E;
    ok(JSON.stringify(E.SIZES) === '[8,12,16]' && E.DAILY_N === 12, 'three sizes, 8, 12 and 16, and a 12×12 daily maze');
    ok(E.nb(8, 0, N) === -1 && E.nb(8, 0, W) === -1 && E.nb(8, 7, Ea) === -1 && E.nb(8, 63, S) === -1 && E.nb(8, 9, N) === 1 && E.nb(8, 9, S) === 17, 'no wrap-around at the edges');

    // the generator over many seeds: an independent BFS over the walls, never the engine's own
    const bfs = (M) => {
      const n = M.n, d = new Array(n * n).fill(-1), q = [0]; d[0] = 0;
      for (let h = 0; h < q.length; h++) {
        const i = q[h], r = Math.floor(i / n), c = i % n;
        const nbrs = [[N, r - 1, c], [Ea, r, c + 1], [S, r + 1, c], [W, r, c - 1]];
        for (const [dir, rr, cc] of nbrs) if ((M.m[i] & dir) && rr >= 0 && cc >= 0 && rr < n && cc < n && d[rr * n + cc] < 0) { d[rr * n + cc] = d[i] + 1; q.push(rr * n + cc); }
      }
      return d;
    };
    let mazes = 0, unsolvable = 0, unreached = 0, asym = 0, leaks = 0, parBad = 0, pathBad = 0, exitBad = 0, edgesBad = 0;
    const rG = rng(985);
    for (const n of E.SIZES) {
      for (let k = 0; k < 40; k++) {
        const M = E.generate(n, rng(1 + Math.floor(rG() * 4294967294)));
        mazes++;
        const d = bfs(M), NN = n * n;
        if (d.some((x) => x < 0)) unreached++;
        let open = 0;
        for (let i = 0; i < NN; i++) {
          for (const dir of DIRS) {
            if (!(M.m[i] & dir)) continue;
            open++;
            const j = E.nb(n, i, dir);
            if (j < 0) leaks++;
            else if (!(M.m[j] & E.opp(dir))) asym++;
          }
        }
        // a spanning tree: n²−1 passages, so exactly one way between any two cells
        if (open !== 2 * (NN - 1)) edgesBad++;
        const onEdge = Math.floor(M.exit / n) === n - 1 || M.exit % n === n - 1;
        const farthest = d.reduce((b, x, i) => ((Math.floor(i / n) === n - 1 || i % n === n - 1) && x > b ? x : b), -1);
        if (!onEdge || d[M.exit] !== farthest) exitBad++;
        if (d[M.exit] < 0) unsolvable++;
        if (M.par !== d[M.exit]) parBad++;
        const P = E.solve(M);
        if (!P || P[0] !== 0 || P[P.length - 1] !== M.exit || P.length - 1 !== M.par || P.some((c, i) => i && !DIRS.some((dir) => E.step(M, P[i - 1], dir) === c))) pathBad++;
      }
    }
    ok(mazes === 120, 'the generator ran over ' + mazes + ' mazes, 40 of each size');
    ok(!unsolvable && !unreached, 'every maze is solvable and every cell is reachable (' + unsolvable + ' sealed, ' + unreached + ' with cut-off cells)');
    ok(!asym && !leaks && !edgesBad, 'walls agree from both sides, no passage leads off the board, and every maze is a spanning tree (' + asym + ' one-sided, ' + leaks + ' leaks, ' + edgesBad + ' not a tree)');
    ok(!exitBad, 'the exit is the farthest cell on the far row or column (' + exitBad + ' wrong)');
    ok(!parBad && !pathBad, 'par is the BFS distance to the exit and the solver\'s path is contiguous with exactly par steps (' + parBad + ' par, ' + pathBad + ' paths wrong)');
    {
      const big = E.generate(16, rng(98516));
      ok(big.par >= 30, 'a large maze is a real walk, not a corridor beside the start (par ' + big.par + ')');
    }

    // determinism: the same seed gives the same maze, a different seed a different one
    const A = E.generate(12, rng(4242)), B = E.generate(12, rng(4242)), Cm = E.generate(12, rng(4243));
    ok(JSON.stringify(A) === JSON.stringify(B) && JSON.stringify(A.m) !== JSON.stringify(Cm.m), 'the same seed rebuilds the same maze, and the next seed a different one');

    // the daily seed, by the core's own formula: FNV-1a of chogan|maze|date
    const hash32 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
    ok(/function hash32\(\w+\) \{[\s\S]{0,200}2166136261[\s\S]{0,200}16777619/.test(core) && /hash32\('chogan\|' \+ (gameId|id)/.test(core), 'the core still seeds a daily game with FNV-1a of chogan|id|date');
    const dSeed = (date) => hash32('chogan|maze|' + date);
    const D1 = E.generate(E.DAILY_N, rng(dSeed('2026-11-20'))), D1b = E.generate(E.DAILY_N, rng(dSeed('2026-11-20'))), D2 = E.generate(E.DAILY_N, rng(dSeed('2026-11-21')));
    ok(dSeed('2026-11-20') === dSeed('2026-11-20') && JSON.stringify(D1) === JSON.stringify(D1b) && JSON.stringify(D1.m) !== JSON.stringify(D2.m), 'the daily maze is the same all day and changes the next day');
    ok(/C\.daily\('maze', dailyDate\)\.seed/.test(html) && /E\.DAILY_N/.test(html) && /C\.rng\(S\.seed\)/.test(html), 'the page takes the daily maze from Chogan.daily and rebuilds every maze from its seed with the core rng');

    // a bot that plays by the real rules: a right-hand wall follower that moves only by
    // E.step (a wall is never crossed). In a spanning tree it walks each passage at most
    // twice, so it must get out within 2(n²−1) steps.
    const follow = (M) => {
      const order = [N, Ea, S, W], right = (d) => order[(order.indexOf(d) + 1) % 4], left = (d) => order[(order.indexOf(d) + 3) % 4];
      let c = 0, d = Ea, steps = 0;
      const lim = 2 * (M.n * M.n - 1);
      while (c !== M.exit && steps <= lim) {
        let t = right(d), tries = 0;
        while (E.step(M, c, t) < 0 && tries < 4) { t = left(t); tries++; }
        const j = E.step(M, c, t);
        if (j < 0) return -1;
        c = j; d = t; steps++;
      }
      return c === M.exit ? steps : -1;
    };
    let botWins = 0, botGames = 0, botSteps = 0;
    for (const n of E.SIZES) for (let k = 0; k < 10; k++) { const M = E.generate(n, rng(7000 + n * 31 + k)); botGames++; const s = follow(M); if (s > 0 && s >= M.par) { botWins++; botSteps += s; } }
    ok(botGames === 30 && botWins === botGames, 'a wall-following bot that only moves through open sides gets out of every maze on every size (' + botWins + ' of ' + botGames + ')');

    // the page's own controls: slides and drags never cross a wall, a drag along the way out
    // wins in par steps (three stars), and the arrow keys alone can finish a maze
    let crossed = 0, slides = 0;
    for (let k = 0; k < 20; k++) {
      const M = E.generate(E.SIZES[k % 3], rng(985000 + k));
      for (let i = 0; i < M.n * M.n; i += 3) for (const dir of DIRS) {
        const p = E.slide(M, i, dir); slides++;
        let c = i;
        for (const j of p) { if (E.step(M, c, dir) !== j) crossed++; c = j; }
        const t = (i * 7 + 5) % (M.n * M.n), q = E.toward(M, i, t);
        c = i;
        for (const j of q) { if (!DIRS.some((d) => E.step(M, c, d) === j)) crossed++; c = j; }
      }
    }
    ok(slides > 1000 && crossed === 0, 'a roll or a drag only ever moves through open sides (' + slides + ' tried, ' + crossed + ' through a wall)');
    {
      const M = E.generate(16, rng(31337)), P = E.solve(M), trail = [0];
      let c = 0, steps = 0;
      for (let i = 1; i < P.length && c !== M.exit; i++) { const q = E.toward(M, c, P[i]); for (const j of q) { E.walk(trail, j); steps++; c = j; } }
      ok(c === M.exit && steps === M.par && E.stars(steps, M.par) === 3 && trail.length === M.par + 1, 'a drag along the way out reaches the exit in exactly par steps and earns three stars (' + steps + ' of ' + M.par + ')');
    }
    {
      // keys only: depth-first over slides, the way a player rolls corridor by corridor
      let keyWins = 0;
      for (const n of E.SIZES) {
        const M = E.generate(n, rng(4100 + n)), seen = new Set([0]), st = [0];
        let won = false;
        while (st.length && !won) {
          const c = st.pop();
          for (const dir of DIRS) { const p = E.slide(M, c, dir); if (!p.length) continue; const e = p[p.length - 1]; if (e === M.exit || p.indexOf(M.exit) >= 0) { won = true; break; } if (!seen.has(e)) { seen.add(e); st.push(e); } }
        }
        if (won) keyWins++;
      }
      ok(keyWins === 3, 'the arrow keys alone can finish a maze on every size (' + keyWins + ' of 3)');
    }
    {
      const M = E.generate(8, rng(55));
      const tr = [0]; const j = E.step(M, 0, E.open(M, 0, Ea) ? Ea : S); E.walk(tr, j); E.walk(tr, 0);
      ok(tr.length === 1 && tr[0] === 0, 'stepping back onto the cell before takes the last cell off the trail');
    }
    ok(E.stars(10, 10) === 3 && E.stars(12, 10) === 3 && E.stars(13, 10) === 2 && E.stars(20, 10) === 2 && E.stars(21, 10) === 1 && E.stars(9999, 10) === 1, 'three stars near par, two within twice par, then one: never a loss');
    // #1241: a walk of exactly par steps was told "Almost the shortest way!"
    ok(typeof E.verdict === 'function' && E.verdict(10, 10) === 'shortest' && E.verdict(11, 10) === 'almost' && E.verdict(12, 10) === 'almost' && E.verdict(13, 10) === null, 'the win note says the shortest way at par, almost it within three stars, nothing below (#1241)');
    ok(/vd === 'shortest' \? C\.t\('shortestMz'\)/.test(html), 'the win screen shows the shortest-way note from the verdict (#1241)');
    {
      const M = E.generate(8, rng(77)), j = E.step(M, 0, E.open(M, 0, Ea) ? Ea : S);
      const good = { n: 8, seed: 77, trail: [0, j], steps: 1, daily: null };
      ok(E.valid(good, M) && !E.valid(Object.assign({}, good, { n: 9 })) && !E.valid(Object.assign({}, good, { seed: 0 })) && !E.valid(Object.assign({}, good, { trail: [0, 63] }), M) && !E.valid(Object.assign({}, good, { trail: [] })), 'a saved walk is accepted only when every step goes through an open side');
    }

    // strings: every key the page uses is in every locale
    const strBlock = html.slice(html.indexOf('strings: {'), html.indexOf('\n  var params'));
    const keys = [...new Set([...html.matchAll(/C\.t\('([A-Za-z0-9]+)'/g)].map((m) => m[1]))];
    const CORE_KEYS = ['help', 'keyboard', 'tutorial', 'done', 'daily', 'time', 'resetWarn', 'dailyDone'];
    const own = keys.filter((k) => CORE_KEYS.indexOf(k) < 0);
    ok(own.length >= 20 && LOCALE_CODES.length >= 9, 'the page names its own strings (' + own.length + ' keys, ' + LOCALE_CODES.length + ' locales)');
    const missing = [];
    for (const loc of LOCALE_CODES) {
      const m = strBlock.match(new RegExp('\\n      ' + loc + ': \\{([\\s\\S]*?)\\n      \\}'));
      if (!m) { missing.push(loc + ':*'); continue; }
      for (const k of own) if (!new RegExp('(^|[\\s,{])' + k + ': \'').test(m[1])) missing.push(loc + ':' + k);
    }
    ok(!missing.length, 'every string the page uses is in all ' + LOCALE_CODES.length + ' locales' + (missing.length ? ' (missing ' + missing.slice(0, 8).join(', ') + ')' : ''));
    ok(own.indexOf('again') < 0, 'the page does not redefine the core\'s play-again label');
    const gm = games.find((g) => g.id === 'maze');
    ok(!!gm && games.filter((g) => g.id === 'maze').length === 1 && gm.cat === 'puzzle' && gm.people === 1 && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'Maze is listed once, as a one-player puzzle, with a name and summary in every locale');

    // awards: all four in the core with every locale, unlocked by the page, mapped to the game
    const AW = ['mz-win', 'mz-big', 'mz-clean', 'mz-daily'];
    const awLines = AW.map((id) => core.split('\n').find((l) => l.indexOf("{ id: '" + id + "'") >= 0) || '');
    ok(awLines.every((l, i) => l && html.indexOf("unlock('" + AW[i] + "')") > 0 && LOCALE_CODES.every((loc) => new RegExp('[{,]\\s*' + loc + ": '[^']+'").test(l) && new RegExp('[{,]\\s*d' + loc + ": '[^']+'").test(l))), 'the four awards are in the core with a title and description in every locale, and the game unlocks them');
    ok(/\bmz: 'maze'/.test(core), 'the core maps the mz- award prefix to Maze');

    // the accent: ΔE (CIE76) ≥ 15 from games in the same category, ≥ 8 from every other,
    // and white text on it at 4.5:1 or more
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => { const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
    const dE = (p, q) => { const a = lab(p), b = lab(q); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
    const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const col = gm ? gm.color : '';
    const others = games.filter((g) => g.id !== 'maze' && /^#[0-9A-Fa-f]{6}$/.test(g.color));
    const same = others.filter((g) => gm && g.cat === gm.cat);
    ok(others.length > 50 && same.length > 5, 'the accent is compared against ' + others.length + ' games, ' + same.length + ' of them puzzles');
    const nearSame = same.reduce((b, g) => { const d = dE(col, g.color); return d < b[0] ? [d, g.id] : b; }, [1e9, '']);
    const nearAll = others.reduce((b, g) => { const d = dE(col, g.color); return d < b[0] ? [d, g.id] : b; }, [1e9, '']);
    ok(nearSame[0] >= 15, 'the accent ' + col + ' is at least ΔE 15 from every puzzle game (nearest ' + nearSame[1] + ', ' + nearSame[0].toFixed(1) + ')');
    ok(nearAll[0] >= 8, 'the accent is at least ΔE 8 from every other game (nearest ' + nearAll[1] + ', ' + nearAll[0].toFixed(1) + ')');
    const con = 1.05 / (lum(col) + 0.05);
    ok(con >= 4.5, 'white text on the accent reads at 4.5:1 or more (' + con.toFixed(2) + ')');
    ok(html.indexOf("var ACCENT = '" + col + "'") >= 0, 'the page uses the listed accent');

    // the tutorial's hand-made 4×4 maze: its first draft drew the trail through a wall
    {
      const tm = html.match(/var TM = \[([0-9, ]+)\]/), arts = [...html.matchAll(/tArt\(\[([0-9, ]+)\], (\d+),/g)];
      const TM = tm ? tm[1].split(',').map(Number) : [];
      const M = { n: 4, m: TM, start: 0, exit: 15 };
      const opens = TM.length === 16 ? TM.reduce((s, x) => s + [1, 2, 4, 8].filter((d) => x & d).length, 0) : 0;
      const sym = TM.length === 16 && TM.every((x, i) => DIRS.every((d) => !(x & d) || (E.nb(4, i, d) >= 0 && (TM[E.nb(4, i, d)] & E.opp(d)))));
      const reach = TM.length === 16 ? E.dists(4, TM, 0).dist.every((x) => x >= 0) : false;
      const trailsOk = arts.length === 3 && arts.every((a) => {
        const tr = a[1].split(',').map(Number);
        return tr[0] === 0 && tr[tr.length - 1] === +a[2] && tr.every((c, i) => !i || DIRS.some((d) => E.step(M, tr[i - 1], d) === c));
      });
      ok(sym && reach && opens === 30 && trailsOk, 'the tutorial maze is a spanning tree with walls agreeing from both sides, and each picture\'s trail goes through open sides only, ending at its ball');
    }

    // layout and drawing rules from earlier canvas bugs
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/maze/icon.svg'), 'utf8');
    ok(gm && icon.indexOf('fill="' + gm.soft + '"') > 0, 'the icon sits on the listed soft tint');
    ok(/\.mz-box canvas \{[^}]*width: 100%; height: 100%/.test(html), 'the canvas is sized by CSS width and height, so it does not keep its backing-store size (#919)');
    ok(/document\.fonts\.ready\.then/.test(html) && /ResizeObserver/.test(html) && /cv\.width !== [^;]*\|\| cv\.height !== /.test(html), 'the board redraws when the web font arrives and when its box changes, checking both sides of the backing store');
    ok(/class: 'ch-fit'/.test(html) && /ch-split/.test(html) && /ctx\.tutorialIfNew\(TUT\)/.test(html) && !/localStorage|history\.(push|replace)State/.test(html), 'core layout, a tutorial, no direct storage or history');
    ok(Date.now() - t0 < 3000, 'the Maze tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testMaze };
};
