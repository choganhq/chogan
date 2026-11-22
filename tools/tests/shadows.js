'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;

  // #1008: the menu filters and game icons looked flat on the owner's phone. Icons carry a
  // shadow at rest, the segmented control sits in an inset groove (no outer ring: the owner
  // found a ring plus the groove "too many frames"), and the dark theme has its own darker values.
  function testControlShadows() {
    head('Controls and icons carry a shadow in both themes (#1008)');
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    for (const tok of ['--sh-rest', '--sh-lift', '--sh-groove']) {
      const n = css.split(tok + ':').length - 1;
      ok(n === 3, tok + ' is defined for light, auto-dark and forced-dark (found ' + n + ')');
    }
    const groove = [...css.matchAll(/--sh-groove: ([^;]+);/g)].map((m) => m[1]);
    ok(groove.length === 3 && groove.every((g) => /^inset /.test(g) && !/ 0 0 0 1px/.test(g)),
      'the groove is an inset shadow only, with no outline ring');
    ok(/\.ch-games--grid \.ch-game__icon \{[^}]*box-shadow: var\(--sh-rest\)/.test(css), 'a game icon has the resting shadow');
    ok(/\.ch-seg \{[^}]*box-shadow: var\(--sh-groove\)/.test(css), 'the segmented control has the groove');
    ok(/\.ch-seg button\[aria-selected="true"\] \{[^}]*box-shadow: var\(--sh-lift\)/.test(css), 'the selected tab is lifted');
  }
  return { testControlShadows };
};
