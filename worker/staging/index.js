// The staging web app (#762). Production is GitHub Pages and never runs this file.
//
// It serves www/ exactly as Pages does. Workers' default html_handling redirects
// games/<id>/index.html to games/<id>/ with a 307, but the menu links and the
// service worker use the index.html paths: the worker would cache the redirected
// responses, and Chrome refuses a redirected response handed to a navigation, so
// every game would fail to open from the cache. So html_handling is "none" and
// this script maps a trailing slash to index.html, and a folder without one to a
// 301, as Pages does.
//
// Every response says noindex, and robots.txt disallows everything, so a search
// engine never lists staging next to the real app. _headers would not cover the
// responses this script makes, so the header is set here.
const NOINDEX = 'noindex, nofollow';
const ROBOTS = 'User-agent: *\nDisallow: /\n';

function marked(res) {
  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', NOINDEX);
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/robots.txt') {
      return marked(new Response(ROBOTS, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    }
    let res = await env.ASSETS.fetch(request);
    if (res.status === 404 && url.pathname.endsWith('/')) {
      res = await env.ASSETS.fetch(new URL(url.pathname + 'index.html' + url.search, url));
    } else if (res.status === 404 && !/\.[^/]*$/.test(url.pathname)) {
      const index = await env.ASSETS.fetch(new URL(url.pathname + '/index.html', url));
      if (index.status === 200) {
        return marked(new Response(null, { status: 301, headers: { Location: url.pathname + '/' + url.search } }));
      }
    }
    return marked(res);
  },
};
