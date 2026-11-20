'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // #974: on a desktop screen the menu kept the 560px page, so the game grid stopped at four
  // columns with empty space either side. A wide, tall window gives the menu the wide page;
  // a turned phone (short window) keeps the narrow one.
  function testMenuWideOnDesktop() {
    head('Menu: a desktop window gives the menu the wide page (#974)');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const home = html.match(/function viewHome\(\) \{\s*\n\s*var page = el\('div', \{ class: '([^']*)' \}\);/);
    ok(!!home, 'viewHome creates its page element');
    ok(!!home && home[1].split(' ').includes('ch-page--home'), 'the home page carries ch-page--home');
    ok(/@media \(min-width: 1000px\) and \(min-height: 500px\) \{ \.ch-page--home \{ max-width: var\(--w-wide\); \} \}/.test(css),
      'from 1000px wide and 500px tall the home page takes --w-wide');
    const wide = css.match(/--w-wide:\s*(\d+)px/);
    ok(!!wide && +wide[1] >= 7 * 112 + 6 * 14 + 32, '--w-wide fits at least seven 112px tiles with their gaps and padding (' + (wide && wide[1]) + 'px)');
  }
  return { testMenuWideOnDesktop };
};
