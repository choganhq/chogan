'use strict';
// #805: Hillrider gets four scenes, sunny, snowy, rainy and night (the owner's choice for
// the fourth, 2026-11-11). Rain and snow lower the wheels' grip, night only takes the light
// away, and the daily road is always sunny so the scores compare. The engine's own driver
// proves every scene can still be driven to the flag, and measured bands prove the grip
// difference is real: a slippery road brakes longer, pulls away slower and costs time.
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  function testHillriderScenes() {
    head('Hillrider: four scenes with their own grip (#805)');
    const t0 = Date.now();
    const E = loadEngine('hillrider', 'HillriderEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/hillrider/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const has = (f) => typeof E[f] === 'function';
    const ids = Array.isArray(E.SCENE_IDS) ? E.SCENE_IDS.slice() : [];
    ok(JSON.stringify(ids) === '["sun","snow","rain","night"]', 'there are four scenes: sunny, snowy, rainy and night (' + ids.join(', ') + ')');
    if (!has('grip') || ids.length !== 4) { ok(false, 'the engine has no scenes to test (E.grip, E.SCENE_IDS)'); return; }

    // the grip numbers: sunny is the reference, night drives like it, rain and snow are slippery
    ok(E.grip('sun') === 1.15 && E.grip('night') === E.grip('sun') && E.grip('rain') < E.grip('sun') && E.grip('snow') < E.grip('rain'),
      'grip: sunny ' + E.grip('sun') + ', night ' + E.grip('night') + ', rain ' + E.grip('rain') + ', snow ' + E.grip('snow'));
    const G0 = E.newGame(805, 0);
    ok(G0.scene === 'sun' && G0.mu === E.grip('sun') && E.newGame(805, 0, 'fog').scene === 'sun', 'a run with no scene, or an unknown one, is sunny');

    // the same seed and inputs: night drives exactly like sunny, snow does not
    const run = (sc, n) => { const S = E.newGame(763, 0, sc); for (let i = 0; i < n && !S.over; i++) E.step(S, E.botControl(S)); return S; };
    const sun = run('sun', 900), night = run('night', 900), snow = run('snow', 900);
    ok(sun.x === night.x && sun.fuel === night.fuel, 'night has the sunny road\'s grip: the same inputs drive the same run (' + sun.x.toFixed(2) + ' m)');
    ok(snow.x !== sun.x, 'snow changes the drive (' + snow.x.toFixed(2) + ' vs ' + sun.x.toFixed(2) + ' m)');

    // braking from the same speed on the flat start: wet brakes longer than dry, snow longer still
    const brake = (sc) => {
      const S = E.newGame(42, 0, sc);
      for (let i = 0; i < 150; i++) E.step(S, 1);
      const x0 = S.x, v0 = S.vx; let n = 0;
      while (S.vx > 0.3 && n < 2000) { E.step(S, -1); n++; }
      return { d: S.x - x0, t: n / 60, v0, dec: v0 / (n / 60) };
    };
    const bs = brake('sun'), br = brake('rain'), bn = brake('snow');
    ok(bs.t < br.t && br.t < bn.t, 'the brake takes longer on a wet road and longer still on snow (' + bs.t.toFixed(2) + ' s, ' + br.t.toFixed(2) + ' s, ' + bn.t.toFixed(2) + ' s)');
    ok(br.d > bs.d * 1.15, 'from about the same speed, the wet road needs over 15% more room to stop (' + bs.d.toFixed(1) + ' m from ' + bs.v0.toFixed(1) + ' m/s, ' + br.d.toFixed(1) + ' m from ' + br.v0.toFixed(1) + ' m/s)');
    ok(bn.dec < bs.dec * 0.6, 'on snow the car slows at under 60% of the dry rate (' + bn.dec.toFixed(1) + ' vs ' + bs.dec.toFixed(1) + ' m/s²)');
    // pulling away: on snow the wheels spin and the car gets less far
    const pull = (sc) => { const S = E.newGame(42, 0, sc); let slip = 0; for (let i = 0; i < 90; i++) { E.step(S, 1); slip += S.wh[0].sp - S.vx; } return { d: S.x - E.START, slip: slip / 90 }; };
    const ps = pull('sun'), pn = pull('snow');
    ok(pn.slip > 2 && ps.slip < 0.5 && pn.d < ps.d * 0.8, 'on snow the wheels spin when pulling away and the car gets less far in 1.5 s (slip ' + pn.slip.toFixed(1) + ' vs ' + ps.slip.toFixed(2) + ' m/s, ' + pn.d.toFixed(2) + ' vs ' + ps.d.toFixed(2) + ' m)');

    // A test player: the engine's driver takes four courses to a 1000 m flag in every scene
    // (night shares sunny's physics, proven above). Its time is the measured band: rain is a
    // little slower than dry and snow clearly slower (measured 2026-11-12: sun 66.4 s, rain
    // 67.0 s, snow 69.7 s on these seeds).
    const pace = {};
    let done = 0, all = 0;
    for (const sc of ['sun', 'rain', 'snow']) {
      let t = 0;
      for (let k = 0; k < 4; k++) {
        const S = E.newGame((k * 2654435761 + 805) >>> 0, 1000, sc);
        while (!S.over && !S.won && S.t < 300) E.step(S, E.botControl(S));
        all++; if (S.won) { done++; t += S.t; }
      }
      pace[sc] = t / 4;
    }
    ok(all === 12 && done === 12, 'the test driver reaches the 1000 m flag on four courses in sunny, rainy and snowy weather (' + done + '/' + all + ')');
    ok(pace.sun < pace.rain && pace.rain < pace.snow && pace.snow > pace.sun * 1.02,
      'its mean time grows with less grip: sunny ' + pace.sun.toFixed(1) + ' s, rain ' + pace.rain.toFixed(1) + ' s, snow ' + pace.snow.toFixed(1) + ' s');

    // save and resume keep the scene; an old save from before the scenes drives on in the sun
    const S1 = run('snow', 200), snap = JSON.parse(JSON.stringify(E.snapshot(S1)));
    const R = E.restore(snap);
    ok(!!R && R.scene === 'snow' && R.mu === E.grip('snow'), 'a saved snowy run comes back snowy');
    delete snap.scene;
    const R2 = E.restore(snap);
    ok(!!R2 && R2.scene === 'sun' && R2.mu === E.grip('sun'), 'a save from before the scenes comes back sunny');

    // the page: behind the gear, saved, the daily always sunny, a grip label in the top row
    ok(/prefs\.scene = E\.sceneOf\(prefs\.scene\)/.test(html) && /C\.ui\.segmented\(\[\{ value: 'sun', label: C\.t\('scSun'\) \}, \{ value: 'snow'[^\]]*value: 'rain'[^\]]*value: 'night'/.test(html) && /ctx\.store\.set\('prefs', prefs\)/.test(html),
      'the scene is picked behind the gear and saved with the other settings');
    const help = (html.match(/function showHelp\(\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    ok(help.length > 0 && !/segmented/.test(help), 'the help holds no options, only the scene rules');
    ok(/E\.newGame\(seedFor\(\), dailyDate \? FINISH : (race \? E\.RACE : )?0, dailyDate \? 'sun' : prefs\.scene(, [^)]*)?\)/.test(html), 'the daily road is sunny for everyone, an endless run takes the chosen scene');
    ok(/if \(S && S\.scene !== 'sun'\) top\.appendChild\(el\('span', \{ class: 'ch-badge hr-grip', text: gripText\(S\.scene\) \}\)\)/.test(html), 'a rainy, snowy or night run shows its grip as a label');
    ok(/weather\(g, Z, P, ppm\)/.test(html) && /clock = now \/ 1000/.test(html) && /C\.ui\.reduceMotion\(\) \? 0 : clock/.test(html) && /nightSky\(g, Z, P\)/.test(html) && /headlamp\(g, P, V\)/.test(html),
      'rain and snow fall with the clock (still when motion is reduced), night has its sky and a headlamp');

    // strings in every language, none named like a core key
    const keys = ['scT', 'scSun', 'scSnow', 'scRain', 'scNight', 'gripSun', 'gripWet', 'gripSnow', 'gripNight', 'dailySun', 'sceneRule'];
    const blocks = LOCALE_CODES.map((l) => { const m = html.match(new RegExp('\\n {6}' + l + ': \\{([\\s\\S]*?)\\n {6}\\}')); return m ? m[1] : ''; });
    ok(LOCALE_CODES.length > 0 && blocks.length === LOCALE_CODES.length && blocks.every((b) => keys.every((k) => new RegExp('\\b' + k + ": '[^']+'").test(b))), 'the scene strings exist in all ' + LOCALE_CODES.length + ' languages');
    ok(keys.every((k) => core.indexOf(k + ':') < 0), 'no scene string reuses a core key name');

    // colours: the HUD digits read on the whole sky of every scene, in light and dark
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lum = (x) => rgb(x).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const cr = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
    let worst = 99, where = '', looks = 0;
    for (const sc of ['snow', 'rain', 'night']) for (const dk of [false, true]) {
      const L = E.look(sc, dk);
      if (!L || !L.text || !L.sky0 || !L.sky1) continue;
      looks++;
      for (const sky of [L.sky0, L.sky1]) { const c = cr(L.text, sky); if (c < worst) { worst = c; where = sc + (dk ? ' dark' : ' light') + ' on ' + sky; } }
    }
    ok(looks === 6 && worst >= 4.5, 'the HUD digits keep 4.5:1 on both ends of every scene\'s sky, light and dark (worst ' + worst.toFixed(2) + ', ' + where + ')');
    ok(E.look('night', false).pedal === 'rgba(255,255,255,' && E.look('night', true).text === E.look('night', false).text, 'night keeps light digits and pedals in both themes');

    const ms = Date.now() - t0;
    ok(ms < 5000, 'the scene tests finish in under 5 s (' + ms + ' ms)');
  }
  return { testHillriderScenes };
};
