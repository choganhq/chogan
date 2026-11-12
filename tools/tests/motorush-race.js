'use strict';
// #816: a Moto Rush race against a bot rider. The rival rides its own copy of the same
// road and must be able to finish it on every level, the levels must really differ, a
// rider who uses the gas must be able to beat it and one who never does must lose, the
// daily stays a solo ride, and a save carries the rival or is refused.
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  const LIMIT_MS = 30000;
  async function testMotoRushRace() {
    head('Moto Rush: a race against a bot rider (#816)');
    const t0 = Date.now();
    let timer = null;
    const hang = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), LIMIT_MS); });
    const res = await Promise.race([body().then(() => 'done', (e) => 'threw: ' + (e && e.message)), hang]);
    clearTimeout(timer);
    ok(res === 'done', 'the race tests finished before the ' + (LIMIT_MS / 1000) + ' s guard (' + res + ')');
    const ms = Date.now() - t0;
    ok(ms < 9000, 'the race tests finish in under 9 s (' + ms + ' ms)');
  }
  const tick = () => new Promise((r) => setImmediate(r));

  async function body() {
    const E = loadEngine('motorush', 'MotoRushEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/motorush/index.html'), 'utf8');
    const LEVELS = ['easy', 'medium', 'hard'];
    const hasRace = typeof E.botDrive === 'function' && E.RACE_P > 0 && !!E.BOTS;
    ok(hasRace, 'the engine has a race: a goal distance, bot levels and a bot driver');

    const S0 = E.fromSeed(816, false, 'hard', 'sunny', 'gale', true);
    ok(!!S0.rival && S0.race === 'hard' && S0.rival.bike === 'courier' && S0.rival.diff === 'hard', 'a race ride carries a rival on the courier at the ride\'s difficulty');
    ok(!!S0.rival && JSON.stringify(S0.rival.waves) === JSON.stringify(S0.waves), 'the rival rides the same traffic as the player');
    ok(!E.fromSeed(816, true, 'hard', 'sunny', 'courier', true).rival && !E.fromSeed(816, false, 'hard').rival, 'the daily and an endless ride have no rival');

    // the bot alone, 6 seeds per level: it always finishes, and the levels are ordered
    const times = {};
    let botCrash = 0;
    for (const lv of LEVELS) {
      times[lv] = [];
      for (let sd = 1; sd <= 6 && hasRace; sd++) {
        const R = E.fromSeed(sd * 7777, false, lv, 'sunny', 'courier', true).rival;
        let t = 0;
        while (R && !R.over && t < 60 * 400) { E.botDrive(R); E.step(R); R.ev = []; t++; }
        if (!R || !R.won) botCrash++;
        times[lv].push(t / 60);
        await tick();
      }
    }
    const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
    ok(botCrash === 0, 'the bot finishes 3 km on every level and seed without a crash (' + botCrash + ' crashes)');
    const ae = avg(times.easy), am = avg(times.medium), ah = avg(times.hard);
    ok(ae > am * 1.2 && am > ah * 1.1, 'a harder bot is clearly faster: easy ' + ae.toFixed(0) + ' s, medium ' + am.toFixed(0) + ' s, hard ' + ah.toFixed(0) + ' s');

    // a test rider: reacts in 0.35 s, with or without the gas held
    function rider(S, gas) {
      let wait = 0, cur = null; E.gas(S, gas);
      for (let i = 0; i < 60 * 400 && !S.over; i++) {
        const rear = S.p - E.BIKE_L, w = S.waves.find((x) => x.y + x.span > rear);
        if (w && w !== cur) { if (cur) wait = Math.ceil(0.35 / E.DT); cur = w; }
        if (wait > 0) wait--; else if (cur && S.tl !== cur.f) E.steer(S, cur.f > S.tl ? 1 : -1);
        E.step(S); E.drain(S);
      }
      return S;
    }
    let wins = 0, losses = 0, rivalEv = 0, n = 0;
    for (const lv of LEVELS) {
      for (let sd = 1; sd <= 3 && hasRace; sd++) {
        const A = E.fromSeed(sd * 911, false, lv, 'sunny', 'courier', true);
        rider(A, true);
        if (A.won && !A.lost) wins++;
        const B = E.fromSeed(sd * 911, false, lv, 'sunny', 'courier', true);
        let seen = false;
        E.gas(B, false);
        for (let i = 0; i < 60 * 400 && !B.over; i++) {
          const rear = B.p - E.BIKE_L, w = B.waves.find((x) => x.y + x.span > rear);
          if (w && B.tl !== w.f) E.steer(B, w.f > B.tl ? 1 : -1);
          E.step(B);
          if (B.ev.some((e) => e.t === 'rivalWin')) seen = true;
          E.drain(B);
        }
        if (B.lost && !B.won && B.over) losses++;
        if (seen) rivalEv++;
        n++;
        await tick();
      }
    }
    ok(n === 9 && wins === n, 'a rider who holds the gas beats the bot on every level (' + wins + '/' + n + ')');
    ok(n === 9 && losses === n && rivalEv === n, 'a rider who never uses the gas loses, and the loss is announced (' + losses + '/' + n + ')');

    // save and restore
    const mid = E.fromSeed(42, false, 'medium', 'rainy', 'thunder', true);
    for (let i = 0; i < 600 && hasRace; i++) E.step(mid);
    const snap = E.snapshot(mid), back = E.restore(JSON.parse(JSON.stringify(snap)));
    ok(!!back && !!back.rival && back.rival.p === mid.rival.p && back.race === 'medium' && back.rival.bot && back.rival.bot.f === mid.rival.bot.f, 'a save of a race keeps the rival where it was');
    const broken = (fn) => { const o = JSON.parse(JSON.stringify(snap)); fn(o); return E.restore(o); };
    ok(broken((o) => { delete o.rival; }) === null && broken((o) => { o.race = 'insane'; }) === null && broken((o) => { delete o.rival.bot; }) === null && broken((o) => { o.rival.p = 'x'; }) === null && broken((o) => { o.daily = true; }) === null, 'a race save with a missing or broken rival is refused');
    ok(!!E.restore(E.snapshot(E.fromSeed(42, false, 'medium'))), 'an endless save still restores');

    // page
    const keys = ['modeL', 'modeRide', 'modeRace', 'raceHint', 'raceWin', 'raceLose', 'raceTag', 'rivalAhead', 'rivalBehind'];
    const missing = [];
    for (const code of LOCALE_CODES) {
      const m = html.match(new RegExp('\\n {6}' + code + ': \\{([\\s\\S]*?)\\n {6}\\}'));
      for (const k of keys) if (!m || !new RegExp('\\b' + k + ': \'').test(m[1])) missing.push(code + '.' + k);
    }
    ok(LOCALE_CODES.length >= 7 && missing.length === 0, 'the race strings exist in all ' + LOCALE_CODES.length + ' languages' + (missing.length ? ' (missing ' + missing.slice(0, 6).join(', ') + ')' : ''));
    const help = (html.match(/function showHelp\(\)[\s\S]*?\n {2}\}/) || [''])[0];
    ok(/C\.ui\.segmented\(\[\{ value: 'ride'[\s\S]*?value: 'race'/.test(html) && !/modeRace/.test(help), 'the race is picked behind the gear, not in the help');
    ok(/!dailyDate && prefs\.mode === 'race'/.test(html), 'the page starts a race only outside the daily');
    ok(/e\.t === 'rivalWin'/.test(html) && /C\.t\('raceLose'\)/.test(html) && /function ghost\(/.test(html), 'the page ends the ride when the rival wins and draws the rival');
  }
  return { testMotoRushRace };
};
