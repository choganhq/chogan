'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT } = T;
  // #652: a shooter with raiders in formation, our own name and look
  function testStarRaid() {
    head('Star Raid (#652)');
    const t0 = Date.now();
    const E = loadEngine('starraid', 'StarRaidEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/starraid/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/starraid/icon.svg'), 'utf8');
    const gm = games.find((g) => g.id === 'starraid');
    const steps = (S, n, inp) => { const ev = []; for (let i = 0; i < n && !S.over; i++) ev.push(...E.step(S, inp || {})); return ev; };
    // a run that has just started its first wave, with every raider settled in its slot
    const inForm = (seed) => {
      const S = E.newRun(seed || 1);
      steps(S, 60);
      S.foes.forEach((f) => { f.st = 'form'; const s = E.slot(S, f); f.x = s.x; f.y = s.y; });
      S.diveT = S.fireT = 999; S.eb = [];
      return S;
    };

    // the run and its waves
    const A = E.newRun(42), B = E.newRun(42);
    ok(A.order.slice().sort((a, b) => a - b).join() === '0,1,2,3,4,5,6,7,8,9' && A.order.join() === B.order.join(), 'a run plays all ten formations once, in an order set by its seed');
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => E.newRun(s).order.join()));
    ok(orders.size >= 6, 'different seeds give different wave orders, so the daily run differs by day (' + orders.size + ' of 8)');
    ok(E.WAVES === 11 && E.LIVES === 3 && E.TEMPLATES.length === 10 && E.TEMPLATES.every((t) => t.every((r) => r.length === 8)), 'ten formations of eight columns plus a final wave, and three ships');
    const W1 = E.newRun(7), ev1 = steps(W1, 60);
    const want = E.TEMPLATES[W1.order[0]].join('').replace(/\./g, '').length;
    ok(W1.wave === 1 && W1.phase === 'play' && W1.foes.length === want && ev1.some((e) => e.e === 'wave' && e.n === 1), 'the first wave starts after a short pause with its formation\'s ' + want + ' raiders');
    steps(W1, 300);
    ok(W1.foes.every((f) => f.st === 'form' || f.st === 'dive') && W1.foes.filter((f) => f.st === 'form').length >= want - 2, 'after a few seconds the raiders have flown in and settled in formation');
    const s0 = W1.foes.find((f) => f.st === 'form'), x0 = s0.x;
    steps(W1, 60);
    ok(Math.abs(s0.x - x0) > 1 && Math.abs(s0.x - E.slot(W1, s0).x) < 0.001, 'the formation sways from side to side');

    // collisions
    let S = inForm(3), f = S.foes.find((x) => x.k === 's');
    S.pb = [{ x: f.x, y: f.y + 12 }];
    let ev = E.step(S, {});
    ok(ev.some((e) => e.e === 'kill' && e.k === 's') && S.score === 10 && S.kills === 1 && S.hits === 1 && S.pb.length === 0, 'a shot that reaches a scout downs it for 10 points');
    S = inForm(3); f = S.foes.find((x) => x.k === 's');
    S.pb = [{ x: f.x + 40, y: f.y + 12 }];
    E.step(S, {});
    ok(S.kills === 0 && S.pb.length === 1, 'a shot that passes beside a raider flies on');
    S = inForm(11);
    f = S.foes.find((x) => x.k === 'b');
    if (!f) { f = S.foes[0]; f.k = 'b'; f.hp = 2; }
    S.pb = [{ x: f.x, y: f.y + 12 }]; ev = E.step(S, {});
    const after1 = S.foes.includes(f) && f.hp === 1 && ev.some((e) => e.e === 'hit');
    S.pb = [{ x: f.x, y: f.y + 12 }]; ev = E.step(S, {});
    ok(after1 && !S.foes.includes(f) && ev.some((e) => e.e === 'kill' && e.k === 'b'), 'an armoured raider takes two hits');
    S = inForm(5); f = S.foes[0]; f.st = 'dive'; f.dt = 1; f.vx = 0; f.vy = 0; f.sh = 0; f.hp = 1;
    const pts = E.KIND[f.k].pts;
    S.pb = [{ x: f.x, y: f.y + 12 }]; E.step(S, {});
    ok(S.score === pts * 2, 'a raider downed during its dive scores double (' + S.score + ' for ' + pts + ')');
    S = inForm(5);
    S.eb = [{ x: S.p.x, y: E.PY - 3, vx: 0, vy: 200 }]; ev = E.step(S, {});
    ok(ev.some((e) => e.e === 'die') && S.lives === 2 && S.lost && S.p.dead > 0 && S.eb.length === 0, 'an enemy shot on the ship costs a ship and clears the sky of shots');
    steps(S, Math.ceil(1.4 / E.DT));
    ok(S.p.dead === 0 && S.p.inv > 0, 'the next ship arrives after a moment and is shielded for a while');
    S.eb = [{ x: S.p.x, y: E.PY - 3, vx: 0, vy: 200 }]; E.step(S, {});
    ok(S.lives === 2, 'a shot cannot hit the ship while it is shielded');
    S = inForm(5); f = S.foes[0]; f.st = 'dive'; f.dt = 1; f.vx = 0; f.vy = 0; f.sh = 0; f.x = S.p.x; f.y = E.PY;
    ev = E.step(S, {});
    ok(ev.some((e) => e.e === 'die') && !S.foes.includes(f) && S.lives === 2, 'a raider that rams the ship is lost with it');
    S = inForm(5); S.lives = 1;
    S.eb = [{ x: S.p.x, y: E.PY - 3, vx: 0, vy: 200 }]; ev = E.step(S, {});
    ok(S.over && !S.won && ev.some((e) => e.e === 'over') && E.step(S, { fire: true }).length === 0, 'the last ship lost ends the run, and nothing moves after it');

    // controls
    S = inForm(5); const px = S.p.x;
    steps(S, 15, { dir: 1 });
    ok(Math.abs(S.p.x - (px + 330 * 0.25)) < 1, 'a held arrow moves the ship at a steady speed');
    steps(S, 120, { x: 20 });
    ok(Math.abs(S.p.x - 20) < 2.5, 'the ship goes to where the finger steers it, kept inside the sky');
    S = inForm(5); ev = steps(S, 60, { fire: true });
    const shots = ev.filter((e) => e.e === 'shot').length;
    ok(shots >= 2 && S.pb.length <= 2 && shots <= Math.ceil(1 / E.COOL), 'holding fire shoots at a steady rate, at most two shots in the air (' + shots + ' in 1 s)');

    // wave progression and the end of the run
    S = inForm(9); S.foes = []; ev = E.step(S, {});
    ok(ev.some((e) => e.e === 'clean' && e.n === 100) && ev.some((e) => e.e === 'cleared') && S.phase === 'gap' && S.score === 100 && S.streak === 1, 'a wave cleared without losing a ship earns a bonus, then a short pause');
    steps(S, Math.ceil(2.3 / E.DT));
    ok(S.wave === 2 && S.phase === 'play' && S.foes.length > 0 && !S.lost, 'the next wave follows the pause');
    S.eb = [{ x: S.p.x, y: E.PY - 3, vx: 0, vy: 200 }]; E.step(S, {}); S.foes = []; ev = E.step(S, {});
    ok(!ev.some((e) => e.e === 'clean') && S.streak === 0, 'a wave in which a ship was lost earns no bonus and ends the streak');
    S = inForm(9); S.wave = 10; S.foes = []; S.phase = 'play'; E.step(S, {}); steps(S, Math.ceil(2.3 / E.DT));
    ok(S.wave === 11 && S.foes.length === 9 && S.foes.filter((x) => x.k === 'k').length === 1, 'the eleventh wave is short, with the flagship');
    S.foes = []; S.lives = 2; const sc = S.score; ev = E.step(S, {});
    ok(S.won && S.over && ev.some((e) => e.e === 'win' && e.n === 1000) && S.score === sc + 1100 + 1000, 'clearing the last wave wins the run, with 500 a ship left');

    // determinism, saves
    const simple = (R) => {
      let tx = R.p.x, low = -1;
      for (const q of R.foes) if (q.st !== 'wait' && q.y > low) { low = q.y; tx = q.x; }
      for (const b of R.eb) {
        if (b.y > E.PY || b.y < E.PY - 170 || b.vy <= 0) continue;
        const at = b.x + b.vx * (E.PY - b.y) / b.vy;
        if (Math.abs(at - tx) < 28) tx = at + (R.p.x <= at ? -40 : 40);
      }
      return { x: tx, fire: true };
    };
    const play = (R, n) => { for (let i = 0; i < n && !R.over; i++) E.step(R, simple(R)); return R; };
    const P = play(E.newRun(99), 2000), Q = play(E.newRun(99), 2000);
    ok(JSON.stringify(P) === JSON.stringify(Q) && P.t > 30, 'the same seed and the same moves give the same run, step for step');
    const mid = play(E.newRun(123), 1500), back = E.restore(JSON.parse(JSON.stringify(E.snapshot(mid))));
    play(mid, 1500); play(back, 1500);
    ok(back && JSON.stringify(back) === JSON.stringify(mid), 'a saved run goes on exactly as it would have');
    const good = E.snapshot(E.newRun(5)); steps(good, 60); const g2 = E.snapshot(good);
    ok(E.restore(g2) && !E.restore(null) && !E.restore(Object.assign({}, g2, { v: 2 })) && !E.restore(Object.assign({}, g2, { lives: 0 })) &&
      !E.restore(Object.assign({}, g2, { order: [0, 0, 1, 2, 3, 4, 5, 6, 7, 8] })) && !E.restore(Object.assign({}, g2, { foes: [{ k: 'x' }] })) &&
      !E.restore(Object.assign({}, g2, { phase: 'over' })) && !E.restore(Object.assign({}, g2, { p: { x: 'a' } })), 'a broken or finished save is refused');

    // bots: a plain one survives some waves, a careful one that looks ahead wins
    const reached = [];
    for (let seed = 1; seed <= 6; seed++) { const R = E.newRun(seed * 7919); play(R, 60 * 60 * 10); reached.push(R.wave); }
    reached.sort((a, b) => a - b);
    ok(reached.length === 6 && reached[0] >= 2 && reached[3] >= 3 && reached[5] < E.WAVES, 'a plain bot that aims and side-steps gets through some waves but not the whole run (waves ' + reached.join(', ') + ')');
    const careful = (R, mem) => {
      if (mem.n-- > 0) return mem.inp;
      const aim = simple(R).x, cands = [aim, R.p.x, R.p.x - 60, R.p.x + 60, R.p.x - 120, R.p.x + 120, 30, 330, 180];
      let pick = cands[0];
      for (const x of cands) {
        const T = E.clone(R); let died = false;
        for (let k = 0; k < 50 && !died; k++) if (E.step(T, { x, fire: true }).some((e) => e.e === 'die')) died = true;
        if (!died) { pick = x; break; }
      }
      mem.inp = { x: pick, fire: true }; mem.n = 5;
      return mem.inp;
    };
    const R = E.newRun(2 * 7919), mem = { n: 0 };
    let n = 0;
    while (!R.over && n < 60 * 60 * 15) { E.step(R, careful(R, mem)); n++; }
    const mins = n * E.DT / 60;
    ok(R.won && R.wave === E.WAVES && R.lives >= 1 && R.score > 8000, 'a bot that looks ahead clears all eleven waves (score ' + R.score + ', ' + R.lives + ' ships left)');
    ok(mins > 2.5 && mins < 10, 'even played without a miss of judgement the run lasts minutes (' + mins.toFixed(1) + ' min of game time)');

    // the page
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (h) => { const [R, G, B] = rgb(h).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
    const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
    const lum = (h) => rgb(h).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    ok(gm && gm.cat === 'skill' && gm.people === 1 && gm.daily !== false && html.match(/accent: '([^']+)'/)[1] === gm.color, 'Star Raid is listed as a one-player skill game with a daily run, and the page uses its catalogue colour');
    const near = games.filter((g) => g.id !== 'starraid').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'its colour is far from every other game\'s (nearest ' + near[0] + ', ΔE ' + near[1].toFixed(1) + ') and white text reads on it');
    ok(new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon sits on the catalogue tint');
    ok(['sr-win', 'sr-clean', 'sr-daily'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '[^\\n]*dpl: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three awards exist in every language and the page unlocks them');
    ok(/C\.daily\('starraid', dailyDate\)\.seed/.test(html) && /C\.stats\.best\('starraid', 'score'/.test(html), 'the daily run is seeded by the day and the best score is kept');
    ok(/visibilitychange[\s\S]{0,80}hold\(\)/.test(html) && /C\.onPause/.test(html) && /e\.persisted/.test(html), 'the run holds when the page is hidden, paused or restored from the cache');
    ok(!/space invaders|galaga|<img|\.png/i.test(html), 'no trademark names and no image files: the ships are drawn in code');
    ok(Date.now() - t0 < 6000, 'the Star Raid tests finish in under 6 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testStarRaid };
};
