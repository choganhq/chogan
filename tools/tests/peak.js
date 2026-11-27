'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT, LOCALE_CODES, loadEngine } = T;
  // test.js is at its 1 MB guard, so Peak's later checks live here
  function testPeakAuto() {
    head('Peak: automatic last card (#1097)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/peak/index.html'), 'utf8');
    // #1097: a lone last card is played without a tap on your turn, unless turned off
    // behind the gear; both turn starts (with and without a card leaving) reach it
    const autoFn = (html.match(/function autoLast\(\) \{[\s\S]*?\n  \}/) || [''])[0];
    ok(/function autoOn\(\) \{ return prefs\.auto !== false; \}/.test(html) && /S\.hands\[0\]\.length !== 1/.test(autoFn) && /humanPlay\(S\.hands\[0\]\[0\]\)/.test(autoFn) && /busy\(\)/.test(autoFn),
      'a lone last card plays itself when the choice is on, and waits for an open dialog');
    const humFn = (html.match(/function startHuman\(\) \{[\s\S]*?\n  \}/) || [''])[0];
    ok((humFn.match(/autoLast\(\)/g) || []).length === 2, 'both ways into your turn check for a lone last card');
    ok(/C\.onResume\(function \(\) \{[^\n]*else if \(S\) autoLast\(\);/.test(html), 'coming back to the app on your turn plays a lone last card too (the pause stops its timer)');
    const pkSet = (html.match(/function showSettings\(\) \{[\s\S]*?\n  \}/) || [''])[0];
    ok(/C\.t\('pkAuto'\)/.test(pkSet) && /prefs\.auto = v; ctx\.store\.set\('prefs', prefs\);/.test(pkSet), 'the gear offers the automatic last card and saves it');
    const pkStr = LOCALE_CODES.map((l) => (html.match(new RegExp('\\n      ' + l + ': \\{[\\s\\S]*?\\n      \\}')) || [''])[0]);
    ok(pkStr.length > 0 && pkStr.every((b) => /pkAuto: '[^']+'/.test(b) && /pkAutoOn: '[^']+'/.test(b) && /pkAutoOff: '[^']+'/.test(b)), 'the automatic last card is labelled in every language');
  }
  // #1257: the original rules send every joined card through together
  function testPeakPushTogether() {
    head('Peak: joined cards push through together (#1257)');
    const E = loadEngine('peak', 'PeakEngineFactory');
    const G = E.make([[2], [3], [4], [5]], [9], [6, 6, 17, 6]);
    const ev = E.begin(G);
    ok(ev.filter((e) => e.t === 'clear').map((e) => e.p).join() === '0,1,3' && G.table.join() === '0,0,17,0' && G.discard.join() === '6,6,6', 'every card of the pushed number leaves, others stay');
    ok(G.hands.every((h) => h.length === 1) && !ev.some((e) => e.t === 'draw') && !E.over(G) && E.legal(G).join() === '2', 'nobody draws and the player whose turn it is plays on');
    const W = E.make([[], [], [4], [5]], [9], [6, 6, 0, 6]);
    const wv = E.begin(W);
    ok(E.over(W) && W.winners.join() === '0,1' && wv.filter((e) => e.t === 'win').length === 1, 'partners who run out together share the win');
    const O = E.make([[2], [], [4], [5]], [9], [6, 6, 0, 0]);
    E.begin(O);
    ok(O.winners.join() === '1', 'a partner can win on another player\'s turn');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/peak/index.html'), 'utf8');
    ok((html.match(/topTogether: '[^']*\{n\}[^']*'/g) || []).length === LOCALE_CODES.length && /function topTitle/.test(html), 'a shared win is worded in every language');
  }
  return { testPeakAuto, testPeakPushTogether };
};
