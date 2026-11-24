'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // #1116: deploy-pages sometimes asks for the artifact before GitHub lists it and fails the whole
  // deploy. The Deploy step must not fail the job on its first try, a retry must run only after a
  // failure, and the live check must read the URL from whichever attempt deployed.
  function testPagesRetry() {
    head('Pages deploy retries once (#1116)');
    const y = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
    const m = y.match(/\n  pages:\n([\s\S]*?)(?=\n  [a-z][a-z0-9_-]*:\n|$)/);
    ok(!!m, 'pages job found');
    if (!m) return;
    const job = m[1];
    const first = job.match(/- name: Deploy\n([\s\S]*?)(?=\n      - name:|\n      #|$)/);
    ok(!!first && /id: deployment\n/.test(first[1]) && /continue-on-error: true/.test(first[1]), 'the first Deploy attempt may fail without failing the job');
    const retry = job.match(/- name: Deploy \(retry\)\n([\s\S]*?)(?=\n      - name:|\n      #|$)/);
    ok(!!retry && /id: deployment_retry/.test(retry[1]) && /steps\.deployment\.outcome == 'failure'/.test(retry[1]) && /actions\/deploy-pages/.test(retry[1]), 'the retry runs only after a failed first attempt');
    ok(/sleep \d+/.test(job), 'the retry waits first');
    const verify = job.slice(job.indexOf('tools/verify-deploy.sh'));
    ok(/steps\.deployment\.outputs\.page_url \|\| steps\.deployment_retry\.outputs\.page_url/.test(verify), 'the live check takes the URL from either attempt');
  }
  return { testPagesRetry };
};
