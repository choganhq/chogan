'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  // In English the privacy page showed the Persian policy first (#671, the owner's
  // screenshot). The page's own scripts run here on a small model of its <main>, and the
  // order of what is left is read back for each app language.
  function testPrivacyLang() {
    head('Privacy page reads in the app language first (#671)');
    const html = fs.readFileSync(path.join(ROOT, 'www/privacy.html'), 'utf8');
    const mainHtml = (html.match(/<main class="pv">([\s\S]*?)<\/main>/) || [])[1] || '';
    const tops = [...mainHtml.matchAll(/<(section) lang="(\w+)"|<(hr)>/g)].map((m) => m[1] ? 'section:' + m[2] : 'hr');
    ok(tops.join(' ') === 'section:fa hr section:en', 'the page itself is Persian, a rule, then English (' + tops.join(' ') + ')');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    ok(scripts.length > 0, 'the page has inline scripts (' + scripts.length + ')');
    const run = (lang) => {
      const kids = tops.map((t) => ({ t, lang: t.split(':')[1] }));
      const node = (t) => kids.find((k) => k.t === t) || null;
      const main = {
        get firstElementChild() { return kids[0]; },
        querySelector(sel) { const m = sel.match(/section\[lang="(\w+)"\]/); return m ? node('section:' + m[1]) : sel === 'hr' ? node('hr') : null; },
        insertBefore(n, ref) { kids.splice(kids.indexOf(n), 1); const i = ref ? kids.indexOf(ref) : kids.length; kids.splice(i < 0 ? kids.length : i, 0, n); return n; },
      };
      kids.forEach((k) => Object.defineProperty(k, 'nextElementSibling', { get() { return kids[kids.indexOf(k) + 1] || null; } }));
      // Everything outside <main> (bar, theme colour) only needs to accept calls
      const stub = new Proxy({}, { get: (o, k) => (k in o ? o[k] : k === 'style' ? (o.style = {}) : () => null), set: (o, k, v) => { o[k] = v; return true; } });
      const store = { 'chogan.app.settings': lang ? JSON.stringify({ lang }) : null };
      const sb = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null) },
        document: { getElementById: () => stub, querySelector: (s) => (s === 'main.pv' ? main : stub), querySelectorAll: () => [], documentElement: stub, referrer: '' },
        matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
        location: { origin: '' }, history: { length: 1 },
      };
      sb.window = sb;
      vm.createContext(sb);
      for (const s of scripts) { try { vm.runInContext(s, sb); } catch (e) { return 'error: ' + e.message; } }
      return kids.map((k) => k.t).join(' ');
    };
    ok(run('en') === 'section:en hr section:fa', 'in English the English policy comes first (' + run('en') + ')');
    ok(['de', 'es', 'pl', 'zh'].every((l) => run(l) === 'section:en hr section:fa'), 'so it does in German, Spanish, Polish and Chinese');
    ok(run('fa') === 'section:fa hr section:en', 'in Persian the Persian policy stays first (' + run('fa') + ')');
    ok(run(null) === 'section:fa hr section:en', 'with no saved language (a first visit, or Play\'s reviewer) Persian stays first (' + run(null) + ')');
  }
  return { testPrivacyLang };
};
