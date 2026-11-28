'use strict';
// #1274: the bar shown after closing the result floats over the bottom of the game, and
// Number Drop's score row sat under it. While the bar shows, the game area keeps its
// height free (padding of the bar's measured height), and it gives the room back after.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testAfterBarRoom() {
    head('The after-result bar keeps room for itself under the board (#1274)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const show = (core.match(/function showAfterBar\(o\) \{[\s\S]*?\n {4}\}\n/) || [''])[0];
    const drop = (core.match(/function dropAfterBar\(\) \{[\s\S]*?\n {4}\}\n/) || [''])[0];
    ok(show.length > 0 && drop.length > 0, 'chogan.js has showAfterBar and dropAfterBar');
    const append = show.indexOf('document.body.appendChild(afterBar)');
    ok(append > 0 && show.indexOf("setProperty('--afterbar-h', afterBar.offsetHeight + 'px')") > append &&
      show.indexOf("classList.add('ch-has-afterbar')") > append,
      'showing the bar measures it and marks the page');
    ok(/^\s*dropAfterBar\(\);\n\s*var go =/m.test(show), 'a second bar replaces the first through dropAfterBar');
    ok(/afterBar\.remove\(\); afterBar = null;/.test(drop) && /classList\.remove\('ch-has-afterbar'\)/.test(drop),
      'removing the bar gives the room back');
    const leftovers = (core.match(/afterBar\.remove\(\)/g) || []).length;
    ok(leftovers === 1, 'the bar is removed only through dropAfterBar (' + leftovers + ' removals)');
    const rule = (css.match(/\.ch-has-afterbar \.ch-gamemain \{([^}]*)\}/) || [, ''])[1];
    ok(/padding-bottom: calc\([^;]*var\(--safe-b\)[^;]*var\(--afterbar-h, \d+px\)\)/.test(rule),
      'the game area pads its bottom by the bar and the safe area');
  }
  return { testAfterBarRoom };
};
