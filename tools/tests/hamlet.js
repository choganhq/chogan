'use strict';
// #928: a solo dice-and-build game of 12 rounds with its own theme (paths, huts, wells, fields)
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, LOCALE_CODES } = T;
  function testHamlet() {
    head('Hamlet (#928)');
    const t0 = Date.now();
    const E = loadEngine('hamlet', 'HamletEngineFactory');
    const html = fs.readFileSync(path.join(T.ROOT, 'www/games/hamlet/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(T.ROOT, 'www/lib/chogan.js'), 'utf8');

    // a table set up by hand: dice, and how much is already built
    const table = (dice, built) => {
      const S = E.newGame(1);
      S.dice = dice.slice(); S.rolls = 1;
      if (built) Object.assign(S.built, built);
      return S;
    };

    // costs and payment against hand-worked cases
    ok(E.ROUNDS === 12 && E.ROLLS === 3 && E.DICE === 5 && E.KINDS.join() === 'path,hut,well,field', '12 rounds, 3 rolls, 5 dice and four kinds of building');
    ok(E.pay(table([1, 1, 2, 5, 5]), 'path').join() === '0,1,2', 'a path is paid with timber, timber, stone');
    ok(E.pay(table([5, 2, 1, 4, 1]), 'path').slice().sort().join() === '1,2,4', 'the dice are found wherever they lie on the table');
    ok(E.pay(table([1, 1, 5, 5, 4]), 'path') === null, 'one face short and no sun: not payable');
    ok(E.pay(table([1, 1, 6, 5, 4]), 'path').join() === '0,1,2', 'a sun stands in for the missing face');
    ok(E.pay(table([6, 6, 6, 4, 4]), 'path').slice().sort().join() === '0,1,2', 'suns pay for a whole cost');
    ok(E.pay(table([6, 1, 1, 2, 4]), 'path').slice().sort().join() === '1,2,3', 'a sun is kept back when the real face is there');
    ok(E.pay(table([1, 6, 6, 4, 4]), 'path').slice().sort().join() === '0,1,2', 'two suns and one timber pay a path (the suns are the second timber and the stone)');
    ok(E.pay(table([4, 4, 2, 2, 6]), 'well').slice().sort().join() === '0,1,2,3', 'a well is paid with two stones and two water');
    ok(E.pay(table([6, 6, 6, 6, 6]), 'field').length === 4, 'five suns pay a field of four dice');

    // a hut stands on a path
    const h = table([1, 3, 3, 5, 5]);
    ok(!E.canBuild(h, 'hut') && !E.unlocked(h, 'hut'), 'with no path built, a hut cannot be built even with the dice');
    h.built.path = 1;
    ok(E.canBuild(h, 'hut') && E.build(h, 'hut').points === 2 && h.built.hut === 1, 'with one path the first hut is built for 2 points');
    h.dice = [1, 3, 3, 5, 5]; h.used = [false, false, false, false, false];
    ok(!E.canBuild(h, 'hut'), 'the second hut needs a second path');

    // building spends the dice and nothing else
    const b = table([1, 1, 2, 3, 6]);
    const r = E.build(b, 'path');
    ok(r && r.slot === 0 && r.points === 1 && b.used.join() === 'true,true,true,false,false' && b.built.path === 1 && !r.rowDone,
      'a path spends its three dice, scores the first slot and leaves the other two dice');
    ok(E.build(b, 'path') === null && !E.canBuild(b, 'well'), 'the spent dice cannot pay again');
    const empty = E.newGame(1);
    ok(!E.canBuild(empty, 'path') && E.build(empty, 'path') === null, 'nothing can be built before the first roll');

    // points for each slot, the row bonus, the balance bonus and the ceiling
    const sc = (built) => { const S = E.newGame(1); Object.assign(S.built, built); return S; };
    ok(E.total(sc({ path: 3, hut: 2, well: 1, field: 0 })) === 3 + 5 + 3, 'three paths, two huts and a well score 3 + 5 + 3');
    ok(E.total(sc({ path: 6, hut: 0, well: 0, field: 0 })) === 10 + 4, 'a finished path row pays its 4 bonus on top of 10');
    ok(E.total(sc({ path: 2, hut: 2, well: 2, field: 2 })) === 2 + 5 + 7 + 4 + 5, 'two of every kind pays the 5 balance bonus (' + E.total(sc({ path: 2, hut: 2, well: 2, field: 2 })) + ')');
    ok(E.total(sc({ path: 2, hut: 2, well: 1, field: 2 })) === 2 + 5 + 3 + 4, 'a well short of two earns no balance bonus');
    ok(E.total(sc({ path: 6, hut: 4, well: 3, field: 4 })) === 70 && E.MAX === 70, 'everything built scores the ceiling of 70');
    ok(E.total(E.newGame(1)) === 0, 'an empty hamlet scores 0');

    // the dice: fair, fixed by the seed and where they are rolled
    const tally = [0, 0, 0, 0, 0, 0, 0];
    for (let s = 0; s < 1000; s++) for (let q = 0; q < 12; q++) for (let i = 0; i < 5; i++) tally[E.die(s * 2654435761 | 0, q, s % 3, i)]++;
    const share = tally.slice(1).map((n) => n / 60000);
    ok(tally[0] === 0 && share.every((p) => p > 0.155 && p < 0.178), 'each face comes up about one time in six (' + share.map((p) => (100 * p).toFixed(1)).join(' / ') + '%)');
    const S = E.newGame(928);
    ok(!E.toggle(S, 0) && E.endRound(S) === null, 'before the first roll no die can be kept and the round cannot end');
    const r1 = E.roll(S);
    ok(r1 && r1.length === 5 && S.rolls === 1, 'the first roll rolls all five dice');
    const kept = S.dice.slice();
    ok(E.toggle(S, 0) && E.toggle(S, 3) && S.held[0] && S.held[3], 'between rolls, tapping a die keeps it');
    const r2 = E.roll(S);
    ok(r2.join() === '1,2,4' && S.dice[0] === kept[0] && S.dice[3] === kept[3], 'kept dice stay as they were; only the others roll');
    E.roll(S);
    ok(S.rolls === 3 && E.roll(S) === null && !E.toggle(S, 1), 'after the third roll no roll and no keeping is left');
    const sp = table([1, 1, 2, 3, 3]); sp.rolls = 1;
    E.build(sp, 'path');
    const left = sp.dice.slice(); E.roll(sp);
    ok(sp.dice[0] === left[0] && sp.dice[1] === left[1] && sp.dice[2] === left[2], 'a spent die is not rolled again');
    const spentAll = table([6, 6, 6, 6, 6]); spentAll.rolls = 1; spentAll.used = [true, true, true, true, true];
    ok(E.roll(spentAll) === null, 'with every die spent there is nothing left to roll');
    const next = E.endRound(S);
    ok(next && !next.over && S.round === 1 && S.rolls === 0 && S.held.every((x) => !x) && S.used.every((x) => !x), 'ending the round starts the next with the dice free again');
    const A = E.newGame(-12345), B = E.newGame(-12345);
    const play = (G) => { const seen = []; for (let q = 0; q < 12; q++) { E.roll(G); E.toggle(G, q % 5); E.roll(G); seen.push(G.dice.join('')); E.endRound(G); } return seen.join(' '); };
    const pa = play(A);
    ok(pa === play(B) && play(E.newGame(-12346)) !== pa, 'the same seed and the same choices give the same dice, so the daily game is the same for everyone');
    const R = E.newGame(7); E.roll(R); const d1 = R.dice.join('');
    const R2 = JSON.parse(JSON.stringify(E.newGame(7))); E.roll(R2);
    ok(R2.dice.join('') === d1, 'a reopened game rolls the same dice again, so leaving and coming back never rerolls');

    // bots playing whole games by the real rules
    const GAMES = 40;
    const bot = (G, mode) => {
      let guard = 0;
      while (!E.over(G) && guard++ < 500) {
        E.roll(G);
        for (;;) {
          let any = true;
          while (any) {
            any = false;
            const order = mode === 'rows' ? ['path', 'hut', 'well', 'field'] : ['field', 'well', 'hut', 'path'];
            for (const k of order) if (E.canBuild(G, k)) { E.build(G, k); any = true; break; }
          }
          if (G.rolls >= E.ROLLS) break;
          // keep the dice that pay for what is next in the first open row
          if (mode === 'rows') {
            const need = [];
            for (const k of E.KINDS) if (E.room(G, k) && E.unlocked(G, k)) { need.push(...E.PLAN[k].cost); break; }
            for (let i = 0; i < 5; i++) G.held[i] = !G.used[i] && (G.dice[i] === 6 || need.indexOf(G.dice[i]) >= 0);
          }
          if (!E.roll(G)) break;
        }
        E.endRound(G);
      }
      return G;
    };
    let sumGreedy = 0, sumRows = 0, finished = 0, honest = 0, maxSeen = 0, minSeen = 1e9, valid = 0;
    for (let g = 1; g <= GAMES; g++) {
      const G = bot(E.newGame(g * 7919), 'greedy'), P = bot(E.newGame(g * 7919), 'rows');
      if (E.over(G) && E.over(P)) finished++;
      let sum = E.balanced(G) ? 5 : 0;
      for (const k of E.KINDS) { for (let i = 0; i < G.built[k]; i++) sum += E.PLAN[k].pts[i]; if (G.built[k] === E.PLAN[k].pts.length) sum += E.PLAN[k].bonus; }
      if (sum === E.total(G)) honest++;
      if (E.valid(G) || E.over(G)) valid++;
      const t = E.total(G);
      maxSeen = Math.max(maxSeen, t, E.total(P)); minSeen = Math.min(minSeen, t);
      sumGreedy += t; sumRows += E.total(P);
    }
    ok(finished === GAMES && honest === GAMES && valid === GAMES, 'every bot game ends after the 12 rounds, and the total is the slots plus the bonuses (' + finished + '/' + GAMES + ')');
    ok(minSeen >= 0 && maxSeen <= E.MAX, 'no game scores outside 0 and ' + E.MAX + ' (seen ' + minSeen + ' to ' + maxSeen + ')');
    const avg = sumGreedy / GAMES;
    // measured with these seeds: spending whatever the dice allow averages about 33, so the ceiling is out of reach
    ok(avg >= 22 && avg <= 50, 'a spend-as-you-go bot reaches a sane total, far from the ceiling (average ' + avg.toFixed(0) + ')');
    ok(sumRows / GAMES >= 5, 'a bot that holds dice for a plan still builds (average ' + (sumRows / GAMES).toFixed(0) + ')');

    // a save is checked before it is restored
    const V = E.newGame(5); E.roll(V);
    const sv = JSON.parse(JSON.stringify(V));
    ok(E.valid(sv) && !E.valid(Object.assign({}, sv, { round: 12 })) && !E.valid(Object.assign({}, sv, { dice: [1, 2, 3, 4, 7] })) &&
      !E.valid(Object.assign({}, sv, { built: { path: 0, hut: 1, well: 0, field: 0 } })) && !E.valid(Object.assign({}, sv, { built: { path: 9, hut: 0, well: 0, field: 0 } })) &&
      !E.valid(Object.assign({}, sv, { rolls: 4 })) && !E.valid(Object.assign({}, sv, { rolls: 0, used: [true, false, false, false, false] })) && !E.valid(null),
      'a damaged save is refused (round, die values, a hut with no path, row length, rolls, spent dice between rounds)');

    // the page
    ok(/C\.daily\('hamlet', dailyDate\)\.rng/.test(html) && ['hm-big', 'hm-row', 'hm-bal', 'hm-daily'].every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.indexOf("id: '" + id + "'") > 0) &&
      /hm: 'hamlet'/.test(core), 'the daily game is seeded by the day, and the four awards exist and are unlocked');
    ok(/C\.feedback\('clack'\)/.test(html) && /C\.ui\.fly\(/.test(html) && /C\.ui\.burst\(/.test(html) && /reduceMotion\(\)/.test(html),
      'dice clack and tumble in, buildings arrive from the dice (not in reduced motion)');
    ok(/\.hm-dice \{[^}]*/.test(html) && /\.hm-table \{[^}]*direction: ltr;/.test(html) && /\.hm-die svg \{[^}]*pointer-events: none;/.test(html) && /\.hm-row > \* \{ pointer-events: none;/.test(html) && /C\.keyIs\(e, 'r'\)/.test(html),
      'die 1 is the leftmost in every language, so keys 1-5 match the screen, and pictures never take the tap');
    ok(!/\b(catan|settlement|robber)\b/i.test(html + JSON.stringify(core.match(/id: 'hm-[\s\S]*?\},\n/g) || [])), 'no borrowed names in the page or the awards');
    const blocks = LOCALE_CODES.map((l) => { const m = html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')); return [l, m ? (m[1].match(/\b(hm[A-Za-z0-9]+):/g) || []).map((k) => k.slice(0, -1)) : []]; });
    const en = blocks.find((x) => x[0] === 'en')[1];
    ok(en.length > 40 && blocks.every((x) => x[1].length === en.length && en.every((k) => x[1].indexOf(k) >= 0)),
      'every string is in all ' + LOCALE_CODES.length + ' languages (' + en.length + ' keys)');
    const list = JSON.parse(fs.readFileSync(path.join(T.ROOT, 'www/games.json'), 'utf8')).games;
    const gm = list.find((g) => g.id === 'hamlet');
    ok(!!gm && gm.people === 1 && list.filter((g) => g.id === 'hamlet').length === 1 && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]), 'Hamlet is listed once, for one player, named in every language');
    const icon = fs.readFileSync(path.join(T.ROOT, 'www/games/hamlet/icon.svg'), 'utf8');
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') === icon.indexOf('<rect'), 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lum = (x) => rgb(x).map(lin).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, c) => { const P = lab(a), Q = lab(c); return Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]); };
    const near = list.filter((g) => g.id !== 'hamlet').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 3000, 'the Hamlet tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testHamlet };
};
