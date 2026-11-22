'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #1024: Durak, the Russian card game, podkidnoy by default and perevodnoy behind the gear
  function testDurak() {
    head('Durak (#1024)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/durak/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    if (!fs.existsSync(file)) return;
    const E = loadEngine('durak', 'DurakEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    // a card by its rank and suit (0 clubs, 1 diamonds, 2 hearts, 3 spades), in the core's numbering
    const RK = { 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, J: 10, Q: 11, K: 12, A: 0 };
    const c = (r, s) => RK[r] * 4 + s;
    const CL = 0, DI = 1, HE = 2, SP = 3;
    // a table with chosen hands; trumpCard is the stock's bottom card, the rest of the deck (or opts.stock) sits above it
    const mk = (hands, trumpCard, opts) => {
      opts = opts || {};
      const G = E.newGame(rng(1), hands.length, { transfer: !!opts.transfer });
      G.hands = hands.map((h) => h.slice());
      const used = new Set([].concat(...hands, [trumpCard]));
      // opts.empty: the stock is gone, its trump card included, and everything else is in the discard
      G.stock = opts.empty ? [] : [trumpCard].concat(opts.stock ? opts.stock : E.DECK.filter((x) => !used.has(x)));
      G.seen = E.DECK.filter((x) => !new Set([].concat(...hands)).has(x) && G.stock.indexOf(x) < 0);
      G.trumpCard = trumpCard; G.trump = E.suit(trumpCard);
      G.out = hands.map(() => false); G.outAt = hands.map(() => -1);
      G.att = opts.att || 0; G.def = E.nextActive(G, G.att); G.actor = G.att;
      G.table = []; G.taking = false; G.passes = 0; G.over = false; G.loser = -1;
      G.limit = Math.min(E.MAXT, G.hands[G.def].length);
      return G;
    };

    // the deck
    const ids = new Set(E.DECK);
    const ranks = new Set(E.DECK.map((x) => E.str(x)));
    ok(E.DECK.length === 36 && E.SIZE === 36 && ids.size === 36 && ranks.size === 9 && Math.min(...ranks) === 5 && Math.max(...ranks) === 13 &&
      [0, 1, 2, 3].every((s) => E.DECK.filter((x) => E.suit(x) === s).length === 9),
      'the deck is 36 different cards, six to ace in four suits');

    // the deal and the first attacker
    const D = E.newGame(rng(7), 3);
    ok(D.hands.every((h) => h.length === 6) && D.stock.length === 18 && D.trumpCard === D.stock[0] && D.trump === E.suit(D.trumpCard) && E.valid(D),
      'three players get six cards each; the stock\'s bottom card is turned up and names the trump');
    let lowest = 0;
    for (let s = 1; s <= 200; s++) {
      const G = E.newGame(rng(s), 2 + (s % 3));
      let low = 99, who = 0;
      G.hands.forEach((h, p) => h.forEach((x) => { if (E.suit(x) === G.trump && E.str(x) < low) { low = E.str(x); who = p; } }));
      if (G.att === who && G.actor === who && G.def === (who + 1) % G.n) lowest++;
    }
    ok(lowest === 200, 'the player with the lowest trump attacks first, against the next player (200 deals)');

    // beating
    ok(E.canBeat(c(7, CL), c(9, CL), HE) && !E.canBeat(c(9, CL), c(7, CL), HE) && !E.canBeat(c(7, CL), c('A', DI), HE),
      'a card is beaten by a higher card of its suit, never by a lower one or another plain suit');
    ok(E.canBeat(c('A', CL), c(6, HE), HE) && !E.canBeat(c(6, HE), c('A', CL), HE), 'any trump beats a plain card, and a plain card never beats a trump');
    ok(E.canBeat(c(8, HE), c('Q', HE), HE) && !E.canBeat(c('Q', HE), c(8, HE), HE), 'a trump is beaten only by a higher trump');

    // throw-ins match a rank on the table
    const R = mk([[c(7, CL), c(7, DI), c(9, SP), c(8, SP), c('K', DI), c(6, DI)], [c(9, CL), c(10, CL), c(6, SP), c('J', SP), c('Q', DI), c('A', SP)]], c(6, HE));
    ok(E.play(R, c(7, CL)) && R.actor === 1 && E.defend(R, 0, c(9, CL)) && R.actor === 0, 'the attacker leads, and the defender covers it with a higher card of the suit');
    ok(E.throwable(R, 0).sort((a, b) => a - b).join() === [c(7, DI), c(9, SP)].sort((a, b) => a - b).join() && !E.play(R, c(8, SP)) && R.hands[0].length === 5,
      'only cards of a rank already on the table may be thrown in; another rank is refused and stays in the hand');
    ok(E.play(R, c(9, SP)) && !E.defend(R, 1, c(10, CL)) && E.defend(R, 1, c('J', SP)), 'a thrown-in card must be covered the same way');

    // the attack limit: never more cards than the defender held when the bout began
    const Lm = mk([[c(7, CL), c(7, DI), c(7, SP), c(7, HE), c(9, DI)], [c(9, CL), c(10, DI)]], c(6, HE));
    ok(Lm.limit === 2 && E.play(Lm, c(7, CL)) && E.defend(Lm, 0, c(9, CL)) && E.play(Lm, c(7, DI)) && E.throwable(Lm, 0).length === 0,
      'with two cards in the defender\'s hand at the start, a third attack card cannot be added');
    const L6 = mk([[c(7, CL), c(7, DI), c(7, SP), c(8, CL), c(8, DI), c(8, SP)], [c(6, CL), c(6, DI), c(6, SP), c(9, HE), c(10, HE), c('J', HE), c('Q', HE), c('K', HE)]], c(6, HE));
    ok(L6.limit === 6, 'the attack never holds more than six cards, however many the defender has');

    // taking
    const Tk = mk([[c(7, CL), c(7, DI), c('K', SP)], [c(6, CL), c(8, SP)], [c(9, DI), c(9, SP), c(10, CL)]], c(6, HE), { stock: [] });
    Tk.limit = 2;
    ok(E.play(Tk, c(7, CL)) && E.take(Tk) && Tk.taking && Tk.actor === 0, 'the defender may take instead of covering');
    ok(E.play(Tk, c(7, DI)) && Tk.last && Tk.last.taken === 1 && Tk.last.table.length === 2,
      'while the defender takes, the attacker may still add matching cards, and the bout ends at the limit');
    ok(Tk.last && Tk.last.taken === 1 && Tk.hands[1].length === 4 && Tk.hands[1].indexOf(c(7, CL)) >= 0 && Tk.hands[1].indexOf(c(7, DI)) >= 0,
      'the defender who takes picks up every card on the table');
    ok(Tk.att === 2 && Tk.def === 0, 'after a take the player after the taker attacks; the taker loses the attack');

    // refill order and who attacks after a beaten bout
    const Rf = mk([[c(7, CL), c(8, DI), c(9, DI), c(10, DI), c('J', DI), c('Q', DI)], [c(9, CL), c(6, SP), c(7, SP), c(8, SP), c(9, SP)],
      [c(6, DI), c(6, CL), c('A', DI), c('K', DI), c('J', CL), c('Q', CL)]], c(6, HE), { stock: [c(8, HE), c(9, HE)] });
    // the stock pops from the end: the attacker draws first
    ok(E.play(Rf, c(7, CL)) && E.defend(Rf, 0, c(9, CL)) && E.pass(Rf) && Rf.last && Rf.last.taken === -1,
      'a covered bout ends when nobody throws in, and its cards go to the discard');
    ok(Rf.drew.length === 2 && Rf.drew[0][0] === 0 && Rf.drew[0][1].join() === String(c(9, HE)) && Rf.drew[1][0] === 1 && Rf.drew[1][1].join() === [c(8, HE), c(6, HE)].join(),
      'hands refill to six from the stock, the attacker first and the defender last (who gets the turned-up trump)');
    ok(Rf.att === 1 && Rf.def === 2 && Rf.seen.indexOf(c(7, CL)) >= 0, 'after a covered bout the defender attacks next');

    // perevodnoy: passing the attack on with a card of the same rank
    const Tr = mk([[c(7, CL), c('K', DI)], [c(7, DI), c(9, CL), c('A', SP)], [c(6, SP), c(8, SP), c('J', SP)]], c(6, HE), { transfer: true });
    ok(E.play(Tr, c(7, CL)) && E.transferCards(Tr).join() === String(c(7, DI)) && E.transfer(Tr, c(7, DI)) && Tr.att === 1 && Tr.def === 2 && Tr.actor === 2 && Tr.table.length === 2,
      'in the transfer game the defender adds a card of the same rank and the next player must defend both');
    const Tc = mk([[c(7, CL), c('K', DI)], [c(7, DI), c(9, CL), c('A', SP)], [c(6, SP)]], c(6, HE), { transfer: true });
    ok(E.play(Tc, c(7, CL)) && E.transferCards(Tc).length === 0 && !E.transfer(Tc, c(7, DI)), 'a transfer is refused when the next player could not face every card');
    const Tb = mk([[c(7, CL), c(7, SP), c('K', DI)], [c(7, DI), c(9, CL), c('A', SP)], [c(6, SP), c(8, SP), c('J', SP)]], c(6, HE), { transfer: true });
    ok(E.play(Tb, c(7, CL)) && E.defend(Tb, 0, c(9, CL)) && E.play(Tb, c(7, SP)) && E.transferCards(Tb).length === 0, 'once a card is covered the attack can no longer be transferred');
    const Tp = mk([[c(7, CL), c('K', DI)], [c(7, DI), c(9, CL), c('A', SP)], [c(6, SP), c(8, SP), c('J', SP)]], c(6, HE));
    ok(E.play(Tp, c(7, CL)) && E.transferCards(Tp).length === 0, 'in the default podkidnoy game there is no transfer');

    // the end of the game
    const En = mk([[c(7, CL), c('K', DI)], [c(9, CL), c(6, SP)]], c(6, HE), { empty: true });
    ok(E.valid(En) && E.play(En, c(7, CL)) && E.defend(En, 0, c(9, CL)) && !En.over && En.att === 1 && En.last.taken === -1,
      'with the stock gone, a bout nobody can add to ends by itself, and the game goes on while two players hold cards');
    ok(E.play(En, c(6, SP)) && !En.over && E.take(En) && En.over && En.loser === 0 && En.out[1], 'the last player left holding cards is the durak');
    const Dr = mk([[c(7, CL)], [c(9, CL)]], c(6, HE), { empty: true });
    ok(E.play(Dr, c(7, CL)) && E.defend(Dr, 0, c(9, CL)) && Dr.over && Dr.loser === -2, 'when the last cards go out together, nobody is the durak: a draw');

    // whole games among bots
    const playGame = (seed, n, levels, transfer) => {
      const r = rng(seed), G = E.newGame(r, n, { transfer });
      let t = 0;
      while (!G.over && t < 3000) {
        const m = E.botMove(G, levels[G.actor], r);
        if (!E.apply(G, m) || !E.valid(G)) return { ok: false, t };
        t++;
      }
      return { ok: G.over && (G.loser === -2 || (G.loser >= 0 && G.loser < n)), t, bouts: G.bouts };
    };
    const tg = Date.now();
    const runs = [
      playGame(11, 2, ['easy', 'hard'], false), playGame(12, 3, ['medium', 'easy', 'hard'], false), playGame(13, 4, ['hard', 'medium', 'easy', 'medium'], false),
      playGame(14, 2, ['medium', 'medium'], true), playGame(15, 3, ['hard', 'hard', 'hard'], true), playGame(16, 4, ['easy', 'easy', 'easy', 'easy'], true)
    ];
    const gameMs = Date.now() - tg;
    ok(runs.length === 6 && runs.every((g) => g.ok && g.t > 10), 'bot games of 2, 3 and 4 players, with and without transfer, end with only legal moves and a valid table after each (moves ' + runs.map((g) => g.t).join(' ') + ')');
    ok(gameMs < 1000, 'six bot games take under a second (' + gameMs + ' ms)');
    let medWins = 0;
    for (let s = 0; s < 40; s++) {
      const r = rng(700 + s), G = E.newGame(r, 2);
      for (let k = 0; k < 3000 && !G.over; k++) E.apply(G, E.botMove(G, G.actor === 0 ? 'medium' : 'easy', r));
      if (G.loser === 1) medWins++;
    }
    ok(medWins >= 26, 'the medium bot beats the easy bot in most games (' + medWins + ' of 40)');
    const Op = E.newGame(rng(21), 3);
    ok(E.playOut(Op, 'medium', rng(22)) && Op.over, 'once the player is out, the bots play the rest of the game alone');

    // the daily deal
    const a = E.newGame(rng(4242), 2), b = E.newGame(rng(4242), 2), d2 = E.newGame(rng(4243), 2);
    ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(d2), 'the same seed deals the same game, and another seed another one');
    ok(/C\.daily\('durak', M\.daily\)\.rng/.test(html) && /C\.daily\('durak', M\.daily \+ '\|bots'\)\.rng/.test(html), 'the daily deal and the daily bot are seeded from the date, so everyone gets the same game');

    // saves
    const V = E.newGame(rng(31), 3);
    const bad = (f) => { const x = JSON.parse(JSON.stringify(V)); f(x); return !E.valid(x); };
    ok(E.valid(JSON.parse(JSON.stringify(V))) && !E.valid(null) && bad((x) => { x.hands[0].pop(); }) && bad((x) => { x.hands[1][0] = x.hands[0][0]; }) &&
      bad((x) => { x.n = 5; }) && bad((x) => { x.trump = (x.trump + 1) % 4; }) && bad((x) => { x.def = x.att; }) && bad((x) => { x.hands[0][0] = 4; }),
      'a save is checked before it is restored (missing, doubled or foreign cards, players, trump, roles)');
    ok(/ctx\.autosave\(/.test(html) && /ctx\.store\./.test(html) && !/localStorage/.test(html), 'progress is saved through the core, never localStorage directly');

    // the page
    const aw = ['dk-win', 'dk-hard', 'dk-trans'];
    ok(aw.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bdk: 'durak'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'dk-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'dk-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowRight/.test(html) && /Enter/.test(html) && /C\.keyIs\(e, 't'\)/.test(html) && /C\.keyIs\(e, 'd'\)/.test(html) && /C\.keyIs\(e, 'p'\)/.test(html),
      'the arrows pick a card, Enter plays it, T takes, D ends the attack and P transfers');
    ok(/cardSpeed: true/.test(html) && /C\.cards\.speedRow\(\)/.test(html) && /C\.ui\.reduceMotion\(\)/.test(html) && /C\.ui\.fly\(/.test(html) && /C\.ui\.sendTo\(/.test(html),
      'the speed setting is the core\'s, and cards fly unless the system asks for less motion');
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
    const missing = used.filter((k) => ownKeys.indexOf(k) < 0 && coreKeys.indexOf(k) < 0 && !new RegExp("\\b" + k + ": '").test(core));
    ok(used.length > 20 && missing.length === 0, 'every literal key the page reads exists in its strings or the core (' + (missing.join(', ') || 'none missing') + ')');
    const help = (html.match(/function showHelp\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
    ok(/C\.icon\('gear', 20\)/.test(html) && /C\.t\('rivals'\)/.test(html) && help.length > 0 && !/segmented|rivals|transfer/.test(help) && /C\.t\('rules'\)/.test(help),
      'the options (rivals, level, transfer) sit behind a gear; help holds the rules and the keys');

    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'durak');
    ok(!!gm && gm.cat === 'cards' && gm.people === 1 && list.filter((g) => g.id === 'durak').length === 1 && gm.added === '2026-11-22',
      'Durak is listed once, as a card game for one player on the phone');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'durak');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.existsSync(path.join(ROOT, 'www/games/durak/icon.svg')) ? fs.readFileSync(path.join(ROOT, 'www/games/durak/icon.svg'), 'utf8') : '';
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
    ok(Date.now() - t0 < 3000, 'the Durak tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testDurak };
};
