// Builds one language's page from public/index.html (#1039). It is plain string work, with no
// HTMLRewriter, so a crawler and a visitor without JavaScript get the same finished page and
// the tests can run the real thing in Node.
import I18N from './i18n-data.js';
import GAMES from './games-data.js';
import SHOTS from './shots-data.js';

export const ORIGIN = 'https://playchogan.com';
export const APP = 'https://choganhq.github.io/chogan';
export const CODES = ['fa', 'en', 'zh', 'de', 'es', 'pl', 'fr', 'ar', 'hi'];

// locale, direction, title (with the keywords people search for), description (about 150 characters)
// and the alt text of the social card, per language. Persian and English live in the HTML itself.
export const LANGS = {
  fa: ['fa_IR', 'rtl', 'چوگان — بازی‌های کوچک رایگان و آفلاین: سودوکو، شطرنج، حکم',
    'چوگان: ده‌ها بازی کوچک رایگان و متن‌باز مثل سودوکو، شطرنج، تخته‌نرد و حکم. بدون تبلیغ و ردیاب، کاملاً آفلاین، برای اندروید و وب.',
    'چوگان، بازی‌های کوچک و تمام‌شدنی'],
  en: ['en_US', 'ltr', 'Chogan — free offline mini games: Sudoku, chess, Hokm',
    'Chogan is a free, open-source app of short offline games: Sudoku, chess, backgammon, Hokm and dozens more. No ads, no purchases, no tracking.',
    'Chogan, small games you can finish'],
  zh: ['zh_CN', 'ltr', 'Chogan — 免费离线小游戏：数独、国际象棋、Hokm',
    'Chogan 是免费开源的离线小游戏合集：数独、国际象棋、双陆棋、Hokm 等数十款游戏。没有广告、没有内购、没有追踪。',
    'Chogan，可以玩完的小游戏'],
  de: ['de_DE', 'ltr', 'Chogan — kostenlose Offline-Minispiele: Sudoku, Schach, Hokm',
    'Chogan ist eine kostenlose Open-Source-App mit kurzen Offline-Spielen: Sudoku, Schach, Backgammon, Hokm und Dutzende mehr. Keine Werbung, keine Käufe.',
    'Chogan, kleine Spiele zum Fertigspielen'],
  es: ['es_ES', 'ltr', 'Chogan — minijuegos gratis sin conexión: sudoku, ajedrez, Hokm',
    'Chogan es una app gratuita y de código abierto con juegos cortos sin conexión: sudoku, ajedrez, backgammon, Hokm y decenas más. Sin anuncios ni compras.',
    'Chogan, juegos pequeños que puedes terminar'],
  pl: ['pl_PL', 'ltr', 'Chogan — darmowe gry offline: sudoku, szachy, Hokm',
    'Chogan to darmowa aplikacja open source z krótkimi grami offline: sudoku, szachy, tryktrak, Hokm i dziesiątki innych. Bez reklam i zakupów.',
    'Chogan, małe gry, które da się skończyć'],
  fr: ['fr_FR', 'ltr', 'Chogan — mini-jeux gratuits hors ligne : sudoku, échecs, Hokm',
    'Chogan est une appli gratuite et open source de jeux courts hors ligne : sudoku, échecs, backgammon, Hokm et des dizaines d’autres. Sans pub ni achats.',
    'Chogan, de petits jeux que l’on peut finir'],
  ar: ['ar_SA', 'rtl', 'Chogan — ألعاب صغيرة مجانية بلا إنترنت: سودوكو، شطرنج، حكم',
    'Chogan تطبيق مجاني ومفتوح المصدر لألعاب قصيرة بلا إنترنت: سودوكو وشطرنج وطاولة وحكم وعشرات غيرها. بلا إعلانات ولا مشتريات ولا تتبع.',
    'Chogan، ألعاب صغيرة يمكنك إنهاؤها'],
  hi: ['hi_IN', 'ltr', 'Chogan — मुफ़्त ऑफ़लाइन मिनी गेम: सुडोकू, शतरंज, Hokm',
    'Chogan छोटे ऑफ़लाइन खेलों का मुफ़्त, ओपन-सोर्स ऐप है: सुडोकू, शतरंज, बैकगैमन, Hokm और दर्जनों और। न विज्ञापन, न खरीदारी, न ट्रैकिंग।',
    'Chogan, छोटे खेल जिन्हें आप पूरा कर सकें'],
};

export const pageUrl = (l) => ORIGIN + '/' + l + '/';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// One text of the page in a language: Persian and English come from the HTML, the rest from i18n-data.js.
export function tr(key, l) {
  const d = I18N[l];
  return (d && d[key]) || key;
}
const FA = { 'The Chogan menu': 'منوی چوگان', Screenshots: 'تصاویر برنامه', Language: 'زبان', Dark: 'تاریک', Light: 'روشن' };
const word = (key, l) => (l === 'fa' ? FA[key] : tr(key, l));

