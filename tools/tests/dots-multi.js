'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;
  // #987: Dots and Boxes was two seats only. Three and four players share one
  // phone, any seat but the first may be the medium bot, 3×3 is too small for
  // four, and a save from before must still open as the two-seat game it was.
  function testDotsMulti() {
    head('Dots and Boxes: three and four players (#987)');
    const t0 = Date.now();
    const E = loadEngine('dots', 'DotsEngineFactory');
    const has = (k) => typeof E[k] === 'function';
    for (const k of ['newState', 'restore', 'seatsOf', 'isBot', 'nextTurn', 'sizeOk', 'leaders']) ok(has(k), 'the engine has ' + k);
    const newState = has('newState') ? E.newState : () => null;
    const restore = has('restore') ? E.restore : (v) => v;
    const seatsOf = has('seatsOf') ? E.seatsOf : () => ['h', 'b'];

    // A whole game played by the medium bot in every seat, through the same
    // applyEdge the page uses.
    function botGame(size, n, seed) {
      const seats = ['h'].concat(new Array(n - 1).fill('b'));
      const S = newState(size, 'multi', seats);
      const r = { started: !!S, ended: false, rotateOk: true, extraOk: true, extras: 0, seen: new Set() };
      if (!S) return r;
      const bd = E.makeBoard(size, size), rnd = rng(seed);
      let guard = 0;
      while (E.legalMoves(bd, S.edges).length && guard++ < 1000) {
        const who = S.turn;
        r.seen.add(who);
        const m = E.aiMove(bd, S.edges, S.owner, 'medium', rnd);
        if (m < 0 || S.edges[m]) { r.rotateOk = false; break; }
        const got = E.applyEdge(bd, S, m);
        if (got > 0) { r.extras++; if (S.turn !== who) r.extraOk = false; }
        else if (S.turn !== who % n + 1) r.rotateOk = false;
      }
      r.ended = E.legalMoves(bd, S.edges).length === 0;
      r.owned = S.owner.every((o) => o >= 1 && o <= n);
      r.sum = S.scores.slice(1).reduce((a, b) => a + b, 0);
      r.boxes = bd.boxes;
      r.counts = S.scores.slice(1).every((x, i) => x === S.owner.filter((o) => o === i + 1).length);
      r.slots = S.scores.length;
      return r;
    }
    for (const [n, seed] of [[3, 9871], [4, 9872]]) {
      const g = botGame(5, n, seed);
      ok(g.started, n + ' players on 5×5: a game starts');
      ok(g.ended, n + ' players: the bot-played game reaches the end');
      ok(g.owned === true && g.sum === g.boxes && g.counts === true, n + ' players: every box has an owner and the scores add up to ' + g.boxes + ' (' + g.sum + ')');
      ok(g.slots === n + 1, n + ' players: one score per seat');
      ok(g.rotateOk && g.seen.size === n, n + ' players: an empty line passes the turn to the next seat, round all ' + n + ' (' + g.seen.size + ' seen)');
      ok(g.extras > 0 && g.extraOk, n + ' players: closing a box keeps the turn (' + g.extras + ' times)');
    }

    // Four players refused on 3×3; three may play it, four may play 4×4
    ok(has('sizeOk') && E.sizeOk(3, 4) === false && E.sizeOk(4, 4) === true && E.sizeOk(3, 3) === true && E.sizeOk(3, 2) === true, 'sizeOk turns down only four players on 3×3');
    ok(newState(3, 'multi', ['h', 'b', 'b', 'b']) === null, 'no four-player game can start on 3×3');
    ok(!!newState(3, 'multi', ['h', 'b', 'b']) && !!newState(4, 'multi', ['h', 'h', 'b', 'h']), 'three on 3×3 and four on 4×4 start');

    // Undo goes back past bots to the last person's turn
    if (has('newState') && has('takeBack')) {
      const bd = E.makeBoard(4, 4);
      const S = E.newState(4, 'multi', ['h', 'b', 'h', 'b']);
      [0, 5, 10, 15].forEach((e) => E.applyEdge(bd, S, e));   // seats 1, 2, 3, 4 each draw one empty line
      ok(S.turn === 1, 'four empty lines bring the turn back to seat 1');
      ok(E.takeBack(bd, S) === 2 && S.turn === 3, 'undo steps over the bot in seat 4 to the person in seat 3');
    } else ok(false, 'takeBack across seats cannot run without newState');

    // Saves: an old two-seat save (no seats, three score slots) restores as before
    const bd5 = E.makeBoard(5, 5);
    const old = { size: 5, mode: 'ai', level: 'hard', daily: null, edges: new Array(bd5.E).fill(0), owner: new Array(bd5.boxes).fill(0), edgeOwner: {}, turn: 2, scores: [0, 2, 1], history: [{ e: 0, turn: 1, scores: [0, 0, 0], turnBoxes: 0 }], turnBoxes: 0, elapsed: 5000 };
    old.edges[0] = 1;
    const R = restore(JSON.parse(JSON.stringify(old)));
    ok(R.mode === 'ai' && !R.seats && seatsOf(R).join() === 'h,b' && R.turn === 2 && R.scores.join() === '0,2,1' && R.level === 'hard', 'an old vs-bot save restores with its turn, score and level');
    ok(has('isBot') && E.isBot(R, 2) && !E.isBot(R, 1), 'its second seat is still the bot');
    ok(seatsOf(restore({ ...old, mode: '2p' })).join() === 'h,h', 'an old two-player save is two people');
    E.applyEdge(bd5, R, 1);
    ok(R.turn === 1, 'an old save plays on, turns going 2 → 1');
    const multiSave = { ...old, mode: 'multi', seats: ['h', 'h', 'b', 'b'], scores: [0, 1, 0, 2, 0], turn: 3 };
    const M = restore(JSON.parse(JSON.stringify(multiSave)));
    ok(M.mode === 'multi' && seatsOf(M).join() === 'h,h,b,b' && M.turn === 3 && M.scores.join() === '0,1,0,2,0', 'a four-player save restores with its seats, turn and scores');
    ok(seatsOf(restore({ ...old, mode: 'multi', seats: 'x' })).length === 2, 'a broken seat list falls back to two seats');

    // Leaders: one, a shared lead, everyone
    const L = (scores) => (has('leaders') ? E.leaders({ mode: 'multi', seats: new Array(scores.length).fill('h'), scores: [0].concat(scores) }) : []).join();
    ok(L([3, 7, 7, 2]) === '2,3' && L([9, 4, 3]) === '1' && L([4, 4, 4, 4]) === '1,2,3,4', 'leaders finds a winner, a shared lead and a draw');

    // The page
    const html = fs.readFileSync(path.join(ROOT, 'www/games/dots/index.html'), 'utf8');
    ok(/var fresh = E\.newState\(size, mode, seats\);/.test(html), 'the page starts every game through newState');
    ok(/S = E\.restore\(v\);/.test(html), 'the page restores saves through restore');
    ok(/seats: S\.seats \|\| null,/.test(html), 'the save carries the seats');
    ok(/function busy\(\) \{ return E\.isBot\(S, S\.turn\) && !S\.done; \}/.test(html), 'any bot seat blocks touches while it plays');
    ok(/S\.mode === 'multi' \? 'medium' : S\.level/.test(html), 'bot seats of three and four players are the medium bot');
    ok(/if \(daily\) mode = 'ai';/.test(html) && /newGame\(5, 'ai', 'hard', dailyDate, d\.rng\)/.test(html), 'the daily stays two-seat against the hard bot');
    ok(/S\.turn === 1 && S\.mode !== 'multi'\) C\.achievements\.unlock\('dt-chain'\)/.test(html) && /if \(S\.mode === 'multi'\) \{ finishMulti\(\); return; \}/.test(html), 'awards stay two-player');
    ok(/if \(!E\.sizeOk\(n, seatN\(\)\)\) \{ sizeBtns\[i\]\.disabled = true;/.test(html), 'the size picker greys out 3×3 for four players');
    const colours = (html.match(/var P = \[null,[^\n]*/) || [''])[0].match(/#[0-9A-F]{6}/g) || [];
    ok(colours.length === 4 && new Set(colours).size === 4, 'four distinct player colours (' + colours.join(' ') + ')');

    // Every new string in every language
    const keys = ['nPlayers', 'seatHuman', 'seatBot', 'botN', 'playerN', 'tiedN', 'listSep', 'listAnd'];
    ok(LOCALE_CODES.length >= 9, 'the language list is not empty (' + LOCALE_CODES.length + ')');
    const missing = [];
    for (const code of LOCALE_CODES) {
      const at = html.indexOf('\n      ' + code + ': {\n');
      const block = at > 0 ? html.slice(at, html.indexOf('\n      }', at)) : '';
      for (const k of keys) if (!new RegExp('\\b' + k + ": '[^']+'").test(block)) missing.push(code + '.' + k);
    }
    ok(!missing.length, 'the new strings are in all ' + LOCALE_CODES.length + ' languages' + (missing.length ? ' (missing ' + missing.slice(0, 12).join(', ') + ')' : ''));
    for (const k of keys) ok(new RegExp("C\\.t\\('" + k + "'").test(html), 'C.t(\'' + k + '\') is used with a literal key');

    // #1007: the menu's "3–4 players" filter reads people from games.json, and
    // Dots still said 2 there after #987, so the four-seat game never showed up.
    const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8'));
    const entry = (cat.games || cat).filter((g) => g.id === 'dots');
    const seatMax = +((html.match(/var MAX_SEATS = (\d+);/) || [])[1] || 0);
    ok(entry.length === 1 && seatMax >= 3, 'games.json lists dots once and the page names its seat limit (' + seatMax + ')');
    ok(entry.length === 1 && entry[0].people === seatMax, 'games.json gives dots people ' + seatMax + ', as many as the page seats (' + (entry[0] && entry[0].people) + ')');

    const ms = Date.now() - t0;
    ok(ms < 3000, 'the group runs in under 3 s (' + ms + ' ms)');
  }
  return { testDotsMulti };
};
