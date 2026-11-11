'use strict';
// The "Recently updated" sort reads each game's hand-kept `updated` date (#720). #773:
// Wrigglers, Doubles, Jigsaw and Minesweeper changed for players and kept old dates, so
// they sat low in the list. tools/updated-gate.sh fails a pull request that changes a
// game's folder without moving that game's date. These groups run it on scratch repos.
module.exports = function (T) {
  const { ok, head, fs, path, os, spawnSync, ROOT } = T;

  function testUpdatedDates() {
    head('Every game has a real updated date, and the gate is wired (#773)');
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;
    ok(list.length > 0, 'the game list is not empty');
    const stale = list.filter((g) => !/^\d{4}-\d{2}-\d{2}$/.test(g.updated || ''));
    ok(stale.length === 0, 'every game has an updated date' + (stale.length ? ': ' + stale.map((g) => g.id).join(', ') : ''));
    const by = Object.fromEntries(list.map((g) => [g.id, g.updated]));
    ok(by.wrigglers === '2026-11-09', 'Wrigglers carries the day of its light theme (' + by.wrigglers + ')');
    ok(by.doubles >= '2026-11-09', 'Doubles carries the day of its arrow pad (' + by.doubles + ')');
    ok(by.jigsaw >= '2026-11-10', 'Jigsaw carries the day of its crop fix (' + by.jigsaw + ')');
    ok(by.minesweeper >= '2026-11-10', 'Minesweeper carries the day of its tap fix (' + by.minesweeper + ')');
    const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
    const i = wf.indexOf('run: bash tools/updated-gate.sh');
    ok(i > 0 && i < wf.indexOf('run: node tools/test.js'), 'the test job runs the updated-date gate before the tests');
  }

  function testUpdatedGate() {
    head('A changed game must move its updated date (#773)');
    const gate = path.join(ROOT, 'tools/updated-gate.sh');
    ok(fs.existsSync(gate), 'tools/updated-gate.sh exists');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chogan-upd-'));
    const G = ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'init.defaultBranch=main'];
    const git = (cwd, ...args) => {
      const r = spawnSync('git', G.concat(args), { cwd, encoding: 'utf8' });
      if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + r.stderr);
      return r.stdout;
    };
    const IDS = ['a', 'b', 'c', 'd', 'e'];
    const json = (dates) => JSON.stringify({ games: Object.keys(dates).map((id) => ({ id, updated: dates[id] })) }, null, 2) + '\n';
    const base = { a: '2026-11-01', b: '2026-11-01', c: '2026-11-01', d: '2026-11-01', e: '2026-11-01' };
    function scenario(opts) {
      const id = String(Math.random()).slice(2);
      const remote = path.join(tmp, 'r' + id + '.git');
      const work = path.join(tmp, 'w' + id);
      git(tmp, 'init', '-q', '--bare', remote);
      git(tmp, 'init', '-q', work);
      fs.mkdirSync(path.join(work, 'www/games'), { recursive: true });
      for (const g of IDS) { fs.mkdirSync(path.join(work, 'www/games', g), { recursive: true }); fs.writeFileSync(path.join(work, 'www/games', g, 'index.html'), g + '0\n'); }
      fs.writeFileSync(path.join(work, 'www/games.json'), json(base));
      git(work, 'add', '-A'); git(work, 'commit', '-q', '-m', 'main');
      git(work, 'remote', 'add', 'origin', remote); git(work, 'push', '-q', 'origin', 'main');
      git(work, 'switch', '-q', '-c', 'pr');
      for (const g of opts.touch || []) fs.writeFileSync(path.join(work, 'www/games', g, 'index.html'), g + '1\n');
      for (const g of opts.add || []) { fs.mkdirSync(path.join(work, 'www/games', g), { recursive: true }); fs.writeFileSync(path.join(work, 'www/games', g, 'index.html'), 'new\n'); }
      const dates = Object.assign({}, base, opts.dates || {});
      for (const g of opts.add || []) dates[g] = '2026-11-11';
      fs.writeFileSync(path.join(work, 'www/games.json'), opts.rawJson || json(dates));
      git(work, 'add', '-A'); git(work, 'commit', '-q', '--allow-empty', '-m', 'pr');
      const r = spawnSync('bash', [gate], {
        cwd: work, encoding: 'utf8',
        env: Object.assign({}, process.env, { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main', GATE_REMOTE: 'origin' }, opts.env || {})
      });
      return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
    }
    const run = (label, opts) => {
      try { return scenario(opts); } catch (e) { ok(false, label + ': ' + e.message); return { status: -1, out: '' }; }
    };
    try {
      let r = run('stale', { touch: ['b'] });
      ok(r.status === 1 && /- b\b/.test(r.out), 'a changed game with an unmoved date fails and is named (exit ' + r.status + ')');
      r = run('two, one moved', { touch: ['b', 'c'], dates: { c: '2026-11-11' } });
      ok(r.status === 1 && /- b\b/.test(r.out) && !/- c\b/.test(r.out), 'only the game that kept its date is listed (exit ' + r.status + ')');
      r = run('moved', { touch: ['b'], dates: { b: '2026-11-11' } });
      ok(r.status === 0 && /moved its date/.test(r.out), 'a changed game with a moved date passes (exit ' + r.status + ')');
      r = run('global', { touch: ['a', 'b', 'c', 'd'] });
      ok(r.status === 0 && /global change/.test(r.out), 'a change across more than three games is global and passes (exit ' + r.status + ')');
      r = run('new game', { add: ['z'] });
      ok(r.status === 0, 'a game added by the PR needs no earlier date (exit ' + r.status + ')');
      r = run('no game', {});
      ok(r.status === 0 && /no game folder changed/.test(r.out), 'a PR that touches no game passes (exit ' + r.status + ')');
      r = run('push', { touch: ['b'], env: { GITHUB_EVENT_NAME: 'push' } });
      ok(r.status === 0 && /nothing to check/.test(r.out), 'a push is not gated (exit ' + r.status + ')');
      r = run('broken json', { touch: ['b'], rawJson: '{"games": [' });
      ok(r.status === 2, 'an unreadable games.json is "cannot test", exit 2 (exit ' + r.status + ')');
      r = run('no remote', { touch: ['b'], env: { GATE_REMOTE: path.join(tmp, 'nowhere.git') } });
      ok(r.status === 2, 'an unreachable remote is "cannot test", exit 2 (exit ' + r.status + ')');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  return { testUpdatedDates, testUpdatedGate };
};
