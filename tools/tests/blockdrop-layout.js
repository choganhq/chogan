'use strict';
// #853: Block Drop stacked the mode switch above the board and the pad below it at every
// window shape, so a landscape phone (844x390) drew the board 134x193 px, and a desktop
// window left the board short with empty sides. In a wide window the rows now sit in a
// column beside the board (the core's .ch-split), and the board takes the full height.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, loadEngine } = T;
  function testBlockdropLayout() {
    head('Block Drop: mode switch and pad beside the board in a wide window (#853)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/blockdrop/index.html'), 'utf8');
    const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    ok(css.length > 0, 'the page has its own style block');

    // the board, the mode row and the pad are built inside the core's split layout
    ok(/var topRow = el\('div', \{ class: 'bd-top ch-above' \}\)/.test(html), 'the mode row is marked to sit above the board when stacked');
    ok(/var wrap = el\('div', \{ class: 'bd-wrap ch-split' \}, \[el\('div', \{ class: 'ch-fit' \}, \[cbox\]\), el\('div', \{ class: 'ch-side' \}, \[topRow, pad\]\)\]\)/.test(html),
      'the board sits in a .ch-fit slot and the mode row and pad in a .ch-side of a .ch-split');
    // a game rule of the same specificity beats the core's (lesson 2026-10-19): the old
    // flex column on .bd-wrap would cancel the core's row in a wide window
    ok(!/\.bd-wrap\s*\{[^}]*flex-direction/.test(css), 'no game rule turns the split back into a column');
    ok(!/\.bd-canvasbox\s*\{[^}]*flex:/.test(css), 'the board box no longer grows as a flex row of its own');
    ok(/\.ch-fit > \.bd-canvasbox\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%/.test(css), 'the board box fills its slot, so the canvas is sized from the slot');

    // the slot's shape is the field the canvas draws: board plus the hold and next column
    const E = loadEngine('blockdrop', 'BlockDropEngineFactory');
    const line = (html.match(/\n  (var CELL = [^\n]*;)\n/) || [])[1];
    ok(!!line, 'the field size line is found');
    let FW = 0, FH = 0;
    if (line) { const sb = { E }; vm.runInNewContext(line + ' this.FW = FW; this.FH = FH;', sb); FW = sb.FW; FH = sb.FH; }
    const ar = (css.match(/\.bd-wrap > \.ch-fit\s*\{\s*--fit-ar:\s*calc\((\d+) \/ (\d+)\);/) || []).slice(1).map(Number);
    ok(FW > 0 && FH > 0 && ar.length === 2 && ar[0] * FH === ar[1] * FW, 'the slot\'s --fit-ar is the drawn field\'s FW / FH (' + ar.join('/') + ' vs ' + FW + '/' + FH + ')');

    // the canvas follows the slot when the side column moves without a window resize
    ok(/function resize\(\) \{\n    var boxW = cbox\.clientWidth/.test(html), 'the canvas is sized from its box');
    ok(/new ResizeObserver\(function \(\) \{ resize\(\); \}\)\.observe\(cbox\)/.test(html), 'a change of the box redraws the canvas at its new size');
    ok(/canvas\.width = Math\.floor\(w \* dpr\);\n    canvas\.height = Math\.floor\(h \* dpr\);/.test(html), 'both sides of the backing follow the new size');

    // beside the board the pad is three by two, in both the cq and the old-WebView layout
    const kinds = [...html.matchAll(/\['(hold|left|cw|right|soft|drop)', C\.t\(/g)].map((m) => m[1]);
    ok(kinds.join(',') === 'hold,left,cw,right,soft,drop', 'the pad has its six buttons (' + kinds.join(',') + ')');
    ok(/b\.classList\.add\('bd-btn--' \+ kind\);/.test(html),'each pad button carries its kind as a class');
    const cq = (css.match(/@container game \(min-aspect-ratio: 5 \/ 4\) \{([\s\S]*?)\n  \}/) || [])[1] || '';
    ok(/\.bd-pad\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3, auto\)/.test(cq), 'in a wide window the pad is a grid of three columns');
    ok(/\.bd-btn--hold\s*\{\s*order:\s*1;/.test(cq) && /\.bd-btn--soft, \.bd-btn--drop\s*\{\s*order:\s*2;/.test(cq), 'moves and rotation on the top row, hold and drops below');
    ok(/\.ch-nocq \.ch-gamemain\.ch-wide \.bd-pad\s*\{[^}]*display:\s*grid;[^}]*repeat\(3, auto\)/.test(css)
      && /\.ch-nocq \.ch-gamemain\.ch-wide \.bd-btn--hold\s*\{\s*order:\s*1;/.test(css)
      && /\.ch-nocq \.ch-gamemain\.ch-wide \.bd-btn--soft, \.ch-nocq \.ch-gamemain\.ch-wide \.bd-btn--drop\s*\{\s*order:\s*2;/.test(css),
    'WebViews without container queries get the same pad (#610)');
    ok(/\.bd-pad\s*\{[^}]*direction:\s*ltr/.test(css), 'left stays on the left in Persian');
  }
  return { testBlockdropLayout };
};
