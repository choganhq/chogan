'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;
  // #771: a motorbike weaving through traffic («موتورسوار» / Moto Rush)
  function testMotoRush() {
    head('Moto Rush (#771)');
    const t0 = Date.now();
    const E = loadEngine('motorush', 'MotoRushEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/motorush/index.html'), 'utf8');
    const run = (S, n) => { for (let i = 0; i < n && !S.over; i++) E.step(S); return S; };
    const car = (lane, o, kind) => ({ lane, o: o || 0, len: E.LEN[kind || 'car'], kind: kind || 'car', paint: 0, md: 9, done: false });
    // a road with hand-placed traffic and nothing else coming
    const road = (waves, items) => {
      const S = E.fromSeed(771, false);
      S.waves = waves.map((w) => ({ y: w.y, span: Math.max(...w.cars.map((c) => c.o + c.len)), f: w.f || 0, cars: w.cars }));
      S.items = items || []; S.ny = 1e9;
      return S;
    };

    // the start, steering and speed
    let S = E.fromSeed(1, false);
    ok(S.p === 0 && S.x === E.START_LANE && S.tl === E.START_LANE && !S.over && S.waves.length > 0, 'a run starts in the second lane with traffic ahead');
    ok(E.base(0) === 26 && E.base(1e9) === 50 && E.base(4000) > E.base(2000), 'the speed starts at 26 m/s and ramps to 50');
    S = road([{ y: 500, cars: [car(3)] }]);
    ok(E.steer(S, -1) && S.tl === 0 && !E.steer(S, -1) && S.tl === 0, 'steering past the left edge is refused');
    S.tl = 3; S.x = 3;
    ok(!E.steer(S, 1) && S.tl === 3, 'and past the right edge');
    S = road([{ y: 500, cars: [car(3)] }]);
    E.steer(S, 1); run(S, 6);
    ok(S.x > 1 && S.x < 2, 'the bike slides toward its new lane (x ' + S.x.toFixed(2) + ')');
    run(S, 10);
    ok(S.x === 2, 'and settles there in about a sixth of a second');

    // crashes and near misses
    S = road([{ y: 6, cars: [car(1)] }]);
    run(S, 120);
    ok(S.over && !S.won && S.hit && S.hit.lane === 1 && E.drain(S).some((e) => e.t === 'crash'), 'riding into a car in the same lane ends the run');
    S = road([{ y: 6, cars: [car(2)] }]);
    run(S, 120);
    ok(!S.over && S.combo === 0 && S.nears === 0, 'a car in the next lane, passed centred, is no hit and no near miss');
    S = road([{ y: -1, cars: [car(2)] }]);
    S.x = 1.3;
    const sc0 = S.score;
    run(S, 60);
    const ev = E.drain(S);
    ok(!S.over && S.nears === 1 && S.combo === 1 && ev.some((e) => e.t === 'near' && e.combo === 1), 'passing a car closely is a near miss and starts a combo');
    ok(S.score - sc0 > 25, 'a near miss scores at least 25 (' + (S.score - sc0).toFixed(1) + ')');
    S = road([{ y: -1, cars: [car(2)] }]);
    // steering into the car's lane: the slide carries it past the hit line
    S.x = 1.55; S.tl = 2;
    run(S, 2);
    ok(S.over && S.hit.lane === 2, 'a bike half a lane into a car hits it');
    S = road([{ y: -1, cars: [car(2)] }, { y: 12, cars: [car(0)] }]);
    S.x = 1.3; run(S, 60); E.drain(S);
    S.waves[1].cars[0].md = 9; S.x = 0.7;
    run(S, 60);
    ok(S.combo === 2 && S.bestCombo === 2, 'a second near miss in time raises the combo to 2');
    run(S, E.COMBO_T + 5);
    ok(S.combo === 0 && S.bestCombo === 2, 'the combo resets after four seconds without a near miss');

    // the nitro bar
    S = road([{ y: 900, cars: [car(3)] }], [{ lane: 1, y: 4, got: false }, { lane: 1, y: 30, got: false }, { lane: 1, y: 60, got: false }]);
    run(S, 80);
    ok(S.picks === 1 && S.bar === E.PICK_ADD, 'a can in the bike\'s lane fills a third of the bar');
    const v0 = E.speed(S);
    const evb = [];
    for (let i = 0; i < 1000 && S.picks < 3 && !S.over; i++) { E.step(S); evb.push(...E.drain(S)); }
    ok(S.picks === 3 && S.bar === 0 && S.boostT > 0 && evb.some((e) => e.t === 'boost'), 'the third can fills the bar and starts the nitro');
    // #781: a pickup says how many of the three cans the bar holds, and the page shows it in every language
    const pk = evb.filter((e) => e.t === 'pick').map((e) => e.n);
    ok(pk.join(',') === '1,2,3', 'each pickup event carries the count of cans in the bar (' + pk.join(',') + ')');
    ok((html.match(/nitroN: '[^']*\{n\}[^']*\{m\}[^']*'/g) || []).length === LOCALE_CODES.length && /e\.n > 0 && e\.n < 3/.test(html), 'the pickup pop "Nitro n/3" exists in every language');
    ok(Math.abs(E.speed(S) - E.base(S.p) - E.BOOST_V) < 1e-9 && E.speed(S) > v0, 'nitro adds ' + E.BOOST_V + ' m/s');
    const sb = S.score, sp = E.speed(S);
    E.step(S);
    ok(Math.abs((S.score - sb) - sp * E.DT * 0.1 * 2) < 1e-9, 'the distance score is doubled during nitro');
    run(S, E.BOOST_T);
    ok(S.boostT === 0, 'the nitro wears off after three seconds');
    S = road([{ y: 900, cars: [car(3)] }], [{ lane: 3, y: 4, got: false }]);
    run(S, 80);
    ok(S.picks === 0, 'a can in another lane is missed');

    // the daily ride
    S = E.fromSeed(99, true);
    const r = E.restore(E.snapshot(S));
    r.p = E.DAILY_P - 1; r.waves = []; r.items = [];
    run(r, 60);
    ok(r.over && r.won && E.drain(r).some((e) => e.t === 'finish'), 'the daily ride ends at the finish line');
    S = E.fromSeed(99, true);
    for (let p = 0; p <= E.DAILY_P; p += 50) { S.p = p; E.ensure(S); }
    ok(S.ny > E.DAILY_P - 40 && S.waves.every((w) => w.y < E.DAILY_P), 'no traffic is placed beyond the daily finish');

    // the traffic generator: every wave leaves a lane open, and the gap after it is long
    // enough to reach the next open lane at full speed with nitro after a human's reaction
    let waves = 0, noFree = 0, overlap = 0, short = 0, minSlack = Infinity, sizes = [0, 0, 0, 0], late = [0, 0, 0, 0];
    for (let sd = 1; sd <= 60; sd++) {
      const G = E.fromSeed(sd * 7919, false), seen = [];
      for (let p = 0; p <= 16000; p += 100) {
        G.p = p; E.ensure(G);
        for (const w of G.waves) if (!seen.length || w.y > seen[seen.length - 1].y) seen.push(w);
      }
      for (let i = 0; i < seen.length; i++) {
        const w = seen[i], lanes = new Set(w.cars.map((c) => c.lane));
        waves++;
        if (lanes.has(w.f) || lanes.size !== w.cars.length || lanes.size > 3) noFree++;
        (w.y < 4000 ? sizes : late)[w.cars.length]++;
        if (i + 1 < seen.length) {
          const nx = seen[i + 1], gap = nx.y - (w.y + w.span);
          if (gap < 0) overlap++;
          const slack = gap - E.need(w.f, nx.f, w.y + w.span);
          if (slack < -1e-6) short++;
          minSlack = Math.min(minSlack, slack);
        }
      }
    }
    ok(waves > 6000 && noFree === 0, 'every wave of traffic leaves one lane free (' + waves + ' waves)');
    ok(overlap === 0 && short === 0, 'every gap reaches the next free lane in time, even on nitro after ' + E.REACT + ' s (smallest margin ' + minSlack.toFixed(2) + ' m)');
    const share3 = (a) => a[3] / (a[1] + a[2] + a[3]);
    ok(share3(late) > share3(sizes) * 2 && sizes[1] > sizes[3], 'traffic thickens: three-car rows are ' + (share3(sizes) * 100).toFixed(0) + '% early and ' + (share3(late) * 100).toFixed(0) + '% late');

    // determinism and saves
    const a = E.fromSeed(4242, false), b = E.fromSeed(4242, false);
    for (let i = 0; i < 900; i++) { if (i % 97 === 0) { E.steer(a, 1); E.steer(b, 1); } if (i % 131 === 0) { E.steer(a, -1); E.steer(b, -1); } E.step(a); E.step(b); }
    ok(JSON.stringify(E.snapshot(a)) === JSON.stringify(E.snapshot(b)), 'a run comes from its seed alone');
    ok(JSON.stringify(E.fromSeed(1, false).waves) !== JSON.stringify(E.fromSeed(2, false).waves), 'another seed gives other traffic');
    S = E.fromSeed(31, false); run(S, 200);
    const R = E.restore(JSON.parse(JSON.stringify(E.snapshot(S))));
    for (let i = 0; i < 600; i++) { if (i === 50) { E.steer(S, -1); E.steer(R, -1); } E.step(S); E.step(R); }
    ok(!!R && JSON.stringify(E.snapshot(S)) === JSON.stringify(E.snapshot(R)), 'a saved run resumes and plays on identically');
    ok(E.restore(null) === null && E.restore({}) === null && E.restore(Object.assign(E.snapshot(S), { tl: 7 })) === null && E.restore(Object.assign(E.snapshot(S), { waves: [{ y: 1, span: 2, cars: [{ lane: 0, o: 0, len: 4, kind: 'tank' }] }] })) === null, 'a broken save is refused');

    // A test player: it rides in the free lane of the row it is passing, and only after
    // that row is behind it and a human's reaction time has gone by does it steer for the
    // next free lane. Surviving proves the gaps are fair without perfect reflexes.
    function ride(S, maxTicks) {
      let wait = 0, cur = null;
      for (let i = 0; i < maxTicks && !S.over; i++) {
        const rear = S.p - E.BIKE_L, w = S.waves.find((x) => x.y + x.span > rear);
        if (w && w !== cur) {
          // a new row is next: wait out the reaction time once the last one is passed
          if (cur) wait = Math.ceil(E.REACT / E.DT);
          cur = w;
        }
        if (wait > 0) wait--;
        else if (cur && S.tl !== cur.f) E.steer(S, cur.f > S.tl ? 1 : -1);
        E.step(S); E.drain(S);
      }
      return S;
    }
    const r771 = rng(771);
    let dailies = 0, longest = Infinity, boosts = 0;
    for (let k = 0; k < 5; k++) {
      const D = ride(E.newGame(r771, true), 60 * 60 * 10);
      if (D.won) dailies++;
      boosts += D.picks;
    }
    ok(dailies === 5, 'a test player with a human\'s reaction time finishes five seeded daily rides (' + dailies + '/5)');
    let alive = 0;
    for (let k = 0; k < 3; k++) {
      const N = ride(E.newGame(r771, false), 60 * 60 * 6);
      if (!N.over) alive++;
      longest = Math.min(longest, N.d);
    }
    ok(alive === 3, 'and survives three six-minute endless rides at full speed (shortest ' + (longest / 1000).toFixed(1) + ' km)');
    ok(boosts > 10, 'riding the free lanes picks up cans (' + boosts + ' in five dailies)');

    // the page
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'motorush');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/motorush/index.html' && gm.daily !== false, 'Moto Rush is listed as a one-player skill game with a daily ride');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (p, q) => { const A = lab(p), B = lab(q); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
    const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const near = games.filter((g) => g.id !== 'motorush').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    const white = 1.05 / (lum(gm.color) + 0.05);
    ok(near[1] >= 15 && white >= 4.5 && white <= 7.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at ' + white.toFixed(2) + ':1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/motorush/icon.svg'), 'utf8');
    ok(new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['mo-run', 'mo-close', 'mo-daily'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three awards are in the core and unlocked by the game');
    ok(/nitro: function/.test(core) && /sfx\('nitro'\)/.test(html), 'the nitro sound is synthesized in the core');
    ok(/C\.daily\('motorush', dailyDate\)\.rng/.test(html) && /C\.stats\.best\('motorush', 'score'/.test(html), 'the daily ride is seeded by the day, and the best score is kept');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    ok(!/[Rr]acing [Mm]oto/.test(html) && !/[Rr]acing [Mm]oto/.test(JSON.stringify(gm)), 'the game carries its own name');
    const ms = Date.now() - t0;
    ok(ms < 8000, 'the Moto Rush tests finish in under 8 s (' + ms + ' ms)');
  }
  return { testMotoRush };
};
