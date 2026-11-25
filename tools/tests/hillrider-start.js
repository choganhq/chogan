'use strict';
// #1180: a player wrote that in Hill Rider it was hard to die. The hills began flat and
// grew to full size only at 2,000 m, so the first minutes asked almost nothing. These
// checks measure the start with two plain drivers on the real physics, and keep the
// daily flag within reach for the free buggy.
module.exports = function (T) {
  const { ok, head, loadEngine } = T;
  function testHillriderStart() {
    head('Hill Rider: the start asks something of the driver (#1180)');
    const t0 = Date.now();
    const E = loadEngine('hillrider', 'HillriderEngineFactory');
    const run = (S, drive, lim) => { while (!S.over && !S.won && S.t < lim) E.step(S, drive(S)); return S; };
    const seeds = Array.from({ length: 20 }, (_, i) => ((i + 1) * 2654435761) >>> 0);
    const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    ok(seeds.length === 20, 'twenty endless courses to measure on');
    // a driver who only holds the gas: it was about 540 m on these courses before #1180, now about 190 m
    const full = seeds.map((s) => E.metres(run(E.newGame(s, 0, 'sun', 'buggy'), () => 1, 600)));
    ok(median(full) <= 300, 'holding the gas the whole way ends sooner (median ' + median(full) + ' m of ' + full.length + ' runs; it was about 540 m)');
    // the hills in the first 500 m: the mean climb or drop over each 10 m stretch. The
    // steady driver is not run here (seconds of CI); the daily, raw, car, scene and race
    // tests still prove it reaches the flags.
    const climb = seeds.map((s) => { const S = E.newGame(s, 0); let sum = 0, n = 0; for (let x = 0; x < 500; x += 10) { sum += Math.abs(E.height(S, x + 10) - E.height(S, x)); n++; } return sum / n; });
    const meanClimb = climb.reduce((p, q) => p + q, 0) / climb.length;
    ok(meanClimb >= 1.3, 'the first 500 m have real hills (mean ' + meanClimb.toFixed(2) + ' m up or down every 10 m; it was about 1.1 m)');
    ok(E.hard(0) === 0.25 && E.hard(500) === 0.25 && E.hard(1000) === 0.5 && E.hard(2000) === 1, 'the hills start at a quarter of their full size, and from 500 m on grow as before');
    // the second can is a little further away, so the first tank has to be driven well
    const gap = seeds.map((s) => { const S = E.newGame(s, 0); return E.fuelAt(S, 1) - E.fuelAt(S, 0); });
    ok(median(gap) >= 210, 'the gap to the second can is longer (median ' + median(gap) + ' m; it was about 180 m)');
    // a run saved on the old hills is not put back into the new ground
    const S = run(E.newGame(77, 0), (G) => E.botControl(G), 20);
    const snap = JSON.parse(JSON.stringify(E.snapshot(S)));
    const old = Object.assign({}, snap); delete old.hills;
    ok(snap.hills === E.HILLS && E.restore(snap) !== null && E.restore(old) === null, 'a save from the old hills is refused, so the car never starts inside the ground');
    const ms = Date.now() - t0;
    ok(ms < 6000, 'the start tests finish in under 6 s (' + ms + ' ms; CI runs about three times slower)');
  }
  return { testHillriderStart };
};
