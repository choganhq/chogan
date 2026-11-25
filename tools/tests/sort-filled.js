'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // #1143: the menu's sort drop-down had a transparent background, so the striped menu
  // showed through it and it looked empty. It must be filled like the search box.
  function testSortFilled() {
    head('Menu: the sort drop-down is filled, not transparent (#1143)');
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const rule = css.match(/\n\.ch-sort \{([^}]*)\}/);
    ok(!!rule, 'the .ch-sort rule is in the core CSS');
    if (!rule) { ok(false, 'cannot check the background without the rule'); return; }
    const bg = (rule[1].match(/background(?:-color)?:\s*([^;]+);/) || [])[1];
    ok(!!bg, 'the .ch-sort rule sets a background');
    ok(bg && /^var\(--c-surface\)$/.test(bg.trim()), 'its background is the surface colour (got ' + bg + ')');
    const search = css.match(/\n\.ch-search \{([^}]*)\}/);
    const sbg = search && (search[1].match(/background:\s*([^;]+);/) || [])[1];
    ok(!!sbg && sbg.trim() === bg.trim(), 'it matches the search box background (' + sbg + ')');
  }
  return { testSortFilled };
};
