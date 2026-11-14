'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #887: land a moon lander on generated ground («فرودگر» / Lander)
  function testLander() {
    head('Lander (#887)');
    const t0 = Date.now();
    const E = loadEngine('lander', 'LanderEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/lander/index.html'), 'utf8');
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // flies the engine's own pilot on a copy of a level's fuel, as a player would meet it
    const land = (L) => E.fly(E.ship(L), 60);

    // the same seed and level give the same ground, fuel and flight
    const A = E.newLevel(12345, 6), B = E.newLevel(12345, 6);
    ok(same(A, B) && A.pts.length > 5 && A.fuel > 0, 'a seed and level always give the same ground and fuel');
    const fa = land(A), fb = land(B);
    ok(fa.landed && fb.landed && fa.t === fb.t && fa.fuel === fb.fuel && fa.x === fb.x, 'replaying the same buttons gives the same flight');
    ok(!same(E.newLevel(12346, 6).pts, A.pts), 'another seed gives other ground');

    // the pad is flat, inside the walls, and its edges are not sheer walls
    let padOk = 0, padN = 0;
    for (let lv = 1; lv <= 16; lv++) {
      for (let s = 0; s < 4; s++) {
        const L = E.terrain(lv * 1000 + s, lv), P = L.pad;
        padN++;
        if (E.height(L, P.x0 + 0.01) === P.y && E.height(L, P.x1 - 0.01) === P.y && E.height(L, P.cx) === P.y && P.x0 >= 2 && P.x1 <= E.W - 2 && Math.abs(P.w - (P.x1 - P.x0)) < 1e-9) padOk++;
      }
    }
    ok(padN > 0 && padOk === padN, 'every pad is flat and inside the world (' + padOk + '/' + padN + ')');

    // levels get harder: a smaller pad, less spare fuel, rougher ground, and wind from 4 on
    const p1 = E.params(1), p3 = E.params(3), p4 = E.params(4), p12 = E.params(12);
    ok(p12.padW < p1.padW && p12.margin < p1.margin && p12.rough > p1.rough && p12.dist > p1.dist, 'later pads are smaller, with less spare fuel, rougher ground and a longer way');
    ok(p1.wind === 0 && p3.wind === 0 && p4.wind > 0 && p12.wind > p4.wind && E.params(40).wind <= 0.35, 'the wind starts on pad 4 and grows, within a limit');
    ok(p12.padW - 2 * 1.6 >= 2, 'even the smallest pad leaves room between the feet and its edges');

    // Every level a player meets is ground the test pilot landed on with the level's own
    // fuel: an endless run of levels 1-20 and the daily pads (#887)
    let flown = 0, landed = 0, slow = 0, fails = [];
    for (let lv = 1; lv <= 20; lv++) {
      for (let s = 0; s < 4; s++) {
        const L = E.newLevel((lv * 7919 + s * 104729) >>> 0, lv), S = land(L);
        flown++;
        if (S.landed && S.fuel >= 0) landed++; else fails.push(lv + ':' + s + ':' + (S.cause || 'time'));
        if (L.botT > 45) slow++;
      }
    }
    ok(flown === 80 && landed === flown, 'the test pilot lands every generated pad with its own fuel (' + landed + '/' + flown + (fails.length ? '; failed ' + fails.slice(0, 5).join(', ') : '') + ')');
    ok(slow === 0, 'every pad is flown down in under 45 s, so a level takes under a minute');
    // the daily pads, from many days' seeds
    const dr = T.rng(20261114);
    let dFlown = 0, dLanded = 0;
    for (let d = 0; d < 20; d++) {
      E.DAILY.forEach((lv) => {
        const S = land(E.newLevel(Math.floor(dr() * 4294967296) >>> 0, lv));
        dFlown++;
        if (S.landed) dLanded++;
      });
    }
    ok(dFlown === 60 && dLanded === dFlown, 'the test pilot lands every daily pad of 20 days (' + dLanded + '/' + dFlown + ')');
    // the generator itself, before newLevel throws ground away: a flaw would show here first
    let raw = 0, rawN = 0;
    for (let lv = 1; lv <= 20; lv++) {
      for (let s = 0; s < 6; s++) {
        const L = E.terrain((lv * 31337 + s * 7) >>> 0, lv);
        L.fuel = 1e6;
        rawN++;
        if (E.fly(E.ship(L), 45).landed) raw++;
      }
    }
    ok(rawN === 120 &&raw / rawN >= 0.95, 'the test pilot lands at least 95% of raw ground before any is thrown away (' + raw + '/' + rawN + ')');
    // fuel is tight but enough: the pilot's own use times the level's margin
    const Lf = E.newLevel(777, 10), Sf = land(Lf);
    ok(Sf.landed && Sf.fuel > 0 && Sf.fuel < Lf.fuel * 0.5, 'a later pad leaves the test pilot less than half its tank (' + Sf.fuel.toFixed(1) + ' of ' + Lf.fuel + ' s)');

    // crashes and their causes, on a flat test ground with a wide pad
    const flat = () => {
      const L = E.terrain(5, 1);
      L.pts = [{ x: 0, y: 4 }, { x: 10, y: 4 }, { x: 30, y: 4 }, { x: E.W, y: 4 }];
      L.pad = { x0: 10, x1: 30, y: 4, cx: 20, w: 20 };
      L.fuel = 30; L.wind = 0;
      return L;
    };
    const drop = (x, a, vx, vy) => {
      const S = E.ship(flat());
      S.x = x; S.y = 4 + 1.6 + 0.05; S.a = a; S.vx = vx; S.vy = vy;
      const ev = [];
      for (let i = 0; i < 60 && !S.landed && !S.over; i++) ev.push.apply(ev, E.step(S, 0, false));
      return { S, ev };
    };
    const soft = drop(20, 0, 0, -1);
    ok(soft.S.landed && soft.ev.indexOf('land') >= 0 && soft.S.vy === 0 && Math.abs(soft.S.y - 1.6 - 4) < 1e-9, 'a slow, upright touchdown on the pad lands and stands on it');
    ok(drop(20, 0, 0, -3.2).S.cause === 'fast', 'coming down faster than the limit is a crash (fast)');
    ok(drop(20, 0.35, 0, -1).S.cause === 'tilt', 'touching down tilted past 15° is a crash (tilt)');
    ok(drop(20, 0, 2, -1).S.cause === 'drift', 'touching down sliding sideways is a crash (drift)');
    ok(drop(6, 0, 0, -1).S.cause === 'rough' && drop(29.5, 0, 0, -1).S.cause === 'rough', 'a foot off the pad is a crash, even half over its edge');
    const lim = drop(20, E.LIM.a * 0.95, E.LIM.vx * 0.9, -E.LIM.vy * 0.9);
    ok(lim.S.landed, 'just inside every limit still lands');

    // thrust, turning, fuel
    const St = E.ship(flat());
    St.y = 30; const y0 = St.y;
    for (let i = 0; i < 60; i++) E.step(St, 0, true);
    ok(St.vy > 0 && St.y > y0 && Math.abs(St.fuel - 29) < 1e-6, 'the engine lifts the ship against gravity and burns a second of fuel a second');
    const Sr = E.ship(flat());
    Sr.y = 30;
    for (let i = 0; i < 30; i++) E.step(Sr, 1, false);
    ok(Sr.a > 0.9 && Sr.a < 1.2, 'holding turn right tilts the nose right at the turn rate');
    for (let i = 0; i < 60; i++) E.step(Sr, 0, true);
    ok(Sr.vx > 1, 'thrust pushes the way the nose points');
    const Se = E.ship(flat());
    Se.y = 40; Se.fuel = 0.5;
    const evE = [];
    for (let i = 0; i < 60; i++) evE.push.apply(evE, E.step(Se, 0, true));
    ok(evE.filter((e) => e === 'empty').length === 1 && Se.fuel === 0 && !Se.burn, 'the tank runs dry once and the engine stops');
    // the wind pushes a ship that does nothing
    const Lw = flat(); Lw.wind = 0.3; Lw.windPh = 0;
    const Sw = E.ship(Lw); Sw.y = 40; Sw.vx = 0;
    for (let i = 0; i < 120; i++) E.step(Sw, 0, false);
    ok(Sw.vx > 0.3, 'the wind pushes the ship sideways');
    // the ceiling and the walls hold the ship inside the screen
    const Sc = E.ship(flat()); Sc.y = E.TOP - 0.1;
    for (let i = 0; i < 120; i++) E.step(Sc, 0, true);
    ok(Sc.y <= E.TOP, 'the ship never leaves the top of the screen');

    // points: fuel, the middle of the pad and softness
    const g1 = E.grade(drop(20, 0, 0, -0.5).S), g2 = E.grade(drop(27, 0, 0, -2.2).S);
    ok(g1 && g2 && g1.points > g2.points && g1.ace && !g2.ace && g1.off < 0.15 && g2.off > 0.5, 'a soft landing in the middle scores more than a hard one at the edge, and only it is a feather landing');
    const lowFuel = drop(20, 0, 0, -0.5).S; lowFuel.fuel = 0;
    ok(E.grade(lowFuel).points < g1.points, 'fuel left adds to the points');
    ok(E.grade(drop(20, 0, 0, -3.2).S) === null, 'a crash scores nothing');

    // a saved flight comes back exactly, and a damaged save is refused
    const Ls = E.newLevel(4242, 5), Ss = E.ship(Ls);
    for (let i = 0; i < 200; i++) { const c = E.bot(Ss); E.step(Ss, c.turn, c.thrust); }
    const snap = JSON.parse(JSON.stringify(E.snapshot(Ss)));
    const Rs = E.restore(snap);
    ok(!!Rs && same(Rs.L.pts, Ss.L.pts) && Rs.x === Ss.x && Rs.vy === Ss.vy && Rs.fuel === Ss.fuel && Rs.L.fuel === Ss.L.fuel, 'a saved flight comes back on its ground with its speed and fuel');
    const r1 = E.fly(Rs, 60), r2 = E.fly(Ss, 60);
    ok(r1.landed && r2.landed && r1.t === r2.t && r1.x === r2.x, 'and flies on exactly as it would have');
    ok(E.restore(null) === null && E.restore(Object.assign({}, snap, { fuel: snap.fuel0 + 1 })) === null && E.restore(Object.assign({}, snap, { x: 'a' })) === null && E.restore(Object.assign({}, snap, { level: 0 })) === null && E.restore(Object.assign({}, snap, { y: -10 })) === null, 'a damaged save, or one inside the ground, is refused');

    // the page
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'lander');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/lander/index.html' && gm.daily !== false, 'Lander is listed as a one-player skill game with a daily run');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const P = lab(x), Q = lab(y); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
    const lum = (x) => rgb(x).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const others = games.filter((g) => g.id !== 'lander');
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && others.length > 60 && near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/lander/icon.svg'), 'utf8');
    ok(!!gm && new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['ln-first', 'ln-ace', 'ln-ten', 'ln-daily'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the four awards are in the core and unlocked by the game');
    ok(/jet: function/.test(core) && /C\.audio\.sfx\('jet'\)/.test(html), 'the engine sound is synthesized in the core');
    ok(/C\.daily\('lander', dailyDate\)\.rng/.test(html) && /C\.stats\.best\('lander', 'score', score\)/.test(html) && /C\.stats\.daily\('lander', dailyDate/.test(html), 'the daily pads are seeded by the day, and the best score is kept');
    ok(/ctx\.button\(\{ icon: 'gear', label: C\.t\('settings'\)/.test(html) && /title: C\.t\('settings'\), closeButton: true/.test(html) && !/lnSideT/.test(html.slice(html.indexOf('function showHelp'), html.indexOf('function tArt'))), 'the engine side sits behind a gear, not in help');
    ok(/C\.keyIs\(e, 'w'\)/.test(html) && /C\.keyIs\(e, 'a'\)/.test(html) && /C\.keyIs\(e, 'd'\)/.test(html) && !/dir === 'rtl'|isRtl|C\.rtl/.test(html), 'arrows and WASD steer through C.keyIs, never flipped in RTL');
    ok(/C\.ui\.reduceMotion\(\)/.test(html) && /document\.fonts\.ready/.test(html) && /drawn\.w/.test(html), 'it honours reduced motion, redraws when fonts arrive and reads touches against the view last drawn');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    const ms = Date.now() - t0;
    ok(ms < 12000, 'the Lander tests finish in under 12 s (' + ms + ' ms)');
  }
  return { testLander };
};
