'use strict';
// #1210 (xmha97, Android TV): a remote has arrows and OK but no Tab. The menu's arrows moved
// between game cards only, so the tab bar, sort, search and settings could not be reached.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;

  function testMenuRemote() {
    head('Menu: a TV remote reaches every control (#1210)');
    const menu = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const from = menu.indexOf('function kbStep(');
    const to = menu.indexOf('// #1102:', from);
    const src = from > 0 && to > from ? menu.slice(from, to) : '';
    ok(src.indexOf('function kbMove(from, key)') > 0, 'the menu has kbMove beside kbStep');
    ok(/button, select, input/.test(src) && /!n\.disabled && n\.getClientRects\(\)\.length > 0/.test(src),
      'arrows move over buttons, lists and fields that are shown and enabled');

    const box = (name, left, top, w, h) => ({ name, disabled: false, getClientRects: () => [1],
      getBoundingClientRect: () => ({ left, top, width: w, height: h, right: left + w, bottom: top + h }) });
    const run = (page, tabs) => {
      const app = { querySelectorAll: () => page };
      const navIn = { querySelectorAll: () => tabs, contains: (n) => tabs.indexOf(n) >= 0 };
      try {
        return vm.runInNewContext('(function (app, navIn, window) { ' + src + ' return kbMove; })', {})(app, navIn, { innerHeight: 700 });
      } catch (e) { return () => ({ name: 'threw ' + e.message }); }
    };
    const name = (n) => (n ? n.name : 'none');

    // phone: a floating bar at the bottom, a second row of cards below the screen
    const sort = box('sort', 20, 40, 200, 40), a = box('a', 20, 500, 100, 100), b = box('b', 140, 500, 100, 100);
    const low = box('low', 20, 800, 100, 100);
    const home = box('home', 20, 630, 100, 60), daily = box('daily', 140, 630, 100, 60);
    home.getAttribute = () => 'false'; daily.getAttribute = () => 'true';
    let move = run([sort, a, b, low], [home, daily]);
    ok(name(move(sort, 'ArrowDown')) === 'a', 'down from the sort list reaches the cards');
    ok(name(move(a, 'ArrowDown')) === 'low', 'the next row off screen wins over the floating bar');
    ok(name(move(low, 'ArrowDown')) === 'daily', 'down past the last row reaches the chosen tab, even from under the bar');
    ok(name(move(home, 'ArrowRight')) === 'daily', 'right moves along the tabs');
    ok(name(move(daily, 'ArrowRight')) === 'none', 'and stops at the last one');
    ok(name(move(daily, 'ArrowUp')) === 'b', 'up from the bar returns to what is on screen');
    ok(name(move(a, 'ArrowLeft')) === 'none', 'left at the start of a row does not jump to the bar');

    // TV / landscape: a rail on the left
    const t1 = box('t1', 0, 100, 60, 60), t2 = box('t2', 0, 170, 60, 60);
    const chip = box('chip', 80, 20, 60, 30), c = box('c', 100, 120, 100, 100), d = box('d', 220, 120, 100, 100);
    move = run([chip, c, d], [t1, t2]);
    ok(name(move(d, 'ArrowLeft')) === 'c', 'rail: left moves along the row');
    ok(name(move(c, 'ArrowLeft')) === 't1' || name(move(c, 'ArrowLeft')) === 't2', 'rail: left from the first card reaches the tabs, not a control above');
    ok(name(move(t1, 'ArrowDown')) === 't2', 'rail: down moves along the tabs');
    ok(name(move(t2, 'ArrowRight')) === 'c', 'rail: right returns to the page');

    const handler = menu.slice(to);
    ok(/var next = kbMove\(cur, e\.key\);/.test(handler), 'the arrow keys use it');
    ok(/e\.defaultPrevented \|\| e\.ctrlKey/.test(handler), 'a key another control used is left alone');
    ok(/\/Left\|Right\/\.test\(e\.key\) && \/\^\(INPUT\|TEXTAREA\)\$\//.test(handler), 'left and right stay in a text field or slider');
    ok(/if \(held && tab === t\.id\) b\.focus\(\);/.test(menu), 'the chosen tab keeps the focus after the bar is redrawn');
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    ok(/#app :is\(button, input, select, \.ch-kbnav\):focus-visible \{ scroll-margin-block: 72px 104px; \}/.test(css),
      'a focused control is scrolled clear of the floating bar');
  }
  return { testMenuRemote };
};
