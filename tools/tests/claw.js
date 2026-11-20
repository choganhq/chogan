'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #949: a claw machine that is all skill («چنگک» / Grabber)
  function testClaw() {
    head('Grabber (#949)');
    const t0 = Date.now();
    const E = loadEngine('claw', 'ClawEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/claw/index.html'), 'utf8');
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const strip = (B) => ({ toys: B.toys, tries: B.tries, P: B.P, ph: B.ph });

    // a board follows only its seed and level, so every device shows the same machine
    ok(same(strip(E.level(5)), strip(E.level(5))) && !same(strip(E.level(5)).toys, strip(E.level(6)).toys), 'a board is fixed by its number, and boards differ');
    ok(same(strip(E.make(E.level(3).seed, 3)), strip(E.level(3))), 'a board rebuilt from its seed is identical');
    const eng = html.slice(html.indexOf('ENGINE START'), html.indexOf('ENGINE END'));
    ok(eng.length > 1000 && !/Math\.random|Math\.(sin|cos|tan|atan2?)\(/.test(eng), 'the engine uses no Math.random and no trigonometry: no random claw strength');
    const pA = E.play(E.level(9), E.skilled(42, E.AIM)), pB = E.play(E.level(9), E.skilled(42, E.AIM));
    ok(pA.score === pB.score && same(pA.got, pB.got) && pA.clock === pB.clock, 'the same moves on the same board give the same grabs, step for step');

    // every board fits its cabinet: toys inside the floor, apart, never over the chute
    let fits = 0, boards = 0;
    for (let L = 0; L <= E.LEVELS; L++) {
      const B = L ? E.level(L) : E.daily(20261119);
      boards++;
      const xs = B.toys.map((t) => t.x).slice().sort((a, b) => a - b);
      const sorted = B.toys.slice().sort((a, b) => a.x - b.x);
      const apart = sorted.every((t, i) => i === 0 || t.x - sorted[i - 1].x >= t.r + sorted[i - 1].r);
      const inside = B.toys.every((t) => t.x - t.r > B.P.chute + B.P.belt && t.x + t.r < E.W - B.P.belt);
      if (xs.length >= 4 && apart && inside && B.tries === Math.min(E.TRIES, B.toys.length + 2)) fits++;
    }
    ok(boards === 11 && fits === boards, 'all ' + boards + ' boards keep their toys inside the cabinet, apart, with toys + 2 drops (' + fits + ')');
    const spd = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => E.params(n).speed);
    ok(spd.every((v, i) => i === 0 || v > spd[i - 1]) && !E.params(2).belt && E.params(3).belt > 0 && E.params(10).belt > E.params(3).belt && E.params(1).chute > E.params(9).chute, 'the claw runs faster on every machine (' + spd.join(', ') + '), the floor moves from machine 3 and faster later, the chute narrows');

    // hold and slip: only the aim decides. Square on holds, near the edge slips on the way
    // up, beside the toy nudges it, and far off grabs nothing
    function grabAt(L, dx) {
      const Rd = E.round(E.level(L));
      const t = Rd.toys.slice().sort((a, b) => b.x - a.x)[0];
      Rd.cx = t.x + dx;
      const ev = E.finishDrop(Rd, E.drop(Rd));
      const grip = (ev.find((e) => e[0] === 'grip') || [])[1];
      return { Rd, t, grip, got: Rd.got.includes(t.id), slip: ev.some((e) => e[0] === 'slip' && e[1] === t.id), left: Rd.toys.length };
    }
    const g0 = grabAt(1, 0), t1 = g0.t;
    ok(g0.grip === 'firm' && g0.got && g0.Rd.score === t1.pts && g0.left === E.level(1).toys.length - 1, 'a claw square on the toy holds it to the chute and scores its ' + t1.pts + ' points');
    const gIn = grabAt(1, E.tolA(t1) * 0.95);
    ok(gIn.grip === 'firm' && gIn.got, 'just inside the tolerance (' + E.tolA(t1).toFixed(2) + ') still holds');
    const gEdge = grabAt(1, E.tolB(t1) * 0.97);
    ok(gEdge.grip === 'loose' && gEdge.slip && !gEdge.got && gEdge.left === E.level(1).toys.length, 'near the edge of the grip the toy slips on the way up and lies on the floor again');
    const gNudge = grabAt(1, E.tolB(t1) + 1);
    ok(gNudge.grip === 'nudge' && !gNudge.got && gNudge.Rd.toys.find((x) => x.id === t1.id).x !== t1.x, 'beside the toy the claw only nudges it');
    const gMiss = grabAt(1, -(t1.r + E.REACH + 4));
    ok(gMiss.grip === 'miss' || (gMiss.grip !== 'firm' && !gMiss.got), 'far off it grabs nothing');
    // the grip tolerance falls with weight, so the heavy toys need a better aim
    const K = E.KINDS;
    ok(E.tolA({ r: K.whale.r, w: K.whale.w }) < E.tolA({ r: K.duck.r, w: K.duck.w }) && E.tolA({ r: K.star.r, w: K.star.w }) < E.tolA({ r: K.ball.r, w: K.ball.w }) && K.star.pts > K.whale.pts && K.whale.pts > K.duck.pts, 'whales and stars need a finer aim and are worth more');
    // a toy held loosely slips sooner the further off the claw was
    const slipAt = (f) => { const Rd = E.round(E.level(1)), t = Rd.toys.slice().sort((a, b) => b.x - a.x)[0]; Rd.cx = t.x + E.tolA(t) + f * (E.tolB(t) - E.tolA(t)); const A = E.drop(Rd); let n = 0; while (!A.done) { const ev = E.step(Rd, A); n++; if (ev.some((e) => e[0] === 'slip')) return n; } return Infinity; };
    ok(slipAt(0.9) < slipAt(0.5) && slipAt(0.5) < slipAt(0.1), 'a looser grip slips sooner (' + [0.9, 0.5, 0.1].map(slipAt).join(' < ') + ' steps)');

    // one press a try (#949, #979): the claw runs right only while held, by its speed each
    // step, never back, and stops at the far wall
    const mv = E.round(E.level(4)), x0 = mv.cx, v4 = E.params(4).speed * E.DT;
    E.move(mv, true); const x1 = mv.cx;
    E.move(mv, false); E.move(mv, null); E.move(mv, 80); const x2 = mv.cx;
    ok(Math.abs(x1 - x0 - v4) < 1e-9 && x2 === x1 && mv.clock === 4, 'held, the claw moves right by its speed a step (' + v4.toFixed(3) + '); let go, it stays put and the clock still runs');
    let wentBack = false;
    for (let i = 0; i < 2000; i++) { const b = mv.cx; E.move(mv, true); if (mv.cx < b) wentBack = true; }
    ok(!wentBack && E.atEnd(mv) && mv.cx === E.end() && E.maxHold(E.level(4)) * v4 >= E.end() - E.home(E.level(4)), 'it never goes back and stops at the far wall, reached within the longest hold');
    const B3 = E.level(3);
    ok(E.shift(B3, 0) !== E.shift(B3, B3.P.period / 2) && E.shift(B3, 17) === E.shift(B3, 17 + B3.P.period) && E.shift(E.level(2), 99) === 0, 'the conveyor moves on a fixed period from machine 3 and stands still before');

    // star targets: the kept table is what the engine measures, for every board
    const remeasured = [];
    for (let L = 1; L <= E.LEVELS; L++) remeasured.push([L, E.level(L).th, E.thresholds(E.level(L, true))]);
    ok(remeasured.length === 10 && remeasured.every(([, k, m]) => same(k, m) && k[0] >= 10 && k[0] < k[1] && k[1] < k[2]), 'the kept targets match the engine on all ten boards (' + remeasured.map(([L, k]) => L + ': ' + k.join('/')).join(', ') + ')');

    // winnability bands, measured 2026-11-20: perfect timing clears every board; a player off
    // by up to AIM frames when letting go gets three stars on every round of machines 1-5 and
    // on 65-100% of the later ones; random presses get three stars in at most 3% of 100 rounds,
    // and no single fixed hold reaches three stars
    const bands = [];
    for (let L = 0; L <= E.LEVELS; L++) {
      const B = L ? E.level(L) : E.daily(20261119);
      const th = L ? B.th : E.thresholds(B);
      let sk3 = 0, rn3 = 0;
      const sk = [];
      const perfect = E.play(B, E.skilled(1, 0)).score;
      for (let i = 0; i < 20; i++) { const s = E.play(B, E.skilled(1000 + i, E.AIM)).score; sk.push(s); if (E.stars(B, s) === 3) sk3++; }
      for (let i = 0; i < 100; i++) if (E.stars(B, E.play(B, E.randomPlayer(9000 + i)).score) === 3) rn3++;
      let fix = 0;
      for (let h = 1; h <= E.maxHold(B); h++) fix = Math.max(fix, E.play(B, E.fixedPlayer(h)).score);
      sk.sort((a, b) => a - b);
      bands.push({ L, th, perfect, med: sk[10], sk3: sk3 / 20, rn3: rn3 / 100, fix });
    }
    ok(bands.length === 11 && bands.every((b) => b.perfect >= b.th[2]), 'perfect timing earns three stars on every board (' + bands.map((b) => b.perfect + '≥' + b.th[2]).join(', ') + ')');
    const early = bands.filter((b) => b.L >= 1 && b.L <= 3), late = bands.filter((b) => b.L >= 8);
    const avg = (a) => a.reduce((s, b) => s + b.sk3, 0) / a.length;
    ok(early.every((b) => b.sk3 >= 0.9) && bands.every((b) => b.sk3 >= 0.5) && avg(late) < avg(early), 'a skilled player gets three stars on most rounds, and the later machines are harder (' + bands.map((b) => b.L + ': ' + Math.round(b.sk3 * 100) + '%').join(', ') + ')');
    ok(bands.every((b) => b.rn3 <= 0.04), 'random drops almost never get three stars (' + bands.map((b) => Math.round(b.rn3 * 100) + '%').join(', ') + ')');
    ok(bands.every((b) => b.fix < b.th[2]), 'one fixed spot never earns three stars (' + bands.map((b) => b.fix + '<' + b.th[2]).join(', ') + ')');
    ok(bands.every((b) => b.med >= b.th[2]), 'the skilled median clears the three-star target everywhere (' + bands.map((b) => b.med + '≥' + b.th[2]).join(', ') + ')');

    // scoring and stars
    const th1 = E.level(1).th, B1 = E.level(1);
    ok(E.stars(B1, th1[0] - 1) === 0 && E.stars(B1, th1[0]) === 1 && E.stars(B1, th1[1]) === 2 && E.stars(B1, th1[2]) === 3, 'stars come at the three targets (' + th1.join('/') + ')');
    const full = E.play(B1, E.skilled(7, 0.01));
    ok(full.score === full.got.reduce((s, id) => s + B1.toys.find((t) => t.id === id).pts, 0) && E.over(full), 'the score is the sum of the toys delivered, and a round ends when the drops or the toys run out');

    // the daily board is the same for everyone on a day, and another day differs
    ok(same(strip(E.daily(77)), strip(E.daily(77))) && !same(strip(E.daily(77)).toys, strip(E.daily(78)).toys) && E.daily(77).level === 0, 'a daily board follows only its seed');
    ok(/C\.daily\('claw', dailyDate\)\.rng\(\)/.test(html) && /C\.stats\.daily\('claw', dailyDate/.test(html), 'the daily board is seeded by the day and recorded once');

    // saves: the board and its drops; a grab in progress is replayed as it left
    const R2 = E.round(E.level(8));
    const pl = E.skilled(3, E.AIM);
    for (let k = 0; k < 3; k++) { const p = pl(R2); for (let i = 0; i < p.wait; i++) E.move(R2, false); for (let i = 0; i < p.hold; i++) E.move(R2, true); E.finishDrop(R2, E.drop(R2)); }
    const snap = JSON.parse(JSON.stringify(E.snapshot(R2)));
    const back = E.restore(snap);
    ok(!!back && back.drops.length === 3 && back.score === R2.score && same(back.got, R2.got) && same(back.toys.map((t) => [t.id, t.x]), R2.toys.map((t) => [t.id, t.x])), 'a saved round comes back with the same toys, catches and score');
    const R3 = E.round(E.level(2)); E.drop(R3);
    const mid = E.restore(JSON.parse(JSON.stringify(E.snapshot(R3))));
    ok(!!mid && mid.drops.length === 1 && mid.clock > 0, 'leaving mid-grab never gives the try back: the grab is replayed');
    const dl = E.restore(E.snapshot(E.round(E.daily(555))));
    ok(!!dl && dl.B.level === 0 && same(strip(dl.B), strip(E.daily(555))), 'a daily round restores to the same daily board');
    const d0 = snap.drops[0], mk = (o) => Object.assign({}, snap, o), md = (o) => mk({ drops: [Object.assign({}, d0, o)] });
    const bad = [null, 'x', {}, mk({ v: undefined }), mk({ v: 1 }), mk({ seed: -4 }), mk({ seed: 1.5 }), mk({ level: 11 }), mk({ level: -1 }), mk({ drops: 'x' }), mk({ drops: Array(9).fill(d0) }),
      md({ x: 'a' }), md({ x: 1 }), md({ x: 200 }), md({ x: NaN }), md({ clock: 1.5 }), md({ clock: -1 }),
      mk({ drops: [Object.assign({}, snap.drops[1]), Object.assign({}, d0)] })];
    ok(bad.every((s) => E.restore(s) === null), 'a damaged save is refused (' + bad.length + ' kinds)');
    ok(/ctx\.autosave\(/.test(html) && /E\.snapshot\(Rd\)/.test(html) && /ctx\.save\(\)/.test(html), 'the page saves its round');

    // the page and its listing
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const gm = games.find((g) => g.id === 'claw');
    ok(!!gm && gm.cat === 'skill' && gm.people === 1 && gm.path === 'games/claw/index.html' && gm.daily !== false && gm.added === '2026-11-19', 'Grabber is listed as a one-player skill game with a daily board');
    ok(games.filter((g) => g.id === 'claw').length === 1, 'it is listed once');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]) && gm.name.fa === 'چنگک' && gm.name.en === 'Grabber', 'its name and summary exist in every language');
    ok(!!gm && /no coins, no money/.test(gm.summary.en) && !/\b(bet|wager|prize|jackpot)s?\b/i.test(gm.summary.en + html.slice(html.indexOf('en: {'), html.indexOf('en: {') + 4000)), 'the listing says it takes no coins or money and nothing promises bets or prizes');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const P = lab(x), Q = lab(y); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
    const lum = (x) => rgb(x).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const others = games.filter((g) => g.id !== 'claw');
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && gm.color === '#783053' && others.length > 60 && near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html), 'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/claw/icon.svg'), 'utf8');
    ok(!!gm && new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const ids = ['cw-win', 'cw-three', 'cw-daily', 'cw-star'];
    ok(ids.every((id) => core.split("id: '" + id + "'").length === 2 && html.indexOf("unlock('" + id + "')") > 0), 'the four awards are in the core once each and unlocked by the game');
    ok(/cw: 'claw'/.test(core), 'the award prefix cw belongs to Grabber');
    const titleOf = (id) => { const i = core.indexOf("id: '" + id + "'"); const m = core.slice(i, i + 400).match(/ en: '([^']+)'/); return m ? m[1] : ''; };
    const titles = ids.map(titleOf);
    ok(titles.every((t) => t && core.split("en: '" + t + "'").length === 2), 'the award titles are unique in the core (' + titles.join(', ') + ')');
    ok(/\bclaw: function/.test(core) && /C\.audio\.sfx\('claw'\)/.test(html) && !/\.(mp3|ogg|wav)\b/.test(html), 'the claw sound is synthesized in the core, no audio files');
    ok(/C\.ui\.burst\(/.test(html) && /C\.ui\.reduceMotion\(\)/.test(html) && /document\.fonts\.ready/.test(html) && /drawn = V/.test(html), 'a burst on a catch, reduced motion honoured, a redraw when fonts arrive, and touches read against the view last drawn');
    ok(/ctx\.button\(\{ icon: 'gear', label: C\.t\('settings'\)/.test(html) && /title: C\.t\('settings'\), closeButton: true/.test(html) && !/cwAimLine/.test(html.slice(html.indexOf('function showHelp'), html.indexOf('function tArt'))), 'the aim line option sits behind a gear, not in help');
    ok(/function holdKey\(e\) \{ return e\.key === ' ' \|\| e\.key === 'Enter' \|\| e\.key === 'ArrowRight'[^}]*C\.keyIs\(e, 'd'\)/.test(html) && /keyup[\s\S]{0,160}holdKey\(e\)[^}]*letGo\(\)/.test(html) && !/C\.keyIs\(e, 'a'\)/.test(html) && !/dir === 'rtl'|isRtl|C\.rtl/.test(html), 'Space, Enter, → and D are held and let go like a finger; no key moves it back; never flipped in RTL');
    ok(/addEventListener\('pointerup', letGo\)/.test(html) && /addEventListener\('pointercancel', letGo\)/.test(html) && /setPointerCapture/.test(html) && /holdOn\(cv\)/.test(html) && /holdOn\(dropBtn\)/.test(html) && /E\.move\(Rd, holding\)/.test(html) && /C\.onPause\(function \(\) \{ letGo\(\)/.test(html) && !/cwSwing|cwDrop'/.test(html), 'a press on the machine or the button runs the claw and lifting the finger drops it, even when leaving the app');
    ok(/\.cw-canvas \{[^}]*direction: ltr/.test(html) && /cv\.width !== Math\.round\(Z\.w \* dpr\) \|\| cv\.height !== Math\.round\(Z\.h \* dpr\)/.test(html) && /cv\.style\.width = Z\.w \+ 'px'; cv\.style\.height = Z\.h \+ 'px'/.test(html), 'the canvas is drawn left to right, resized on both sides, and its CSS size set apart from its backing (#919)');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html), 'a tutorial, no history or direct storage');
    const blockOf = (l) => { const m = html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')); return m ? m[1] : ''; };
    const keys = (s) => [...s.matchAll(/(cw[A-Za-z0-9]+):/g)].map((m) => m[1]).sort();
    const faKeys = keys(blockOf('fa'));
    ok(faKeys.length > 30 && LOCALE_CODES.every((l) => same(keys(blockOf(l)), faKeys)), 'all ' + faKeys.length + ' strings exist in all ' + LOCALE_CODES.length + ' languages');
    const used = [...new Set([...html.matchAll(/C\.t\('(cw[A-Za-z0-9]+)'/g)].map((m) => m[1]))];
    ok(used.length > 20 && used.every((k) => faKeys.includes(k)), 'every string the page asks for is defined (' + used.length + ')');
    // CI runs about three times slower than the laptop; keep local time under a third
    const ms = Date.now() - t0;
    ok(ms < 15000, 'the Grabber tests finish in under 15 s (' + ms + ' ms)');
  }
  return { testClaw };
};
