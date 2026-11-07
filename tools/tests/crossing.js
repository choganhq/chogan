'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;
  // #653: a road-and-river crossing game with a hedgehog («گذرگاه» / Crossing)
  function testCrossing() {
    head('Crossing (#653)');
    const t0 = Date.now();
    const E = loadEngine('crossing', 'CrossingEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/crossing/index.html'), 'utf8');
    const SEEDS = [11, 22, 33, 44, 55];
    // a board with hand-made lanes: still traffic and still logs unless a test moves them
    const board = (lanes) => {
      const S = E.fromSeeds(SEEDS);
      for (let r = 1; r <= 11; r++) if (r !== E.MID) S.lanes[r] = { kind: E.isRoad(r) ? 'car' : 'log', dir: 1, v: 0, P: E.isRoad(r) ? 17 : 23, M: E.isRoad(r) ? 3 : 6, paint: 0, objs: [] };
      for (const r in lanes) S.lanes[r] = Object.assign({ dir: 1, v: 0, P: 23, M: 6, paint: 0 }, lanes[r]);
      return S;
    };
    const at = (S, row, px) => { S.row = row; S.px = px; S.cd = 0; S.reach = Math.min(S.reach, row); return S; };
    const run = (S, n) => { for (let i = 0; i < n; i++) E.step(S); return S; };

    // traffic
    let S = board({ 11: { kind: 'car', P: 17, M: 3, objs: [{ s: 8, len: 1 }] } });
    ok(S.row === E.START && S.px === E.START_X && S.lives === 3 && S.lv === 1, 'a run starts on the bottom verge, column 5, with three lives at level 1');
    ok(E.hop(S, 'up') && S.dying > 0 && S.cause === 'car' && S.lives === 2, 'hopping into a car costs a life (' + S.cause + ')');
    S = board({ 11: { kind: 'car', P: 17, M: 3, objs: [{ s: 10, len: 1 }] } });
    ok(E.hop(S, 'up') && !S.dying && S.row === 11, 'a car one square to the side does not hit');
    S = board({ 11: { kind: 'truck', P: 17, M: 3, dir: 1, v: 1, objs: [{ s: 3, len: 3 }] } });
    E.hop(S, 'up'); run(S, 150);
    ok(S.cause === 'car' && S.deaths === 1, 'a truck driving into the hedgehog hits it');
    // refused hops
    S = board({});
    ok(!E.hop(S, 'down') && S.row === E.START, 'nothing below the start: the hop is refused');
    at(S, 12, 0);
    ok(!E.hop(S, 'left') && S.px === 0 && E.hop(S, 'right') && S.px === 1, 'the screen\'s edge refuses a hop, the other way is fine');
    S = board({});
    E.hop(S, 'up');
    ok(!E.hop(S, 'up') && S.row === 11, 'no hop while the last one is in the air');
    run(S, E.HOP);
    ok(E.hop(S, 'up') && S.row === 10, 'the next hop is allowed once it lands');
    ok(S.score === 20, 'each new furthest row scores 10 (' + S.score + ')');
    E.hop(at(S, 10, 5), 'down'); run(S, E.HOP); E.hop(S, 'up');
    ok(S.score === 20, 'hopping back to a row already reached scores nothing');

    // the river
    S = at(board({ 5: { kind: 'log', v: 1, objs: [{ s: 10, len: 3 }] } }), E.MID, 5);
    E.hop(S, 'up');
    ok(S.row === 5 && !S.dying && E.onPlatform(S), 'a hop onto a log is safe');
    run(S, 60);
    ok(!S.dying && Math.abs(S.px - 6) < 0.02, 'the log carries the hedgehog with it (px ' + S.px.toFixed(3) + ')');
    ok(E.hop(S, 'right') && Math.abs(S.px - 7) < 0.02 && !S.dying, 'a hop along a log keeps the fractional column');
    run(S, E.HOP);
    ok(E.hop(S, 'down') && S.row === 6 && S.px === 7, 'back on the verge the column snaps to a whole square');
    S = at(board({ 5: { kind: 'log', objs: [] } }), E.MID, 5);
    E.hop(S, 'up');
    ok(S.dying > 0 && S.cause === 'water', 'open water drowns the hedgehog (' + S.cause + ')');
    S = at(board({ 4: { kind: 'log', v: 1, objs: [{ s: 15, len: 4 }] } }), 4, 10);
    run(S, 50);
    ok(S.cause === 'swept', 'a log carrying the hedgehog off the screen loses a life (' + S.cause + ')');
    S = at(board({ 5: { kind: 'turtle', objs: [{ s: 10, len: 3, D: 240, ph: 0 }] } }), E.MID, 5);
    E.hop(S, 'up'); run(S, 150);
    const halfway = E.objects(S, 5)[0];
    ok(!S.dying && halfway.depth > 0 && halfway.up, 'a diving group fades first and still holds the hedgehog');
    run(S, 40);
    ok(S.cause === 'water', 'once the turtles are under, the hedgehog falls in');
    S = at(board({ 5: { kind: 'turtle', objs: [{ s: 10, len: 3, D: 240, ph: 0 }] } }), E.MID, 5);
    run(S, 200); E.hop(S, 'up');
    ok(S.cause === 'water', 'a hop onto turtles that are under water is a splash');

    // burrows and levels
    S = at(board({}), 1, 5);
    ok(E.hop(S, 'up') && S.filled[2] === 1 && S.homes === 1 && S.row === E.START && S.px === E.START_X, 'hopping into an empty burrow fills it and starts the next hedgehog at the bottom');
    ok(S.score === 10 + 50 + 2 * 60, 'a burrow scores 60 plus 2 a second left (' + S.score + ')');
    ok(E.drain(S).some((e) => e.t === 'home' && e.b === 2), 'a home event names the burrow');
    at(S, 1, 5);
    ok(!E.hop(S, 'up') && S.homes === 1 && S.row === 1, 'a filled burrow refuses the hop');
    at(S, 1, 4);
    ok(!E.hop(S, 'up') && S.row === 1, 'the hedge between burrows refuses the hop');
    at(S, 1, 2.6);
    ok(E.hop(S, 'up') && S.filled[1] === 1, 'a hedgehog a little off a burrow still gets in');
    for (const b of [1, 7, 9]) { at(S, 1, b); E.hop(S, 'up'); }
    ok(S.lv === 2 && S.filled.every((v) => !v) && S.tick === 0 && S.homes === 5 && S.lives === 3, 'five burrows finish the level: level 2 starts with empty burrows');
    ok(E.drain(S).some((e) => e.t === 'level' && e.lv === 1 && e.clean), 'a level with no lost life is reported clean');
    // level 5 wins
    const snap5 = E.snapshot(E.fromSeeds(SEEDS)); snap5.lv = 5;
    S = E.restore(JSON.parse(JSON.stringify(snap5)));
    for (const b of E.BURROWS) { at(S, 1, b); E.hop(S, 'up'); }
    ok(S.won && S.over && S.lv === 5, 'filling five burrows on level 5 wins the run');
    ok(E.drain(S).some((e) => e.t === 'win') && S.score >= 500 + 200 * 3, 'the win pays the level bonus and 200 a life left (' + S.score + ')');
    // three lives
    S = board({ 5: { kind: 'log', objs: [] } });
    for (let k = 0; k < 3; k++) { at(S, E.MID, 5); E.hop(S, 'up'); run(S, E.DYING); }
    ok(S.over && !S.won && S.lives === 0 && S.deaths === 3, 'the third lost life ends the run');
    S = board({}); S.time = 2; run(S, 2);
    ok(S.cause === 'time' && S.lives === 2, 'the time bar running out costs a life');
    run(S, E.DYING);
    ok(S.time === E.LIFE && S.row === E.START && !S.dying, 'the next life starts with a full minute');

    // lanes from seeds
    ok(JSON.stringify(E.makeLevel(3, 1234)) === JSON.stringify(E.makeLevel(3, 1234)) && JSON.stringify(E.makeLevel(3, 1234)) !== JSON.stringify(E.makeLevel(3, 1235)), 'a level\'s lanes come from its seed alone');
    let overlap = 0, lanesSeen = 0, speed1 = 0, speed5 = 0, cars1 = 0, cars5 = 0;
    for (let sd = 1; sd <= 40; sd++) for (let lv = 1; lv <= 5; lv++) {
      const L = E.makeLevel(lv, sd * 7919);
      for (let r = 1; r <= 11; r++) {
        if (r === E.MID) continue;
        const ln = L[r]; lanesSeen++;
        const iv = ln.objs.map((o) => [o.s, o.s + o.len]).sort((a, b) => a[0] - b[0]);
        for (let i = 0; i < iv.length; i++) { const nx = i + 1 < iv.length ? iv[i + 1][0] : iv[0][0] + ln.P; if (iv[i][1] > nx + 1e-9) overlap++; }
        if (E.isRoad(r)) { if (lv === 1) { speed1 += ln.v; cars1 += ln.objs.length; } if (lv === 5) { speed5 += ln.v; cars5 += ln.objs.length; } }
      }
    }
    ok(lanesSeen === 2000 && overlap === 0, 'no two objects in a lane overlap (' + lanesSeen + ' lanes)');
    ok(speed5 > speed1 * 1.4 && cars5 > cars1, 'level 5 traffic is faster and busier than level 1 (speed ' + (speed5 / speed1).toFixed(2) + '×, ' + cars1 + ' → ' + cars5 + ' vehicles)');

    // save and resume: a restored run plays on exactly like the original
    S = E.fromSeeds(SEEDS); run(S, 90); E.hop(S, 'up'); run(S, 30);
    const R = E.restore(JSON.parse(JSON.stringify(E.snapshot(S))));
    run(S, 400); run(R, 400);
    ok(!!R && JSON.stringify(E.snapshot(S)) === JSON.stringify(E.snapshot(R)), 'a saved run resumes and plays on identically');
    ok(E.restore(null) === null && E.restore({ seeds: [1] }) === null && E.restore(Object.assign(E.snapshot(S), { lv: 9 })) === null, 'a broken save is refused');

    // A test player: a breadth-first search over hops every 12 ticks proves every level of
    // a run can be crossed, one burrow after another (a beam keeps the search small).
    const K = 12, BEAM = 90, ACTS = ['up', 'left', 'right', null, 'down'];
    function nextBurrow(S0) {
      let layer = [S0];
      for (let d = 0; d < E.LIFE / K && layer.length; d++) {
        const next = [], seen = new Set();
        for (const st of layer) for (const a of ACTS) {
          const c = E.clone(st);
          if (a && !E.hop(c, a)) continue;
          if (c.homes > st.homes || c.won) return c;
          if (c.dying) continue;
          run(c, K);
          if (c.dying) continue;
          const key = c.row + ':' + Math.round(c.px * 4);
          if (seen.has(key)) continue;
          seen.add(key); next.push(c);
        }
        next.sort((x, y) => x.row - y.row);
        layer = next.slice(0, BEAM);
      }
      return null;
    }
    const r653 = rng(653), runs = [];
    for (let k = 0; k < 3; k++) runs.push(E.newGame(r653));
    let crossed = 0, levels = 0, stuck = '', deaths = 0;
    for (let k = 0; k < runs.length; k++) {
      let st = runs[k];
      while (st && !st.won) {
        const n = nextBurrow(st);
        if (!n) { stuck += ' run ' + k + ' level ' + st.lv + ' burrow ' + (st.filled.filter(Boolean).length + 1) + ';'; break; }
        if (n.lv > st.lv || n.won) levels++;
        st = n; deaths += st.deaths;
      }
      if (st && st.won) crossed++;
    }
    ok(runs.length === 3 && crossed === 3 && levels === 15 && deaths === 0, 'a test player crosses all five levels of three seeded runs without losing a life (' + crossed + '/3 runs, ' + levels + ' levels' + (stuck ? '; stuck at' + stuck : '') + ')');

    // the page
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'crossing');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/crossing/index.html' && gm.daily !== false, 'Crossing is listed as a one-player skill game with a daily run');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
    const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const near = games.filter((g) => g.id !== 'crossing').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/crossing/icon.svg'), 'utf8');
    ok(new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['cx-home', 'cx-clean', 'cx-daily'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three awards are in the core and unlocked by the game');
    ok(/C\.daily\('crossing', dailyDate\)\.rng/.test(html) && /C\.stats\.best\('crossing', 'score'/.test(html), 'the daily run is seeded by the day, and the best score is kept');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    ok(!/fr[o]g/i.test(html) && !/fr[o]g/i.test(JSON.stringify(gm)), 'no frog anywhere: the hero is a hedgehog');
    const ms = Date.now() - t0;
    ok(ms < 8000, 'the Crossing tests finish in under 8 s (' + ms + ' ms)');
  }
  return { testCrossing };
};
