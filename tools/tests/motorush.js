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
    ok((html.match(/nitroN: '[^']*\{n\}[^']*\{m\}[^']*'/g) || []).length === LOCALE_CODES.length && /e\.n > 0 && e\.n < e\.m/.test(html), 'the pickup pop "Nitro n/3" exists in every language');
    // #782 follow-up: the speed eases toward nitro's target instead of jumping, so the
    // check reads the target at once and the speed only after the burst has had time to build
    ok(Math.abs(E.target(S) - E.base(S.p) - E.BOOST_V) < 1e-9 && E.speed(S) < E.target(S), 'nitro raises the speed\'s target by ' + E.BOOST_V + ' m/s');
    run(S, 62);
    ok(Math.abs(E.speed(S) - E.base(S.p) - E.BOOST_V) < 1e-9 && E.speed(S) > v0, 'nitro adds ' + E.BOOST_V + ' m/s once it has built up');
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

  // #782 (a gas pedal) and #783 (levels, cars that change lanes, Easy/Medium/Hard). The
  // generator's promise must hold in the worst case: gas and nitro at once, on every
  // difficulty, with lane changers.
  function testMotoRushGasLevels() {
    head('Moto Rush: gas, levels, lane changers, difficulty (#782, #783)');
    const t0 = Date.now();
    const E = loadEngine('motorush', 'MotoRushEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/motorush/index.html'), 'utf8');
    const DIFFS = ['easy', 'medium', 'hard'];
    const run = (S, n) => { for (let i = 0; i < n && !S.over; i++) E.step(S); return S; };
    const car = (lane, o, kind) => ({ lane, o: o || 0, len: E.LEN[kind || 'car'], kind: kind || 'car', paint: 0, md: 9, done: false });
    const road = (waves, diff) => {
      const S = E.fromSeed(782, false, diff);
      S.waves = waves; S.items = []; S.ny = 1e9;
      return S;
    };
    // the human limits the test holds the engine to, written here rather than read back
    const HUMAN_REACT = 0.35;

    // the gas pedal
    let S = road([{ y: 900, span: 4.4, f: 0, cars: [car(3)] }]);
    const v0 = E.target(S);
    E.gas(S, true);
    const dv = E.target(S) - v0;
    ok(S.gas === true && dv >= 10 && dv <= 15, 'holding the gas adds 10 to 15 m/s to the speed\'s target (' + dv + ')');
    run(S, 90);
    ok(Math.abs(E.speed(S) - E.base(S.p) - dv) < 1e-9, 'and the bike reaches it');
    let sb = S.score, sp = E.speed(S);
    E.step(S);
    ok(Math.abs((S.score - sb) - sp * E.DT * 0.1 * 1.5) < 1e-9, 'with the gas held the distance scores ×1.5');
    S.boostT = 300;
    run(S, 150);
    const pb = S.p;
    sb = S.score; sp = E.speed(S);
    E.step(S);
    ok(Math.abs(sp - E.base(pb) - dv - E.BOOST_V) < 1e-9 && Math.abs((S.score - sb) - sp * E.DT * 0.1 * 3) < 1e-9, 'gas and nitro add up: +' + dv + ' and +' + E.BOOST_V + ' m/s, the distance scores ×3');
    E.gas(S, false);
    run(S, 120);
    ok(S.gas === false && Math.abs(E.speed(S) - E.base(S.p) - E.BOOST_V) < 1e-9, 'letting go of the gas brings it back to the road\'s speed plus nitro');

    // the speed eases instead of jumping (owner, after #782): one tick after nitro starts
    // the bike is still below the new speed and climbs to it without dipping, in about a
    // second; when nitro ends it falls back the same way, more gently. The target here is
    // the road plus nitro, worked out by the test.
    S = road([{ y: 5000, span: 4.4, f: 0, cars: [car(3)] }]);
    run(S, 30);
    S.boostT = E.BOOST_T;
    const up = [], upT = [];
    for (let i = 0; i < 120; i++) { E.step(S); up.push(E.speed(S)); upT.push(E.base(S.p) + E.BOOST_V); }
    const upMono = up.every((v, i) => i === 0 || v >= up[i - 1] - 1e-12);
    const upAt = up.findIndex((v, i) => Math.abs(v - upT[i]) < 1e-9);
    ok(up[0] < upT[0] - 5 && upMono && upAt >= 50 && upAt <= 70, 'nitro builds up: 1 tick in ' + (up[0] * 3.6).toFixed(0) + ' of ' + (upT[0] * 3.6).toFixed(0) + ' km/h, rising without a dip, full after ' + (upAt + 1) + ' ticks');
    for (let i = 0; i < 1000 && S.boostT > 0 && !S.over; i++) E.step(S);
    ok(S.boostT === 0, 'the burst ends');
    const dn = [], dnT = [];
    for (let i = 0; i < 150; i++) { E.step(S); dn.push(E.speed(S)); dnT.push(E.base(S.p)); }
    const dnAt = dn.findIndex((v, i) => Math.abs(v - dnT[i]) < 1e-9);
    // only until it settles: from then on it rides the road's own ramp, which rises
    const dnMono = dnAt > 0 && dn.slice(0, dnAt + 1).every((v, i) => i === 0 || v <= dn[i - 1] + 1e-12);
    ok(dn[0] > dnT[0] + 5 && dnMono && dnAt >= 75 && dnAt <= 100, 'and falls back: 1 tick after it ends ' + (dn[0] * 3.6).toFixed(0) + ' over ' + (dnT[0] * 3.6).toFixed(0) + ' km/h, falling without a bump, settled after ' + (dnAt + 1) + ' ticks');
    const Rv = E.restore(E.snapshot(Object.assign(road([], 'medium'), { v: 33.25 })));
    ok(!!Rv && Rv.v === 33.25, 'a saved ride keeps the speed it was riding at');
    const A = road([], 'medium'), B = road([], 'medium');
    E.gas(B, true); run(A, 300); run(B, 300);
    ok(B.p > A.p + 50 && B.d > A.d + 50, 'with the gas held the bike gains on the traffic (' + (B.p - A.p).toFixed(0) + ' m in 5 s)');
    const R0 = E.restore(E.snapshot(B));
    ok(!!R0 && R0.gas === false, 'a resumed ride starts with the gas released');

    // difficulty
    const b0 = DIFFS.map((d) => E.base(0, d)), b1 = DIFFS.map((d) => E.base(1e9, d));
    ok(b0[0] < b0[1] && b0[1] < b0[2] && b1[0] < b1[1] && b1[1] < b1[2] && b0[1] === 26 && b1[1] === 50, 'Easy starts slower and tops out lower, Hard faster; Medium keeps 26 to 50 m/s (' + b0.join('/') + ' → ' + b1.join('/') + ')');
    ok(E.DIFF.easy.react > E.DIFF.medium.react && DIFFS.every((d) => E.DIFF[d].react >= HUMAN_REACT), 'Easy leaves a wider reaction margin, and no difficulty leaves less than ' + HUMAN_REACT + ' s');
    ok(E.DIFF.easy.lc === 0 && E.DIFF.medium.lc === 3 && E.DIFF.hard.lc === 2, 'cars change lanes from level 3 on Medium, level 2 on Hard, never on Easy');
    ok(E.fromSeed(5, false, 'hard').diff === 'hard' && E.fromSeed(5, false, 'easy').diff === 'easy' && E.fromSeed(5, false, 'bogus').diff === 'medium' && E.fromSeed(5, false).diff === 'medium', 'a ride keeps its difficulty, Medium by default');
    const dm = JSON.stringify(E.snapshot(E.fromSeed(99, true, 'medium')));
    ok(['easy', 'hard', undefined].every((d) => JSON.stringify(E.snapshot(E.fromSeed(99, true, d))) === dm) && E.fromSeed(99, true, 'hard').diff === 'medium', 'the daily ride is Medium and the same road whatever difficulty the player picked');
    const hr = E.restore(Object.assign(E.snapshot(E.fromSeed(7, false, 'hard')), {}));
    ok(hr && hr.diff === 'hard' && E.restore(Object.assign(E.snapshot(E.fromSeed(7, false)), { diff: 'nope' })).diff === 'medium', 'a save keeps its difficulty, and an unknown one rides Medium');

    // levels
    ok(E.levelAt(0, 'medium') === 1 && E.levelAt(999, 'medium') === 1 && E.levelAt(1000, 'medium') === 2 && E.levelAt(1199, 'easy') === 1 && E.levelAt(1200, 'easy') === 2 && E.levelAt(800, 'hard') === 2, 'a level is 1000 m of road on Medium, 1200 on Easy and 800 on Hard');
    ok(DIFFS.every((d) => E.DIFF[d].ramp % E.DIFF[d].lap === 0 && E.base(E.DIFF[d].ramp, d) === E.DIFF[d].vmax), 'on every difficulty the speed ramp ends on a level boundary, so each level is a step of the ramp');
    S = road([], 'medium'); S.p = 990;
    const lev = [];
    for (let i = 0; i < 120; i++) { E.step(S); lev.push(...E.drain(S).filter((e) => e.t === 'level')); }
    ok(E.fromSeed(1, false).lvl === 1 && lev.length === 1 && lev[0].n === 2 && S.lvl === 2, 'crossing 1000 m raises the level once and says so');

    // the generator, 60 seeds on each difficulty: every wave leaves its free lane free
    // before and after any lane change, and every gap is long enough to reach the next
    // free lane after a reaction at the fastest the bike can go there (top of the ramp at
    // the next wave, gas and nitro), computed here, not by the engine's need()
    const changersOf = {};
    for (const diff of DIFFS) {
      const lc = E.DIFF[diff].lc, react = E.DIFF[diff].react;
      let waves = 0, noFree = 0, short = 0, minSlack = Infinity, early = 0, badMove = 0, two = 0;
      const ch = changersOf[diff] = [];
      for (let sd = 1; sd <= 60; sd++) {
        const G = E.fromSeed(sd * 7919, false, diff), seen = [];
        for (let p = 0; p <= 12000; p += 100) {
          G.p = p; E.ensure(G);
          for (const w of G.waves) if (!seen.length || w.y > seen[seen.length - 1].y) seen.push(w);
        }
        for (let i = 0; i < seen.length; i++) {
          const w = seen[i], from = w.cars.map((c) => c.lane), to = w.cars.map((c) => (c.to === undefined ? c.lane : c.to));
          waves++;
          if (from.includes(w.f) || to.includes(w.f) || new Set(from).size !== from.length || new Set(to).size !== to.length) noFree++;
          const movers = w.cars.filter((c) => c.to !== undefined);
          if (movers.length > 1) two++;
          for (const c of movers) {
            if (!lc || E.levelAt(w.y, diff) < lc) early++;
            if (Math.abs(c.to - c.lane) !== 1) badMove++;
            if (ch.length < 400) ch.push(JSON.parse(JSON.stringify(w)));
          }
          if (i + 1 < seen.length) {
            const nx = seen[i + 1], gap = nx.y - (w.y + w.span);
            const want = E.BIKE_L + (Math.abs(w.f - nx.f) / E.LANE_SPEED + react) * (E.base(nx.y, diff) + E.GAS_V + E.BOOST_V - E.TV);
            if (gap - want < -1e-6) short++;
            minSlack = Math.min(minSlack, gap - want);
          }
        }
      }
      ok(waves > 3000 && noFree === 0, diff + ': every wave keeps its free lane free, before and after a car changes lanes (' + waves + ' waves)');
      ok(short === 0, diff + ': every gap reaches the next free lane after ' + react + ' s with gas and nitro held (smallest margin ' + minSlack.toFixed(2) + ' m)');
      ok(early === 0 && badMove === 0 && two === 0, diff + ': lane changers come only from level ' + (lc || 'never') + ', one per wave, one lane each');
      if (lc) ok(ch.length >= 100, diff + ': the generator does make lane changers (' + ch.length + ' sampled)');
      else ok(ch.length === 0, diff + ': no car ever changes lanes');
    }

    // Every lane changer warns before it moves, and a rider sitting in the lane it moves
    // into, at the fastest closing speed (gas and nitro held all the way), who only
    // reacts once the car has finished moving, still gets out into the lane it left.
    // Without that reaction the same rider hits it, so the car really moves into the lane.
    let tried = 0, dodged = 0, hitIdle = 0, warned = 0, seenFar = 0;
    for (const diff of ['medium', 'hard']) {
      for (const w0 of changersOf[diff]) {
        const c0 = w0.cars.find((c) => c.to !== undefined);
        const fresh = () => {
          const w = JSON.parse(JSON.stringify(w0));
          for (const c of w.cars) { c.done = false; c.md = 9; c.x = c.lane; if (c.to !== undefined) { c.ph = 0; c.k = 0; } }
          const R = road([w], diff);
          R.p = w.y + c0.o - c0.at - 1; R.x = R.tl = c0.to; R.lvl = E.levelAt(R.p, diff);
          // the worst case: already at full speed with gas and nitro, not still building up
          E.gas(R, true); R.boostT = 999; R.v = E.target(R);
          return R;
        };
        for (const dodge of [true, false]) {
          const R = fresh(), c = R.waves[0].cars.find((q) => q.to !== undefined);
          let blinkAt = -1, moveAt = -1, doneAt = -1, wait = -1;
          for (let i = 0; i < 4000 && !R.over && R.p < R.waves[0].y + R.waves[0].span + E.BIKE_L + 1; i++) {
            R.boostT = 999;
            E.step(R);
            if (c.ph >= 1 && blinkAt < 0) { blinkAt = i; if (dodge && c0.o + R.waves[0].y - R.p <= 300) seenFar++; }
            if (c.ph >= 2 && moveAt < 0) moveAt = i;
            if (c.ph === 3 && doneAt < 0) { doneAt = i; wait = Math.ceil(HUMAN_REACT / E.DT); }
            if (dodge && wait > 0 && --wait === 0) E.steer(R, c.lane > c.to ? 1 : -1);
          }
          if (dodge) {
            tried++;
            if (!R.over && R.p > R.waves[0].y + R.waves[0].span) dodged++;
            if (blinkAt >= 0 && moveAt - blinkAt >= E.BLINK) warned++;
          } else if (R.over && R.hit) hitIdle++;
        }
      }
    }
    ok(tried >= 200 && dodged === tried, 'a rider in the lane a car moves into, at full speed with gas and nitro, gets out after ' + HUMAN_REACT + ' s (' + dodged + '/' + tried + ')');
    ok(hitIdle === tried, 'and the same rider who does not react hits the car (' + hitIdle + '/' + tried + '), so the change is real');
    ok(warned === tried && seenFar === tried && E.BLINK * E.DT >= 0.9, 'every lane changer blinks for ' + (E.BLINK * E.DT).toFixed(1) + ' s before it moves, while it is in view (' + warned + '/' + tried + ')');

    // A test player on every difficulty: it rides the free lane of the row it is passing
    // and steers for the next only after that row is behind it and a reaction time has
    // gone by, holding the gas the whole way.
    function ride(S, maxTicks, gasOn) {
      let wait = 0, cur = null;
      E.gas(S, gasOn);
      for (let i = 0; i < maxTicks && !S.over; i++) {
        const rear = S.p - E.BIKE_L, w = S.waves.find((x) => x.y + x.span > rear);
        if (w && w !== cur) { if (cur) wait = Math.ceil(HUMAN_REACT / E.DT); cur = w; }
        if (wait > 0) wait--;
        else if (cur && S.tl !== cur.f) E.steer(S, cur.f > S.tl ? 1 : -1);
        E.step(S); E.drain(S);
        // the real, eased speed never passes the instant worst case need() is built on
        if (S.v - E.TV > E.closing(S.p, S.diff) + 1e-9) overSpeed++;
        if (S.v > maxV) maxV = S.v;
      }
      return S;
    }
    let overSpeed = 0, maxV = 0;
    const r783 = rng(783);
    for (const diff of DIFFS) {
      let alive = 0, lvl = 0, km = Infinity;
      for (let k = 0; k < 2; k++) {
        const N = ride(E.newGame(r783, false, diff), 60 * 60 * 5, k === 0);
        if (!N.over) alive++;
        lvl = Math.max(lvl, N.lvl); km = Math.min(km, N.d / 1000);
      }
      ok(alive === 2, diff + ': the test player survives two five-minute rides, one with the gas held (shortest ' + km.toFixed(1) + ' km, up to level ' + lvl + ')');
    }
    let dailies = 0;
    for (let k = 0; k < 3; k++) if (ride(E.newGame(r783, true, 'hard'), 60 * 60 * 10, k !== 1).won) dailies++;
    ok(dailies === 3, 'and finishes three daily rides, gas held or not (' + dailies + '/3)');
    ok(maxV > 40 && overSpeed === 0, 'on every tick of those rides the real speed stays within the worst case the gaps are built for (top ' + (maxV * 3.6).toFixed(0) + ' km/h)');

    // the page
    const strKeys = ['gasL', 'kGas', 'lvlN', 'lvlUp', 'lvlL', 'dailyMed'];
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(strKeys.every((k) => (html.match(new RegExp('\\b' + k + ": '[^']+'", 'g')) || []).length === LOCALE_CODES.length), 'the new strings exist in every language');
    ok(strKeys.every((k) => !new RegExp('\\b' + k + ':').test(core)), 'none of them is named like a core string');
    ok(/ctx\.button\(\{ icon: 'gear'/.test(html) && /C\.ui\.segmented\(DIFFS\.map/.test(html) && /ctx\.store\.set\('prefs', prefs\)/.test(html) && /prefs = \{ diff: 'medium' \}/.test(html), 'the difficulty is picked behind a gear, saved, Medium by default');
    const help = (html.match(/function showHelp\(\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    ok(help.length > 0 && !/segmented|DIFFS|difficulty/.test(help), 'and never inside the help');
    ok(/E\.newGame\(rngFor\(seed\), !!dailyDate, prefs\.diff[,)]/.test(html) && /C\.t\('dailyMed'\)/.test(html), 'the daily ride says it is always Medium');
    ok(/e\.key === 'ArrowUp' \|\| C\.keyIs\(e, 'w'\)/.test(html) && /addEventListener\('keyup'/.test(html) && /onPedal\(e\)/.test(html) && /pedal\(g, P, font\)/.test(html), 'the gas is a pedal on screen and Up or W on a keyboard, released on key up');
    ok(/C\.t\('lvlN'/.test(html) && /e\.t === 'level'/.test(html) && /C\.t\('lvlUp'/.test(html), 'the level is on the HUD and pops when it changes');
    ok(/c\.ph === 1 \|\| c\.ph === 2\) indicator\(/.test(html), 'a lane changer is drawn with its indicator before and while it moves');
    const ms = Date.now() - t0;
    ok(ms < 8000, 'the gas and level tests finish in under 8 s (' + ms + ' ms)');
  }
  return { testMotoRush, testMotoRushGasLevels };
};
