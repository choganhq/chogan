'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  // Chogan Plus linked Chogan's privacy page, which says the app's only permission is
  // vibration and nothing leaves the phone; Plus holds the Nearby permissions and sends the
  // player's name and moves to the other phone (#695). Play needs a policy that is true.
  function testPrivacyPlus() {
    head('Chogan Plus has its own privacy page (#695)');
    const f = path.join(ROOT, 'www/privacy-plus.html');
    ok(fs.existsSync(f), 'www/privacy-plus.html exists');
    const html = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    ok(/<section lang="fa" dir="rtl">/.test(html) && /<section lang="en" dir="ltr">/.test(html), 'Persian and English sections');
    ok(/choganhq@gmail\.com/.test(html) && /policies\.google\.com\/privacy/.test(html), 'contact email and Google\'s privacy policy are linked');
    ok(/Nearby Connections/.test(html) && /Bluetooth/.test(html) && /location/.test(html), 'the page names Nearby, Bluetooth and the location permission');
    ok(html.length > 0 && !/only permission is vibration|تنها اجازه‌اش لرزش/.test(html), 'the page does not repeat Chogan\'s vibration-only claim');
    // The page's own scripts (theme, bar, language order) must be Chogan's, so privacy-lang's
    // checks hold for this page too
    const base = fs.readFileSync(path.join(ROOT, 'www/privacy.html'), 'utf8');
    const scripts = (s) => [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
    ok(html.length > 0 && scripts(html) === scripts(base), 'the page runs the same scripts as privacy.html');
    const sw = fs.readFileSync(path.join(ROOT, 'www/sw.js'), 'utf8');
    ok(/'\.\/privacy-plus\.html'/.test(sw), 'the service worker precaches privacy-plus.html');
    const menu = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    ok(/href: Chogan\.plus \? 'privacy-plus\.html' : 'privacy\.html'/.test(menu), 'the profile links Plus to its own page and Chogan to privacy.html');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(/var PLUS_KEYS = \{[^}]*privacyNone: 1/.test(core), 'the "no data collected" label has a Plus variant');
    const n = (menu.match(/[ ,{]privacyNonePlus: '/g) || []).length;
    ok(LOCALE_CODES.length > 0 && n === LOCALE_CODES.length, 'privacyNonePlus exists in all ' + LOCALE_CODES.length + ' languages (' + n + ')');
  }
  return { testPrivacyPlus };
};
