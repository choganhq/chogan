'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // In four-suit Spider a column shows only the top strip of each card, and a number
  // card carried its suit only in the middle, so a 7 of clubs and a 7 of spades looked
  // the same (#966). Spider asks the shared deck for the suit beside the rank.
  function testSpiderSuitCorner() {
    head('Spider: number cards show their suit in the corner (#966)');
    const coreJs = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/spider/index.html'), 'utf8');
    const m = coreJs.match(/\n  Chogan\.cards = \(function \(\) \{[\s\S]*?\n  \}\)\(\);\n/);
    ok(!!m, 'the shared deck block is found in the core');
    const fake = (tag, props, kids) => ({ tag, props: props || {}, kids: (kids || []).filter(Boolean), setAttribute() {}, addEventListener() {} });
    const box = { Chogan: { t: (k) => k, feedback() {} }, state: { settings: { lang: 'en' } }, el: fake, saveSettings() {},
      document: { head: { appendChild() {} }, documentElement: { setAttribute() {} }, getElementById() { return null; } }, Math, encodeURIComponent };
    vm.createContext(box);
    if (m) vm.runInContext('var cards = (function(){ var Chogan = this.Chogan; ' + m[0].replace('Chogan.cards =', 'return') + ' }).call(this);', box);
    const K = box.cards;
    ok(!!K && typeof K.el === 'function', 'the shared deck block runs on its own');
    if (!K) return;
    const mini = (n) => n.kids.filter((k) => k.props.class === 'ch-pcard__mini').map((k) => k.props.text);
    const cls = (n) => n.kids.map((k) => k.props.class);
    const nums = [];
    for (let r = 0; r < 10; r++) for (let s = 0; s < 4; s++) nums.push(r * 4 + s);
    ok(nums.length === 40, 'forty number cards are checked');
    ok(nums.every((c) => JSON.stringify(mini(K.el(c, '', true))) === JSON.stringify([K.GLYPH[c & 3]])), 'with the corner asked for, every number card shows its own suit beside the rank');
    ok(nums.every((c) => cls(K.el(c, '', true)).includes('ch-pcard__s')), 'the big suit in the middle stays');
    ok(nums.every((c) => mini(K.el(c)).length === 0 && mini(K.el(c, 'x')).length === 0), 'other card games, which do not ask, are unchanged');
    const faces = [40, 45, 50, 51];
    ok(faces.every((c) => mini(K.el(c, '', true)).length === 1 && mini(K.el(c)).length === 1), 'a court card shows its corner suit once, asked or not');
    ok(/C\.cards\.el\(E\.face\(S, c\), '', true\)/.test(html), 'Spider asks for the corner suit on its cards');
  }
  return { testSpiderSuitCorner };
};
