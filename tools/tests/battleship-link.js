'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, rng, fs, path, ROOT, LOCALE_CODES } = T;

  // Battleship over two phones (#755). Each phone keeps its own fleet; only shots and
  // replies cross the link, the defender's phone computes every reply, and after an app
  // switch a sync of the two shot lists must neither drop nor double a shot (#752).
  function testBattleshipLink() {
    head('Battleship: two phones, hidden fleets, resync (#755)');
    const E = loadEngine('battleship', 'BattleshipEngineFactory');
    const api = ['netGame', 'netTurn', 'netFire', 'netAnswer', 'netReply', 'netState', 'netSync', 'netReveal'];
    const missing = api.filter((k) => typeof E[k] !== 'function');
    ok(!missing.length, 'the engine has the two-phone protocol' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));
    if (missing.length) { ok(false, 'the two-phone engine checks could not run'); pageChecks(); return; }

    const N = E.N;
    const cellsKey = (ships) => ships.map((s) => E.cellsOf(s).join('.')).sort().join('|');
    const clone = (x) => JSON.parse(JSON.stringify(x));

    // Two phones joined by a link that can lose and repeat messages; `deliver` applies one
    // message the way the page does and returns what that phone sends back.
    function deliver(G, m) {
      if (m.t === 'shot') { const r = E.netAnswer(G, m.n, m.i); return r ? [r] : []; }
      if (m.t === 'reply') { E.netReply(G, m.n, m); return []; }
      return [];
    }
    function pick(G, R) {
      const free = [];
      for (let i = 0; i < N * N; i++) if (E.canFire(G.foe, i)) free.push(i);
      return free.length ? free[Math.floor(R() * free.length)] : -1;
    }
    // Plays a whole game. drop: chance a message is lost; dup: chance it arrives twice;
    // restart: chance a phone is killed and reloaded from its save (a JSON round trip).
    function play(seed, again, opt) {
      opt = opt || {};
      const R = rng(seed);
      const fa = E.randomFleet(rng(seed * 7 + 1)), fb = E.randomFleet(rng(seed * 7 + 2));
      const P = [E.netGame(fa, again, true), E.netGame(fb, again, false)];
      const wire = [];
      let leaked = false, steps = 0, dropped = 0, doubled = 0, restarts = 0;
      function send(from, list) {
        for (const m of list) {
          if (m.t === 'shot' && 'fleet' in m) leaked = true;
          if (m.t === 'reply' && m.fleet && !(P[from].winner === 'ai' && m.n === P[from].inn.length - 1)) leaked = true;
          if (m.t === 'reply' && m.r !== 'sunk' && m.cells) leaked = true;
          if (opt.drop && R() < opt.drop) { dropped++; continue; }
          wire.push([1 - from, m]);
          if (opt.dup && R() < opt.dup) { wire.push([1 - from, clone(m)]); doubled++; }
        }
      }
      function sync() {
        // as on every connect: both phones send their lists, each answers what it can
        const sa = E.netState(P[0]), sb = E.netState(P[1]);
        send(0, E.netSync(P[0], clone(sb)));
        send(1, E.netSync(P[1], clone(sa)));
      }
      while (!P[0].winner && !P[1].winner && steps < 2000) {
        steps++;
        if (opt.restart && R() < opt.restart) {
          const k = R() < 0.5 ? 0 : 1;
          P[k] = clone(P[k]);
          P[k].turn = E.netTurn(P[k]);
          restarts++;
          sync();
          continue;
        }
        if (wire.length) {
          const [to, m] = wire.shift();
          send(to, deliver(P[to], m));
          continue;
        }
        const who = E.netTurn(P[0]) === 'me' ? 0 : E.netTurn(P[1]) === 'me' ? 1 : -1;
        if (who < 0) { sync(); continue; }
        const i = pick(P[who], R);
        const m = E.netFire(P[who], i);
        if (!m) { sync(); continue; }
        send(who, [m]);
      }
      // let the last reply reach the winner
      for (let k = 0; k < 20 && !(P[0].winner && P[1].winner); k++) {
        while (wire.length) { const [to, m] = wire.shift(); send(to, deliver(P[to], m)); }
        if (!(P[0].winner && P[1].winner)) sync();
      }
      return { P, fa, fb, leaked, steps, dropped, doubled, restarts };
    }
    function agreed(run) {
      const [a, b] = run.P;
      const same = (x, y) => x.length === y.length && x.every((o, k) => o.i === y[k].i && o.r === y[k].r);
      return same(a.out, b.inn) && same(b.out, a.inn);
    }

    // A clean game
    const g1 = play(11, false);
    const [h, gst] = g1.P;
    ok(!!h.winner && !!gst.winner && ((h.winner === 'me') !== (gst.winner === 'me')),
      'a clean game ends with one winner both phones agree on (host ' + h.winner + ', guest ' + gst.winner + ')');
    ok(agreed(g1), 'each phone\'s shots are exactly the other\'s record of shots taken, in order');
    ok(!g1.leaked, 'no shot or reply carries a fleet or ship cells before a ship is sunk');
    const win = h.winner === 'me' ? h : gst, lose = h.winner === 'me' ? gst : h;
    const winFleet = h.winner === 'me' ? g1.fa : g1.fb, loseFleet = h.winner === 'me' ? g1.fb : g1.fa;
    ok(win.foe.ships.length === E.FLEET.length && cellsKey(win.foe.ships) === cellsKey(loseFleet),
      'the winner learnt the loser\'s whole fleet only through sunk replies, and it is the real one');
    ok(E.netState(lose).inn.every((x) => x.r === 'sunk' ? Array.isArray(x.cells) : !x.cells), 'only a sinking reply names cells');
    ok(lose.foe.ships.length < E.FLEET.length, 'the loser does not know the winner\'s whole fleet before the reveal');
    ok(!lose.reveal && E.netReveal(lose, winFleet) && cellsKey(lose.reveal) === cellsKey(winFleet),
      'the winner\'s real fleet is accepted at the end and drawn for the loser');

    // The defender's phone computes every reply: a reply that does not fit is refused
    {
      const A = E.netGame(g1.fa, false, true), B = E.netGame(g1.fb, false, false);
      const target = E.cellsOf(g1.fb[0])[0];
      const shot = E.netFire(A, target);
      ok(!!shot && shot.t === 'shot' && shot.n === 0 && E.netTurn(A) === 'wait', 'a shot waits for the other phone\'s reply');
      ok(E.netFire(A, (target + 1) % (N * N)) === null, 'no second shot while one waits for its reply');
      const rep = E.netAnswer(B, shot.n, shot.i);
      ok(!!rep && rep.r === 'hit' && rep.i === target && !rep.fleet && !rep.cells, 'the defender answers from its own board, without cells for a plain hit');
      ok(E.netReply(A, 0, { t: 'reply', n: 0, i: target + 1, r: 'hit' }) === false, 'a reply for another cell is refused');
      ok(E.netReply(A, 0, { t: 'reply', n: 0, i: target, r: 'sunk', cells: [target, target + 1, target + 2] }) === false,
        'a false "sunk" over cells never hit is refused');
      ok(E.netReply(A, 0, { t: 'reply', n: 0, i: target, r: 'boom' }) === false, 'an unknown result is refused');
      ok(E.netReply(A, 0, rep) && A.shots.me === 1 && A.foe.shots[target] === 2, 'the real reply is taken once');
      ok(E.netReply(A, 0, rep) === false && A.shots.me === 1, 'the same reply again changes nothing');
      ok(E.netTurn(A) === 'ai' && E.netTurn(B) === 'me', 'with one shot a turn the turn passes after a hit');
      const again = E.netAnswer(B, 0, target);
      ok(!!again && again.r === 'hit' && B.inn.length === 1 && B.shots.ai === 1, 'a repeated shot gets the same reply and is not applied twice');
      ok(E.netAnswer(B, 5, 0) === null && B.inn.length === 1, 'a shot out of order is dropped, not applied');
      ok(E.netFire(A, (target + 3) % (N * N)) === null && E.netAnswer(B, 1, 0) === null && B.inn.length === 1,
        'a phone can neither shoot nor be shot out of turn');
      ok(E.netReveal(A, g1.fb) === false, 'no reveal is taken before the game is lost');
      let other = null;
      for (let s = 1; s < 200 && !other; s++) {
        const f = E.randomFleet(rng(500 + s));
        if (E.shipAt(E.makeBoard(f), target) < 0) other = f;
      }
      ok(!!other, 'found a fleet with no ship on the hit cell');
      ok(E.netReveal(clone(Object.assign(A, { winner: 'ai' })), other) === false, 'a revealed fleet that contradicts the replies is refused');
      ok(E.netReveal(clone(A), g1.fb) === true, 'the real fleet that fits the replies is accepted');
    }

    // Hit again: a hit keeps the turn
    {
      const A = E.netGame(g1.fa, true, true), B = E.netGame(g1.fb, true, false);
      const t = E.cellsOf(g1.fb[0])[0];
      E.netReply(A, 0, E.netAnswer(B, 0, E.netFire(A, t).i));
      ok(E.netTurn(A) === 'me' && E.netTurn(B) === 'ai', 'with "hit again" a hit keeps the turn on both phones');
    }

    // A lossy, repeating link with phones killed and reloaded mid-game still ends the same
    let bad = 0, games = 0, drops = 0, dups = 0, restarts = 0;
    for (let s = 1; s <= 12; s++) {
      const run = play(100 + s, s % 2 === 0, { drop: 0.25, dup: 0.2, restart: 0.03 });
      games++; drops += run.dropped; dups += run.doubled; restarts += run.restarts;
      const [a, b] = run.P;
      const one = !!a.winner && !!b.winner && ((a.winner === 'me') !== (b.winner === 'me'));
      if (!one || !agreed(run) || run.leaked || a.shots.ai !== a.inn.length || b.shots.ai !== b.inn.length) bad++;
    }
    ok(games === 12 && drops > 0 && dups > 0 && restarts > 0,
      'the rough link really lost, repeated and restarted (' + drops + ' lost, ' + dups + ' repeated, ' + restarts + ' restarts)');
    ok(bad === 0, 'every game over the rough link ended with one winner and the same shot lists on both phones (' + bad + ' of ' + games + ' did not)');

    pageChecks();
  }

  function pageChecks() {
    const html = fs.readFileSync(path.join(ROOT, 'www/games/battleship/index.html'), 'utf8');
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8'));
    const games = Array.isArray(list) ? list : list.games;
    const bs = (games || []).find((g) => g.id === 'battleship');
    ok(!!bs && bs.link === true, 'games.json marks Battleship as a two-phone game');
    ok(/C\.link\.open\(\{\s*role: role, game: 'battleship'/.test(html), 'the page opens the link for Battleship');
    ok(/if \(C\.link\.available\(\) \|\| S\.mode === 'net'\)/.test(html), 'the two-phone choice shows only where the link exists');
    ok(/if \(!C\.link\.available\(\) \|\|[^\n]*\) return false;/.test(html), 'a two-phone save is not reopened where there is no link');
    ok(/mode: 'net', side: NET\.side, g: NET\.g/.test(html), 'a two-phone game is saved with its side and game number');
    ok(/if \(st === 'connected'\) \{[\s\S]{0,300}tx\(syncMsg\(\)\);/.test(html), 'every connect sends a sync');
    const a = html.indexOf('function showNetResult'), b = html.indexOf('function netNew');
    const res = a > 0 && b > a ? html.slice(a, b) : '';
    ok(!!res, 'the two-phone result is its own function');
    ok(!!res && !/achievements|C\.stats\.|S\.daily/.test(res), 'a two-phone game gives no awards, stats or daily record');
    const t = html.indexOf('function tapFoe'), u = html.indexOf('function after()');
    const tap = t > 0 && u > t ? html.slice(t, u) : '';
    ok(/if \(S\.mode === 'net'\) \{ netShoot\(idx\); return; \}/.test(tap), 'a tap on the rival\'s sea sends a shot instead of firing at a local fleet');
    const keys = ['vsAi', 'twoPhones', 'hostGame', 'joinGame', 'linkPick', 'linkSearching', 'linkConnected', 'linkLost',
      'linkMismatch', 'linkError', 'linkPermission', 'linkBluetooth', 'waitFleet', 'waitShot'];
    const short = keys.filter((k) => (html.match(new RegExp('\\b' + k + ": '[^']+'", 'g')) || []).length !== LOCALE_CODES.length);
    ok(!short.length, 'every two-phone string is in all ' + LOCALE_CODES.length + ' languages' + (short.length ? ' (not: ' + short.join(', ') + ')' : ''));
  }

  return { testBattleshipLink };
};
