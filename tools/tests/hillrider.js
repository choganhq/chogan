'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #763: a hill-climb car game («تپه‌سوار» / Hillrider)
  function testHillrider() {
    head('Hillrider (#763)');
    const t0 = Date.now();
    const E = loadEngine('hillrider', 'HillriderEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/hillrider/index.html'), 'utf8');
    const drive = (S, n, ctl) => { for (let i = 0; i < n && !S.over && !S.won; i++) E.step(S, typeof ctl === 'function' ? ctl(S) : ctl); return S; };
    const bot = (S) => E.botControl(S);

    // the same seed and the same inputs drive the same run
    const A = drive(E.newGame(763, 0), 600, bot), B = drive(E.newGame(763, 0), 600, bot);
    ok(A.x === B.x && A.y === B.y && A.coins === B.coins && A.fuel === B.fuel, 'the same seed and inputs give the same run (x ' + A.x.toFixed(2) + ')');
    ok(E.newGame(1, 0).y > E.height(E.newGame(1, 0), E.START), 'a new run starts with the car standing above the ground');

    // the pedals
    const gas = drive(E.newGame(42, 0), 300, 1), idle = drive(E.newGame(42, 0), 300, 0);
    ok(gas.best > 20, 'five seconds of gas drives more than 20 m (' + gas.best.toFixed(1) + ' m)');
    ok(gas.fuel < idle.fuel && idle.fuel < 1, 'gas burns more fuel than rolling, and rolling still burns some (' + gas.fuel.toFixed(3) + ' vs ' + idle.fuel.toFixed(3) + ')');
    const braked = drive(drive(E.newGame(42, 0), 180, 1), 120, -1), coasting = drive(drive(E.newGame(42, 0), 180, 1), 120, 0);
    ok(Math.abs(braked.vx) < Math.abs(coasting.vx), 'the brake slows the car more than coasting (' + braked.vx.toFixed(2) + ' vs ' + coasting.vx.toFixed(2) + ' m/s)');

    // the hills: generated in code, steeper further on, never steeper than the limit
    let worst = 0, flat = 0, steepNear = 0, steepFar = 0;
    const H = E.newGame(9, 0);
    for (let x = 0; x <= 3000; x += 0.5) {
      const s = Math.atan(Math.abs(E.ground(H, x).s));
      worst = Math.max(worst, s - E.maxSlope(x));
      if (x < 300) steepNear = Math.max(steepNear, s); else if (x > 2000) steepFar = Math.max(steepFar, s);
      if (!isFinite(E.height(H, x))) flat++;
    }
    ok(flat === 0 && worst <= 1e-6, 'from 0 to 3000 m the ground is finite and never steeper than its limit (worst excess ' + worst.toFixed(4) + ')');
    ok(steepFar > steepNear, 'the far hills are steeper than the first ones (' + steepNear.toFixed(2) + ' → ' + steepFar.toFixed(2) + ' rad)');

    // the ends of a run
    let S = E.newGame(5, 0);
    S.a = Math.PI; S.y = E.height(S, S.x) + 0.9; S.vx = S.vy = S.w = 0;
    drive(S, 600, 0);
    ok(S.over && S.cause === 'head', 'a car on its roof ends the run on the driver\'s head (' + S.cause + ')');
    S = E.newGame(5, 0); S.fuel = 0.01;
    drive(S, 3000, 1);
    ok(S.over && S.cause === 'fuel' && S.fuel === 0, 'an empty tank rolls to a stop and ends the run (' + S.cause + ')');

    // pickups: a can fills the tank, coins add up
    S = E.newGame(5, 0);
    const can = E.fuelAt(S, 0);
    let refilled = false;
    for (let i = 0; i < 6000 && !S.over && !S.cans; i++) { S.fuel = Math.min(S.fuel, 0.5); E.step(S, bot(S)); if (S.cans) refilled = S.fuel === 1; }
    ok(can > 80 && can < 140 && S.cans === 1 && refilled, 'the first can lies at ' + can + ' m and fills the tank');
    ok(E.pickups(S, S.x - 2, S.x + 2).every((p) => p.id !== 'f0'), 'a can taken is gone from the road');
    ok(A.coins > 0, 'the steady driver picks up coins on the way (' + A.coins + ')');

    // save and resume: a restored run drives on exactly like the original
    S = drive(E.newGame(77, 0), 400, bot);
    const R = E.restore(JSON.parse(JSON.stringify(E.snapshot(S))));
    drive(S, 600, bot); drive(R, 600, bot);
    ok(!!R && JSON.stringify(E.snapshot(S)) === JSON.stringify(E.snapshot(R)), 'a saved run resumes and drives on identically');
    const snap = E.snapshot(drive(E.newGame(77, 0), 10, 0));
    ok(E.restore(null) === null && E.restore({}) === null && E.restore(Object.assign({}, snap, { fuel: 2 })) === null && E.restore(Object.assign({}, snap, { x: NaN })) === null && E.restore(Object.assign({}, snap, { wh: [] })) === null, 'a broken save is refused');

    // A test player: the steady driver finishes most raw courses, and every day's course,
    // so the daily star is always within reach.
    let raw = 0;
    for (let k = 0; k < 12; k++) { const G = E.newGame((k * 2654435761 + 763) >>> 0, 1000); while (!G.over && !G.won && G.t < 300) E.step(G, bot(G)); if (G.won) raw++; }
    ok(raw >= 8, 'the steady driver finishes most raw 1000 m courses (' + raw + '/12)');
    let days = 0, won = 0;
    for (let d = 0; d < 6; d++) {
      const s = E.courseSeed((d * 40503 + 20261111) >>> 0, 1000);
      const G = E.newGame(s, 1000);
      while (!G.over && !G.won && G.t < 300) E.step(G, bot(G));
      days++; if (G.won && E.metres(G) >= 1000) won++;
    }
    ok(days === 6 && won === 6, 'a test player drives every one of six daily courses to the flag (' + won + '/' + days + ')');

    // the page
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'hillrider');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/hillrider/index.html' && gm.daily !== false, 'Hillrider is listed as a one-player skill game with a daily course');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, b) => { const P = lab(a), Q = lab(b); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
    const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const near = games.filter((g) => g.id !== 'hillrider').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/hillrider/icon.svg'), 'utf8');
    ok(new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['hr-1k', 'hr-flip', 'hr-daily'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the three awards are in the core and unlocked by the game');
    ok(/C\.daily\('hillrider', dailyDate\)\.rng/.test(html) && /E\.courseSeed\(/.test(html) && /C\.stats\.best\('hillrider', 'metres'/.test(html), 'the daily course is seeded by the day and checked drivable, and the best distance is kept');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    // The car blurred under gas: a frame holding 0, 1 or 2 physics steps moved it in uneven jumps
    // (up to 0.25 m at speed). The page draws between the last two steps and chases by time.
    ok(/prev = pose\(S\);\s*ev = ev\.concat\(E\.step\(/.test(html) && /var V = view\(\)/.test(html) && /drawCar\(g, P, V\)/.test(html) && /Math\.pow\(1 - 0\.12, frameDt \* 60\)/.test(html), 'the car is drawn between the last two physics steps and the camera chases by time, so it does not blur under gas (#763)');
    // #777: the speed on the screen. The engine is in real metres and seconds, so the
    // scale is fixed: 1 m/s is 3.6 km/h or 2.237 mph, by the horizontal speed alone.
    const sp = typeof E.speedOf === 'function' ? E.speedOf : () => NaN;
    ok(sp(10, 'kmh') === 36 && sp(10, 'mph') === 22 && sp(15, 'kmh') === 54 && sp(15, 'mph') === 34 && sp(0, 'kmh') === 0,
      'the speed converts m/s to km/h and mph (10 m/s → ' + sp(10, 'kmh') + ' km/h, ' + sp(10, 'mph') + ' mph)');
    ok(sp(-6, 'kmh') === sp(6, 'kmh') && sp(6, 'kmh') === 22 && sp(NaN, 'kmh') === 0, 'reversing shows the same speed as forward, and a broken value shows 0');
    ok(sp(10, 'off') === null && sp(10, 'knots') === null && sp(10) === null, 'off or an unknown unit shows no speed');
    const fast = drive(E.newGame(42, 0), 300, 1);
    ok(sp(fast.vx, 'kmh') > 20 && sp(fast.vx, 'kmh') <= 70, 'five seconds of gas reads as a plausible speed (' + sp(fast.vx, 'kmh') + ' km/h)');
    const keys = ['spdT', 'spdKmh', 'spdMph', 'optKmh', 'optMph', 'spdOff'];
    const blocks = LOCALE_CODES.map((l) => { const m = html.match(new RegExp('\\n {6}' + l + ': \\{([\\s\\S]*?)\\n {6}\\}')); return m ? m[1] : ''; });
    ok(LOCALE_CODES.length === 6 && blocks.every((b) => keys.every((k) => new RegExp('\\b' + k + ": '[^']+'").test(b))), 'the speed setting has its strings in all ' + LOCALE_CODES.length + ' languages');
    ok(keys.every((k) => core.indexOf(k + ':') < 0), 'the speed strings do not reuse a core key name');
    ok(/ctx\.store\.get\('prefs'/.test(html) && /prefs\.speed = v === 'mph' \|\| v === 'off' \? v : 'kmh'/.test(html) && /C\.ui\.segmented\(\[\{ value: 'kmh'/.test(html) && /C\.icon\('gear', 20\)/.test(html) && !/rules: '[^']*km\/h/.test(html),
      'the unit lives behind the gear, is saved through the core and defaults to km/h');
    ok(/E\.speedOf\(spd, prefs\.speed\)/.test(html), 'the dial reads the engine conversion');
    // #763: design B ("Buggy") of the approved mock: a tube cage, a driver in a cap and
    // scarf, knobbly tyres. Only the drawing changed; the head is drawn on the hitbox.
    ok(/function driver\(/.test(html) && /tube cage/.test(html) && /scarf/.test(html) && /knobbly/.test(html) && /g\.arc\(hx, hy, E\.HEAD_R/.test(html) && /var hx = E\.HEAD\[0\], hy = E\.HEAD\[1\]/.test(html),
      'the car is the approved buggy, its head drawn on the hitbox (#763)');
    ok(E.HEAD[0] === -0.15 && E.HEAD[1] === 0.95 && E.HEAD_R === 0.27 && E.WR === 0.42 && JSON.stringify(E.ANCH) === '[[-1.05,-0.42],[1.05,-0.42]]', 'the hitbox and wheel positions are unchanged');
    const ms = Date.now() - t0;
    ok(ms < 8000, 'the Hillrider tests finish in under 8 s (' + ms + ' ms)');
  }
  return { testHillrider };
};
