'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #823: a maze-and-seeds chase with our own muncher and four beetles («لقمه‌خور» / Muncher)
  function testMuncher() {
    head('Muncher (#823)');
    const t0 = Date.now();
    const E = loadEngine('muncher', 'MuncherEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/muncher/index.html'), 'utf8');
    const W = E.W, H = E.H;
    const idx = (x, y) => y * W + x;
    // runs ticks; parks every beetle in the den when asked, so a test player meets none
    const run = (S, n, calm, each) => {
      for (let i = 0; i < n && !S.over; i++) {
        if (calm) S.ch.forEach((c) => { c.st = 'home'; c.wait = 1e9; });
        if (each) each(S);
        E.step(S);
      }
      return S;
    };
    // shortest walk from a tile to the nearest seed, as the first step's direction
    const toFood = (S, sx, sy) => {
      const prev = new Map([[idx(sx, sy), -1]]), q = [[sx, sy]];
      while (q.length) {
        const [x, y] = q.shift();
        if ((x !== sx || y !== sy) && S.food[idx(x, y)]) {
          let cur = idx(x, y), d = -1;
          while (prev.get(cur) !== -1) { const p = prev.get(cur); d = p.d; cur = p.from; }
          return d;
        }
        for (let d = 0; d < 4; d++) {
          if (!E.walk(S.M, x, y, d)) continue;
          const n = E.ahead(x, y, d), k = idx(n.x, n.y);
          if (!prev.has(k)) { prev.set(k, { from: idx(x, y), d }); q.push([n.x, n.y]); }
        }
      }
      return -1;
    };
    // it plans from the tile it is nearer to, so its plan never flips between two tiles
    const player = (S) => {
      const p = S.p, at = p.t >= 0.5 && p.d >= 0 ? E.ahead(p.x, p.y, p.d) : { x: p.x, y: p.y };
      // a seed on the tile it is heading for: keep going and eat it
      const d = S.food[idx(at.x, at.y)] && p.d >= 0 ? p.d : toFood(S, at.x, at.y);
      if (d >= 0) E.setWant(S, d);
    };

    // the five mazes
    ok(E.MAZES.length === 5 && E.STAGES === 5, 'there are five hand-made mazes');
    E.MAZES.forEach((M, i) => {
      const rows = M.rows, bad = [];
      let seeds = 0, berries = 0;
      ok(rows.length === H && rows.every((r) => r.length === W) && rows.every((r) => r === r.split('').reverse().join('')), 'maze ' + (i + 1) + ' is ' + W + '×' + H + ' and mirror-symmetric');
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = rows[y][x];
        if (c === '.') seeds++;
        if (c === 'o') berries++;
        if (!E.walkable(c)) continue;
        const ways = [0, 1, 2, 3].filter((d) => E.walk(M, x, y, d)).length;
        if (ways < 2) bad.push(x + ',' + y);
      }
      ok(berries === 4 && seeds > 120 && M.seeds === seeds + berries, 'maze ' + (i + 1) + ' has four berries and ' + seeds + ' seeds');
      ok(!bad.length, 'maze ' + (i + 1) + ' has no dead ends, so no beetle is ever trapped' + (bad.length ? ' (' + bad.join(' ') + ')' : ''));
      // every path tile is reachable from the start: nothing is walled off
      const seen = new Set([idx(M.start.x, M.start.y)]), q = [M.start];
      while (q.length) { const p = q.shift(); for (let d = 0; d < 4; d++) if (E.walk(M, p.x, p.y, d)) { const n = E.ahead(p.x, p.y, d); if (!seen.has(idx(n.x, n.y))) { seen.add(idx(n.x, n.y)); q.push(n); } } }
      let open = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (E.walkable(rows[y][x])) open++;
      ok(open > 150 && seen.size === open, 'maze ' + (i + 1) + ': all ' + open + ' path tiles join up, seeds and berries included (' + seen.size + ' reached)');
      ok(M.den.length === 3 && !!M.door && E.walkable(rows[M.exit.y][M.exit.x]) && M.home[idx(M.start.x, M.start.y)] > 0, 'maze ' + (i + 1) + ' has a den of three with a gate, and a way home from everywhere');
    });

    // moving and eating
    // a seed whose run opens on maze 1, where the start row runs left for five tiles
    let sd = 1;
    while (E.newGame(sd, 'medium').order[0] !== 0) sd++;
    let S = E.newGame(sd, 'medium');
    ok(S.lives === 3 && S.stage === 0 && S.p.d === -1 && S.ready === E.READY && S.order.slice().sort().join() === '0,1,2,3,4', 'a run starts still, with three lives, before the five mazes in a seeded order');
    const s0 = { x: S.p.x, y: S.p.y };
    // every start has a way left; it is walked until the next corner
    E.setWant(S, 'left'); run(S, E.READY - 1, true);
    ok(E.walk(S.M, s0.x, s0.y, 3) && S.p.x === s0.x && S.p.t === 0, 'nothing moves while "Ready" shows');
    run(S, 12, true);
    ok(S.p.x === s0.x - 1 && S.p.d === 3 && S.p.t > 0 && S.score === 10 && S.left === S.M.seeds - 1, 'then the muncher runs left and eats the seed it reaches (score ' + S.score + ')');
    const xBefore = S.p.x;
    E.setWant(S, 'right'); run(S, 1, true);
    ok(S.p.d === 1 && S.p.x === xBefore - 1 && S.p.t > 0, 'turning back is instant, even between two tiles');
    // into a hedge it stops instead of passing through
    S = E.newGame(7, 'medium'); S.ready = 0;
    E.setWant(S, 'down');
    const below = E.walk(S.M, S.p.x, S.p.y, 2);
    run(S, 20, true);
    ok(!below && S.p.d === -1 && S.p.y === S.M.start.y, 'a turn into a hedge is refused: the muncher waits for a way that is open');

    // a test player clears every maze when the beetles stay home: every seed can be eaten
    for (const seed of [1, 2]) {
      S = E.newGame(seed, 'easy');
      const cleared = [];
      run(S, 40000, true, (st) => { player(st); if (st.clear === E.CLEAR) cleared.push(st.M.i); });
      ok(S.over && S.won && S.cleared === 5 && cleared.slice().sort().join() === '0,1,2,3,4' && S.lives === 3, 'seed ' + seed + ': a test player eats every seed of all five mazes and wins (' + S.cleared + ' cleared, mazes ' + cleared.join(',') + ')');
    }

    // the beetles: each has its own way, the same for a seed, never still and never in a hedge
    S = E.newGame(5, 'medium');
    ok(E.KINDS.join() === 'direct,ambush,patrol,random' && S.ch.map((c) => c.kind).join() === E.KINDS.join(), 'four beetles: direct, ambush, patrol and random');
    S.ready = 0; S.p.face = 1;
    const [cd, ca, cp, cr] = S.ch;
    const td = E.target(S, cd), ta = E.target(S, ca), tp = E.target(S, cp);
    ok(td.x === S.p.x && td.y === S.p.y && ta.x === S.p.x + 4 && ta.y === S.p.y && tp.x === E.CORNERS[cp.k].x && E.target(S, cr) === null,
      'red aims at the muncher, violet four tiles ahead of it, blue at a corner, green at nothing');
    const trace = (seed, level) => {
      const st = E.newGame(seed, level), out = [], issues = [];
      let still = 0, moves = 0;
      for (let i = 0; i < 4000 && !st.over; i++) {
        player(st);
        const busy = st.ready || st.dying || st.clear;
        const before = st.ch.map((c) => E.pos(c));
        E.step(st);
        if (busy || st.ready || st.dying || st.clear) continue;
        st.ch.forEach((c, k) => {
          if (c.st === 'home') return;
          const a = before[k], b = E.pos(c);
          if (a.x === b.x && a.y === b.y) still++; else moves++;
          if (!E.walkable(st.M.rows[c.y][c.x]) && c.st !== 'eyes') issues.push(c.kind + '@' + c.x + ',' + c.y);
          if (c.x < 0 || c.x >= W || c.y < 0 || c.y >= H) issues.push(c.kind + ' off ' + c.x + ',' + c.y);
        });
        out.push(st.ch.map((c) => c.x + ',' + c.y + ',' + c.d + ',' + c.st).join(';'));
      }
      return { st, out: out.join('|'), still, moves, issues };
    };
    const a = trace(11, 'medium'), b = trace(11, 'medium'), c = trace(12, 'medium');
    ok(a.out.length > 1000 && a.out === b.out && a.st.score === b.st.score && a.st.deaths === b.st.deaths, 'the same seed and moves give the same beetles, step for step');
    ok(a.out !== c.out, 'another seed gives other beetles');
    ok(a.moves > 4000 && a.still === 0 && c.still === 0, 'a beetle out in the maze moves on every step (' + a.moves + ' moves, ' + (a.still + c.still) + ' still)');
    ok(!a.issues.length && !c.issues.length, 'no beetle ever stands in a hedge or leaves the maze' + (a.issues.length ? ' (' + a.issues.slice(0, 3).join(' ') + ')' : ''));
    ok(a.st.deaths > 0 || a.st.over, 'beetles do catch a test player that only chases seeds (' + a.st.deaths + ' lives lost)');
    // red catches a muncher that stands still, on every level
    for (const lv of ['easy', 'medium', 'hard']) {
      const st = E.newGame(3, lv);
      let caughtBy = null, n = 0;
      for (; n < 60 * 30 && !caughtBy; n++) { E.step(st); const e = E.drain(st).find((x) => x.t === 'die'); if (e) caughtBy = e.by; }
      ok(!!caughtBy && n < 60 * 25, lv + ': a muncher that never moves is caught within 25 s (by ' + caughtBy + ' after ' + (n / 60).toFixed(1) + ' s)');
    }
    const sp = ['easy', 'medium', 'hard'].map((k) => E.LEVELS[k]);
    ok(sp[0].bug < sp[1].bug && sp[1].bug < sp[2].bug && sp[0].frS > sp[1].frS && sp[1].frS > sp[2].frS && sp.every((l) => l.bug < l.me), 'harder levels have faster beetles and shorter berries; the muncher is always a little faster');

    // berries
    S = E.newGame(9, 'medium'); S.ready = 0;
    S.ch.forEach((c) => { c.st = 'out'; c.wait = 0; c.x = S.M.exit.x; c.y = S.M.exit.y; c.t = 0.4; c.d = 3; });
    const bx = S.p.x - 1, by = S.p.y;
    S.food[idx(bx, by)] = 2; E.setWant(S, 'left');
    run(S, 12);
    ok(S.fright > 0 && S.ch.every((c) => c.fr) && S.ch.every((c) => c.d === 1), 'a berry turns every beetle pale and round (' + S.ch.map((c) => c.d).join(',') + ')');
    // catching pale beetles in a row doubles each time, and all four on one berry is a feast
    S.ch.forEach((c, k) => { c.x = S.p.x; c.y = S.p.y; c.t = 0; c.d = 1; c.fr = true; });
    S.p.t = 0; const sc = S.score; E.step(S);
    const ev = E.drain(S);
    ok(ev.filter((e) => e.t === 'bug').map((e) => e.pts).join() === '200,400,800,1600' && S.score - sc >= 3000 && ev.some((e) => e.t === 'feast') && S.ch.every((c) => c.st === 'eyes'), 'pale beetles caught on one berry score 200, 400, 800, 1600 and make a feast');
    run(S, 600);
    ok(S.ch.every((c) => c.st !== 'eyes'), 'caught beetles find their way back to the den and come out again');
    S = E.newGame(9, 'medium'); S.ready = 0;
    const fr = Math.round(E.LEVELS.medium.frS / E.DT);
    S.food[idx(S.p.x - 1, S.p.y)] = 2; E.setWant(S, 'left');
    run(S, 12 + fr);
    ok(S.fright === 0 && S.ch.every((c) => !c.fr), 'the paleness wears off after the level\'s berry time');

    // lives and the end of a run
    S = E.newGame(4, 'hard');
    run(S, 60 * 60 * 3);
    ok(S.over && !S.won && S.lives === 0 && S.deaths === 3, 'a muncher that never moves loses its three lives and the run ends');
    // a saved run comes back in the same maze with the seeds it had left
    S = E.newGame(21, 'easy');
    run(S, 600, true, player);
    const snap = JSON.parse(JSON.stringify(E.snapshot(S)));
    const R = E.restore(snap);
    ok(!!R && R.M.i === S.M.i && R.left === S.left && R.score === S.score && R.lives === S.lives && R.food.join('') === S.food.join('') && R.ready === E.READY && R.p.x === R.M.start.x, 'a saved run comes back in its maze, with its seeds, score and lives, at the start of a life');
    ok(E.restore(Object.assign({}, snap, { food: 'x' })) === null && E.restore(Object.assign({}, snap, { lives: 0 })) === null && E.restore(Object.assign({}, snap, { order: [0, 0, 1, 2, 3] })) === null && E.restore(null) === null, 'a damaged save is refused');

    // the page
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'muncher');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/muncher/index.html' && gm.daily !== false, 'Muncher is listed as a one-player skill game with a daily run');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const A = lab(x), B = lab(y); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
    const lum = (x) => rgb(x).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const others = games.filter((g) => g.id !== 'muncher');
    const near = others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(others.length > 60 && near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/muncher/icon.svg'), 'utf8');
    ok(new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['mu-clear', 'mu-hard', 'mu-feast', 'mu-daily'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the four awards are in the core and unlocked by the game');
    ok(/C\.daily\('muncher', dailyDate\)\.rng\(\)/.test(html) && /C\.stats\.best\('muncher', 'score_' \+ lv/.test(html), 'the daily run is seeded by the day, and the best score is kept per level');
    ok(/ctx\.button\(\{ icon: 'gear', label: C\.t\('settings'\)/.test(html) && /title: C\.t\('settings'\), closeButton: true/.test(html) && /value: 'pad', label: C\.t\('ctrlPad'\)/.test(html) && !/ctrlPad/.test(html.slice(html.indexOf('function showHelp'), html.indexOf('function svgMe'))), 'level and arrow buttons sit behind a gear, not in help');
    ok(/C\.keyIs\(e, 'w'\)/.test(html) && /C\.keyIs\(e, 'a'\)/.test(html) && /ArrowUp: 'up'/.test(html), 'arrows and WASD turn, through C.keyIs');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    ok(!/pac|ghost|blinky|pinky|inky|clyde/i.test(html.replace(/pacing|space|capacity|opacity|ghostly/gi, '')) && !/pac|ghost/i.test(JSON.stringify(gm)), 'no trademarked name or character appears');
    const ms = Date.now() - t0;
    ok(ms < 6000, 'the Muncher tests finish in under 6 s (' + ms + ' ms)');
  }
  return { testMuncher };
};
