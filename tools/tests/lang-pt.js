'use strict';
// Brazilian Portuguese, the eleventh language (#1091): left to right, Latin script, Western
// digits. Its accents (ã, õ, ç, ê…) sit in Nunito's Latin face, so it needs no font of its own,
// and a check below keeps every character of it inside that face's unicode-range.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // A language block `pt: { … }` at 4 to 8 spaces, as testLocales reads them, but reading
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
  // The Latin Nunito face's unicode-range, read from chogan.css below; a Portuguese character
  // outside it would be drawn in the phone's own font, as Persian once was (#684).
  let latinRange = null;
  const inLatin = (ch) => {
    const c = ch.codePointAt(0);
    if (c < 0x80 || /\p{Extended_Pictographic}|[←-⇿☀-➿■-◿️‍×…•·←-↓⌘⇧⏎]/u.test(ch)) return true;
    return latinRange.some(([a, b]) => c >= a && c <= b);
  };
  function compare(label, src) {
    const en = dictOf(src, 'en') || {}, pt = dictOf(src, 'pt');
    ok(!!pt, label + ': has a Portuguese dictionary');
    if (!pt) return;
    const keys = Object.keys(en);
    const miss = keys.filter((k) => !(k in pt));
    const stray = Object.keys(pt).filter((k) => !(k in en));
    ok(keys.length > 0 && !miss.length && !stray.length, label + ': pt has exactly the English keys (' + keys.length + ')' + (miss.length ? '; missing ' + miss.join(',') : '') + (stray.length ? '; extra ' + stray.join(',') : ''));
    const badHoles = keys.filter((k) => k in pt && holes(en[k]) !== holes(pt[k]));
    ok(!badHoles.length, label + ': pt placeholders match English' + (badHoles.length ? ' (' + badHoles.join(',') + ')' : ''));
    const empty = keys.filter((k) => k in pt && en[k].trim() && !pt[k].trim());
    ok(!empty.length, label + ': no pt string is empty where English has text' + (empty.length ? ' (' + empty.join(',') + ')' : ''));
    if (latinRange) {
      const off = keys.filter((k) => k in pt && [...pt[k]].some((ch) => !inLatin(ch) && en[k].indexOf(ch) < 0));
      ok(!off.length, label + ': every pt character is in the Latin face' + (off.length ? ' (' + off.join(',') + ')' : ''));
    }
  }

  function testPortuguese() {
    head('Brazilian Portuguese (#1091)');
    ok(LOCALE_CODES.indexOf('pt') >= 0, 'pt is one of the test languages');
    const core = read('www/lib/chogan.js');
    const table = (core.match(/var LOCALES = \[([\s\S]*?)\];/) || [])[1] || '';
    ok(/\{ code: 'pt', label: 'Português',\s+dir: 'ltr', tag: 'pt-BR',\s+date: 'pt-BR' \}/.test(table), 'LOCALES lists Brazilian Portuguese, left to right, pt-BR dates');
    const fn = (core.match(/function deviceLang\(\)[\s\S]*?\n  \}/) || [])[0];
    ok(!!fn, 'deviceLang found');
    if (fn) {
      for (const [tag, want] of [['pt-BR', 'pt'], ['pt', 'pt'], ['pt-PT', 'pt'], ['es-ES', 'es'], ['en-US', 'en']]) {
        const sb = { out: null, global: { navigator: { languages: [tag], language: tag } } };
        vm.createContext(sb);
        vm.runInContext(fn + '\nout = deviceLang();', sb);
        ok(sb.out === want, 'a ' + tag + ' device opens in ' + want + ' (got ' + sb.out + ')');
      }
    }
    const css = read('www/lib/chogan.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const face = (css.match(/@font-face \{[^}]*nunito-latin\.woff2[^}]*\}/) || [])[0] || '';
    const range = (face.match(/unicode-range: ([^;]*);/) || [])[1] || '';
    latinRange = range.split(',').map((r) => r.trim().replace(/^U\+/, '').split('-').map((h) => parseInt(h, 16))).map(([a, b]) => [a, b === undefined ? a : b]);
    ok(latinRange.length > 2 && latinRange.every(([a, b]) => a >= 0 && b >= a) && latinRange.some(([a, b]) => a <= 0xE3 && b >= 0xE7), 'the Latin Nunito face covers ã, ç and the other Portuguese letters (' + range + ')');

    compare('www/lib/chogan.js', core);
    compare('www/index.html', read('www/index.html'));

    const games = JSON.parse(read('www/games.json')).games;
    ok(games.length > 0, 'games listed (' + games.length + ')');
    const names = new Set();
    for (const g of games) {
      ok(!!(g.name.pt && g.summary.pt) && g.summary.pt !== g.summary.en, g.id + ': games.json has a Portuguese name and summary');
      names.add(g.name.pt);
      const src = read('www/' + g.path);
      compare(g.id, src);
      const m = src.match(/\n    name: (\{[^\n]*\}),\n/) || src.match(/\n  var NAME = (\{[^\n]*\});\n/);
      let obj = null;
      try { obj = m ? vm.runInNewContext('(' + m[1] + ')') : null; } catch (e) { obj = null; }
      ok(!!obj && obj.pt === g.name.pt, g.id + ': the page names the game as games.json does (' + (obj && obj.pt) + ')');
    }
    ok(names.size === games.length, 'every game has its own Portuguese name (' + names.size + ' of ' + games.length + ')');

    const ach = core.split('\n').filter((l) => /^\s*\{ id: '[^']+',.*den: '/.test(l));
    ok(ach.length > 200, 'awards read (' + ach.length + ')');
    const noPt = ach.filter((l) => !/ pt: '[^']+', dpt: '[^']+' \},?$/.test(l)).map((l) => l.match(/id: '([^']+)'/)[1]);
    ok(!noPt.length, 'every award has a Portuguese title and description' + (noPt.length ? ' (' + noPt.slice(0, 8).join(',') + ')' : ''));

    // Store listing, Play's locale pt-BR
    const dir = 'fastlane/metadata/android/pt-BR/';
    const have = ['title.txt', 'short_description.txt', 'full_description.txt'].every((f) => fs.existsSync(path.join(ROOT, dir + f)));
    ok(have, 'a pt-BR store listing exists');
    if (have) {
      const full = read(dir + 'full_description.txt'), short = read(dir + 'short_description.txt').trim();
      ok([...full].length <= 4000 && [...short].length <= 80 && /ç|ã|õ/.test(full), 'it is in Portuguese and within Play\'s limits (' + [...full].length + '/4000, ' + [...short].length + '/80)');
      const miss = games.filter((g) => full.indexOf('* ' + g.name.pt + ' ') < 0).map((g) => g.id);
      ok(!miss.length, 'it lists every game by its Portuguese name' + (miss.length ? ' (missing ' + miss.join(',') + ')' : ''));
    }
  }
  return { testPortuguese };
};
