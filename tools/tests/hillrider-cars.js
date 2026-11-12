'use strict';
// #808: better cars in Hillrider, bought once with the app's coins at 300, 800 and 2000
// (the owner's numbers, 2026-11-11), locked until bought; the buggy stays free and drives
// the daily for everyone. Every car must still finish the courses, and measured bands
// must show each dearer car is really better: faster to the flag and further on a tank.
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  function testHillriderCars() {
    head('Hillrider: three cars to buy, each really better (#808)');
    const t0 = Date.now();
    const E = loadEngine('hillrider', 'HillriderEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/hillrider/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const ids = Array.isArray(E.CAR_IDS) ? E.CAR_IDS.slice() : [];
    ok(JSON.stringify(ids) === '["buggy","jeep","truck","racer"]' && typeof E.car === 'function', 'four cars: the buggy and three to buy (' + ids.join(', ') + ')');
    if (ids.length !== 4 || typeof E.car !== 'function') return;
    ok(ids.map((id) => E.car(id).price).join(',') === '0,300,800,2000', 'prices: free, 300, 800 and 2000 coins (' + ids.map((id) => E.car(id).price).join(', ') + ')');
    const st = ids.map((id) => E.car(id));
    const rising = (k) => st.every((c, i) => i === 0 || c[k] > st[i - 1][k]);
    ok(rising('motor') && rising('vmax') && rising('burn') && rising('grip'), 'each dearer car has a stronger engine, a higher top speed, a tank that lasts longer on the gas and more grip');
    const G0 = E.newGame(808, 0);
    ok(G0.car === 'buggy' && E.newGame(808, 0, 'sun', 'tank').car === 'buggy' && E.car('nope').id === 'buggy', 'a run with no car, or an unknown one, is in the buggy');
    ok(E.newGame(808, 0, 'snow', 'racer').mu === E.grip('snow') * E.car('racer').grip, 'a car\'s grip multiplies the scene\'s');
    // the buggy drives exactly as before the cars: the old daily courses keep their seeds
    const a = E.newGame(763, 0), b = E.newGame(763, 0, 'sun', 'buggy');
    for (let i = 0; i < 600; i++) { E.step(a, E.botControl(a)); E.step(b, E.botControl(b)); }
    ok(a.x === b.x && a.fuel === b.fuel, 'the buggy is the old car, step for step');

    // A test player in every car on four of the generator's courses (the daily picker), on a
    // dry road and on snow. The bands are measured over the same runs (2026-11-12): time to
    // the 1000 m flag falls (67.7, 65.6, 63.0, 59.3 s) and the metres a tank lasts rise
    // (501, 667, 851, 1104 m) with every car. Over eight courses in sun, rain and snow the
    // driver finished all 96 car runs.
    const res = {};
    let runs = 0, done = 0;
    for (const id of ids) {
      res[id] = { t: 0, used: 0, n: 0 };
      for (const sc of ['sun', 'snow']) {
        for (let d = 0; d < (sc === 'sun' ? 4 : 2); d++) {
          const seed = E.courseSeed((d * 40503 + 808) >>> 0, 1000);
          const S = E.newGame(seed, 1000, sc, id);
          let used = 0;
          while (!S.over && !S.won && S.t < 300) { const f = S.fuel; E.step(S, E.botControl(S)); if (S.fuel < f) used += f - S.fuel; }
          runs++;
          if (S.won) { done++; if (sc === 'sun') { res[id].t += S.t; res[id].used += used; res[id].n++; } }
        }
      }
    }
    ok(runs === 24 && done === 24, 'every car reaches the 1000 m flag on four dry and two snowy courses (' + done + '/' + runs + ')');
    const time = ids.map((id) => res[id].t / Math.max(1, res[id].n)), range = ids.map((id) => 1000 * res[id].n / Math.max(1e-9, res[id].used));
    ok(time.every((t, i) => i === 0 || t < time[i - 1] - 1), 'each dearer car reaches the flag at least a second sooner (' + time.map((t) => t.toFixed(1) + ' s').join(', ') + ')');
    ok(range.every((r, i) => i === 0 || r > range[i - 1] * 1.15), 'and goes over 15% further on a tank (' + range.map((r) => Math.round(r) + ' m').join(', ') + ')');

    // save and resume keep the car; a save from before the cars resumes in the buggy
    const S1 = E.newGame(808, 0, 'sun', 'truck');
    for (let i = 0; i < 200; i++) E.step(S1, E.botControl(S1));
    const snap = JSON.parse(JSON.stringify(E.snapshot(S1)));
    const R = E.restore(snap);
    ok(!!R && R.car === 'truck' && R.cp.burn === E.car('truck').burn, 'a saved run in the pickup comes back in the pickup');
    delete snap.car;
    const R2 = E.restore(snap);
    ok(!!R2 && R2.car === 'buggy', 'a save from before the cars comes back in the buggy');

    // the page: bought once from the app wallet, kept in the game's store, the daily in the buggy
    const garage = (html.match(/\n {2}function garage\(\) \{[\s\S]*?\n {2}\}\n/) || [''])[0];
    ok(garage.length > 0 && /C\.coins\.can\(price\)/.test(garage) && /C\.coins\.spend\(price\)/.test(garage) && /title: C\.t\('notEnoughCoins'\), sub: C\.t\('playToEarn'\)/.test(garage),
      'the garage pays from the app wallet with C.coins.can and C.coins.spend, and a short wallet gets the core toast');
    ok(/if \(owned\.indexOf\(id\) >= 0 \|\| !C\.coins\.spend\(price\)\) return;\s*owned\.push\(id\); ctx\.store\.set\('cars', owned\.slice\(\)\);/.test(garage),
      'a car is paid for only once: an owned car or a failed spend changes nothing');
    ok(/owned = E\.CAR_IDS\.filter\(function \(id\) \{ return id === 'buggy' \|\| owned\.indexOf\(id\) >= 0; \}\)/.test(html) && /prefs\.car = owned\.indexOf\(prefs\.car\) >= 0 \? prefs\.car : 'buggy'/.test(html),
      'the owned list is read back, keeps the buggy, drops unknown ids, and a car not owned cannot be chosen');
    ok(/E\.newGame\(seedFor\(\), dailyDate \? FINISH : (race \? E\.RACE : )?0, dailyDate \? 'sun' : prefs\.scene, dailyDate \? 'buggy' : prefs\.car\)/.test(html), 'the daily road is driven in the buggy for everyone');
    ok(/hr-car--locked/.test(garage) && /C\.icon\('coin', 16\), el\('span', \{ text: C\.num\(info\.price\) \}\)/.test(garage) && /garage\(\),/.test(html), 'a locked car is greyed with its price, in the gear');
    const help = (html.match(/function showHelp\(\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    ok(help.length > 0 && !/garage\(/.test(help), 'the garage is not in the help');
    ok(/var CAR_LOOK = \{ buggy: \{\}, jeep: \{ body: '#[0-9A-F]{6}'[^\n]*truck: \{ body: '#[0-9A-F]{6}'[^\n]*racer: \{ body: '#[0-9A-F]{6}'/.test(html) && /drawCar\(g, P, V, S\.car\)/.test(html), 'each car has its own paint, drawn in code');

    const keys = ['carT', 'carBuggy', 'carJeep', 'carTruck', 'carRacer', 'dBuggy', 'dJeep', 'dTruck', 'dRacer', 'carOn', 'carPick', 'buyCarT', 'buyCarText', 'carBought', 'dailyBuggy', 'carRule'];
    const blocks = LOCALE_CODES.map((l) => { const m = html.match(new RegExp('\\n {6}' + l + ': \\{([\\s\\S]*?)\\n {6}\\}')); return m ? m[1] : ''; });
    ok(LOCALE_CODES.length > 0 && blocks.length === LOCALE_CODES.length && blocks.every((bl) => keys.every((k) => new RegExp('\\b' + k + ": '[^']+'").test(bl))) && blocks.every((bl) => /buyCarText: '[^']*\{n\}/.test(bl) && /buyCarT: '[^']*\{car\}/.test(bl)), 'the garage strings exist in all ' + LOCALE_CODES.length + ' languages, with the price and the car');
    ok(keys.every((k) => core.indexOf(k + ':') < 0), 'no garage string reuses a core key name');

    const ms = Date.now() - t0;
    ok(ms < 12000, 'the car tests finish in under 12 s (' + ms + ' ms; CI runs about three times slower)');
  }
  return { testHillriderCars };
};
