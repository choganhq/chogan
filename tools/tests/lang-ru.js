'use strict';
// Russian, the tenth language (#1065, requested in #1024): left to right, Cyrillic, Western
// digits, and a bundled Cyrillic face of Nunito, because Vazirmatn has no Cyrillic and Linux
// and ChromeOS often have no good system font for it.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  const DEVA = /[А-яЁё]/;
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // A language block `ru: { … }` at 4 to 8 spaces, as testLocales reads them, but reading
  // double-quoted values too ("{n}'s turn"), so no English key escapes the comparison.
  const dictOf = (src, code) => {
    const m = src.match(new RegExp('\\n\\s{4,8}' + code + ':\\s*\\{'));
    if (!m) return null;
    let i = src.indexOf('{', m.index), depth = 0, j = i;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    const out = {}, re = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
    let x;
    while ((x = re.exec(src.slice(i, j)))) out[x[1]] = x[2] !== undefined ? x[2] : x[3];
    return out;
  };
  const holes = (t) => (t.match(/\{[a-z]+\}/g) || []).sort().join();
  // Every English string with words gets Cyrillic; names, key labels and units may stay
  const wordy = (en) => /[A-Za-z]{3}/.test(en.replace(/\{[a-z]+\}|Ctrl|Shift|Space|Enter|Esc|Tab|Chogan( Plus)?|Play Games|Google|GitHub|Telegram|Android|Lichess|km\/h|mph|km|PNG|JPG|WebP|MP4|WebM|MOV|MB/g, ''));
  function compare(label, src) {
    const en = dictOf(src, 'en') || {}, ru = dictOf(src, 'ru');
    ok(!!ru, label + ': has a Russian dictionary');
    if (!ru) return;
    const keys = Object.keys(en);
    const miss = keys.filter((k) => !(k in ru));
    const stray = Object.keys(ru).filter((k) => !(k in en));
    ok(keys.length > 0 && !miss.length && !stray.length, label + ': ru has exactly the English keys (' + keys.length + ')' + (miss.length ? '; missing ' + miss.join(',') : '') + (stray.length ? '; extra ' + stray.join(',') : ''));
    const badHoles = keys.filter((k) => k in ru && holes(en[k]) !== holes(ru[k]));
    ok(!badHoles.length, label + ': ru placeholders match English' + (badHoles.length ? ' (' + badHoles.join(',') + ')' : ''));
    const latin = keys.filter((k) => k in ru && wordy(en[k]) && !DEVA.test(ru[k]));
    ok(!latin.length, label + ': every worded string is in Cyrillic' + (latin.length ? ' (' + latin.join(',') + ')' : ''));
    // invisible joiners split a run between fonts and break the shaping of a conjunct
    const joiners = keys.filter((k) => k in ru && /[‌‍]/.test(ru[k]));
    ok(!joiners.length, label + ': no ZWJ or ZWNJ in ru' + (joiners.length ? ' (' + joiners.join(',') + ')' : ''));
  }

  function testRussian() {
    head('Russian (#1065)');
    ok(LOCALE_CODES.indexOf('ru') >= 0, 'ru is one of the test languages');
    const core = read('www/lib/chogan.js');
    const table = (core.match(/var LOCALES = \[([\s\S]*?)\];/) || [])[1] || '';
    ok(/\{ code: 'ru', label: 'Русский',\s+dir: 'ltr', tag: 'ru',\s+date: 'ru-RU' \}/.test(table), 'LOCALES lists Russian, left to right, dates with Western digits');
    const fn = (core.match(/function deviceLang\(\)[\s\S]*?\n  \}/) || [])[0];
    ok(!!fn, 'deviceLang found');
    if (fn) {
      for (const [tag, want] of [['ru-RU', 'ru'], ['ru', 'ru'], ['en-IN', 'en']]) {
        const sb = { out: null, global: { navigator: { languages: [tag], language: tag } } };
        vm.createContext(sb);
        vm.runInContext(fn + '\nout = deviceLang();', sb);
        ok(sb.out === want, 'a ' + tag + ' device opens in ' + want + ' (got ' + sb.out + ')');
      }
    }
    const num = (core.match(/Chogan\.num = function \(v\) \{[\s\S]*?\n  \};/) || [])[0];
    ok(!!num, 'Chogan.num found');
    if (num) {
      const sb = { Chogan: {}, state: { settings: { lang: 'ru' } }, FA_DIGITS: '۰۱۲۳۴۵۶۷۸۹' };
      vm.runInNewContext(num + ';this.out = Chogan.num(2048);', sb);
      ok(sb.out === '2048', 'numbers keep Western digits in Russian (' + sb.out + ')');
    }

    compare('www/lib/chogan.js', core);
    compare('www/index.html', read('www/index.html'));

    const games = JSON.parse(read('www/games.json')).games;
    ok(games.length > 0, 'games listed (' + games.length + ')');
    const names = new Set();
    for (const g of games) {
      ok(DEVA.test(g.name.ru || '') && DEVA.test(g.summary.ru || ''), g.id + ': games.json has a Russian name and summary');
      names.add(g.name.ru);
      const src = read('www/' + g.path);
      compare(g.id, src);
      const m = src.match(/\n    name: (\{[^\n]*\}),\n/) || src.match(/\n  var NAME = (\{[^\n]*\});\n/);
      let obj = null;
      try { obj = m ? vm.runInNewContext('(' + m[1] + ')') : null; } catch (e) { obj = null; }
      ok(!!obj && obj.ru === g.name.ru, g.id + ': the page names the game as games.json does (' + (obj && obj.ru) + ')');
    }
    ok(names.size === games.length, 'every game has its own Russian name (' + names.size + ' of ' + games.length + ')');

    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[^']+',.*den: '/.test(l));
    ok(ach.length > 200, 'awards read (' + ach.length + ')');
    const noHi = ach.filter((l) => !/ ru: '[^']*[А-яЁё][^']*', dru: '[^']*[А-яЁё][^']*' \},?$/.test(l)).map((l) => l.match(/id: '([^']+)'/)[1]);
    ok(!noHi.length, 'every award has a Russian title and description' + (noHi.length ? ' (' + noHi.slice(0, 8).join(',') + ')' : ''));

    // Store listing, Play's locale ru-RU. Play counts characters, combining vowel signs too.
    const dir = 'fastlane/metadata/android/ru-RU/';
    const have = ['title.txt', 'short_description.txt', 'full_description.txt'].every((f) => fs.existsSync(path.join(ROOT, dir + f)));
    ok(have, 'a ru-RU store listing exists');
    if (have) {
      const full = read(dir + 'full_description.txt'), short = read(dir + 'short_description.txt').trim();
      ok([...full].length <= 4000 && [...short].length <= 80 && DEVA.test(full) && DEVA.test(short), 'it is in Cyrillic and within Play\'s limits (' + [...full].length + '/4000, ' + [...short].length + '/80)');
      const miss = games.filter((g) => full.indexOf('* ' + g.name.ru + ' ') < 0).map((g) => g.id);
      ok(!miss.length, 'it lists every game by its Russian name' + (miss.length ? ' (missing ' + miss.join(',') + ')' : ''));
    }

    // The font: a Cyrillic subset under the OFL, cached for offline play
    const font = path.join(ROOT, 'www/fonts/nunito-cyrillic.woff2');
    const fbuf = fs.existsSync(font) ? fs.readFileSync(font) : null;
    ok(!!fbuf && fbuf.slice(0, 4).toString('latin1') === 'wOF2' && fbuf.length > 10e3 && fbuf.length < 100e3,
      'the Nunito Cyrillic subset ships as a small woff2 (' + (fbuf ? fbuf.length : 0) + ' bytes)');
    const lic = path.join(ROOT, 'www/fonts/OFL-Nunito.txt');
    ok(fs.existsSync(lic) && /Nunito/.test(fs.readFileSync(lic, 'utf8')) && /Open Font License/.test(fs.readFileSync(lic, 'utf8')), 'its OFL licence ships beside it');
    ok(read('www/sw.js').indexOf("'./fonts/nunito-cyrillic.woff2'") > 0, 'the service worker caches it');
    const css = read('www/lib/chogan.css').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(/@font-face \{[^}]*font-family: 'Vazirmatn';[^}]*nunito-cyrillic\.woff2[^}]*unicode-range: [^;]*U\+0400-045F/.test(css), 'chogan.css draws Cyrillic with it, under the app\'s one family');
    ok(/assets\/public\/fonts\/noto-devanagari\.woff2/.test(read('.github/workflows/test.yml')), 'the APK check asks for it inside the package');
  }
  return { testRussian };
};
