'use strict';
// #807: a race against a bot in Hillrider. The bot drives its own car on the same seeded
// course, a ghost with no collisions, to a flag at 1500 m; first there wins. It runs the
// real physics with a controller at three levels set by how it reads the road, and both
// the course and the bot depend only on the seed and the inputs, as the later two-phone
// race in Chogan Plus will need. The solo run must not change at all.
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  function testHillriderRace() {
    head('Hillrider: a race against a bot at three levels (#807)');
    const t0 = Date.now();
    const E = loadEngine('hillrider', 'HillriderEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/hillrider/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const lv = Array.isArray(E.LEVEL_IDS) ? E.LEVEL_IDS.slice() : [];
    ok(JSON.stringify(lv) === '["easy","medium","hard"]' && E.RACE === 1500, 'three bot levels and a race flag at 1500 m (' + lv.join(', ') + '; ' + E.RACE + ')');
    if (lv.length !== 3 || typeof E.levelOf !== 'function') { ok(false, 'the engine has no race to test (E.LEVEL_IDS, E.levelOf)'); return; }
    ok(E.levelOf('nope') === 'medium' && E.levelOf(undefined) === 'medium', 'an unknown level is medium');

    // the solo run is unchanged: the steady driver on the same seed ends where it did before
    // the race (recorded on staging at d2c79d6, 2026-11-12), and the daily course seeds too
    const solo = E.newGame(763, 0);
    for (let i = 0; i < 1200; i++) E.step(solo, E.botControl(solo));
    ok(solo.x.toFixed(6) === '284.690788' && solo.fuel.toFixed(6) === '0.674747', 'a solo run drives exactly as before the race (' + solo.x.toFixed(6) + ' m, fuel ' + solo.fuel.toFixed(6) + ')');
    const daily = [0, 1, 2].map((k) => E.courseSeed((k * 104729 + 20261112) >>> 0, 1000));
    ok(JSON.stringify(daily) === '[20261112,20365841,20470570]', 'the daily course seeds are the same as before (' + daily.join(', ') + ')');

    // the same seed is the same course for the player and the bot: hills, cans and bumps
    const P = E.newGame(807, E.RACE, 'sun', 'buggy'), B = E.newGame(807, E.RACE, 'sun', 'buggy');
    let same = true;
    for (let x = 0; x <= 1600; x += 7) if (E.height(P, x) !== E.height(B, x)) same = false;
    for (let n = 0; n < 8; n++) if (E.fuelAt(P, n) !== E.fuelAt(B, n)) same = false;
    ok(same && JSON.stringify(E.bumps(P, 0, 1500)) === JSON.stringify(E.bumps(B, 0, 1500)), 'the same seed gives the player and the bot the same hills, cans and bumps');
    // a ghost: the bot driving beside the player changes nothing in the player's run
    const lone = E.newGame(807, E.RACE, 'sun', 'buggy');
    for (let i = 0; i < 900; i++) { E.step(P, 1); E.step(B, E.botControl(B, 'hard')); E.step(lone, 1); }
    ok(P.x === lone.x && P.fuel === lone.fuel && JSON.stringify(Object.keys(P.got)) === JSON.stringify(Object.keys(lone.got)), 'the bot never touches the player: the run with the bot beside it is the run without (' + P.x.toFixed(2) + ' m)');
    // each takes its own cans: a can the bot took is still there for the player
    const Bc = E.newGame(807, E.RACE, 'sun', 'buggy'), Pc = E.newGame(807, E.RACE, 'sun', 'buggy');
    while (!Bc.cans && !Bc.over && Bc.t < 120) E.step(Bc, E.botControl(Bc, 'medium'));
    ok(Bc.cans === 1 && !Pc.got.f0 && E.pickups(Pc, 0, 200).some((p) => p.id === 'f0'), 'a can the bot took is still on the player\'s road');
    // the bot depends on the seed and its inputs alone: two bots on one seed drive alike
    const b1 = E.newGame(4242, E.RACE, 'rain', 'jeep'), b2 = E.newGame(4242, E.RACE, 'rain', 'jeep');
    for (let i = 0; i < 1500; i++) { E.step(b1, E.botControl(b1, 'easy')); E.step(b2, E.botControl(b2, 'easy')); }
    ok(b1.x === b2.x && b1.y === b2.y && b1.fuel === b2.fuel, 'two bots on the same seed and level drive the same race (' + b1.x.toFixed(2) + ' m)');

    // The bot at every level finishes the race courses the page deals (E.courseSeed with
    // the level), and the bands are its mean time to the flag over the same raw seeds:
    // measured 2026-11-12 over these three seeds, easy 145.5 s, medium 120.6 s, hard 105.7 s.
    const time = {}, firstTry = {};
    let runs = 0, done = 0;
    for (const l of lv) {
      let t = 0; firstTry[l] = 0;
      for (let k = 0; k < 3; k++) {
        const raw = (k * 2654435761 + 807) >>> 0, seed = E.courseSeed(raw, E.RACE, 12, 'sun', 'buggy', l);
        if (seed === raw) firstTry[l]++;
        const S = E.newGame(seed, E.RACE, 'sun', 'buggy');
        while (!S.over && !S.won && S.t < 600) E.step(S, E.botControl(S, l));
        runs++; if (S.won) { done++; t += S.t; }
      }
      time[l] = t / 3;
    }
    ok(runs === 9 && done === 9, 'the bot reaches the 1500 m flag at every level on every race course (' + done + '/' + runs + '; first seed taken ' + lv.map((l) => firstTry[l]).join('/') + ' of 3)');
    ok(time.easy > time.medium + 10 && time.medium > time.hard + 8,
      'easy is slower than medium and medium slower than hard: ' + lv.map((l) => l + ' ' + time[l].toFixed(1) + ' s').join(', '));
    // and in a slippery scene with a bought car: the hard bot on snow in the racer
    const sn = E.newGame(E.courseSeed(80711, E.RACE, 12, 'snow', 'racer', 'hard'), E.RACE, 'snow', 'racer');
    while (!sn.over && !sn.won && sn.t < 600) E.step(sn, E.botControl(sn, 'hard'));
    ok(sn.won, 'the hard bot finishes a snowy race in the racer (' + sn.t.toFixed(1) + ' s)');

    // the page: race behind the gear with the level, the daily alone, the bot stepped with
    // the player's clock and drawn as a ghost, its time known even when the player crashed
    ok(/C\.ui\.segmented\(\[\{ value: 'solo', label: C\.t\('rcSolo'\) \}, \{ value: 'race', label: C\.t\('rcRace'\) \}\]/.test(html) && /\{ value: 'easy', label: C\.t\('easy'\) \}, \{ value: 'medium', label: C\.t\('medium'\) \}, \{ value: 'hard', label: C\.t\('hard'\) \}/.test(html) && /prefs\.mode = prefs\.mode === 'race' \? 'race' : 'solo'/.test(html),
      'the mode and the bot\'s level are picked behind the gear and saved');
    const help = (html.match(/function showHelp\(\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    ok(help.length > 0 && /C\.t\('rcRule'\)/.test(help) && !/segmented/.test(help), 'the help explains the race and holds no options');
    ok(/race = !dailyDate && prefs\.mode === 'race'/.test(html) && /B = race \? E\.newGame\(S\.seed, E\.RACE, S\.scene, S\.car\) : null/.test(html), 'the daily road has no bot; a race puts the bot on the player\'s seed, car and weather');
    ok(/E\.courseSeed\(Math\.floor\(Math\.random\(\) \* 4294967296\), E\.RACE, 12, prefs\.scene, prefs\.car, raceLv\)/.test(html), 'a race course is one the bot at its level finishes');
    ok(/ev = ev\.concat\(E\.step\(S, control\(\), false, canBuy\(\)\)\);\s*\/\/[^\n]*\n\s*if \(B\) \{ prevB = pose\(B\); E\.step\(B, E\.botControl\(B, raceLv\)\); \}/.test(html), 'the bot takes a step with every step of the player');
    ok(/while \(!B\.won && !B\.over && B\.t < 600\) E\.step\(B, E\.botControl\(B, raceLv\)\)/.test(html) && /var won = mine !== null && \(bots === null \|\| mine < bots\)/.test(html), 'at the end the bot drives on to its flag and the first by the clock wins');
    ok(/roadside\(g, P, x0, x1\);\s*\/\/[^\n]*\n\s*if \(B\) ghost\(g, P, dpr\)/.test(html) && /g\.globalAlpha = 0\.5; g\.drawImage\(ghostCv, 0, 0\)/.test(html), 'the bot is drawn as a see-through ghost');
    ok(/b: B \? E\.snapshot\(B\) : null, lv: raceLv/.test(html) && /S = R; B = RB;/.test(html), 'a saved race comes back with the bot');

    const keys = ['rcT', 'rcSolo', 'rcRace', 'rcBot', 'rcBotM', 'rcWin', 'rcLose', 'rcYou', 'rcBotTime', 'rcBadge', 'rcDaily', 'rcRule'];
    const blocks = LOCALE_CODES.map((l) => { const m = html.match(new RegExp('\\n {6}' + l + ': \\{([\\s\\S]*?)\\n {6}\\}')); return m ? m[1] : ''; });
    ok(LOCALE_CODES.length > 0 && blocks.length === LOCALE_CODES.length && blocks.every((bl) => keys.every((k) => new RegExp('\\b' + k + ": '[^']+'").test(bl))) && blocks.every((bl) => /rcBotM: '[^']*\{n\}/.test(bl) && /rcBadge: '[^']*\{lv\}/.test(bl)), 'the race strings exist in all ' + LOCALE_CODES.length + ' languages');
    ok(keys.every((k) => core.indexOf(k + ':') < 0), 'no race string reuses a core key name');

    const ms = Date.now() - t0;
    ok(ms < 15000, 'the race tests finish in under 15 s (' + ms + ' ms; CI runs about three times slower)');
  }
  return { testHillriderRace };
};
