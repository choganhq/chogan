'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;

  // Chrome on Android reports prefers-reduced-motion: reduce when the system animation scale
  // is 0, which switched off every animation of the app for a player who only wanted a snappy
  // phone (#881). The app now has its own Auto / On / Off choice, so On wins over the system.
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const core = () => read('www/lib/chogan.js');
  const fnBody = (src, re) => (src.match(re) || [''])[0];

  function testMotionOn() {
    head('Motion: an app-wide Auto / On / Off choice beats the system setting (#881)');
    const js = core();

    // reduceMotion(): run the core's own function against a fake document
    const rm = fnBody(js, /ui\.reduceMotion = function \(\) \{[\s\S]*?\n  \};/);
    ok(rm.length > 0, 'ui.reduceMotion is found in the core');
    if (rm) {
      const run = (attr, systemReduces) => {
        const ui = {};
        const sb = {
          ui,
          document: { documentElement: { getAttribute: (k) => (k === 'data-motion' ? attr : null) } },
          global: { matchMedia: () => ({ matches: systemReduces }) }
        };
        vm.runInNewContext(rm, sb);
        return ui.reduceMotion();
      };
      ok(run(null, true) === true, 'Auto follows a system that asks for reduced motion');
      ok(run(null, false) === false, 'Auto follows a system that does not');
      ok(run('on', true) === false, 'On keeps animations although the system asks for reduced motion (the #881 case)');
      ok(run('off', false) === true, 'Off stops them although the system allows them');
    }

    // applyMotion(): Auto leaves no attribute, the other two set it
    const ap = fnBody(js, /Chogan\.applyMotion = function \(\) \{[\s\S]*?\n  \};/);
    ok(ap.length > 0, 'Chogan.applyMotion exists');
    if (ap) {
      const attrs = {};
      const sb = {
        Chogan: {}, state: { settings: {} },
        document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } } }
      };
      vm.runInNewContext(ap, sb);
      const set = (v) => { sb.state.settings.motion = v; sb.Chogan.applyMotion(); return attrs['data-motion']; };
      ok(set('on') === 'on' && set('off') === 'off', 'On and Off are written to the root element');
      ok(set('auto') === undefined && set(undefined) === undefined && set('junk') === undefined, 'Auto, a missing value and junk leave it unset');
    }
    ok(/motion: 'auto'/.test(js), 'the default is Auto, so nobody who asked their system for less motion loses that');
    ok(/Chogan\.applyMotion\(\);/.test(fnBody(js, /Chogan\.boot = function[\s\S]*?Chogan\.cards\.applyBack\(\);/)), 'the choice is applied at boot, before the first paint');
    ok(/Chogan\.setMotion = function/.test(js), 'a setter saves the choice');

    // the stylesheet: the system rule must not apply while the choice is On
    const css = read('www/lib/chogan.css');
    const media = fnBody(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/);
    ok(/:root:not\(\[data-motion="on"\]\)/.test(media), 'the core stylesheet skips its reduced-motion rule when the choice is On');

    // every game's own rule, and the one game that asked the browser directly
    const games = T.games().map((g) => g.id);
    ok(games.length > 50, 'the catalogue was loaded (' + games.length + ' games)');
    let withRule = 0;
    games.forEach((id) => {
      const html = read('www/games/' + id + '/index.html');
      // brace-matched, so one-line and multi-line blocks read alike
      const blocks = [];
      for (const m of html.matchAll(/@media \(prefers-reduced-motion: reduce\) \{/g)) {
        let d = 1, k = m.index + m[0].length;
        while (d && k < html.length) { d += (html[k] === '{') - (html[k] === '}'); k++; }
        blocks.push(html.slice(m.index + m[0].length, k - 1));
      }
      if (blocks.length || /prefers-reduced-motion: no-preference/.test(html)) withRule++;
      blocks.forEach((inner) => {
        const sels = [...inner.matchAll(/(?:^|\})\s*([^{}]+?)\s*\{/g)].map((m) => m[1]);
        ok(sels.length > 0 && sels.every((x) => x.split(',').every((one) => /^\s*:root:not\(\[data-motion="on"\]\)/.test(one))),
          id + ': its reduced-motion rule is skipped when the choice is On');
      });
      ok(!/matchMedia\('\(prefers-reduced-motion/.test(html), id + ': asks C.ui.reduceMotion(), not the browser, so the choice counts');
    });
    ok(withRule >= 15, 'the games with their own reduced-motion rules were found (' + withRule + ')');
    const mj = read('www/games/mahjong/index.html');
    ok(/:root\[data-motion="on"\] \.mj-tile/.test(mj), 'mahjong: its tile transition also runs when the choice is On');

    // the Profile control, in every language
    const idx = read('www/index.html');
    ok(/C\.setMotion\(v\)/.test(idx), 'the Profile offers the choice');
    const keys = ['motion', 'motionAuto', 'motionOn', 'motionOff'];
    LOCALE_CODES.forEach((l) => {
      const block = (js.match(new RegExp('\\n    ' + l + ': \\{[\\s\\S]*?\\n    \\},?\\n', 'm')) || [''])[0];
      ok(keys.every((k) => new RegExp('\\b' + k + ": '[^']+'").test(block)), l + ': the four words of the choice are written');
    });
  }

  return { testMotionOn };
};
