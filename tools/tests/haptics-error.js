'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // #1041 (from #950): the buzz on an invalid move was two pulses, 112 ms in all, and a
  // player found it too strong. The browser takes only lengths, so "lighter" means one
  // short pulse, and it must stay a buzz the hand can still feel.
  function testHapticsErrorShort() {
    head('Haptics: the error buzz is one short pulse (#1041)');
    const js = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const src = js.match(/  var HAPTICS = \{[\s\S]*?\n  \};/);
    ok(!!src, 'the HAPTICS table is in the core');
    if (!src) return;
    const box = {};
    vm.runInNewContext(src[0] + '\nthis.h = HAPTICS;', box);
    const names = Object.keys(box.h);
    ok(names.length >= 6, 'the table has its patterns (' + names.join(', ') + ')');
    const e = Array.from(box.h.error || []);
    ok(e.length === 1, 'error is a single pulse (got ' + JSON.stringify(e) + ')');
    ok(e[0] >= 8 && e[0] <= 16, 'error lasts 8 to 16 ms (got ' + e[0] + ')');
    const total = (p) => Array.from(p).reduce((a, b) => a + b, 0);
    ok(total(e) < total(box.h.success), 'error is shorter than success (' + total(e) + ' < ' + total(box.h.success) + ')');
  }
  return { testHapticsErrorShort };
};
