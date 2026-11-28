'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;

  // #1274: after "See the board", the floating Result / New game bar lay over the bottom of the
  // page, so Number Drop's score, next block and best could not be read
  function testAfterBarRoom() {
    head('The after-game bar covers nothing (#1274)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const room = (core.match(/function afterBarRoom\(\) \{[\s\S]*?\n    \}\n/) || [''])[0];
    ok(room.length > 0, 'the core makes room for the bar');
    let resizes = 0;
    const main = { style: { paddingBottom: '' } };
    const win = { dispatchEvent: () => { resizes++; } };
    const run = (afterBar) => new Function('main', 'afterBar', 'getComputedStyle', 'window', 'Event', room + 'afterBarRoom();')(
      main, afterBar, () => ({ bottom: '16px' }), win, function Ev() {});
    if (room) run({ offsetHeight: 60 });
    ok(parseFloat(main.style.paddingBottom) >= 76, 'with the bar up, the game area ends above it (' + main.style.paddingBottom + ')');
    ok(resizes === 1, 'games that size a canvas themselves are told to lay out again');
    if (room) run(null);
    ok(main.style.paddingBottom === '' && resizes === 2, 'without the bar the game area gets its room back');
    const show = (core.match(/function showAfterBar\(o\) \{[\s\S]*?\n    \}\n/) || [''])[0];
    ok(/document\.body\.appendChild\(afterBar\);\s*afterBarRoom\(\);/.test(show), 'showing the bar makes the room');
    const drops = core.match(/afterBar\.remove\(\); afterBar = null;[^}\n]*/g) || [];
    ok(drops.length === 2 && drops.every((d) => /afterBarRoom\(\)/.test(d)), 'every way the bar goes away gives the room back (' + drops.length + ')');
  }
  return { testAfterBarRoom };
};
