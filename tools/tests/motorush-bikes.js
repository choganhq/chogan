'use strict';
// #815: Moto Rush bikes bought with the app's coins. Three after the starter at 300, 800
// and 2000 coins, each better than the last in a way a ride shows (measured here, not
// read back), every one fair to ride on every difficulty, and a purchase that takes the
// price once and never leaves the wallet below zero.
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, vm, ROOT, LOCALE_CODES } = T;
  const LIMIT_MS = 30000;
  async function testMotoRushBikes() {
    head('Moto Rush: bikes bought with the app\'s coins (#815)');
    const t0 = Date.now();
    let timer = null;
    const hang = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), LIMIT_MS); });
    const res = await Promise.race([body().then(() => 'done'), hang]);
    clearTimeout(timer);
    ok(res === 'done', 'the bike tests finished before the ' + (LIMIT_MS / 1000) + ' s guard (' + res + ')');
    const ms = Date.now() - t0;
    ok(ms < 9000, 'the bike tests finish in under 9 s (' + ms + ' ms)');
  }
  const tick = () => new Promise((r) => setImmediate(r));

  async function body() {
    const E = loadEngine('motorush', 'MotoRushEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/motorush/index.html'), 'utf8');
    const IDS = ['courier', 'gale', 'thunder', 'arrow'];
    // the prices from the issue (#810: 300 / 800 / 2000, like Hillrider)
    const PRICE = { courier: 0, gale: 300, thunder: 800, arrow: 2000 };
    const B = E.BIKES || {};
    ok(JSON.stringify(E.BIKE_IDS) === JSON.stringify(IDS) && IDS.every((id) => B[id]), 'there are four bikes: the courier, then the gale, the thunder and the arrow');
    if (!IDS.every((id) => B[id])) return;
    ok(IDS.every((id) => B[id].price === PRICE[id]), 'they cost 0, 300, 800 and 2000 coins');
    const stats = ['gas', 'boost', 'boostT', 'lane'];
    let better = true;
    for (let i = 1; i < IDS.length; i++) {
      const a = B[IDS[i - 1]], b = B[IDS[i]];
      const ge = stats.every((k) => b[k] >= a[k]) && b.cans <= a.cans;
      const gt = stats.some((k) => b[k] > a[k]) || b.cans < a.cans;
      if (!ge || !gt) better = false;
    }
    ok(better, 'each bike is at least as good as the one before in everything and better in something');
    ok(B.gale.gas > B.courier.gas && B.thunder.boostT > B.gale.boostT && B.thunder.cans < B.gale.cans && B.arrow.lane > B.thunder.lane, 'the gale has more power, the thunder a bigger nitro that fills faster, the arrow quicker steering');

    // rides keep their bike; the daily is always on the courier; saves keep it
    ok(IDS.every((id) => E.fromSeed(5, false, 'medium', 'sunny', id).bike === id) && E.fromSeed(5, false).bike === 'courier' && E.fromSeed(5, false, 'medium', 'sunny', 'tank').bike === 'courier', 'a ride keeps its bike, the courier by default');
    const dm = JSON.stringify(E.snapshot(E.fromSeed(99, true, 'medium', 'sunny', 'courier')));
    ok(['gale', 'thunder', 'arrow'].every((id) => JSON.stringify(E.snapshot(E.fromSeed(99, true, 'hard', 'night', id))) === dm), 'the daily ride is the same road on the courier whatever bike the player owns');
    const sv = E.snapshot(E.fromSeed(7, false, 'hard', 'sunny', 'arrow')), old = Object.assign({}, sv); delete old.bike;
    ok(E.restore(sv).bike === 'arrow' && E.restore(old).bike === 'courier', 'a save keeps its bike, and one from before bikes rides the courier');

    // measured differences
    const empty = (id) => { const S = E.fromSeed(815, false, 'medium', 'sunny', id); S.waves = []; S.items = []; S.ny = 1e9; return S; };
    const top = {}, laneT = {}, nitroS = {};
    for (const id of IDS) {
      let S = empty(id); E.gas(S, true);
      for (let i = 0; i < 300; i++) E.step(S);
      top[id] = S.v - E.base(S.p);
      S = empty(id); E.steer(S, 1);
      let t = 0; while (S.x < 2 && t < 100) { E.step(S); t++; }
      laneT[id] = t;
      // nitro seconds a can is worth: ride over cans spaced out in the bike's lane
      S = empty(id); S.items = []; for (let k = 0; k < 12; k++) S.items.push({ lane: 1, y: 20 + k * 60, got: false });
      let boosted = 0; for (let i = 0; i < 60 * 40; i++) { E.step(S); if (S.boostT > 0) boosted++; }
      nitroS[id] = boosted * E.DT / 12;
    }
    ok(top.gale >= top.courier * 1.2, 'the gale\'s gas adds ' + top.gale.toFixed(1) + ' m/s, the courier\'s ' + top.courier.toFixed(1));
    ok(nitroS.thunder >= nitroS.gale * 1.8, 'a can is worth ' + nitroS.thunder.toFixed(2) + ' s of nitro on the thunder, ' + nitroS.gale.toFixed(2) + ' s on the gale');
    ok(laneT.arrow <= laneT.thunder * 0.85, 'the arrow changes lanes in ' + laneT.arrow + ' ticks, the others in ' + laneT.thunder);
    ok(E.topSpeed('medium', 'arrow') > E.topSpeed('medium', 'courier'), 'the speedometer\'s scale grows with the bike (' + Math.round(E.topSpeed('medium', 'arrow') * 3.6) + ' km/h)');
    await tick();

    // every bike is fair on every difficulty: the gaps are built for the bike's own worst
    // case, worked out here from its gas, nitro and steering
    for (const id of IDS) {
      let short = 0, waves = 0, min = Infinity;
      for (const diff of ['easy', 'medium', 'hard']) {
        const b = B[id], ls = 5.5 * b.lane, react = E.DIFF[diff].react;
        for (let sd = 1; sd <= 15; sd++) {
          const G = E.fromSeed(sd * 15485863, false, diff, 'sunny', id), seen = [];
          for (let p = 0; p <= 9000; p += 100) { G.p = p; E.ensure(G); for (const w of G.waves) if (!seen.length || w.y > seen[seen.length - 1].y) seen.push(w); }
          for (let i = 0; i + 1 < seen.length; i++) {
            const w = seen[i], nx = seen[i + 1], gap = nx.y - (w.y + w.span);
            const want = E.BIKE_L + (Math.abs(w.f - nx.f) / ls + react) * (E.base(nx.y, diff) + b.gas + b.boost - E.TV);
            waves++; if (gap - want < -1e-6) short++; min = Math.min(min, gap - want);
          }
        }
      }
      ok(waves > 1000 && short === 0, id + ': every gap reaches the next free lane at the bike\'s own top speed (' + waves + ' gaps, smallest margin ' + min.toFixed(2) + ' m)');
    }
    await tick();
    // a test rider on each bike and difficulty, gas held, reacting a human's 0.35 s late;
    // the better the bike, the further it gets in the same time
    function ride(S, maxTicks) {
      let wait = 0, cur = null;
      E.gas(S, true);
      for (let i = 0; i < maxTicks && !S.over; i++) {
        const rear = S.p - E.BIKE_L, w = S.waves.find((x) => x.y + x.span > rear);
        if (w && w !== cur) { if (cur) wait = 21; cur = w; }
        if (wait > 0) wait--; else if (cur && S.tl !== cur.f) E.steer(S, cur.f > S.tl ? 1 : -1);
        E.step(S); E.drain(S);
      }
      return S;
    }
    const dist = {};
    for (const id of IDS) {
      let alive = 0, km = 0;
      const r = rng(815);
      for (const diff of ['easy', 'medium', 'hard']) {
        const N = ride(E.newGame(r, false, diff, 'sunny', id), 60 * 60 * 3);
        if (!N.over) alive++;
        km += N.d / 1000;
      }
      dist[id] = km;
      ok(alive === 3, id + ': the test rider survives three minutes on each difficulty (' + km.toFixed(1) + ' km in all)');
      await tick();
    }
    ok(dist.courier < dist.gale && dist.gale < dist.thunder && dist.thunder <= dist.arrow + 1e-9 && dist.arrow > dist.courier * 1.08, 'in the same nine minutes the bikes ride ' + IDS.map((id) => dist[id].toFixed(1)).join(' < ') + ' km');
    const D = ride(E.newGame(rng(1), true, 'medium', 'sunny', 'arrow'), 60 * 60 * 10);
    ok(D.won && D.bike === 'courier', 'and the daily ride, on the courier for everyone, is finished');

    // the purchase: the page's own tryBuy against a wallet that behaves like the core's
    const src = (html.match(/\n {2}function tryBuy\([^)]*\) \{[\s\S]*?\n {2}\}\n/) || [''])[0];
    ok(src.length > 0, 'the page has tryBuy to test');
    if (src) {
      const tryBuy = vm.runInNewContext('(function (E) {' + src + ' return tryBuy; })', {})(E);
      const wallet = (n) => ({ n, spent: 0, can(p) { return Number.isInteger(p) && p > 0 && this.n >= p; }, spend(p) { if (!this.can(p)) return false; this.n -= p; this.spent++; return true; } });
      let w = wallet(350), list = ['courier'];
      const r1 = tryBuy('gale', w, list), r2 = tryBuy('gale', w, list);
      ok(r1 === 'bought' && r2 === 'owned' && w.n === 50 && w.spent === 1 && list.join() === 'courier,gale', 'buying the gale with 350 coins takes 300 once, and a second tap buys nothing (' + w.n + ' left)');
      const r3 = tryBuy('thunder', w, list);
      ok(r3 === 'short' && w.n === 50 && list.indexOf('thunder') < 0, 'with 50 coins the thunder stays locked and nothing is taken');
      w = wallet(2000); list = ['courier'];
      ok(tryBuy('arrow', w, list) === 'bought' && w.n === 0 && tryBuy('gale', w, list) === 'short' && w.n === 0, 'the last coin can be spent, and the wallet never goes below zero');
      ok(tryBuy('courier', wallet(0), ['courier']) === 'owned' && tryBuy('tank', wallet(9999), ['courier']) === 'owned', 'the courier is never sold, and an unknown bike cannot be bought');
    }

    // the page
    const keys = ['bikeL', 'bkCourier', 'bkGale', 'bkThunder', 'bkArrow', 'bkCourierD', 'bkGaleD', 'bkThunderD', 'bkArrowD', 'bikeRide', 'bikeRiding', 'bikePrice', 'bikeBought', 'dailyBike'];
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(keys.every((k) => (html.match(new RegExp('\\b' + k + ": '[^']+'", 'g')) || []).length === LOCALE_CODES.length), 'the bike strings exist in all ' + LOCALE_CODES.length + ' languages');
    ok(keys.every((k) => !new RegExp('\\b' + k + ':').test(core)), 'none of them is named like a core string');
    const settings = (html.match(/function settings\(\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    ok(/tryBuy\(id, C\.coins, owned\)/.test(settings) && /ctx\.store\.set\('bikes', owned\)/.test(settings) && /C\.t\('notEnoughCoins'\)/.test(settings) && /newRun\(pick, pickScene, pickBike[,)]/.test(settings) && /C\.t\('dailyBike'\)/.test(settings), 'bikes are bought and picked behind the gear with the app\'s coins, kept, and the daily says it rides the courier');
    const help = (html.match(/function showHelp\(\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    ok(help.length > 0 && !/bike|tryBuy/i.test(help), 'and never inside the help');
    ok(/E\.newGame\(rngFor\(seed\), !!dailyDate, prefs\.diff, prefs\.scene, prefs\.bike[,)]/.test(html) && /owned\.indexOf\(prefs\.bike\) < 0\) prefs\.bike = 'courier'/.test(html), 'a ride starts on the chosen bike, and only an owned one');
  }
  return { testMotoRushBikes };
};
