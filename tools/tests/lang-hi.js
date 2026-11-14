'use strict';
// Hindi, the eighth language (#856): left to right, Devanagari, Western digits, and a
// bundled Devanagari font, because neither Vazirmatn nor Nunito has the script and
// Linux and ChromeOS often have no system font for it.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  const DEVA = /[ऀ-ॿ]/;
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // A language block `hi: { … }` at 4 to 8 spaces, as testLocales reads them, but reading
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
  // Every English string with words gets Devanagari; names, key labels and units may stay
  const wordy = (en) => /[A-Za-z]{3}/.test(en.replace(/\{[a-z]+\}|Ctrl|Shift|Space|Enter|Esc|Tab|Chogan( Plus)?|Play Games|Google|GitHub|Telegram|Android|Lichess|km\/h|mph|km|PNG|JPG|WebP|MP4|WebM|MOV|MB/g, ''));
  function compare(label, src) {
    const en = dictOf(src, 'en') || {}, hi = dictOf(src, 'hi');
    ok(!!hi, label + ': has a Hindi dictionary');
    if (!hi) return;
    const keys = Object.keys(en);
    const miss = keys.filter((k) => !(k in hi));
    const stray = Object.keys(hi).filter((k) => !(k in en));
    ok(keys.length > 0 && !miss.length && !stray.length, label + ': hi has exactly the English keys (' + keys.length + ')' + (miss.length ? '; missing ' + miss.join(',') : '') + (stray.length ? '; extra ' + stray.join(',') : ''));
    const badHoles = keys.filter((k) => k in hi && holes(en[k]) !== holes(hi[k]));
    ok(!badHoles.length, label + ': hi placeholders match English' + (badHoles.length ? ' (' + badHoles.join(',') + ')' : ''));
    const latin = keys.filter((k) => k in hi && wordy(en[k]) && !DEVA.test(hi[k]));
    ok(!latin.length, label + ': every worded string is in Devanagari' + (latin.length ? ' (' + latin.join(',') + ')' : ''));
    // invisible joiners split a run between fonts and break the shaping of a conjunct
    const joiners = keys.filter((k) => k in hi && /[‌‍]/.test(hi[k]));
    ok(!joiners.length, label + ': no ZWJ or ZWNJ in hi' + (joiners.length ? ' (' + joiners.join(',') + ')' : ''));
  }

  function testHindi() {
    head('Hindi (#856)');
    ok(LOCALE_CODES.indexOf('hi') >= 0, 'hi is one of the test languages');
    const core = read('www/lib/chogan.js');
    const table = (core.match(/var LOCALES = \[([\s\S]*?)\];/) || [])[1] || '';
    ok(/\{ code: 'hi', label: 'हिन्दी',\s+dir: 'ltr', tag: 'hi',\s+date: 'hi-IN-u-nu-latn' \}/.test(table), 'LOCALES lists Hindi, left to right, dates with Western digits');
    const fn = (core.match(/function deviceLang\(\)[\s\S]*?\n  \}/) || [])[0];
    ok(!!fn, 'deviceLang found');
    if (fn) {
      for (const [tag, want] of [['hi-IN', 'hi'], ['hi', 'hi'], ['en-IN', 'en']]) {
        const sb = { out: null, global: { navigator: { languages: [tag], language: tag } } };
        vm.createContext(sb);
        vm.runInContext(fn + '\nout = deviceLang();', sb);
        ok(sb.out === want, 'a ' + tag + ' device opens in ' + want + ' (got ' + sb.out + ')');
      }
    }
    const num = (core.match(/Chogan\.num = function \(v\) \{[\s\S]*?\n  \};/) || [])[0];
    ok(!!num, 'Chogan.num found');
    if (num) {
      const sb = { Chogan: {}, state: { settings: { lang: 'hi' } }, FA_DIGITS: '۰۱۲۳۴۵۶۷۸۹' };
      vm.runInNewContext(num + ';this.out = Chogan.num(2048);', sb);
      ok(sb.out === '2048', 'numbers keep Western digits in Hindi (' + sb.out + ')');
    }

    compare('www/lib/chogan.js', core);
    compare('www/index.html', read('www/index.html'));

    const games = JSON.parse(read('www/games.json')).games;
    ok(games.length > 0, 'games listed (' + games.length + ')');
    const names = new Set();
    for (const g of games) {
      ok(DEVA.test(g.name.hi || '') && DEVA.test(g.summary.hi || ''), g.id + ': games.json has a Hindi name and summary');
      names.add(g.name.hi);
      const src = read('www/' + g.path);
      compare(g.id, src);
      const m = src.match(/\n    name: (\{[^\n]*\}),\n/) || src.match(/\n  var NAME = (\{[^\n]*\});\n/);
      let obj = null;
      try { obj = m ? vm.runInNewContext('(' + m[1] + ')') : null; } catch (e) { obj = null; }
      ok(!!obj && obj.hi === g.name.hi, g.id + ': the page names the game as games.json does (' + (obj && obj.hi) + ')');
    }
    ok(names.size === games.length, 'every game has its own Hindi name (' + names.size + ' of ' + games.length + ')');

    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[^']+',.*den: '/.test(l));
    ok(ach.length > 200, 'awards read (' + ach.length + ')');
    const noHi = ach.filter((l) => !/ hi: '[^']*[ऀ-ॿ][^']*', dhi: '[^']*[ऀ-ॿ][^']*' \},?$/.test(l)).map((l) => l.match(/id: '([^']+)'/)[1]);
    ok(!noHi.length, 'every award has a Hindi title and description' + (noHi.length ? ' (' + noHi.slice(0, 8).join(',') + ')' : ''));

    // Store listing, Play's locale hi-IN. Play counts characters, combining vowel signs too.
    const dir = 'fastlane/metadata/android/hi-IN/';
    const have = ['title.txt', 'short_description.txt', 'full_description.txt'].every((f) => fs.existsSync(path.join(ROOT, dir + f)));
    ok(have, 'a hi-IN store listing exists');
    if (have) {
      const full = read(dir + 'full_description.txt'), short = read(dir + 'short_description.txt').trim();
      ok([...full].length <= 4000 && [...short].length <= 80 && DEVA.test(full) && DEVA.test(short), 'it is in Devanagari and within Play\'s limits (' + [...full].length + '/4000, ' + [...short].length + '/80)');
      const miss = games.filter((g) => full.indexOf('* ' + g.name.hi + ' ') < 0).map((g) => g.id);
      ok(!miss.length, 'it lists every game by its Hindi name' + (miss.length ? ' (missing ' + miss.join(',') + ')' : ''));
    }

    // The font: a Devanagari subset under the OFL, cached for offline play
    const font = path.join(ROOT, 'www/fonts/noto-devanagari.woff2');
    const fbuf = fs.existsSync(font) ? fs.readFileSync(font) : null;
    ok(!!fbuf && fbuf.slice(0, 4).toString('latin1') === 'wOF2' && fbuf.length > 20e3 && fbuf.length < 100e3,
      'the Noto Sans Devanagari subset ships as a small woff2 (' + (fbuf ? fbuf.length : 0) + ' bytes)');
    const lic = path.join(ROOT, 'www/fonts/OFL-NotoSansDevanagari.txt');
    ok(fs.existsSync(lic) && /Noto Project Authors/.test(fs.readFileSync(lic, 'utf8')) && /Open Font License/.test(fs.readFileSync(lic, 'utf8')), 'its OFL licence ships beside it');
    ok(read('www/sw.js').indexOf("'./fonts/noto-devanagari.woff2'") > 0, 'the service worker caches it');
    const css = read('www/lib/chogan.css').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(/@font-face \{[^}]*font-family: 'Vazirmatn';[^}]*noto-devanagari\.woff2[^}]*unicode-range: U\+0900-097F/.test(css), 'chogan.css draws Devanagari with it, under the app\'s one family');
    ok(/assets\/public\/fonts\/noto-devanagari\.woff2/.test(read('.github/workflows/test.yml')), 'the APK check asks for it inside the package');
  }
  return { testHindi };
};
