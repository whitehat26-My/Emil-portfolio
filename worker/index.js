// Cloudflare Worker for emiltech.it.com.
// Static files are served straight from the repo (see wrangler.jsonc). Requests that
// don't match a file land here: "/" gets the home page, everything else gets a 404.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }
    return new Response('Page not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },
};
