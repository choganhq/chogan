'use strict';
// #740: Wrigglers' arena was dark in both themes; it now follows the app's theme.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  function testWrigglersLight() {
    head('Wrigglers light theme (#740)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/wrigglers/index.html'), 'utf8');
    const m = html.match(/var THEMES = (\{[\s\S]*?\n {2}\});/);
    ok(!!m, 'the page declares its two arena palettes in THEMES');
    if (!m) throw new Error('THEMES block not found in wrigglers');
    const { dark, light } = vm.runInNewContext('(' + m[1] + ')');
    const lum = (h) => {
      const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    // the dark arena is pinned to the colours it shipped with
    ok(dark.player === '#FF4FB8' && dark.floor === '#0E1224' && dark.scale === '#131936' && dark.out === '#05060C' && dark.wall === '#FF3B5C' && dark.glow === 0.22, 'the dark arena keeps its colours');
    ok(dark.bots.join() === '#4FD1FF,#7CFF6B,#FFD24F,#FF8A3D,#B98CFF,#4FFFC8,#FF6B6B,#9EC1FF' && dark.food.join() === '#FF5C7A,#FFB84D,#FFE74D,#7CFF6B,#4FFFC8,#4FD1FF,#9E8CFF,#FF7AF0', 'the dark arena keeps its snake and food colours');
    ok(light.bots.length === dark.bots.length && light.food.length === dark.food.length && light.bots.length > 0 && light.food.length > 0, 'both palettes have the same number of colours (' + light.bots.length + ' snakes, ' + light.food.length + ' foods)');
    const set = light.bots.concat(light.food, [light.player, light.wall]);
    const low = set.filter((c) => cr(c, light.floor) < 3 || cr(c, light.scale) < 3);
    ok(set.length === 18 && !low.length, 'every light snake, food and wall colour has at least 3:1 on both floor shades (' + set.length + ' checked' + (low.length ? '; too faint: ' + low.join(', ') : '') + ')');
    // text is drawn from rgba values, so its base colour is read back from them
    const rgb = (s) => { const v = s.match(/\d+/g).slice(0, 3).map(Number); return '#' + v.map((n) => n.toString(16).padStart(2, '0')).join(''); };
    ok(cr(rgb(light.text), light.scale) >= 4.5 && cr(light.scrimText, light.floor) >= 4.5, 'the light arena\'s score text and "tap to go on" have at least 4.5:1');
    // the failure this guards: one colour left out of the palette stays white on a pale floor
    const drawn = html.slice(html.indexOf('function floorPattern'), html.indexOf('/* ----------------------------------------------------------------- ui */'));
    ok(drawn.length > 2000, 'the drawing code was found');
    const fixed = (drawn.match(/#(0E1224|05060C|131936|FF3B5C)|rgba\(255,255,255,\.(95|65|5|55|4|07)\)|rgba\(5,6,12|\b(PLAYER|BOTC|FOODC)\b/g) || []);
    ok(!fixed.length, 'the drawing code takes every theme colour from the palette (' + (fixed.join(', ') || 'none hardcoded') + ')');
    ok(/function syncTheme\(\)/.test(html) && /if \(!S\) return;\s+syncTheme\(\);/.test(html), 'the theme is read again on every draw, so "auto" follows the system during a run');
    ok(/fill="' \+ P\.floor \+ '"/.test(html), 'the tutorial pictures use the same floor as the arena');
  }
  return { testWrigglersLight };
};
