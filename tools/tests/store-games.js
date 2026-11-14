'use strict';
// Like the README in #188, the store descriptions stopped at chess: Hokm and
// Block Drop shipped in 0.4.0 without a line, and the text still said eighteen.
// Moved out of tools/test.js when French pushed it past its 1 MB guard (#794).
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testStoreGames() {
    head('Store text lists every game');
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    ok(games.length > 0, 'games.json lists games');
    for (const [lang, key] of [['en-US', 'en'], ['fa', 'fa'], ['zh-CN', 'zh'], ['de-DE', 'de'], ['es-ES', 'es'], ['pl-PL', 'pl'], ['fr-FR', 'fr'], ['ar', 'ar'], ['hi-IN', 'hi']]) {
      const text = fs.readFileSync(path.join(ROOT, 'fastlane/metadata/android', lang, 'full_description.txt'), 'utf8');
      const miss = games.filter((g) => text.indexOf('* ' + g.name[key].replace(/\u00ad/g, '') + ' ') < 0).map((g) => g.id);
      ok(!miss.length, lang + ': every game has a line in the store description' + (miss.length ? ' (missing: ' + miss.join(', ') + ')' : ''));
    }
  }
  return { testStoreGames };
};
