'use strict';
// #1076: the app's own banners and buttons in the dark theme. The daily banner's
// gradient ended in the accent lightened by a fixed .38, the league banner mixed the
// tier colour 40% with white (Silver read near 2.5:1 for its white text), and the Daily
// tab's Play buttons drew light text on each game's opaque light pastel. These check the
// colours themselves, from the shipped code, for every game and every tier.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgbOf = (s) => (/^#/.test(s) ? hx(s) : (s.match(/\d+/g) || []).map(Number));
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const WHITE = [255, 255, 255];

  function colours() {
    const games = JSON.parse(read('www/games.json')).games.map((g) => [g.id, g.color, g.soft]);
    const tiers = [...read('www/lib/chogan.js').matchAll(/\{ id: \d, key: '(\w+)',\s*color: '(#[0-9A-Fa-f]{6})'/g)].map((m) => ['tier ' + m[1], m[2]]);
    return { games, tiers };
  }

  function testDarkBanners() {
    head('Banners with white text read on every colour (#1076)');
    const idx = read('www/index.html');
    const { games, tiers } = colours();
    ok(games.length > 50 && tiers.length === 5, 'the game and tier colours were found (' + games.length + ' games, ' + tiers.length + ' tiers)');
    const m = idx.match(/\n  function whiteBanner\(hex\) \{[\s\S]*?\n  \}\n/);
    ok(!!m, 'index.html works out a banner\'s two ends with whiteBanner()');
    if (m) {
      const whiteBanner = new Function(m[0] + '\nreturn whiteBanner;')();
      const bad = [];
      for (const [id, c] of games.concat(tiers)) {
        const b = whiteBanner(c);
        const lo = Math.min(cr(WHITE, rgbOf(b.from)), cr(WHITE, rgbOf(b.to)));
        if (!(lo >= 4.5)) bad.push(id + ' ' + lo.toFixed(2));
      }
      ok(!bad.length, 'white text reads at 4.5:1 on both ends of the banner for all ' + (games.length + tiers.length) + ' colours' + (bad.length ? '; under it: ' + bad.join(', ') : ''));
      const keep = games.filter(([, c]) => cr(WHITE, hx(c)) >= 4.5);
      ok(keep.length > 20 && keep.every(([, c]) => rgbOf(whiteBanner(c).from).join() === hx(c).join()), 'an accent that already reads starts the banner unchanged (' + keep.length + ' of them)');
    }
    const hero = (idx.match(/var heroBg = [\s\S]*?page\.appendChild\(hero\)/) || [''])[0];
    ok(/whiteBanner\(feat\.color\)/.test(hero) && /heroBg\.from/.test(hero) && /heroBg\.to/.test(hero) && !/lighten\(/.test(hero), 'the daily banner takes both ends from whiteBanner()');
    const css = read('www/lib/chogan.css');
    const tier = (css.match(/\n\.ch-tier \{[\s\S]*?\n\}/) || [''])[0];
    ok(/var\(--tier-from/.test(tier) && /var\(--tier-to/.test(tier) && !/#fff\)/.test(tier), 'the league banner draws its gradient from --tier-from and --tier-to, with no white mixed in');
    ok(/whiteBanner\(t\.color\)/.test(idx) && /'--tier-from': tierBg\.from/.test(idx) && /'--tier-to': tierBg\.to/.test(idx), 'the league page passes the tier\'s two ends');
  }

  function testDarkSoftButtons() {
    head('Soft buttons in the dark theme are a tint of the game colour (#1076)');
    const css = read('www/lib/chogan.css');
    const rule = /\.ch-btn--soft \{ background: color-mix\(in srgb, var\(--game, var\(--c-accent\)\) (\d+)%, transparent\); \}/g;
    const both = [...css.matchAll(rule)];
    ok(both.length === 2, 'the tint is set for the system dark theme and the chosen one (' + both.length + ' rules)');
    ok(/@media \(prefers-color-scheme: dark\) \{\n  :root:not\(\[data-theme="light"\]\) \.ch-btn--soft \{ background: color-mix/.test(css) && /\n:root\[data-theme="dark"\] \.ch-btn--soft \{ background: color-mix/.test(css), 'one rule is under the system dark query, the other under data-theme="dark"');
    // with no tint rule the button keeps the game's opaque `soft`, as before #1076
    const pct = both.length ? Number(both[0][1]) / 100 : null;
    const src = read('www/lib/chogan.js');
    const fn = src.match(/  Chogan\.textOnDark = function[\s\S]*?\n  \};\n/);
    ok(!!fn, 'Chogan.textOnDark was found');
    if (!fn) return;
    const Chogan = {};
    new Function('Chogan', fn[0])(Chogan);
    // the Daily tab's day window sits on --c-surface of the dark theme
    const surf = (css.match(/--c-surface:\s*(#[0-9A-Fa-f]{6});/g) || []).map((s) => s.match(/#[0-9A-Fa-f]{6}/)[0]).find((c) => lum(hx(c)) < 0.05);
    ok(!!surf, 'the dark theme\'s surface colour was found (' + surf + ')');
    if (!surf) return;
    const games = colours().games, bad = [];
    for (const [id, c, soft] of games) {
      const fill = pct === null ? hx(soft) : hx(surf).map((v, i) => Math.round(v + (hx(c)[i] - v) * pct));
      const r = cr(hx(Chogan.textOnDark(c)), fill);
      if (!(r >= 4.5)) bad.push(id + ' ' + r.toFixed(2));
    }
    ok(!bad.length, 'every game\'s Play text reads at 4.5:1 on its tinted button (' + games.length + ' games)' + (bad.length ? '; under it: ' + bad.join(', ') : ''));
  }

  return { testDarkBanners, testDarkSoftButtons };
};
