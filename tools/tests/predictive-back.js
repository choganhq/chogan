// Without the opt-in and the progress callbacks the app gives no sign of a back gesture
// before the finger lifts, and no test on a laptop would notice (#1208).
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testPredictiveBack() {
    head('Predictive back');
    const m = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    ok(m.includes('android:enableOnBackInvokedCallback="true"'), 'Android 14 and 15 send the gesture progress');
    const j = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/io/github/choganhq/chogan/MainActivity.java'), 'utf8');
    ok(/void handleOnBackProgressed\(BackEventCompat event\)[\s\S]{0,300}follow\(/.test(j), 'the page follows the finger');
    ok(/void handleOnBackCancelled\(\)\s*\{\s*settle\(\);/.test(j), 'a cancelled gesture puts the page back');
    ok(/void handleOnBackPressed\(\)\s*\{\s*settle\(\);/.test(j), 'a completed gesture puts the page back');
  }
  return { testPredictiveBack };
};
