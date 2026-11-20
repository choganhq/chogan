'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // A Spider column shows only the top strip of each card. Number cards carried
  // their suit only in the middle, so with four suits a 7 of clubs and a 7 of
  // spades looked the same in a stack (#966). Every card must show its suit in
  // the corner strip, in the DOM cards and in the canvas cascade alike.
  function testSpiderSuitCorner() {
    head('Spider: every card shows its suit in the corner (#966)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/spider/index.html'), 'utf8');
    const m = html.match(/\n  function build\(\) \{[\s\S]*?\n  \}\n/);
    ok(!!m, 'build() is found in the Spider page');
    if (!m) return;
    const GLYPH = ['C', 'D', 'H', 'S'];
    function node(cls, text, kids) {
      const n = { cls, text: text || '', children: (kids || []).slice(), tabIndex: 0 };
      n.insertBefore = (k, ref) => { const i = n.children.indexOf(ref); n.children.splice(i < 0 ? n.children.length : i, 0, k); return k; };
      n.remove = () => {};
      Object.defineProperty(n, 'firstChild', { get: () => n.children[0] });
      return n;
    }
    // the core's card face, as in Chogan.cards.el: rank, then the mini suit and
    // picture for a court card, or the large middle suit for a number card
    const cards = {
      GLYPH, rank: (c) => c >> 2, suit: (c) => c & 3,
      el: (c) => node('ch-pcard', '', [node('ch-pcard__r', String(c >> 2))].concat((c >> 2) >= 10
        ? [node('ch-pcard__mini', GLYPH[c & 3]), node('ch-pcard__face')] : [node('ch-pcard__s', GLYPH[c & 3])])),
      back: () => node('ch-pback')
    };
    const board = node('board');
    board.appendChild = (k) => { board.children.push(k); return k; };
    const ctx = {
      C: { cards }, nodes: {}, board, S: {},
      E: { face: (S, c) => c % 52 },
      el: (tag, attrs, kids) => node((attrs && attrs.class) || tag, attrs && attrs.text, kids),
      renderTop: () => {}
    };
    vm.runInNewContext(m[0] + '\nbuild();', ctx);
    const all = board.children;
    ok(all.length === 104, 'build() made 104 cards (' + all.length + ')');
    let bad = [];
    all.forEach((n) => {
      const fc = n._c % 52, face = n.children[0];
      const minis = face.children.filter((k) => k.cls === 'ch-pcard__mini');
      if (minis.length !== 1 || minis[0].text !== GLYPH[fc & 3] || face.children[0].cls !== 'ch-pcard__r') bad.push(fc);
    });
    ok(bad.length === 0, 'each card has exactly one corner suit of its own suit, after the rank (wrong: ' + bad.slice(0, 6).join(', ') + ')');
    const pc = html.match(/\n  function paintCard\([^)]*\) \{[\s\S]*?\n  \}\n/);
    ok(!!pc, 'paintCard() is found in the Spider page');
    const glyphs = pc ? (pc[0].match(/fillText\(C\.cards\.GLYPH\[s\]/g) || []).length : 0;
    ok(glyphs === 2, 'the canvas cascade draws the suit twice, corner and middle (' + glyphs + ')');
  }
  return { testSpiderSuitCorner };
};
