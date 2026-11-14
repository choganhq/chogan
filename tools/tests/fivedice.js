'use strict';
// #886: a solo dice game of 13 rounds, named Five Dice (the original's name is a trademark)
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, LOCALE_CODES } = T;
  function testFiveDice() {
    head('Five Dice (#886)');
    const t0 = Date.now();
    const E = loadEngine('fivedice', 'FiveDiceEngineFactory');
    const html = fs.readFileSync(path.join(ROOT(), 'www/games/fivedice/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(ROOT(), 'www/lib/chogan.js'), 'utf8');

    // every row against values worked out by hand
    const cases = [
      ['ones', [1, 1, 3, 1, 6], 3], ['ones', [2, 3, 4, 5, 6], 0], ['twos', [2, 2, 2, 5, 2], 8], ['threes', [3, 1, 3, 4, 3], 9],
      ['fours', [4, 4, 1, 2, 3], 8], ['fives', [5, 5, 5, 5, 5], 25], ['sixes', [6, 1, 6, 2, 6], 18], ['sixes', [1, 2, 3, 4, 5], 0],
      ['three', [3, 3, 3, 4, 5], 18], ['three', [6, 6, 6, 6, 2], 26], ['three', [2, 2, 4, 4, 6], 0],
      ['four', [5, 5, 5, 5, 1], 21], ['four', [2, 2, 2, 2, 2], 10], ['four', [3, 3, 3, 1, 1], 0],
      ['full', [2, 2, 3, 3, 3], 25], ['full', [6, 1, 6, 1, 6], 25], ['full', [4, 4, 4, 4, 4], 0], ['full', [4, 4, 4, 4, 1], 0], ['full', [1, 1, 2, 2, 3], 0],
      ['small', [1, 2, 3, 4, 6], 30], ['small', [3, 4, 5, 6, 6], 30], ['small', [2, 3, 2, 4, 5], 30], ['small', [1, 2, 3, 5, 6], 0], ['small', [1, 2, 3, 4, 5], 30],
      ['large', [1, 2, 3, 4, 5], 40], ['large', [6, 5, 4, 3, 2], 40], ['large', [1, 2, 3, 4, 6], 0],
      ['yacht', [4, 4, 4, 4, 4], 50], ['yacht', [4, 4, 4, 4, 3], 0],
      ['chance', [1, 2, 3, 4, 5], 15], ['chance', [6, 6, 6, 6, 6], 30]
    ];
    const wrong = cases.filter(([c, d, v]) => E.score(c, d) !== v).map(([c, d, v]) => c + ' ' + d.join('') + ' = ' + E.score(c, d) + ' (want ' + v + ')');
    ok(cases.length === 31 && E.CATS.every((c) => cases.some((x) => x[0] === c)) && !wrong.length,
      'every one of the 13 rows scores the hand-worked value (' + cases.length + ' hands' + (wrong.length ? '; ' + wrong.join(', ') : '') + ')');
    ok(E.CATS.length === 13 && E.ROUNDS === 13 && E.ROLLS === 3 && E.BONUS_AT === 63 && E.BONUS === 35, '13 rows, 13 rounds, 3 rolls, a 35 bonus at 63');
    const sheet = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, three: 0, four: 0, full: 25, small: 30, large: 0, yacht: 50, chance: 22 };
    ok(E.upper(sheet) === 63 && E.bonus(sheet) === 35 && E.total(sheet) === 63 + 35 + 127,
      'three of each face is exactly 63: the bonus is paid and the total adds it (' + E.total(sheet) + ')');
    ok(E.bonus(Object.assign({}, sheet, { ones: 2 })) === 0 && E.total(Object.assign({}, sheet, { ones: 2 })) === 62 + 127, 'one short of 63 earns no bonus');

    // the dice: fair, fixed by the seed, and only rolled when allowed
    const tally = [0, 0, 0, 0, 0, 0, 0];
    for (let s = 0; s < 1000; s++) for (let r = 0; r < 13; r++) for (let i = 0; i < 5; i++) tally[E.die(s * 2654435761 | 0, r, s % 3, i)]++;
    const share = tally.slice(1).map((n) => n / 65000);
    ok(tally[0] === 0 && share.every((p) => p > 0.155 && p < 0.178), 'each face comes up about one time in six (' + share.map((p) => (100 * p).toFixed(1)).join(' / ') + '%)');
    const S = E.newGame(886);
    ok(!E.toggle(S, 0) && E.place(S, 'chance') === null, 'before the first roll no die can be kept and no row filled');
    const r1 = E.roll(S);
    ok(r1 && r1.length === 5 && S.rolls === 1, 'the first roll of a round rolls all five dice');
    const kept = S.dice.slice();
    ok(E.toggle(S, 0) && E.toggle(S, 3) && S.held[0] && S.held[3], 'between rolls, tapping a die keeps it');
    const r2 = E.roll(S);
    ok(r2.join() === '1,2,4' && S.dice[0] === kept[0] && S.dice[3] === kept[3], 'the kept dice stay as they were; only the others roll');
    E.roll(S);
    ok(S.rolls === 3 && E.roll(S) === null && !E.toggle(S, 1), 'after the third roll no roll and no keeping is left');
    const pot = E.potentials(S);
    ok(E.CATS.every((c) => pot[c] === E.score(c, S.dice)), 'every open row shows what the dice would score in it now');
    const pl = E.place(S, 'chance');
    ok(pl && pl.points === S.sheet.chance && S.round === 1 && S.rolls === 0 && S.held.every((h) => !h) && E.place(S, 'chance') === null && E.potentials(S).chance === null,
      'scoring fills the row once, starts the next round and clears the kept dice');
    const A = E.newGame(-12345), B = E.newGame(-12345);
    const play = (G) => { const seen = []; for (let r = 0; r < 13; r++) { E.roll(G); E.toggle(G, r % 5); E.roll(G); seen.push(G.dice.join('')); E.place(G, E.CATS[r]); } return seen.join(' '); };
    const pa = play(A), pb = play(B);
    ok(pa === pb && E.total(A.sheet) === E.total(B.sheet) && play(E.newGame(-12346)) !== pa, 'the same seed and the same choices give the same dice, so the daily game is the same for everyone');
    const R = E.newGame(7); E.roll(R); const d1 = R.dice.join('');
    const R2 = JSON.parse(JSON.stringify(E.newGame(7))); E.roll(R2);
    ok(R2.dice.join('') === d1, 'a reopened game rolls the same dice again, so leaving and coming back never rerolls');

    // a test player: picks what to keep by the expected value of the next roll, and a row by
    // how far the dice beat what that row usually earns
    const BASE = { ones: 2, twos: 5, threes: 8, fours: 11, fives: 14, sixes: 17, three: 15, four: 8, full: 15, small: 18, large: 12, yacht: 8, chance: 22 };
    const worth = (sh, cat, d) => { const v = E.score(cat, d), k = E.CATS.indexOf(cat); return v - BASE[cat] + (k < 6 && v >= 3 * (k + 1) ? 5 : 0); };
    const bestRow = (sh, d) => { let b = null, bv = -1e9; for (const c of E.CATS) if (sh[c] === null) { const v = worth(sh, c, d); if (v > bv) { bv = v; b = c; } } return [b, bv]; };
    const play2 = (G) => {
      for (let r = 0; r < 13; r++) {
        E.roll(G);
        while (G.rolls < 3) {
          // the value of each sorted hand for this sheet, then every keep against every reroll
          const memo = new Map();
          const val = (d) => { const k = d.slice().sort().join(''); if (!memo.has(k)) memo.set(k, bestRow(G.sheet, d)[1]); return memo.get(k); };
          let bm = 31, be = val(G.dice);
          for (let m = 0; m < 31; m++) {
            const free = [0, 1, 2, 3, 4].filter((i) => !(m >> i & 1)), n = Math.pow(6, free.length);
            let s = 0;
            for (let o = 0; o < n; o++) { const d = G.dice.slice(); let x = o; for (const i of free) { d[i] = x % 6 + 1; x = Math.floor(x / 6); } s += val(d); }
            if (s / n > be) { be = s / n; bm = m; }
          }
          if (bm === 31) break;
          for (let i = 0; i < 5; i++) G.held[i] = !!(bm >> i & 1);
          E.roll(G);
        }
        E.place(G, bestRow(G.sheet, G.dice)[0]);
      }
      return G;
    };
    const plain = (G) => { for (let r = 0; r < 13; r++) { E.roll(G); E.place(G, bestRow(G.sheet, G.dice)[0]); } return G; };
    let sumBot = 0, sumPlain = 0, full = 0, honest = 0, bonuses = 0;
    const GAMES = 6;
    for (let g = 1; g <= GAMES; g++) {
      const G = play2(E.newGame(g * 7919)), P = plain(E.newGame(g * 7919));
      if (E.over(G) && E.CATS.every((c) => G.sheet[c] !== null)) full++;
      const recount = E.CATS.reduce((a, c) => a + G.sheet[c], 0) + (E.upper(G.sheet) >= 63 ? 35 : 0);
      if (recount === E.total(G.sheet)) honest++;
      if (E.bonus(G.sheet)) bonuses++;
      sumBot += E.total(G.sheet); sumPlain += E.total(P.sheet);
    }
    const avg = sumBot / GAMES, avgPlain = sumPlain / GAMES;
    ok(full === GAMES && honest === GAMES, 'every bot game fills all 13 rows, and the total is the rows plus the bonus (' + full + '/' + GAMES + ')');
    // measured with these seeds: the bot averages about 190, rolling once and scoring about 120
    ok(avg >= 150 && avg <= 280 && avg > avgPlain + 30, 'the bot reaches a sane total (average ' + avg.toFixed(0) + '), well above rolling once without keeping (' + avgPlain.toFixed(0) + ')');

    // a save is checked before it is restored
    const V = E.newGame(5); E.roll(V); E.place(V, 'sixes');
    ok(E.valid(V) && !E.valid(Object.assign({}, V, { round: 2 })) && !E.valid(Object.assign({}, V, { dice: [1, 2, 3, 4, 7] })) &&
      !E.valid(Object.assign({}, V, { sheet: Object.assign({}, V.sheet, { full: 20 }) })) && !E.valid(Object.assign({}, V, { sheet: Object.assign({}, V.sheet, { twos: 3 }) })) &&
      !E.valid(Object.assign({}, V, { rolls: 4 })) && !E.valid(null), 'a damaged save is refused (round count, die values, impossible row scores, rolls)');

    // the page
    ok(/C\.daily\('fivedice', dailyDate\)\.rng/.test(html) && ['fd-250', 'fd-yacht', 'fd-bonus', 'fd-daily'].every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.indexOf("id: '" + id + "'") > 0) &&
      /fd: 'fivedice'/.test(core), 'the daily game is seeded by the day, and the four awards exist and are unlocked');
    ok(/C\.feedback\('clack'\)/.test(html) && /C\.ui\.fly\(/.test(html) && /C\.ui\.burst\(/.test(html) && /reduceMotion\(\)/.test(html) && !/C\.t\('hint'\)/.test(html),
      'dice clack and tumble in (not in reduced motion), and there is no hint');
    ok(/\.fd-dice \{[^}]*direction: ltr;/.test(html) && /\.fd-die svg \{[^}]*pointer-events: none;/.test(html) && /C\.keyIs\(e, 'r'\)/.test(html),
      'die 1 is the leftmost in every language, so keys 1-5 match the screen, and the picture never takes the tap');
    const blocks = LOCALE_CODES.map((l) => { const m = html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')); return [l, m ? (m[1].match(/\b(fd[A-Za-z0-9]+):/g) || []).map((k) => k.slice(0, -1)) : []]; });
    const en = blocks.find((b) => b[0] === 'en')[1];
    ok(en.length > 40 && blocks.every((b) => b[1].length === en.length && en.every((k) => b[1].indexOf(k) >= 0)),
      'every string is in all ' + LOCALE_CODES.length + ' languages (' + en.length + ' keys)');
    const list = JSON.parse(fs.readFileSync(path.join(ROOT(), 'www/games.json'), 'utf8')).games;
    const gm = list.find((g) => g.id === 'fivedice');
    ok(!!gm && gm.people === 1 && list.filter((g) => g.id === 'fivedice').length === 1 && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'Five Dice is listed once, for one player, named in every language');
    ok(!!gm && !/yahtzee|yatzy|yacht/i.test(JSON.stringify(gm)) && !/yahtzee|yatzy/i.test(html), 'the game is never called by the trademarked name');
    const icon = fs.readFileSync(path.join(ROOT(), 'www/games/fivedice/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') === icon.indexOf('<rect'), 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lum = (x) => rgb(x).map(lin).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, b) => { const P = lab(a), Q = lab(b); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
    const near = list.filter((g) => g.id !== 'fivedice').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 3000, 'the Five Dice tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  function ROOT() { return T.ROOT; }
  return { testFiveDice };
};
