'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // #927: Yellow Dwarf (Nain Jaune), the French card game, against two or three bots
  function testNainJaune() {
    head('Yellow Dwarf (#927)');
    const t0 = Date.now();
    const file = path.join(ROOT, 'www/games/nainjaune/index.html');
    ok(fs.existsSync(file), 'the game page exists');
    if (!fs.existsSync(file)) return;
    const E = loadEngine('nainjaune', 'NainJauneEngineFactory');
    const html = fs.readFileSync(file, 'utf8');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    // card = rank * 4 + suit; ranks A..K = 0..12; suits 0 clubs, 1 diamonds, 2 hearts, 3 spades
    const card = (r, s) => r * 4 + s;
    const C_ = (r) => card(r, 0), D_ = (r) => card(r, 1), H_ = (r) => card(r, 2), S_ = (r) => card(r, 3);
    // a table with chosen hands; `done` lists cards already played (by player 0)
    const mk = (hands, turn, done) => {
      const R = E.newDeal(rng(1), hands.length, turn || 0, null);
      R.hands = hands.map((h) => h.slice());
      R.playedBy = R.playedBy.map(() => -1);
      (done || []).forEach((c) => { R.playedBy[c] = 0; });
      R.dead = -1;
      R.turn = turn || 0;
      return R;
    };

    // the deal
    const R3 = E.newDeal(rng(7), 3, 0, null), R4 = E.newDeal(rng(7), 4, 0, null);
    const flat3 = [].concat(R3.hands[0], R3.hands[1], R3.hands[2], [R3.dead]);
    ok(R3.hands.every((h) => h.length === 17) && R3.dead >= 0 && new Set(flat3).size === 52 && E.validRound(R3),
      'with three players each gets 17 cards and the 52nd is set aside, every card exactly once');
    ok(R4.hands.every((h) => h.length === 13) && R4.dead === -1 && new Set([].concat(...R4.hands)).size === 52 && E.validRound(R4),
      'with four players each gets 13 cards and none is set aside');
    ok(E.HONOURS.join() === '25,37,41,47,50' && E.HONOURS[2] === E.DWARF && E.DWARF === D_(10) && E.HONOURS[0] === D_(6) && E.HONOURS[1] === D_(9) && E.HONOURS[3] === S_(11) && E.HONOURS[4] === H_(12),
      'the honours are the 7 and 10 of diamonds, the Yellow Dwarf (jack of diamonds), the queen of spades and the king of hearts');
    ok(R3.pots.join() === '3,3,6,3,3' && R4.pots.join() === '4,4,8,4,4', 'every player antes 1 token into each box and 2 into the Yellow Dwarf box');
    ok(E.newDeal(rng(7), 3, 1, [2, 0, 5, 0, 1]).pots.join() === '5,3,11,3,4', 'boxes nobody won carry into the next deal');

    // who may play what
    const L0 = mk([[C_(2), D_(5), H_(8)], [C_(3)], [S_(1)]], 0);
    ok(E.legal(L0, 0).join() === [C_(2), D_(5), H_(8)].join() && E.legal(L0, 1).length === 0, 'the leader may play any card and nobody else may play');
    ok(E.play(L0, C_(2)) && L0.turn === 1 && L0.last === C_(2) && E.legal(L0, 1).join() === String(C_(3)) && E.legal(L0, 2).length === 0, 'the holder of the next card of the suit must play it, and only it');
    ok(E.play(L0, C_(2)) === false && E.play(L0, S_(1)) === false, 'a card out of turn or not allowed is refused');

    // sequences end
    const K = mk([[C_(12), S_(1)], [S_(2)], [S_(3)]], 0);
    const rk = E.play(K, C_(12));
    ok(rk.ended && K.last === -1 && K.turn === 0, 'a king ends the sequence and its player leads again');
    const P = mk([[C_(2), S_(1)], [D_(3)], [S_(3)]], 0, [C_(3)]);
    const rp = E.play(P, C_(2));
    ok(rp.ended && P.turn === 0 && P.last === -1, 'a sequence stops when the next card was already played');
    const Dd = mk([[C_(2), S_(1)], [D_(3)], [S_(3)]], 0);
    const rd = E.play(Dd, C_(2));
    ok(rd.ended && Dd.turn === 0, 'a sequence stops when nobody holds the next card (it was set aside)');
    const chain = mk([[C_(2), C_(4), S_(1)], [C_(3), S_(2)], [S_(3)]], 0);
    E.play(chain, C_(2)); E.play(chain, C_(3));
    ok(chain.turn === 0 && chain.last === C_(3) && E.legal(chain, 0).join() === String(C_(4)), 'the same player can be next in a sequence, passing it back and forth');

    // honours pay only inside a sequence
    const seven = mk([[D_(5), S_(1)], [D_(6), S_(2)], [S_(3)]], 0);
    seven.pots = [4, 3, 6, 3, 3];
    E.play(seven, D_(5));
    const r7 = E.play(seven, D_(6));
    ok(r7.box === 0 && r7.pot === 4 && seven.take[1] === 4 && seven.pots[0] === 0 && seven.won[1].join() === '0', 'the 7 of diamonds played after the 6 wins its box');
    const lead7 = mk([[D_(6), S_(1)], [S_(2)], [S_(3)]], 0);
    lead7.pots = [4, 3, 6, 3, 3];
    const rl = E.play(lead7, D_(6));
    ok(rl.box === -1 && lead7.take[0] === 0 && lead7.pots[0] === 4, 'an honour led as the opening card wins nothing');
    const dw = mk([[D_(9), S_(1)], [D_(10), S_(2)], [S_(3)]], 0);
    dw.pots = [3, 3, 9, 3, 3];
    E.play(dw, D_(9));
    const rdw = E.play(dw, D_(10));
    ok(rdw.box === 2 && rdw.pot === 9 && dw.take[1] === 9 && dw.pots[2] === 0, 'the Yellow Dwarf (jack of diamonds) played after the 10 of diamonds wins its box');
    const qs = mk([[S_(10), D_(1)], [S_(11), D_(2)], [S_(3)]], 0);
    E.play(qs, S_(10));
    const rq = E.play(qs, S_(11));
    ok(rq.box === 3 && qs.take[1] === 3, 'the queen of spades after the jack of spades wins its box');
    const kh = mk([[H_(11), D_(1)], [H_(12), D_(2)], [S_(3)]], 0);
    E.play(kh, H_(11));
    const rkh = E.play(kh, H_(12));
    ok(rkh.box === 4 && kh.take[1] === 3 && rkh.ended, 'the king of hearts after the queen of hearts wins its box, and the king ends the sequence');

    // going out and settling
    const out = mk([[C_(2)], [C_(3), E.DWARF, S_(1)], [S_(2), S_(4)]], 0);
    const ro = E.play(out, C_(2));
    ok(ro.out && out.winner === 0 && E.legal(out, 1).length === 0 && E.play(out, C_(3)) === false, 'the first player to empty their hand wins, and the deal stops there');
    const st = E.settle(out);
    ok(st.pen.join() === '0,7,2' && st.delta.join() === '3,-13,-8',
      'the winner collects a token per card the others hold, five for an unplayed Yellow Dwarf, and everybody paid the stake of 6');
    // tokens plus boxes never change, over a deal and over its carry
    const cin = [2, 0, 5, 0, 1], Rc = E.newDeal(rng(21), 4, 0, cin);
    const rr = rng(22);
    while (Rc.winner < 0) E.play(Rc, E.botMove(Rc, 'easy', rr));
    const sc = E.settle(Rc);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    ok(sum(sc.delta) + sum(sc.carry) === sum(cin), 'the tokens of a deal and the boxes it carries over add up to what went in (' + sum(sc.delta) + ' + ' + sum(sc.carry) + ' = ' + sum(cin) + ')');

    // the bots
    let legalOk = true, probes = 0;
    ['easy', 'medium', 'hard'].forEach((lv) => {
      [3, 4].forEach((n) => {
        const G = E.newDeal(rng(300 + n), n, 0, null), rg = rng(5 + n);
        for (let k = 0; k < 12 && G.winner < 0; k++) {
          const c = E.botMove(G, lv, rg);
          probes++;
          if (E.legal(G, G.turn).indexOf(c) < 0) legalOk = false;
          E.play(G, c);
        }
      });
    });
    ok(probes > 60 && legalOk, 'every level plays only legal cards (' + probes + ' moves)');
    const cash = mk([[D_(8), D_(9), D_(10), S_(1)], [S_(2), S_(3)], [S_(4), S_(5)]], 0);
    cash.pots = [3, 3, 9, 3, 3];
    const cm = E.botMove(cash, 'medium', rng(2));
    ok(cm === D_(8) || cm === D_(9), 'medium leads a run that cashes the Yellow Dwarf box, not an unrelated card');

    // bot against bot over seeded matches of three deals: every deal ends, every state stays valid, tokens never leak
    let ended = 0, sane = 0, deals = 0, longest = 0, good = true;
    for (let g = 0; g < 24; g++) {
      const n = 3 + (g % 2), rg = rng(9270 + g);
      let carry = [0, 0, 0, 0, 0], tokens = new Array(n).fill(E.START);
      for (let d = 0; d < E.DEALS; d++) {
        const G = E.newDeal(rg, n, d % n, carry);
        let plays = 0;
        while (G.winner < 0 && plays < 400) {
          const lv = G.turn % 2 === 0 ? 'medium' : 'easy';
          const c = E.botMove(G, lv, rg);
          if (!E.play(G, c)) { good = false; break; }
          if (!E.validRound(G)) good = false;
          plays++;
        }
        longest = Math.max(longest, plays);
        deals++;
        if (G.winner >= 0) ended++;
        const s = E.settle(G);
        s.delta.forEach((x, p) => { tokens[p] += x; });
        carry = s.carry;
        if (sum(tokens) + sum(carry) !== E.START * n) good = false;
      }
      if (good) sane++;
    }
    ok(ended === deals && sane === 24, 'all ' + deals + ' seeded bot deals end with a winner, and cards and tokens stay accounted for (longest ' + longest + ' plays)');
    // medium against easy, measured on 60 seeded deals with three players
    let med = 0, eas = 0;
    for (let g = 0; g < 60; g++) {
      const rg = rng(7000 + g), G = E.newDeal(rg, 3, g % 3, null), mediumSeat = g % 3;
      while (G.winner < 0) E.play(G, E.botMove(G, G.turn === mediumSeat ? 'medium' : 'easy', rg));
      const s = E.settle(G);
      med += s.delta[mediumSeat];
      eas += (sum(s.delta) - s.delta[mediumSeat]) / 2;
    }
    ok(med > eas, 'medium does better than an easy bot over 60 deals (medium ' + med + ' tokens, an easy bot ' + eas.toFixed(1) + ')');
    // hard samples hidden hands; it is timed on one lead, not played out
    const big = E.newDeal(rng(11), 4, 0, null), th = Date.now(), hc = E.botMove(big, 'hard', rng(12)), took = Date.now() - th;
    ok(E.legal(big, 0).indexOf(hc) >= 0 && took < 400, 'hard answers a lead with a legal card inside its budget (' + took + ' ms)');

    // saves
    const V = E.newDeal(rng(31), 3, 0, null);
    const bad = (f) => { const x = JSON.parse(JSON.stringify(V)); f(x); return !E.validRound(x); };
    ok(E.validRound(JSON.parse(JSON.stringify(V))) && !E.validRound(null) && bad((x) => { x.hands[0].pop(); }) && bad((x) => { x.hands[1][0] = x.hands[0][0]; }) &&
      bad((x) => { x.n = 5; }) && bad((x) => { x.pots[2] = -1; }) && bad((x) => { x.turn = 7; }) && bad((x) => { x.dead = -1; }) && bad((x) => { x.last = V.hands[0][0]; }),
      'a save is checked before it is restored (missing or doubled cards, players, boxes, turn, the dead card, a sequence nobody can follow)');

    // the page
    ok(/C\.daily\('nainjaune', M\.daily\)\.rng/.test(html) && /daily \? 'medium'/.test(html), 'the daily deal is the same for everyone and is played against the medium bots');
    const ids = ['nj-win', 'nj-hard', 'nj-dwarf'];
    ok(ids.every((id) => html.indexOf("unlock('" + id + "')") > 0 && core.split("id: '" + id + "'").length === 2), 'the three awards exist once in the core and are unlocked by the page');
    ok(/\bnj: 'nainjaune'/.test(core), 'the award prefix maps to the game');
    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[a-z0-9-]+',\s+icon:/.test(l));
    const dupes = [];
    LOCALE_CODES.forEach((lang) => {
      const re = new RegExp('[{,]\\s+' + lang + ": '([^']*)'");
      const titles = ach.map((l) => (l.match(re) || [])[1]);
      ach.forEach((l, k) => {
        if (!/id: 'nj-/.test(l)) return;
        if (!titles[k]) dupes.push(lang + ':missing');
        else if (titles.filter((x) => x === titles[k]).length > 1) dupes.push(lang + ':' + titles[k]);
      });
    });
    ok(ach.length > 100 && ach.filter((l) => /id: 'nj-/.test(l)).length === 3 && dupes.length === 0, 'the award titles exist in every language and no other award uses them (' + (dupes.join(', ') || 'none') + ')');
    ok(/ArrowRight/.test(html) && /direction: ltr/.test(html) && /Enter/.test(html), 'the arrows pick a card, Enter plays it, and the hand is laid out the same way in every language');
    ok(/cardSpeed: true/.test(html) && /C\.cards\.backPicker\(\)/.test(html) && /C\.cards\.speedRow\(\)/.test(html) && /C\.ui\.reduceMotion\(\)/.test(html) && /C\.ui\.fly\(/.test(html),
      'the card back picker and the speed setting are the core\'s, and cards fly unless the system asks for less motion');
    const sm = html.match(/strings: \{\n([\s\S]*?)\n {4}\}\n {2}\}\);/);
    const langs = {};
    if (sm) sm[1].split(/\n {6}(?=[a-z]{2}: \{)/).forEach((blk) => { const m = blk.match(/^\s*([a-z]{2}): \{/); if (m) langs[m[1]] = (blk.match(/\b([A-Za-z0-9]+): '/g) || []).map((k) => k.slice(0, -3)).sort().join(); });
    const codes = Object.keys(langs);
    ok(LOCALE_CODES.length >= 7 && LOCALE_CODES.every((l) => langs[l]) && codes.length === LOCALE_CODES.length && codes.every((l) => langs[l] === langs.fa),
      'the strings exist in every language (' + codes.join(' ') + ') with the same keys');
    const coreKeys = ['again', 'best', 'score', 'help', 'daily', 'dailyDone', 'newGame', 'resetWarn', 'keyboard', 'tutorial', 'done', 'won', 'lost', 'moves', 'time', 'play', 'next', 'undo', 'settings', 'close'];
    const ownKeys = (langs.fa || '').split(',');
    ok(ownKeys.length > 30 && ownKeys.every((k) => coreKeys.indexOf(k) < 0), 'no game string is named like a core string');
    const help = (html.match(/function showHelp\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
    ok(/C\.icon\('gear', 20\)/.test(html) && /C\.t\('rivals'\)/.test(html) && help.length > 0 && !/segmented|rivals|level/.test(help) && /C\.t\('rules'\)/.test(help),
      'the options (rivals, level, forced cards) sit behind a gear; help holds the rules and the keys');
    // the list and the colours
    const list = T.games();
    const gm = list.find((g) => g.id === 'nainjaune');
    ok(!!gm && gm.cat === 'cards' && gm.people === 1 && list.filter((g) => g.id === 'nainjaune').length === 1 && gm.added === '2026-11-15',
      'Yellow Dwarf is listed once, as a card game for one player on the phone');
    ok(!!gm && LOCALE_CODES.every((l) => gm.name[l] && gm.summary[l] && html.indexOf(l + ": '" + gm.name[l] + "'") > 0), 'its name and summary exist in every language, and the page uses the same names');
    const others = list.filter((g) => g.id !== 'nainjaune');
    ok(!!gm && LOCALE_CODES.every((l) => others.every((g) => g.name[l].toLowerCase() !== gm.name[l].toLowerCase())), 'no other game has the same name in any language');
    const icon = fs.existsSync(path.join(ROOT, 'www/games/nainjaune/icon.svg')) ? fs.readFileSync(path.join(ROOT, 'www/games/nainjaune/icon.svg'), 'utf8') : '';
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
    const near = gm ? others.map((g) => [g.id, dE(g.color, gm.color)]).sort((x, y) => x[1] - y[1])[0] : ['none', 0];
    ok(!!gm && near[1] >= 15 && 1.05 / (lumC(gm.color) + 0.05) >= 4.5 && html.indexOf("accent: '" + gm.color + "'") > 0,
      'the accent differs from every other game by ΔE ≥ 15 (nearest ' + near[0] + ', ' + (near[1] || 0).toFixed(1) + '), keeps white text at 4.5:1 and matches the page');
    ok(Date.now() - t0 < 3000, 'the Yellow Dwarf tests finish in under 3 s (' + (Date.now() - t0) + ' ms)');
  }
  return { testNainJaune };
};
