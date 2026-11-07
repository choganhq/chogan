'use strict';
// #697: Carrom («کاروم»), a player's request by email. The striker, coins and pockets run
// on the shared table physics in www/lib/cue.js; the rules (queen and cover, fouls, the
// owed coin, early last coin) live in the engine and are checked here shot by shot.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  function testCarrom() {
    const games = T.games();
    head('Carrom (#697)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/carrom/index.html');
    ok(fs.existsSync(file), 'the Carrom page exists');
    if (!fs.existsSync(file)) return;
    const html = fs.readFileSync(file, 'utf8');
    const sandbox = { self: {}, module: { exports: {} }, console };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'www/lib/cue.js'), 'utf8'), sandbox, { filename: 'cue.js' });
    const m = html.match(/\/\* ==== ENGINE START ==== \*\/([\s\S]*?)\/\* ==== ENGINE END ==== \*\//);
    ok(!!m, 'the Carrom page has an engine block');
    if (!m) return;
    vm.runInContext(m[1], sandbox, { filename: 'carrom-engine.js' });
    const Cue = sandbox.self.ChoganCue, E = sandbox.module.exports(Cue);
    const lcg = (seed) => { let x = seed >>> 0 || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

    // The rack: striker, queen in the middle, nine white and nine black, nothing overlapping
    const B = E.board();
    const coins = B.b.slice(1);
    let overlap = 0;
    for (let i = 0; i < B.b.length; i++) for (let j = i + 1; j < B.b.length; j++) {
      const p = B.b[i], q = B.b[j];
      if (Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r - 1e-6) overlap++;
    }
    ok(B.b.length === 20 && B.b.every((b, i) => b.id === i) && E.left(B, 0) === 9 && E.left(B, 1) === 9 && B.b[1].x === 50 && B.b[1].y === 50 && coins.every((c) => c.r === E.RC) && B.b[0].r === E.RS && B.b[0].m > B.b[1].m,
      'the rack holds the striker, the queen in the middle and nine coins a side; the striker is bigger and heavier');
    ok(overlap === 0 && B.turn === 0 && B.b[0].y === E.S - E.BASE, 'nothing in the rack overlaps, and white breaks from the bottom line');
    ok(E.canPlace(B, 50) && !E.canPlace(B, E.XL - 1) && !E.canPlace(B, E.XR + 1) && E.shoot(E.board(), E.XR + 5, 0, 0.5) === null, 'the striker stands only on its line, between the two marks');

    // a board with only these coins in play: [id, x, y]
    const only = (list, turn) => {
      const M = E.board();
      M.b.forEach((b, i) => { if (i > 0) b.inPlay = false; });
      for (const [id, x, y] of list) { const b = M.b[id]; b.x = x; b.y = y; b.inPlay = true; }
      M.turn = turn || 0; M.shots = 5;
      E.place(M, E.freeX(M, 50));
      return M;
    };
    // a shot where exactly these bodies went in, with no physics
    const fake = (M, potted) => ({ balls: M.b.map((b) => Object.assign({}, b, { inPlay: b.inPlay && potted.indexOf(b.id) < 0 })), potted: potted.slice() });

    // A coin in the striker's way is blocked; the free spot beside it is found
    const Bl = only([[2, 50, E.S - E.BASE], [11, 30, 30], [1, 50, 50]]);
    const fx = E.freeX(Bl, 50);
    ok(!E.canPlace(Bl, 50) && E.canPlace(Bl, fx) && Math.abs(fx - 50) >= E.RS + E.RC - 1e-6 && Math.abs(fx - 50) < E.RS + E.RC + 0.5, 'a coin on the line blocks the striker there, and the nearest free spot is just clear of it');

    // Physics: the bot's straight-pot geometry, played without noise, really pots the coin
    const P = only([[2, 86, 22], [11, 20, 40]]);
    const pot = E.pots(P, E.LEVELS.hard).find((c) => c.score > 0);
    let potted = false;
    if (pot) { const s = E.run(E.shoot(P, pot.x, pot.angle, pot.power)); potted = s.potted.indexOf(2) >= 0 && s.potted.indexOf(0) < 0; }
    ok(!!pot && potted, 'a straight pot aimed with the engine\'s own geometry sends the coin into the pocket, and the striker stays out');
    const Sl = only([[11, 20, 20], [1, 20, 50], [2, 80, 50]]);
    const st = E.run(E.shoot(Sl, 50, -Math.PI / 2, 0.3));
    const went = E.S - E.BASE - st.balls[0].y;
    ok(st.potted.length === 0 && st.balls.every((b) => !b.vx && !b.vy) && Math.abs(went - E.slide(Cue.speedOf(E.T, 0.3))) < 2.5, 'a soft shot slides ' + went.toFixed(1) + ' units and stops, as the friction law says (' + E.slide(Cue.speedOf(E.T, 0.3)).toFixed(1) + ')');
    ok(Math.abs(E.slide(Cue.speedOf(E.T, E.powerFor(40))) - 40) < 0.1 && E.powerOf(E.PULL * 2) === 1 && E.powerOf(-3) === 0, 'the bot\'s power for a distance slides that far, and a pull is capped at a full shot');

    // Rules, shot by shot
    let M = only([[2, 40, 40], [3, 60, 40], [11, 40, 60], [1, 50, 50]]);
    let ev = E.resolve(M, fake(M, [2]));
    ok(ev.again && !ev.foul && M.turn === 0 && E.left(M, 0) === 1, 'your own coin in: you shoot again');
    ev = E.resolve(M, fake(M, []));
    ok(!ev.again && M.turn === 1 && M.shots === 7 && M.b[0].y === E.BASE, 'nothing in: the turn passes, and the striker moves to the other line');
    M = only([[2, 40, 40], [3, 60, 40], [11, 40, 60], [12, 60, 60], [1, 50, 50]], 1);
    ev = E.resolve(M, fake(M, [2]));
    ok(!ev.again && M.turn === 0 && ev.mine === 0 && ev.theirs === 1, 'the other side\'s coin in: it stays in for them, and the turn passes');

    // the striker in: a foul. The coin from that shot goes back, and one more already in
    M = only([[3, 60, 40], [4, 30, 40], [11, 40, 60], [1, 50, 50]]);
    ev = E.resolve(M, fake(M, [0, 3]));
    ok(ev.foul && ev.striker && M.turn === 1 && M.b[3].inPlay && M.b[2].inPlay && E.left(M, 0) === 3 && !ev.owe, 'the striker in is a foul: the coin of that shot comes back, one more of yours too, and the turn passes');
    // no coin of yours in yet: you owe one, paid with your next coin in
    M = only([[2, 40, 40], [3, 60, 40], [4, 30, 30], [5, 70, 30], [6, 30, 70], [7, 70, 70], [8, 35, 50], [9, 65, 50], [10, 50, 35], [11, 40, 60], [1, 50, 50]]);
    ev = E.resolve(M, fake(M, [0]));
    ok(ev.foul && ev.owe && M.debt[0] === 1 && M.turn === 1, 'a foul with none of yours in yet: you owe a coin');
    E.resolve(M, fake(M, []));
    ev = E.resolve(M, fake(M, [2, 3]));
    ok(ev.paid === 1 && M.debt[0] === 0 && M.b[2].inPlay && !M.b[3].inPlay && ev.again, 'the owed coin is paid with your next coin in, and you still shoot again');

    // the queen: in with your coin in the same shot, she is covered
    M = only([[2, 40, 40], [3, 60, 40], [11, 40, 60], [1, 50, 50]]);
    ev = E.resolve(M, fake(M, [1, 2]));
    ok(ev.covered && M.queenBy === 0 && ev.again && !M.b[1].inPlay, 'the queen and your coin in one shot: she is covered');
    // alone, then covered by the next shot
    M = only([[2, 40, 40], [3, 60, 40], [11, 40, 60], [1, 50, 50]]);
    ev = E.resolve(M, fake(M, [1]));
    ok(!ev.covered && M.pending === 0 && ev.again && M.queenBy === -1, 'the queen alone: you shoot again to cover her');
    ev = E.resolve(M, fake(M, [3]));
    ok(ev.covered && M.queenBy === 0 && M.pending === -1, 'a coin of yours in the next shot covers her');
    // alone, and not covered: she goes back to the centre and the turn passes
    M = only([[2, 40, 40], [3, 60, 40], [11, 40, 60], [1, 50, 50]]);
    E.resolve(M, fake(M, [1]));
    ev = E.resolve(M, fake(M, []));
    ok(ev.queenBack && M.b[1].inPlay && Math.hypot(M.b[1].x - 50, M.b[1].y - 50) < 0.01 && M.turn === 1 && M.pending === -1, 'not covered in the next shot: the queen goes back to the centre and the turn passes');
    // the centre taken: she goes to the free spot nearest it
    M = only([[2, 40, 40], [3, 60, 40], [11, 50, 50], [1, 30, 30]]);
    E.resolve(M, fake(M, [1]));
    E.resolve(M, fake(M, []));
    ok(M.b[1].inPlay && Math.hypot(M.b[1].x - 50, M.b[1].y - 50) >= 2 * E.RC - 1e-6 && Math.hypot(M.b[1].x - 50, M.b[1].y - 50) < 4 * E.RC, 'with a coin on the centre, the queen goes back beside it');

    // your last coin before the queen is covered: a foul, and it comes back
    M = only([[2, 40, 40], [11, 40, 60], [1, 50, 50]]);
    ev = E.resolve(M, fake(M, [2]));
    ok(ev.foul && ev.early && M.b[2].inPlay && M.turn === 1 && !M.over, 'your last coin in while the queen is uncovered is a foul, and the coin comes back');
    // the other side's last coin early: a foul too
    M = only([[2, 40, 40], [3, 60, 40], [11, 40, 60], [1, 50, 50]]);
    ev = E.resolve(M, fake(M, [11]));
    ok(ev.foul && ev.earlyOp && M.b[11].inPlay && M.turn === 1 && !M.over, 'the other side\'s last coin in before the queen is covered is a foul, and it comes back');

    // the win: all yours in with the queen covered; points for the other's coins and the queen
    M = only([[2, 40, 40], [11, 40, 60], [12, 60, 60], [1, 50, 50]]);
    E.resolve(M, fake(M, [1]));
    ev = E.resolve(M, fake(M, [2]));
    ok(M.over && ev.win === 0 && M.winner === 0 && ev.points === 2 + 3 && !ev.again, 'your last coin covering the queen wins the board: 2 for the coins left and 3 for the queen (' + ev.points + ')');
    M = only([[2, 40, 40], [11, 40, 60], [12, 60, 60]], 1);
    M.queenBy = 1;
    ev = E.resolve(M, fake(M, [2]));
    ok(M.over && M.winner === 0 && ev.points === 2, 'the other side covered the queen: your last coin still wins, without her 3 points');

    // saves
    M = only([[2, 40, 40], [3, 60, 40], [11, 40, 60], [1, 50, 50]]);
    M.debt = [1, 0];
    const snap = JSON.parse(JSON.stringify(E.snapshot(M)));
    const R = E.restore(snap);
    ok(!!R && R.turn === 0 && R.shots === 5 && R.debt[0] === 1 && R.b.every((b, i) => b.inPlay === M.b[i].inPlay && Math.abs(b.x - M.b[i].x) < 1e-9), 'a saved board comes back as it was');
    const bad = (f) => { const o = JSON.parse(JSON.stringify(snap)); f(o); return E.restore(o) === null; };
    ok([(o) => { o.turn = 2; }, (o) => { o.b.pop(); }, (o) => { o.b[3][0] = 500; }, (o) => { o.b[1][2] = 0; }, (o) => { o.queenBy = 0; }, (o) => { o.debt = [-1, 0]; }, (o) => { o.sx[0] = 3; }, (o) => { o.b.forEach((p, i) => { if (i >= 2 && i <= 10) p[2] = 0; }); }, (o) => { o.pending = 1; }].every(bad) && E.restore(null) === null,
      'a broken save is refused (turn, size, position, queen state, debt, striker spot, an empty side, a queen pending for the wrong side)');

    // the bots: every game ends, better levels win, and a bot thinks fast
    const play = (lv0, lv1, seed) => {
      const G = E.board(), rnd = lcg(seed);
      let n = 0, worst = 0;
      while (!G.over && n++ < 400) {
        const s0 = Date.now(), c = E.choose(G, G.turn === 0 ? lv0 : lv1, rnd);
        worst = Math.max(worst, Date.now() - s0);
        let s = E.shoot(G, c.x, c.angle, c.power);
        if (!s) s = E.shoot(G, E.freeX(G, c.x), c.angle, c.power);
        E.run(s);
        E.resolve(G, s);
      }
      return { over: G.over, winner: G.winner, worst };
    };
    let ended = 0, mWins = 0, worst = 0;
    const N = 4;
    for (let k = 0; k < N; k++) {
      // swap sides so neither level always breaks
      const r = k % 2 ? play('easy', 'medium', 101 + k) : play('medium', 'easy', 101 + k);
      if (r.over) ended++;
      if (r.winner === (k % 2 ? 1 : 0)) mWins++;
      worst = Math.max(worst, r.worst);
    }
    ok(ended === N, 'every bot game reaches its end (' + ended + '/' + N + ')');
    ok(mWins >= N - 1, 'the medium bot beats the easy one (' + mWins + '/' + N + ')');
    const H = E.board();
    for (let k = 0; k < 6; k++) { const c = E.choose(H, 'medium', lcg(k + 7)); const s = E.shoot(H, E.freeX(H, c.x), c.angle, c.power); E.run(s); E.resolve(H, s); }
    const h0 = Date.now();
    const hc = E.choose(H, 'hard', lcg(3));
    const hardMs = Date.now() - h0;
    ok(hc && isFinite(hc.angle) && hc.power > 0 && hc.power <= 1 && hardMs < 300 && worst < 300, 'a hard shot takes ' + hardMs + ' ms and the worst medium one ' + worst + ' ms, both well under a frame budget of waiting');

    // the page
    const gm = games.find((g) => g.id === 'carrom');
    ok(!!gm && gm.cat === 'skill' && gm.people === 2 && gm.path === 'games/carrom/index.html' && gm.daily !== false && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'Carrom is listed as a two-player skill game with a daily board, named in every language');
    ok(html.indexOf("var ACCENT = '" + gm.color + "'") > 0, 'the page uses the accent of games.json');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/carrom/icon.svg'), 'utf8');
    ok(new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['cm-win', 'cm-hard', 'cm-queen'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three awards are in the core and unlocked by the game');
    ok(/<script src="\.\.\/\.\.\/lib\/cue\.js"><\/script>/.test(html) && /C\.daily\('carrom', G\.daily \+ '\|t' \+ G\.M\.shots\)\.rng/.test(html), 'the page loads the shared table physics, and the daily bot is seeded by the day and the shot');
    ok(!/<img|\.png|\.webp|\.mp3|\.ogg/.test(html), 'the board, coins and sounds are made in code');
    ok(Date.now() - t0 < 4000, 'the Carrom tests finish in under 4 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testCarrom };
};
