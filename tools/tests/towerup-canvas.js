'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // #1235: the software canvas stopped a flicker on one phone but moved less smoothly on
  // another, so the owner made it a switch behind the gear, off by default.
  function testTowerUpCanvas() {
    head('Tower Up: GPU canvas by default, flicker fix behind the gear (#1235)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/towerup/index.html'), 'utf8');
    // the first getContext of a canvas fixes its attributes, so every call on it is checked
    const calls = html.match(/cv\.getContext\(.*?;/g) || [];
    ok(calls.length > 0 && calls.every((c) => /prefs\.noFlash \? \{ alpha: false, willReadFrequently: true \} : \{ alpha: false \}/.test(c)),
      'the software canvas is used only when the flicker fix is on');
    ok(/prefs\.noFlash = prefs\.noFlash === true;/.test(html), 'the fix is off for new and older saves');
    ok(/C\.ui\.switch\(prefs\.noFlash,[\s\S]{0,300}box\.replaceChild\(next, cv\)/.test(html), 'switching it swaps in a new canvas, so it takes effect at once');
    ok((html.match(/flashL: '/g) || []).length === 11 && (html.match(/flashNote: '/g) || []).length === 11, 'the switch is named and explained in all 11 languages');
  }
  return { testTowerUpCanvas };
};
