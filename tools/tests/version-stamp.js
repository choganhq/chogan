'use strict';
// Split out of tools/test.js, which reached the 1 MB guard (#654).
module.exports = function (T) {
  const { ok, head, fs, path, vm, os, spawnSync, ROOT } = T;
  // مهر نسخه‌ی وب را همان اسکریپتی می‌زند که ورک‌فلو پیجز اجرا می‌کند. مقدارها با
  // ورودی‌های ثابت مقایسه می‌شوند نه با خروجی همان بیلد، وگرنه تست به هر دلیلی سبز می‌شد.
  function testVersionStamp() {
    head('مهر نسخه‌ی وب');
    const script = path.join(ROOT, 'tools/stamp-version.sh');
    const exists = fs.existsSync(script);
    ok(exists, 'اسکریپت مهر نسخه هست: tools/stamp-version.sh');
    if (!exists) return;

    const repoSrc = fs.readFileSync(path.join(ROOT, 'www/version.js'), 'utf8');
    // اف‌دروید از سورس می‌سازد و version.js را از main می‌خواند؛ فیلدهای استقرار نباید در ریپو باشند
    for (const k of ['APP_ENV', 'APP_COMMIT', 'APP_DEPLOY', 'APP_BUILD']) {
      ok(repoSrc.indexOf(k) < 0, 'نسخه‌ی ریپو ' + k + ' ندارد');
    }
    const intendedVersion = (repoSrc.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
    const intendedCode = Number((repoSrc.match(/APP_VERSION_CODE\s*=\s*(\d+)/) || [])[1]);

    const SHA = '0123456789abcdef0123456789abcdef01234567';
    const good = { GITHUB_SHA: SHA, GITHUB_RUN_ID: '987654321', GITHUB_RUN_ATTEMPT: '2', APP_ENV: 'production', DEPLOYED_AT: '2026-11-06T18:30:00Z' };

    function stamp(env) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chogan-stamp-'));
      const file = path.join(dir, 'version.js');
      fs.writeFileSync(file, repoSrc);
      const clean = Object.assign({}, process.env);
      for (const k of ['GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'APP_ENV', 'DEPLOYED_AT']) delete clean[k];
      const r = spawnSync('bash', [script, file], { env: Object.assign(clean, env), encoding: 'utf8' });
      const out = fs.readFileSync(file, 'utf8');
      fs.rmSync(dir, { recursive: true, force: true });
      return { status: r.status, out: out };
    }

    const r = stamp(good);
    ok(r.status === 0, 'مهر با ورودی درست موفق است (خروج ' + r.status + ')');
    const sb = { self: {} };
    vm.createContext(sb);
    try { vm.runInContext(r.out, sb); } catch (e) { ok(false, 'خروجی مهر جاوااسکریپت معتبر است: ' + e.message); }
    const v = sb.self;
    ok(v.APP_VERSION === intendedVersion, 'APP_VERSION دست نخورده (' + v.APP_VERSION + ')');
    ok(v.APP_VERSION_CODE === intendedCode, 'APP_VERSION_CODE دست نخورده (' + v.APP_VERSION_CODE + ')');
    ok(v.APP_BUILD === SHA.slice(0, 12), 'APP_BUILD دوازده نویسه‌ی اول کامیت است (' + v.APP_BUILD + ')');
    ok(v.APP_COMMIT === SHA, 'APP_COMMIT کل کامیت است (' + v.APP_COMMIT + ')');
    ok(v.APP_ENV === 'production', 'APP_ENV نام محیط است (' + v.APP_ENV + ')');
    ok(v.APP_DEPLOY === '987654321-2', 'APP_DEPLOY شناسه‌ی اجرا و تلاش است (' + v.APP_DEPLOY + ')');
    // The Profile shows how long ago the web build went live (#659)
    ok(v.APP_DEPLOYED_AT === '2026-11-06T18:30:00Z', 'APP_DEPLOYED_AT is the deploy time (' + v.APP_DEPLOYED_AT + ')');
    const now = (function () { const e = Object.assign({}, good); delete e.DEPLOYED_AT; return stamp(e); })();
    const nowSb = { self: {} };
    vm.createContext(nowSb);
    try { vm.runInContext(now.out, nowSb); } catch (e) { /* asserted below */ }
    const nowAge = Date.now() - Date.parse(nowSb.self.APP_DEPLOYED_AT || '');
    ok(now.status === 0 && nowAge >= 0 && nowAge < 120000, 'without DEPLOYED_AT the stamp is the current time (' + nowSb.self.APP_DEPLOYED_AT + ')');
    // The Android build cannot carry a build time (F-Droid rebuilds the same bytes), so the repo names the release day
    ok(/^self\.APP_RELEASED = '\d{4}-\d{2}-\d{2}';$/m.test(repoSrc), 'version.js names the release day in APP_RELEASED');
    ok(repoSrc.indexOf('APP_DEPLOYED_AT') < 0, 'نسخه‌ی ریپو APP_DEPLOYED_AT ندارد');
    // A release that forgets to move APP_RELEASED would show "2 weeks ago" on a fresh install
    const released = (repoSrc.match(/APP_RELEASED = '([\d-]+)'/) || [])[1] || '';
    const tagDates = (spawnSync('git', ['for-each-ref', 'refs/tags/v*', '--format=%(refname:short) %(creatordate:format-local:%Y-%m-%d)'], { cwd: ROOT, env: Object.assign({}, process.env, { TZ: 'UTC' }), encoding: 'utf8' }).stdout || '')
      .split('\n').filter((l) => /^v\d+\.\d+\.\d+ \d{4}-\d{2}-\d{2}$/.test(l)).map((l) => l.split(' '));
    ok(tagDates.length > 0, 'release tags with dates are readable for the APP_RELEASED check (' + tagDates.length + ')');
    const own = tagDates.find((t) => t[0] === 'v' + intendedVersion);
    if (own) {
      const gap = Math.abs(Date.parse(own[1]) - Date.parse(released)) / 864e5;
      ok(gap <= 1, 'APP_RELEASED (' + released + ') is the day v' + intendedVersion + ' was tagged (' + own[1] + ')');
    } else {
      const last = tagDates.map((t) => t[1]).sort().pop();
      ok(released >= last, 'APP_RELEASED (' + released + ') is not before the last release (' + last + ')');
    }

    // ورودی خراب نباید چیز نامعتبری وارد جاوااسکریپت منتشرشده کند
    const bad = [
      ['کامیت غیرهگز', Object.assign({}, good, { GITHUB_SHA: 'not-a-sha' })],
      ['بدون نام محیط', (function () { const e = Object.assign({}, good); delete e.APP_ENV; return e; })()],
      ['نام محیط با کوتیشن', Object.assign({}, good, { APP_ENV: "prod'uction" })],
      ['شناسه‌ی اجرای غیرعددی', Object.assign({}, good, { GITHUB_RUN_ID: '12x' })],
      ['deploy time not ISO UTC', Object.assign({}, good, { DEPLOYED_AT: "2026-11-06 18:30'" })]
    ];
    for (const [label, env] of bad) {
      const b = stamp(env);
      ok(b.status !== 0, label + ': مهر رد می‌شود (خروج ' + b.status + ')');
      ok(b.out === repoSrc, label + ': فایل دست نخورده می‌ماند');
    }

    // ورک‌فلو باید همین اسکریپت تست‌شده را اجرا کند، نه نسخه‌ی دیگری از منطق
    // انتشار حالا کار pages داخل test.yml است (#52)، پس همان‌جا را می‌خوانیم.
    const testYml = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
    const pagesJob = (testYml.match(/\n  pages:\n([\s\S]*?)(?=\n  [a-z][a-z0-9_-]*:\n|$)/) || [])[1] || '';
    ok(pagesJob.length > 0, 'کار pages در test.yml برای بررسی مهر پیدا شد');
    ok(/tools\/stamp-version\.sh\s+www\/version\.js/.test(pagesJob), 'انتشار همان tools/stamp-version.sh را اجرا می‌کند');
    ok(/APP_ENV:\s*production/.test(pagesJob), 'انتشار نام محیط را production می‌دهد');
    const wfDirStamp = path.join(ROOT, '.github/workflows');
    const wfFiles = fs.readdirSync(wfDirStamp).filter((f) => /\.ya?ml$/.test(f));
    ok(wfFiles.length > 0, 'فهرست ورک‌فلوها برای بررسی مهر خالی نیست');
    const inline = wfFiles.filter((f) => fs.readFileSync(path.join(wfDirStamp, f), 'utf8').indexOf('self.APP_BUILD') >= 0);
    ok(inline.length === 0, 'منطق مهر درون هیچ ورک‌فلویی تکرار نشده (' + inline.join(', ') + ')');
  }
  return { testVersionStamp };
};
