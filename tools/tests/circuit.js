'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #764: a top-down pixel racing game against bot cars («پیست» / Circuit)
  function testCircuit() {
    head('Circuit (#764)');
    const t0 = Date.now();
    const E = loadEngine('circuit', 'CircuitEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/circuit/index.html'), 'utf8');
    const LEVELS = ['easy', 'medium', 'hard'];

    // a player bound to the real controls: full left, full right or straight, auto gas.
    // It follows the bot's line, but only by holding a half of the screen or letting go.
    const player = (S) => {
      const d = E.botInput(S, 0).steer, st = S.cars[0].st;
      let s = 0;
      if (d > st + 0.04) s = d <= 0 ? 0 : 1;
      else if (d < st - 0.04) s = d >= 0 ? 0 : -1;
      else s = Math.abs(st) < 0.04 ? 0 : st > 0 ? (d > 0.9 ? 1 : 0) : (d < -0.9 ? -1 : 0);
      if (Math.abs(d - st) <= 0.04 && Math.abs(st) >= 0.04) s = Math.sign(st);
      return { steer: s, brake: false };
    };
    const play = (S, limit) => {
      let n = 0, walls = 0;
      const ev = [];
      while (!S.over && n < (limit || 60 * 240)) {
        E.step(S, player(S)); n++;
        for (const e of E.drain(S)) { ev.push(e); if (e.t === 'wall' && e.car === 0) walls++; }
      }
      return { S, ev, walls };
    };

    // the tracks
    ok(E.TRACKS.length >= 4, 'there are at least four hand-made tracks (' + E.TRACKS.length + ')');
    const built = E.TRACKS.map((t) => [t.id, E.build(t.ctrl)]);
    ok(built.length > 0 && built.every(([, b]) => b.check.ok), 'every hand-made track passes the radius, spacing and screen checks (' + built.map(([id, b]) => id + ' r' + b.check.minR.toFixed(0) + ' gap' + b.check.minSep.toFixed(0)).join(', ') + ')');

    // every track can be finished at every level, and easy can be won
    const results = [];
    for (const [id, Tk] of built) for (const lv of LEVELS) {
      const r = play(E.race(Tk, lv));
      results.push({ id, lv, over: r.S.over, place: r.S.cars[0].place, laps: r.S.cars[0].laps.length, walls: r.walls });
    }
    ok(results.length === built.length * 3 && results.every((r) => r.over && r.laps === E.LAPS), 'a test player on the real controls finishes all ' + E.LAPS + ' laps of every track at every level (' + results.filter((r) => r.over).length + '/' + results.length + ')');
    ok(results.filter((r) => r.lv === 'easy').every((r) => r.place === 1), 'the test player wins every track on easy (' + results.filter((r) => r.lv === 'easy').map((r) => r.id + ' ' + r.place).join(', ') + ')');
    ok(results.filter((r) => r.lv === 'hard').some((r) => r.place > 1), 'hard is not a free win: a bot beats the test player somewhere (' + results.filter((r) => r.lv === 'hard').map((r) => r.id + ' ' + r.place).join(', ') + ')');
    ok(results.every((r) => r.walls <= 1), 'the test player stays off the tyre walls on the hand-made tracks (' + results.map((r) => r.walls).join('') + ')');

    // the daily track: generated, checked, and drivable
    const seeds = [];
    for (let s = 1; s <= 40; s++) seeds.push(s * 7919);
    let gen = 0, done = 0, failed = [];
    for (const sd of seeds) {
      const Tk = E.generate(E.mulberry(sd));
      if (!Tk) { failed.push(sd + ' (none)'); continue; }
      gen++;
      if (!Tk.check.ok) { failed.push(sd + ' (check)'); continue; }
      const r = play(E.race(Tk, 'medium'));
      if (r.S.over && r.S.cars[0].laps.length === E.LAPS) done++; else failed.push(sd);
    }
    ok(seeds.length === 40 && gen === 40 && done === 40, 'every one of 40 generated daily tracks passes the checks and the test player finishes it (' + done + '/' + seeds.length + (failed.length ? '; failed ' + failed.join(', ') : '') + ')');
    const g1 = E.generate(E.mulberry(12345)), g2 = E.generate(E.mulberry(12345)), g3 = E.generate(E.mulberry(54321));
    ok(!!g1 && JSON.stringify(g1.pts) === JSON.stringify(g2.pts) && JSON.stringify(g1.pts) !== JSON.stringify(g3.pts), 'the same seed gives the same daily track, another seed another');

    // determinism and saves
    const oval = built[0][1];
    const runN = (S, n) => { for (let i = 0; i < n; i++) { E.step(S, player(S)); E.drain(S); } return S; };
    const a = runN(E.race(oval, 'hard'), 900), b = runN(E.race(oval, 'hard'), 900);
    ok(JSON.stringify(E.snapshot(a)) === JSON.stringify(E.snapshot(b)), 'two races with the same inputs end in the same state');
    const half = runN(E.race(oval, 'medium'), 700), snap = JSON.parse(JSON.stringify(E.snapshot(half)));
    const back = E.restore(snap, oval);
    runN(half, 600); runN(back, 600);
    ok(!!back && JSON.stringify(E.snapshot(half)) === JSON.stringify(E.snapshot(back)), 'a saved race restores and plays on exactly like the original');
    const bad = (f) => { const o = JSON.parse(JSON.stringify(snap)); f(o); return E.restore(o, oval) === null; };
    ok(E.restore(null, oval) === null && bad((o) => { o.level = 'insane'; }) && bad((o) => { o.cars.pop(); }) && bad((o) => { o.cars[0].k = E.LAPS + 1; }) && bad((o) => { o.cars[1].i = 99999; }) && bad((o) => { o.t = -5; }) && bad((o) => { o.cars[2].x = 'x'; }), 'a broken save is refused: no race, a bad level, three cars, too many laps, a sample off the track, negative time, a non-number');

    // the start and lap counting
    let S = E.race(oval, 'medium');
    const cdEv = [];
    for (let i = 0; i < E.GO; i++) { E.step(S, { steer: 1 }); cdEv.push(...E.drain(S)); }
    ok(S.cars.every((c) => c.v === 0) && S.t === 0 && cdEv.map((e) => e.t).join() === 'count,count,go', 'the countdown holds every car and calls two counts and a go (' + cdEv.map((e) => e.t).join() + ')');
    ok(S.cars.every((c) => c.k === -1), 'every car starts behind the line');
    runN(S, 120);
    ok(S.cars[0].k === 0 && S.cars[0].laps.length === 0, 'crossing the line the first time starts lap one without recording a lap');
    // the player is put on the line by hand, so it can back over it and cross again
    const put = (St, s) => { const P = E.at(St.T, s, 0), c = St.cars[0]; c.x = P.x; c.y = P.y; c.ang = P.ang; c.v = 0; };
    S = E.race(oval, 'medium'); S.cd = 0;
    put(S, -4); S.cars[0].i = E.at(oval, -4, 0).i;
    E.step(S, { brake: true }); put(S, 4); E.step(S, { brake: true });
    ok(S.cars[0].k === 0, 'driving onto the line by hand starts the timed lap (k ' + S.cars[0].k + ')');
    // round the track to just behind the line (the sample is set too, so the jump is no crossing)
    S.t += 400; put(S, -4); S.cars[0].i = E.at(oval, -4, 0).i; E.step(S, { brake: true }); put(S, 4); E.step(S, { brake: true });
    let ev = E.drain(S);
    ok(S.cars[0].k === 1 && S.cars[0].laps.length === 1 && ev.some((e) => e.t === 'lap' && e.car === 0 && e.k === 1), 'the next crossing records lap one (laps ' + S.cars[0].laps.length + ')');
    put(S, -4); E.step(S, { brake: true });
    ok(S.cars[0].k === 0, 'backing over the line takes the lap count back down (k ' + S.cars[0].k + ')');
    put(S, 4); E.step(S, { brake: true }); ev = E.drain(S);
    ok(S.cars[0].k === 1 && S.cars[0].laps.length === 1 && !ev.some((e) => e.t === 'lap'), 'driving across again after backing over is not a new lap, so a wiggle cannot set a best lap of a few ticks');
    // a whole race: the player's finish ends it with its place and the last lap
    const full = play(E.race(oval, 'easy'));
    const over = full.ev.find((e) => e.t === 'over'), last = full.ev.find((e) => e.t === 'lap' && e.last);
    ok(full.S.over && !!over && over.place === full.S.cars[0].place && !!last && last.car === 0, 'the player\'s finish ends the race with its place and a last-lap event');
    const tAfter = full.S.t;
    E.step(full.S, player(full.S));
    ok(full.S.t === tAfter, 'nothing moves once the race is over');
    const c0 = full.S.cars[0];
    ok(c0.best === Math.min.apply(null, c0.laps) && c0.laps.every((l) => l > 200), 'the best lap is the fastest recorded lap, and no lap is implausibly short (' + c0.laps.join(', ') + ')');

    // the surface used for drawing
    const p0 = oval.pts[0];
    ok(E.surface(oval, p0.x, p0.y).kind === 'road' && E.surface(oval, 120, 160).kind !== 'road', 'the surface under the line is road, the infield is not');

    // the page
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'circuit');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/circuit/index.html' && gm.daily !== false, 'Circuit is listed as a one-player skill game with a daily track');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const A = lab(x), B = lab(y); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
    const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const near = games.filter((g) => g.id !== 'circuit').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/circuit/icon.svg'), 'utf8');
    ok(new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['ci-win', 'ci-hard', 'ci-clean', 'ci-daily'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the four awards are in the core and unlocked by the game');
    ok(/C\.daily\('circuit', dailyDate\)\.rng/.test(html) && /C\.stats\.best\('circuit', bestKey\(\)/.test(html), 'the daily track is seeded by the day, and the best lap is kept per track');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    ok(!/retro ?racing/i.test(html) && !/retro ?racing/i.test(JSON.stringify(gm)), 'the product name "Retro Racing" appears nowhere');
    const ms = Date.now() - t0;
    ok(ms < 6000, 'the Circuit tests finish in under 6 s (' + ms + ' ms)');
  }
  return { testCircuit };
};
