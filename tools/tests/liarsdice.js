'use strict';
// #949: Liar's Dice, a bluffing dice game against 1-5 bots (never called by a trademarked name)
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, LOCALE_CODES } = T;
  function testLiarsDice() {
    head('Liar\'s Dice (#949)');
    const t0 = Date.now();
    // a missing folder throws here, which stops the whole run instead of skipping the group
    const E = loadEngine('liarsdice', 'LiarsDiceEngineFactory');
    const html = fs.readFileSync(path.join(T.ROOT, 'www/games/liarsdice/index.html'), 'utf8');
    const core = fs.readFileSync(path.join(T.ROOT, 'www/lib/chogan.js'), 'utf8');

    // raises, against values worked out by hand (prev, q, f, legal)
    const B = (q, f) => ({ q, f, p: 1 });
    const cases = [
      [null, 1, 2, true], [null, 3, 6, true], [null, 2, 1, false], [null, 0, 3, false], [null, 21, 3, false],
      [B(3, 4), 3, 5, true], [B(3, 4), 3, 4, false], [B(3, 4), 3, 3, false], [B(3, 4), 4, 2, true], [B(3, 4), 2, 6, false],
      [B(3, 4), 2, 1, true], [B(3, 4), 1, 1, false], [B(4, 4), 2, 1, true], [B(5, 6), 3, 1, true], [B(5, 6), 2, 1, false],
      [B(2, 1), 5, 3, true], [B(2, 1), 4, 6, false], [B(2, 1), 3, 1, true], [B(2, 1), 2, 1, false], [B(3, 1), 7, 2, true], [B(3, 1), 6, 6, false],
      [B(6, 6), 7, 2, true], [B(6, 6), 6, 6, false], [B(3, 4), 3.5, 5, false], [B(3, 4), 3, 7, false]
    ];
    const wrong = cases.filter(([p, q, f, want]) => E.validBid(p, q, f, 20) !== want).map(([p, q, f, want]) => (p ? p.q + '×' + p.f : 'open') + ' → ' + q + '×' + f + ' (want ' + want + ')');
    ok(!wrong.length, 'every raise is judged as worked out by hand, ones wild: onto ones half rounded up, off ones double plus one (' + cases.length + ' cases' + (wrong.length ? '; ' + wrong.join(', ') : '') + ')');
    ok(E.minRaise(B(3, 4), 5, 20) === 3 && E.minRaise(B(3, 4), 2, 20) === 4 && E.minRaise(B(3, 4), 1, 20) === 2 && E.minRaise(B(2, 1), 6, 20) === 5 &&
      E.minRaise(B(2, 1), 1, 20) === 3 && E.minRaise(null, 1, 20) === null && E.minRaise(B(20, 6), 6, 20) === null,
      'the stepper\'s smallest legal count per face matches the rules, and is null where no raise is left');
    ok(E.matches(1, 4) && E.matches(4, 4) && !E.matches(1 + 1, 4) && E.matches(1, 1) && !E.matches(4, 1), 'a one counts toward any face, and a bid on ones counts only ones');

    // the dice: fair and fixed by the seed
    const tally = [0, 0, 0, 0, 0, 0, 0];
    for (let s = 0; s < 800; s++) for (let r = 0; r < 4; r++) for (let p = 0; p < 6; p++) for (let i = 0; i < 5; i++) tally[E.die(s * 2654435761 | 0, r, p, i)]++;
    const share = tally.slice(1).map((n) => n / 96000);
    ok(tally[0] === 0 && share.every((x) => x > 0.155 && x < 0.178), 'each face comes up about one time in six (' + share.map((x) => (100 * x).toFixed(1)).join(' / ') + '%)');
    const G = E.newGame({ seed: 949, bots: 3, level: 2 });
    ok(G.n === 4 && G.counts.join() === '5,5,5,5' && G.dice.every((c) => c.length === 5) && E.total(G) === 20 && G.turn === 0 && G.phase === 'bid',
      'a new game: you and three bots, five dice each, you open');
    ok(E.newGame({ bots: 9 }).n === 6 && E.newGame({ bots: 1 }).n === 2 && E.newGame({}).n === 4 && E.newGame({ level: 7 }).level === 2, 'one to five bots (three by default), and a level outside 1-3 falls back to medium');
    ok(E.bid(G, 2, 1) === null && E.call(G, 'liar') === null && G.hist.length === 0, 'no round opens on ones, and nothing can be called before a bid');

    // calls, both ways, on a cup we set ourselves
    const fixed = (dice, bidQ, bidF, exact) => {
      const S = E.newGame({ seed: 1, bots: 2, level: 2, exact: !!exact });
      S.dice = dice; S.counts = dice.map((c) => c.length);
      E.bid(S, bidQ, bidF); // player 0 bids, player 1 calls
      return S;
    };
    const cups = [[1, 4, 4, 2, 6], [4, 3, 3, 5, 5], [1, 1, 2, 2, 6]];
    let S = fixed(cups, 5, 4); // fours: 4,4 + 1 + 4 + 1,1 = 6 → bid of 5 stands
    ok(E.countFace(S, 4) === 6 && E.countFace(S, 1) === 3, 'counting with wild ones (six fours, three ones)');
    let L = E.call(S, 'liar');
    ok(L && L.caller === 1 && L.bidder === 0 && L.actual === 6 && !L.right && L.loser === 1 && S.counts.join() === '5,4,5' && S.starter === 1 && S.phase === 'reveal',
      'a Liar! call on a bid that holds costs the caller a die, and the caller opens the next round');
    S = fixed(cups, 7, 4); L = E.call(S, 'liar');
    ok(L && L.right && L.loser === 0 && S.counts.join() === '4,5,5' && S.starter === 0, 'a Liar! call on a bid that is short costs the bidder a die');
    S = fixed(cups, 6, 4); L = E.call(S, 'liar');
    ok(L && !L.right && L.actual === L.q && L.loser === 1, 'a bid exactly right holds against Liar!');
    ok(E.call(fixed(cups, 6, 4), 'exact') === null, 'the exact call is refused while the option is off');
    S = fixed(cups, 6, 4, true);
    L = E.call(S, 'exact');
    ok(L && L.kind === 'exact' && L.right && L.loser === -1 && L.gainer === -1 && S.counts.join() === '5,5,5', 'an exact call that is right with a full cup costs nobody a die and gains none past five');
    S = fixed([[1, 4, 4, 2, 6], [4, 3, 3, 5], [1, 1, 2, 2, 6]], 6, 4, true); L = E.call(S, 'exact');
    ok(L && L.right && L.gainer === 1 && S.counts.join() === '5,5,5', 'an exact call that is right gives the caller a die back');
    S = fixed(cups, 4, 4, true); L = E.call(S, 'exact');
    ok(L && !L.right && L.loser === 1 && S.counts.join() === '5,4,5', 'an exact call that is wrong costs the caller a die');
    ok(E.nextRound(S) && S.round === 1 && S.phase === 'bid' && S.dice[1].length === 4 && S.bid === null && S.turn === S.starter, 'the next round rerolls every cup at its new size');

    // elimination and the winner
    S = fixed([[2], [3], [5, 5]], 1, 6); // bidder 0 says one six; there is none
    L = E.call(S, 'liar');
    ok(L.loser === 0 && S.counts[0] === 0 && S.out.join() === '0' && S.starter === 1 && S.phase === 'reveal' && E.living(S).join() === '1,2',
      'a player at zero dice is out, and the next one in line opens');
    E.nextRound(S);
    ok(E.nextAlive(S, 2) === 1 && S.dice[0].length === 0, 'an eliminated player is skipped and rolls no dice');
    S.dice = [[], [3], [5, 5]]; S.turn = 1; S.bid = null; S.hist = [];
    E.bid(S, 2, 3); L = E.call(S, 'liar');
    ok(L.loser === 1 && E.winner(S) === 2 && S.phase === 'over' && !E.nextRound(S), 'the last player with dice wins, and the game is over');

    // bots: decide from their own view only, and always legally
    const H = E.newGame({ seed: 4242, bots: 4, level: 3 });
    E.apply(H, { type: 'bid', q: 3, f: 5 });
    const a1 = JSON.stringify(E.botMove(H));
    const H2 = JSON.parse(JSON.stringify(H));
    for (let p = 0; p < H2.n; p++) if (p !== H2.turn) H2.dice[p] = H2.dice[p].map((v) => v % 6 + 1).sort();
    ok(a1 === JSON.stringify(E.botMove(H2)), 'a bot plays the same move whatever the other cups hold');
    const actSrc = html.slice(html.indexOf('function act('), html.indexOf('function botMove('));
    ok(actSrc.length > 500 && !/\bS\.dice\b|\.seed\b/.test(actSrc), 'the bots\' code reads a view (own cup, counts, bids), never the table\'s dice or the seed');
    const vw = E.view(H, 2);
    ok(!('dice' in vw) && !('seed' in vw) && vw.hand.join() === H.dice[2].join(), 'a view carries only the player\'s own cup');
    let illegal = 0, moves = 0;
    for (let lv = 1; lv <= 3; lv++) {
      for (let g = 0; g < 30; g++) {
        const X = E.newGame({ seed: g * 7919 + lv, bots: 1 + g % 5, level: lv, exact: g % 2 === 0 });
        for (let k = 0; k < 4 && X.phase === 'bid'; k++) {
          const v = E.view(X, X.turn), a = E.act(v, lv, E.rngFor(X));
          moves++;
          const legal = a.type === 'bid' ? E.validBid(X.bid, a.q, a.f, E.total(X)) : a.type === 'liar' ? !!X.bid : (a.type === 'exact' && X.exact && !!X.bid);
          if (!legal) illegal++;
          E.apply(X, a);
        }
      }
    }
    ok(moves > 200 && illegal === 0, 'every level answers with a legal move of its own accord (' + moves + ' moves, ' + illegal + ' illegal)');

    // whole games, bots only, at every level
    const playOut = (o) => {
      const X = E.newGame(o); let steps = 0, rounds = 0;
      while (X.phase !== 'over' && steps < 3000) {
        if (X.phase === 'reveal') { E.nextRound(X); rounds++; } else if (!E.apply(X, E.botMove(X))) return null;
        steps++;
      }
      return X.phase === 'over' ? { X, steps, rounds } : null;
    };
    let done = 0, sane = 0, roundSum = 0, wins = 0;
    const GAMES = 60;
    for (let g = 0; g < GAMES; g++) {
      const r = playOut({ seed: 1000 + g, bots: 1 + g % 5, level: 1 + g % 3, exact: g % 4 === 0 });
      if (!r) continue;
      done++; roundSum += r.rounds;
      if (E.living(r.X).length === 1 && r.X.counts[E.winner(r.X)] > 0 && r.X.out.length === r.X.n - 1) sane++;
    }
    ok(done === GAMES && sane === GAMES, 'every bot-only game finishes with one player left and everyone else out (' + done + '/' + GAMES + ')');
    // a hard player 0 against easy bots: measured 0.72 with 200 games, easy against medium 0.04
    const winRate = (me, them, N) => {
      let w = 0;
      for (let g = 0; g < N; g++) {
        const X = E.newGame({ seed: 5000 + g, bots: 3, level: them });
        let steps = 0;
        while (X.phase !== 'over' && steps < 3000) {
          if (X.phase === 'reveal') E.nextRound(X);
          else { X.level = X.turn === 0 ? me : them; E.apply(X, E.botMove(X)); }
          steps++;
        }
        if (E.winner(X) === 0) w++;
      }
      return w / N;
    };
    const hiLo = winRate(3, 1, 60), loMid = winRate(1, 2, 60);
    ok(hiLo > 0.45 && loMid < 0.2, 'the levels differ: a hard player beats three easy bots often (' + hiLo.toFixed(2) + '), an easy one rarely beats medium bots (' + loMid.toFixed(2) + ')');
    wins = Math.round(roundSum / GAMES);
    ok(wins >= 6 && wins <= 30, 'a game lasts a sensible number of rounds (average ' + wins + ')');

    // the daily game: the same cups and bot moves for everyone
    const trace = (seed) => { const X = E.newGame({ seed, bots: 3, level: 2 }); const t = []; let s = 0; while (X.phase !== 'over' && s < 3000) { if (X.phase === 'reveal') E.nextRound(X); else t.push(JSON.stringify(E.apply(X, E.botMove(X)))); s++; } return t.join('|') + X.dice.join(); };
    ok(trace(-778899) === trace(-778899) && trace(-778899) !== trace(-778898), 'the same seed plays the same game, so the daily game is the same for everyone');
    ok(/C\.daily\('liarsdice', dailyDate\)\.rng/.test(html) && /DAILY = \{ ?bots: 3, level: 2, exact: false ?\}/.test(html),
      'the daily game is seeded by the day, against three medium bots, with no exact call');

    // saves
    const V = E.newGame({ seed: 77, bots: 3, level: 2 });
    E.apply(V, { type: 'bid', q: 2, f: 3 }); E.apply(V, E.botMove(V));
    const Vj = JSON.parse(JSON.stringify(V));
    const R = playOut({ seed: 31, bots: 2, level: 2 });
    const W = E.newGame({ seed: 12, bots: 2, level: 2 }); E.apply(W, { type: 'bid', q: 2, f: 3 }); E.call(W, 'liar');
    const Wj = JSON.parse(JSON.stringify(W));
    ok(E.valid(Vj) && E.valid(Wj) && E.valid(JSON.parse(JSON.stringify(R.X))), 'a game in the middle of bidding, at a reveal and at the end all reopen');
    const bad = [
      null, Object.assign({}, Vj, { n: 9 }), Object.assign({}, Vj, { counts: [5, 5, 5, 6] }), Object.assign({}, Vj, { level: 4 }),
      Object.assign({}, Vj, { dice: Vj.dice.map((c, p) => p === 1 ? [6, 6, 6, 6, 6] : c) }), Object.assign({}, Vj, { phase: 'nope' }),
      Object.assign({}, Vj, { hist: [[0, 2, 3], [1, 1, 3]] }), Object.assign({}, Vj, { turn: 8 }), Object.assign({}, Wj, { last: null }),
      Object.assign({}, Vj, { counts: [0, 0, 0, 5] })
    ];
    ok(bad.every((x) => !E.valid(x)), 'a damaged save is refused (sizes, counts, level, edited cups, phase, bid history, turn, a reveal without its call, one player left mid-game)');
    ok(/E\.valid\(saved\)/.test(html) && /ctx\.autosave\(/.test(html) && /ctx\.finish\(/.test(html), 'the page checks a save before reopening it, saves as it goes and ends through the core');

    // the page
    ok(['ld-win', 'ld-hard', 'ld-edge', 'ld-daily'].every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.indexOf("id: '" + id + "'") > 0) && /ld: 'liarsdice'/.test(core),
      'the four awards exist and are unlocked');
    ok(/C\.feedback\('clack'\)/.test(html) && /C\.ui\.fly\(/.test(html) && /C\.ui\.burst\(/.test(html) && /reduceMotion\(\)/.test(html),
      'cups rattle, dice fly in and a regained die bursts, all honouring reduced motion');
    ok(/\.ld-fb \{[^}]*min-height: 48px/.test(html) && /\.ld-acts \.ch-btn \{[^}]*min-height: 54px/.test(html) && /C\.keyIs\(e, 'l'\)/.test(html),
      'face buttons are at least 44 px, Bid and Liar! are big, and L calls from the keyboard');
    const blocks = LOCALE_CODES.map((l) => { const m = html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')); return [l, m ? (m[1].match(/\b(ld[A-Za-z0-9]+):/g) || []).map((k) => k.slice(0, -1)) : []]; });
    const en = blocks.find((b) => b[0] === 'en')[1];
    ok(en.length > 40 && blocks.every((b) => b[1].length === en.length && en.every((k) => b[1].indexOf(k) >= 0)),
      'every string is in all ' + LOCALE_CODES.length + ' languages (' + en.length + ' keys)');
    const list = JSON.parse(fs.readFileSync(path.join(T.ROOT, 'www/games.json'), 'utf8')).games;
    const gm = list.find((g) => g.id === 'liarsdice');
    ok(!!gm && gm.people === 1 && gm.cat === 'board' && list.filter((g) => g.id === 'liarsdice').length === 1 && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l]),
      'Liar\'s Dice is listed once, under board games, for one player, named in every language');
    ok(!!gm && !/perudo|dudo/i.test(JSON.stringify(gm)) && !/perudo/i.test(html), 'the game is never called by a trademarked name');
    const icon = fs.readFileSync(path.join(T.ROOT, 'www/games/liarsdice/icon.svg'), 'utf8');
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
    const near = list.filter((g) => g.id !== 'liarsdice').map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0];
    ok(near[1] >= 15 && 1.05 / (lum(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: ACCENT") > 0 && html.indexOf("ACCENT = '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + near[1].toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 3000, 'the Liar\'s Dice tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testLiarsDice };
};
