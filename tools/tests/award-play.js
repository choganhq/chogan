'use strict';
// #1169: an award's window named its game but gave no way to it. It now has a Play button
// that opens that game; an award for the whole app keeps only Close. The page's own open()
// is extracted and run with a fake modal that records the actions it was given.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  function testAwardPlay() {
    head('Awards: an award opens its game (#1169)');
    const html = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const open = html.match(/ {4}function open\(a, un, g\) \{[\s\S]*?\n {4}\}\n/);
    ok(!!open, 'the awards page has open(a, un, g)');
    if (!open) return;
    const seen = { modal: null, went: [] };
    const box = {
      seen,
      C: {
        feedback() {}, t: (k) => k, achText: () => ({ title: 'T', sub: 'S' }),
        ui: { modal: (o) => { seen.modal = o; } }
      },
      el: () => ({}), achBadge: () => ({}), chip: () => ({}),
      dateOf: () => '',
      goGame: (g, d) => { seen.went.push([g.id, d]); }
    };
    vm.createContext(box);
    vm.runInContext(open[0] + 'this.open = open;', box);
    const award = { id: 'sd-win', icon: 'star' };
    box.open(award, true, { id: 'sudoku' });
    const acts = (seen.modal && seen.modal.actions) || [];
    ok(acts.length > 0, 'the award window has buttons (' + acts.length + ')');
    const play = acts.filter((a) => a.label === 'play')[0];
    ok(!!play && play.kind === 'primary', 'an award of a game has a primary Play button');
    ok(acts.some((a) => a.label === 'close'), 'and still a Close button');
    if (play) play.onClick();
    ok(seen.went.length === 1 && seen.went[0][0] === 'sudoku' && seen.went[0][1] === undefined,
      'Play opens that game, not its daily (' + JSON.stringify(seen.went) + ')');
    box.open(award, false, { id: 'chess' });
    const locked = seen.modal.actions.filter((a) => a.label === 'play')[0];
    ok(!!locked, 'a locked award also leads to its game, where it can be earned');
    box.open({ id: 'first', icon: 'star' }, true, null);
    ok(seen.modal.actions.length === 1 && seen.modal.actions[0].label === 'close',
      'an award for the whole app keeps only Close');
    box.open({ id: 'old', icon: 'star' }, true, undefined);
    ok(seen.modal.actions.length === 1 && seen.modal.actions[0].label === 'close',
      'an award whose game is not listed keeps only Close');
  }
  return { testAwardPlay };
};
