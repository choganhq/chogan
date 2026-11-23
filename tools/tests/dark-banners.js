'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // #1076 step 1: the league banner faded every tier toward white under white text (Silver
  // and Gold read at about 2:1), the daily banner did the same, and the Daily tab's soft
  // "Play" buttons kept the light theme's pastel fill behind lightened text.
  function testDarkBanners() {
    head('Daily banner, league banner and Play buttons in the dark theme (#1076)');
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const tier = (css.match(/\.ch-tier \{[^}]*\}/) || [''])[0];
    ok(/color: var\(--tier-ink, #fff\)/.test(tier), 'the league banner takes its text colour from --tier-ink');
    ok(!/60%, #fff/.test(tier), 'the league banner gradient no longer fades toward white');
    ok(/'--tier-ink': C\.inkOn\(t\.color\)/.test(html), 'the page sets --tier-ink from the tier colour');
    ok(!/lighten\(feat\.color/.test(html), 'the daily banner no longer lightens its colour under white text');
    const soft = css.match(/\.ch-btn--soft \{ background: var\(--game-soft-dark/g) || [];
    ok(soft.length === 2, 'the soft button has a dark fill for the system theme and the chosen one (' + soft.length + ')');
    ok((html.match(/'--game-soft-dark': C\.alpha\(g\.color, \.26\)/g) || []).length === 3, 'every page that sets --game-soft sets --game-soft-dark too');
  }
  return { testDarkBanners };
};
