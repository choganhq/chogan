// Minesweeper's optional looks (#1228): the default stays, the choice is saved, and the
// numbers and the flag stay readable on every look's own tiles.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT, LOCALE_CODES } = T;
  const lum = (hex) => {
    const h = hex.length === 4 ? hex.slice(1).replace(/./g, '$&$&') : hex.slice(1);
    const [r, g, b] = [0, 2, 4].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  function testMinesweeperLooks() {
    head('Minesweeper looks (#1228)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/minesweeper/index.html'), 'utf8');
    ok(/var look = ctx\.store\.get\('look', 'classic'\);/.test(html), 'the classic look is the default and the choice is read back');
    ok(/ctx\.store\.set\('look', v\);/.test(html), 'the choice is saved');
    ok(/gearBtn\.addEventListener\('click', function \(\) \{ showSettings\(\); \}\);/.test(html) && /tools\.appendChild\(gearBtn\);/.test(html), 'the looks are chosen behind a gear among the tools');
    ok(!/ctx\.button\(\{ icon: 'gear'/.test(html), 'not in the game bar, where it cut the name on a phone');
    ['garden', 'sea', 'neon', 'retro'].forEach((name) => {
      const body = (html.match(new RegExp('\\[data-skin="' + name + '"\\] \\.ms-board, \\[data-skin="' + name + '"\\] \\.ms-swatch \\{([^}]*)\\}')) || [])[1];
      ok(!!body, name + ': its colours were found');
      if (!body) return;
      const alt = (html.match(new RegExp('\\[data-skin="' + name + '"\\] \\[data-alt\\] \\{([^}]*)\\}')) || ['', ''])[1];
      const all = (src, key) => (src.match(new RegExp('--ms-' + key + ': (#[0-9a-f]+);', 'i')) || [])[1];
      const closed = [all(body, 'closed'), all(alt, 'closed')].filter(Boolean);
      const open = [all(body, 'open'), all(alt, 'open')].filter(Boolean);
      const flag = all(body, 'flag');
      ok(closed.length > 0 && open.length > 0 && !!flag, name + ': closed, open and flag colours are set');
      ok(!!flag && closed.every((c) => ratio(flag, c) >= 3), name + ': the flag is at least 3:1 on a closed tile');
      const low = [];
      for (let n = 1; n <= 8; n++) { const c = all(body, 'n' + n); if (!c || !open.every((o) => ratio(c, o) >= 3)) low.push(n); }
      ok(!low.length, name + ': all eight numbers are at least 3:1 on an opened tile' + (low.length ? '; not: ' + low.join(' ') : ''));
    });
    LOCALE_CODES.forEach((code) => {
      const block = (html.match(new RegExp('\\n      ' + code + ': \\{[\\s\\S]*?\\n      \\}')) || [''])[0];
      ok(['look', 'lookClassic', 'lookGarden', 'lookSea', 'lookNeon', 'lookRetro'].every((k) => new RegExp('\\b' + k + ": '").test(block)), code + ': the names of the looks');
    });
  }
  return { testMinesweeperLooks };
};
