'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT, rng } = T;
  // iPadOS 15's WebKit paints nothing when drawImage's source rectangle reaches outside the
  // source canvas, so every edge piece of Jigsaw was an empty outline and only the interior
  // ones showed a picture (#756; a 12-piece puzzle has 2 interior pieces of 12). Chrome clips such
  // a rectangle, so no browser here can show it: run the page's own pieceCanvas against a fake
  // canvas that, like that WebKit, drops an out-of-bounds draw, and require every piece to paint.
  function testJigsawEdgeCrop() {
    head('Jigsaw: every piece, edge pieces included, paints from inside the picture (#756)');
    const E = loadEngine('jigsaw', 'JigsawEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/jigsaw/index.html'), 'utf8');
    const fns = ['dpr', 'tracePath', 'pieceCanvas'].map((n) => (html.match(new RegExp('  function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n')) || [''])[0]);
    ok(fns.every(Boolean), 'Jigsaw has dpr, tracePath and pieceCanvas to test (' + fns.map((f) => f.length).join(', ') + ')');
    if (!fns.every(Boolean)) return;
    for (const count of [12, 24]) {
      for (const d of [1, 2]) {
        const L = E.layout(300, 400, count), cr = E.CUTS[count];
        const S = { cols: cr[0], cut: E.cut(cr[0], cr[1], rng(7)) };
        const pic = { width: Math.round(L.w * d), height: Math.round(L.h * d) };
        let drawn = 0, dropped = 0, painted = 0;
        const mkCanvas = () => ({ style: {}, getContext() {
          return { scale() {}, save() {}, restore() {}, clip() {}, stroke() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {},
            drawImage(img, sx, sy, sw, sh) {
              drawn++;
              const inside = sx >= 0 && sy >= 0 && sx + sw <= img.width + 1e-6 && sy + sh <= img.height + 1e-6;
              if (inside) painted++; else dropped++;
            } };
        } });
        const env = { L, S, E, pic, window: { devicePixelRatio: d }, document: { createElement: mkCanvas } };
        const run = new Function(...Object.keys(env), fns.join('\n') + '; var n = ' + (cr[0] * cr[1]) + '; for (var i = 0; i < n; i++) pieceCanvas(i, 1); return n;');
        const n = run(...Object.values(env));
        ok(n > 0 && drawn === n, count + ' pieces at dpr ' + d + ': every piece draws the picture once (' + drawn + ' of ' + n + ')');
        ok(dropped === 0 && painted === n, count + ' pieces at dpr ' + d + ': no draw reaches outside the picture, so an old WebKit loses none (' + dropped + ' outside, ' + painted + ' inside)');
      }
    }
  }
  return { testJigsawEdgeCrop };
};
