'use strict';
// Moved out of tools/test.js when Hindi pushed it past its 1 MB guard (#856).
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testFontFaces() {
    head('Fonts: Persian in Vazirmatn, Latin in Nunito, Hindi in Noto Sans Devanagari, under one family');
    // Chrome joins faces of one family into one unicode-range set only when their style
    // descriptors are identical. Nunito's face said `font-weight: 200 1000` and Vazirmatn's
    // `100 900`, so Chrome picked the Nunito face alone and drew every Persian letter in the
    // system font (owner's phone, 0.25.0). A laptop with Vazirmatn installed hid it.
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const faces = [...css.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => m[1]).filter((b) => /font-family: 'Vazirmatn'/.test(b));
    ok(faces.length === 3, 'three Vazirmatn faces found (' + faces.length + ')');
    if (faces.length !== 3) return;
    const desc = (b, k) => ((new RegExp(k + ':\\s*([^;]+);')).exec(b) || [, 'unset'])[1].trim();
    for (const k of ['font-weight', 'font-style', 'font-stretch']) {
      const v = faces.map((b) => desc(b, k));
      ok(v.every((x) => x === v[0]), 'every face declares the same ' + k + ' (' + v.join(' / ') + ')');
    }
    ok(/vazirmatn-variable/.test(faces[0]) && !/unicode-range/.test(faces[0]) && /nunito-latin/.test(faces[1]) && /unicode-range/.test(faces[1]),
      'Vazirmatn covers everything and the later Nunito face only its Latin range');
    ok(/noto-devanagari/.test(faces[2]) && /unicode-range: U\+0900-097F/.test(faces[2]),
      'the Devanagari face is limited to the Devanagari block');
  }
  return { testFontFaces };
};
