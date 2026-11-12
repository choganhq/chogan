'use strict';
// #813: Moto Rush rides in four scenes. Rain and snow steer slower and slide past the
// lane, night shows less of the road; the traffic generator must keep every gap fair in
// each, and a test rider must get through each one. The grips and the night margin are
// the issue's intent, written here, not read back from the engine.
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;
  const LIMIT_MS = 30000;
  async function testMotoRushScenes() {
    head('Moto Rush: sunny, rainy, snowy and night scenes with grip (#813)');
    const t0 = Date.now();
    let timer = null;
    const hang = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), LIMIT_MS); });
    const res = await Promise.race([body().then(() => 'done'), hang]);
    clearTimeout(timer);
    ok(res === 'done', 'the scene tests finished before the ' + (LIMIT_MS / 1000) + ' s guard (' + res + ')');
    const ms = Date.now() - t0;
    ok(ms < 9000, 'the scene tests finish in under 9 s (' + ms + ' ms)');
  }
  const tick = () => new Promise((r) => setImmediate(r));

  async function body() {
    const E = loadEngine('motorush', 'MotoRushEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/motorush/index.html'), 'utf8');
    const IDS = ['sunny', 'rainy', 'snowy', 'night'];
    const DIFFS = ['easy', 'medium', 'hard'];
    // the intent: grip (share of the dry steering speed), how far a slide may run past the
    // lane at most, and the extra reaction margin at night
    const GRIP = { sunny: 1, rainy: 0.8, snowy: 0.65, night: 1 };
    const NIGHT_REACT = 0.15;
    const SC = E.SCENES || {};
    ok(IDS.every((id) => SC[id]) && Object.keys(SC).length === 4, 'there are four scenes: ' + IDS.join(', '));
    if (!IDS.every((id) => SC[id])) return;
    ok(IDS.every((id) => SC[id].grip === GRIP[id]), 'grip is 100% in the sun and at night, 80% in rain, 65% in snow');
    ok(SC.sunny.ov === 0 && SC.night.ov === 0 && SC.rainy.ov > 0 && SC.snowy.ov > SC.rainy.ov && SC.snowy.ov < 1 - E.HIT_X, 'rain slides past the lane, snow further, never as far as a car in the next lane (' + SC.rainy.ov + ', ' + SC.snowy.ov + ' of a lane)');
    ok(SC.night.react >= NIGHT_REACT && SC.night.view > 0 && IDS.filter((id) => id !== 'night').every((id) => SC[id].react === 0), 'night adds at least ' + NIGHT_REACT + ' s of reaction to every gap');

    // a ride keeps its scene; the daily ride is always sunny, an unknown one is sunny
    ok(IDS.every((id) => E.fromSeed(3, false, 'medium', id).scene === id) && E.fromSeed(3, false, 'medium', 'fog').scene === 'sunny' && E.fromSeed(3, false).scene === 'sunny', 'a ride keeps its scene, sunny by default');
    const dm = JSON.stringify(E.snapshot(E.fromSeed(99, true, 'medium', 'sunny')));
    ok(['rainy', 'snowy', 'night'].every((id) => JSON.stringify(E.snapshot(E.fromSeed(99, true, 'hard', id))) === dm), 'the daily ride is the same sunny road whatever scene the player picked');
    const sv = E.snapshot(E.fromSeed(7, false, 'hard', 'snowy'));
    const old = Object.assign({}, sv); delete old.scene; delete old.ox;
    ok(E.restore(sv).scene === 'snowy' && E.restore(old).scene === 'sunny' && E.restore(old).ox === 0, 'a save keeps its scene, and one from before scenes rides in the sun');

    // grip is real: on an empty road, the time a lane change takes and how far it runs past
    const empty = (id) => { const S = E.fromSeed(813, false, 'medium', id); S.waves = []; S.items = []; S.ny = 1e9; return S; };
    const lane = {};
    for (const id of IDS) {
      const S = empty(id);
      E.steer(S, 1);
      let at = -1, far = S.x, back = -1;
      for (let i = 0; i < 120; i++) {
        E.step(S);
        if (at < 0 && S.x >= 2 - 1e-9) at = i + 1;
        far = Math.max(far, S.x);
        if (at >= 0 && back < 0 && S.x === 2 && S.ox === 0) back = i + 1;
      }
      lane[id] = { at, over: far - 2, back, end: S.x };
    }
    const expT = (id) => Math.ceil(1 / (5.5 * GRIP[id]) / E.DT - 1e-9);
    ok(IDS.every((id) => Math.abs(lane[id].at - expT(id)) <= 1), 'a lane change reaches the next lane in ' + IDS.map((id) => id + ' ' + lane[id].at).join(', ') + ' ticks, as the grip says');
    ok(lane.sunny.at < lane.rainy.at && lane.rainy.at < lane.snowy.at && lane.night.at === lane.sunny.at, 'so it is slower in rain and slower still in snow');
    ok(lane.sunny.over === 0 && lane.night.over === 0 && Math.abs(lane.rainy.over - SC.rainy.ov) < 1e-6 && Math.abs(lane.snowy.over - SC.snowy.ov) < 1e-6, 'and wider: it runs ' + lane.rainy.over.toFixed(2) + ' of a lane past in rain, ' + lane.snowy.over.toFixed(2) + ' in snow, none when dry');
    ok(IDS.every((id) => lane[id].end === 2), 'every scene settles back in the lane it steered to');

    // the same late swerve: a car right ahead in the bike's lane, the rider steers away at
    // the last moment. The shortest warning each scene survives grows as the grip falls.
    const escape = (id) => {
      for (let d = 0.6; d < 6; d += 0.05) {
        const S = empty(id);
        S.waves = [{ y: Math.round(d * 100) / 100, span: 4.4, f: 0, cars: [{ lane: 1, x: 1, o: 0, len: 4.4, kind: 'car', paint: 0, md: 9, done: false }] }];
        E.steer(S, 1);
        for (let i = 0; i < 120 && !S.over; i++) E.step(S);
        if (!S.over) return d;
      }
      return Infinity;
    };
    const esc = {};
    for (const id of IDS) esc[id] = escape(id);
    ok(esc.sunny < esc.rainy && esc.rainy < esc.snowy && isFinite(esc.snowy), 'a last-moment swerve needs ' + esc.sunny.toFixed(2) + ' m dry, ' + esc.rainy.toFixed(2) + ' m in rain, ' + esc.snowy.toFixed(2) + ' m in snow');
    await tick();

    // the generator: in every scene and difficulty, every gap is long enough to reach the
    // next free lane, sliding back from an overshoot first, after the difficulty's reaction
    // (plus night's), at the fastest the bike can close there
    let worstNight = 0;
    for (const id of IDS) {
      let short = 0, waves = 0, min = Infinity, noFree = 0;
      for (const diff of DIFFS) {
        const react = E.DIFF[diff].react + (id === 'night' ? NIGHT_REACT : 0), ls = 5.5 * GRIP[id], ov = SC[id].ov;
        for (let sd = 1; sd <= 20; sd++) {
          const G = E.fromSeed(sd * 104729, false, diff, id), seen = [];
          for (let p = 0; p <= 9000; p += 100) {
            G.p = p; E.ensure(G);
            for (const w of G.waves) if (!seen.length || w.y > seen[seen.length - 1].y) seen.push(w);
          }
          for (let i = 0; i + 1 < seen.length; i++) {
            const w = seen[i], nx = seen[i + 1], gap = nx.y - (w.y + w.span);
            waves++;
            const to = w.cars.map((c) => (c.to === undefined ? c.lane : c.to));
            if (w.cars.some((c) => c.lane === w.f) || to.includes(w.f)) noFree++;
            const want = E.BIKE_L + ((Math.abs(w.f - nx.f) + ov) / ls + react) * (E.base(nx.y, diff) + E.GAS_V + E.BOOST_V - E.TV);
            if (gap - want < -1e-6) short++;
            min = Math.min(min, gap - want);
            if (id === 'night') worstNight = Math.max(worstNight, want);
          }
        }
      }
      ok(waves > 1500 && short === 0 && noFree === 0, id + ': every gap reaches the next free lane in time on every difficulty (' + waves + ' gaps, smallest margin ' + min.toFixed(2) + ' m)');
      await tick();
    }
    ok(SC.night.view > worstNight, 'at night the headlights reach ' + SC.night.view + ' m, past the longest way any gap needs (' + worstNight.toFixed(0) + ' m)');

    // A test rider in every scene and difficulty, gas held: it rides the free lane of the
    // row it is passing and steers for the next only a reaction time after that row is
    // behind it. At night it knows only rows within the headlights' reach.
    function ride(S, maxTicks) {
      let wait = 0, cur = null;
      const view = S.scene === 'night' ? SC.night.view : Infinity;
      E.gas(S, true);
      for (let i = 0; i < maxTicks && !S.over; i++) {
        const rear = S.p - E.BIKE_L, w = S.waves.find((x) => x.y + x.span > rear);
        const seen = w && w.y - S.p <= view ? w : null;
        if (seen && seen !== cur) { if (cur) wait = Math.ceil(0.35 / E.DT); cur = seen; }
        if (wait > 0) wait--;
        else if (cur && S.tl !== cur.f) E.steer(S, cur.f > S.tl ? 1 : -1);
        E.step(S); E.drain(S);
      }
      return S;
    }
    const r = rng(813);
    for (const id of IDS) {
      let alive = 0, km = Infinity, lvl = 0;
      for (const diff of DIFFS) {
        const N = ride(E.newGame(r, false, diff, id), 60 * 60 * 3);
        if (!N.over) alive++;
        km = Math.min(km, N.d / 1000); lvl = Math.max(lvl, N.lvl);
      }
      ok(alive === 3, id + ': the test rider survives a three-minute ride on each difficulty with the gas held (shortest ' + km.toFixed(1) + ' km, up to level ' + lvl + ')');
      await tick();
    }
    // the page
    const keys = ['sceneL', 'sceneSunny', 'sceneRainy', 'sceneSnowy', 'sceneNight', 'gripN', 'dailySunny', 'sceneHint'];
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(keys.every((k) => (html.match(new RegExp('\\b' + k + ": '[^']+'", 'g')) || []).length === LOCALE_CODES.length), 'the scene strings exist in all ' + LOCALE_CODES.length + ' languages');
    ok(keys.every((k) => !new RegExp('\\b' + k + ':').test(core)), 'none of them is named like a core string');
    ok((html.match(/gripN: '[^']*\{n\}[^']*'/g) || []).length === LOCALE_CODES.length, 'the grip label carries its number in every language');
    const settings = (html.match(/function settings\(\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    ok(/C\.ui\.segmented\(SCENE_IDS\.map/.test(settings) && /newRun\(pick, pickScene[,)]/.test(settings) && /C\.t\('dailySunny'\)/.test(settings), 'the scene is picked behind the gear, and the daily says it is always sunny');
    const help = (html.match(/function showHelp\(\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    ok(help.length > 0 && !/segmented|SCENE|scene/.test(help), 'and never inside the help');
    ok(/prefs\.scene = scene; ctx\.store\.set\('prefs', prefs\)/.test(html) && /E\.newGame\(rngFor\(seed\), !!dailyDate, prefs\.diff, prefs\.scene[,)]/.test(html), 'the scene is saved and starts the ride');
    ok(/C\.t\('gripN'/.test(html) && /weather\(g, P\)/.test(html) && /nightFade\(g\)/.test(html) && /farLights\(/.test(html), 'the page shows the grip, draws rain and snow, and hides the road past the headlights at night');
  }
  return { testMotoRushScenes };
};
