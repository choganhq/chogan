'use strict';
// #792: the report form at playchogan.com/report/ had no way back except a small link
// under the long form. Its header row now starts with a back control: the browser's back
// when the player came from a Chogan page in this tab, the web app otherwise. The form's
// own script runs here against a fake page; the markup is read from the file.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT, LOCALE_CODES } = T;
  function testReportBack() {
    head('Report form: a back control in the header (#792)');
    const html = fs.readFileSync(path.join(ROOT, 'worker/report/src/form.html'), 'utf8');
    const hdr = (/<header>([\s\S]*?)<\/header>/.exec(html) || [])[1] || '';
    const back = (/<a class="back" id="backTop" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(hdr) || []);
    ok(back.length > 0, 'the header holds a back link');
    ok(back[1] === 'https://choganhq.github.io/chogan/', 'without anywhere to go back to, it opens the Chogan web app (' + back[1] + ')');
    ok(hdr.indexOf('id="backTop"') >= 0 && hdr.indexOf('id="backTop"') < hdr.indexOf('class="tools"'), 'it comes first in the row, before the theme and language controls, so it sits at the inline start');
    ok(/<svg[^>]*aria-hidden="true"/.test(back[2] || '') && /id="t-backTop"/.test(back[2] || ''), 'an arrow and the words');
    ok(/\[dir=rtl\] \.back svg \{ transform: scaleX\(-1\); \}/.test(html), 'the arrow points right in Persian, left in the other languages');
    ok(!/<header>[\s\S]*id="t-title"[\s\S]*<\/header>/.test(html) && /<\/header>\s*<h1 id="t-title"><\/h1>/.test(html), 'the title has its own line under the row, so it never squeezes beside the controls');
    ok(/\$\('t-backTop'\)\.textContent = t\('back'\);/.test(html), 'the words follow the chosen language');
    const backs = html.match(/[ ,{]back: '[^']+'/g) || [];
    ok(LOCALE_CODES.length > 0 && backs.length === LOCALE_CODES.length, 'the "back" words exist in all ' + LOCALE_CODES.length + ' languages (' + backs.length + ')');
    ok(/id="backLink"/.test(html), 'the link at the bottom stays');

    // the click, for real
    const at = html.indexOf('  var BACK_FROM = ');
    const end = html.indexOf('\n  });\n', at);
    ok(at > 0 && end > at, 'the form has the back logic to test');
    if (!(at > 0 && end > at)) return;
    const src = html.slice(at, end + 6);
    function click(referrer, length) {
      let handler = null, went = 0;
      const sb = {
        URL, location: { origin: 'https://playchogan.com' },
        document: { referrer },
        history: { length, back() { went++; } },
        $: () => ({ addEventListener(t, f) { if (t === 'click') handler = f; } })
      };
      vm.runInNewContext(src, sb);
      let prevented = false;
      handler({ preventDefault() { prevented = true; } });
      return { prevented, went };
    }
    const app = click('https://choganhq.github.io/', 2);
    ok(app.prevented && app.went === 1, 'from the app in the same tab it goes back, so the app keeps its place');
    const list = click('https://issues.playchogan.com/?lang=fa', 3);
    ok(list.prevented && list.went === 1, 'from the issues list it goes back too');
    const tab = click('https://choganhq.github.io/', 1);
    ok(!tab.prevented && tab.went === 0, 'a form opened in a new tab follows the link to the app');
    const none = click('', 2);
    ok(!none.prevented && none.went === 0, 'with no referrer it follows the link to the app');
    const other = click('https://example.com/page', 2);
    ok(!other.prevented && other.went === 0, 'from another site it does not send the player back there');
  }
  return { testReportBack };
};
