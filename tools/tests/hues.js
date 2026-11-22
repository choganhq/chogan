'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #1021: Hues, a shedding game of coloured cards against one to three bots
  function testHues() {
    head('Hues (#1021)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/hues/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    if (!fs.existsSync(file)) return;
    const E = loadEngine('hues', 'HuesEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    // a card of colour k: the n-th of its 25 (0 is the zero, 1..18 the numbers, 19..24 the actions)
    const num = (k, v, second) => k * 25 + (v === 0 ? 0 : (v - 1) * 2 + 1 + (second ? 1 : 0));
    const skip = (k) => k * 25 + 19, rev = (k) => k * 25 + 21, two = (k) => k * 25 + 23;
    const WILD = 100, FOUR = 104;
    // a table with chosen hands, top card and stock; every other card goes to the stock
    const mk = (hands, topCard, opts) => {
      opts = opts || {};
      const R = E.newRound(rng(1), hands.length, opts.turn || 0);
      R.hands = hands.map((h) => h.slice());
      const used = new Set([].concat(...hands, [topCard], opts.under || []));
      R.discard = (opts.under || []).concat([topCard]);
      R.stock = opts.stock ? opts.stock.slice() : [];
      if (!opts.stock) for (let c = 0; c < E.SIZE; c++) if (!used.has(c)) R.stock.push(c);
      R.colour = opts.colour !== undefined ? opts.colour : E.colour(topCard);
      R.turn = opts.turn || 0; R.dir = 1; R.drawn = -1; R.passes = 0; R.winner = -1; R.fx = null;
      return R;
    };

    // the deck
    const all = []; for (let c = 0; c < E.SIZE; c++) all.push(c);
    const byVal = (v) => all.filter((c) => E.value(c) === v).length;
    ok(E.SIZE === 108 && byVal(0) === 4 && [1, 2, 3, 4, 5, 6, 7, 8, 9].every((v) => byVal(v) === 8) && byVal(E.SKIP) === 8 && byVal(E.REV) === 8 && byVal(E.TWO) === 8 && byVal(E.WILD) === 4 && byVal(E.FOUR) === 4,
      'the deck has 108 cards: one 0 and two of each 1–9, skip, reverse and draw-two per colour, four wilds and four wild draw-fours');
    ok(num(2, 7) < 75 && E.colour(num(2, 7)) === 2 && E.value(num(2, 7)) === 7 && E.value(num(2, 7, true)) === 7 && E.value(skip(1)) === E.SKIP && E.value(rev(3)) === E.REV && E.value(two(0)) === E.TWO && E.colour(WILD) === -1,
      'a card id tells its colour and its symbol');

    // the deal
    const R3 = E.newRound(rng(7), 3, 1);
    ok(R3.hands.every((h) => h.length === 7) && R3.discard.length === 1 && R3.stock.length === 108 - 22 && E.validRound(R3) && R3.turn === 1,
      'three players get seven cards each, one card is turned up and the rest is the deck');
    let starters = 0;
    for (let s = 1; s <= 300; s++) { const D = E.newRound(rng(s), 4, 0); if (!E.isAction(D.discard[0]) && D.colour === E.colour(D.discard[0])) starters++; }
    ok(starters === 300, 'the first card turned up is always a number card, never an action or a wild (300 deals)');

    // legal plays
    const L = mk([[num(0, 3), num(1, 5), skip(2), WILD, num(3, 9)], [num(1, 1)]], num(1, 9));
    ok(E.legal(L, 0).sort((a, b) => a - b).join() === [num(1, 5), num(3, 9), WILD].sort((a, b) => a - b).join(),
      'a card goes on the same colour or the same symbol, and a wild goes on anything');
    ok(E.play(L, num(0, 3)) === false && E.play(L, skip(2)) === false && L.hands[0].length === 5, 'a card that does not fit is refused and stays in the hand');
    ok(E.play(L, num(3, 9)) && L.colour === 3 && L.turn === 1 && E.top(L) === num(3, 9), 'a card on the same symbol changes the colour in play and passes the turn');
    const Ls = mk([[skip(1), num(2, 4)], [num(1, 1)]], skip(0));
    ok(E.legal(Ls, 0).join() === String(skip(1)), 'an action card goes on the same action of another colour');

    // skip, reverse, draw-two, wilds
    const S = mk([[skip(0), num(0, 1)], [num(0, 2)], [num(0, 3)], [num(0, 4)]], num(0, 5));
    ok(E.play(S, skip(0)) && S.turn === 2 && S.fx && S.fx.skip === 1, 'a skip passes over the next player');
    const Rv = mk([[rev(0), num(0, 1)], [num(0, 2)], [num(0, 3)], [num(0, 4), num(0, 6)]], num(0, 5));
    ok(E.play(Rv, rev(0)) && Rv.dir === -1 && Rv.turn === 3 && Rv.fx.rev, 'a reverse turns the table: the player before plays next');
    ok(E.play(Rv, num(0, 4)) && Rv.turn === 2, 'after a reverse the turns keep going the other way');
    const R2 = mk([[rev(0), num(0, 1)], [num(0, 2)]], num(0, 5));
    ok(E.play(R2, rev(0)) && R2.turn === 0 && R2.fx.skip === 1, 'with two players a reverse acts as a skip: the same player plays again');
    const Tw = mk([[two(2), num(2, 1)], [num(2, 2)], [num(2, 3)]], num(2, 6));
    const before = Tw.stock.length;
    ok(E.play(Tw, two(2)) && Tw.hands[1].length === 3 && Tw.stock.length === before - 2 && Tw.turn === 2 && Tw.fx.hit === 1 && Tw.fx.got.length === 2,
      'a draw-two gives the next player two cards and passes over them');
    const W = mk([[WILD, num(0, 1)], [num(2, 2)]], num(1, 6));
    ok(E.play(W, WILD, 2) && W.colour === 2 && W.turn === 1 && E.legal(W, 1).join() === String(num(2, 2)), 'a wild names the next colour, and only that colour (or a wild) follows');
    const F = mk([[FOUR, num(0, 1)], [num(2, 2)], [num(2, 3)]], num(1, 6));
    ok(E.play(F, FOUR, 3) && F.colour === 3 && F.hands[1].length === 5 && F.turn === 2 && F.fx.got.length === 4, 'a wild draw-four names a colour, gives the next player four cards and passes over them');
    const Fx = mk([[WILD, num(0, 1)], [num(2, 2)]], num(1, 6));
    ok(E.play(Fx, WILD, 9) && Fx.colour === 0, 'a wild with no valid colour named falls back to a real colour');

    // drawing and passing
    const D = mk([[num(0, 1), num(0, 2)], [num(3, 3)]], num(1, 6), { stock: [num(2, 8), num(1, 4)] });
    ok(E.draw(D, rng(1)) === num(1, 4) && D.drawn === num(1, 4) && E.legal(D, 0).join() === String(num(1, 4)), 'with nothing to play the player draws one card, and only that card may be played');
    ok(E.draw(D, rng(1)) === -1 && D.hands[0].length === 3, 'only one card is drawn a turn');
    const Dp = mk([[num(0, 1)], [num(3, 3)]], num(1, 6), { stock: [num(2, 8)] });
    E.draw(Dp, rng(1));
    ok(E.canPass(Dp) && E.pass(Dp) && Dp.turn === 1 && Dp.drawn === -1, 'a drawn card that does not fit is kept and the turn passes');
    const Dn = mk([[num(1, 1), num(0, 2)], [num(3, 3)]], num(1, 6));
    ok(E.draw(Dn, rng(1)) === -1 && !E.canPass(Dn), 'nobody may draw or pass while holding a card that fits');

    // reshuffle
    const under = [num(0, 7), num(2, 2), num(3, 5), skip(3)];
    const Rs = mk([[num(0, 1)], [num(3, 3)]], num(1, 6), { stock: [], under });
    const c = E.draw(Rs, rng(5));
    ok(c >= 0 && under.indexOf(c) >= 0 && Rs.discard.length === 1 && E.top(Rs) === num(1, 6) && Rs.stock.length === 3 && Rs.hands[0].length === 2,
      'when the deck runs out the discards under the top card are shuffled into a new deck, and the top card stays');
    const Rt = mk([[two(1), num(1, 1)], [num(3, 3)]], num(1, 6), { stock: [num(0, 9)], under: [num(2, 4), num(3, 8)] });
    E.play(Rt, two(1));
    ok(Rt.hands[1].length === 3 && Rt.fx.got.length === 2 && Rt.discard.length === 1 && E.top(Rt) === two(1), 'a draw-two also refills the deck from the discards when it runs out mid-draw');
    const B = mk([[num(0, 1)], [num(3, 3)]], num(1, 6), { stock: [] });
    ok(E.canPass(B) && E.pass(B) && B.turn === 1 && E.pass(B) && B.winner === 0 && B.blocked, 'with no deck and no discards to reshuffle, a round everyone passes is won by the lowest hand');

    // the end of a round
    const End = mk([[num(1, 2)], [num(3, 3), WILD], [num(2, 9), skip(0)]], num(1, 6));
    ok(E.play(End, num(1, 2)) && End.winner === 0 && E.roundPoints(End) === 3 + 50 + 9 + 20 && E.play(End, num(3, 3)) === false,
      'the first player out wins the round and scores every card left: numbers their value, actions 20, wilds 50; nothing is played after');
    const EndTwo = mk([[two(1)], [num(3, 3)]], num(1, 6), { stock: [num(0, 4), num(0, 5)] });
    ok(E.play(EndTwo, two(1)) && EndTwo.winner === 0 && EndTwo.hands[1].length === 3 && E.roundPoints(EndTwo) === 12, 'a draw-two played as the last card still hands out its cards, and they count');

    // bots
    const Bw = mk([[WILD, num(2, 1), num(2, 5), num(2, 7)], [num(0, 1), num(0, 2), num(0, 3)]], num(1, 6));
    const bm = E.botMove(Bw, 'medium', rng(1));
    ok(bm.play === WILD && bm.colour === 2, 'with only a wild to play the medium bot names the colour it holds most');
    const Bk = mk([[WILD, num(1, 2), num(1, 8)], [num(0, 1), num(0, 2), num(0, 3)]], num(1, 6));
    ok(E.botMove(Bk, 'medium', rng(1)).play === num(1, 8), 'the medium bot keeps its wild and plays the highest card that fits');
    // a wild draw-four kept for later by the medium bot is thrown at a player about to go out by the hard one
    const Bh = () => mk([[FOUR, num(1, 8), num(2, 2)], [num(0, 1)], [num(0, 2), num(0, 3)]], num(1, 6));
    const hh = E.botMove(Bh(), 'hard', rng(1));
    ok(hh.play === FOUR && hh.colour >= 0 && hh.colour < 4 && E.botMove(Bh(), 'medium', rng(1)).play === num(1, 8),
      'the hard bot hits a player down to one card with a wild draw-four, where the medium bot keeps it');
    const Bs = mk([[skip(1), num(1, 9), num(1, 8), num(1, 7)], [num(0, 1)], [num(0, 2)]], num(1, 6));
    ok(E.botMove(Bs, 'hard', rng(1)).play === skip(1), 'the hard bot passes over a player down to one card with a skip');
    const Bd = mk([[num(0, 1)], [num(0, 2)]], num(1, 6), { stock: [num(3, 3)] });
    ok(E.botMove(Bd, 'easy', rng(1)).draw === true, 'a bot with nothing to play draws');

    // whole games between bots
    const playGame = (seed, n, levels) => {
      const r = rng(seed), scores = new Array(n).fill(0);
      let rounds = 0, turns = 0, okAll = true, first = 0;
      while (Math.max(...scores) < E.TARGET && rounds < 60) {
        const R = E.newRound(r, n, first);
        let t = 0;
        while (R.winner < 0 && t < 3000) {
          const m = E.botMove(R, levels[R.turn], r);
          const p = R.turn, top = E.top(R), col = R.colour;
          if (m.play !== undefined) { if (!E.play(R, m.play, m.colour, r)) { okAll = false; break; } }
          else if (m.draw) { if (E.draw(R, r) < 0) { okAll = false; break; } E.noteShort(R, p, col); }
          else if (!E.pass(R)) { okAll = false; break; }
          if (!E.validRound(R)) { okAll = false; break; }
          void top; t++;
        }
        if (R.winner < 0) { okAll = false; break; }
        scores[R.winner] += E.roundPoints(R);
        turns += t; rounds++; first = (first + 1) % n;
      }
      const winners = scores.filter((s) => s >= E.TARGET).length;
      return { ok: okAll && winners >= 1 && scores.indexOf(Math.max(...scores)) >= 0, rounds, turns, scores };
    };
    const tg = Date.now();
    const runs = [
      playGame(11, 2, ['easy', 'hard']), playGame(12, 3, ['medium', 'easy', 'hard']), playGame(13, 4, ['hard', 'medium', 'easy', 'medium']),
      playGame(14, 4, ['easy', 'easy', 'easy', 'easy']), playGame(15, 3, ['hard', 'hard', 'hard']), playGame(16, 2, ['medium', 'medium'])
    ];
    const gameMs = Date.now() - tg;
    ok(runs.length === 6 && runs.every((g) => g.ok && g.rounds >= 1 && g.rounds < 60),
      'bot games of 2, 3 and 4 players run to the target score with only legal moves and a valid table after each (rounds ' + runs.map((g) => g.rounds).join(' ') + ')');
    ok(gameMs < 1000, 'six bot matches take under a second (' + gameMs + ' ms)');
    let hardWins = 0;
    for (let s = 0; s < 40; s++) {
      const R = E.newRound(rng(500 + s), 2, s % 2), r = rng(900 + s);
      let t = 0;
      while (R.winner < 0 && t++ < 3000) {
        const p = R.turn, col = R.colour, m = E.botMove(R, p === 0 ? 'hard' : 'easy', r);
        if (m.play !== undefined) E.play(R, m.play, m.colour, r); else if (m.draw) { E.draw(R, r); E.noteShort(R, p, col); } else E.pass(R);
      }
      if (R.winner === 0) hardWins++;
    }
    ok(hardWins >= 22, 'the hard bot beats the easy bot in most rounds (' + hardWins + ' of 40)');

    // the same seed deals the same cards: the daily deal
    const a = E.newRound(rng(4242), 3, 0), b = E.newRound(rng(4242), 3, 0), d2 = E.newRound(rng(4243), 3, 0);
    ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(d2), 'the same seed deals the same round, and another seed another one');
    ok(/C\.daily\('hues', M\.daily\)\.rng/.test(html) && /C\.daily\('hues', M\.daily \+ '\|bots'\)\.rng/.test(html), 'the daily deal and the daily bots are seeded from the date, so everyone gets the same game');

    // saves
    const V = E.newRound(rng(31), 3, 0);
    const bad = (f) => { const x = JSON.parse(JSON.stringify(V)); f(x); return !E.validRound(x); };
    ok(E.validRound(JSON.parse(JSON.stringify(V))) && !E.validRound(null) && bad((x) => { x.hands[0].pop(); }) && bad((x) => { x.hands[1][0] = x.hands[0][0]; }) &&
      bad((x) => { x.n = 5; }) && bad((x) => { x.turn = 7; }) && bad((x) => { x.colour = 4; }) && bad((x) => { x.dir = 0; }) && bad((x) => { x.drawn = x.hands[1][0]; }),
      'a save is checked before it is restored (missing or doubled cards, players, turn, colour, direction, a drawn card not in the hand)');
    ok(/ctx\.autosave\(/.test(html) && /ctx\.store\./.test(html) && !/localStorage/.test(html), 'progress is saved through the core, never localStorage directly');

    // the page
    const ids = ['hu-win', 'hu-hard', 'hu-four'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bhu: 'hues'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'hu-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'hu-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowRight/.test(html) && /Enter/.test(html) && /C\.keyIs\(e, 'd'\)/.test(html), 'the arrows pick a card, Enter plays it and D draws');
    ok(/cardSpeed: true/.test(html) && /C\.cards\.speedRow\(\)/.test(html) && /C\.ui\.reduceMotion\(\)/.test(html) && /C\.ui\.fly\(/.test(html),
      'the speed setting is the core\'s, and cards fly unless the system asks for less motion');
    const shapes = ['circle', 'triangle', 'square', 'diamond'];
    ok(shapes.every((s) => html.indexOf("shape: '" + s + "'") > 0), 'every colour has its own shape, so the cards read without colour');
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 10 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const ownKeys = (langs.fa || '').split(',');
    const used = (html.match(/C\.t\('([A-Za-z0-9]+)'/g) || []).map((k) => k.slice(5, -1));
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close'];
    ok(ownKeys.length > 30 && ownKeys.every((k) => coreKeys.indexOf(k) < 0), 'no game string is named like a core string');
    ok(used.length > 20 && used.filter((k) => ownKeys.indexOf(k) >= 0).length > 20, 'the page reads its own strings with literal keys');
    const help = (html.match(/function showHelp\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
    ok(/C\.icon\('gear', 20\)/.test(html) && /C\.t\('rivals'\)/.test(html) && help.length > 0 && !/segmented|rivals/.test(help) && /C\.t\('rules'\)/.test(help),
      'the options (rivals, level) sit behind a gear; help holds the rules and the keys');

    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'hues');
    ok(!!gm && gm.cat === 'cards' && gm.people === 1 && list.filter((g) => g.id === 'hues').length === 1 && gm.added === '2026-11-22',
      'Hues is listed once, as a card game for one player on the phone');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'hues');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.existsSync(path.join(ROOT, 'www/games/hues/icon.svg')) ? fs.readFileSync(path.join(ROOT, 'www/games/hues/icon.svg'), 'utf8') : '';
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (q) => q <= 0.04045 ? q / 12.92 : Math.pow((q + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map(lin).reduce((s, q, i) => s + q * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (x, y) => { const P2 = lab(x), Q2 = lab(y); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const nearest = (set) => gm && set.length ? set.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    const nCards = nearest(others.filter((g) => g.cat === 'cards')), nAll = nearest(others);
    ok(!!gm && nCards[1] >= 15 && nAll[1] >= 8 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs by ΔE ≥ 15 from every card game (nearest ' + nCards[0] + ', ' + (nCards[1] || 0).toFixed(1) + ') and ≥ 8 from all others (nearest ' + nAll[0] + ', ' + (nAll[1] || 0).toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 3000, 'the Hues tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testHues };
};
