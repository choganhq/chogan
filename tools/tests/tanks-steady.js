'use strict';
module.exports = function (T) {
  const { ok, head, loadEngine, fs, path, ROOT } = T;
  // The weapon and move row vanished in the bot's turn and the status wrapped to two lines
  // only on the player's, so the board grew and shrank every turn (owner, 2026-11-08):
  // run the page's renderArms/renderPad in the bot's turn and require the rows built but hidden.
  function testTanksSteadyControls() {
    head("Tanks: the controls keep their room in the bot's turn");
    const E = loadEngine('tanks', 'TanksEngineFactory');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/tanks/index.html'), 'utf8');
    const rng = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
    const fns = ['renderArms', 'renderPad', 'canShow'].map((n) => (html.match(new RegExp('  function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n')) || [''])[0]);
    ok(fns.every(Boolean), 'Tanks has renderArms, renderPad and canShow to test (' + fns.map((f) => f.length).join(', ') + ')');
    if (fns.every(Boolean)) {
      const node = () => ({ kids: [], style: {}, set innerHTML(v) { this.kids = []; }, appendChild(c) { this.kids.push(c); } });
      const el = () => Object.assign(node(), { addEventListener() {} });
      const arms = node(), pad = node();
      const M = E.match(rng(5)); M.turn = 1;
      const env = { G: { mode: 'bot', done: false, phase: 'busy', M }, prefs: { control: 'nums' }, arm: 'shell', arms, pad, el, E, C: { t: (k) => k, num: String },
        isBot: (s) => s === 1, dial: () => el(), stepTank() {}, canAim: () => false, shoot() {} };
      new Function(...Object.keys(env), fns.join('\n') + '; renderArms(); renderPad();')(...Object.values(env));
      ok(arms.kids.length > 0 && arms.style.visibility === 'hidden', "in the bot's turn the weapon and move row keeps its room, hidden (" + arms.kids.length + ' parts, ' + arms.style.visibility + ')');
      ok(pad.kids.length > 0 && pad.style.visibility === 'hidden', "in the bot's turn the angle and power pad keeps its room, hidden (" + pad.kids.length + ' parts)');
    }
    const st = html.match(/\.tk-status \{[^}]*min-height: ([\d.]+)em/);
    ok(st && +st[1] >= 2.6, 'the status line keeps room for two lines, so a wrapped turn message does not move the board (' + (st && st[1]) + 'em)');
  }
  return { testTanksSteadyControls };
};
