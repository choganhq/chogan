'use strict';
// #806: Hillrider's world was empty. Far mountains in three hazy ranges, trees, bushes,
// stones, signs and fences beside the road, animals around them, and a rock or a branch
// on the road now and then that jolts the car. Everything follows from the course seed,
// at the same density however far the car gets, and a test player still drives fifty
// seeded courses to the flag with the bumps on.
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT } = T;
  function testHillriderWorld() {
    head('Hillrider: a richer world beside the road (#806)');
    const t0 = Date.now();
    const E = loadEngine('hillrider', 'HillriderEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/hillrider/index.html'), 'utf8');
    const has = (f) => typeof E[f] === 'function';
    ok(has('bumps') && has('scenery') && has('animals') && has('animalAt'), 'the engine places bumps, scenery and animals');
    if (!has('bumps') || !has('scenery') || !has('animals') || !has('animalAt')) return;

    // the bumps: from the seed alone, the same rate near and far, never steep, never at a can
    const A = E.newGame(806, 0), B = E.newGame(806, 0), C2 = E.newGame(807, 0);
    const la = E.bumps(A, 0, 6000), lb = E.bumps(B, 0, 6000), lc = E.bumps(C2, 0, 6000);
    ok(la.length > 0 && JSON.stringify(la) === JSON.stringify(lb) && JSON.stringify(la) !== JSON.stringify(lc), 'the same seed lays the same bumps, another seed others (' + la.length + ' in 6 km)');
    let near = 0, far = 0, bad = 0, minGap = 1e9, prev = -1e9;
    const seeds = [806, 807, 808, 809, 810];
    for (const sd of seeds) {
      const S = E.newGame(sd, 0); prev = -1e9;
      for (const b of E.bumps(S, 0, 6000)) {
        if (b.x < 3000) near++; else far++;
        minGap = Math.min(minGap, b.x - prev); prev = b.x;
        let steep = false;
        for (let d = -3; d <= 3; d++) if (Math.abs(E.ground(S, b.x + d).s) > E.BUMP_FLAT) steep = true;
        let can = 1e9;
        for (let n = 0; n < 60; n++) can = Math.min(can, Math.abs(E.fuelAt(S, n) - b.x));
        if (steep || can < E.BUMP_CAN || b.x < 40 || (b.kind !== 'rock' && b.kind !== 'branch')) bad++;
      }
    }
    ok(near >= 80 && far >= 80 && Math.abs(near - far) <= 10, 'about one bump every 150 m, as many in the far 3 km as the first 3 km (' + near + ' vs ' + far + ' on five courses)');
    ok(bad === 0 && minGap > 60, 'no bump on a slope over ' + E.BUMP_FLAT + ', within ' + E.BUMP_CAN + ' m of a can or in the first 40 m, and two are never closer than 60 m (' + bad + ' bad, closest ' + minGap + ' m)');

    // a jolt, not a wall: rolling over the first bump throws the wheel up and the run goes on
    const J = E.newGame(806, 0), first = E.bumps(J, 0, 400)[0];
    let jolted = false, vyUp = 0, before = 0;
    for (let i = 0; i < 3000 && !J.over && J.x < first.x + 6; i++) {
      const v0 = J.wh[1].vy, ev = E.step(J, E.botControl(J));
      if (ev.indexOf('bump') >= 0 && !jolted) { jolted = true; vyUp = J.wh[1].vy - v0; before = J.vx; }
    }
    ok(jolted && !J.over && J.x > first.x + 5, 'the car rolls over the ' + first.kind + ' at ' + first.x + ' m with a jolt and drives on (wheel thrown up by ' + vyUp.toFixed(2) + ' m/s, speed ' + before.toFixed(1) + ' m/s)');

    // A test player: fifty days' courses, picked the way the daily is (E.courseSeed: the first
    // of up to twelve seeds the driver finishes), all reached with the bumps on; and nearly
    // every first seed already drives (measured 2026-11-12: 44 of 50 raw courses with the
    // bumps, 43 without, so the bumps cost no course).
    let won = 0, firstTry = 0, runs = 0;
    for (let d = 0; d < 50; d++) {
      const seed = (d * 2654435761 + 806) >>> 0;
      for (let k = 0; k < 12; k++) {
        const G = E.newGame((seed + k * 7919) >>> 0, 1000);
        runs++;
        while (!G.over && !G.won && G.t < 300) E.step(G, E.botControl(G));
        if (G.won) { won++; if (k === 0) firstTry++; break; }
      }
    }
    ok(won === 50, 'the test player reaches the 1000 m flag on all fifty daily courses with the bumps on (' + won + '/50, ' + runs + ' runs)');
    ok(firstTry >= 42, 'and on ' + firstTry + ' of 50 the first seed already drives, so the bumps do not make the generator search');

    // scenery: a pure function of the seed, as full far away as near
    const s1 = E.scenery(806, 0, 600), s2 = E.scenery(806, 0, 600), s3 = E.scenery(807, 0, 600), sFar = E.scenery(806, 6000, 6600);
    ok(s1.length > 0 && JSON.stringify(s1) === JSON.stringify(s2) && JSON.stringify(s1) !== JSON.stringify(s3), 'the same seed grows the same roadside (' + s1.length + ' things in 600 m)');
    ok(Math.abs(s1.length - sFar.length) <= 15 && s1.length >= 50, 'the roadside is as full at 6 km as at the start (' + s1.length + ' vs ' + sFar.length + ' in 600 m)');
    const kinds = new Set(E.scenery(806, 0, 3000).map((o) => o.kind));
    ok(['tree', 'bush', 'stone', 'sign', 'fence'].every((k) => kinds.has(k)), 'trees, bushes, stones, signs and fences all appear (' + [...kinds].join(', ') + ')');
    const ani = E.animals(806, 0, 3000), aniKinds = new Set(ani.map((a) => a.kind));
    ok(ani.length >= 15 && ['rabbit', 'bird', 'deer'].every((k) => aniKinds.has(k)), 'rabbits, birds and deer live beside the road (' + ani.length + ' in 3 km)');
    // an animal moves with the clock but stays near its home
    let roam = 0, moved = 0;
    for (const a of ani) {
      const p0 = E.animalAt(a, 0), p1 = E.animalAt(a, 1.3);
      for (let t = 0; t < 30; t += 0.25) roam = Math.max(roam, Math.abs(E.animalAt(a, t).x - a.x));
      if (p0.x !== p1.x || p0.up !== p1.up) moved++;
    }
    ok(moved === ani.length && roam <= 6.01, 'every animal moves, and none wanders more than 6 m from its home (' + moved + '/' + ani.length + ', furthest ' + roam.toFixed(2) + ' m)');

    // the page: mountains, scenery behind the road edge, bumps on the road, dressed per scene
    ok(/mountains\(g, Z, P\);/.test(html) && /var RANGES = \[\{ sp: 0\.04[^\]]*sp: 0\.08[^\]]*sp: 0\.16/.test(html) && /mixHex\(P\.mtn, P\.sky1, L\.haze\)/.test(html),
      'three mountain ranges, each slower and hazier than the one in front');
    const draw = (html.match(/\n {2}function draw\(\) \{[\s\S]*?\n {2}\}\n/) || [''])[0];
    ok(draw.length > 0 && draw.indexOf('roadside(g, P, x0, x1)') > 0 && draw.indexOf('roadside(g, P, x0, x1)') < draw.indexOf('g.fillStyle = P.dirt; g.fill();') && draw.indexOf('E.bumps(S, x0, x1)') < draw.indexOf('drawCar(g, P, V'),
      'the roadside is drawn before the ground, so the road covers its feet, and the bumps before the car');
    ok(/E\.scenery\(S\.seed,/.test(html) && /E\.animals\(S\.seed,/.test(html) && /C\.ui\.reduceMotion\(\) \? 0 : clock/.test(html), 'the page draws the engine\'s scenery and animals, still when motion is reduced');
    ok(/snowy = S\.scene === 'snow'/.test(html) && /if \(wet\)/.test(html) && E.look('night', false).tree && E.look('snow', false).mtn && E.look('rain', true).mtn, 'snow lies on trees and stones, wet stones shine, and night darkens the roadside');
    const ms = Date.now() - t0;
    ok(ms < 20000, 'the world tests finish in under 20 s (' + ms + ' ms; CI runs about three times slower than a laptop)');
  }
  return { testHillriderWorld };
};
