'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT } = T;
  // #652: a shooter with raiders in formation, our own name and look.
  // #716: nine stages of five waves, a flagship on every fifth wave, pick-ups that
  // upgrade the ship and carry into the next stage.
  function testStarRaid() {
    head('Star Raid (#652, #716)');
    const t0 = Date.now();
    const E = loadEngine('starraid', 'StarRaidEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/starraid/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/starraid/icon.svg'), 'utf8');
    const gm = games.find((g) => g.id === 'starraid');
    const steps = (S, n, inp) => { const ev = []; for (let i = 0; i < n && !S.over; i++) ev.push(...E.step(S, inp || {})); return ev; };
    // a run that has just started its first wave, with every raider settled in its slot
    const inForm = (seed, o) => {
      const S = E.newRun(seed || 1, o);
      steps(S, Math.ceil(2.7 / E.DT));
      S.foes.forEach((f) => { f.st = 'form'; const s = E.slot(S, f); f.x = s.x; f.y = s.y; });
      S.diveT = S.fireT = S.bossT = 999; S.eb = [];
      return S;
    };
    const shotAt = (x, y) => ({ x, y, vx: 0, g: 9999 });
    const hitShip = (S) => { S.eb = [{ x: S.p.x, y: E.PY - 3, vx: 0, vy: 200 }]; return E.step(S, {}); };
    // a drop placed on the ship is caught on the next step
    const catchDrop = (S, k) => { S.drops = [{ x: S.p.x, y: E.PY, k }]; return E.step(S, {}); };

    // the campaign's shape
    ok(E.STAGES === 9 && E.WAVES === 5 && E.LIVES === 3 && E.WLMAX === 3 && E.DAILY_STAGE === 5, 'nine stages of five waves, three ships, a weapon of up to three levels, the daily on stage 5');
    ok(E.TEMPLATES.length >= E.WAVES - 1 && E.TEMPLATES.every((t) => t.every((r) => r.length === 8)), 'enough formations of eight columns for the four ordinary waves of a stage (' + E.TEMPLATES.length + ')');
    const langs = html.split(/\n {6}(fa|en|pl|zh|de|es): \{/).slice(1);
    const blocks = {};
    for (let i = 0; i < langs.length; i += 2) blocks[langs[i]] = langs[i + 1].split(/\n {6}\}/)[0];
    const names = Object.keys(blocks).map((l) => [l, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ((blocks[l].match(new RegExp('\\bst' + n + ": '([^']+)'")) || [])[1]))]);
    ok(names.length === 6 && names.every(([, a]) => a.every(Boolean) && new Set(a).size === 9), 'each of the six languages names all nine stages, each name different (' + names.map(([l, a]) => l + ':' + a.filter(Boolean).length).join(' ') + ')');
    ok(names.length === 6 && names.find(([l]) => l === 'en')[1].join() === 'Moon Orbit,Red Mars,Asteroid Belt,Jupiter Storm,Rings of Saturn,Dark Nebula,Neutron Star,Supernova,Black Hole' &&
      names.find(([l]) => l === 'fa')[1][0] === 'مدار ماه' && names.find(([l]) => l === 'fa')[1][8] === 'سیاه‌چاله', 'the names run outward from the Moon to a black hole, so each tells how hard it is');
    ok(['stageN', 'bossWave', 'stageClear', 'nextStage', 'retryStage', 'startOver', 'startOverWarn', 'stagesT', 'locked', 'pkW', 'pkR', 'pkS', 'pkL', 'pkP', 'tutTitle4', 'tutText4'].every((k) => Object.keys(blocks).length === 6 && Object.values(blocks).every((b) => new RegExp('\\b' + k + ": '[^']+'").test(b))), 'every new stage and pick-up string exists in all six languages');

    // difficulty: every knob moves one way through the whole campaign
    const seq = [];
    for (let s = 1; s <= E.STAGES; s++) for (let w = 1; w <= E.WAVES; w++) seq.push(E.knobs(s, w));
    const UP = ['divers', 'volley', 'shotV', 'diveV', 'diveShots', 'weight'], DOWN = ['diveGap', 'fireGap'];
    const mono = seq.length === 45 && seq.every((k, i) => i === 0 || (UP.every((n) => k[n] >= seq[i - 1][n]) && DOWN.every((n) => k[n] <= seq[i - 1][n])));
    ok(mono, 'the difficulty never eases, wave after wave and stage after stage (45 waves, ' + (UP.length + DOWN.length) + ' knobs)');
    const a1 = E.knobs(1, 1), z1 = E.knobs(9, 1);
    const easier = UP.filter((n) => a1[n] < z1[n]).concat(DOWN.filter((n) => a1[n] > z1[n]));
    ok(easier.length === UP.length + DOWN.length, 'the first wave of stage 1 is easier than the first of stage 9 on every knob (' + easier.length + ' of ' + (UP.length + DOWN.length) + ')');
    ok([2, 3, 4, 5, 6, 7, 8, 9].every((s) => E.knobs(s, 1).weight > E.knobs(s - 1, 1).weight && E.knobs(s, 1).diveGap < E.knobs(s - 1, 1).diveGap) &&
      [1, 2, 3, 4, 5, 6, 7, 8, 9].every((s) => E.knobs(s, 4).weight > E.knobs(s, 1).weight), 'each stage starts harder than the one before, and grows harder inside');
    ok(a1.divers === 1 && a1.volley === 1 && a1.diveShots === 1 && E.bossFan(1) === 1 && E.newRun(1).up.wl === 1, 'stage 1 starts small: one diver at a time, single shots, a plain ship');

    // the waves of a stage
    const W1 = E.newRun(7, { stage: 1 }), ev1 = steps(W1, Math.ceil(2.7 / E.DT));
    ok(W1.wave === 1 && W1.phase === 'play' && W1.foes.length > 0 && ev1.some((e) => e.e === 'wave' && e.n === 1), 'the first wave starts after the stage\'s name has shown');
    steps(W1, 300);
    ok(W1.foes.every((f) => f.st === 'form' || f.st === 'dive') && W1.foes.filter((f) => f.st === 'form').length >= 2, 'after a few seconds the raiders have flown in and settled in formation');
    const s0 = W1.foes.find((f) => f.st === 'form'), x0 = s0.x;
    steps(W1, 60);
    ok(Math.abs(s0.x - x0) > 1 && Math.abs(s0.x - E.slot(W1, s0).x) < 0.001, 'the formation sways from side to side');
    const bosses = [];
    for (let s = 1; s <= E.STAGES; s++) {
      const S = inForm(30 + s, { stage: s });
      for (let w = 1; w < E.WAVES; w++) { S.foes = []; E.step(S, {}); steps(S, Math.ceil(2.3 / E.DT)); }
      bosses.push({ s, wave: S.wave, n: S.foes.filter((f) => E.KIND[f.k].boss).length, hp: (S.foes.find((f) => E.KIND[f.k].boss) || {}).hpMax, early: false });
    }
    ok(bosses.every((b) => b.wave === 5 && b.n === 1), 'the fifth wave of every stage has exactly one flagship (' + bosses.map((b) => b.n).join('') + ')');
    ok(bosses.every((b, i) => i === 0 || b.hp > bosses[i - 1].hp) && bosses[0].hp === E.bossHp(1), 'the flagship takes more hits each stage (' + bosses.map((b) => b.hp).join(', ') + ')');
    ok([2, 3, 4, 5, 6, 7, 8, 9].every((s) => E.bossR(s) > E.bossR(s - 1) && E.bossFan(s) >= E.bossFan(s - 1)), 'and it is bigger each stage, its fan of shots never narrower');
    let early = 0;
    for (let s = 1; s <= 3; s++) { const S = inForm(50 + s, { stage: s }); for (let w = 1; w < 4; w++) { early += S.foes.filter((f) => E.KIND[f.k].boss).length; S.foes = []; E.step(S, {}); steps(S, Math.ceil(2.3 / E.DT)); } early += S.foes.filter((f) => E.KIND[f.k].boss).length; }
    ok(early === 0, 'waves 1 to 4 have no flagship');

    // collisions
    let S = inForm(3), f = S.foes.find((x) => x.k === 's');
    if (!f) { f = S.foes[0]; f.k = 's'; f.hp = f.hpMax = 1; }
    S.pb = [shotAt(f.x, f.y + 12)];
    let ev = E.step(S, {});
    ok(ev.some((e) => e.e === 'kill' && e.k === 's') && S.score === 10 && S.kills === 1 && S.hits === 1 && S.pb.length === 0, 'a shot that reaches a scout downs it for 10 points');
    S = inForm(3); f = S.foes[0];
    S.pb = [shotAt(f.x + 60, f.y + 12)];
    S.foes = [f];
    E.step(S, {});
    ok(S.kills === 0 && S.pb.length === 1, 'a shot that passes beside a raider flies on');
    S = inForm(11); f = S.foes[0]; f.k = 'b'; f.hp = f.hpMax = 2; S.foes = [f, S.foes[1]].filter(Boolean);
    S.pb = [shotAt(f.x, f.y + 12)]; ev = E.step(S, {});
    const after1 = S.foes.includes(f) && f.hp === 1 && ev.some((e) => e.e === 'hit');
    S.pb = [shotAt(f.x, f.y + 12)]; ev = E.step(S, {});
    ok(after1 && !S.foes.includes(f) && ev.some((e) => e.e === 'kill' && e.k === 'b'), 'an armoured raider takes two hits');
    S = inForm(5); f = S.foes[0]; f.st = 'dive'; f.dt = 1; f.vx = 0; f.vy = 0; f.sh = 0; f.hp = 1;
    const pts = E.KIND[f.k].pts;
    S.pb = [shotAt(f.x, f.y + 12)]; E.step(S, {});
    ok(S.score === pts * 2, 'a raider downed during its dive scores double (' + S.score + ' for ' + pts + ')');
    S = inForm(5); ev = hitShip(S);
    ok(ev.some((e) => e.e === 'die') && S.lives === 2 && S.lost && S.p.dead > 0 && S.eb.length === 0, 'an enemy shot on the ship costs a ship and clears the sky of shots');
    steps(S, Math.ceil(1.4 / E.DT));
    ok(S.p.dead === 0 && S.p.inv > 0, 'the next ship arrives after a moment and is shielded for a while');
    hitShip(S);
    ok(S.lives === 2, 'a shot cannot hit the ship while it is shielded');
    S = inForm(5); f = S.foes[0]; f.st = 'dive'; f.dt = 1; f.vx = 0; f.vy = 0; f.sh = 0; f.x = S.p.x; f.y = E.PY;
    ev = E.step(S, {});
    ok(ev.some((e) => e.e === 'die') && !S.foes.includes(f) && S.lives === 2, 'a raider that rams the ship is lost with it');
    S = inForm(5); S.lives = 1; ev = hitShip(S);
    ok(S.over && !S.won && ev.some((e) => e.e === 'over') && E.step(S, { fire: true }).length === 0, 'the last ship lost ends the stage, and nothing moves after it');

    // pick-ups
    let drops = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const R = inForm(seed * 101, { stage: 2 });
      for (const q of R.foes.slice()) { R.pb = [shotAt(q.x, q.y + 12)]; R.foes = [q].concat(R.foes.filter((x) => x !== q)); drops += E.step(R, {}).filter((e) => e.e === 'drop').length; R.drops = []; }
    }
    ok(drops > 0 && drops < 40, 'a downed raider sometimes drops a pick-up (' + drops + ' from four formations)');
    S = inForm(8, { stage: 3 }); S.foes = S.foes.filter((x) => x.k !== 'k'); steps(S, 1);
    S.wave = 4; S.foes = []; E.step(S, {}); steps(S, Math.ceil(2.3 / E.DT));
    f = S.foes.find((x) => E.KIND[x.k].boss); f.hp = 1; f.st = 'form'; S.foes = [f]; { const s2 = E.slot(S, f); f.x = s2.x; f.y = s2.y; }
    S.pb = [shotAt(f.x, f.y + 12)]; ev = E.step(S, {});
    ok(ev.some((e) => e.e === 'kill' && e.k === 'k') && ev.some((e) => e.e === 'drop') && S.drops.length === 1, 'a downed flagship always drops a pick-up');
    S = inForm(9);
    ev = catchDrop(S, 'W'); const wl2 = S.up.wl;
    catchDrop(S, 'R'); const rf1 = S.up.rf;
    catchDrop(S, 'S'); const sh1 = S.up.sh;
    catchDrop(S, 'L'); const l4 = S.lives;
    ok(ev.some((e) => e.e === 'pick' && e.k === 'W') && wl2 === 2 && rf1 === 1 && sh1 === 1 && l4 === 4 && S.picks === 4 && S.drops.length === 0, 'flying under a pick-up catches it: a stronger weapon, faster fire, a shield, an extra ship');
    ok(E.cooldown(S) < E.COOL && E.maxVolleys(S) > E.maxVolleys(E.newRun(1)), 'faster fire shortens the time between shots and allows more in the air');
    S.up.wl = 3; S.pb = []; S.p.cd = 0; ev = E.step(S, { fire: true });
    ok(S.pb.length === 3 && S.pb.some((b) => b.vx < 0) && S.pb.some((b) => b.vx > 0), 'the weapon at level 3 fires a spread of three');
    const sc0 = S.score; ev = catchDrop(S, 'W');
    ok(S.up.wl === 3 && S.score === sc0 + 250 && ev.some((e) => e.e === 'pick' && e.k === 'P'), 'the weapon stops at level 3; a pick-up it cannot use is worth 250 points');
    S.p.inv = 0; S.p.dead = 0; ev = hitShip(S);
    ok(ev.some((e) => e.e === 'shield') && S.lives === 4 && S.up.sh === 0 && S.up.wl === 3, 'a shield takes one hit in place of the ship');
    S.p.inv = 0; hitShip(S);
    ok(S.lives === 3 && S.up.wl === 2, 'a lost ship takes the weapon down one level');
    steps(S, Math.ceil(3.6 / E.DT)); S.p.inv = 0; S.up.wl = 1; hitShip(S);
    ok(S.up.wl === 1 && S.lives === 2, 'it never drops below a single gun');
    S = inForm(9); S.lives = E.MAXL; S.up = { wl: 3, rf: 3, sh: 1 };
    const fullDrops = [];
    for (let i = 0; i < 20; i++) { const R = E.clone(S); f = R.foes[0]; f.k = 'k'; f.hp = 1; R.foes = [f]; R.pb = [shotAt(f.x, f.y + 12)]; R.rs = i + 1; fullDrops.push(...E.step(R, {}).filter((e) => e.e === 'drop').map((e) => e.k)); }
    ok(fullDrops.length === 20 && fullDrops.every((k) => k === 'P'), 'with everything full, only points fall');

    // controls
    S = inForm(5); const px = S.p.x;
    steps(S, 15, { dir: 1 });
    ok(Math.abs(S.p.x - (px + 330 * 0.25)) < 1, 'a held arrow moves the ship at a steady speed');
    steps(S, 120, { x: 20 });
    ok(Math.abs(S.p.x - 20) < 2.5, 'the ship goes to where the finger steers it, kept inside the sky');
    S = inForm(5); ev = steps(S, 60, { fire: true });
    const shots = ev.filter((e) => e.e === 'shot').length;
    ok(shots >= 2 && shots <= Math.ceil(1 / E.COOL), 'holding fire shoots at a steady rate (' + shots + ' in 1 s)');

    // the end of a wave and of a stage
    S = inForm(9, { stage: 2 }); S.foes = []; ev = E.step(S, {});
    ok(ev.some((e) => e.e === 'clean' && e.n === 150) && ev.some((e) => e.e === 'cleared') && S.phase === 'gap' && S.score === 150 && S.streak === 1, 'a wave cleared without losing a ship earns a bonus that grows with the stage, then a short pause');
    steps(S, Math.ceil(2.3 / E.DT));
    ok(S.wave === 2 && S.phase === 'play' && S.foes.length > 0 && !S.lost, 'the next wave follows the pause');
    hitShip(S); S.foes = []; ev = E.step(S, {});
    ok(!ev.some((e) => e.e === 'clean') && S.streak === 0, 'a wave in which a ship was lost earns no bonus and ends the streak');
    S = inForm(9, { stage: 4 }); S.wave = 5; S.foes = []; S.lives = 2; S.drops = []; E.step(S, {});
    const scW = S.score; ev = steps(S, Math.ceil(1.3 / E.DT));
    ok(S.won && S.over && ev.some((e) => e.e === 'win' && e.n === 600) && S.score === scW + 600 && E.cleared(S) === E.WAVES, 'clearing the flagship\'s wave wins the stage, with 300 a ship left');
    S = inForm(9, { stage: 4 }); S.wave = 5; S.foes = []; S.drops = [{ x: 30, y: 200, k: 'W' }]; E.step(S, {}); steps(S, Math.ceil(1.3 / E.DT));
    ok(!S.over && S.drops.length === 1, 'the stage waits for the flagship\'s pick-up to be caught or to fall away');

    // kits: what a stage starts with
    const kit = { wl: 2, rf: 1, sh: 1, lives: 4 };
    const K4 = E.newRun(3, { stage: 4, kit });
    ok(K4.stage === 4 && K4.up.wl === 2 && K4.up.rf === 1 && K4.up.sh === 1 && K4.lives === 4 && JSON.stringify(K4.kit) === JSON.stringify(kit), 'a stage starts with the kit carried into it');
    S = E.clone(K4); S.up = { wl: 3, rf: 2, sh: 0 }; S.lives = 2;
    ok(JSON.stringify(E.kitAfter(S)) === JSON.stringify({ wl: 3, rf: 2, sh: 0, lives: 3 }), 'the kit carried out of a stage is its upgrades, and at least three ships');
    ok(JSON.stringify(E.normKit({ wl: 9, rf: -2, sh: 'x', lives: 99 })) === JSON.stringify({ wl: 3, rf: 0, sh: 1, lives: E.MAXL }) && JSON.stringify(E.normKit(null)) === JSON.stringify({ wl: 1, rf: 0, sh: 0, lives: 3 }), 'a kit read from storage is kept within its limits');
    const D = E.newRun(3, { daily: true, stage: 2, kit: { wl: 3, rf: 3, sh: 1, lives: 5 } });
    ok(D.daily && D.stage === E.DAILY_STAGE && D.up.wl === 1 && D.up.rf === 0 && D.up.sh === 0 && D.lives === 3, 'the daily plays stage 5 with a fresh ship, whatever the campaign holds');

    // determinism, saves
    const simple = (R) => {
      let tx = R.p.x, low = -1;
      for (const q of R.foes) if (q.st !== 'wait' && q.y > low) { low = q.y; tx = q.x; }
      for (const d of R.drops) if (d.y > E.PY - 220 && d.y < E.PY + 10) tx = d.x;
      for (const b of R.eb) {
        if (b.y > E.PY || b.y < E.PY - 170 || b.vy <= 0) continue;
        const at = b.x + b.vx * (E.PY - b.y) / b.vy;
        if (Math.abs(at - tx) < 28) tx = at + (R.p.x <= at ? -40 : 40);
      }
      return { x: tx, fire: true };
    };
    const play = (R, n) => { for (let i = 0; i < n && !R.over; i++) E.step(R, simple(R)); return R; };
    const P = play(E.newRun(99, { stage: 3 }), 2000), Q = play(E.newRun(99, { stage: 3 }), 2000);
    ok(JSON.stringify(P) === JSON.stringify(Q) && P.t > 30, 'the same seed and the same moves give the same run, step for step');
    const mid = play(E.newRun(123, { stage: 4, kit }), 1500);
    mid.drops.push({ x: 120, y: 300, k: 'R' });
    const snap = JSON.parse(JSON.stringify(E.snapshot(mid))), back = E.restore(snap);
    const midOk = !mid.over && mid.wave >= 1 && mid.drops.length >= 1;
    play(mid, 1500); play(back, 1500);
    ok(midOk && back && JSON.stringify(back) === JSON.stringify(mid), 'a run saved mid-stage, with a pick-up falling and upgrades on, goes on exactly as it would have');
    const g = E.newRun(5, { stage: 2 }); steps(g, 200); const g2 = E.snapshot(g);
    ok(E.restore(g2) && !E.restore(null) && !E.restore(Object.assign({}, g2, { v: 1 })) && !E.restore(Object.assign({}, g2, { lives: 0 })) &&
      !E.restore(Object.assign({}, g2, { stage: 10 })) && !E.restore(Object.assign({}, g2, { daily: true })) && !E.restore(Object.assign({}, g2, { up: { wl: 4, rf: 0, sh: 0 } })) &&
      !E.restore(Object.assign({}, g2, { drops: [{ x: 1, y: 1, k: 'Z' }] })) && !E.restore(Object.assign({}, g2, { kit: { wl: 1, rf: 0, sh: 0, lives: 1 } })) &&
      !E.restore(Object.assign({}, g2, { foes: [{ k: 'x' }] })) && !E.restore(Object.assign({}, g2, { phase: 'over' })) && !E.restore(Object.assign({}, g2, { p: { x: 'a' } })), 'a broken or finished save is refused');
    // a save of the old single run, before the stages: version 1, no stage, no kit
    const v1 = { v: 1, seed: 5, rs: 5, order: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], t: 10, wave: 2, phase: 'play', timer: 0, lives: 3, score: 100, kills: 5, shots: 9, hits: 5,
      clean: 1, streak: 1, top: 1, lost: false, bonus: 0, won: false, over: false, p: { x: 180, cd: 0, dead: 0, inv: 0 }, pb: [], eb: [], foes: [], diveT: 1, fireT: 1, bossT: 1, bossN: 0, burst: 0, burstT: 0, burstA: 0, burstD: 0 };
    ok(E.restore(v1) === null, 'a save from before the stages is refused, so it starts a fresh stage instead of breaking');

    // bots: a plain one that chases pick-ups clears stage 1, and stage 9 is far harder for it
    const won1 = [], cleared9 = [];
    for (let seed = 1; seed <= 4; seed++) {
      const R = play(E.newRun(seed * 7919 + 1, { stage: 1 }), 60 * 60 * 6);
      won1.push(R.won ? 'W' : E.cleared(R));
    }
    for (let seed = 1; seed <= 2; seed++) cleared9.push(E.cleared(play(E.newRun(seed * 7919 + 9, { stage: 9 }), 60 * 60 * 6)));
    ok(won1.every((r) => r === 'W'), 'a plain bot that aims, side-steps and chases pick-ups clears stage 1 every time (' + won1.join(' ') + ')');
    ok(cleared9.every((n) => n < E.WAVES), 'the same bot does not clear stage 9 (waves ' + cleared9.join(', ') + ')');

    // the page
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lab = (h) => { const [R, G, B] = rgb(h).map(lin), fn = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
      return [116 * fn(Y) - 16, 500 * (fn(X) - fn(Y)), 200 * (fn(Y) - fn(Z))]; };
    const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
    const lum = (h) => rgb(h).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    ok(gm && gm.cat === 'skill' && gm.people === 1 && gm.daily !== false && html.match(/accent: '([^']+)'/)[1] === gm.color, 'Star Raid is listed as a one-player skill game with a daily run, and the page uses its catalogue colour');
    const near = games.filter((x) => x.id !== 'starraid').map((x) => [x.id, dE(x.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5, 'its colour is far from every other game\'s (nearest ' + near[0] + ', ΔE ' + near[1].toFixed(1) + ') and white text reads on it');
    ok(new RegExp('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon), 'the icon sits on the catalogue tint');
    ok(['sr-win', 'sr-clean', 'sr-daily'].every((id) => new RegExp("\\{ id: '" + id + "',[^\\n]*dde: '[^\\n]*des: '[^\\n]*dpl: '").test(core) && html.indexOf("unlock('" + id + "')") > 0), 'the three awards exist in every language and the page unlocks them');
    ok(/\{ id: 'sr-win',[^\n]*nine/.test(core) && /\{ id: 'sr-daily',[^\n]*four waves/.test(core), 'the awards speak of the nine stages and the daily\'s four waves');
    ok(/C\.daily\('starraid', dailyDate\)\.seed/.test(html) && /C\.stats\.best\('starraid', 'score'/.test(html), 'the daily run is seeded by the day and the best score is kept');
    ok(/ctx\.store\.get\('camp'/.test(html) && /ctx\.store\.set\('camp'/.test(html) && /E\.kitAfter\(S\)/.test(html), 'the campaign (open stages, best scores, carried kit) is kept in the game\'s storage');
    ok(/C\.ui\.confirm\(\{[^\n]*startOverWarn[^\n]*danger: true/.test(html) && /function showStages/.test(html) && !/function showHelp[\s\S]{0,600}startOver/.test(html), 'starting over from stage 1 sits behind the gear and a warning, never inside help');
    ok(/visibilitychange[\s\S]{0,80}hold\(\)/.test(html) && /C\.onPause/.test(html) && /e\.persisted/.test(html), 'the run holds when the page is hidden, paused or restored from the cache');
    ok(!/space invaders|galaga|<img|\.png/i.test(html), 'no trademark names and no image files: the ships are drawn in code');
    ok(Date.now() - t0 < 6000, 'the Star Raid tests finish in under 6 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testStarRaid };
};
