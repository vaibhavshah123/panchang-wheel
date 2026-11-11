'use strict';
// Vercel serverless function: /api/transits
const { handle } = require('../src/api');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOW_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  const r = handle({ method: req.method, path: '/api/transits', query: req.query, body: req.body });
  if (r.body === null) return res.status(r.status).end();
  if (r.status === 200) res.setHeader('Cache-Control', 'public, s-maxage=60');
  return res.status(r.status).json(r.body);
};
