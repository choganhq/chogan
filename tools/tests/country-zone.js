'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // #977: a first run left the country empty although the device knows its time zone. The
  // menu now reads the zone name locally and looks it up in a table, never online.
  function testCountryFromZone() {
    head('Profile: a first run picks the country from the time zone (#977)');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const js = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const src = html.match(/  var TZ_COUNTRY = '[^']*';\n  function countryOfZone\(tz\) \{[\s\S]*?\n  \/\/ end countryOfZone/);
    ok(!!src, 'the zone table and countryOfZone are in the menu');
    if (!src) return;
    const box = {};
    vm.runInNewContext(src[0] + '\nthis.f = countryOfZone; this.t = TZ_COUNTRY;', box);
    const f = box.f;
    const rows = box.t.split(';');
    ok(rows.length > 200, 'the table names many countries (' + rows.length + ')');
    const codes = js.match(/var COUNTRY_CODES = '([^']*)'/)[1].split(' ');
    const bad = rows.map((r) => r.split(' ')[0]).filter((c) => !codes.includes(c));
    ok(!bad.length, 'every country in the table is in the profile list' + (bad.length ? ' (not: ' + bad.join(', ') + ')' : ''));
    const zones = rows.flatMap((r) => r.split(' ').slice(1));
    ok(new Set(zones).size === zones.length, 'no zone is listed under two countries');
    const cases = [['Asia/Tehran', 'IR'], ['America/Toronto', 'CA'], ['America/New_York', 'US'], ['Asia/Kolkata', 'IN'],
      ['Asia/Calcutta', 'IN'], ['Europe/Kyiv', 'UA'], ['Europe/Kiev', 'UA'], ['Europe/Berlin', 'DE'], ['Asia/Shanghai', 'CN'],
      ['Europe/Warsaw', 'PL'], ['America/Argentina/Buenos_Aires', 'AR'], ['UTC', ''], ['Etc/GMT-3', ''], ['', ''], [undefined, ''], ['Asia', '']];
    for (const [z, want] of cases) ok(f(z) === want, String(z) + ' → ' + (want || 'none') + ' (got ' + (f(z) || 'none') + ')');
    // only a first run guesses, and only into an empty box
    ok(/if \(!C\.store\.get\('welcomeSeen', false\)\) \{\n    if \(!C\.state\.profile\.country\) \{/.test(html),
      'the guess runs only before the welcome is seen and only when no country is set');
    ok(!/fetch\([^)]*(ip|geo)/i.test(html), 'no network lookup for the country');
  }
  return { testCountryFromZone };
};
