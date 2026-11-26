'use strict';
// A contributor follows these two files literally. They still sent new tests into
// tools/test.js after it reached the 1 MB guard, and named only some languages.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testContributorDocs() {
    head('Contributor docs match the repository');
    const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const con = read('CONTRIBUTING.md');
    const neu = read('NEW_GAME.md');
    ok(con.includes('tools/tests/'), 'CONTRIBUTING sends new test groups to tools/tests/');
    ok(neu.includes('tools/tests/'), 'NEW_GAME sends new test groups to tools/tests/');
    ok(!/each of the \w+ store descriptions/.test(con), 'CONTRIBUTING does not hardcode how many store descriptions there are');
    ok(!neu.includes('(فارسی، انگلیسی،'), 'NEW_GAME does not keep its own partial list of languages');
    ok(!neu.includes('نسخه را بالا ببر'), 'NEW_GAME does not ask a contributor to bump the version');
    // the independent check of #1203 found these still saying otherwise
    ok(!/games\.json`, bump the version|`games\.json`، بالا بردن نسخه/.test(read('README.md')), 'README does not ask a contributor to bump the version');
    ok(con.includes('`staging` branch') && neu.includes('`staging`'), 'both guides say a new game goes through staging');
    ok(neu.includes('GAMES.md'), 'NEW_GAME asks for the GAMES.md rows');
  }
  return { testContributorDocs };
};
