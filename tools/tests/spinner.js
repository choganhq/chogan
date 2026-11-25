'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, LOCALE_CODES } = T;
  // #1106: a party tool, not a game («گردونه» / Wheel): a wheel of names and a score sheet
  function testSpinner() {
    head('Wheel (#1106)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/spinner/index.html');
    // no early return: a missing game must fail here, not skip every check below
    if (!fs.existsSync(file)) throw new Error('www/games/spinner/index.html is missing');
    const html = fs.readFileSync(file, 'utf8');
    const E = loadEngine('spinner', 'SpinnerEngineFactory');
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

    // the wheel: the segment that stops under the pointer is the one that was picked
    let tries = 0, wrong = 0, short = 0, edge = 0;
    for (let n = 2; n <= E.MAX_PLAYERS; n++) {
      for (let k = 0; k < 300; k++) {
        tries++;
        const from = rnd() * 40 - 10, i = E.pick(rnd, n), to = E.target(from, n, i, rnd);
        if (E.indexAt(to, n) !== i) wrong++;
        if (to < from + E.MIN_TURNS * E.TAU) short++;
        // never within a tenth of a segment of its edge, where a reader could doubt it
        const a = (((-to) % E.TAU) + E.TAU) % E.TAU, s = E.TAU / n, f = a / s - Math.floor(a / s);
        if (f < 0.1 || f > 0.9) edge++;
      }
    }
    ok(tries > 5000 && !wrong, 'every spin stops with the picked name under the pointer (' + (tries - wrong) + '/' + tries + ', 2 to ' + E.MAX_PLAYERS + ' names)');
    ok(!short && !edge, 'every spin turns at least ' + E.MIN_TURNS + ' whole times and stops clear of a segment edge');
    ok(E.indexAt(0, 4) === 0 && E.indexAt(-0.1, 4) === 0 && E.indexAt(0.1, 4) === 3 && E.indexAt(-Math.PI / 2 - 0.01, 4) === 1 && E.indexAt(123, 0) === -1, 'with the wheel unturned the first name is just right of the pointer, and turning it clockwise brings the last one under it');
    const counts = [0, 0, 0, 0, 0];
    for (let k = 0; k < 50000; k++) counts[E.pick(rnd, 5)]++;
    ok(counts.every((c) => Math.abs(c - 10000) < 500) && E.pick(() => 0.999999, 5) === 4 && E.pick(() => 0, 5) === 0 && E.pick(rnd, 0) === -1, 'every name is equally likely (' + counts.join(', ') + ' of 50000 over 5 names)');
    ok(E.ease(0) === 0 && E.ease(1) === 1 && E.ease(0.5) > 0.5 && E.ease(2) === 1, 'the spin is fast at first and stops exactly on its target');

    // the sheet: names, rounds and totals
    const S = E.fresh(['Sara', 'Ali', ' ', 'Reza']);
    ok(S.players.length === 3 && same(S.players.map((p) => p.id), [1, 2, 3]) && S.next === 4, 'blank names are skipped and each name gets its own id');
    ok(E.addRound(S) && E.addRound(S) && E.setScore(S, 0, 1, 5) && E.setScore(S, 1, 1, -2) && E.setScore(S, 0, 2, 7) && E.setScore(S, 1, 3, 1.5) && same(E.totals(S), { 1: 3, 2: 7, 3: 1.5 }), 'totals add each player\'s rounds, negatives and halves too');
    ok(same(E.leaders(S), [2]) && same(E.leaders(E.fresh(['a', 'b'])), []), 'the leader is marked once a score is in, and nobody before');
    ok(!E.setScore(S, 5, 1, 1) && !E.setScore(S, 0, 99, 1) && !E.setScore(S, 0, 1, NaN) && !E.setScore(S, 0, 1, 1e9) && E.setScore(S, 0, 1, null) && !(1 in S.rounds[0]), 'a score goes only in a real cell, and null empties it');
    S.last = 2;
    ok(E.removePlayer(S, 2) && S.players.length === 2 && S.rounds.every((r) => !(2 in r)) && S.last === -1 && same(E.totals(S), { 1: -2, 3: 1.5 }), 'removing a name takes its scores along and clears it as the last pick');
    const p = E.addPlayer(S, 'Nima');
    ok(p && p.id === 4 && !E.addPlayer(S, '   ') && E.renamePlayer(S, 4, '  Nima   Jan ') && S.players[2].name === 'Nima Jan' && !E.renamePlayer(S, 4, ''), 'a new name never reuses a removed id; names are trimmed and cannot be emptied');
    const full = E.fresh(Array.from({ length: 30 }, (_, i) => 'p' + i));
    ok(full.players.length === E.MAX_PLAYERS && E.cleanName('x'.repeat(60)).length === E.MAX_NAME, 'at most ' + E.MAX_PLAYERS + ' names of ' + E.MAX_NAME + ' characters');
    const R = E.fresh(['a', 'b']);
    let added = 0;
    while (E.addRound(R)) added++;
    ok(added === E.MAX_ROUNDS && R.rounds.length === E.MAX_ROUNDS, 'at most ' + E.MAX_ROUNDS + ' rounds');
    E.clearScores(R);
    ok(R.rounds.length === 0 && R.players.length === 2, 'clearing the scores keeps the names');

    // what a player types into a cell
    ok(E.parseNum('۱۲') === 12 && E.parseNum('٣٤') === 34 && E.parseNum('−۵') === -5 && E.parseNum('2,5') === 2.5 && E.parseNum('۲٫۵') === 2.5 && E.parseNum(' +7 ') === 7 && E.parseNum('.5') === 0.5, 'Persian, Arabic-Indic and Latin digits, any minus sign and a decimal comma are read');
    ok(E.parseNum('') === null && E.parseNum('  ') === null && Number.isNaN(E.parseNum('x')) && Number.isNaN(E.parseNum('1-2')) && Number.isNaN(E.parseNum('9999999')), 'an empty cell is no score; anything else that is not a number is refused');

    // the sheet comes back from storage, so whatever is stored is cleaned
    const back = E.clean(JSON.parse(JSON.stringify(S)));
    ok(same(back, Object.assign({}, S, { rot: 0 })) || same(back, S), 'a saved sheet reads back as it was');
    ok(same(E.clean(null), E.fresh()) && same(E.clean('x'), E.fresh()) && same(E.clean({ players: 5, rounds: 'y' }), E.fresh()), 'anything stored that is not a sheet gives an empty one');
    const junk = E.clean({ players: [{ id: 1, name: 'a' }, { id: 1, name: 'dup' }, { id: 'x', name: 'b' }, { id: 2, name: '' }, null, { id: 3, name: 'c' }],
      rounds: [{ 1: 4, 3: 'x', 9: 2 }, null, { 3: Infinity }], next: -4, last: 9, rot: 40 });
    ok(same(junk.players, [{ id: 1, name: 'a' }, { id: 3, name: 'c' }]) && same(junk.rounds, [{ 1: 4 }, {}, {}]) && junk.next === 4 && junk.last === -1 && junk.rot >= 0 && junk.rot < E.TAU,
      'a damaged sheet keeps its good names and scores and drops the rest (duplicate ids, bad numbers, unknown players)');

    // games.json, accent, icon
    const games = T.games();
    const gm = games.find((g) => g.id === 'spinner');
    ok(!!gm && gm.daily === false && gm.path === 'games/spinner/index.html' && gm.added === '2026-11-24' && Array.isArray(gm.files) && gm.files.length === 0, 'Wheel is listed with no daily');
    ok(games.filter((g) => g.id === 'spinner').length === 1, 'it is listed once');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]) && gm.name.fa === 'گردونه' && gm.name.en === 'Wheel', 'its name and summary exist in every language');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const P1 = lab(x), Q = lab(y); return Math.hypot(P1[0] - Q[0], P1[1] - Q[1], P1[2] - Q[2]); };
    const lum = (x) => rgb(x).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const others = games.filter((g) => g.id !== 'spinner');
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] || ['none', 99] : ['none', 0];
    ok(!!gm && gm.color === '#846C78' && others.length > 60 && near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("ACCENT = '" + gm.color + "'") > 0 && /accent: ACCENT/.test(html),
      'the accent is ΔE ≥ 15 from every game (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    const hue = (h) => { const [x, y, z] = rgb(h), mx = Math.max(x, y, z), d = mx - Math.min(x, y, z); if (!d) return 0; const q = mx === x ? ((y - z) / d) % 6 : mx === y ? (z - x) / d + 2 : (x - y) / d + 4; return (q * 60 + 360) % 360; };
    const hd = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
    const guarded = others.filter((g) => ['chain', 'ludo', 'gridlock'].includes(g.id));
    ok(!!gm && guarded.length === 3 && guarded.every((g) => hd(hue(g.color), hue(gm.color)) >= 15), 'the hue keeps 15° from the games that guard theirs (' + guarded.map((g) => g.id + ' ' + (gm ? hd(hue(g.color), hue(gm.color)).toFixed(0) : '-') + '°').join(', ') + ')');
    const icon = fs.readFileSync(path.join(ROOT, 'www/games/spinner/icon.svg'), 'utf8');
    ok(!!gm && new RegExp('^<svg[^>]*>\\s*<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>').test(icon.trim()), 'the icon starts on the soft tint of games.json');

    // the page
    ok(/cv\.style\.width = d \+ 'px'/.test(html) && /cv\.style\.height = d \+ 'px'/.test(html) && /cv\.width !== px \|\| cv\.height !== px/.test(html) && /document\.fonts\.ready/.test(html), 'the canvas gets a CSS size (#919), is resized on both sides and redrawn when fonts arrive');
    ok(/function updateTotals\(\)/.test(html) && /tableWrap\.addEventListener\('input'/.test(html) && !/addEventListener\('input'[\s\S]{0,400}buildSheet\(\)/.test(html), 'typing a score updates the totals in place, without rebuilding the sheet under the finger (#750)');
    ok(/C\.onPause\(function \(\) \{ if \(spin\) endSpin\(\); \}\)/.test(html) && /e\.persisted/.test(html), 'leaving mid-spin settles the spin, and a page restored from the cache redraws');
    ok(/ctx\.tutorialIfNew\(TUT\)/.test(html) && !/history\.(push|replace)State|localStorage/.test(html) && !/C\.daily\(|C\.stats\.daily\(|ctx\.finish\(|unlock\(/.test(html), 'a tutorial, no direct storage, no daily, no awards and no result: it is a tool');
    const blockOf = (l) => { const m = html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')); return m ? m[1] : ''; };
    const keys = (s) => [...s.matchAll(/(sw[A-Za-z0-9]+):/g)].map((m) => m[1]).sort();
    const faKeys = keys(blockOf('fa'));
    ok(faKeys.length > 20 && LOCALE_CODES.every((l) => same(keys(blockOf(l)), faKeys)), 'all ' + faKeys.length + ' strings exist in all ' + LOCALE_CODES.length + ' languages');
    const used = [...new Set([...html.matchAll(/C\.t\('(sw[A-Za-z0-9]+)'/g)].map((m) => m[1]))];
    ok(used.length > 15 && used.every((k) => faKeys.includes(k)), 'every string the page asks for is defined (' + used.length + ')');
    ok(LOCALE_CODES.every((l) => /\{name\}/.test((blockOf(l).match(/swTurn: '([^']+)'/) || [])[1] || '')), 'the turn line names the person in every language');

    // CI runs about three times slower than the laptop; keep local time under a third
    const took = Date.now() - t0;
    ok(took < 1000, 'the Wheel tests finish in under 1 s (' + took + ' ms)');
  }
  return { testSpinner };
};
