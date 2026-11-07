'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // Latin text in Nunito, Persian in Vazirmatn (#670). The owner found Vazirmatn's own
  // Latin letters (Roboto) plain, and chose Nunito from a side-by-side mock.
  function testLatinFont() {
    head('Latin letters in Nunito (#670)');
    const file = path.join(ROOT, 'www/fonts/nunito-latin.woff2');
    const have = fs.existsSync(file);
    ok(have, 'the Nunito subset ships in www/fonts');
    if (!have) return;
    const buf = fs.readFileSync(file);
    // A Latin-only subset; the full variable font is several times this
    ok(buf.slice(0, 4).toString('latin1') === 'wOF2' && buf.length > 20e3 && buf.length < 90e3,
      'it is a woff2 Latin subset of a sensible size (' + buf.length + ' bytes)');
    const lic = path.join(ROOT, 'www/fonts/OFL-Nunito.txt');
    ok(fs.existsSync(lic) && /Nunito Project Authors/.test(fs.readFileSync(lic, 'utf8')) && /Open Font License/.test(fs.readFileSync(lic, 'utf8')),
      'its OFL licence ships beside it');

    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const faces = css.match(/@font-face \{[^}]*\}/g) || [];
    ok(faces.length >= 2, 'the core declares at least two font faces (' + faces.length + ')');
    const vaz = faces.findIndex((f) => /vazirmatn-variable\.woff2/.test(f));
    const nun = faces.findIndex((f) => /nunito-latin\.woff2/.test(f));
    // Same family name, so canvas games that write `font: … Vazirmatn` get it too, and
    // declared later, so it wins for its own characters
    ok(vaz >= 0 && nun > vaz && /font-family: 'Vazirmatn'/.test(faces[nun]), 'Nunito is a later face of the Vazirmatn family');
    const m = (faces[nun] || '').match(/unicode-range:\s*([^;]+);/);
    ok(/ascent-override: 102\.54%;/.test(faces[nun] || '') && /descent-override: 53\.71%;/.test(faces[nun] || ''), 'it borrows Vazirmatn\'s line metrics, so English lines keep their height');
    ok(!!m, 'the Nunito face is limited by a unicode-range');
    if (!m) return;
    const ranges = m[1].split(',').map((r) => {
      const [a, b] = r.trim().replace(/^U\+/i, '').split('-');
      return [parseInt(a, 16), parseInt(b || a, 16)];
    });
    ok(ranges.length > 0 && ranges.every(([a, b]) => a <= b), 'the range parses (' + ranges.length + ' parts)');
    const covers = (c) => ranges.some(([a, b]) => c >= a && c <= b);
    ok(['A', 'z', '0', '9', 'ł', 'ż', 'ß', 'ñ', 'é', '—', '…'].every((ch) => covers(ch.codePointAt(0))), 'English, Polish, German and Spanish letters and common punctuation are in it');
    // A joiner or bidi mark from another font splits the text run and breaks Persian joining
    const keep = [0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2066, 0x2067, 0x2068, 0x2069];
    ok(keep.every((c) => !covers(c)), 'ZWNJ, ZWJ and the bidi marks stay with Vazirmatn');
    const persian = ['ا', 'گ', 'ی', '۰', '۹', '،', '؟'].map((ch) => ch.codePointAt(0));
    ok(persian.every((c) => !covers(c)), 'Persian letters, digits and punctuation stay with Vazirmatn');
    ok(!covers(0x4E00) && !covers(0x3002), 'Chinese stays with the system font');

    const sw = fs.readFileSync(path.join(ROOT, 'www/sw.js'), 'utf8');
    ok(sw.indexOf("'./fonts/nunito-latin.woff2'") > 0, 'the service worker caches it, so it works offline');
    ok(/@media \(max-width: 559px\) \{\s*\.ch-recent__item \{ flex-direction: column;/.test(css) && /\.ch-recent__name \{ overflow-wrap: break-word;/.test(css),
      'on a phone the new-games chips put the icon above the name, so a name breaks only between words');
    const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
    ok(/assets\/public\/fonts\/nunito-latin\.woff2/.test(ci), 'the APK check asks for it inside the package');
  }
  return { testLatinFont };
};
