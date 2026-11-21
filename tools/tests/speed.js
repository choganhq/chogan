'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #957: Speed, the real-time card race against a bot
  function testSpeed() {
    head('Speed (#957)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/speed/index.html');
    // no early return when the page is missing: loadEngine throws and the group fails loudly
    ok(fs.existsSync(file), 'the game page exists');
    const E = loadEngine('speed', 'SpeedEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    // card = rank * 4 + suit; ranks A..K = 0..12
    const card = (r, s) => r * 4 + (s || 0);
    const flat = (R) => [].concat(R.hands[0], R.hands[1], R.piles[0], R.piles[1], R.side[0], R.side[1], R.centre[0], R.centre[1]);
    const clone = (R) => JSON.parse(JSON.stringify(R));
    // a table with chosen cards; the rest of the deck is left out, so validRound is not asked of it
    const mk = (o) => Object.assign({ hands: [[], []], piles: [[], []], side: [[], []], centre: [[card(0)], [card(6)]], winner: -1, flips: 0 }, clone(o));

    // the deal: a property over many seeds
    let deals = 0, badDeal = '';
    for (let s = 1; s <= 300; s++) {
      const R = E.newDeal(rng(s)), all = flat(R);
      deals++;
      if (all.length !== 52 || new Set(all).size !== 52 || all.some((c) => c < 0 || c > 51 || c !== Math.floor(c))) badDeal = badDeal || 'seed ' + s;
      if (R.hands.some((h) => h.length !== 5) || R.piles.some((p) => p.length !== 15) || R.side.some((p) => p.length !== 5) || R.centre.some((p) => p.length !== 1) || !E.validRound(R)) badDeal = badDeal || 'shape at seed ' + s;
    }
    ok(deals === 300 && !badDeal, 'over 300 seeded deals every deal holds 52 distinct cards: 5 in each hand, 15 in each draw pile, 5 in each flip pile, 1 on each centre pile (' + (badDeal || 'all good') + ')');
    ok(flat(E.newDeal(rng(42))).join() === flat(E.newDeal(rng(42))).join() && flat(E.newDeal(rng(42))).join() !== flat(E.newDeal(rng(43))).join(), 'the same seed deals the same cards, so the daily deal is the same for everyone');

    // one rank up or down, and the ace wraps
    ok(E.adj(card(4), card(5, 2)) && E.adj(card(5), card(4)) && !E.adj(card(4), card(6)) && !E.adj(card(4), card(4, 1)), 'a card fits one rank above or below, in any suit, and never on its own rank');
    ok(E.adj(card(0), card(12)) && E.adj(card(12), card(0)) && E.adj(card(0), card(1)) && !E.adj(card(0), card(11)) && !E.adj(card(12), card(10)), 'the ace sits between the king and the two');

    // playing and refilling
    const P = mk({ hands: [[card(1), card(9), card(3), card(10), card(11)], [card(8)]], piles: [[card(2, 3), card(7, 1)], []] });
    ok(E.canPlay(P, card(1), 0) && !E.canPlay(P, card(1), 1) && !E.canPlay(P, card(1), 2) && E.canPlay(P, card(7, 1), 1), 'a move is checked against the pile it goes on');
    ok(E.play(P, 0, card(9), 0) === null && P.hands[0].length === 5 && P.centre[0].length === 1, 'a card that does not fit is refused and nothing moves');
    const drawn = E.play(P, 0, card(1), 0);
    ok(drawn === card(7, 1) && P.hands[0][0] === card(7, 1) && P.hands[0].length === 5 && P.piles[0].length === 1 && E.top(P, 0) === card(1),
      'the played card goes on the centre and the hand refills from the draw pile into the same slot');
    E.play(P, 0, card(7, 1), 1);
    ok(P.hands[0][0] === card(2, 3) && P.piles[0].length === 0, 'the next refill takes the last card of the pile');
    const before = P.hands[0].slice();
    ok(E.play(P, 0, card(3), 1) === null && E.play(P, 0, card(2, 3), 0) === -1 && P.hands[0].length === 4 && P.hands[0].join() === before.slice(1).join(),
      'with the draw pile empty the hand shrinks and the other cards keep their order');

    // winning
    const W = mk({ hands: [[card(1)], [card(8), card(9)]], piles: [[], [card(10)]] });
    E.play(W, 0, card(1), 0);
    ok(W.winner === 0 && E.cardsLeft(W, 0) === 0 && E.cardsLeft(W, 1) === 3, 'playing the last card from hand and pile wins at once');
    ok(!E.canPlay(W, card(8), 1) && E.play(W, 1, card(5), 1) === null && E.playable(W, 1).length === 0, 'after a win nobody can play');
    const W2 = mk({ hands: [[card(1)], [card(8)]], piles: [[card(4)], []] });
    E.play(W2, 0, card(1), 0);
    ok(W2.winner === -1, 'an empty hand with cards still in the draw pile is not a win');

    // stuck detection and the flips
    const S = mk({ hands: [[card(3), card(9)], [card(3, 1), card(9, 1)]], piles: [[card(4, 2)], [card(10, 2)]], side: [[card(11, 1), card(7, 2)], [card(1, 3)]], centre: [[card(0)], [card(6)]] });
    ok(E.stuck(S) && E.playable(S, 0).length === 0 && E.playable(S, 1).length === 0, 'nobody can play: both players are stuck');
    const mS = E.flip(S, rng(1));
    ok(mS === 'side' && E.top(S, 0) === card(7, 2) && E.top(S, 1) === card(1, 3) && S.flips === 1 && S.side[0].length === 1 && S.side[1].length === 0,
      'when stuck, each flip pile turns its top card onto its centre pile');
    const notStuck = mk({ hands: [[card(1)], [card(9)]], piles: [[card(4)], [card(4, 1)]] });
    ok(E.flip(notStuck, rng(1)) === '' && notStuck.flips === 0 && E.top(notStuck, 0) === card(0), 'no flip while someone can still play');
    const S2 = mk({ hands: [[card(3)], [card(9)]], piles: [[card(4)], [card(10)]], side: [[card(11)], []], centre: [[card(0)], [card(6)]] });
    ok(E.stuck(S2) && E.flip(S2, rng(1)) === 'side' && E.top(S2, 0) === card(11) && S2.side[0].length === 0 && E.top(S2, 1) === card(6),
      'with one flip pile empty, both turns come from the other until it runs out');
    const S3 = mk({ hands: [[card(3)], [card(9)]], piles: [[card(11, 1), card(5)], [card(2, 2)]], side: [[], []], centre: [[card(0)], [card(6)]] });
    const m3 = E.flip(S3, rng(1));
    ok(E.stuck(mk({ hands: [[card(3)], [card(9)]], centre: [[card(0)], [card(6)]] })) && m3 === 'own' && E.top(S3, 0) === card(5) && E.top(S3, 1) === card(2, 2) && S3.piles[0].length === 1 && S3.piles[1].length === 0,
      'with the flip piles gone, each player turns their own draw pile\'s top card onto their centre pile');
    const S4 = mk({ hands: [[card(3)], [card(9)]], piles: [[], []], side: [[], []], centre: [[card(6, 1), card(12, 2), card(0)], [card(1, 1), card(6)]] });
    ok(E.stuck(S4), 'the last setup is stuck too');
    const n4 = S4.centre[0].length + S4.centre[1].length;
    const m4 = E.flip(S4, rng(3));
    ok(m4 === 'reshuffle' && S4.centre.every((c) => c.length === 1) && S4.side[0].length + S4.side[1].length + 2 === n4 && new Set(flat(S4)).size === n4 + 2,
      'with every pile gone, the centre cards are shuffled into new flip piles and one card is turned onto each centre pile');

    // the bots: every round ends, and a faster bot wins most races
    const D = E.DELAY;
    ok(D.easy > D.medium && D.medium > D.hard && D.hard >= 1000, 'the levels are the bot\'s reaction times: easy ' + D.easy + ' ms, medium ' + D.medium + ' ms, hard ' + D.hard + ' ms');
    let rounds = 0, unfinished = 0, badEnd = 0, flips = 0, minMs = 1e9, maxMs = 0;
    const tally = {};
    [['medium', 'easy'], ['easy', 'medium']].forEach(([a, b]) => {
      let wins = 0;
      for (let s = 1; s <= 40; s++) {
        const r = E.simulate(rng(1000 + s), [a, b], [D[a], D[b]]);
        rounds++;
        if (r.winner < 0) unfinished++;
        if (r.winner === 0) wins++;
        if (r.winner >= 0 && E.cardsLeft(r.R, r.winner) !== 0) badEnd++;
        if (new Set(flat(r.R)).size !== 52) badEnd++;
        flips += r.flips;
        minMs = Math.min(minMs, r.ms); maxMs = Math.max(maxMs, r.ms);
      }
      tally[a + '-' + b] = wins;
    });
    ok(rounds === 80 && unfinished === 0 && badEnd === 0, 'all ' + rounds + ' seeded bot rounds end with a winner who has no cards left, and the deck stays whole (' + unfinished + ' unfinished)');
    ok(flips > 80, 'the flips that end deadlocks happened (' + flips + ' over the rounds), so termination was not luck');
    ok(tally['medium-easy'] >= 26 && tally['easy-medium'] <= 14, 'the faster bot wins most races: medium beats easy ' + tally['medium-easy'] + '/40 as first player and ' + (40 - tally['easy-medium']) + '/40 as second');
    ok(minMs >= 25000 && maxMs <= 150000, 'a round between bots lasts about a minute or two (' + Math.round(minMs / 1000) + '–' + Math.round(maxMs / 1000) + ' s)');
    // hard is measured by its reaction time against easy (the same timeline); its move choice gets one timed call
    let hardWins = 0;
    for (let s = 1; s <= 30; s++) if (E.simulate(rng(2000 + s), ['hard', 'easy'], [D.hard, D.easy]).winner === 0) hardWins++;
    ok(hardWins >= 22, 'the hard bot beats the easy bot in most races (' + hardWins + '/30)');
    const H = E.newDeal(rng(5));
    while (!E.playable(H, 1).length) E.flip(H, rng(6)) || E.play(H, 0, E.playable(H, 0)[0].c, E.playable(H, 0)[0].i);
    const th = Date.now(), hm = E.botMove(H, 1, 'hard', rng(1)), tookHard = Date.now() - th;
    ok(!!hm && E.canPlay(H, hm.c, hm.i) && tookHard < 50, 'the hard bot picks a legal move in ' + tookHard + ' ms');
    // the hard bot picks the card that leaves the other player the fewest moves
    const B = mk({ hands: [[card(2), card(3)], [card(1, 1), card(11, 1)]], centre: [[card(0)], [card(10)]] });
    const bm = E.botMove(B, 1, 'hard', rng(1));
    ok(E.playable(B, 1).length === 2 && E.botMove(B, 1, 'medium', rng(1)).c === card(1, 1) && !!bm && bm.c === card(11, 1), 'the hard bot prefers the move that leaves the other player nothing, where medium takes the first');

    // saves
    const V = E.newDeal(rng(31));
    const bad = (f) => { const x = clone(V); f(x); return !E.validRound(x); };
    ok(E.validRound(clone(V)) && !E.validRound(null) && bad((x) => { x.hands[0].pop(); }) && bad((x) => { x.hands[1][0] = x.hands[0][0]; }) &&
      bad((x) => { x.centre[0] = []; }) && bad((x) => { x.winner = 4; }) && bad((x) => { x.hands[0].push(x.piles[0].pop()); }) && bad((x) => { x.side = [[]]; }),
      'a save is checked before it is restored (missing or doubled cards, an empty centre, a bad winner, an overfull hand, a broken pile)');

    // the page
    ok(/C\.daily\('speed', daily\)\.rng/.test(html) && /daily \? 'medium'/.test(html) && /C\.stats\.daily\('speed'/.test(html), 'the daily deal is the same for everyone, is played against the medium bot and is recorded');
    ok(/C\.cards\.pace\(E\.DELAY\[M\.level\]/.test(html), 'the card speed setting scales the bot\'s reaction too');
    const ids = ['spd-win', 'spd-hard', 'spd-daily'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bspd: 'speed'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'spd-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'spd-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowLeft/.test(html) && /ArrowRight/.test(html) && /Digit\|Numpad/.test(html) && /direction: ltr/.test(html), 'digits pick a card, the arrows play it left or right, and the table is laid out the same way in every language');
    ok(/setPointerCapture/.test(html) && /will-change: transform/.test(html) && /pointer-events: none/.test(html), 'cards can be dragged, a dragged card has its own layer, and a press always lands on the card');
    ok(/cardSpeed: true/.test(html) && /C\.cards\.backPicker\(\)/.test(html) && /C\.cards\.speedRow\(\)/.test(html) && /C\.ui\.reduceMotion\(\)/.test(html) && /C\.ui\.fly\(/.test(html),
      'the card back picker and the speed setting are the core\'s, and cards fly unless the system asks for less motion');
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 7 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close', 'you'];
    const ownKeys = (langs.fa || '').split(',');
    ok(ownKeys.length > 30 && ownKeys.every((k) => coreKeys.indexOf(k) < 0), 'no game string is named like a core string');
    const used = new Set((html.match(/C\.t\('([A-Za-z0-9]+)'/g) || []).map((x) => x.slice(5, -1)));
    const coreUsed = ['help', 'settings', 'done', 'resetWarn', 'keyboard', 'tutorial', 'dailyDone'];
    const missing = [...used].filter((k) => ownKeys.indexOf(k) < 0 && coreUsed.indexOf(k) < 0);
    ok(used.size > 30 && missing.length === 0, 'every literal key the page asks for is its own or one of the core\'s (' + (missing.join(' ') || 'none missing') + ')');
    const help = (html.match(/function showHelp\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
    ok(/C\.icon\('gear', 20\)/.test(html) && /C\.t\('level'\)/.test(html) && help.length > 0 && !/segmented|level|speedRow/.test(help) && /C\.t\('rules'\)/.test(help),
      'the options (bot level, card speed) sit behind a gear; help holds the rules and the keys');

    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'speed');
    ok(!!gm && gm.cat === 'cards' && gm.people === 1 && list.filter((g) => g.id === 'speed').length === 1 && gm.added === '2026-11-20',
      'Speed is listed once, as a card game for one player');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'speed');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.existsSync(path.join(ROOT, 'www/games/speed/icon.svg')) ? fs.readFileSync(path.join(ROOT, 'www/games/speed/icon.svg'), 'utf8') : '';
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map(lin).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
    };
    const dE = (a, b) => { const P2 = lab(a), Q2 = lab(b); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const nearest = (pool) => gm && pool.length ? pool.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    const sameCat = others.filter((g) => gm && g.cat === gm.cat);
    const nCat = nearest(sameCat), nAll = nearest(others);
    ok(sameCat.length > 5, 'there are other card games to compare the accent with (' + sameCat.length + ')');
    ok(!!gm && nCat[1] >= 15, 'the accent differs from every other card game by ΔE ≥ 15 (nearest ' + nCat[0] + ', ' + (nCat[1] || 0).toFixed(1) + ')');
    ok(!!gm && nAll[1] >= 8, 'the accent differs from every game by ΔE ≥ 8 (nearest ' + nAll[0] + ', ' + (nAll[1] || 0).toFixed(1) + ')');
    ok(!!gm && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0, 'white text on the accent reads at 4.5:1 or more, and the page uses the same accent');
    ok(Date.now() - t0 < 3000, 'the Speed tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testSpeed };
};
