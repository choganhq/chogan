'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testTowerUpCanvas() {
    head('Tower Up: software canvas (#1235)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/towerup/index.html'), 'utf8');
    // the first getContext of a canvas fixes its attributes, so every call on it is checked
    const calls = html.match(/cv\.getContext\([^)]*\)/g) || [];
    ok(calls.length > 0 && calls.every((c) => /willReadFrequently: true/.test(c) && /alpha: false/.test(c)),
      'the tower is drawn on an opaque software canvas, so a GPU glitch cannot mix old frames in');
  }
  return { testTowerUpCanvas };
};
