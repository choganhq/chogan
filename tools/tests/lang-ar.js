// Arabic, the eighth language (#855). The generic language checks only see that a key
// exists in every block; they would pass on an Arabic block filled with English or with
// Persian text, which reads almost the same to a non-reader but is wrong to an Arab. These
// checks ask for Arabic letters, and refuse the Persian-only letters (ی ک پ چ ژ گ and
// Persian digits) that slip in when a string is adapted from the Persian one.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  const ARABIC = /[\u0621-\u064A]/;
  const PERSIAN_ONLY = /[\u06CC\u06A9\u067E\u0686\u0698\u06AF\u06F0-\u06F9]/;
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  // the `code: {` blocks of a file at any indentation, in order
  function blocks(src, code) {
    const out = [];
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(new RegExp('^(\\s*)' + code + ': \\{\\s*$'));
      if (!m) continue;
      let j = i + 1;
      while (j < lines.length && !new RegExp('^' + m[1] + '\\},?\\s*$').test(lines[j])) j++;
      out.push(lines.slice(i + 1, j).join('\n'));
    }
    return out;
  }
  const keys = (t) => [...t.matchAll(/(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:\s*'/g)].map((m) => m[1]).sort().join(',');
  const values = (t) => [...t.matchAll(/:\s*'((?:\\.|[^'\\])*)'/g)].map((m) => m[1]);
  const arabicText = (s) => ARABIC.test(s) && !PERSIAN_ONLY.test(s);

  function testArabic() {
    head('Arabic, the eighth language (#855)');
    const core = read('www/lib/chogan.js');

    // listed, right to left, with Western digits
    const loc = (core.match(/\{ code: 'ar',[^}]*\}/) || [''])[0];
    ok(/label: 'العربية'/.test(loc) && /dir: 'rtl'/.test(loc) && /tag: 'ar'/.test(loc), 'Arabic is in LOCALES as «العربية», right to left (' + (loc || 'missing') + ')');
    ok(/date: 'ar-u-nu-latn'/.test(loc), 'Arabic dates use Western digits, like the games');
    const numFn = (core.match(/var FA_DIGITS = [^\n]*\n\s*Chogan\.num = function[\s\S]*?\n {2}\};/) || [''])[0];
    const sb = { Chogan: {}, state: { settings: { lang: 'ar' } }, out: null };
    vm.createContext(sb);
    if (numFn) vm.runInContext(numFn + '\nout = Chogan.num(2048);', sb);
    ok(sb.out === '2048', 'Chogan.num keeps 0-9 in Arabic (' + sb.out + ')');

    // core strings: every English key, in Arabic
    const coreEn = blocks(core, 'en')[0] || '', coreAr = blocks(core, 'ar')[0] || '';
    ok(coreEn.length > 0 && keys(coreAr) === keys(coreEn), 'the core has every string in Arabic');
    const ownLatin = /^(Chogan|Chogan Plus|commit|Play Games: \{name\}|.*Google Play.*|.*Play Games.*)$/;
    const notAr = values(coreAr).filter((v) => !arabicText(v) && !ownLatin.test(v));
    ok(coreAr.length > 0 && !notAr.length, 'core Arabic strings are in Arabic letters' + (notAr.length ? ' (not: ' + notAr.slice(0, 5).join(' | ') + ')' : ''));

    // the menu page
    const menu = read('www/index.html');
    const menuEn = blocks(menu, 'en')[0] || '', menuAr = blocks(menu, 'ar')[0] || '';
    ok(menuEn.length > 0 && keys(menuAr) === keys(menuEn), 'the menu has every string in Arabic');

    // games.json and each game's page
    const games = JSON.parse(read('www/games.json')).games;
    ok(games.length > 0, 'games.json lists games (' + games.length + ')');
    const badList = games.filter((g) => !g.name.ar || !g.summary.ar || !arabicText(g.name.ar) || !arabicText(g.summary.ar)).map((g) => g.id);
    ok(!badList.length, 'every game has an Arabic name and summary in Arabic letters' + (badList.length ? ' (not: ' + badList.join(', ') + ')' : ''));
    const names = new Set(games.map((g) => g.name.ar));
    ok(names.size === games.length, 'no two games share an Arabic name');
    const badPage = [], badName = [], badText = [];
    for (const g of games) {
      const src = read('www/' + g.path);
      const fr = blocks(src, 'fr'), ar = blocks(src, 'ar');
      if (!fr.length || fr.length !== ar.length || fr.some((b, i) => keys(b) !== keys(ar[i]))) badPage.push(g.id);
      // the page's own name object says the same as the menu
      const nm = (src.match(/(?:name: |NAME = )\{ fa: [^\n]*?\bar: '([^']*)'/) || [])[1];
      if (!nm || nm !== g.name.ar) badName.push(g.id + ' (' + nm + ')');
      if (!ar.length || ar.some((b) => PERSIAN_ONLY.test(b) || !ARABIC.test(b))) badText.push(g.id);
    }
    ok(!badPage.length, 'every game page has an Arabic block with the French block\'s keys' + (badPage.length ? ' (not: ' + badPage.join(', ') + ')' : ''));
    ok(!badName.length, 'every game page names itself as the menu does in Arabic' + (badName.length ? ' (not: ' + badName.join(', ') + ')' : ''));
    ok(!badText.length, 'game pages\' Arabic is in Arabic letters, without Persian-only letters' + (badText.length ? ' (not: ' + badText.join(', ') + ')' : ''));

    // awards
    const ach = core.match(/^ {4}\{ id: '[^']+',[^\n]*\}/gm) || [];
    const badAch = ach.filter((l) => { const t = (l.match(/\bar: '([^']*)'/) || [])[1], d = (l.match(/\bdar: '([^']*)'/) || [])[1]; return !t || !d || !arabicText(t) || !arabicText(d); })
      .map((l) => l.match(/id: '([^']+)'/)[1]);
    ok(ach.length > 100 && !badAch.length, 'every award has an Arabic title and description (' + ach.length + ' awards' + (badAch.length ? '; not: ' + badAch.slice(0, 8).join(', ') : '') + ')');

    // the store listing
    const dir = 'fastlane/metadata/android/ar/';
    const has = (f) => fs.existsSync(path.join(ROOT, dir, f));
    ok(has('title.txt') && has('short_description.txt') && has('full_description.txt'), 'an Arabic store listing exists');
    const full = has('full_description.txt') ? read(dir + 'full_description.txt').trim() : '';
    ok([...full].length > 1000 && [...full].length <= 4000 && arabicText(full.replace(/[^\u0600-\u06FF]/g, '')), 'the Arabic store text is Arabic and within 4000 characters (' + [...full].length + ')');
    const missing = games.filter((g) => full.indexOf('* ' + g.name.ar + ' ') < 0).map((g) => g.id);
    ok(full.length > 0 && !missing.length, 'the Arabic store text has a line for every game' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));
  }
  return { testArabic };
};
