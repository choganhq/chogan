'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #906: stop falling warheads with counter-missiles («سپر آسمان» / Sky Shield)
  function testSkyShield() {
    head('Sky Shield (#906)');
    const t0 = Date.now();
    const E = loadEngine('skyshield', 'SkyShieldEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/skyshield/index.html'), 'utf8');
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const sum = (a) => a.reduce((s, v) => s + v, 0);
    // a run of the engine's own test player from a fresh skyline, wave by wave
    const run = (seed, waves) => {
      const S = E.game(seed), log = [];
      for (let w = 1; w <= waves; w++) {
        E.startWave(S, E.nextSeed(seed, w), w);
        E.play(S, 300);
        log.push({ phase: S.phase, cities: E.alive(S), fired: S.fired });
        if (S.phase !== 'clear') break;
      }
      return { S, log };
    };

    // the same seed gives the same wave and the same fight
    const A = E.plan(12345, 6), B = E.plan(12345, 6);
    ok(A.items.length > 8 && same(A, B), 'a seed and level always give the same wave');
    ok(!same(E.plan(12346, 6).items, A.items), 'another seed gives another wave');
    const ra = run(777, 6), rb = run(777, 6);
    ok(same(ra.log, rb.log) && ra.S.score === rb.S.score && ra.S.score > 0, 'replaying the same taps gives the same fight and score');

    // waves get harder: more warheads, faster, closer together; splitters on 3, fast ones on 4
    const p1 = E.params(1), p2 = E.params(2), p3 = E.params(3), p4 = E.params(4), p10 = E.params(10);
    ok(p10.count > p1.count && p10.speed > p1.speed && p10.count / p10.span > p1.count / p1.span, 'later waves bring more warheads, faster and closer together');
    ok(p1.split === 0 && p2.split === 0 && p3.split > 0 && p10.split > p3.split && E.params(99).split <= 0.4, 'splitting warheads join on wave 3 and grow, within a limit');
    ok(p3.fast === 0 && p4.fast > 0 && p10.fast > p4.fast && E.params(99).fast <= 0.35, 'fast warheads join on wave 4 and grow, within a limit');
    ok(E.params(10).mult > E.params(1).mult && E.params(99).mult <= 6, 'later waves score more per warhead, within a limit');
    const ms3 = E.makePlan(5, 6).items;
    ok(ms3.some((it) => it.kids && it.kids.length >= 2 && it.sy > E.GROUND) && ms3.some((it) => it.fast) && ms3.every((it) => it.x >= 0 && it.x <= E.W && it.tg >= 0 && it.tg <= 8), 'a later wave holds splitters and fast warheads, all aimed inside the world');

    // Every wave a player meets is one the test player held from a full skyline (#906):
    // waves 1-12 of many runs, and the daily waves of many days
    let met = 0, held = 0, fails = [];
    for (let lv = 1; lv <= 12; lv++) {
      for (let s = 0; s < 5; s++) {
        const seed = (lv * 7919 + s * 104729) >>> 0, P = E.plan(seed, lv);
        met++;
        if (P.keep >= E.KEEP && E.check(P) === P.keep) held++; else fails.push(lv + ':' + s + ':' + P.keep);
      }
    }
    ok(met === 60 && held === met, 'the test player holds every generated wave 1-12 with at least ' + E.KEEP + ' cities (' + held + '/' + met + (fails.length ? '; failed ' + fails.slice(0, 5).join(', ') : '') + ')');
    const dr = T.rng(20261115);
    let dMet = 0, dHeld = 0;
    for (let d = 0; d < 20; d++) {
      E.DAILY.forEach((lv) => {
        const P = E.plan(Math.floor(dr() * 4294967296) >>> 0, lv);
        dMet++;
        if (P.keep >= E.KEEP) dHeld++;
      });
    }
    ok(dMet === 100 && dHeld === dMet, 'the test player holds every daily wave of 20 days (' + dHeld + '/' + dMet + ')');
    // the generator itself, before plan throws a wave away: a flaw would show here first
    let raw = 0, rawN = 0;
    for (let lv = 1; lv <= 10; lv++) {
      for (let s = 0; s < 6; s++) {
        rawN++;
        if (E.check(E.makePlan((lv * 31337 + s * 7) >>> 0, lv)) >= E.KEEP) raw++;
      }
    }
    ok(rawN === 60 && raw / rawN >= 0.9, 'the test player holds at least 90% of raw waves 1-10 before any is thrown away (' + raw + '/' + rawN + ')');
    // whole runs: waves 1-5 are always survived, and the test player spends more each wave
    const runs = [1, 2, 3, 4, 5, 6].map((s) => run(s * 99, 5));
    ok(runs.length === 6 && runs.every((r) => r.log.length === 5 && r.log.every((l) => l.phase === 'clear')), 'the test player survives waves 1-5 of every run (' + runs.map((r) => r.log.length).join(',') + ')');
    const used = (lv) => sum([0, 1, 2, 3, 4, 5].map((s) => { const S = E.game(1); E.arm(S, E.plan(lv * 1000 + s, lv)); E.play(S, 300); return S.fired; })) / 6;
    const u1 = used(1), u5 = used(5), u10 = used(10);
    ok(u1 < u5 && u5 < u10, 'the test player needs more missiles as the waves go on (' + u1.toFixed(1) + ' < ' + u5.toFixed(1) + ' < ' + u10.toFixed(1) + ')');
    const long = run(4242, 40);
    ok(long.S.phase === 'over' && long.log.length > 8 && long.log.length < 40, 'an endless run ends at last, after more than eight waves (wave ' + long.log.length + ')');

    // firing: the nearest battery with a missile, or the fullest behind the gear
    const S = E.game(1);
    E.arm(S, { seed: 1, level: 1, items: [] });
    ok(E.pick(S, 10) === 0 && E.pick(S, 48) === 1 && E.pick(S, 90) === 2, 'a tap fires from the nearest battery');
    S.bats[0].ammo = 0;
    ok(E.pick(S, 10) === 1, 'an empty battery is skipped for the next nearest');
    S.bats[1].ammo = 3;
    ok(E.pick(S, 10, 'full') === 2, 'the fullest battery fires when the gear says so');
    const sh = E.fire(S, 30, 60);
    ok(!!sh && sh.b === 1 && S.bats[1].ammo === 2 && sh.tx === 30 && sh.ty === 60, 'a shot leaves the battery and flies to the tapped point');
    ok(E.fire(S, 30, 1).ty === E.MIN_Y && E.fire(S, 30, 60, 0) === null, 'a shot never bursts on the ground, and an empty battery cannot fire');
    // the shot reaches its point, bursts, the blast grows, holds and fades
    const S2 = E.game(1);
    E.arm(S2, { seed: 1, level: 1, items: [] });
    E.fire(S2, 50, 60, 1);
    let ev = [], n = 0;
    while (!S2.blasts.length && n++ < 200) ev = ev.concat(E.step(S2));
    ok(ev.indexOf('blast') >= 0 && S2.blasts[0].x === 50 && S2.blasts[0].y === 60, 'the missile bursts where it was aimed');
    ok(Math.abs(n * E.DT - (60 - E.BAT_Y) / E.SHOT_V[1]) < 0.05, 'it flies at its battery\'s speed');
    const bl = { r: 7, t: E.BLAST.grow / 2 };
    ok(E.blastR(bl) > 3 && E.blastR({ r: 7, t: E.BLAST.grow + 0.1 }) === 7 && E.blastR({ r: 7, t: E.LIFE }) === 0, 'a blast grows, holds its size, then fades away');
    // a warhead inside a blast is destroyed and bursts in turn; its neighbour goes with it
    const S3 = E.game(1);
    E.arm(S3, { seed: 1, level: 1, items: [] });
    const wh = (x, y) => ({ x, y, x0: x, y0: 100, tg: 0, tx: 20, v: 0.001, fast: false, vx: 0, vy: -0.001 });
    S3.war = [wh(50, 60), wh(53.5, 60), wh(80, 60)];
    S3.blasts = [{ x: 50, y: 60, r: 7, t: E.BLAST.grow, k: 'own' }];
    let ev3 = [];
    for (let i = 0; i < 30; i++) ev3 = ev3.concat(E.step(S3));
    ok(ev3.indexOf('kill') >= 0 && S3.war.length === 1 && S3.war[0].x === 80 && S3.score === 50 && S3.killed === 2, 'a blast destroys the warheads inside it and scores each, and spares the far one');
    S3.war = [wh(60, 30), wh(64, 30)];
    // a small own blast that cannot reach the second warhead: only the chain can
    S3.blasts = [{ x: 60, y: 30, r: 2, t: 0, k: 'own' }];
    let ev4 = [];
    for (let i = 0; i < 40; i++) ev4 = ev4.concat(E.step(S3));
    ok(ev4.indexOf('chain') >= 0 && S3.war.length === 0, 'a destroyed warhead\'s burst sets off a neighbour: chains count');
    // a splitter breaks into its children at its height
    const S4 = E.game(1);
    E.arm(S4, { seed: 1, level: 3, items: [{ at: 0, x: 50, tg: 0, tx: 20, v: 30, fast: false, sy: 60, kids: [{ tg: 1, tx: 29 }, { tg: 7, tx: 50 }] }] });
    let ev5 = [];
    for (let i = 0; i < 200 && ev5.indexOf('split') < 0; i++) ev5 = ev5.concat(E.step(S4));
    ok(ev5.indexOf('split') >= 0 && S4.war.length === 2 && S4.war.every((w) => w.vy < 0) && S4.war.map((w) => w.tg).join() === '1,7', 'a splitter breaks into children that go for their own targets');
    // a warhead on a city destroys it; on a battery, the battery and its missiles
    for (let i = 0; i < 400 && S4.phase === 'play'; i++) E.step(S4);
    ok(S4.cities[1] === 0 && S4.bats[1].alive === 0 && S4.bats[1].ammo === 0 && S4.lost === 1, 'a warhead destroys the city or battery it reaches');
    ok(S4.phase === 'clear' && S4.bonus && S4.bonus.cities === 5 && S4.bonus.ammo === 20 && S4.bonus.points === (20 * 5 + 5 * 100) * E.params(3).mult, 'a cleared wave pays for every city and missile left');
    // the last city lost ends the game
    const S5 = E.game(1);
    E.arm(S5, { seed: 1, level: 1, items: [{ at: 0, x: 20, tg: 0, tx: 20, v: 40, fast: false }] });
    S5.cities = [1, 0, 0, 0, 0, 0];
    let ev6 = [];
    for (let i = 0; i < 400 && S5.phase === 'play'; i++) ev6 = ev6.concat(E.step(S5));
    ok(S5.phase === 'over' && ev6.indexOf('over') >= 0 && ev6.indexOf('clear') < 0 && E.fire(S5, 50, 50) === null, 'losing the last city ends the game, and nothing fires after');
    // a new wave refills the batteries, and the score brings a lost city back
    const S6 = E.game(1);
    S6.cities = [0, 1, 1, 0, 1, 1]; S6.score = E.CITY_EVERY + 5;
    const back = E.startWave(S6, 9, 2);
    ok(same(back, [0]) && S6.cities[0] === 1 && S6.cities[3] === 0 && S6.nextCity === 2 * E.CITY_EVERY && E.ammo(S6) === 3 * E.AMMO && S6.phase === 'play', 'a new wave refills every battery and every ' + E.CITY_EVERY + ' points rebuild one city');

    // a saved wave comes back exactly, and a damaged save is refused
    const Ss = E.game(31);
    E.startWave(Ss, 4242, 5);
    const mem = { cd: 0 };
    for (let i = 0; i < 600; i++) { const c = E.bot(Ss, mem); if (c) E.fire(Ss, c.x, c.y, c.b); E.step(Ss); }
    const snap = JSON.parse(JSON.stringify(E.snapshot(Ss)));
    const Rs = E.restore(snap);
    ok(!!Rs && same(Rs.plan, Ss.plan) && Rs.t === Ss.t && Rs.score === Ss.score && same(Rs.war, Ss.war) && same(Rs.cities, Ss.cities), 'a saved wave comes back with its warheads, missiles and score');
    E.play(Rs, 300); E.play(Ss, 300);
    ok(Rs.phase === Ss.phase && Rs.score === Ss.score && same(Rs.cities, Ss.cities), 'and plays on exactly as it would have');
    ok(E.restore(null) === null && E.restore(Object.assign({}, snap, { cities: [0, 0, 0, 0, 0, 0] })) === null && E.restore(Object.assign({}, snap, { score: 'a' })) === null && E.restore(Object.assign({}, snap, { level: 0 })) === null && E.restore(Object.assign({}, snap, { phase: 'over' })) === null && E.restore(Object.assign({}, snap, { qi: 9999 })) === null, 'a damaged or finished save is refused');

    // the page
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'skyshield');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/skyshield/index.html' && gm.daily !== false && games.filter((g) => g.id === 'skyshield').length === 1, 'Sky Shield is listed once, as a one-player skill game with a daily run');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const P = lab(x), Q = lab(y); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
    const lum = (x) => rgb(x).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const others = games.filter((g) => g.id !== 'skyshield');
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && others.length > 60 && near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/skyshield/icon.svg'), 'utf8');
    ok(!!gm && new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['ss-first', 'ss-clean', 'ss-ten', 'ss-daily'].every((id) => core.indexOf("id: '" + id + "'") > 0 && html.indexOf("unlock('" + id + "')") > 0), 'the four awards are in the core and unlocked by the game');
    ok(/flak: function/.test(core) && /C\.audio\.sfx\('flak'\)/.test(html), 'the blast sound is synthesized in the core');
    ok(/C\.daily\('skyshield', dailyDate\)\.rng/.test(html) && /C\.stats\.best\('skyshield', 'score', score\)/.test(html) && /C\.stats\.daily\('skyshield', dailyDate/.test(html), 'the daily waves are seeded by the day, and the best score is kept');
    ok(/ctx\.button\(\{ icon: 'gear', label: C\.t\('settings'\)/.test(html) && /title: C\.t\('settings'\), closeButton: true/.test(html) && !/ssPickT/.test(html.slice(html.indexOf('function showHelp'), html.indexOf('function tArt'))), 'the battery choice sits behind a gear, not in help');
    ok(/C\.keyIs\(e, 'r'\)/.test(html) && /Digit1|Numpad/.test(html) && /ArrowLeft/.test(html) && !/dir === 'rtl'|isRtl|C\.rtl/.test(html), 'arrows, Space and 1-3 aim and fire, never flipped in RTL');
    ok(/C\.ui\.reduceMotion\(\)/.test(html) && /document\.fonts\.ready/.test(html) && /drawn\.w/.test(html) && /document\.hidden/.test(html), 'it honours reduced motion, pauses when hidden, redraws when fonts arrive and reads touches against the view last drawn');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    const ms = Date.now() - t0;
    ok(ms < 12000, 'the Sky Shield tests finish in under 12 s (' + ms + ' ms)');
  }
  return { testSkyShield };
};
