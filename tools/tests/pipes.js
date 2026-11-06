'use strict';
// Split out of tools/test.js, which reached the 1 MB guard (#654).
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, vm, os, spawnSync, ROOT, LOCALE_CODES } = T;
  // #649: rotate pipe tiles until the water reaches every one
  function testPipes() {
    const games = T.games();
    head('Pipeworks (#649)');
    const t0 = Date.now();
    const E = loadEngine('pipes', 'PipesEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/pipes/index.html'), 'utf8');
    const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
    const { N, E: Ea, S, W } = E;
    ok(E.rot(N, 1) === Ea && E.rot(N | Ea, 1) === (Ea | S) && E.rot(W, 1) === N && E.rot(N | S, 3) === (Ea | W) && E.rot(N | Ea | S, 4) === (N | Ea | S), 'a quarter turn moves every opening clockwise, and four turns bring a tile back');
    ok(E.period(N | S) === 2 && E.period(N | Ea) === 4 && E.period(N) === 4 && E.period(15) === 1 && E.taps(N | S, 3) === 1 && E.taps(N | Ea, 1) === 3 && E.taps(N | Ea, 0) === 0, 'a straight pipe repeats after two turns, a bend after four, and the taps to the answer follow');
    ok(E.nb(5, 0, N) === -1 && E.nb(5, 4, Ea) === -1 && E.nb(5, 5, W) === -1 && E.nb(5, 6, S) === 11 && E.source(5) === 12 && E.source(7) === 24 && E.source(9) === 40, 'no wrap-around at the edges, and the source sits in the middle');
    // the generated shapes in place are a reference board; breaking it one tile at a time must not win
    const P5 = E.generate(5, rng(649)), zero5 = P5.base.map(() => 0);
    ok(E.won(5, P5.base, zero5) && !E.won(5, P5.base, P5.rot), 'the generator\'s shapes in place win, and the scrambled board does not start won');
    const leaf = P5.base.findIndex((m, i) => E.degree(m) === 1 && i !== E.source(5));
    const r1 = zero5.slice(); r1[leaf] = 2;
    const f1 = E.flow(5, P5.base, r1);
    ok(leaf >= 0 && !E.won(5, P5.base, r1) && f1.leaks > 0, 'one dead end turned away leaves an open end, so it is not a win (' + f1.leaks + ' open ends)');
    const mid = P5.base.findIndex((m, i) => E.degree(m) === 2 && E.period(m) === 4 && i !== E.source(5));
    const r2 = zero5.slice(); r2[mid] = 1;
    const f2 = E.flow(5, P5.base, r2);
    ok(mid >= 0 && !E.won(5, P5.base, r2) && (f2.count < 25 || f2.leaks > 0), 'a turned bend breaks the network (' + f2.count + ' of 25 wet, ' + f2.leaks + ' open ends)');
    // the answer is never stored: any arrangement that wets every tile with no open end wins,
    // so a straight turned by two still counts
    const str = P5.base.findIndex((m) => m === (N | S) || m === (Ea | W));
    const r3 = zero5.slice(); if (str >= 0) r3[str] = 2;
    ok(str >= 0 && E.won(5, P5.base, r3), 'a straight pipe turned half way round still wins: the board is read, not compared');
    ok(!/\bsol(ution)?\s*:/.test(html.slice(html.indexOf('ENGINE START'), html.indexOf('ENGINE END'))), 'the engine keeps no stored answer');
    ok(E.stars(10, 10) === 3 && E.stars(11, 10) === 2 && E.stars(15, 10) === 2 && E.stars(16, 10) === 1 && E.stars(999, 10) === 1, 'three stars within the fewest turns, two within half again, then one: never a loss');
    // an independent solver: try each tile's distinct turns row by row, checking the top and
    // left neighbours and the walls, and accept only a board the engine calls won
    const solve = (n, base) => {
      const NN = n * n, r = new Array(NN).fill(0); let nodes = 0, found = false;
      const opts = base.map((m) => { const o = []; for (let k = 0; k < E.period(m); k++) o.push(k); return o; });
      const fits = (i) => {
        const m = E.rot(base[i], r[i]), row = Math.floor(i / n), col = i % n;
        if ((row === 0 && (m & N)) || (col === 0 && (m & W)) || (row === n - 1 && (m & S)) || (col === n - 1 && (m & Ea))) return false;
        if (row > 0 && !!(m & N) !== !!(E.rot(base[i - n], r[i - n]) & S)) return false;
        if (col > 0 && !!(m & W) !== !!(E.rot(base[i - 1], r[i - 1]) & Ea)) return false;
        return true;
      };
      const go = (i) => {
        if (found || nodes++ > 200000) return;
        if (i === NN) { if (E.won(n, base, r)) found = true; return; }
        for (const k of opts[i]) { r[i] = k; if (fits(i)) go(i + 1); if (found) return; }
      };
      go(0);
      return found;
    };
    let gen = 0, made = 0, solved = 0, trees = 0, hard = 0;
    const g = rng(6490);
    for (const n of E.SIZES) for (let k = 0; k < 10; k++) {
      gen++;
      const P = E.generate(n, g);
      if (!P) continue;
      made++;
      const edges = P.base.reduce((s, m) => s + E.degree(m), 0) / 2;
      if (edges === n * n - 1 && E.won(n, P.base, P.base.map(() => 0))) trees++;
      if (P.par >= n && P.par === E.par(P.base, P.rot) && !E.won(n, P.base, P.rot)) hard++;
      if (solve(n, P.base.map((m, i) => E.rot(m, P.rot[i])))) solved++;
    }
    ok(gen === 30 && made === gen, 'every size makes a puzzle (' + made + '/' + gen + ')');
    ok(trees === gen, 'every puzzle is a spanning tree: n²−1 joins, and its shapes in place win (' + trees + '/' + gen + ')');
    ok(hard === gen, 'every puzzle starts unsolved and needs at least n taps (' + hard + '/' + gen + ')');
    ok(solved === gen, 'an independent solver wins every generated board from its scrambled turns (' + solved + '/' + gen + ')');
    const a = E.generate(7, rng(5)), b = E.generate(7, rng(5));
    ok(a && b && a.base.join() === b.base.join() && a.rot.join() === b.rot.join(), 'the same seed gives the same puzzle, so the daily is the same for everyone');
    const sv = { n: 5, base: P5.base, rot: P5.rot, locked: P5.base.map(() => false), moves: 3, par: P5.par };
    ok(E.valid(sv) && !E.valid(Object.assign({}, sv, { n: 7 })) && !E.valid(Object.assign({}, sv, { rot: sv.rot.map(() => 4) })) &&
      !E.valid(Object.assign({}, sv, { locked: sv.locked.slice(1) })) && !E.valid(Object.assign({}, sv, { base: sv.base.map(() => 1) })) && !E.valid(null),
      'a save is checked before it is restored (size, turns, locks, shapes that form a tree)');
    // the page
    ok(/function tap\(i\) \{[\s\S]{0,120}if \(S\.locked\[i\]\) \{[\s\S]{0,300}return;\s*\}\s*var wetBefore/.test(html), 'a locked tile does not turn and costs no move');
    ok(/LONG_MS = 420/.test(html) && /addEventListener\('contextmenu'/.test(html) && /C\.keyIs\(e, 'l'\)/.test(html) && /board\.addEventListener\('keydown'/.test(html), 'long press, right click and L lock a tile, and arrows move on the board');
    ok(/\.pw-board \{[^}]*direction: ltr;/.test(html) && /\.pw-cell--locked \{[^}]*outline/.test(html) && /C\.icon\('lock'/.test(html), 'the board is left to right in every language, and a locked tile has its own frame and a lock');
    ok(/C\.daily\('pipes', dailyDate\)\.rng/.test(html) && /DAILY_N = 7/.test(html), 'the daily 7×7 is seeded by the day');
    const gm = games.find((x) => x.id === 'pipes');
    ok(!!gm && gm.cat === 'puzzle' && gm.people === 1 && gm.path === 'games/pipes/index.html', 'Pipeworks is listed as a one-player puzzle');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (p, q) => { const A = lab(p), B = lab(q); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
    const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const near = games.filter((x) => x.id !== 'pipes').map((x) => [x.id, dE(x.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/pipes/icon.svg'), 'utf8');
    ok(new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['pw-clean', 'pw-big', 'pw-daily'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three awards are in the core and unlocked by the game');
    // "Pipes" and "FreeNet" are other products' names
    ok(!/\bPipes\b|FreeNet/.test(JSON.stringify(gm)) && !/\bPipes\b|FreeNet/.test(html.replace(/PipesEngineFactory/g, '')), 'the page and the listing never use another product\'s name');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    ok(Date.now() - t0 < 3000, 'the Pipeworks tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testPipes };
};
