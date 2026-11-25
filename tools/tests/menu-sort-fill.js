'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;

  // #1143: the sort box was transparent, so the menu's pattern showed through it and it
  // read as an outline beside the filled search field below it.
  function testMenuSortFill() {
    head('Menu sort box is filled like the search field (#1143)');
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const rule = (sel) => { const m = new RegExp('(?:^|\\n)' + sel.replace(/[.]/g, '\\.') + ' \\{([^}]*)\\}').exec(css); return m ? m[1] : ''; };
    const sort = rule('.ch-sort'), search = rule('.ch-search');
    ok(sort.length > 0 && search.length > 0, 'both rules were found in chogan.css');
    const bg = (r) => (/background(?:-color)?:\s*([^;]+);/.exec(r) || [])[1];
    ok(!!bg(sort) && !/transparent|none/.test(bg(sort)), 'the sort box has a solid background (' + bg(sort) + ')');
    ok(bg(sort) === bg(search), 'it uses the same surface as the search field (' + bg(sort) + ' vs ' + bg(search) + ')');
  }
  return { testMenuSortFill };
};
