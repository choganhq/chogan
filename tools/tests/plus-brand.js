'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  // Chogan Plus (choganhq/chogan-plus) runs this same www/ and marks its WebView's user
  // agent with "ChoganPlus". Before #689 it greeted players as Chogan and its about line
  // promised "fully offline". The core's own key swap runs here under both user agents.
  function testPlusBrand() {
    head('Chogan Plus names itself (#689)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const home = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const a = core.indexOf('  var PLUS = ');
    const b = core.indexOf('  Chogan.plus = PLUS;', a);
    ok(a > 0 && b > a, 'the core detects Chogan Plus and has brandKey');
    const tAt = core.indexOf('  Chogan.t = function (key, vars) {');
    ok(tAt > 0 && /^\s*key = brandKey\(key\);/.test(core.slice(tAt).split('\n')[1] || ''), 'Chogan.t swaps the key before any lookup');
    if (a > 0 && b > a) {
      const run = (ua) => {
        const sb = { global: { navigator: ua === null ? undefined : { userAgent: ua } } };
        vm.createContext(sb);
        vm.runInContext(core.slice(a, b) + '\nthis.brandKey = brandKey; this.plus = PLUS;', sb);
        return sb;
      };
      const web = run('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36');
      const app = run('Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36 ChoganPlus');
      const none = run(null);
      const keys = ['appName', 'welcomeTitle', 'welcomeSub', 'aboutText'];
      ok(!web.plus && !none.plus && app.plus === true, 'only the ChoganPlus user agent counts as Plus');
      ok(keys.every((k) => web.brandKey(k) === k && none.brandKey(k) === k), 'the web, PWA and F-Droid app keep their keys');
      ok(keys.every((k) => app.brandKey(k) === k + 'Plus'), 'Chogan Plus reads the Plus variant of each branded key');
      ok(app.brandKey('home') === 'home' && app.brandKey('daily') === 'daily', 'other keys stay as they are in Chogan Plus');
      ok(!run('Mozilla/5.0 NotChoganPlusX').plus, 'a word that only contains ChoganPlus does not count');
    }
    // Every Plus string exists once per language, in the file that holds its base key
    const count = (src, k) => (src.match(new RegExp('[ ,{]' + k + ": '", 'g')) || []).length;
    const want = [[core, 'appNamePlus'], [core, 'aboutTextPlus'], [home, 'welcomeTitlePlus'], [home, 'welcomeSubPlus']];
    const missing = want.filter(([src, k]) => count(src, k) !== LOCALE_CODES.length).map(([src, k]) => k + ' ' + count(src, k));
    ok(LOCALE_CODES.length > 0 && !missing.length, 'every Plus string exists in all ' + LOCALE_CODES.length + ' languages' + (missing.length ? ' (' + missing.join(', ') + ')' : ''));
    // Plus may need the internet for Play Games, so its own lines must not promise otherwise
    const plusLines = core.split('\n').concat(home.split('\n')).filter((l) => /(aboutTextPlus|welcomeSubPlus): '/.test(l));
    ok(plusLines.length > 0 && plusLines.every((l) => !/no internet|fully offline|بدون اینترنت\.'|کاملاً آفلاین/.test(l)), 'Plus texts do not promise an app without internet');
  }
  return { testPlusBrand };
};
