// The landing page of playchogan.com (#1025). Only the files listed here are served from
// ./public; every other path keeps the 301 to the web app that #615 set up, query included,
// so links people already shared (a game's address) do not break.
const APP = 'https://choganhq.github.io/chogan';
const FILES = new Set([
  '/icon.png', '/favicon.svg', '/i18n.js',
  '/vazirmatn-variable.woff2', '/nunito-latin.woff2',
  '/OFL-Vazirmatn.txt', '/OFL-Nunito.txt', '/robots.txt', '/sitemap.xml',
  '/shots/fa-1.png', '/shots/fa-2.png', '/shots/fa-3.png', '/shots/fa-4.png', '/shots/fa-5.png', '/shots/fa-6.png',
  '/shots/en-1.png', '/shots/en-2.png', '/shots/en-3.png', '/shots/en-4.png', '/shots/en-5.png', '/shots/en-6.png',
]);

// One address per language (#1035): / is English, /fa, /es and so on. The page script builds the
// body text; the Worker sets what a crawler or a link preview reads without running it.
const LANGS = {
  fa: ['fa_IR', 'rtl', 'چوگان — بازی‌های کوچک، تمام‌شدنی، بدون مزاحمت'],
  en: ['en_US', 'ltr', 'Chogan — small games you can finish'],
  zh: ['zh_CN', 'ltr', 'Chogan — 可以玩完的小游戏'],
  de: ['de_DE', 'ltr', 'Chogan — kleine Spiele zum Fertigspielen'],
  es: ['es_ES', 'ltr', 'Chogan — juegos pequeños que puedes terminar'],
  pl: ['pl_PL', 'ltr', 'Chogan — małe gry, które da się skończyć'],
  fr: ['fr_FR', 'ltr', 'Chogan — de petits jeux que l’on peut finir'],
  ar: ['ar_AR', 'rtl', 'Chogan — ألعاب صغيرة يمكنك إنهاؤها'],
  hi: ['hi_IN', 'ltr', 'Chogan — छोटे खेल जिन्हें आप पूरा कर सकें'],
};

async function page(request, env, url, lang) {
  const res = await env.ASSETS.fetch(new URL('/index.html', url));
  const [locale, dir, title] = LANGS[lang];
  const href = 'https://playchogan.com/' + (lang === 'en' ? '' : lang);
  return new HTMLRewriter()
    .on('html', { element(e) { e.setAttribute('lang', lang); e.setAttribute('dir', dir); } })
    .on('title', { element(e) { e.setInnerContent(title); } })
    .on('link[rel=canonical]', { element(e) { e.setAttribute('href', href); } })
    .on('meta[property="og:url"]', { element(e) { e.setAttribute('content', href); } })
    .on('meta[property="og:title"]', { element(e) { e.setAttribute('content', title); } })
    .on('meta[property="og:locale"]', { element(e) { e.setAttribute('content', locale); } })
    .transform(res);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const seg = url.pathname.replace(/^\/|\/$/g, '');
    // a bare "/" with a query string (a campaign tag, a shared link) is still the landing page
    if (url.pathname === '/' || url.pathname === '/index.html') return page(request, env, url, 'en');
    if (seg === 'en') return Response.redirect('https://playchogan.com/' + url.search, 301);
    if (seg !== 'en' && Object.prototype.hasOwnProperty.call(LANGS, seg)) return page(request, env, url, seg);
    if (FILES.has(url.pathname)) return env.ASSETS.fetch(request);
    return Response.redirect(APP + url.pathname + url.search, 301);
  },
};
