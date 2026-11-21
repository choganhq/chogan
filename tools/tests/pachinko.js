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
    const strip = (B) => ({ pins: B.pins, segs: B.segs, pockets: B.pockets });

    // the same launch at the same moment always takes the same path
    const a = E.run(E.level(6), 57, 40, false), b = E.run(E.level(6), 57, 40, false);
    ok(a.done && a.res === b.res && a.n === b.n && a.x === b.x && a.y === b.y, 'the same launch on the same board ends the same way, step for step');
    ok(same(strip(E.level(3)), strip(E.level(3))) && !same(strip(E.level(3)).pockets, strip(E.level(4)).pockets), 'a board is fixed by its number, and boards differ');
    ok(same(strip(E.make(E.level(2).seed, 2)), strip(E.level(2))), 'a board rebuilt from its seed is identical');
    // no randomness or trigonometry inside the simulation, so every device agrees
    const eng = html.slice(html.indexOf('ENGINE START'), html.indexOf('ENGINE END'));
    ok(eng.length > 1000 && !/Math\.random|Math\.(sin|cos|tan|atan2?)\(/.test(eng), 'the engine uses no Math.random and no trigonometry');
    // the windmills of the first draft let one held power win every board; they must not come back
    ok(!/mill/i.test(eng.replace(/There are no windmills/, '')) && E.level(6).mills === undefined, 'there are no windmills');

    // the layout: the tulip, one start pocket in the high row, capped fixed pockets
    const boards = [];
    for (let L = 1; L <= E.LEVELS; L++) boards.push(['board ' + L, E.level(L, true)]);
    for (let i = 0; i < 12; i++) boards.push(['daily ' + i, E.daily((20261120 + i * 37) >>> 0)]);
    ok(boards.length === E.LEVELS + 12, 'the board list is not empty (' + boards.length + ')');
    const layoutOk = boards.every(([, B]) => {
      const pk = B.pockets, st = pk.filter((p) => p.kind === 'start'), fx = pk.filter((p) => p.kind === 'fix');
      return pk[0].kind === 'tulip' && pk[0].v === 50 && st.length === 1 && st[0].y < E.LO_Y && st[0].v < Math.min(...fx.map((p) => p.v)) &&
        fx.length >= 3 && fx.length <= 4 && fx.every((p) => p.cap >= 2 && p.cap <= E.FULL && p.v <= 30);
    });
    ok(layoutOk, 'every board has the tulip (50), one start pocket in the high row worth least, and three or four fixed pockets that hold at most ' + E.FULL + ' balls');
    ok(E.level(1).pockets.filter((p) => p.kind === 'fix').length === 3 && E.level(5).pockets.filter((p) => p.kind === 'fix').length === 4 && E.level(7).pockets[2].cap === 2,
      'a fourth fixed pocket from board 4, and fuller pockets close at two balls from board 7');

    // the dial: the weakest launch falls back down the lane, a strong one rides the dome over
    const B1 = E.level(1);
    ok(E.run(B1, 0, 0, false).res === -2, 'strength 0 falls back down the lane, a foul');
    const top = E.ball(100, 0); let maxX = 0;
    while (!top.done) { E.step(B1, top, 0, false, null); if (top.y < E.CY) maxX = Math.max(maxX, top.x); }
    ok(maxX > 85, 'strength 100 rides the dome over to the right side (x ' + maxX.toFixed(1) + ')');

    // every ball ends, never stuck, never through a wall
    let runs = 0, ended = 0, inside = 0, slowest = 0;
    for (const [, B] of boards.slice(0, 12)) {
      for (let s = 0; s <= 100; s += 4) {
        for (const open of [false, true]) {
          const bl = E.ball(s, s * 7); let c = s * 7, wallsOk = true;
          while (!bl.done) { E.step(B, bl, c++, open, null); if (bl.x < E.R - 1e-9 || bl.x > E.W - E.R + 1e-9 || bl.y < -1) wallsOk = false; }
          runs++;
          if (bl.n < E.CAP && bl.res >= -2 && bl.res < B.pockets.length) ended++;
          if (wallsOk) inside++;
          slowest = Math.max(slowest, bl.n);
        }
      }
    }
    ok(runs > 600 && ended === runs, 'every one of ' + runs + ' launches ends in a pocket, out or as a foul, never on the step cap (' + ended + ')');
    ok(inside === runs && slowest < E.CAP / 2, 'no ball leaves the board, and the slowest took ' + (slowest / 120).toFixed(1) + ' s of ' + E.CAP / 120);

    /* The point of the redesign: one band of the dial leads to one place. A pocket counts as
       aimable when some strength and both its neighbours land in it, so a player one step off
       still gets it. Intended: on every board every non-tulip pocket is aimable with the tulip
       shut, the tulip is aimable once open (at least two strengths wide) and never reachable
       shut, and at least four pockets are aimable. Measured 2026-11-20 over boards 1-10 and 40
       dailies: at least four aimable pockets, the tulip and the start pocket two wide. */
    const aimable = (row) => {
      const got = {};
      for (let s = 1; s < 100; s++) { const r = row[s][0]; if (r >= 0 && row[s - 1][0] === r && row[s + 1][0] === r) got[r] = (got[r] || 0) + 1; }
      return got;
    };
    const bandRows = boards.map(([name, B]) => {
      const M = E.map(B), sh = aimable(M[0]), op = aimable(M[1]);
      const want = B.pockets.map((p, i) => i).slice(1);
      return { name, all: want.every((i) => sh[i] >= 1), n: Object.keys(sh).length, start: sh[1] || 0, tulip: op[0] || 0, shutTulip: M[0].filter((x) => x[0] === 0).length };
    });
    ok(bandRows.every((r) => r.all), 'every pocket but the tulip has a strength whose neighbours land there too, on all ' + bandRows.length + ' boards' + bandRows.filter((r) => !r.all).map((r) => ' (not ' + r.name + ')').join(''));
    ok(bandRows.every((r) => r.n >= 4), 'at least four pockets are aimable on every board (fewest ' + Math.min(...bandRows.map((r) => r.n)) + ')');
    ok(bandRows.every((r) => r.tulip >= 2 && r.start >= 1), 'the open tulip is aimable at least two strengths wide (narrowest ' + Math.min(...bandRows.map((r) => r.tulip)) + '), the start pocket at least one');
    ok(bandRows.every((r) => r.shutTulip === 0), 'no strength reaches the tulip while it is shut');

    // the start pocket opens the tulip for TUL steps
    const M1 = E.map(B1);
    const startS = M1[0].findIndex((o) => o[0] === 1);
    ok(startS >= 0, 'the start pocket of board 1 can be reached (strength ' + startS + ')');
    const Rd = E.round(B1);
    E.fire(Rd, startS);
    ok(!E.canFire(Rd), 'a second ball waits for the launcher');
    let opened = -1, got = null;
    while (!E.over(Rd) && Rd.fly.length) { const ev = E.tick(Rd); for (const e of ev) if (e[0] === 'end') { got = e; opened = Rd.clock - 1; } }
    ok(got && got[2] === 1 && got[3] === 5 && Rd.score === 5 && E.tulipOpen(Rd) && Rd.tulipUntil === opened + E.TUL, 'a ball in the start pocket scores its 5 and opens the tulip for ' + E.TUL / 120 + ' s');
    while (Rd.clock < Rd.tulipUntil) E.tick(Rd);
    ok(!E.tulipOpen(Rd), 'the tulip closes again on time');
    // a full pocket still takes balls but pays nothing
    const fixI = B1.pockets.findIndex((p) => p.kind === 'fix');
    const fill = B1.pockets.map(() => 0);
    const pays = [];
    for (let k = 0; k <= B1.pockets[fixI].cap; k++) { pays.push(E.value(B1, fixI, fill)); fill[fixI]++; }
    ok(pays.length === E.FULL + 1 && pays.slice(0, -1).every((v) => v === B1.pockets[fixI].v) && pays[pays.length - 1] === 0, 'a fixed pocket pays for its first ' + E.FULL + ' balls and then nothing (' + pays.join(', ') + ')');
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

    /* Skill must matter. Holding one power can at best fill the start pocket with every ball
       (BALLS × its 5 = 125): a fixed pocket closes after three, and one power cannot reach
       both the start pocket and the open tulip. The skilled bot (aims, one step of error) must
       beat that by three times and random launches by two and a half. Before the redesign
       the best held power scored 1000 on every board, more than the skilled bot (0.24-0.91 of
       it); after it, 2026-11-20 over 22 boards: skilled 785-845, best hold 125, random 152-237. */
    const holdBest = (B) => {
      let best = 0, at = 0;
      for (let s = 0; s <= 100; s++) {
        const R = E.round(B);
        while (!E.over(R) && R.clock < 3600 * 120) { if (E.canFire(R)) E.fire(R, s); E.tick(R); }
        if (R.score > best) { best = R.score; at = s; }
      }
      return [best, at];
    };
    const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
    const skill = [];
    for (const B of [E.level(2, true), E.daily(20261120)]) {
      const [hb, hs] = holdBest(B);
      const sk = avg([0, 1, 2].map((i) => E.botRound(B, (1000 + i * 7919) >>> 0, true).score));
      const rn = avg([0, 1, 2, 3, 4, 5, 6, 7].map((i) => E.botRound(B, (5000 + i * 104729) >>> 0, false).score));
      skill.push({ L: B.level, hb, hs, sk, rn });
    }
    const cap = E.BALLS * 5;
    ok(skill.every((x) => x.hb <= cap), 'no single held power scores more than the start pocket filled with every ball (' + skill.map((x) => x.hb + ' at ' + x.hs).join(', ') + '; limit ' + cap + ')');
    ok(skill.every((x) => x.sk >= 3 * x.hb), 'a skilled player scores at least three times the best held power (' + skill.map((x) => Math.round(x.sk) + ' vs ' + x.hb).join(', ') + ')');
    ok(skill.every((x) => x.sk >= 2.5 * x.rn), 'a skilled player scores at least two and a half times random launches (' + skill.map((x) => Math.round(x.sk) + ' vs ' + Math.round(x.rn)).join(', ') + ')');

    // stars: the kept targets are what the engine measures (two boards)
    ok(E.TH.length === E.LEVELS && E.TH.every((t) => t.length === 3 && t[0] >= 10 && t[0] < t[1] && t[1] < t[2]), 'every board has three rising star targets');
    const kinds = [1, 6];
    const fresh = kinds.map((L) => E.level(L, true));
    const remeasured = fresh.map((B) => [B.level, E.thresholds(B)]);
    ok(remeasured.every(([L, t]) => same(t, E.TH[L - 1])), 'the kept targets match the engine for boards ' + kinds.join(', ') + ' (' + remeasured.map(([L, t]) => L + ': ' + t.join('/')).join(', ') + ')');
    const th = B1.th;
    ok(E.stars(B1, th[0] - 1) === 0 && E.stars(B1, th[0]) === 1 && E.stars(B1, th[1]) === 2 && E.stars(B1, th[2]) === 3, 'stars come at the three targets (' + th.join('/') + ')');
    // random launches never reach three stars; a steady player always gets one
    const bands = [];
    for (const B of fresh) {
      const rs = [0, 0, 0, 0], as = [0, 0, 0, 0];
      for (let g = 0; g < 8; g++) rs[E.stars(B, E.botRound(B, 1000 + g, false).score)]++;
      for (let g = 0; g < 3; g++) as[E.stars(B, E.botRound(B, 5000 + g * 31, true).score)]++;
      bands.push({ L: B.level, r3: rs[3], r1: 8 - rs[0], a0: as[0], a3: as[3] });
    }
    ok(bands.every((x) => x.r3 === 0), 'random launches never earn three stars (' + bands.map((x) => 'board ' + x.L + ': ' + x.r1 + '/8 with a star').join(', ') + ')');
    ok(bands.every((x) => x.a0 === 0 && x.a3 >= 1), 'a steady player who knows the board always gets a star and often three (' + bands.map((x) => x.a3 + '/3×3★').join(', ') + ')');
    // the award for two balls in one opening of the tulip can be earned
    const RT = E.botRound(E.level(1, true), 1000, true);
    let twice = false, run = 0;
    for (const h of RT.hits) { if (h === 0) { run++; if (run >= 2) twice = true; } else if (h === 1) run = 0; }
    ok(twice, 'a skilled player lands two balls in one opening of the tulip, so its award can be earned');

    // the daily board is the same for everyone on a day, and another day differs
    ok(same(strip(E.daily(77)), strip(E.daily(77))) && !same(strip(E.daily(77)).pockets, strip(E.daily(78)).pockets) && E.daily(77).level === 0, 'a daily board follows only its seed');
    ok(/C\.daily\('pachinko', dailyDate\)\.rng\(\)/.test(html) && /C\.stats\.daily\('pachinko', dailyDate/.test(html), 'the daily board is seeded by the day and recorded once');
    ok(/E\.mapMore\(B, \d+\)/.test(html) && /setTimeout\(slice, 0\)/.test(html), 'the daily targets are worked out a slice at a time, not in one freeze');

    // a round is saved as its shots and replayed; balls in flight come back where they were
    const R3 = E.round(E.level(7));
    const plan = [[60, 0], [72, 300], [45, 640]];
    let k = 0;
    while (R3.clock < 900) { if (k < plan.length && plan[k][1] === R3.clock) { E.fire(R3, plan[k][0]); k++; } E.tick(R3); }
    const snap = JSON.parse(JSON.stringify(E.snapshot(R3)));
    const back = E.restore(snap);
    ok(!!back && back.clock === R3.clock && back.score === R3.score && back.tray === R3.tray && same(back.hits, R3.hits) && same(back.fill, R3.fill) && back.fly.length === R3.fly.length && back.fly.every((f, i) => f.x === R3.fly[i].x && f.y === R3.fly[i].y),
      'a saved round comes back with its score, tray, full pockets and balls in flight exactly where they were');
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
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/pachinko/index.html' && gm.daily !== false, 'Ball Rain is listed as a one-player skill game with a daily board');
    ok(games.filter((g) => g.id === 'pachinko').length === 1, 'it is listed once');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'its name and summary exist in every language');
    ok(!/\b(bet|wager|jackpot|casino|slot machine|stake)\b/i.test(html.replace(/better|between/gi, '') + JSON.stringify(gm)), 'nothing on the page or in the listing speaks of betting or prizes');
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
    const nearOf = (list) => gm && list.length ? list.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    const nearCat = nearOf(others.filter((g) => gm && g.cat === gm.cat)), nearAll = nearOf(others);
    ok(!!gm && gm.color === '#4E00D2' && others.length > 60 && nearCat[1] >= 15 && nearAll[1] >= 8 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html),
      'the accent differs by ΔE ≥ 15 from the skill games (nearest ' + nearCat[0] + ', ' + nearCat[1].toFixed(1) + ') and ≥ 8 from all (nearest ' + nearAll[0] + ', ' + nearAll[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    // the power number sits on a white knob in both themes; it once took the dark theme's light text and vanished
    const knobs = [...html.matchAll(/knob: '(#[0-9A-F]{6})', knobText: '(#[0-9A-F]{6})'/g)];
    const cr = (x, y) => { const p = lum(x) + 0.05, q = lum(y) + 0.05; return Math.max(p, q) / Math.min(p, q); };
    ok(knobs.length === 2 && knobs.every((m) => cr(m[1], m[2]) >= 4.5) && /fillStyle = P\.knobText/.test(html), 'the power number on the knob reads at 4.5:1 or more in both themes (' + knobs.map((m) => cr(m[1], m[2]).toFixed(1)).join(', ') + ')');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/pachinko/icon.svg'), 'utf8');
    ok(!!gm && new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const ids = ['pc-win', 'pc-three', 'pc-tulip', 'pc-daily'];
    ok(ids.every((id) => core.split("id: '" + id + "'").length === 2 && html.indexOf("unlock('" + id + "')") > 0), 'the four awards are in the core once each and unlocked by the game');
    // award titles must not repeat another game's (Pegfall's pf-win is «باران توپ», close to this game's name)
    const awardLines = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9]+-[a-z0-9-]+',/.test(l));
    const titlesOf = (l) => ['fa', 'en'].map((k2) => { const m = l.match(new RegExp('\\b' + k2 + ": '([^']*)'")); return m ? m[1] : null; });
    const mine = awardLines.filter((l) => ids.some((id) => l.indexOf("id: '" + id + "'") >= 0)).map(titlesOf);
    const theirs = new Set(awardLines.filter((l) => !ids.some((id) => l.indexOf("id: '" + id + "'") >= 0)).flatMap(titlesOf).filter(Boolean));
    ok(awardLines.length > 100 && mine.length === 4 && mine.every((t) => t[0] && t[1] && !theirs.has(t[0]) && !theirs.has(t[1])), 'no Ball Rain award shares a Persian or English title with another award (' + mine.map((t) => t[1]).join(', ') + ')');
    ok(/pc: 'pachinko'/.test(core), 'the award prefix pc belongs to Ball Rain');
    ok(['brass', 'launch', 'bloom'].every((s) => new RegExp('\\b' + s + ': function').test(core) && html.indexOf("C.audio.sfx('" + s + "')") > 0) && !/\.(mp3|ogg|wav)\b/.test(html), 'the brass, launch and bloom sounds are synthesized in the core, no audio files');
    ok(/C\.ui\.burst\(/.test(html) && /C\.ui\.reduceMotion\(\)/.test(html) && /document\.fonts\.ready/.test(html) && /drawn = V/.test(html), 'a burst on a catch, reduced motion honoured, a redraw when fonts arrive, and touches read against the view last drawn');
    ok(/ctx\.button\(\{ icon: 'gear', label: C\.t\('settings'\)/.test(html) && /title: C\.t\('settings'\), closeButton: true/.test(html) && !/pcShow/.test(html.slice(html.indexOf('function showHelp'), html.indexOf('function tArt'))), 'the options sit behind a gear, not in help');
    ok(/C\.keyIs\(e, 'a'\)/.test(html) && /C\.keyIs\(e, 'd'\)/.test(html) && /k === ' ' \|\| k === 'Enter'/.test(html) && !/dir === 'rtl'|isRtl|C\.rtl/.test(html), 'arrows, A/D and Space/Enter play it, never flipped in RTL');
    ok(/\.pc-canvas \{[^}]*width: 100%; height: 100%[^}]*direction: ltr/.test(html) && /cv\.width !== Math\.round\(Z\.w \* dpr\) \|\| cv\.height !== Math\.round\(Z\.h \* dpr\)/.test(html), 'the canvas fills its box in CSS, is drawn left to right and is resized on both sides');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    // strings: every key exists in every language, and none still describes the windmills
    const blockOf = (l) => { const m = html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')); return m ? m[1] : ''; };
    const keys = (s) => [...s.matchAll(/(pc[A-Z][A-Za-z0-9]*):/g)].map((m) => m[1]).sort();
    const faKeys = keys(blockOf('fa'));
    ok(faKeys.length > 30 && LOCALE_CODES.every((l) => same(keys(blockOf(l)), faKeys)), 'all ' + faKeys.length + ' strings exist in all ' + LOCALE_CODES.length + ' languages');
    ok(!/windmill|آسیاب|风车|Windr|molinillo|wiatracz|moulinet|مراوح|فرفره|फिरकि/i.test(LOCALE_CODES.map(blockOf).join('\n')), 'no string still speaks of windmills');
    const used = [...new Set([...html.matchAll(/C\.t\('(pc[A-Z][A-Za-z0-9]*)'/g)].map((m) => m[1]))];
    ok(used.length > 20 && used.every((k2) => faKeys.includes(k2)), 'every string the page asks for is defined (' + used.length + ')');
    // about 8 s on the laptop (2026-11-20), most of it the two held-power sweeps; CI runs
    // about three times slower, so the limit keeps a margin over that
    const ms = Date.now() - t0;
    ok(ms < 40000, 'the Ball Rain tests finish in under 40 s (' + ms + ' ms)');
  }
  return { testPachinko };
};
