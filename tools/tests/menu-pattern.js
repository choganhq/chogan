'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT, LOCALE_CODES } = T;

  // #883: a faint pattern behind the menu, chosen in the Profile, six designs plus plain
  function testMenuPattern() {
    head('Menu background patterns (#883)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const early = fs.readFileSync(path.join(ROOT, 'www/lib/early.js'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const page = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const m = /var MENU_PATTERNS = \[([^\]]*)\]/.exec(core), e = /var MENU_PATTERNS = \[([^\]]*)\]/.exec(early);
    const ids = m ? m[1].split(',').map((x) => x.replace(/['\s]/g, '')) : [];
    ok(ids.length === 7 && ids[0] === 'dots' && ids.indexOf('none') > 0, 'the core lists dots (default), plain and five more designs (' + ids.join(',') + ')');
    ok(!!e && e[1] === m[1], 'early.js lists the same patterns, so a saved choice shows before the first paint');
    ids.forEach((id) => {
      ok(id === 'dots' || new RegExp(':root\\[data-pattern="' + id + '"\\]').test(css), 'CSS draws the "' + id + '" menu pattern');
      ok(new RegExp('\\.ch-patsw\\[data-pat="' + id + '"\\]').test(css), 'the "' + id + '" swatch is painted with its own pattern, not the active one');
    });
    ok(/body\.ch-menu \{ background-image: var\(--pat-img\)/.test(css), 'only the menu body takes the pattern; games stay plain');
    ok(/Chogan\.applyPattern\(\);/.test(core) && /Chogan\.setPattern = /.test(core) && /C\.setPattern\(o\.id\)/.test(page), 'the page sets it and the core applies it at boot');
    const keys = ['pattern', 'patternNone', 'patternDots', 'patternStripes', 'patternLattice', 'patternGrid', 'patternWaves', 'patternRings'];
    keys.forEach((k) => ok((core.match(new RegExp('[ ,]' + k + ": '[^']*'," + (k === 'pattern' ? ' patternNone' : ''), 'g')) || []).length === LOCALE_CODES.length, 'string "' + k + '" exists in every language'));
  }
  return { testMenuPattern };
};
