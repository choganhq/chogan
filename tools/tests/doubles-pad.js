'use strict';
// #745: Doubles could only be played by swipe or keyboard; a mouse player had to drag every move.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT, LOCALE_CODES } = T;
  function testDoublesPad() {
    head('Doubles arrow pad (#745)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/doubles/index.html'), 'utf8');
    const dirs = { up: 'mvUp', down: 'mvDown', left: 'mvLeft', right: 'mvRight' };
    ok(/\.db-pad\s*\{[^}]*display:\s*none/.test(html), 'the pad is hidden by default, so a phone keeps the room');
    ok(/@media \(hover: hover\) and \(pointer: fine\)\s*\{\s*\.db-pad\s*\{\s*display:\s*grid/.test(html), 'the pad appears only where a mouse is the main pointer');
    ok(/\.db-pad\s*\{[^}]*direction:\s*ltr/.test(html), 'left stays on the left in Persian');
    ok(/addEventListener\('click', function \(\) \{ go\(dir\); \}\)/.test(html), 'a button moves through the same go() as a swipe');
    for (const [dir, key] of Object.entries(dirs)) {
      ok(html.includes(`arrowBtn('${dir}', C.t('${key}'))`), `the ${dir} button has its own label`);
      ok(new RegExp(`\\.db-arrow--${dir}\\s*\\{[^}]*grid-area:\\s*${dir}`).test(html), `the ${dir} button sits in its place on the pad`);
    }
    ok(LOCALE_CODES.length > 0, 'the language list is not empty');
    for (const code of LOCALE_CODES) {
      const m = html.match(new RegExp(`\\n {6}${code}: \\{\\n {8}(mvUp:[^\\n]*)\\n`));
      ok(!!m, `${code}: has the arrow labels`);
      if (!m) continue;
      const labels = Object.values(dirs).map((k) => (m[1].match(new RegExp(`${k}: '([^']+)'`)) || [])[1]);
      ok(labels.every(Boolean) && new Set(labels).size === 4, `${code}: four different arrow labels`);
    }
  }
  return { testDoublesPad };
};
