// The coin must not look like real money (#1213).
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testCoinIcon() {
    head('The coin icon carries no currency sign (#1213)');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    const d = (core.match(/\n {4}coin: '(M[^']*)'/) || [])[1];
    ok(!!d, 'the coin icon path was found');
    ok(!!d && !d.includes('M12 7v10') && !/c-\.6-\.8/.test(d), 'it no longer draws the dollar sign');
    ok(!!d && d.startsWith('M12 21a9 9') && d.split('z').length === 3, 'it is a round coin with one closed mark inside');
  }
  return { testCoinIcon };
};
