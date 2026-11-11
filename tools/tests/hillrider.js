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
    ok(LOCALE_CODES.length >= 7 && blocks.every((b) => keys.every((k) => new RegExp('\\b' + k + ": '[^']+'").test(b))), 'the speed setting has its strings in all ' + LOCALE_CODES.length + ' languages');
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
    // #785: the tank icon in the HUD is the can drawn on the road, not a plain rectangle
    ok(/function fuelCan\(/.test(html) && /fuelCan\(g, P, p\.x, p\.y, 1, 1\)/.test(html) && /fuelCan\(g, P, gx \+ 10 \* u, gy \+ 6 \* u, 26 \* u, -1\)/.test(html), 'the road and the tank icon draw the same fuel can');
    // #801: fuel for the app's coins when the tank runs low (owner's wish)
    const has = (f) => typeof E[f] === 'function';
    ok(E.FUEL_PRICE === 15 && E.FUEL_BUY === 0.25 && E.FUEL_LOW === 0.2 && has('fuelOffered') && has('refuel'), 'fuel is offered under a fifth of a tank, a quarter tank for 15 coins (#801)');
    if (has('refuel')) {
      S = E.newGame(5, 0); S.fuel = 0;
      ok(E.fuelOffered(S) && E.refuel(S) && S.fuel === 0.25 && !S.fuelOut, 'an empty tank bought once holds exactly a quarter tank');
      S.fuel = 0.15; E.refuel(S);
      ok(Math.abs(S.fuel - 0.4) < 1e-9 && !E.fuelOffered(S) && E.refuel(S) === false && Math.abs(S.fuel - 0.4) < 1e-9, 'a low tank gets a quarter on top, and above a fifth nothing is offered or added');
      S = E.newGame(5, 0); S.fuel = 0.95; S.fuel = 0.19; E.refuel(S); E.refuel(E.newGame(5, 0));
      ok(S.fuel <= 1, 'the tank never goes past full');
      S = E.newGame(5, 0); S.over = true; S.fuel = 0;
      ok(!E.fuelOffered(S) && E.refuel(S) === false && S.fuel === 0, 'a finished run is offered nothing');
      // the out-of-fuel stop waits while the button is offered and the wallet can pay
      const held = E.newGame(5, 0); held.fuel = 0.01;
      for (let i = 0; i < 3000 && !held.over; i++) E.step(held, 1, false, true);
      const gone = E.newGame(5, 0); gone.fuel = 0.01;
      for (let i = 0; i < 3000 && !gone.over; i++) E.step(gone, 1, false, false);
      ok(!held.over && held.fuel === 0 && gone.over && gone.cause === 'fuel', 'an empty tank waits while fuel can be bought, and ends the run as before when it cannot');
      const before = held.best; E.refuel(held);
      for (let i = 0; i < 600 && !held.over; i++) E.step(held, E.botControl(held), false, false);
      ok(held.best > before + 5, 'bought fuel drives the car on (' + before.toFixed(0) + ' → ' + held.best.toFixed(0) + ' m)');
    }
    ok(/C\.coins\.can\(E\.FUEL_PRICE\)/.test(html) && /C\.coins\.spend\(E\.FUEL_PRICE\)/.test(html) && /title: C\.t\('notEnoughCoins'\), sub: C\.t\('playToEarn'\)/.test(html) && /E\.step\(S, control\(\), false, canBuy\(\)\)/.test(html),
      'the page sells fuel from the app wallet, explains a short wallet with the core toast, and holds the stop only while it can sell');
    const fkeys = ['buyFuel', 'fuelBought', 'buyRule'];
    ok(blocks.every((b) => fkeys.every((k) => new RegExp('\\b' + k + ": '[^']+'").test(b))) && blocks.every((b) => /buyFuel: '[^']*\{n\}/.test(b)), 'the fuel button has its strings, with the price, in all ' + LOCALE_CODES.length + ' languages');
    ok(fkeys.every((k) => core.indexOf(k + ':') < 0), 'the fuel strings do not reuse a core key name');
    // #802 and #803: where the HUD parts go, at an upright phone, a phone on its side and a desktop
    const boxes = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    // upright 390 and 320 px phones, 844×390 and 740×360 on their side, a desktop
    const sizes = [[366, 488], [296, 395], [820, 305], [716, 275], [1256, 715]];
    let corner = 0, clear = 0, inside = 0;
    sizes.forEach(([w, h]) => {
      const L = has('hudLayout') ? E.hudLayout(w, h) : null;
      if (!L) return;
      const d = L.dial, others = [L.tank, L.buy, L.coins, L.brake, L.gas];
      if (d.x >= w * 2 / 3 && d.y + d.h <= h / 2) corner++;
      if (!others.some((o) => boxes(d, o)) && !boxes(L.buy, L.brake) && !boxes(L.buy, L.tank)) clear++;
      if ([d, L.buy, L.brake, L.gas].every((o) => o.x >= 0 && o.y >= 0 && o.x + o.w <= w && o.y + o.h <= h)) inside++;
    });
    ok(sizes.length === 5 && corner === sizes.length, 'the speed dial sits in the top right corner, out of the middle third, at every size (' + corner + '/' + sizes.length + ', #802)');
    ok(clear === sizes.length && inside === sizes.length, 'the dial and the fuel button touch neither the pedals nor the tank and coins, and stay on the canvas (' + clear + '/' + inside + ')');
    ok(/var D = L\.dial/.test(html) && !/Z\.w \/ 2 - sw \/ 2/.test(html) && has('dialFrac') && E.dialFrac(0, 'kmh') === 0 && E.dialFrac(40, 'kmh') === 0.5 && E.dialFrac(500, 'kmh') === 1 && E.dialFrac(25, 'mph') === 0.5,
      'the dial is drawn where the layout puts it, its needle within its scale');
    ok(has('hudLayout') && E.hudLayout(820, 305).brake.h < 305 * 0.3 && E.hudLayout(366, 488).u === Math.max(0.8, 366 / 420), 'on a low landscape canvas the pedals stay under a third of its height, and upright sizes are unchanged');
    const wideCss = (html.match(/@container game \(min-aspect-ratio: 5 \/ 4\) \{\s*\.hr-wrap\.ch-split[\s\S]*?\n {2}\}/) || [''])[0];
    ok(/\.hr-wrap\.ch-split \{ flex-direction: column;/.test(wideCss) && /\.ch-side \{ position: absolute;/.test(wideCss) && /\.hr-wrap\.ch-split > \.ch-fit \{[^}]*width: 100%;[^}]*max-height: none;/.test(wideCss) && /\.ch-nocq \.ch-gamemain\.ch-wide \.hr-wrap\.ch-split > \.ch-fit \{[^}]*width: 100% !important/.test(html),
      'on a wide screen the rows go above the road and the road takes the full width, with or without container queries (#803)');
    ok(ms < 8000, 'the Hillrider tests finish in under 8 s (' + ms + ' ms)');
  }
  return { testHillrider };
};
