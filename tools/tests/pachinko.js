'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #949: a vertical pachinko board, launched with a power dial («بارون توپ» / Ball Rain)
  function testPachinko() {
    head('Ball Rain (#949)');
    const t0 = Date.now();
    const E = loadEngine('pachinko', 'PachinkoEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/pachinko/index.html'), 'utf8');
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const strip = (B) => ({ pins: B.pins, segs: B.segs, mills: B.mills, pockets: B.pockets });

    // the same launch at the same moment always takes the same path
    const a = E.run(E.level(6), 57, 40, false), b = E.run(E.level(6), 57, 40, false);
    ok(a.done && a.res === b.res && a.n === b.n && a.x === b.x && a.y === b.y, 'the same launch on the same board ends the same way, step for step');
    ok(same(strip(E.level(3)), strip(E.level(3))) && !same(strip(E.level(3)).pins, strip(E.level(4)).pins), 'a board is fixed by its number, and boards differ');
    ok(same(strip(E.make(E.level(2).seed, 2)), strip(E.level(2))), 'a board rebuilt from its seed is identical');
    // no randomness or trigonometry inside the simulation, so every device agrees
    const eng = html.slice(html.indexOf('ENGINE START'), html.indexOf('ENGINE END'));
    ok(eng.length > 1000 && !/Math\.random|Math\.(sin|cos|tan|atan2?)\(/.test(eng), 'the engine uses no Math.random and no trigonometry');
    ok(E.level(1).mills.length === 0 && E.level(3).mills.length === 1 && E.level(6).mills.length === 2 && E.level(4).segs.some((s) => s.k === 'rail') && E.level(5).pockets.length === 5,
      'windmills come from board 3 (two from 6), rails from 4 and a fourth fixed pocket from 5');
    const pk1 = E.level(1).pockets;
    ok(pk1[0].kind === 'tulip' && pk1[1].kind === 'start' && pk1.slice(2).every((p) => p.kind === 'fix') && pk1[0].v > pk1[1].v, 'every board has the tulip, a start pocket and fixed pockets, and the tulip pays most');

    // the dial: the weakest launch falls back down the lane, a strong one rides the dome over
    const B1 = E.level(1);
    ok(E.run(B1, 0, 0, false).res === -2, 'strength 0 falls back down the lane, a foul');
    const top = E.ball(100, 0); let maxX = 0;
    while (!top.done) { E.step(B1, top, 0, false, null); if (top.y < E.CY) maxX = Math.max(maxX, top.x); }
    ok(maxX > 85, 'strength 100 rides the dome over to the right side (x ' + maxX.toFixed(1) + ')');

    // every ball ends, never stuck, never through a wall: a sweep of every board
    let runs = 0, ended = 0, inside = 0, slowest = 0;
    const boards = [];
    for (let L = 1; L <= E.LEVELS; L++) boards.push(E.level(L));
    boards.push(E.daily(20261119), E.daily(4242));
    for (const B of boards) {
      for (let s = 0; s <= 100; s += 4) {
        for (const open of [false, true]) {
          const bl = E.ball(s, s * 7), c0 = s * 7; let c = c0, wallsOk = true;
          while (!bl.done) { E.step(B, bl, c++, open, null); if (bl.x < E.R - 1e-9 || bl.x > E.W - E.R + 1e-9 || bl.y < -1) wallsOk = false; }
          runs++;
          if (bl.n < E.CAP && bl.res >= -2 && bl.res < B.pockets.length) ended++;
          if (wallsOk) inside++;
          slowest = Math.max(slowest, bl.n);
        }
      }
    }
    ok(runs > 600 && ended === runs, 'every one of ' + runs + ' launches on ' + boards.length + ' boards ends in a pocket, out or as a foul, never on the step cap (' + ended + ')');
    ok(inside === runs && slowest < E.CAP / 2, 'no ball leaves the board, and the slowest took ' + (slowest / 120).toFixed(1) + ' s of ' + E.CAP / 120);

    // the start pocket opens the tulip for TUL steps, and the open tulip catches more
    const M1 = E.map(B1);
    const startS = M1[0][0].findIndex((o) => o[0] === 1);
    ok(startS >= 0, 'the start pocket of board 1 can be reached (strength ' + startS + ')');
    const Rd = E.round(B1);
    E.fire(Rd, startS);
    ok(!E.canFire(Rd), 'a second ball waits for the launcher');
    let opened = -1, got = null;
    while (!E.over(Rd) && Rd.fly.length) { const ev = E.tick(Rd); for (const e of ev) if (e[0] === 'end') { got = e; opened = Rd.clock - 1; } }
    ok(got && got[2] === 1 && got[3] === 10 && Rd.score === 10 && E.tulipOpen(Rd) && Rd.tulipUntil === opened + E.TUL, 'a ball in the start pocket scores its 10 and opens the tulip for ' + E.TUL / 120 + ' s');
    while (Rd.clock < Rd.tulipUntil) E.tick(Rd);
    ok(!E.tulipOpen(Rd), 'the tulip closes again on time');
    const tulips = (o) => M1[o].reduce((n, row) => n + row.filter((x) => x[0] === 0).length, 0);
    ok(tulips(1) > tulips(0) * 2 && tulips(1) >= 5, 'the open tulip catches far more strengths than the shut one (' + tulips(1) + ' against ' + tulips(0) + ')');
    // a foul comes back to the tray; the launcher waits GAP steps between balls
    const R2 = E.round(B1);
    E.fire(R2, 0);
    for (let i = 1; i < E.GAP; i++) E.tick(R2);
    const waiting = E.canFire(R2);
    E.tick(R2);
    ok(!waiting && E.canFire(R2), 'the launcher is ready again after exactly ' + E.GAP + ' steps');
    while (R2.fly.length) E.tick(R2);
    ok(R2.fouls === 1 && R2.tray === E.BALLS && R2.score === 0, 'a foul gives its ball back to the tray');
    ok(E.fire(E.round(B1), 101) === null && E.fire(E.round(B1), 2.5) === null, 'a strength outside 0-100 or not whole is refused');

    // stars: the kept targets are what the engine measures (two boards; all ten take ~8 s)
    ok(E.TH.length === E.LEVELS && E.TH.every((t) => t.length === 3 && t[0] >= 10 && t[0] < t[1] && t[1] < t[2]), 'every board has three rising star targets');
    const kinds = [1, 6];
    const fresh = kinds.map((L) => E.level(L, true));
    const remeasured = fresh.map((B) => [B.level, E.thresholds(B)]);
    ok(remeasured.every(([L, t]) => same(t, E.TH[L - 1])), 'the kept targets match the engine for boards ' + kinds.join(', ') + ' (' + remeasured.map(([L, t]) => L + ': ' + t.join('/')).join(', ') + ')');
    const th = B1.th;
    ok(E.stars(B1, th[0] - 1) === 0 && E.stars(B1, th[0]) === 1 && E.stars(B1, th[1]) === 2 && E.stars(B1, th[2]) === 3, 'stars come at the three targets (' + th.join('/') + ')');

    // winnability bands, measured 2026-11-19 over 30 random and 6 skilled rounds on every
    // board: random launches got one star in 0-47% of rounds and three stars never; a
    // player who knows the board within one step of the dial got three stars in 33-100%
    // and never ended without one. Daily 20261119 is the board where the first bot only
    // ever aimed at the start pocket, so random launches beat its targets (3 stars in 15%)
    const dB = E.daily(20261119);
    E.thresholds(dB);
    const bands = [];
    for (const B of [fresh[0], fresh[1], dB]) {
      const rs = [0, 0, 0, 0], as = [0, 0, 0, 0];
      for (let g = 0; g < 8; g++) rs[E.stars(B, E.botRound(B, 1000 + g, false).score)]++;
      for (let g = 0; g < 4; g++) as[E.stars(B, E.botRound(B, 5000 + g * 31, true).score)]++;
      bands.push({ L: B.level, r3: rs[3], r1: 8 - rs[0], a0: as[0], a3: as[3] });
    }
    ok(bands.every((x) => x.r3 === 0), 'random launches never earn three stars (' + bands.map((x) => 'board ' + x.L + ': ' + x.r1 + '/8 with a star').join(', ') + ')');
    ok(bands.every((x) => x.a0 === 0 && x.a3 >= 1), 'a steady player who knows the board always gets a star and often three (' + bands.map((x) => x.a3 + '/4×3★').join(', ') + ')');

    // the daily board is the same for everyone on a day, and another day differs
    ok(same(strip(E.daily(77)), strip(E.daily(77))) && !same(strip(E.daily(77)).pins, strip(E.daily(78)).pins) && E.daily(77).level === 0, 'a daily board follows only its seed');
    ok(/C\.daily\('pachinko', dailyDate\)\.rng\(\)/.test(html) && /C\.stats\.daily\('pachinko', dailyDate/.test(html), 'the daily board is seeded by the day and recorded once');
    ok(/E\.mapMore\(B, \d+\)/.test(html) && /setTimeout\(slice, 0\)/.test(html), 'the daily targets are worked out a slice at a time, not in one freeze');

    // a round is saved as its shots and replayed; balls in flight come back where they were
    const R3 = E.round(E.level(7));
    const plan = [[60, 0], [72, 300], [45, 640]];
    let k = 0;
    while (R3.clock < 900) { if (k < plan.length && plan[k][1] === R3.clock) { E.fire(R3, plan[k][0]); k++; } E.tick(R3); }
    const snap = JSON.parse(JSON.stringify(E.snapshot(R3)));
    const back = E.restore(snap);
    ok(!!back && back.clock === R3.clock && back.score === R3.score && back.tray === R3.tray && same(back.hits, R3.hits) && back.fly.length === R3.fly.length && back.fly.every((f, i) => f.x === R3.fly[i].x && f.y === R3.fly[i].y),
      'a saved round comes back with its score, tray and balls in flight exactly where they were');
    // the page saves right after a launch, so the save holds a shot at its own moment
    while (!E.canFire(R3)) E.tick(R3);
    E.fire(R3, 50);
    const justFired = E.restore(JSON.parse(JSON.stringify(E.snapshot(R3))));
    ok(!!justFired && justFired.shots.length === 4 && justFired.fly.length === R3.fly.length && justFired.tray === R3.tray, 'a save taken right after a launch comes back with that ball in the lane');
    const bad = [null, 'x', Object.assign({}, snap, { shots: 'a' }), Object.assign({}, snap, { level: 11 }), Object.assign({}, snap, { level: -1 }), Object.assign({}, snap, { clock: -1 }),
      Object.assign({}, snap, { clock: 3600 * 120 + 1 }), Object.assign({}, snap, { seed: -4 }), Object.assign({}, snap, { shots: [[60, 0], [72, 100]] }), Object.assign({}, snap, { shots: [[101, 0]] }),
      Object.assign({}, snap, { shots: [[60, 0], [72, 300], [45, 2000]] }), Object.assign({}, snap, { shots: [[60.5, 0]] })];
    ok(bad.every((s) => E.restore(s) === null), 'a damaged save is refused (' + bad.length + ' kinds)');
    ok(/ctx\.autosave\(/.test(html) && /r: E\.snapshot\(Rd\)/.test(html) && /function launch[\s\S]{0,300}ctx\.save\(\)/.test(html) && /R\.B\.seed !== E\.level\(R\.B\.level\)\.seed/.test(html), 'the page saves at every launch and accepts a save only on the board it claims');

    // the page
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'pachinko');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/pachinko/index.html' && gm.daily !== false && gm.added === '2026-11-19', 'Ball Rain is listed as a one-player skill game with a daily board');
    ok(games.filter((g) => g.id === 'pachinko').length === 1, 'it is listed once');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language');
    ok(!/\b(bet|wager|jackpot|casino|slot machine)\b/i.test(html.replace(/better|between/gi, '') + JSON.stringify(gm)), 'nothing on the page or in the listing speaks of betting or prizes');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const P = lab(x), Q = lab(y); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
    const lum = (x) => rgb(x).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const others = games.filter((g) => g.id !== 'pachinko');
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && gm.color === '#4E00D2' && others.length > 60 && near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    // the power number sits on a white knob in both themes; it once took the dark theme's light text and vanished
    const knobs = [...html.matchAll(/knob: '(#[0-9A-F]{6})', knobText: '(#[0-9A-F]{6})'/g)];
    const cr = (x, y) => { const p = lum(x) + 0.05, q = lum(y) + 0.05; return Math.max(p, q) / Math.min(p, q); };
    ok(knobs.length === 2 && knobs.every((m) => cr(m[1], m[2]) >= 4.5) && /fillStyle = P\.knobText/.test(html), 'the power number on the knob reads at 4.5:1 or more in both themes (' + knobs.map((m) => cr(m[1], m[2]).toFixed(1)).join(', ') + ')');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/pachinko/icon.svg'), 'utf8');
    ok(!!gm && new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['pc-win', 'pc-three', 'pc-tulip', 'pc-daily'].every((id) => core.split("id: '" + id + "'").length === 2 && html.indexOf("unlock('" + id + "')") > 0), 'the four awards are in the core once each and unlocked by the game');
    ok(/pc: 'pachinko'/.test(core), 'the award prefix pc belongs to Ball Rain');
    ok(['brass', 'launch', 'bloom'].every((s) => new RegExp('\\b' + s + ': function').test(core) && html.indexOf("C.audio.sfx('" + s + "')") > 0) && !/\.(mp3|ogg|wav)\b/.test(html), 'the brass, launch and bloom sounds are synthesized in the core, no audio files');
    ok(/C\.ui\.burst\(/.test(html) && /C\.ui\.reduceMotion\(\)/.test(html) && /document\.fonts\.ready/.test(html) && /drawn = V/.test(html), 'a burst on a catch, reduced motion honoured, a redraw when fonts arrive, and touches read against the view last drawn');
    ok(/ctx\.button\(\{ icon: 'gear', label: C\.t\('settings'\)/.test(html) && /title: C\.t\('settings'\), closeButton: true/.test(html) && !/pcShow/.test(html.slice(html.indexOf('function showHelp'), html.indexOf('function tArt'))), 'the options sit behind a gear, not in help');
    ok(/C\.keyIs\(e, 'a'\)/.test(html) && /C\.keyIs\(e, 'd'\)/.test(html) && /k === ' ' \|\| k === 'Enter'/.test(html) && !/dir === 'rtl'|isRtl|C\.rtl/.test(html), 'arrows, A/D and Space/Enter play it, never flipped in RTL');
    ok(/\.pc-canvas \{[^}]*width: 100%; height: 100%[^}]*direction: ltr/.test(html) && /cv\.width !== Math\.round\(Z\.w \* dpr\) \|\| cv\.height !== Math\.round\(Z\.h \* dpr\)/.test(html), 'the canvas fills its box in CSS, is drawn left to right and is resized on both sides');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    // strings: every key exists in every language
    const blockOf = (l) => { const m = html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')); return m ? m[1] : ''; };
    const keys = (s) => [...s.matchAll(/(pc[A-Z][A-Za-z0-9]*):/g)].map((m) => m[1]).sort();
    const faKeys = keys(blockOf('fa'));
    ok(faKeys.length > 30 && LOCALE_CODES.every((l) => same(keys(blockOf(l)), faKeys)), 'all ' + faKeys.length + ' strings exist in all ' + LOCALE_CODES.length + ' languages');
    const used = [...new Set([...html.matchAll(/C\.t\('(pc[A-Z][A-Za-z0-9]*)'/g)].map((m) => m[1]))];
    ok(used.length > 20 && used.every((k2) => faKeys.includes(k2)), 'every string the page asks for is defined (' + used.length + ')');
    // about 3.4 s on the laptop (2026-11-19); CI runs about three times slower, so the limit
    // keeps a margin of three over that
    const ms = Date.now() - t0;
    ok(ms < 30000, 'the Ball Rain tests finish in under 30 s (' + ms + ' ms)');
  }
  return { testPachinko };
};
