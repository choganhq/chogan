'use strict';
// Split out of tools/test.js, which reached the 1 MB guard (#654).
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, vm, os, spawnSync, ROOT, LOCALE_CODES } = T;
  // #650: a sliding-merge game, named Doubles ("2048" is the original's title, not ours)
  function testDoubles() {
    const games = T.games();
    head('Doubles (#650)');
    const t0 = Date.now();
    const E = loadEngine('doubles', 'DoublesEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/doubles/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const row = (vals, dir) => {
      const b = new Array(16).fill(0);
      vals.forEach((v, k) => { b[k] = v; });
      const r = E.slide(b, dir);
      return { line: r.b.slice(0, 4).join(' '), gain: r.gain, moved: r.moved };
    };
    // merges, one per tile per move, towards the wall the swipe points at
    ok(row([2, 2, 2, 2], 'left').line === '4 4 0 0', 'four 2s become two 4s, never an 8 (got ' + row([2, 2, 2, 2], 'left').line + ')');
    ok(row([4, 4, 8, 0], 'left').line === '8 8 0 0', 'a tile made by a merge does not merge again in the same move');
    ok(row([2, 2, 2, 0], 'left').line === '4 2 0 0' && row([2, 2, 2, 0], 'right').line === '0 0 2 4', 'three in a row: the pair nearest the wall merges');
    ok(row([2, 0, 0, 2], 'left').line === '4 0 0 0' && row([2, 0, 0, 2], 'left').gain === 4, 'tiles slide over gaps to merge, and the score gains the merged value');
    ok(row([2, 4, 8, 16], 'left').moved === false && row([2, 4, 8, 16], 'right').moved === false, 'a swipe that changes nothing is no move');
    const col = new Array(16).fill(0); col[0] = 2; col[4] = 2; col[12] = 4;
    const up = E.slide(col, 'up'), down = E.slide(col, 'down');
    ok(up.b[0] === 4 && up.b[4] === 4 && up.b[8] === 0 && down.b[12] === 4 && down.b[8] === 4 && down.b[0] === 0, 'columns merge up and down the same way');
    // a move spawns one tile only when the board changed
    const S = E.newGame(42);
    ok(S.b.filter(Boolean).length === 2 && S.b.every((v) => v === 0 || v === 2 || v === 4), 'a new game starts with two tiles of 2 or 4');
    const S0 = { b: [2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 0], score: 0, moves: 0, seed: 1, won: false };
    ok(E.move(S0, 'left') === null && S0.moves === 0, 'no tile appears after a swipe that moves nothing');
    const t = E.move(S0, 'right');
    ok(t && S0.b.filter((v) => !v).length === 0 && t.spawn && S0.moves === 1, 'one tile appears after a move that changed the board');
    // the spawn is 2 nine times in ten, and seeded
    let fours = 0, total = 0;
    for (let s = 0; s < 4000; s++) { const G = E.newGame(s * 7919); G.b.forEach((v) => { if (v) { total++; if (v === 4) fours++; } }); }
    ok(total === 8000 && fours / total > 0.08 && fours / total < 0.12, 'a new tile is a 4 about one time in ten (' + (100 * fours / total).toFixed(1) + '%)');
    const A = E.newGame(650), B = E.newGame(650);
    ['left', 'up', 'right', 'down', 'left', 'down'].forEach((d) => { E.move(A, d); E.move(B, d); });
    ok(A.b.join() === B.b.join() && A.seed === B.seed && E.newGame(651).b.join() + E.newGame(652).b.join() !== E.newGame(650).b.join() + E.newGame(650).b.join(),
      'the same seed spawns the same tiles, so the daily game is the same for everyone');
    // the goal and the end
    const W = { b: [1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 0, moves: 0, seed: 3, won: false };
    const w = E.move(W, 'left');
    ok(w.reached && W.b[0] === E.GOAL && W.score === 2048 && !w.over, 'two 1024s make the goal tile and the game is won');
    const W2 = { b: [2048, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 0, moves: 0, seed: 3, won: true };
    ok(!E.move(W2, 'right').reached, 'once the goal is there, later moves do not win it again');
    const full = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
    ok(!E.canMove(full) && E.canMove(full.map((v, i) => i === 1 ? 2 : v)) && E.canMove(full.map((v, i) => i === 5 ? 0 : v)), 'a full board with no equal neighbours has no move; a pair or a gap does');
    // a simple bot (best one-step board, corner first) plays every game to its end
    const rate = (b) => {
      let e = 0, mono = 0;
      for (let i = 0; i < 16; i++) { if (!b[i]) e++; if (i % 4 < 3 && b[i] >= b[i + 1]) mono++; if (i < 12 && b[i] >= b[i + 4]) mono++; }
      return e * 10 + mono * 3 + (b[0] === E.maxTile(b) ? 40 : 0);
    };
    let ended = 0, big = 0, sane = 0, played = 0, maxSeen = 0;
    for (let s = 1; s <= 30; s++) {
      const G = E.newGame(s * 104729);
      let turns = 0, consistent = true;
      while (E.canMove(G.b) && turns < 20000) {
        let bestDir = null, best = -1;
        for (const d of E.DIRS) { const r = E.slide(G.b, d); if (r.moved) { const v = rate(r.b) + r.gain; if (v > best) { best = v; bestDir = d; } } }
        const before = G.score, sum = G.b.reduce((a, v) => a + v, 0);
        const r = E.move(G, bestDir);
        if (!r || G.score !== before + r.gain || G.b.reduce((a, v) => a + v, 0) !== sum + r.spawn.v) consistent = false;
        turns++;
      }
      played++;
      if (!E.canMove(G.b) && G.b.every(Boolean)) ended++;
      if (E.maxTile(G.b) >= 256) big++;
      if (consistent) sane++;
      maxSeen = Math.max(maxSeen, E.maxTile(G.b));
    }
    ok(played === 30 && ended === played, 'every bot game ends on a full board with no move (' + ended + '/' + played + ')');
    ok(sane === played, 'tiles are never lost or made up: the board sum grows only by each new tile, and the score by each merge');
    // measured with these seeds: 26 of 30 games reach 256, best 512; a one-step greedy bot is no expert
    ok(big >= 24 && maxSeen >= 512, 'the bot reaches a 256 tile in most games (' + big + '/30, best ' + maxSeen + ')');
    ok(E.valid({ b: S.b, score: 0, moves: 0, seed: 5 }) && !E.valid({ b: S.b.slice(1), score: 0, moves: 0, seed: 5 }) &&
      !E.valid({ b: S.b.map((v) => v === 2 ? 3 : v === 4 ? 6 : v), score: 0, moves: 0, seed: 5 }) && !E.valid({ b: full, score: 0, moves: 0, seed: 5 }) &&
      !E.valid({ b: S.b, score: -1, moves: 0, seed: 5 }) && !E.valid(null), 'a save is checked before it is restored (size, tile values, a finished board, score)');
    // the page
    ok(/C\.daily\('doubles', dailyDate\)\.rng/.test(html) && ['db-2048', 'db-4096', 'db-daily'].every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.indexOf("id: '" + id + "'") > 0),
      'the daily game is seeded by the day, and the three awards exist and are unlocked');
    ok(/\.db-board \{[^}]*direction: ltr;/.test(html) && /\.db-board \{[^}]*touch-action: none;/.test(html) && /C\.keyIs\(e, 'w'\)/.test(html) && /C\.keyIs\(e, 'a'\)/.test(html) && /ArrowLeft: 'left'/.test(html),
      'swipes and arrows go the same way in every language, and WASD works on any keyboard layout');
    ok(/\.animate\(/.test(html) && /reduceMotion\(\)/.test(html) && /continued: cont/.test(html) && /againLabel: C\.t\('keepGoing'\)/.test(html),
      'tiles slide and pop (not in reduced motion), the goal offers to keep going, and a game kept going is not counted twice');
    // every tile colour reads in both themes
    const lumC = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const x = lumC(a), y = lumC(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const blocks = [html.match(/:root \{([^}]*)\}/), html.match(/:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/), html.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)].map((m) => m ? m[1].replace(/\s+/g, ' ').trim() : '');
    const keys = ['2', '4', '8', '16', '32', '64', '128', '256', '512', '1024', '2048', 'big'];
    let pairs = 0;
    const weak = [];
    blocks.forEach((b, k) => keys.forEach((v) => {
      const bg = (b.match(new RegExp('--db-' + v + ': (#[0-9A-Fa-f]{6})')) || [])[1], ink = (b.match(new RegExp('--db-' + v + '-i: (#[0-9A-Fa-f]{6})')) || [])[1];
      if (!bg || !ink) { weak.push(k + ':' + v + ' missing'); return; }
      pairs++;
      if (ratio(bg, ink) < 4.5) weak.push(k + ':' + v + ' ' + ratio(bg, ink).toFixed(2));
    }));
    ok(pairs === 36 && weak.length === 0 && blocks[1] === blocks[2], 'every tile value has its own colours with text at 4.5:1 or more in light and dark (' + pairs + ' pairs' + (weak.length ? '; ' + weak.join(', ') : '') + ')');
    const bgs = keys.map((v) => (blocks[0].match(new RegExp('--db-' + v + ': (#[0-9A-Fa-f]{6})')) || [])[1]);
    ok(bgs.every(Boolean) && new Set(bgs).size === keys.length, 'no two tile values share a colour');
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = list.find((g) => g.id === 'doubles');
    ok(!!gm && gm.cat === 'puzzle' && gm.daily === undefined, 'Doubles is listed as a puzzle with a daily game');
    ok(!!gm && Object.values(gm.name).every((n) => !/2048/.test(n)) && !/<title>[^<]*2048/.test(html), 'the game is never called 2048');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/doubles/icon.svg'), 'utf8');
    ok(icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, b) => { const P = lab(a), Q = lab(b); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
    const near = list.filter((g) => g.id !== 'doubles').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 3000, 'the Doubles tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testDoubles };
};
