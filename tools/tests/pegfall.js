'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #949: drop balls through a peg board into point slots («توپ‌ریز» / Pegfall)
  function testPegfall() {
    head('Pegfall (#949)');
    const t0 = Date.now();
    const E = loadEngine('pegfall', 'PegfallEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/pegfall/index.html'), 'utf8');
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const strip = (B) => ({ pegs: B.pegs, segs: B.segs, bumpers: B.bumpers, slots: B.slots, star: B.star });

    // the same drop at the same moment always takes the same path
    const B6 = E.level(6), xs = E.positions();
    ok(xs.length > 150 && xs[0] > 0 && xs[xs.length - 1] < E.W, 'there are ' + xs.length + ' drop positions inside the walls');
    const a = E.run(B6, 37.5, 90), b = E.run(E.level(6), 37.5, 90);
    ok(a.done && a.slot === b.slot && a.n === b.n && a.x === b.x && a.y === b.y, 'the same drop on the same board lands the same way, step for step');
    ok(same(strip(E.level(3)), strip(E.level(3))) && !same(strip(E.level(3)).pegs, strip(E.level(4)).pegs), 'a board is fixed by its number, and boards differ');
    const fresh = E.make(E.level(2).seed, 2);
    ok(same(strip(fresh), strip(E.level(2))), 'a board rebuilt from its seed is identical');
    // no randomness or trigonometry inside the simulation, so every device agrees
    const eng = html.slice(html.indexOf('ENGINE START'), html.indexOf('ENGINE END'));
    ok(eng.length > 1000 && !/Math\.random|Math\.(sin|cos|tan|atan2?)\(/.test(eng), 'the engine uses no Math.random and no trigonometry');

    // every ball ends in a slot, never stuck, never through a wall
    let drops = 0, landedOk = 0, inside = 0, maxN = 0;
    const boards = [];
    for (let L = 1; L <= E.LEVELS; L++) boards.push(E.level(L));
    for (let s = 1; s <= 3; s++) boards.push(E.daily(s * 104729));
    for (const B of boards) {
      for (let i = 0; i < xs.length; i += 4) {
        const ball = E.ball(B, xs[i], (i * 37) % E.PERIOD);
        let wallsOk = true;
        while (!ball.done) { E.step(B, ball); if (ball.x < E.R - 1e-9 || ball.x > E.W - E.R + 1e-9 || ball.y < -5) wallsOk = false; }
        drops++;
        if (!ball.capped && ball.slot >= 0 && ball.slot < E.NSLOT && ball.slot === Math.min(E.NSLOT - 1, Math.floor(ball.x / E.SW))) landedOk++;
        if (wallsOk) inside++;
        maxN = Math.max(maxN, ball.n);
      }
    }
    ok(drops > 700 && landedOk === drops, 'every one of ' + drops + ' drops on ' + boards.length + ' boards lands in a slot without the step cap (' + landedOk + ')');
    ok(inside === drops && maxN < E.CAP / 2, 'no ball leaves the walls, and the slowest took ' + maxN + ' steps of ' + E.CAP);

    // every slot can be reached on the first board, so a player can aim for any of them
    ok(same(E.slotsReached(E.level(1)), [0, 1, 2, 3, 4, 5, 6, 7, 8]), 'every slot of board 1 can be reached');

    // the star targets: the kept table is what the engine measures, for each kind of board
    // (plain, rails, one bumper; all fifteen take 9 s, too long for this group, and the
    // two-bumper boards cost as much as the one-bumper kind they share the code with)
    const kinds = [1, 4, 6];
    ok(E.TH.length === E.LEVELS && E.TH.every((t) => t.length === 3 && t[0] >= 10 && t[0] < t[1] && t[1] < t[2]), 'every board has three rising star targets');
    const measured = kinds.map((L) => E.level(L, true));
    const remeasured = measured.map((B) => [B.level, E.thresholds(B)]);
    ok(remeasured.every(([L, t]) => same(t, E.TH[L - 1])), 'the kept targets match the engine for boards ' + kinds.join(', ') + ' (' + remeasured.map(([L, t]) => L + ': ' + t.join('/')).join(', ') + ')');
    ok(E.level(4).bumpers.length === 0 && E.level(6).bumpers.length === 1 && E.level(11).bumpers.length === 2 && E.level(4).segs.length > 8, 'rails come from board 4, one moving bumper from 6 and two from 11');

    // winnability bands, measured 2026-11-18 over 400 rounds a board: random drops get at
    // least one star in 53% (board 1), 19% (board 6), 29% (board 11) and 52% (a daily
    // board) of rounds and three stars in at most 0.25%; a player who knows the board but
    // lands up to 1.5 units off almost never ends without a star (1 round in 20 on board 4)
    // and gets three in 38-81%
    const bands = [];
    const bandBoards = measured.concat([E.daily(20261118)]);
    for (const B of bandBoards) {
      E.thresholds(B);
      const r = E.rng(B.seed ^ 0x5eed), rs = [0, 0, 0, 0];
      for (let g = 0; g < 60; g++) {
        let sc = 0, clock = 0;
        for (let k = 0; k < B.balls; k++) { clock += 60 + Math.floor(r() * 200); sc += E.value(B, E.run(B, 3 + r() * 94, clock).slot, k); }
        rs[E.stars(B, sc)]++;
      }
      const re = E.reach(B), n = xs.length, ph = re.length / n, w = E.AIM / E.XQ, as = [0, 0, 0, 0], r2 = E.rng(B.seed ^ 0xa1);
      for (let g = 0; g < 20; g++) {
        let sc = 0;
        for (let k = 0; k < B.balls; k++) {
          let best = -1, bi = 0, bp = 0;
          for (let p = 0; p < ph; p++) for (let i = w; i < n - w; i++) { let t = 0; for (let d = -w; d <= w; d++) t += E.value(B, re[p * n + i + d].slot, k); if (t > best) { best = t; bi = i; bp = p; } }
          sc += E.value(B, E.run(B, re[bp * n + bi].x + (r2() * 2 - 1) * E.AIM, re[bp * n].clock).slot, k);
        }
        as[E.stars(B, sc)]++;
      }
      const top = E.topScore(B);
      bands.push({ L: B.level, rand1: (60 - rs[0]) / 60, rand3: rs[3] / 60, aim0: as[0], aim3: as[3] / 20, top3: E.stars(B, top) === 3 });
    }
    ok(bands.length === 4 && bands.every((x) => x.top3), 'a perfect round earns three stars on every measured board');
    ok(bands.every((x) => x.rand3 <= 0.05), 'random drops almost never earn three stars (' + bands.map((x) => Math.round(x.rand3 * 100) + '%').join(', ') + ')');
    ok(bands.every((x) => x.rand1 >= 0.1 && x.rand1 <= 0.75), 'random drops earn one star in some rounds, not all (' + bands.map((x) => Math.round(x.rand1 * 100) + '%').join(', ') + ')');
    ok(bands.every((x) => x.aim0 <= 1 && x.aim3 >= 0.25), 'a steady player who knows the board almost always gets a star and often three (' + bands.map((x) => x.aim0 + '×0★ ' + Math.round(x.aim3 * 100) + '%').join(', ') + ')');

    // the bumpers reward timing: the same spot at another moment can land elsewhere
    const bu = B6.bumpers[0];
    ok(E.bumperX(bu, 17) === E.bumperX(bu, 17 + E.PERIOD) && E.bumperX(bu, 0) !== E.bumperX(bu, E.PERIOD / 4), 'a bumper swings on the board clock with a fixed period');
    const re6 = E.reach(measured[2]), n6 = xs.length;
    let timed = 0;
    for (let i = 0; i < n6; i++) { const s0 = re6[i].slot; for (let p = 1; p < re6.length / n6; p++) if (re6[p * n6 + i].slot !== s0) { timed++; break; } }
    ok(re6.length === n6 * 8 && timed >= n6 * 0.2, timed + ' of ' + n6 + ' drop spots on board 6 land elsewhere at another moment of the bumper');

    // scoring: the star slot pays double and moves with each ball
    const Rd = E.round(E.level(1));
    const s0 = E.starAt(Rd.B, 0), plain = (s0 + 1) % E.NSLOT;
    ok(E.value(Rd.B, s0, 0) === 2 * Rd.B.slots[s0] && E.value(Rd.B, plain, 0) === Rd.B.slots[plain], 'the star slot pays double, the others their face value');
    const moves = new Set(); for (let k = 0; k < 10; k++) moves.add(E.starAt(Rd.B, k));
    ok(moves.size >= 2, 'the star slot moves between balls (' + moves.size + ' places in a round)');
    // #971: the star stayed put for the next ball on some boards, so one good aim paid double twice
    const starBoards = boards.filter((B) => B.star.length > 1);
    const stays = [];
    for (const B of starBoards) for (let k = 0; k < B.balls - 1; k++) if (E.starAt(B, k) === E.starAt(B, k + 1)) stays.push((B.level || 'daily') + '@' + (k + 1));
    ok(starBoards.length === boards.length && stays.length === 0, 'the star slot moves to another slot after every ball, on all ' + starBoards.length + ' boards' + (stays.length ? ' (stays: ' + stays.join(', ') + ')' : ''));
    let expect = 0;
    for (let k = 0; k < 10; k++) { expect += E.value(Rd.B, k % E.NSLOT, k); E.land(Rd, k % E.NSLOT); }
    ok(Rd.score === expect && Rd.k === 10 && E.over(Rd), 'ten balls are a round and the score is the sum of their slots');
    const th = E.level(1).th;
    ok(E.stars(E.level(1), th[0] - 1) === 0 && E.stars(E.level(1), th[0]) === 1 && E.stars(E.level(1), th[1]) === 2 && E.stars(E.level(1), th[2]) === 3, 'stars come at the three targets (' + th.join('/') + ')');

    // the daily board is the same for everyone on a day, and another day differs
    ok(same(strip(E.daily(77)), strip(E.daily(77))) && !same(strip(E.daily(77)).pegs, strip(E.daily(78)).pegs), 'a daily board follows only its seed');
    ok(/C\.daily\('pegfall', dailyDate\)\.rng\(\)/.test(html) && /C\.stats\.daily\('pegfall', dailyDate/.test(html), 'the daily board is seeded by the day and recorded once');

    // a round is saved after every ball, with a ball in flight replayed on restore
    const R2 = E.round(E.level(7));
    E.land(R2, 3); E.land(R2, 5); R2.clock = 333;
    const flight = { x: 41.5, clock: 333 };
    const snap = JSON.parse(JSON.stringify(E.snapshot(R2, flight)));
    const back = E.restore(snap);
    const direct = E.run(E.level(7), 41.5, 333);
    ok(!!back && back.k === 3 && same(back.hits, [3, 5, direct.slot]) && back.clock === direct.clock && back.score === E.value(back.B, 3, 0) + E.value(back.B, 5, 1) + E.value(back.B, direct.slot, 2), 'a saved round comes back with its ball in flight landed where it would have');
    const noFly = E.restore(E.snapshot(R2));
    ok(!!noFly && noFly.k === 2 && noFly.clock === 333, 'a save between balls comes back as it was');
    const bad = [null, 'x', Object.assign({}, snap, { hits: [3, 9] }), Object.assign({}, snap, { level: 0 }), Object.assign({}, snap, { level: 16 }), Object.assign({}, snap, { clock: -1 }),
      Object.assign({}, snap, { fly: { x: 'a', clock: 1 } }), Object.assign({}, snap, { fly: { x: 500, clock: 1 } }), Object.assign({}, snap, { hits: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }), Object.assign({}, snap, { seed: -4 })];
    ok(bad.every((s) => E.restore(s) === null), 'a damaged save is refused (' + bad.length + ' kinds)');
    ok(/ctx\.autosave\(/.test(html) && /E\.snapshot\(Rd, fly\)/.test(html) && /function landed[\s\S]{0,1200}ctx\.save\(\)/.test(html) && /function drop[\s\S]{0,600}ctx\.save\(\)/.test(html), 'the page saves at every drop and every landing');

    // the page
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'pegfall');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/pegfall/index.html' && gm.daily !== false && gm.added === '2026-11-18', 'Pegfall is listed as a one-player skill game with a daily board');
    ok(games.filter((g) => g.id === 'pegfall').length === 1, 'it is listed once');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language');
    ok(!/plinko/i.test(html + JSON.stringify(gm)), 'the trademarked name is never used');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const P = lab(x), Q = lab(y); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
    const lum = (x) => rgb(x).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const others = games.filter((g) => g.id !== 'pegfall');
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && gm.color === '#AE36EA' && others.length > 60 && near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/pegfall/icon.svg'), 'utf8');
    ok(!!gm && new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(['pf-win', 'pf-three', 'pf-catch', 'pf-daily'].every((id) => core.split("id: '" + id + "'").length === 2 && html.indexOf("unlock('" + id + "')") > 0), 'the four awards are in the core once each and unlocked by the game');
    ok(/pf: 'pegfall'/.test(core), 'the award prefix pf belongs to Pegfall');
    ok(/\bpeg: function/.test(core) && /C\.audio\.sfx\('peg'\)/.test(html) && !/\.(mp3|ogg|wav)\b/.test(html), 'the peg tick is synthesized in the core, no audio files');
    ok(/C\.ui\.burst\(/.test(html) && /C\.ui\.reduceMotion\(\)/.test(html) && /document\.fonts\.ready/.test(html) && /drawn = V/.test(html), 'a burst on landing, reduced motion honoured, a redraw when fonts arrive, and touches read against the view last drawn');
    ok(/ctx\.button\(\{ icon: 'gear', label: C\.t\('settings'\)/.test(html) && /title: C\.t\('settings'\), closeButton: true/.test(html) && !/pfPath/.test(html.slice(html.indexOf('function showHelp'), html.indexOf('function tArt'))), 'the path option sits behind a gear, not in help');
    ok(/C\.keyIs\(e, 'a'\)/.test(html) && /C\.keyIs\(e, 'd'\)/.test(html) && /k === ' ' \|\| k === 'Enter'/.test(html) && !/dir === 'rtl'|isRtl|C\.rtl/.test(html), 'arrows, A/D and Space/Enter play it, never flipped in RTL');
    ok(/\.pf-canvas \{[^}]*direction: ltr/.test(html) && /cv\.width !== Math\.round\(Z\.w \* dpr\) \|\| cv\.height !== Math\.round\(Z\.h \* dpr\)/.test(html), 'the canvas is drawn left to right and resized on both sides');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    // strings: every key exists in every language
    const blockOf = (l) => { const m = html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')); return m ? m[1] : ''; };
    const keys = (s) => [...s.matchAll(/(pf[A-Za-z0-9]+):/g)].map((m) => m[1]).sort();
    const faKeys = keys(blockOf('fa'));
    ok(faKeys.length > 30 && LOCALE_CODES.every((l) => same(keys(blockOf(l)), faKeys)), 'all ' + faKeys.length + ' strings exist in all ' + LOCALE_CODES.length + ' languages');
    const used = [...new Set([...html.matchAll(/C\.t\('(pf[A-Za-z0-9]+)'/g)].map((m) => m[1]))];
    ok(used.length > 20 && used.every((k) => faKeys.includes(k)), 'every string the page asks for is defined (' + used.length + ')');
    // about 6.5 s on the laptop (2026-11-18); CI runs about three times slower
    const ms = Date.now() - t0;
    ok(ms < 25000, 'the Pegfall tests finish in under 25 s (' + ms + ' ms)');
  }
  return { testPegfall };
};
