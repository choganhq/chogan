'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // #978: Grabber could only be restarted with the R key, so on a phone the only way to start
  // a machine over was the machine list. A restart button now sits in the game bar.
  function testClawRestartButton() {
    head('Grabber: a restart button in the game bar (#978)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/claw/index.html'), 'utf8');
    ok(/if \(!dailyDate\) ctx\.button\(\{ icon: 'refresh', label: C\.t\('restart'\), onClick: restartAsk \}\);/.test(html),
      'outside the daily machine the bar has a refresh button that calls restartAsk');
    ok(/function restartAsk\(\) \{[\s\S]{0,400}?C\.ui\.confirm\(/.test(html), 'restartAsk asks before throwing away a machine in progress');
  }
  return { testClawRestartButton };
};
