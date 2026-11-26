/* Chogan: the saved colour theme and light/dark choice, applied from <head> (#875).
   chogan.js loads at the end of <body>, so a page painted the default cream first and
   switched palettes a moment later: a flash on every page for anyone who picked another
   colour theme. This tiny file runs before the first paint. chogan.js applies the same
   settings again at boot and owns every later change; the id list below must match
   COLOR_THEMES there and the [data-colors] blocks in chogan.css (a test checks all three). */
(function (global) {
  'use strict';
  var MENU_PATTERNS = ['dots', 'none', 'stripes', 'lattice', 'grid', 'waves', 'rings'];
  var COLOR_THEMES = ['default', 'paper', 'slate', 'forest', 'rose', 'contrast'];
  // The Android app draws the page under its status bar, navigation bar and camera (#1205)
  // and tells each page how much of it they cover, in CSS pixels, before the first paint;
  // chogan.css folds --ch-inset-* into --safe-*. Browsers have no ChoganBars and keep env().
  try {
    var bars = global.ChoganBars;
    var v = bars && typeof bars.insets === 'function' ? String(bars.insets()).split(' ') : [];
    if (v.length === 4 && v.every(function (n) { return /^\d{1,4}$/.test(n); })) {
      var r = global.document.documentElement;
      r.classList.add('ch-edge');
      ['t', 'r', 'b', 'l'].forEach(function (k, i) { r.style.setProperty('--ch-inset-' + k, v[i] + 'px'); });
    }
  } catch (e) { /* an older APK without insets(): the WebView padded as before */ }
  try {
    var raw = global.localStorage.getItem('chogan.app.settings');
    var s = raw ? JSON.parse(raw) : null;
    if (!s || typeof s !== 'object') return;
    var root = global.document.documentElement;
    if (s.theme === 'light' || s.theme === 'dark') root.setAttribute('data-theme', s.theme);
    // the default needs no attribute; an unknown value from an older or newer build falls back to it
    if (s.colors !== 'default' && COLOR_THEMES.indexOf(s.colors) > 0) root.setAttribute('data-colors', s.colors);
    if (MENU_PATTERNS.indexOf(s.pattern) > 0) root.setAttribute('data-pattern', s.pattern);
  } catch (e) { /* no storage (private mode, blocked): the default look, as before */ }
})(this);
