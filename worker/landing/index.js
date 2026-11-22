// The landing page of playchogan.com (#1025). Only the files listed here are served from
// ./public; every other path keeps the 301 to the web app that #615 set up, query included,
// so links people already shared (a game's address) do not break.
import { render, APP, CODES, ORIGIN } from './render.js';
import SHOTS from './shots-data.js';

const SHOT_FILES = Object.values(SHOTS).flat().flatMap((s) => Object.values(s));
const FILES = new Set([
  '/icon.png', '/favicon.svg', '/favicon.ico', ...CODES.map((c) => '/og/' + c + '.png'), '/apple-touch-icon.png',
  '/vazirmatn-variable.woff2', '/nunito-latin.woff2',
  '/OFL-Vazirmatn.txt', '/OFL-Nunito.txt', '/robots.txt', '/sitemap.xml',
  ...SHOT_FILES,
]);

// What a browser may keep. Fonts, shots and cards never change under the same name, so they
// are cached for a year; the page and the small files are revalidated so an edit shows at once.
function cacheFor(path) {
  if (/\.woff2$|^\/shots\/|^\/og\//.test(path)) return 'public, max-age=31536000, immutable';
  if (/^\/(icon\.png|apple-touch-icon\.png|favicon\.(svg|ico))$/.test(path)) return 'public, max-age=86400, must-revalidate';
  if (/^\/(robots\.txt|sitemap\.xml)$/.test(path)) return 'public, max-age=3600';
  return 'public, max-age=0, must-revalidate';
}

// Added to every answer, redirects included, because HSTS and the content-type guard only
// help on the response the browser actually reads.
function finish(res, path) {
  const h = new Headers(res.headers);
  if (res.status === 200) h.set('Cache-Control', cacheFor(path));
  h.set('Strict-Transport-Security', 'max-age=31536000');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

const redirect = (to) => Response.redirect(to, 301);

async function page(env, url, lang, root) {
  const res = await env.ASSETS.fetch(new URL('/index.html', url));
  const body = render(await res.text(), lang, root);
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function route(request, env) {
  const url = new URL(request.url);
  const p = url.pathname;
  if (url.hostname === 'www.playchogan.com') return redirect(ORIGIN + p + url.search);
  // "/" is English and the x-default; the device-language jump is a script in the page, so a
  // crawler or a visitor without JavaScript always gets this same document
  if (p === '/') return page(env, url, 'en', true);
  if (p === '/index.html') return redirect(ORIGIN + '/' + url.search);
  const m = p.match(/^\/([a-z]{2})(\/)?$/);
  if (m && CODES.includes(m[1])) {
    if (!m[2]) return redirect(ORIGIN + '/' + m[1] + '/' + url.search);
    return page(env, url, m[1], false);
  }
  if (FILES.has(p)) return env.ASSETS.fetch(request);
  return redirect(APP + p + url.search);
}

export default {
  async fetch(request, env) {
    return finish(await route(request, env), new URL(request.url).pathname);
  },
};
