'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;

  // #1144: with three or four players on one phone, every seat after the first read
  // "Player 2", "Player 3"… and could not be renamed; only the two-player game let
  // player 2 have a name. Each human seat now keeps its own name.
  function testDotsNames() {
    head('Dots and Boxes: name every human seat (#1144)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/dots/index.html'), 'utf8');
    const fnSrc = (name) => {
      const at = html.indexOf('function ' + name + '(');
      if (at < 0) return '';
      let d = 0;
      for (let i = html.indexOf('{', at); i < html.length; i++) {
        if (html[i] === '{') d++;
        else if (html[i] === '}' && --d === 0) return html.slice(at, i + 1);
      }
      return '';
    };
    const pnameSrc = fnSrc('pname');
    ok(pnameSrc.length > 0, 'pname is in the page');
    const mk = (S, prefs) => {
      const fakeC = { state: { profile: { name: 'Sara' } }, t: (k, o) => '<' + k + (o && o.n ? ' ' + o.n : '') + '>', num: (n) => String(n) };
      try {
        return vm.runInNewContext('(function (C, S, prefs) { ' + pnameSrc + ' return pname; })', {})(fakeC, S, prefs);
      } catch (e) { ok(false, 'pname did not run: ' + e.message); return () => undefined; }
    };
    const multi = { mode: 'multi', seats: ['h', 'h', 'b', 'h'] };
    const named = mk(multi, { p2name: 'Ali', p3name: 'Reza', p4name: 'Mina' });
    ok(named(1) === 'Sara', 'seat 1 is still the profile name (' + named(1) + ')');
    ok(named(2) === 'Ali', 'a human seat 2 shows its saved name (' + named(2) + ')');
    ok(named(4) === 'Mina', 'a human seat 4 shows its saved name (' + named(4) + ')');
    ok(named(3) === '<botN 3>', 'a bot seat stays "Bot 3" even with a saved name (' + named(3) + ')');
    const plain = mk(multi, { p2name: '' });
    ok(plain(2) === '<playerN 2>' && plain(4) === '<playerN 4>', 'with no saved name the seats read "Player n" as before');
    ok(mk({ mode: '2p' }, { p2name: 'Ali' })(2) === 'Ali', 'the two-player game keeps its player-2 name');

    // the page must offer the rename on those seats, not only on player 2 in 2p
    const draw = fnSrc('drawPlayers');
    ok(draw.length > 0, 'drawPlayers is in the page');
    ok(/canRename\(p\)/.test(draw) && /renamePlayer\(p\)/.test(draw), 'a tap on a renamable seat opens the rename for that seat');
    const can = fnSrc('canRename');
    ok(can.length > 0, 'canRename is in the page');
    const canFn = (S) => { try { return vm.runInNewContext('(function (S) { ' + can + ' return canRename; })', {})(S); } catch (e) { ok(false, 'canRename did not run: ' + e.message); return () => false; } };
    const cm = canFn({ mode: 'multi', seats: ['h', 'h', 'b', 'h'], daily: false });
    ok(!cm(1) && cm(2) && !cm(3) && cm(4), 'multi: human seats 2 and 4 are renamable, seat 1 (profile) and the bot are not');
    ok(canFn({ mode: '2p', daily: false })(2) && !canFn({ mode: 'ai', daily: false })(2), 'two players: player 2 renamable; vs the bot: not');
    ok(!canFn({ mode: 'multi', seats: ['h', 'h', 'h'], daily: true })(2), 'never in the daily game');
    const strings = (html.match(/ renameN: '[^']*\{n\}[^']*'/g) || []).length;
    ok(strings === LOCALE_CODES.length, 'the "renameN" title has {n} in every language (' + strings + ' of ' + LOCALE_CODES.length + ')');
  }
  return { testDotsNames };
};
