'use strict';
module.exports = function (T) {
  const { ok, head } = T;
  const fs = require('fs'), path = require('path'), vm = require('vm');
  // #1210: on a real TV the climber barely moved left or right. A remote that sends a
  // press as a down and an up at once steered for no time at all, so the game's key code
  // is run here against such a press, with its own clock.
  function testHopRemote() {
    head('Hop: a remote press moves the climber (#1210)');
    const html = fs.readFileSync(path.join(T.ROOT, 'www/games/hop/index.html'), 'utf8');
    const from = html.indexOf('var MIN_PRESS'), to = html.indexOf("window.addEventListener('keydown'", from);
    ok(from > 0 && to > from, 'the key press code is found');
    if (from < 0 || to < from) return;
    let now = 0, timers = [];
    const box = {
      keys: { l: false, r: false }, Date: { now: () => now },
      setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms, id: timers.length + 1 }); return timers.length; },
      clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); }
    };
    vm.runInNewContext(html.slice(from, to) + '\nthis.press = press; this.release = release;', box);
    const pass = (ms) => { now += ms; timers.filter((t) => t.at <= now).forEach((t) => { t.fn(); box.clearTimeout(t.id); }); };
    box.press('l'); box.release('l');
    ok(box.keys.l === true, 'an instant press still steers after its key came up');
    pass(150); ok(box.keys.l === true, 'and goes on steering for a moment');
    pass(100); ok(box.keys.l === false, 'then stops');
    box.press('r'); pass(80); box.release('r');
    ok(box.keys.r === false, 'a quick keyboard tap stays as short as it was');
    box.press('r'); pass(500); box.release('r');
    ok(box.keys.r === false, 'a held key stops as soon as it is let go');
    box.press('l'); box.release('l'); box.press('r');
    ok(box.keys.l === false && box.keys.r === true, 'turning round drops the other side at once');
    ok(/keyup'[\s\S]{0,200}release\('l'\)[\s\S]{0,100}release\('r'\)/.test(html), 'key up goes through release');
  }
  return { testHopRemote };
};
