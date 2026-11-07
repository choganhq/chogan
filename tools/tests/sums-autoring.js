'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, vm, ROOT, LOCALE_CODES } = T;
  // Sums rang the remaining digits of a finished line by itself, which is half of the
  // puzzle; the owner wants the player to ring them (#667). It stays as an option behind
  // the gear, off by default.
  function testSumsAutoRing() {
    head('Sums: finished lines are not ringed by themselves (#667)');
    const E = loadEngine('sums', 'SumsEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/sums/index.html'), 'utf8');
    // the same hand-made 3×3 as testSums: rows 3,10,10 and columns 7,2,14
    const P = { n: 3, d: [3, 5, 2, 4, 1, 6, 7, 2, 8], keep: [1, 0, 0, 1, 0, 1, 0, 1, 1] };
    Object.assign(P, E.targets(3, P.d, P.keep));
    ok(typeof E.ringDone === 'function', 'the engine has ringDone, the one place the automatic ring lives');
    // erase both extras of the first row: that row is done, its 3 is still open, and so is
    // the last column (its only extra is the 2), whose 6 and 8 are open
    const st = [0, 2, 2, 0, 0, 0, 0, 0, 0];
    const rung = typeof E.ringDone === 'function' ? E.ringDone(P, st) : st;
    ok(rung !== st && st.join() === '0,2,2,0,0,0,0,0,0', 'it returns a new state and leaves the one it was given alone');
    ok(rung.join() === '1,2,2,0,0,1,0,0,1', 'it rings the open digits of the finished row and column and nothing in the open lines (' + rung.join() + ')');

    // the page's own settle(), run with stand-ins for the rest of the page
    const m = html.match(/\n  function settle\(\) \{[\s\S]*?\n  \}\n/);
    ok(!!m, 'settle() is found in the page');
    if (!m) return;
    function play(prefs) {
      const S = Object.assign({}, P, { st: [0, 2, 2, 0, 0, 0, 0, 0, 0] });
      const box = { E, S, prefs, won: 0, render() {}, save() {}, win() { box.won++; } };
      vm.createContext(box);
      vm.runInContext(m[0] + '\nsettle();', box);
      return box;
    }
    const off = play({ n: 5 });
    ok(off.S.st[0] === 0, 'with no saved setting the finished row\'s digit stays for the player to ring (' + off.S.st.join() + ')');
    const on = play({ n: 5, autoRing: true });
    ok(on.S.st[0] === 1, 'with the setting on the game rings it, as before (' + on.S.st.join() + ')');
    // with the setting off, erasing the last extra digit does not end the puzzle: the owner
    // got the result window with a digit still un-ringed (#699)
    const last = play({ n: 5 });
    P.keep.forEach((k, i) => { if (!k) last.S.st[i] = 2; });
    vm.runInContext('settle();', last);
    ok(last.won === 0 && last.S.st.some((v) => v === 0), 'with the setting off the puzzle is not won while a digit that stays is un-ringed (#699)');
    P.keep.forEach((k, i) => { if (k) last.S.st[i] = 1; });
    vm.runInContext('settle();', last);
    ok(last.won === 1, 'ringing the last of them wins it');
    // with the setting on, the last erasure rings the rest and wins at once, as before
    const auto = play({ n: 5, autoRing: true });
    P.keep.forEach((k, i) => { if (!k) auto.S.st[i] = 2; });
    vm.runInContext('settle();', auto);
    ok(auto.won === 1 && auto.S.st.every((v) => v), 'with the setting on the last erasure rings the rest and wins (' + auto.S.st.join() + ')');
    // every language's help says the rings are part of the finish
    const rules = LOCALE_CODES.map((l) => ((html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')) || [])[1] || '').match(/rules: '([^']*)'/));
    ok(rules.length === LOCALE_CODES.length && rules.every((r) => r && /حلقه شوند|is ringed|zakreślone|圈上|einen Ring hat|tiene su aro/.test(r[1])),
      'the help names the rings in the finish in all ' + LOCALE_CODES.length + ' languages');

    ok(/var prefs = ctx\.store\.get\('prefs', null\);[\s\S]{0,200}prefs = \{ n: 5 \}/.test(html) && !/autoRing: true/.test(html),
      'a new player starts with the setting off');
    ok(/C\.ui\.switch\(!!prefs\.autoRing, function \(v\) \{ prefs\.autoRing = v; ctx\.store\.set\('prefs', prefs\);/.test(html),
      'the gear\'s switch saves the setting with the other preferences');
    ok(/C\.icon\('gear', 20\)/.test(html) && /addEventListener\('click', showSettings\)/.test(html), 'the setting sits behind a gear, not in the help');
    // every language names the switch and explains it
    const blocks = LOCALE_CODES.map((l) => [l, (html.match(new RegExp('\\n      ' + l + ': \\{([\\s\\S]*?)\\n      \\}')) || [])[1] || '']);
    const missing = blocks.filter(([, b]) => !/autoRingL: '/.test(b) || !/autoRingNote: '/.test(b)).map(([l]) => l);
    ok(blocks.length === LOCALE_CODES.length && blocks.every(([, b]) => b.length > 100) && !missing.length,
      'the switch and its note have a string in all ' + LOCALE_CODES.length + ' languages' + (missing.length ? '; missing in ' + missing.join(', ') : ''));
  }
  return { testSumsAutoRing };
};
