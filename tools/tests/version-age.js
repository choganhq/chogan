'use strict';
// Split out of tools/test.js, which reached the 1 MB guard (#654).
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // "3 hours ago" beside the version (#659). The core's own code runs here with a
  // fixed clock, so each answer is compared with an intended string, not with itself.
  function testVersionAge() {
    head('Profile: how old this build is (#659)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const cut = (from, to) => { const a = core.indexOf(from), b = core.indexOf(to, a); return a >= 0 && b > a ? core.slice(a, b) : ''; };
    const locales = cut('  var LOCALES = [', '  Chogan.locales = ');
    const num = cut('  var FA_DIGITS = ', '  Chogan.time = ');
    const ago = cut('  var AGO_UNITS = ', '  Chogan.applyLang = ');
    const built = (core.match(/^  Chogan\.builtAt = .*$/m) || [])[0] || '';
    ok(!!locales && !!num && !!ago && !!built, 'the age formatter and Chogan.builtAt are in the core');
    if (!(locales && num && ago && built)) return;
    const state = { settings: { lang: 'en' } };
    const sb = { state, Chogan: {}, Intl, Date, global: {} };
    vm.createContext(sb);
    vm.runInContext(locales + num + ago, sb);
    const C = sb.Chogan;
    const T = '2026-11-06T18:00:00Z', at = Date.parse(T);
    const H = 3600e3, D = 864e5;
    const cases = [
      ['en', 20e3, 'now'], ['en', 5 * 60e3, '5 minutes ago'], ['en', 3 * H, '3 hours ago'],
      ['en', 26 * H, 'yesterday'], ['en', 3 * D, '3 days ago'], ['en', 9 * D, 'last week'],
      ['en', 40 * D, 'last month'], ['en', 400 * D, 'last year'],
      ['fa', 3 * H, '۳ ساعت پیش'], ['de', 3 * H, 'vor 3 Stunden'], ['es', 3 * D, 'hace 3 días'],
      ['pl', 3 * H, '3 godziny temu'], ['zh', 3 * H, '3小时前']
    ];
    for (const [l, dt, want] of cases) {
      state.settings.lang = l;
      const got = C.ago(T, at + dt);
      ok(got === want, l + ', ' + Math.round(dt / 1000) + ' s after the deploy: "' + want + '" (' + got + ')');
    }
    // A bare release day counts whole local days, never hours
    state.settings.lang = 'en';
    const noonOf = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
    ok(C.ago('2026-11-06', noonOf(2026, 11, 6)) === 'today', 'release day, same day: "today" (' + C.ago('2026-11-06', noonOf(2026, 11, 6)) + ')');
    ok(C.ago('2026-11-06', new Date(2026, 10, 7, 0, 30).getTime()) === 'yesterday', 'release day, half past midnight next day: "yesterday"');
    ok(C.ago('2026-11-06', noonOf(2026, 11, 10)) === '4 days ago', 'release day, four days on: "4 days ago" (' + C.ago('2026-11-06', noonOf(2026, 11, 10)) + ')');
    ok(C.ago(T, at - 5 * 60e3) === 'now', 'a clock behind the deploy says "now", not "in 5 minutes"');
    for (const badv of ['', 'yesterday', '2026-11-06 18:00', "2026-11-06T18:00:00Z'"]) ok(C.ago(badv, at) === '' && C.exactDate(badv) === '', 'an invalid time shows nothing: ' + JSON.stringify(badv));
    ok(/2026/.test(C.exactDate(T)) && /2026/.test(C.exactDate('2026-11-06')), 'the exact date is there for the tooltip (' + C.exactDate(T) + ')');
    // Old WebViews without Intl.RelativeTimeFormat get the plain date
    const old = { state: { settings: { lang: 'en' } }, Chogan: {}, Intl: { DateTimeFormat: Intl.DateTimeFormat }, Date, global: {} };
    vm.createContext(old);
    vm.runInContext(locales + num + ago, old);
    const oldTxt = old.Chogan.ago(T, at + 3 * H);
    ok(oldTxt !== '' && oldTxt === old.Chogan.exactDate(T), 'without RelativeTimeFormat the row shows the date (' + oldTxt + ')');
    // The web stamp wins; the Android app falls back to the release day; junk shows nothing
    const pick = (g) => { const b = { Chogan: {}, global: g }; vm.createContext(b); vm.runInContext(ago + built, b); return b.Chogan.builtAt; };
    ok(pick({ APP_DEPLOYED_AT: T, APP_RELEASED: '2026-11-01' }) === T, 'web: the deploy stamp is used');
    ok(pick({ APP_RELEASED: '2026-11-01' }) === '2026-11-01', 'Android: the release day is used');
    ok(pick({ APP_DEPLOYED_AT: '<b>', APP_RELEASED: 'x' }) === '', 'nothing valid: no age is shown');
    const page = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    ok(/C\.builtAt \? el\('span', \{ class: 'ch-version__age ch-dim', title: C\.exactDate\(C\.builtAt\), text: C\.ago\(C\.builtAt\) \}\)/.test(page), 'the Profile version row shows the age with the exact date as its title');
  }
  return { testVersionAge };
};
