'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #1068: Koi-Koi, the Japanese hanafuda game, against a bot at three levels
  function testKoiKoi() {
    head('Koi-Koi (#1068)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/koikoi/index.html');
    // a missing page is a failure here, never a quiet return that hides every check below
    ok(fs.existsSync(file), 'the game page exists');
    const E = loadEngine('koikoi', 'KoiKoiEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const sorted = (a) => a.slice().sort((x, y) => x - y).join();
    // A table set up by hand: both hands, the table, and the deck's next cards in the order they
    // are turned. Every other card goes into the deck below them, so the 48 stay whole.
    const mk = (o) => {
      const G = E.newGame(rng(1), 0);
      const h = o.hands || [[], []], f = o.field || [], top = o.top || [], caps = o.caps || [[], []];
      const used = new Set([].concat(h[0], h[1], f, top, caps[0], caps[1]));
      G.hands = [h[0].slice(), h[1].slice()]; G.field = f.slice(); G.caps = [caps[0].slice(), caps[1].slice()];
      G.deck = E.DECK.filter((c) => !used.has(c)).concat(top.slice().reverse());
      G.turn = o.turn || 0; G.phase = 'play'; G.base = (o.base || [0, 0]).slice(); G.koi = [0, 0];
      return G;
    };
    const total = (cards) => E.yaku(cards).total;
    const keys = (cards) => E.yaku(cards).list.map((y) => y.k + ':' + y.p).join(' ');

    // the deck: 48 cards, four a month, 5 brights, 9 animals, 10 ribbons, 24 plains
    const byRank = [0, 1, 2, 3].map((r) => E.DECK.filter((c) => E.rank(c) === r).length);
    ok(E.DECK.length === 48 && E.SIZE === 48 && new Set(E.DECK).size === 48 && [...Array(12).keys()].every((m) => E.DECK.filter((c) => E.month(c) === m).length === 4),
      'the deck is 48 different cards, four for each of the twelve months');
    ok(byRank.join() === '5,9,10,24', 'a standard deck: 5 brights, 9 animals, 10 ribbons, 24 plains (' + byRank.join() + ')');
    ok(sorted(E.BRIGHTS) === sorted(E.DECK.filter((c) => E.rank(c) === 0)) && E.month(E.CRANE) === 0 && E.month(E.CURTAIN) === 2 && E.month(E.MOON) === 7 &&
      E.month(E.RAINMAN) === 10 && E.month(E.PHOENIX) === 11 && E.month(E.CUP) === 8 && E.rank(E.CUP) === 1,
      'the brights are the crane, curtain, moon, rain man and phoenix; the sake cup is September\'s animal');
    ok(E.POEMS.every((c) => E.ribbonKind(c) === 'poem') && E.BLUES.every((c) => E.ribbonKind(c) === 'blue') &&
      E.DECK.filter((c) => E.ribbonKind(c) === 'red').length === 4 && E.ribbonKind(E.CRANE) === '',
      'three poem ribbons (Jan, Feb, Mar), three blue (Jun, Sep, Oct) and four plain red ones');

    // the deal
    const D = E.newGame(rng(7), 0);
    ok(D.hands[0].length === 8 && D.hands[1].length === 8 && D.field.length === 8 && D.deck.length === 24 && D.turn === 0 && D.phase === 'play' && E.valid(D),
      'eight cards to each player and eight face up on the table; 24 stay in the deck');
    ok(E.newGame(rng(7), 1).turn === 1 && E.newGame(rng(7), 1).first === 1, 'the other player can lead (the next round of a match)');
    let whole = 0;
    for (let s = 1; s <= 1500; s++) {
      const G = E.newGame(rng(s), 0), n = new Array(12).fill(0);
      G.field.forEach((c) => n[E.month(c)]++);
      if (n.some((k) => k === 4)) whole++;
    }
    ok(whole === 0, 'no deal leaves a whole month on the table, which nobody could ever take (1500 deals, ' + whole + ' did)');

    // a daily deal is the same everywhere: one seed, one deal
    const d1 = E.newGame(rng(20261123), 0), d2 = E.newGame(rng(20261123), 0), d3 = E.newGame(rng(20261124), 0);
    ok(JSON.stringify(d1) === JSON.stringify(d2) && JSON.stringify(d1) !== JSON.stringify(d3), 'the same seed deals the same game, another seed another game');
    ok(/C\.daily\('koikoi', M\.daily\)\.rng/.test(html) && /level: daily \? 'medium'/.test(html) && /rounds: daily \? 1/.test(html),
      'the daily game is dealt from the core\'s daily seed, one round against the medium bot');

    // matching and capture
    const N = mk({ hands: [[13, 2], [45]], field: [4, 30], top: [46] });
    ok(E.play(N, 13) && N.field.indexOf(13) >= 0 && N.caps[0].length === 0 && N.phase === 'flip', 'a card with no card of its month on the table is laid there');
    const O = mk({ hands: [[2, 6], [45]], field: [1, 30], top: [46] });
    ok(E.play(O, 2) && sorted(O.caps[0]) === '1,2' && O.field.join() === '30', 'one card of its month: the card takes it');
    const Tw = mk({ hands: [[2, 6], [45]], field: [1, 3, 30], top: [46] });
    ok(!E.play(Tw, 2) && !E.play(Tw, 2, 30) && Tw.hands[0].length === 2 && Tw.phase === 'play', 'with two of its month on the table, the player must name one of them');
    ok(E.play(Tw, 2, 3) && sorted(Tw.caps[0]) === '2,3' && sorted(Tw.field) === '1,30', 'the named card is taken and the other stays');
    const Th = mk({ hands: [[2, 6], [45]], field: [0, 1, 3, 30], top: [46] });
    ok(E.play(Th, 2) && sorted(Th.caps[0]) === '0,1,2,3' && Th.field.join() === '30', 'with three of its month on the table, the card takes all three');
    ok(!E.play(mk({ hands: [[2], [45]], field: [] }), 6) && !E.flip(mk({ hands: [[2], [45]] })), 'a card not in the hand is refused, and the deck waits for a played card');

    // the deck's card
    const F1 = mk({ hands: [[13, 6], [45, 47]], field: [30, 3], top: [29] });
    ok(E.play(F1, 13) && E.flip(F1) === true && sorted(F1.caps[0]) === '29,30' && F1.turn === 1 && F1.phase === 'play' && F1.turns === 1,
      'then the deck\'s top card is turned and takes its month the same way, and the turn passes');
    const F0 = mk({ hands: [[13, 6], [45, 47]], field: [30], top: [2] });
    ok(E.play(F0, 13) && E.flip(F0) === true && F0.field.indexOf(2) >= 0 && F0.caps[0].length === 0, 'a turned card with no match stays on the table');
    const F2 = mk({ hands: [[13, 6], [45, 47]], field: [30, 31], top: [28] });
    ok(E.play(F2, 13) && E.flip(F2) === 'pick' && F2.phase === 'pickFlip' && F2.flipped === 28 && E.valid(F2) && !E.pickFlip(F2, 13) && E.pickFlip(F2, 31) &&
      sorted(F2.caps[0]) === '28,31' && F2.field.indexOf(30) >= 0 && F2.flipped === -1, 'two of its month: the player names the one the turned card takes');
    const F3 = mk({ hands: [[13, 6], [45, 47]], field: [29, 30, 31], top: [28] });
    ok(E.play(F3, 13) && E.flip(F3) === true && sorted(F3.caps[0]) === '28,29,30,31', 'three of its month: the turned card takes all three');

    // every yaku and its points
    const Y = [
      [[0, 8, 28, 40, 44], 'goko:10', 'Five Brights'],
      [[0, 8, 28, 44], 'shiko:8', 'Four Brights'],
      [[0, 8, 28, 40], 'ameshiko:7', 'Rainy Four Brights'],
      [[0, 8, 44], 'sanko:5', 'Three Brights'],
      [[0, 8, 40], '', 'three brights with the rain man score nothing'],
      [[24, 36, 20], 'ino:5', 'Boar, Deer and Butterflies'],
      [[4, 12, 16, 29, 41], 'tane:1', 'five animals'],
      [[4, 12, 16, 29, 41, 32, 20], 'tane:3', 'seven animals, one more point each'],
      [[1, 5, 9], 'akatan:5', 'Red Poems'],
      [[21, 33, 37], 'aotan:5', 'Blue Ribbons'],
      [[13, 17, 25, 42, 1], 'tan:1', 'five ribbons'],
      [[1, 5, 9, 13, 17], 'akatan:5 tan:1', 'Red Poems and Ribbons add up'],
      [[2, 3, 6, 7, 10, 11, 14, 15, 18, 19], 'kasu:1', 'ten plains'],
      [[2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23], 'kasu:3', 'twelve plains'],
      [[8, 32], 'hanami:5', 'Flower Viewing'],
      [[28, 32], 'tsukimi:5', 'Moon Viewing'],
      [[8, 28, 32], 'hanami:5 tsukimi:5', 'both viewings'],
      [[4, 12, 16, 29], '', 'four animals score nothing'],
      [[2, 3, 6, 7, 10, 11, 14, 15, 18], '', 'nine plains score nothing']
    ];
    const badY = Y.filter((y) => keys(y[0]) !== y[1]).map((y) => y[2] + ' gave "' + keys(y[0]) + '"');
    ok(badY.length === 0, 'every yaku scores its points (' + (badY.join('; ') || Y.length + ' piles') + ')');
    ok(total([0, 8, 28, 40, 44, 24, 36, 20, 32]) === 10 + 5 + 5 + 5 && E.YAKU.length === 12 && E.YAKU.every((k) => Y.some((y) => y[1].indexOf(k + ':') >= 0)),
      'yaku add up (Five Brights, Boar-Deer-Butterflies and both viewings make 25), and the list covers all twelve');
    ok(E.points(6) === 6 && E.points(7) === 14 && E.points(10) === 20, 'a round of 7 or more is doubled');

    // koi-koi or shobu
    const K = mk({ hands: [[28, 2, 6], [45, 47, 46]], field: [29, 11, 15], top: [43, 39], caps: [[0, 8], []] });
    ok(E.play(K, 28) && E.flip(K) === true && K.phase === 'decide' && K.turn === 0, 'a new yaku with cards still in the hand stops the turn for a choice');
    ok(E.decide(K, true) && K.base[0] === 5 && K.koi[0] === 1 && K.turn === 1 && K.phase === 'play', 'koi-koi: play goes on, and the score at the call is remembered');
    ok(E.play(K, 45) && E.flip(K) === true && K.turn === 0 && K.phase === 'play', 'the other player\'s turn comes next');
    const K2 = mk({ hands: [[2, 6], [45, 47]], field: [11, 15], top: [43, 39], caps: [[0, 8, 28], []], base: [5, 0] });
    ok(E.play(K2, 2) && E.flip(K2) === true && K2.phase === 'play' && K2.turn === 1, 'after koi-koi, a turn that adds no points asks nothing');
    const K3 = mk({ hands: [[44, 2], [45, 47]], field: [46, 15], top: [43, 39], caps: [[0, 8, 28], []], base: [5, 0] });
    ok(E.play(K3, 44) && E.flip(K3) === true && K3.phase === 'decide' && E.decide(K3, false) &&
      K3.phase === 'over' && K3.winner === 0 && K3.score === 16 && K3.made.join() === 'shiko', 'shobu after a better yaku ends the round: Four Brights, 8, doubled to 16');
    const S = mk({ hands: [[28, 2], [45, 47]], field: [29, 15], top: [43], caps: [[0, 8], []] });
    ok(E.play(S, 28) && E.flip(S) && E.decide(S, false) && S.winner === 0 && S.score === 5 && S.made.join() === 'sanko' && !E.decide(S, true) && !E.play(S, 2),
      'shobu at once scores the yaku as it stands, and the round takes no more moves');
    const L = mk({ hands: [[28], [45]], field: [29, 15], top: [43], caps: [[0, 8], []] });
    ok(E.play(L, 28) && E.flip(L) === true && L.phase === 'over' && L.winner === 0 && L.score === 5, 'a yaku made with the last card ends the round: there is nothing to go on with');
    ok(!E.decide(mk({ hands: [[2], [45]] }), true), 'there is no choice to make without a new yaku');

    // the draw: both hands out and nobody called shobu
    const Dr = mk({ hands: [[2], [45]], field: [15, 19], top: [43, 39] });
    ok(E.play(Dr, 2) && E.flip(Dr) === true && Dr.turn === 1 && E.play(Dr, 45) && E.flip(Dr) === true && Dr.phase === 'over' && Dr.winner === -1 && Dr.score === 0 && Dr.made.length === 0,
      'when both hands are played out with no shobu, the round is a draw worth 0');
    const Dk = mk({ hands: [[2, 6], [45, 47]], field: [11, 15], top: [43, 39, 38, 35], caps: [[0, 8, 28], []], base: [5, 0] });
    for (let i = 0; i < 4 && Dk.phase !== 'over'; i++) { E.play(Dk, Dk.hands[Dk.turn][0]); E.flip(Dk); }
    ok(Dk.phase === 'over' && Dk.winner === -1 && Dk.score === 0, 'a koi-koi that never improves leaves the round a draw at the end, not a win');

    // the bots: every move legal at every level, every round finishing, the 48 cards always whole
    const levels = ['easy', 'medium', 'hard'];
    const tally = (n, a, b, seed0) => {
      const r = { w: [0, 0, 0], pts: [0, 0], bad: 0, ms: 0, turns: [] };
      for (let s = 0; s < n; s++) {
        const G = E.newGame(rng(seed0 + s), s % 2), rb = rng(seed0 * 7 + s), t1 = Date.now();
        let guard = 0;
        while (G.phase !== 'over' && guard++ < 40) {
          const lv = G.turn === 0 ? a : b, mv = E.botPlay(G, lv, rb);
          if (!E.moves(G).some((m) => m.card === mv.card && m.pick === mv.pick)) r.bad++;
          if (!E.botTurn(G, lv, rb) || !E.valid(G)) { r.bad++; break; }
          if (G.hands[0].length + G.hands[1].length + G.field.length + G.deck.length + G.caps[0].length + G.caps[1].length !== 48) r.bad++;
        }
        r.ms = Math.max(r.ms, Date.now() - t1);
        if (G.phase !== 'over') r.bad++;
        r.turns.push(G.turns);
        if (G.winner < 0) r.w[2]++; else { r.w[G.winner]++; r.pts[G.winner] += G.score; }
      }
      return r;
    };
    const legal = levels.map((lv) => [lv, tally(60, lv, lv, 100 + lv.length)]);
    ok(legal.every((x) => x[1].bad === 0 && x[1].turns.every((n) => n >= 1 && n <= 16)),
      'every bot move is a legal one, every round ends within 16 turns, and the 48 cards stay whole (60 rounds at each level: ' + legal.map((x) => x[0] + ' ' + x[1].bad + ' faults').join(', ') + ')');
    ok(legal.every((x) => x[1].w[0] + x[1].w[1] > 0 && x[1].ms < 250), 'rounds are won, and a whole bot-vs-bot round takes well under a second (slowest ' + Math.max(...legal.map((x) => x[1].ms)) + ' ms)');
    // a two-way choice for the turned card, played by every level
    const P = mk({ hands: [[13, 6], [45, 47]], field: [30, 31], top: [28] });
    ok(levels.every((lv) => { const G = JSON.parse(JSON.stringify(P)); E.play(G, 13); E.flip(G); return [30, 31].indexOf(E.botPick(G, lv, rng(3))) >= 0; }),
      'every level names one of the two table cards when the turned card has a choice');
    // strength, measured on fixed seeds: medium beats easy, hard scores more than medium
    const em = tally(150, 'medium', 'easy', 5000), hm = tally(150, 'hard', 'medium', 9000);
    ok(em.pts[0] > em.pts[1] * 1.4 && em.w[0] > em.w[1], 'the medium bot beats the easy one (wins ' + em.w.join('/') + ', points ' + em.pts.join('/') + ')');
    ok(hm.pts[0] > hm.pts[1], 'the hard bot scores more than the medium one (wins ' + hm.w.join('/') + ', points ' + hm.pts.join('/') + ')');
    // hard takes what the other side is collecting: with the moon and the curtain in the other
    // pile and nothing for itself, it takes the sake cup over a plain card
    const B = mk({ hands: [[34, 2], [45, 47]], field: [32, 3, 30], top: [43], caps: [[], [28, 8]] });
    ok(E.botPlay(B, 'hard', rng(1)).card === 34 && E.botPlay(B, 'medium', rng(1)).card === 34, 'both bots take the sake cup before the other player can use it');
    const Bk = mk({ hands: [[28, 2, 6, 10], [45, 47, 46, 38]], field: [29, 11, 15], top: [43], caps: [[0, 8], [32]] });
    E.play(Bk, 28); E.flip(Bk);
    ok(Bk.phase === 'decide' && E.botKoi(Bk, 'medium', rng(1)) === false, 'the medium bot calls shobu with fewer than four cards left');
    const Bs = mk({ hands: [[28, 2, 6, 10, 14], [45, 47, 46, 38, 39]], field: [29, 11, 15], top: [43], caps: [[0, 8], []] });
    E.play(Bs, 28); E.flip(Bs);
    ok(Bs.phase === 'decide' && E.botKoi(Bs, 'medium', rng(1)) === true, 'the medium bot calls koi-koi with four cards left and nothing to fear');
    const B7 = mk({ hands: [[28, 2, 6, 10, 14], [45, 47, 46, 38, 39]], field: [29, 11, 15], top: [43], caps: [[0, 8, 44], []] });
    E.play(B7, 28); E.flip(B7);
    ok(B7.phase === 'decide' && levels.slice(1).every((lv) => E.botKoi(B7, lv, rng(1)) === false), 'with 7 points or more (a doubled round) medium and hard take it');
    // hard sees a yaku the other side could finish: the cup is still unseen and the moon is theirs
    const Bh = mk({ hands: [[0, 2, 6, 10, 14], [45, 47, 46, 38, 39]], field: [3, 11, 15], top: [43], caps: [[8, 44], [28]] });
    E.play(Bh, 0); E.flip(Bh);
    ok(Bh.phase === 'decide' && E.botKoi(Bh, 'medium', rng(1)) === true && E.botKoi(Bh, 'hard', rng(1)) === false,
      'hard calls shobu when an unseen card would give the other side a yaku; medium does not look');
    ok(E.unseen(Bh, 0).every((c) => Bh.hands[0].indexOf(c) < 0 && Bh.field.indexOf(c) < 0 && Bh.caps[0].indexOf(c) < 0 && Bh.caps[1].indexOf(c) < 0) &&
      E.unseen(Bh, 0).length === Bh.hands[1].length + Bh.deck.length, 'a bot knows only what it can see: the other hand and the deck are one unknown pool');

    // saves
    const V = E.newGame(rng(31), 0);
    const bad = (f) => { const x = JSON.parse(JSON.stringify(V)); f(x); return !E.valid(x); };
    ok(E.valid(JSON.parse(JSON.stringify(V))) && !E.valid(null) && bad((x) => { x.hands[0].pop(); }) && bad((x) => { x.hands[1][0] = x.hands[0][0]; }) &&
      bad((x) => { x.field[0] = 48; }) && bad((x) => { x.phase = 'later'; }) && bad((x) => { x.turn = 2; }) && bad((x) => { x.flipped = x.deck.pop(); }) &&
      bad((x) => { x.hands[0].push(x.deck.pop()); }),
      'a save is checked before it is restored (missing, doubled or foreign cards, phase, turn, a stray turned card, a hand of nine)');
    ok(/ctx\.autosave\(/.test(html) && /ctx\.store\./.test(html) && !/localStorage/.test(html) && !/history\.(push|replace)State/.test(html),
      'progress is saved through the core, never localStorage directly');
    ok(/sv && sv\.daily === dailyDate\) resume\(sv\)/.test(html) && /else if \(sv && !sv\.daily\) resume\(sv\)/.test(html), 'an unfinished round comes back on load, the daily one only on its own day');

    // the page
    const aw = ['kk-win', 'kk-hard', 'kk-five'];
    ok(aw.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bkk: 'koikoi'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'kk-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'kk-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowRight/.test(html) && /e\.key === 'Enter'/.test(html), 'the arrows pick a card and Enter plays it');
    ok(/cardSpeed: true/.test(html) && /C\.cards\.speedRow\(\)/.test(html) && /C\.ui\.reduceMotion\(\)/.test(html) && /C\.ui\.fly\(/.test(html) && /C\.ui\.burst\(/.test(html),
      'the speed setting is the core\'s, and cards fly unless the system asks for less motion');
    ok(/C\.cards\.back\(\)/.test(html) && !/backPicker/.test(html), 'the backs are the core\'s card back, with no picker of its own');
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 10 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const ownKeys = (langs.fa || '').split(',');
    const cap = (k) => k.charAt(0).toUpperCase() + k.slice(1);
    ok(E.YAKU.every((k) => ownKeys.indexOf('y' + cap(k)) >= 0 && ownKeys.indexOf('d' + cap(k)) >= 0), 'every yaku has a name and a description in the strings, for the help list');
    const used = (html.match(/C\.t\('([A-Za-z0-9]+)'/g) || []).map((k) => k.slice(5, -1));
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close'];
    ok(ownKeys.length > 30 && ownKeys.every((k) => coreKeys.indexOf(k) < 0), 'no game string is named like a core string');
    const missing = used.filter((k) => ownKeys.indexOf(k) < 0 && coreKeys.indexOf(k) < 0 && !new RegExp("\\b" + k + ": '").test(core));
    ok(used.length > 20 && missing.length === 0, 'every literal key the page reads exists in its strings or the core (' + (missing.join(', ') || 'none missing') + ')');
    const help = (html.match(/function showHelp\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
    ok(/C\.icon\('gear', 20\)/.test(html) && /C\.t\('rounds'\)/.test(html) && help.length > 0 && !/segmented|rounds|level/.test(help) && /C\.t\('rules'\)/.test(help) && /E\.YAKU\.map/.test(help),
      'the options (level, rounds) sit behind a gear; help holds the rules, the yaku list and the keys');

    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'koikoi');
    ok(!!gm && gm.cat === 'cards' && gm.people === 1 && list.filter((g) => g.id === 'koikoi').length === 1, 'Koi-Koi is listed once, as a card game for one player');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'koikoi');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.existsSync(path.join(ROOT, 'www/games/koikoi/icon.svg')) ? fs.readFileSync(path.join(ROOT, 'www/games/koikoi/icon.svg'), 'utf8') : '';
    ok(!!gm && icon.indexOf('<rect width="96" height="96" rx="22" fill="' + gm.soft + '"/>') >= 0, 'the icon sits on the game\'s soft tint');
    const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (q) => q <= 0.04045 ? q / 12.92 : Math.pow((q + 0.055) / 1.055, 2.4);
    const lumC = (x) => rgb(x).map(lin).reduce((s, q, i) => s + q * [0.2126, 0.7152, 0.0722][i], 0);
    const lab = (x) => {
      const [Rr, Gr, Bl] = rgb(x).map(lin), f = (q) => q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116;
      const X = (Rr * 0.4124 + Gr * 0.3576 + Bl * 0.1805) / 0.95047, Y2 = Rr * 0.2126 + Gr * 0.7152 + Bl * 0.0722, Z = (Rr * 0.0193 + Gr * 0.1192 + Bl * 0.9505) / 1.08883;
      return [116 * f(Y2) - 16, 500 * (f(X) - f(Y2)), 200 * (f(Y2) - f(Z))];
    };
    const dE = (x, y) => { const P2 = lab(x), Q2 = lab(y); return Math.hypot(P2[0] - Q2[0], P2[1] - Q2[1], P2[2] - Q2[2]); };
    const nearest = (set) => gm && set.length ? set.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    const nCards = nearest(others.filter((g) => g.cat === 'cards')), nAll = nearest(others);
    ok(!!gm && nCards[1] >= 15 && nAll[1] >= 8 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs by ΔE ≥ 15 from every card game (nearest ' + nCards[0] + ', ' + (nCards[1] || 0).toFixed(1) + ') and ≥ 8 from all others (nearest ' + nAll[0] + ', ' + (nAll[1] || 0).toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 3000, 'the Koi-Koi tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testKoiKoi };
};
