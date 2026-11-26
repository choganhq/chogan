'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine } = T;
  // #1236: a player found no springs above 1000 m. The chance per platform fell from 8 %
  // to 4 % while the platforms grew further apart, so springs per metre fell to about a
  // third (1.2 per 100 m at the start, 0.45 at 1000 m, 0.3 at the top): a long stretch
  // without one was common. Springs per 100 m now stay about level all the way up.
  function testHopSprings() {
    head('Hop: springs all the way up (#1236)');
    const E = loadEngine('hop', 'HopEngineFactory');
    const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
    // 40 endless courses grown to 3000 m; springs counted per 100 m in three bands
    const bands = [[0, 500], [1000, 1500], [2000, 3000]], count = bands.map(() => 0);
    let courses = 0, draws = 0;
    for (let s = 1; s <= 40; s++) {
      const S = E.newGame(rng(s * 7919), 0);
      E.grow(S, 30000);
      courses++;
      S.plats.forEach((p) => {
        if (p.kind !== 'spring') return;
        bands.forEach((b, i) => { if (p.y >= b[0] * 10 && p.y < b[1] * 10) count[i]++; });
      });
      draws += S.draws;
    }
    const per100 = count.map((c, i) => c / courses / ((bands[i][1] - bands[i][0]) / 100));
    const shown = per100.map((v, i) => bands[i].join('–') + ' m: ' + v.toFixed(2)).join(', ');
    ok(courses === 40 && draws > 0, 'forty courses were grown (' + courses + ')');
    ok(per100[0] > 0.8, 'springs near the start stay as they were, about one per 100 m (' + shown + ')');
    ok(per100.every((v) => v >= per100[0] * 0.75), 'springs per 100 m never fall below three quarters of the start (' + shown + ')');
  }
  return { testHopSprings };
};
