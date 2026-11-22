'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;

  // #1009: the Android app stayed dark on a light phone. Capacitor's AppTheme.NoActionBar
  // extends Theme.AppCompat (a dark theme with isLightTheme=false), and the WebView takes
  // prefers-color-scheme from that, so the "auto" theme always saw dark.
  function testAndroidSystemTheme() {
    head('Android: the app theme follows the device day/night mode (#1009)');
    const res = path.join(ROOT, 'android/app/src/main/res');
    const read = (f) => { try { return fs.readFileSync(path.join(res, f), 'utf8'); } catch (e) { return ''; } };
    const styles = read('values/styles.xml');
    const launch = (styles.match(/<style name="AppTheme\.Launch"[^>]*>/) || [''])[0];
    ok(launch.length > 0, 'AppTheme.Launch found in styles.xml');
    ok(/parent="Theme\.AppCompat\.DayNight\.NoActionBar"/.test(launch),
      'AppTheme.Launch extends a DayNight theme, so the WebView sees the device\'s mode');
    ok(/windowActionBar">false</.test(styles) && /windowNoTitle">true</.test(styles), 'the action bar and title stay off, as in the theme it replaces');
    const day = (read('values/colors.xml').match(/name="launchBackground">(#[0-9A-Fa-f]{6})</) || [])[1];
    const night = (read('values-night/colors.xml').match(/name="launchBackground">(#[0-9A-Fa-f]{6})</) || [])[1];
    const css = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.css'), 'utf8');
    const bg = (block) => ((css.match(block) || [''])[0].match(/--c-bg: +(#[0-9A-F]{6});/) || [])[1];
    ok(day && day.toUpperCase() === bg(/^:root \{[\s\S]*?^\}/m), 'the launch background is the light page colour by day (' + day + ')');
    ok(night && night.toUpperCase() === bg(/^:root\[data-theme="dark"\] \{[\s\S]*?^\}/m), 'and the dark page colour at night (' + night + ')');
  }

  return { testAndroidSystemTheme };
};
