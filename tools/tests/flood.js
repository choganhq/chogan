'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #822: lay pipe from a queue before the water comes («سیل» / Flood)
  function testFlood() {
    head('Flood (#822)');
    const t0 = Date.now();
    const E = loadEngine('flood', 'FloodEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/flood/index.html'), 'utf8');
    const { N, E: Ea, S, W } = E;
    const at = (r, c) => r * E.COLS + c;

    // the pieces route the water exactly
    ok(E.KINDS.length === 11 && E.KINDS.every((k) => E.PIECES[k]), 'eleven pieces: two straights, four bends, four tees and a cross');
    ok(E.exitOf('h', W) === Ea && E.exitOf('h', Ea) === W && E.exitOf('h', N) === 0 && E.exitOf('v', N) === S && E.exitOf('v', W) === 0, 'a straight passes water along its line and refuses it from the side');
    ok(E.exitOf('ne', N) === Ea && E.exitOf('ne', Ea) === N && E.exitOf('es', S) === Ea && E.exitOf('sw', W) === S && E.exitOf('wn', N) === W && E.exitOf('wn', S) === 0, 'each bend turns the water between its two openings, both ways');
    ok(E.exitOf('x', N) === S && E.exitOf('x', Ea) === W && E.exitOf('x', S) === N && E.exitOf('x', W) === Ea, 'a cross passes water straight through, either way');
    // a tee: from either end of its bar straight on, from its stem to its own right
    ok(E.PIECES.tn.turn === W && E.PIECES.te.turn === N && E.PIECES.ts.turn === Ea && E.PIECES.tw.turn === S, 'each tee turns water from its stem to the water\'s right (clockwise), the end its arrow marks');
    ok(E.exitOf('tn', N) === W && E.exitOf('tn', Ea) === W && E.exitOf('tn', W) === Ea && E.exitOf('tn', S) === 0 &&
      E.exitOf('tw', W) === S && E.exitOf('tw', N) === S && E.exitOf('tw', S) === N && E.exitOf('tw', Ea) === 0, 'water into a tee\'s bar runs straight through, into its stem it turns to the arrow, and the closed side refuses it');
    ok(/fl-arrow" transform="rotate\(' \+ ROT\[P\.turn\]/.test(html), 'the page draws each tee\'s arrow at its turning end');

    // a hand-made board: one level with its rocks cleared and pieces laid by hand
    const board = (src, dir, pieces) => {
      const St = E.level(1, 822, 'normal', 0);
      St.rock = St.rock.map(() => false); St.grid = St.grid.map(() => '');
      St.src = src; St.srcDir = dir;
      for (const k in pieces) St.grid[+k] = pieces[k];
      return St;
    };
    const runOut = (St, limit) => { const ev = []; let n = 0; while (!St.over && n++ < (limit || 60 * 600)) { E.step(St, E.DT); ev.push(...E.drain(St)); } return ev; };

    // an open end: the water stops where the pipe does
    let B = board(at(3, 3), Ea, { [at(3, 4)]: 'h', [at(3, 5)]: 'h', [at(3, 6)]: 'sw', [at(4, 6)]: 'v' });
    let ev = runOut(B);
    ok(B.over && !B.passed && B.filled === 4 && B.spill && B.spill.i === at(4, 6) && B.spill.side === S && B.spill.into === at(5, 6), 'the water runs through four pieces and spills out of the open end of the last (' + B.filled + ' filled)');
    ok(B.score === 4 * E.P_CELL && ev.filter((e) => e.t === 'fill').length === 4 && ev.some((e) => e.t === 'over' && !e.passed), 'each filled cell scores ten, and the spill ends the level short of its goal');
    // the board's edge is an open end too
    B = board(at(0, 5), Ea, { [at(0, 6)]: 'h', [at(0, 7)]: 'wn' });
    runOut(B);
    ok(B.over && B.filled === 2 && B.spill.into === -1 && B.spill.side === N, 'a pipe pointing off the board spills there');
    // a piece that does not fit is an open end
    B = board(at(3, 3), Ea, { [at(3, 4)]: 'h', [at(3, 5)]: 'v' });
    runOut(B);
    ok(B.over && B.filled === 1 && B.spill.into === at(3, 5) && B.segs[at(3, 5)].length === 0, 'a piece with no opening toward the water stops it, and stays dry');
    // the tee by its stem turns toward its arrow; a loop back into a used tee is a dead end
    B = board(at(3, 3), Ea, { [at(3, 4)]: 'tw', [at(4, 4)]: 'v' });
    runOut(B);
    ok(B.segs[at(3, 4)][0][0] === W && B.segs[at(3, 4)][0][1] === S && B.filled === 2 && B.spill.i === at(4, 4), 'water into a tee\'s stem turns to the arrow and goes on down');
    B = board(at(3, 3), Ea, { [at(3, 4)]: 'ts', [at(3, 5)]: 'sw', [at(4, 5)]: 'wn', [at(4, 4)]: 'ne' });
    runOut(B);
    ok(B.over && B.filled === 4 && B.spill.into === at(3, 4) && B.segs[at(3, 4)].length === 1, 'water that comes back to a tee it has run through meets a dead end: a tee is filled once');
    // the cross: a second pass along its other line, with a bonus
    B = board(at(3, 3), Ea, { [at(3, 4)]: 'x', [at(3, 5)]: 'sw', [at(4, 5)]: 'wn', [at(4, 4)]: 'ne', [at(2, 4)]: 'v' });
    ev = runOut(B);
    ok(B.filled === 6 && B.crosses === 1 && B.segs[at(3, 4)].length === 2 && B.segs[at(3, 4)][1][0] === S && B.score === 6 * E.P_CELL + E.P_CROSS && ev.filter((e) => e.t === 'cross').length === 1,
      'water crosses a cross twice, once across and once up; both passes count toward the goal and the second earns ' + E.P_CROSS + ' (' + B.filled + ' filled, ' + B.score + ' points)');
    B = board(at(3, 3), Ea, { [at(3, 4)]: 'x', [at(3, 5)]: 'sw', [at(4, 5)]: 'wn', [at(4, 4)]: 'ne' });
    ok(E.canEnter(B, at(3, 4), W) && !E.canEnter(B, at(3, 3), W), 'the source itself never takes water back');
    B.segs[at(3, 4)] = [[W, Ea]];
    ok(!E.canEnter(B, at(3, 4), W) && !E.canEnter(B, at(3, 4), Ea) && E.canEnter(B, at(3, 4), N) && E.canEnter(B, at(3, 4), S), 'a cross run across takes water again only up or down');
    B.segs[at(3, 4)].push([S, N]);
    ok([N, Ea, S, W].every((d) => !E.canEnter(B, at(3, 4), d)), 'a cross run both ways is full');

    // the countdown and the steady speed
    B = board(at(3, 0), Ea, { [at(3, 1)]: 'h', [at(3, 2)]: 'h', [at(3, 3)]: 'h', [at(3, 4)]: 'h', [at(3, 5)]: 'h', [at(3, 6)]: 'h', [at(3, 7)]: 'h' });
    const cd0 = B.cd, cev = [];
    let n = 0;
    while (B.cd > 0 && n++ < 60 * 60) { E.step(B, E.DT); cev.push(...E.drain(B)); }
    ok(cd0 === E.params(1, 'normal').cd && cev.filter((e) => e.t === 'count').map((e) => e.n).join() === '3,2,1' && cev[cev.length - 1].t === 'go' && Math.abs(n * E.DT - cd0) < 0.05 && B.filled === 0, 'no water moves for the countdown (' + cd0 + ' s), which calls 3, 2, 1 and go');
    const cellT = B.cellT;
    // half a cell for the source's outlet, then one cell per cellT
    for (let k = 0; k < Math.round((cellT * 3.5) / E.DT) + 2; k++) E.step(B, E.DT);
    ok(B.filled === 3 && !B.over, 'the water then fills one cell every ' + cellT + ' s (' + B.filled + ' after 3.5 cells of time)');
    ok(E.hurry(B) && B.hurry && !E.hurry(B), 'opening the tap makes the water rush, once');
    for (let k = 0; k < Math.round((E.HURRY_T * 4) / E.DT) + 2; k++) E.step(B, E.DT);
    ok(B.filled >= 6, 'rushing water fills a cell every ' + E.HURRY_T + ' s (' + B.filled + ')');
    B = board(at(3, 3), Ea, { [at(3, 4)]: 'h' });
    E.hurry(B); E.drain(B);
    ok(B.cd === 0 && !!B.head && B.head.i === at(3, 3), 'opening the tap during the countdown starts the water at once');

    // laying, swapping and the delay
    B = E.level(1, 7, 'normal', 0);
    const free = B.grid.map((_, i) => i).filter((i) => !B.rock[i] && i !== B.src && E.nb(B.src, B.srcDir) !== i);
    const q0 = B.queue.slice();
    ok(E.place(B, free[0]) === 'placed' && B.grid[free[0]] === q0[0] && B.queue.length === E.QUEUE && B.queue.slice(0, 4).join() === q0.slice(1).join() && B.busy === 0, 'tapping an empty cell lays the first piece of the queue there, and the queue moves up by one');
    B.score = 40;
    const was = B.grid[free[0]], q1 = B.queue.slice();
    ok(E.place(B, free[0]) === 'replaced' && B.grid[free[0]] === q1[0] && B.grid[free[0]] !== undefined && B.busy === E.REPLACE_T && B.score === 40 - E.P_REPLACE && B.replaced === 1, 'tapping a laid piece swaps it for the next one, costs ' + E.P_REPLACE + ' points and starts a ' + E.REPLACE_T + ' s wait (was ' + was + ')');
    const q2 = B.queue.slice();
    ok(E.place(B, free[1]) === 'busy' && B.grid[free[1]] === '' && B.queue.join() === q2.join(), 'nothing can be laid during the wait');
    for (let k = 0; k < Math.round(E.REPLACE_T / E.DT) + 1; k++) E.step(B, E.DT);
    ok(B.busy === 0 && E.place(B, free[1]) === 'placed', 'after the wait laying works again');
    B.score = 2; E.place(B, free[1]);
    ok(B.score === 0, 'a swap never takes the score below zero');
    ok(B.rock.some((r) => r) ? E.place(B, B.rock.indexOf(true)) === 'blocked' : true, 'a rock takes no piece');
    ok(E.place(B, B.src) === 'blocked', 'the source takes no piece');
    // a piece the water has entered can never be swapped
    B = board(at(3, 3), Ea, { [at(3, 4)]: 'h', [at(3, 5)]: 'h' });
    E.hurry(B);
    for (let k = 0; k < 4; k++) E.step(B, E.DT);
    const wetQ = B.queue.join();
    ok(B.segs[at(3, 4)].length === 1 && E.place(B, at(3, 4)) === 'wet' && B.grid[at(3, 4)] === 'h' && B.queue.join() === wetQ, 'a piece the water has entered is refused, unchanged, and the queue stays');
    ok(E.place(B, at(3, 5)) === 'replaced', 'the next piece, not yet reached, can still be swapped');

    // the levels get harder up to a ceiling
    const P = [1, 2, 3, 5, 8, 12, 20, 40].map((l) => E.params(l, 'normal'));
    ok(P.every((p, i) => i === 0 || (p.goal >= P[i - 1].goal && p.cd <= P[i - 1].cd && p.cellT <= P[i - 1].cellT && p.rocks >= P[i - 1].rocks)) && P[0].goal === 8 && P[0].rocks === 0 && P[7].goal <= 28 && P[7].cellT >= 1, 'each level asks for a longer goal with less time, faster water and more rocks, up to a ceiling (goal ' + P.map((p) => p.goal).join(',') + ')');
    const calm = E.params(4, 'calm'), brisk = E.params(4, 'brisk'), norm = E.params(4, 'normal');
    ok(calm.cd > norm.cd && calm.cellT > norm.cellT && brisk.cd < norm.cd && brisk.cellT < norm.cellT && calm.goal === norm.goal && brisk.goal === norm.goal, 'calm water gives more time and brisk less, for the same goal');

    // the generator: the source inside, the outlet free, the rocks counted, and room for the goal
    const free4 = (St, from, len) => {
      // an independent search for a walk of `len` free cells from the outlet
      const seen = new Set([St.src, from]); let nodes = 0;
      const go = (c, k) => { if (k >= len) return true; if (++nodes > 20000) return false;
        for (const d of E.DIRS) { const m = E.nb(c, d); if (m < 0 || seen.has(m) || St.rock[m]) continue; seen.add(m); if (go(m, k + 1)) return true; seen.delete(m); }
        return false; };
      return from >= 0 && !St.rock[from] && go(from, 1);
    };
    let gen = 0, good = 0, room = 0;
    for (let lv = 1; lv <= 12; lv++) for (let s = 0; s < 15; s++) {
      const St = E.level(lv, s * 7919 + lv * 31, 'normal', 0);
      gen++;
      if (!St) continue;
      const r = Math.floor(St.src / E.COLS), c = St.src % E.COLS, out = E.nb(St.src, St.srcDir);
      const rocks = St.rock.filter((x) => x).length, want = E.params(lv, 'normal').rocks;
      if (r > 0 && c > 0 && r < E.ROWS - 1 && c < E.COLS - 1 && out >= 0 && !St.rock[out] && !St.rock[St.src] && (rocks === want || rocks === Math.floor(want / 2)) &&
        St.queue.length === E.QUEUE && St.grid.every((p) => p === '') && St.cd === E.params(lv, 'normal').cd) good++;
      if (free4(St, out, St.goal + 4)) room++;
    }
    ok(gen === 180 && good === gen, 'every generated level puts the source off the edge with its outlet free, the level\'s rocks and an empty board (' + good + '/' + gen + ')');
    ok(room === gen, 'on every generated level an independent search finds a walk of goal + 4 free cells from the outlet (' + room + '/' + gen + ')');
    const a = E.level(3, 12345, 'normal', 0), b = E.level(3, 12345, 'normal', 0), c3 = E.level(3, 54321, 'normal', 0);
    for (let k = 0; k < 6; k++) { E.place(a, k + 1 === a.src ? 9 : k + 1); E.place(b, k + 1 === b.src ? 9 : k + 1); }
    ok(JSON.stringify(E.snapshot(a)) === JSON.stringify(E.snapshot(b)) && (c3.src !== a.src || c3.rock.join() !== a.rock.join() || c3.queue.join() !== E.level(3, 12345, 'normal', 0).queue.join()), 'the same seed gives the same board and the same queue, so the daily run is the same for everyone');
    const counts = {};
    const Q = E.level(1, 99, 'normal', 0);
    for (let k = 0; k < 4000; k++) { const p = Q.queue[0]; counts[p] = (counts[p] || 0) + 1; E.place(Q, 9); Q.busy = 0; Q.grid[9] = ''; }
    ok(E.KINDS.every((k) => counts[k] > 100) && counts.h > counts.tn && counts.x > counts.tn, 'every piece comes up, straights more often than tees (' + E.KINDS.map((k) => k + ' ' + counts[k]).join(', ') + ')');

    // a test player on the real rules: it plans a route from the open end of the laid pipe,
    // lays pieces that fit the route or turn it, dumps the rest far away, swaps a piece that
    // leads nowhere, opens the tap once the goal is laid, and taps every half second
    const dirTo = (x, y) => E.DIRS.find((d) => E.nb(x, d) === y);
    const walk = (St) => {
      let c = St.src, out = St.srcDir, len = 0; const used = new Set([St.src]), axes = {};
      for (;;) {
        const j = E.nb(c, out), inS = E.opp(out);
        if (j < 0 || !St.grid[j] || !E.exitOf(St.grid[j], inS)) return { f: j, inS, len, used, last: c };
        const ax = inS === N || inS === S ? 'v' : 'h';
        if (used.has(j) && !(St.grid[j] === 'x' && axes[j] && axes[j] !== ax)) return { f: -2, inS, len, used, last: c };
        used.add(j); axes[j] = ax; len++; c = j; out = E.exitOf(St.grid[j], inS);
        if (len > 200) return { f: -2, len, used, last: c };
      }
    };
    const plan = (St, from, used, need, rnd) => {
      if (from < 0 || St.rock[from] || used.has(from) || from === St.src || St.segs[from].length) return null;
      const seen = new Set(used); seen.add(from); const p = [from]; let nodes = 0;
      const okc = (m) => m >= 0 && !seen.has(m) && !St.rock[m] && m !== St.src && !St.segs[m].length;
      const go = () => {
        if (p.length >= need) return true;
        if (++nodes > 4000) return false;
        const ds = E.DIRS.map((d) => E.nb(p[p.length - 1], d)).filter(okc).sort((x, y) => (St.grid[x] ? 1 : 0) - (St.grid[y] ? 1 : 0) || rnd() - 0.5);
        for (const m of ds) { seen.add(m); p.push(m); if (go()) return true; p.pop(); seen.delete(m); }
        return false;
      };
      return go() ? p : null;
    };
    const play = (St, rnd, pace) => {
      let steps = 0, route = null, hurried = false;
      const advance = () => { for (let i = 0; i < Math.round(pace / E.DT) && !St.over; i++) { E.step(St, E.DT); E.drain(St); } };
      const fits = (p, q) => { const x = E.exitOf(p, q.inS); return q.out ? x === q.out : x !== 0 && E.nb(q.c, x) >= 0; };
      while (!St.over && steps++ < 3000) {
        const w = walk(St), need = St.goal + 2 - w.len;
        if (need <= 0) { if (!hurried) { E.hurry(St); hurried = true; } advance(); continue; }
        if (St.busy > 0) { advance(); continue; }
        const stuck = () => { if (w.last !== St.src && !St.segs[w.last].length) E.place(St, w.last); advance(); };
        if (w.f < 0) { stuck(); continue; }
        if (!route || route[0] !== w.f || route.some((x) => w.used.has(x))) route = plan(St, w.f, w.used, need, rnd);
        if (!route) { stuck(); continue; }
        const R = route.map((x, k) => ({ c: x, inS: k === 0 ? w.inS : E.opp(dirTo(route[k - 1], x)), out: k < route.length - 1 ? dirTo(x, route[k + 1]) : 0 }));
        const p = St.queue[0];
        let target = -1;
        const slot = R.filter((q) => !(St.grid[q.c] && fits(St.grid[q.c], q))).find((q) => fits(p, q));
        if (slot) target = slot.c;
        else {
          const x = E.exitOf(p, w.inS);
          if (x) { const u = new Set(w.used); u.add(w.f); if (plan(St, E.nb(w.f, x), u, need - 1, rnd)) { target = w.f; route = null; } }
        }
        if (target < 0) {
          const on = new Set(route || []), fr = Math.floor(w.f / E.COLS), fc = w.f % E.COLS;
          let best = -1, bd = -1;
          for (const emptyOnly of [true, false]) {
            for (let i = 0; i < E.NN; i++) {
              if (St.rock[i] || i === St.src || on.has(i) || w.used.has(i) || St.segs[i].length || (emptyOnly && St.grid[i])) continue;
              const dd = Math.abs(Math.floor(i / E.COLS) - fr) + Math.abs(i % E.COLS - fc);
              if (dd > bd) { bd = dd; best = i; }
            }
            if (best >= 0) break;
          }
          target = best;
        }
        if (target >= 0) E.place(St, target);
        advance();
      }
      return St;
    };
    const mb = (seed) => { let x = seed >>> 0; return () => { x = (x + 0x6D2B79F5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const per = [0, 0, 0, 0, 0, 0], fails = [];
    let runs = 0;
    for (let lv = 1; lv <= 5; lv++) for (let s = 1; s <= 30; s++) {
      runs++;
      const St = play(E.level(lv, s * 9973 + lv, 'normal', 0), mb(s), 0.5);
      if (St.passed) per[lv]++; else fails.push(lv + ':' + s + ' ' + St.filled + '/' + St.goal);
    }
    const won = per.reduce((x, y) => x + y, 0);
    ok(runs === 150 && per[1] === 30 && per[2] === 30 && per[3] === 30, 'a test player on the real rules, tapping every half second, clears every one of 30 boards at levels 1, 2 and 3 (' + per.slice(1, 4).join(', ') + ')');
    ok(won >= 145, 'and at least 145 of 150 boards across levels 1–5 (' + won + (fails.length ? '; short: ' + fails.join(', ') : '') + ')');
    // a slower player still gets somewhere, and the later levels really are harder
    let slow = 0, late = 0;
    for (let s = 1; s <= 20; s++) { if (play(E.level(1, s * 31, 'normal', 0), mb(s), 0.9).passed) slow++; if (play(E.level(12, s * 31, 'normal', 0), mb(s), 0.9).passed) late++; }
    ok(slow >= 18 && late < slow, 'a player tapping every 0.9 s clears level 1 (' + slow + '/20) and fewer of level 12 (' + late + '/20)');

    // saves
    B = E.level(2, 4242, 'normal', 30);
    for (let k = 0; k < 10; k++) { const i = (k * 13) % E.NN; if (!B.rock[i] && i !== B.src) E.place(B, i); }
    for (let k = 0; k < 60 * 30; k++) E.step(B, E.DT);
    E.drain(B);
    const snap = JSON.parse(JSON.stringify(E.snapshot(B))), back = E.restore(snap);
    for (let k = 0; k < 60 * 20; k++) { E.step(B, E.DT); E.step(back, E.DT); }
    E.drain(B); E.drain(back);
    ok(!!back && JSON.stringify(E.snapshot(B)) === JSON.stringify(E.snapshot(back)), 'a saved level restores and plays on exactly like the original');
    const bad = (f) => { const o = JSON.parse(JSON.stringify(snap)); f(o); return E.restore(o) === null; };
    ok(E.restore(null) === null && bad((o) => { o.v = 2; }) && bad((o) => { o.grid[0] = 'zz'; }) && bad((o) => { o.queue.pop(); }) && bad((o) => { o.speed = 'turbo'; }) &&
      bad((o) => { o.grid[o.src] = 'h'; }) && bad((o) => { o.score = -1; }) && bad((o) => { o.segs = o.segs.slice(1); }) && bad((o) => { o.cd = 5; o.head = { i: 0, p: 0 }; }),
      'a broken save is refused: wrong version, an unknown piece, a short queue, an unknown speed, a piece on the source, a negative score, a short board, a countdown with water running');

    // the page
    const games = T.games();
    const gm = games.find((g) => g.id === 'flood');
    ok(!!gm && gm.cat === 'puzzle' && gm.people === 1 && gm.path === 'games/flood/index.html' && gm.daily !== false && gm.added === '2026-11-12', 'Flood is listed as a one-player puzzle with a daily run');
    ok(!!gm && LOCALE_CODES.length >= 7 && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language (' + LOCALE_CODES.length + ')');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const A = lab(x), Bb = lab(y); return Math.hypot(A[0] - Bb[0], A[1] - Bb[1], A[2] - Bb[2]); };
    const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const near = games.filter((g) => g.id !== 'flood').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(!!gm && near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/flood/icon.svg'), 'utf8');
    ok(!!gm && new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const AW = ['fl-five', 'fl-cross', 'fl-long', 'fl-daily'];
    ok(AW.every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '[^\\n]*dpl: '[^\\n]*dfr: '").test(core) && html.indexOf("'" + id + "'") > 0), 'the four awards exist in every language and the game unlocks them');
    const titles = [...core.matchAll(/\{ id: '([a-z0-9-]+)',\s+icon: '[a-z]+',\s+fa: '([^']+)',\s+en: '([^']+)'/g)];
    const mine = titles.filter((m) => AW.indexOf(m[1]) >= 0);
    ok(mine.length === 4 && mine.every((m) => titles.filter((o) => o[2] === m[2] || o[3] === m[3]).length === 1), 'their titles are used by no other award (' + mine.map((m) => m[3]).join(', ') + ')');
    ok(/C\.daily\('flood', run\.daily\)\.rng/.test(html) && /C\.stats\.daily\('flood', run\.daily/.test(html) && /speed: dailyDate \? 'normal'/.test(html), 'the daily run is seeded by the day at normal speed, and recorded');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    ok(/ctx\.button\(\{ icon: 'gear', label: C\.t\('settings'\)/.test(html) && !/function showHelp\(\) \{[\s\S]{0,700}segmented/.test(html), 'the water speed sits behind a gear, not in the help window');
    ok(/C\.keyIs\(e, 'f'\)/.test(html) && /C\.keyIs\(e, 'n'\)/.test(html) && /ArrowUp: \[0, -1\]/.test(html) && /svg\.addEventListener\('pointerdown'/.test(html), 'arrows move a cursor, Space or Enter lays, F and N work on any keyboard layout, and a tap acts on press');
    ok(!/\binset\s*:/.test(html), 'no inset shorthand');
    // "Pipe Mania" and "Pipe Dream" are another product's names
    ok(!/pipe ?mania|pipe ?dream/i.test(html) && !/pipe ?mania|pipe ?dream/i.test(JSON.stringify(gm)), 'the page and the listing never use the classic\'s name');
    const ms = Date.now() - t0;
    ok(ms < 4000, 'the Flood tests finish in under 4 s (' + ms + ' ms)');
  }
  return { testFlood };
};
