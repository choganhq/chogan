// The landing page of playchogan.com (#1025). Only the files listed here are served from
// ./public; every other path keeps the 301 to the web app that #615 set up, query included,
// so links people already shared (a game's address) do not break.
const APP = 'https://choganhq.github.io/chogan';
const FILES = new Set([
  '/icon.png', '/favicon.svg',
  '/vazirmatn-variable.woff2', '/nunito-latin.woff2',
  '/OFL-Vazirmatn.txt', '/OFL-Nunito.txt', '/robots.txt', '/sitemap.xml',
  '/shots/fa-1.png', '/shots/fa-4.png', '/shots/en-1.png', '/shots/en-4.png',
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // a bare "/" with a query string (a campaign tag, a shared link) is still the landing page
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return env.ASSETS.fetch(new URL('/index.html', url));
    }
    if (FILES.has(url.pathname)) return env.ASSETS.fetch(request);
    return Response.redirect(APP + url.pathname + url.search, 301);
  },
};
