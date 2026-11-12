'use strict';
// #814: Moto Rush's roadside: mountains, trees, poles, signs, villages and animals beside
// the road, seeded, never on it, at a constant density, and changing with the level
// (fields, forest, mountain pass, desert). The road's sizes are the drawing's, written here.
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT } = T;
  const LIMIT_MS = 20000;
  async function testMotoRushRoadside() {
    head('Moto Rush: a roadside that follows the level (#814)');
    const t0 = Date.now();
    let timer = null;
    const hang = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), LIMIT_MS); });
    const res = await Promise.race([body().then(() => 'done'), hang]);
    clearTimeout(timer);
    ok(res === 'done', 'the roadside tests finished before the ' + (LIMIT_MS / 1000) + ' s guard (' + res + ')');
    const ms = Date.now() - t0;
    ok(ms < 6000, 'the roadside tests finish in under 6 s (' + ms + ' ms)');
  }
  const tick = () => new Promise((r) => setImmediate(r));

  async function body() {
    const E = loadEngine('motorush', 'MotoRushEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/motorush/index.html'), 'utf8');
    // the road as drawn: tarmac to 6.5 m from the middle, reflector posts at 7.6 m
    const ROAD_EDGE = 6.5, POSTS = 7.6;
    const ORDER = ['fields', 'forest', 'pass', 'desert'];
    ok(typeof E.props === 'function' && typeof E.biomeAt === 'function', 'the engine places the roadside');
    if (typeof E.props !== 'function' || typeof E.biomeAt !== 'function') return;
    ok(JSON.stringify(E.BIOMES) === JSON.stringify(ORDER), 'the land runs fields, forest, mountain pass, desert');
    // the scenery follows the level on every difficulty, and comes round again
    for (const diff of ['easy', 'medium', 'hard']) {
      const lap = E.DIFF[diff].lap, seq = [];
      for (let lv = 1; lv <= 9; lv++) seq.push(E.biomeAt((lv - 1) * lap + lap / 2, diff));
      ok(seq.join(',') === [...ORDER, ...ORDER, ORDER[0]].join(','), diff + ': levels 1 to 9 ride through ' + seq.join(', '));
      ok(E.biomeAt(lap - 0.01, diff) === 'fields' && E.biomeAt(lap, diff) === 'forest', diff + ': the land changes exactly at the level line');
    }

    // never on the road, two a slot, seeded
    let n = 0, onRoad = 0, nearPosts = 0, badSlot = 0, badSides = 0, nearest = Infinity;
    const kinds = {}, perSlotOk = [];
    for (const sd of [1, 813, 2 ** 31 + 7]) {
      for (const b of ORDER) {
        kinds[b] = kinds[b] || new Set();
        for (let k = 0; k < 1500; k++) {
          const ps = E.props(sd, k, b);
          if (ps.length !== 2) badSlot++;
          if (!(ps.some((q) => q.side === -1) && ps.some((q) => q.side === 1))) badSides++;
          for (const q of ps) {
            n++;
            const ax = Math.abs(q.X);
            nearest = Math.min(nearest, ax);
            if (ax <= ROAD_EDGE) onRoad++;
            if (ax < POSTS + 0.8) nearPosts++;
            if (Math.sign(q.X) !== q.side || q.y < k * E.SIDE_STEP || q.y >= (k + 1) * E.SIDE_STEP || q.biome !== b) badSlot++;
            kinds[b].add(q.kind);
          }
        }
      }
      await tick();
    }
    ok(n === 3 * 4 * 1500 * 2 && onRoad === 0 && nearPosts === 0, 'of ' + n + ' things beside the road none is on it or by the posts (nearest ' + nearest.toFixed(2) + ' m from the middle; the road ends at ' + ROAD_EDGE + ')');
    ok(badSlot === 0 && badSides === 0, 'every ' + E.SIDE_STEP + ' m of road holds exactly one thing on each side, inside its own stretch');
    // a constant density: the same count in every 300 m the camera shows
    const win = (sd, b, from) => { let c = 0; for (let k = Math.floor(from / E.SIDE_STEP) - 1; k <= Math.floor((from + 300) / E.SIDE_STEP) + 1; k++) for (const q of E.props(sd, k < 0 ? 0 : k, b)) if (k >= 0 && q.y >= from && q.y < from + 300) c++; return c; };
    const counts = [];
    for (let from = 0; from < 20000; from += 137) counts.push(win(5, ORDER[(from / 137) % 4 | 0], from));
    const lo = Math.min(...counts), hi = Math.max(...counts);
    ok(counts.length > 100 && lo >= 34 && hi <= 40, 'every 300 m of road holds ' + lo + ' to ' + hi + ' things, whatever the land, so a phone draws no more in one place than another');
    ok(JSON.stringify(E.props(42, 77, 'pass')) === JSON.stringify(E.props(42, 77, 'pass')) && JSON.stringify(E.props(42, 77, 'pass')) !== JSON.stringify(E.props(43, 77, 'pass')), 'the roadside comes from the ride\'s seed: the same seed gives the same scenery, another seed another');
    // each land has its own things, and every land has animals
    const want = { fields: ['tree', 'house', 'animal', 'sign', 'pole'], forest: ['pine', 'tree', 'animal', 'sign'], pass: ['rock', 'pine', 'animal', 'sign', 'pole'], desert: ['cactus', 'rock', 'house', 'animal', 'sign'] };
    ok(ORDER.every((b) => want[b].every((k) => kinds[b].has(k))), 'fields have trees, villages, animals, signs and poles; the forest pines; the pass rocks and pines; the desert cacti and villages');
    ok(!kinds.fields.has('cactus') && !kinds.desert.has('pine') && !kinds.forest.has('cactus'), 'and nothing grows in the wrong land (no cactus in the fields, no pine in the desert)');
    const S0 = E.fromSeed(77, false), R0 = E.restore(Object.assign(E.snapshot(S0), { sd: undefined }));
    ok(S0.sd === 77 && !!R0 && typeof R0.sd === 'number', 'a ride keeps its roadside seed, and a save from before gets one');

    // the scenery is only drawn: a test rider asking for the roadside every tick rides
    // exactly as one who never does, and still finishes the daily ride
    const ride = (S, look) => {
      let wait = 0, cur = null;
      for (let i = 0; i < 60 * 60 * 6 && !S.over; i++) {
        const rear = S.p - E.BIKE_L, w = S.waves.find((x) => x.y + x.span > rear);
        if (w && w !== cur) { if (cur) wait = 21; cur = w; }
        if (wait > 0) wait--; else if (cur && S.tl !== cur.f) E.steer(S, cur.f > S.tl ? 1 : -1);
        if (look) { const k = Math.floor(S.d / E.SIDE_STEP); for (let j = k; j < k + 20; j++) E.props(S.sd, j, E.biomeAt(S.p, S.diff)); }
        E.step(S); E.drain(S);
      }
      return S;
    };
    const r = rng(814), seedRide = () => E.newGame(r, true);
    const a = seedRide(), b = E.restore(E.snapshot(a));
    ride(a, true); ride(b, false);
    ok(a.won && JSON.stringify(E.snapshot(a)) === JSON.stringify(E.snapshot(b)), 'a test rider looking at the roadside every tick finishes the daily ride exactly as one who does not');

    // the page
    ok(/function roadside\(g, P\)/.test(html) && /ground\(g, P, S\.d\);\n\s*roadside\(g, P\);/.test(html), 'the page draws the roadside right after the ground, before the traffic');
    ok(/mountains\(g, P\);/.test(html) && /function ridge\(b, x\)/.test(html) && ORDER.every((b) => new RegExp('\\b' + b + ': \\{ grass:').test(html)), 'far mountains and the land\'s colours exist for each of the four lands');
    ok((html.match(/applyLand\(P, landNow\(\)\);/g) || []).length === 2 && /into \/ 150/.test(html), 'the land is painted in the game and on the share card, and turns over the first 150 m of a level');
    ok((html.match(/slotBiome = \{\};/g) || []).length >= 3 && /if \(!slotBiome\[k\]\) slotBiome\[k\] = now;/.test(html), 'each slot keeps the land it came into view in, and a new ride starts afresh');
  }
  return { testMotoRushRoadside };
};
