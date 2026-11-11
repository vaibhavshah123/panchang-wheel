'use strict';
/**
 * Plain Node server. Run with:  npm install && npm start
 * Environment: PORT (default 3000), RATE_LIMIT_PER_MIN (default 60, 0 turns it off),
 * ALLOW_ORIGIN (default *, set it to your website, for example https://example.com).
 */
const http = require('http');
const { handle } = require('./src/api');

const PORT = parseInt(process.env.PORT || '3000', 10);
const LIMIT = parseInt(process.env.RATE_LIMIT_PER_MIN || '60', 10);
const ORIGIN = process.env.ALLOW_ORIGIN || '*';

const hits = new Map();
function limited(ip) {
  if (!LIMIT) return false;
  const now = Date.now(), minute = Math.floor(now / 60000);
  const rec = hits.get(ip);
  if (!rec || rec.minute !== minute) { hits.set(ip, { minute, n: 1 }); return false; }
  rec.n += 1;
  return rec.n > LIMIT;
}
setInterval(() => { const m = Math.floor(Date.now() / 60000); for (const [k, v] of hits) if (v.minute < m) hits.delete(k); }, 60000).unref();

function send(res, status, body) {
  const headers = {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (body === null) { res.writeHead(status, headers); return res.end(); }
  headers['Content-Type'] = 'application/json; charset=utf-8';
  if (status === 200) headers['Cache-Control'] = 'public, max-age=60';
  res.writeHead(status, headers);
  res.end(JSON.stringify(body, null, 2));
}

const server = http.createServer((req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (limited(ip)) return send(res, 429, { error: { code: 'rate_limited', message: 'Too many requests. Try again in a minute.' } });
  const url = new URL(req.url, 'http://localhost');
  const query = Object.fromEntries(url.searchParams.entries());
  const run = (body) => { const r = handle({ method: req.method, path: url.pathname, query, body }); send(res, r.status, r.body); };

  if (req.method !== 'POST') return run(undefined);
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
  req.on('end', () => {
    let body;
    try { body = raw ? JSON.parse(raw) : {}; }
    catch (e) { return send(res, 400, { error: { code: 'invalid_json', message: 'The request body is not valid JSON.' } }); }
    run(body);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Panchang API listening on http://localhost:${PORT}`));
}
module.exports = server;