// The English spans of index.html are the keys of i18n-data.js; swap them for the language's text.
export function translateBody(html, l) {
  if (l === 'en' || l === 'fa') return html;
  return html.replace(/<(span|p) data-l="en">([^<]*)<\/\1>/g, (all, tag, text) => {
    const lead = text.match(/^\s*/)[0];
    const trail = text.match(/\s*$/)[0];
    return '<' + tag + ' data-l="en">' + lead + esc(tr(unesc(text.trim()), l)) + trail + '</' + tag + '>';
  });
}

export function ldJson(l) {
  const [, , title, desc] = LANGS[l];
  const url = pageUrl(l);
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'SoftwareApplication', '@id': ORIGIN + '/#app', name: 'Chogan', alternateName: 'چوگان', headline: title, description: desc, url, inLanguage: l,
        applicationCategory: 'GameApplication', operatingSystem: 'Android, Web', isAccessibleForFree: true,
        license: 'https://opensource.org/license/mit', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        downloadUrl: 'https://github.com/choganhq/chogan/releases/latest', image: ORIGIN + '/icon.png',
        sameAs: ['https://github.com/choganhq/chogan', 'https://play.google.com/store/apps/details?id=io.github.choganhq.chogan',
          'https://f-droid.org/packages/io.github.choganhq.chogan/', 'https://t.me/chogan_games'] },
      { '@type': 'Organization', '@id': ORIGIN + '/#org', name: 'Chogan', url: ORIGIN + '/', logo: ORIGIN + '/icon.png',
        email: 'choganhq@gmail.com', sameAs: ['https://github.com/choganhq', 'https://t.me/chogan_games'] },
      { '@type': 'WebSite', '@id': ORIGIN + '/#site', name: 'Chogan', url: ORIGIN + '/', inLanguage: CODES },
    ],
  }).replace(/</g, '\\u003c');
}

// "/" is the English page and the x-default; every language, English included, also has /xx/.
export function headBlock(l, root) {
  const [locale, , title, desc, ogAlt] = LANGS[l];
  const own = root ? ORIGIN + '/' : pageUrl(l);
  const card = ORIGIN + '/og/' + (l === 'fa' ? 'fa' : 'en') + '.png';
  const alt = ogAlt;
  const alts = CODES.map((c) => '<link rel="alternate" hreflang="' + c + '" href="' + pageUrl(c) + '">').join('\n') +
    '\n<link rel="alternate" hreflang="x-default" href="' + ORIGIN + '/">';
  return [
    '<title>' + esc(title) + '</title>',
    '<meta name="description" content="' + esc(desc) + '">',
    '<link rel="canonical" href="' + own + '">',
    alts,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Chogan · چوگان">',
    '<meta property="og:locale" content="' + locale + '">',
    ...CODES.filter((c) => c !== l).map((c) => '<meta property="og:locale:alternate" content="' + LANGS[c][0] + '">'),
    '<meta property="og:url" content="' + own + '">',
    '<meta property="og:title" content="' + esc(title) + '">',
    '<meta property="og:description" content="' + esc(desc) + '">',
    '<meta property="og:image" content="' + card + '">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="' + esc(alt) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(title) + '">',
    '<meta name="twitter:description" content="' + esc(desc) + '">',
    '<meta name="twitter:image" content="' + card + '">',
    '<script type="application/ld+json">' + ldJson(l) + '</script>',
    ...(l === 'fa' || l === 'ar' ? ['<link rel="preload" href="/vazirmatn-variable.woff2" as="font" type="font/woff2" crossorigin>'] : []),
  ].join('\n');
}

// Only this language's screenshots: Persian ones for fa, the English ones for everyone else.
export function shotsBlock(l) {
  const set = l === 'fa' ? 'fa' : 'en';
  const alts = [word('The Chogan menu', l), ...['hokm', 'eightball', 'airhockey', 'chess', 'sudoku'].map((id) => GAMES[id][l])];
  return SHOTS[set].map((s, i) => '<img src="' + s[400] + '" srcset="' + s[400] + ' 400w, ' + s[800] + ' 800w" sizes="200px" width="540" height="1080"' +
    (i < 2 ? '' : ' loading="lazy"') + ' decoding="async" alt="' + esc(alts[i]) + '">').join('\n    ');
}

export function gamesBlock(l) {
  return Object.keys(GAMES).map((id) => '<a href="' + APP + '/games/' + id + '/">' + esc(GAMES[id][l]) + '</a>').join('\n    ');
}

export function render(src, l, root) {
  const [, dir] = LANGS[l];
  let h = src
    .replace(/<html [^>]*>/, '<html lang="' + l + '" dir="' + dir + '">')
    .replace('<!--HEAD-->', () => headBlock(l, root))
    .replace('<!--SHOTS-->', () => shotsBlock(l))
    .replace('<!--GAMES-->', () => gamesBlock(l))
    .replace(/%LANGLABEL%/g, esc(word('Language', l)))
    .replace(/%SHOTSLABEL%/g, esc(word('Screenshots', l)))
    .replace(/%DARK%/g, esc(word('Dark', l)))
    .replace(/%LIGHT%/g, esc(word('Light', l)));
  return translateBody(h, l);
}
