'use strict';
// Split out of tools/test.js, which reached the 1 MB guard (#654).
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, vm, os, spawnSync, ROOT, LOCALE_CODES } = T;
  // #651: a box-pushing puzzle as «انباردار» / Storekeeper ("Sokoban" is a product name).
  // Levels are made in code by pulling crates back from the goals, so every one must be
  // proven winnable here by a forward solver and by a bot that plays the real rules.
  function testStorekeeper() {
    const games = T.games();
    head('Storekeeper (#651)');
    const t0 = Date.now();
    const E = loadEngine('storekeeper', 'StorekeeperEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/storekeeper/index.html'), 'utf8');
    const rng = (seed) => { let x = seed >>> 0 || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
    // a corridor: keeper, floor, crate, mark, floor
    const L = { size: 'small', w: 7, h: 3, map: '#######' + '#   . #' + '#######', goals: [11], boxes: [10], player: 8, best: 1 };
    const S = E.start(L);
    ok(E.validLevel(L) && E.step(L, S, 1) === 'move' && S.player === 9 && S.moves === 1 && S.pushes === 0, 'a step onto floor walks, and counts a move but no push');
    ok(E.step(L, S, 1) === 'push' && S.boxes[0] === 11 && S.player === 10 && S.pushes === 1 && E.won(L, S), 'walking into a crate pushes it, and a crate on every mark wins');
    ok(E.step(L, S, 3) === 'move' && S.boxes[0] === 11, 'walking away from a crate leaves it: there is no pulling');
    const S2 = { boxes: [10, 11], player: 9, moves: 0, pushes: 0, face: 2 };
    ok(E.step(L, S2, 1) === 'blocked' && S2.player === 9 && S2.boxes.join() === '10,11' && S2.moves === 0, 'two crates in a row cannot be pushed, and nothing changes');
    const S3 = { boxes: [12], player: 11, moves: 0, pushes: 0, face: 2 };
    ok(E.step(L, S3, 1) === 'blocked' && E.step(L, E.start(L), 3) === 'wall', 'a crate against a wall cannot be pushed, and a wall stops the keeper');
    const C2 = { size: 'small', w: 5, h: 4, map: '#####' + '#   #' + '#  .#' + '#####', goals: [13], boxes: [6], player: 12, best: 1 };
    ok(E.stuck(C2, { boxes: [6] }, 6) && !E.stuck(C2, { boxes: [7] }, 7) && !E.stuck(C2, { boxes: [13] }, 13), 'a crate in a corner off a mark is stuck; one by a single wall or on a mark is not');
    ok(E.stars(10, 10) === 3 && E.stars(12, 10) === 2 && E.stars(13, 10) === 1 && E.stars(24, 20) === 2 && E.stars(25, 20) === 1, 'three stars at the fewest pushes, two within a fifth more (at least two), one otherwise: never a loss');
    const W = E.walk(L, [10], 8, 9);
    ok(Array.isArray(W) && W.join() === '1' && E.walk(L, [10], 8, 12) === null, 'a tap walks the shortest way around crates, and not through them');
    // generated levels: every size, many seeds; the forward solver agrees with the
    // generator's count, and a bot playing only step() solves each with that many pushes.
    // Large levels get 8 seeds, not 14: they were 1.1 s of the group's 1.7 s, and CI ran
    // the group past its 3 s limit (#678).
    let gen = 0, made = 0, agree = 0, played = 0, deep = 0, slow = 0, worst = 0;
    for (const size of E.ORDER) for (let k = 1; k <= (size === 'large' ? 8 : 14); k++) {
      gen++;
      const s = Date.now(), lv = E.generate(size, rng(k * 7919 + size.length));
      const ms = Date.now() - s; worst = Math.max(worst, ms); if (ms > 400) slow++;
      if (!lv || !E.validLevel(lv)) continue;
      made++;
      if (lv.best >= E.SIZES[size].min) deep++;
      // the page solves with this cap before showing a level
      const sol = E.solve(lv, lv.boxes, lv.player, 60000);
      if (!sol || sol.pushes !== lv.best) continue;
      agree++;
      const st = E.start(lv);
      let fine = true;
      for (const [b, d] of sol.path) {
        const route = E.walk(lv, st.boxes, st.player, b - E.off(lv, d));
        if (!route) { fine = false; break; }
        for (const r of route) if (E.step(lv, st, r) !== 'move') fine = false;
        if (E.step(lv, st, d) !== 'push') fine = false;
        if (!fine) break;
      }
      if (fine && E.won(lv, st) && st.pushes === lv.best) played++;
    }
    ok(made === gen, 'every size makes a valid level on every seed (' + made + '/' + gen + ')');
    ok(deep === gen, 'no level is shorter than its size\'s floor of pushes (' + deep + '/' + gen + ')');
    ok(agree === gen, 'the forward solver finds each level\'s answer in the generator\'s count of pushes (' + agree + '/' + gen + ')');
    ok(played === gen, 'a bot playing only the real steps solves every level in the fewest pushes (' + played + '/' + gen + ')');
    ok(slow === 0, 'no level takes over 400 ms to make (worst ' + worst + ' ms)');
    const a = E.generate('medium', rng(5)), b = E.generate('medium', rng(5));
    ok(a && b && a.map === b.map && a.boxes.join() === b.boxes.join() && a.player === b.player, 'the same seed gives the same level, so the daily is the same for everyone');
    const lv = E.generate('small', rng(3));
    ok(E.validState(lv, E.start(lv)) && !E.validState(lv, { boxes: lv.boxes.slice(1), player: lv.player, moves: 0, pushes: 0 }) &&
      !E.validState(lv, { boxes: lv.boxes, player: lv.boxes[0], moves: 0, pushes: 0 }) && !E.validState(lv, { boxes: [lv.boxes[0], lv.boxes[0]], player: lv.player, moves: 0, pushes: 0 }) &&
      !E.validLevel(Object.assign({}, lv, { size: 'huge' })) && !E.validLevel(Object.assign({}, lv, { map: lv.map.slice(1) })), 'a save is checked before it is restored (level shape, crate count, keeper, overlaps)');
    // the page
    const gm = games.find((g) => g.id === 'storekeeper');
    ok(!!gm && gm.cat === 'puzzle' && gm.people === 1 && gm.path === 'games/storekeeper/index.html' && gm.daily !== false, 'Storekeeper is listed as a one-player puzzle with a daily level');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (p, q) => { const A = lab(p), B = lab(q); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
    const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
    const others = games.filter((g) => g.id !== 'storekeeper');
    const near = others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(others.length > 40 && near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0, 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/storekeeper/icon.svg'), 'utf8');
    ok(new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['sk-best', 'sk-big', 'sk-daily'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three awards are in the core and unlocked by the game');
    ok(/C\.daily\('storekeeper', dailyDate\)\.rng/.test(html) && /var DAILY = 'medium'/.test(html), 'the daily level is medium and seeded by the day');
    ok(/E\.solve\(lv, lv\.boxes, lv\.player, 60000\)/.test(html) && /sol\.pushes === lv\.best/.test(html), 'the page solves every level again before showing it');
    ok(/\.sk-canvas \{[^}]*direction: ltr;/.test(html) && /C\.undoKey\(e\)/.test(html) && /ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3/.test(html), 'arrows move the way they point in every language, and undo has its keys');
    ok(!/<img|\.png|\.webp/.test(html) && !/sokoban/i.test(html) && !/sokoban/i.test(JSON.stringify(gm)), 'the warehouse is drawn in code, and the page never uses the product name');
    ok(Date.now() - t0 < 3000, 'the Storekeeper tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testStorekeeper };
};
