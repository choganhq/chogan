'use strict';
// #1188: the outage of #1173 left playchogan.com/report/ cached in browsers as a permanent
// redirect to /chogan/report/, a page that did not exist.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
module.exports = function (T) {
  const { ok, head } = T;
  function testReportRedirect() {
    head('Report form: the address cached during the outage leads back to the form (#1188)');
    const file = path.join(__dirname, '..', '..', 'www', 'report', 'index.html');
    const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    ok(html !== '', 'there is a page at /chogan/report/');
    const script = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
    const go = (search) => { let to = ''; vm.runInNewContext(script, { location: { search, replace: (u) => { to = u; } } }); return to; };
    ok(go('') === 'https://playchogan.com/report/?from=app', 'it sends the visitor to the form');
    ok(go('?lang=en') === 'https://playchogan.com/report/?from=app&lang=en', 'and keeps the language it was opened with');
    ok(!/href="https:\/\/playchogan\.com\/report\/"/.test(html) && /href="https:\/\/playchogan\.com\/report\/\?from=app"/.test(html), 'its links avoid the cached address too');
  }
  return { testReportRedirect };
};
