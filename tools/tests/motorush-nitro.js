'use strict';
// #817: a Moto Rush nitro refill bought inside a run for 15 of the app's coins. Offered
// only when the bar is empty and no boost runs, only on a clear stretch, never in the
// daily; the page takes the price once with the core's wallet and says so when short;
// and a rider who buys every nitro offered still finishes every scene on every bike.
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, vm, ROOT, LOCALE_CODES } = T;
  const LIMIT_MS = 30000;
  async function testMotoRushNitro() {
    head('Moto Rush: a nitro refill bought inside a run (#817)');
    const t0 = Date.now();
    let timer = null;
    const hang = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), LIMIT_MS); });
    const res = await Promise.race([body().then(() => 'done', (e) => 'threw: ' + (e && e.message)), hang]);
    clearTimeout(timer);
    ok(res === 'done', 'the nitro tests finished before the ' + (LIMIT_MS / 1000) + ' s guard (' + res + ')');
    const ms = Date.now() - t0;
    ok(ms < 9000, 'the nitro tests finish in under 9 s (' + ms + ' ms)');
  }
  const tick = () => new Promise((r) => setImmediate(r));

  async function body() {
    const E = loadEngine('motorush', 'MotoRushEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/motorush/index.html'), 'utf8');
    const has = typeof E.nitroOffered === 'function' && typeof E.buyNitro === 'function';
    ok(has && E.NITRO_PRICE === 15, 'the engine offers a nitro refill for 15 coins');

    // when it is offered
    const empty = () => { const S = E.fromSeed(817, false, 'medium', 'sunny', 'courier'); S.waves = []; S.items = []; S.ny = 1e9; return S; };
    let S = empty();
    ok(has && E.nitroOffered(S), 'on an empty road with an empty bar it is offered');
    S.bar = 1 / 3;
    ok(has && !E.nitroOffered(S), 'not while the bar holds a can');
    S = empty(); S.boostT = 10;
    ok(has && !E.nitroOffered(S), 'not while a boost runs');
    S = empty(); S.waves = [{ y: S.p + 30, span: 6, f: 0, cars: [] }];
    ok(has && !E.nitroOffered(S), 'not with a row of cars 30 m ahead');
    S.waves[0].y = S.p + E.NITRO_CLEAR + 5;
    ok(has && E.nitroOffered(S), 'but yes once the next row is further than ' + E.NITRO_CLEAR + ' m');
    S = empty(); S.waves = [{ y: S.p - 3, span: 6, f: 0, cars: [] }];
    ok(has && !E.nitroOffered(S), 'not while passing a row');
    const D = E.fromSeed(817, true, 'medium', 'sunny', 'courier'); D.waves = []; D.ny = 1e9;
    ok(has && !E.nitroOffered(D), 'never in the daily');
    S = empty(); S.over = true;
    ok(has && !E.nitroOffered(S), 'not after the ride ended');

    // what it does
    S = empty();
    const bought = has && E.buyNitro(S);
    ok(bought && S.boostT === E.BIKES.courier.boostT && S.ev.some((e) => e.t === 'boost' && e.bought), 'a refill starts a full boost of the bike and says it was bought');
    ok(has && !E.buyNitro(S), 'a second buy during that boost does nothing');
    const T2 = E.fromSeed(817, false, 'medium', 'sunny', 'thunder'); T2.waves = []; T2.ny = 1e9;
    ok(has && E.buyNitro(T2) && T2.boostT === E.BIKES.thunder.boostT, 'the boost is the bike\'s own (the thunder\'s is longer)');

    // a rider who buys every refill offered still finishes: every scene, every bike, every difficulty
    function rider(S0, mins) {
      let wait = 0, cur = null, buys = 0, offered = 0;
      E.gas(S0, true);
      for (let i = 0; i < 60 * 60 * mins && !S0.over; i++) {
        const rear = S0.p - E.BIKE_L, w = S0.waves.find((x) => x.y + x.span > rear);
        if (w && w !== cur) { if (cur) wait = Math.ceil(0.35 / E.DT); cur = w; }
        if (wait > 0) wait--; else if (cur && S0.tl !== cur.f) E.steer(S0, cur.f > S0.tl ? 1 : -1);
        if (has && E.nitroOffered(S0)) { offered++; if (E.buyNitro(S0)) buys++; }
        E.step(S0); E.drain(S0);
      }
      return { S: S0, buys, offered };
    }
    let crashes = [], runs = 0, buysAll = 0;
    for (const sc of ['sunny', 'rainy', 'snowy', 'night']) {
      for (const bk of E.BIKE_IDS || ['courier']) {
        for (const df of ['easy', 'medium', 'hard']) {
          const r = rider(E.fromSeed(runs * 131 + 7, false, df, sc, bk), 1);
          runs++; buysAll += r.buys;
          if (r.S.over) crashes.push(sc + '/' + bk + '/' + df);
        }
        await tick();
      }
    }
    ok(runs === 48 && crashes.length === 0, 'a rider buying every nitro offered rides a minute on every scene, bike and difficulty without a crash (' + runs + ' rides' + (crashes.length ? ', crashed: ' + crashes.slice(0, 4).join(', ') : '') + ')');
    ok(buysAll >= runs, 'and the refill is really offered on the road, not only in theory (' + buysAll + ' bought in ' + runs + ' minutes)');
    const D2 = rider(E.fromSeed(5, true, 'medium', 'sunny', 'courier'), 3);
    ok(D2.S.won && D2.buys === 0, 'the daily is finished with no refill offered');

    // the page: the core's wallet, price taken once, the short-wallet toast
    const fnSrc = (html.match(/\n {2}function buyNitro\(\) \{[\s\S]*?\n {2}\}\n/) || [''])[0];
    ok(/C\.coins\.can\(E\.NITRO_PRICE\)/.test(fnSrc) && /C\.coins\.spend\(E\.NITRO_PRICE\)/.test(fnSrc) && /C\.t\('notEnoughCoins'\)/.test(fnSrc) && /C\.t\('playToEarn'\)/.test(fnSrc), 'the page pays with C.coins.can and C.coins.spend and shows the not-enough-coins toast');
    let toasts = [], spent = 0, buys = 0;
    const run = (wallet, offer) => {
      toasts = []; spent = 0; buys = 0;
      const C = {
        coins: { can: (n) => wallet >= n, spend: (n) => { if (wallet < n) return false; wallet -= n; spent += n; return true; } },
        ui: { toast: (o) => toasts.push(o.title) }, t: (k) => k
      };
      const Em = { NITRO_PRICE: 15, nitroOffered: () => offer, buyNitro: () => { buys++; return true; } };
      const sb = { C, E: Em, S: {}, ended: false, waiting: false, held: false, draw: () => {} };
      vm.createContext(sb);
      vm.runInContext(fnSrc + '\nbuyNitro();', sb);
      return wallet;
    };
    let w = run(40, true);
    ok(w === 25 && spent === 15 && buys === 1, 'with 40 coins a refill takes 15, once (' + w + ' left)');
    w = run(10, true);
    ok(w === 10 && buys === 0 && toasts[0] === 'notEnoughCoins', 'with 10 coins nothing is taken and the not-enough-coins toast shows');
    w = run(40, false);
    ok(w === 40 && buys === 0 && toasts.length === 0, 'when no refill is offered a tap or key takes nothing');

    const keys = ['buyNitro', 'nitroBought', 'nitroHelp'], missing = [];
    for (const code of LOCALE_CODES) {
      const m = html.match(new RegExp('\\n {6}' + code + ': \\{([\\s\\S]*?)\\n {6}\\}'));
      for (const k of keys) if (!m || !new RegExp('\\b' + k + ': \'').test(m[1])) missing.push(code + '.' + k);
    }
    ok(LOCALE_CODES.length >= 7 && missing.length === 0, 'the refill strings exist in all ' + LOCALE_CODES.length + ' languages' + (missing.length ? ' (missing ' + missing.slice(0, 6).join(', ') + ')' : ''));
    ok(/class: 'mr-buy', type: 'button'/.test(html) && /C\.keyIs\(e, 'n'\)\) \{ e\.preventDefault\(\); buyNitro\(\)/.test(html), 'the refill is a real button over the road and the N key');
  }
  return { testMotoRushNitro };
};
