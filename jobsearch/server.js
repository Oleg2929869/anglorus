'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { search, listSources } = require('./lib/search');

// Минимальный разбор .env (без зависимостей): KEY=VALUE построчно.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* .env необязателен */
}

const PORT = process.env.PORT || 3100;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/sources') return sendJson(res, 200, listSources(process.env));

  if (url.pathname === '/api/search') {
    const days = Number(url.searchParams.get('days')) || null;
    try {
      const result = await search({
        q: url.searchParams.get('q'),
        sourceIds: (url.searchParams.get('sources') || '').split(',').filter(Boolean),
        remote: url.searchParams.get('remote') === '1',
        days: [7, 30].includes(days) ? days : null,
      });
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, err.status || 500, { error: err.message });
    }
  }

  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!file.startsWith(PUBLIC)) return sendJson(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'not_found' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Поиск вакансий: http://localhost:${PORT}`));
}

module.exports = server;
