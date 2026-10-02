import { createServer as createHttpServer } from 'node:http';

// The server binds loopback only, so the remaining way a hostile page could
// reach it is DNS rebinding: resolving an attacker-controlled hostname to
// 127.0.0.1 and having the browser issue same-origin requests. Pinning the
// Host header to a loopback literal closes that.
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

function hostAllowed(req) {
  const host = (req.headers.host || '').split(':')[0];
  return ALLOWED_HOSTS.has(host);
}

export function createServer({ routes, fallback }) {
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (!hostAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('forbidden');
    }

    try {
      const handler = routes[url.pathname];
      if (handler) return await handler(req, res, url);

      if (url.pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      if (fallback && (await fallback(req, res, url))) return;

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    } catch (err) {
      // A handler may already have started the response; writing a second set
      // of headers would throw again and take the server down with it.
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
    }
  });
}
