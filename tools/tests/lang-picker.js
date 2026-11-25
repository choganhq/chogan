'use strict';
// The Profile's language picker overflowed on a phone (#1152): with eleven languages the fixed
// five columns were narrower than Español and Русский at 360px, the first column ran out of the
// picker and the page scrolled sideways. The columns must be as many as fit at the widest label,
// never a fixed count, so the next language only adds a row.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT, LOCALE_CODES } = T;
  function testLangPicker() {
    head('Language picker fits every label (#1152)');
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const labels = [...((core.match(/var LOCALES = \[([\s\S]*?)\];/) || [])[1] || '').matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    ok(labels.length > 0 && labels.length === LOCALE_CODES.length, 'every language has a picker label (' + labels.length + ' of ' + LOCALE_CODES.length + ')');

    const rule = (css.match(/\.ch-seg\.ch-langs \{([^}]*)\}/) || [])[1] || '';
    const cols = (rule.match(/grid-template-columns: ([^;]+);/) || [])[1] || '';
    const fit = cols.match(/^repeat\(auto-(?:fill|fit), minmax\((?:min\(100%, )?(\d+)px\)?, 1fr\)\)$/);
    ok(/display: grid;/.test(rule) && !!fit, 'the picker makes as many columns as fit, never a fixed count (' + (cols || 'no rule') + ')');

    // Nunito bold measures about 0.53em a letter (Português drew 67px at 14px in Chrome), so
    // 0.55em is a safe bound; a label's button adds its inline padding on both sides.
    const fsSm = +((css.match(/--fs-sm: (\d+)px;/) || [])[1] || 0);
    const pad = +((css.match(/\.ch-seg\.ch-langs button \{[^}]*padding-inline: (\d+)px/) || [])[1] || 0);
    ok(fsSm > 0 && pad > 0, 'font size and padding read (' + fsSm + 'px, ' + pad + 'px)');
    const need = Math.max(...labels.map((l) => [...l].length * fsSm * 0.55 + 2 * pad));
    const min = fit ? +fit[1] : 0;
    ok(min >= need, 'a column is never narrower than the widest label needs (' + min + 'px >= ' + Math.round(need) + 'px)');

    // A 360px phone: the Profile card leaves the picker about 300px. At least two columns must
    // fit there, or the picker is one long list.
    ok(min > 0 && Math.floor(300 / min) >= 2, 'at least two columns fit on a 360px phone (' + (min ? Math.floor(300 / min) : 0) + ')');
    const media = css.split('\n').filter((l) => /@media/.test(l) && /ch-langs/.test(l));
    ok(!media.some((l) => /grid-template-columns: repeat\(\d+/.test(l)), 'no media rule fixes the column count again');
  }
  return { testLangPicker };
};
