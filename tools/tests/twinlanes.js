'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;
  // #1212: two cars, one per thumb («دوقلو» / Twin Lanes)
  function testTwinLanes() {
    head('Twin Lanes (#1212)');
    const t0 = Date.now();
    const E = loadEngine('twinlanes', 'TwinLanesEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/twinlanes/index.html'), 'utf8');
    const run = (S, n) => { for (let i = 0; i < n && !S.over; i++) E.step(S); return S; };
    // a course made by hand: the seed's course replaced, everything else from fromSeed
    const course = (objs) => {
      const S = E.fromSeed(1);
      S.course = { objs: objs.slice().sort((a, b) => a.d - b.d), starts: S.course.starts, ends: S.course.ends };
      return S;
    };

    // the cars and the road
    let S = E.fromSeed(7);
    ok(S.lane[0] === 0 && S.lane[1] === 3 && S.lives === 3 && S.stage === 0 && !S.over, 'a run starts with the cars in the outer lanes, three lives, stage 1');
    ok(E.toggle(S, 0) && S.lane[0] === 1 && E.toggle(S, 1) && S.lane[1] === 2, 'a tap moves each car to its inner lane');
    ok(!E.toggle(S, 2) && !E.toggle(S, -1), 'only side 0 or 1 can be tapped');
    run(S, E.SWITCH);
    ok(S.x[0] === 1.5 && S.x[1] === 2.5, 'a lane change takes SWITCH ticks (' + S.x.join(', ') + ')');
    E.toggle(S, 0); run(S, 3); E.toggle(S, 0); run(S, 3);
    ok(S.lane[0] === 1 && Math.abs(S.x[0] - 1.5) < 1e-9, 'a second tap mid-move turns the car back');
    ok(E.drain(S).filter((e) => e.t === 'turn').length === 4, 'every tap is a turn event (for the sound)');

    // stars and barriers
    S = course([{ d: 1, lane: 0, kind: 'star' }]); run(S, 30);
    ok(S.stars === 1 && S.score === 10 && S.lives === 3, 'a star in the car\'s lane scores 10');
    S = course([{ d: 1, lane: 1, kind: 'star' }]); run(S, 30);
    ok(S.stars === 0 && S.lives === 2 && E.drain(S).some((e) => e.t === 'miss' && e.side === 0), 'a missed star costs a life');
    S = course([{ d: 1, lane: 3, kind: 'block' }]); run(S, 30);
    ok(S.lives === 2 && S.lost === 1 && E.drain(S).some((e) => e.t === 'hit' && e.side === 1), 'driving into a barrier costs a life');
    S = course([{ d: 1, lane: 2, kind: 'block' }]); run(S, 30);
    ok(S.lives === 3, 'a barrier in the other lane passes by');
    // 0.06 lanes a tick in stage 1: the barrier at 0.2 is passed on the fourth tick, while the car is mid-move
    S = course([{ d: 0.2, lane: 0, kind: 'block' }]); E.toggle(S, 0); run(S, 4);
    ok(S.x[0] > 0.8 && S.x[0] < 1.2 && S.lives === 2, 'a car still between its lanes counts as in both (x ' + S.x[0].toFixed(2) + ')');
    S = course([1, 2, 3].map((d) => ({ d, lane: 1, kind: 'star' }))); run(S, 60);
    ok(S.over && !S.won && S.lives === 0 && E.drain(S).some((e) => e.t === 'over'), 'the third lost life ends the run');

    // stages and the win
    S = E.fromSeed(5); S.course.objs = []; run(S, Math.ceil(S.course.ends[0] / (E.SPEED[0] * E.DT)) + 1);
    ok(S.stage === 1 && S.score === 50 && E.drain(S).some((e) => e.t === 'stage' && e.n === 1 && e.clean), 'stage 1 ends with a 50-point bonus, reported clean');
    ok(E.progress(S) < 0.01, 'progress restarts at the next stage');
    run(S, 1e6);
    ok(S.won && S.over && S.stage === 4 && S.score === 50 * (1 + 2 + 3 + 4 + 5) + 100 * 3, 'five stages win, with 100 a life left (' + S.score + ')');

    // courses from seeds
    ok(JSON.stringify(E.makeCourse(99)) === JSON.stringify(E.makeCourse(99)) && JSON.stringify(E.makeCourse(99)) !== JSON.stringify(E.makeCourse(100)), 'a course comes from its seed alone');
    let tight = 0, pairs = 0, both = 0, events = 0, stars = 0, starsLate = 0;
    for (let sd = 1; sd <= 60; sd++) {
      const C = E.makeCourse(sd * 7919);
      const ds = [[], []];
      for (const o of C.objs) {
        const sd2 = E.sideOf(o.lane), st = C.ends.findIndex((e) => o.d < e);
        const L = ds[sd2];
        if (!L.length || L[L.length - 1].d !== o.d) L.push({ d: o.d, st });
        if (o.kind === 'star') { stars++; if (st === 4) starsLate++; }
      }
      for (const L of ds) for (let i = 1; i < L.length; i++) {
        if (L[i].st !== L[i - 1].st) continue;
        pairs++;
        if ((L[i].d - L[i - 1].d) / E.SPEED[L[i].st] < E.MIN_SAME[L[i].st] - 1e-9) tight++;
      }
      const byD = new Map();
      for (const o of C.objs) byD.set(o.d + ':' + E.sideOf(o.lane), (byD.get(o.d + ':' + E.sideOf(o.lane)) || []).concat(o));
      for (const g of byD.values()) { events++; if (g.length > 2 || (g.length === 2 && g[0].lane === g[1].lane)) both++; }
    }
    ok(pairs > 5000 && tight === 0, 'two objects on one side are never closer than MIN_SAME, ' + E.MIN_SAME.map((m) => m * 1000).join('/') + ' ms (' + pairs + ' pairs)');
    ok(events > 5000 && both === 0, 'an event never fills both lanes of a side (' + events + ' events)');
    ok(E.MIN_SAME[4] * 60 > E.SWITCH * 3, 'even in stage 5 a thumb has over three lane changes of time');
    ok(stars > 3000 && starsLate > stars / 7, 'every stage carries stars, the fifth too (' + starsLate + ' of ' + stars + ')');

    // save and resume
    S = E.fromSeed(1212); run(S, 200); E.toggle(S, 1); run(S, 4);
    const R = E.restore(JSON.parse(JSON.stringify(E.snapshot(S))));
    run(S, 900); run(R, 900);
    ok(!!R && JSON.stringify(E.snapshot(S)) === JSON.stringify(E.snapshot(R)), 'a saved run resumes and plays on identically');
    const bad = (k, v) => E.restore(Object.assign(E.snapshot(S), { [k]: v })) === null;
    ok(E.restore(null) === null && E.restore({ seed: 1 }) === null && bad('stage', 5) && bad('lives', 4) && bad('lane', [2, 3]) && bad('x', [0, 9]) && bad('idx', 1e9) && bad('seed', NaN), 'a broken save is refused');

    // A test player: each car looks at the next object on its side and takes the lane it
    // needs. It must drive every seeded course and every daily course without a mistake.
    function drive(S) {
      while (!S.over) {
        const O = S.course.objs;
        for (let side = 0; side < 2; side++) {
          let want = -1;
          for (let i = S.idx; i < O.length; i++) {
            const o = O[i];
            if (E.sideOf(o.lane) !== side) continue;
            want = o.kind === 'star' ? o.lane : side * 2 + (o.lane === side * 2 ? 1 : 0);
            break;
          }
          if (want >= 0 && S.lane[side] !== want) E.toggle(S, side);
        }
        E.step(S);
      }
      return S;
    }
    const r1212 = rng(1212);
    let won = 0, lost = 0, n = 0, minScore = Infinity;
    for (let k = 0; k < 24; k++) {
      const st = drive(k < 20 ? E.newGame(r1212) : E.fromSeed(20261126 + k));
      n++; if (st.won) won++; lost += st.lost; minScore = Math.min(minScore, st.score);
    }
    ok(n === 24 && won === 24 && lost === 0, 'a test player drives 24 courses to the end without losing a life (' + won + '/' + n + ' won, ' + lost + ' lost)');
    ok(minScore > 1000, 'a clean run scores over 1000 (lowest ' + minScore + ')');

    // the page
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'twinlanes');
    ok(!!gm && games.filter((g) => g.id === 'twinlanes').length === 1, 'Twin Lanes is listed once');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/twinlanes/index.html' && gm.daily !== false, 'as a one-player skill game with a daily run');
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
    const others = games.filter((g) => g.id !== 'twinlanes');
    ok(others.length > 50, 'the accent check sees the catalogue (' + others.length + ' games)');
    const near = others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/twinlanes/icon.svg'), 'utf8');
    ok(new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['tl-win', 'tl-clean', 'tl-daily'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three awards are in the core and unlocked by the game');
    ok(/C\.daily\('twinlanes', dailyDate\)\.rng/.test(html) && /C\.stats\.best\('twinlanes', 'score'/.test(html), 'the daily run is seeded by the day, and the best score is kept');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    ok(/C\.keyIs\(/.test(html), 'letter keys go through C.keyIs, so they work on the Persian layout');
    ok(/canvas[^{]*\{[^}]*width:\s*100%[^}]*height:\s*100%/.test(html), 'the canvas is sized 100% by 100% in CSS (#919)');
    const ms = Date.now() - t0;
    // about 280 ms on the laptop; CI runs about three times slower (#678)
    ok(ms < 1000, 'the Twin Lanes tests finish in under 1 s (' + ms + ' ms)');
  }
  return { testTwinLanes };
};
