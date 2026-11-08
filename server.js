// QueryTrends X-Ray — local web app.
// Start it with:  node server.js   then open http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('./lib/env');
const log = require('./lib/log');
const { scan } = require('./lib/scanner');
const { generatePosts } = require('./lib/posts');
const blotato = require('./lib/blotato');

const PUBLIC_DIR = path.join(__dirname, 'public');
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 1024 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Request too large.'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('Request body is not valid JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// One-call endpoint for n8n: scan -> write posts -> schedule them, spaced out.
async function runAutopilot(body) {
  const { url, langs = ['en'], accountId, platform, pageId, max = 3, spacingHours = 24, startTime, polish = false, link, combine = false } = body;
  const result = await scan(url);
  const posts = await generatePosts(result, { langs, max, polish, link, combine });
  const start = startTime ? new Date(startTime) : new Date(Date.now() + 60 * 60 * 1000);
  if (Number.isNaN(start.getTime())) throw new Error('startTime is not a valid date.');
  const scheduled = [];
  for (let i = 0; i < posts.length; i++) {
    const when = new Date(start.getTime() + i * spacingHours * 3600 * 1000).toISOString();
    try {
      const r = await blotato.schedulePost({ accountId, platform, pageId, post: posts[i], scheduledTime: when });
      scheduled.push({ kind: posts[i].kind, lang: posts[i].lang, when, ok: true, id: r.postSubmissionId, dryRun: r.dryRun });
    } catch (err) {
      log.error('run.schedule_failed', { kind: posts[i].kind, error: err.message });
      scheduled.push({ kind: posts[i].kind, lang: posts[i].lang, when, ok: false, error: err.message });
    }
  }
  return { url: result.url, score: result.score, findings: result.findings.length, scheduled };
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (!pathname.startsWith('/api/')) return serveStatic(req, res);

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return send(res, 200, { ok: true, dryRun: blotato.isDryRun(), polishAvailable: Boolean(env.ANTHROPIC_API_KEY), platforms: blotato.SUPPORTED });
    }
    if (req.method === 'POST' && pathname === '/api/scan') {
      const { url } = await readBody(req);
      return send(res, 200, await scan(url));
    }
    if (req.method === 'POST' && pathname === '/api/posts') {
      const { result, langs, max, polish, link, combine } = await readBody(req);
      if (!result || !Array.isArray(result.findings)) throw Object.assign(new Error('Run a scan first.'), { status: 400 });
      return send(res, 200, { posts: await generatePosts(result, { langs, max, polish, link, combine }) });
    }
    if (req.method === 'GET' && pathname === '/api/accounts') {
      return send(res, 200, { dryRun: blotato.isDryRun(), accounts: await blotato.listAccounts() });
    }
    const pagesMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/pages$/);
    if (req.method === 'GET' && pagesMatch) {
      return send(res, 200, { pages: await blotato.listPages(decodeURIComponent(pagesMatch[1])) });
    }
    if (req.method === 'POST' && pathname === '/api/schedule') {
      const body = await readBody(req);
      return send(res, 200, await blotato.schedulePost(body));
    }
    const statusMatch = pathname.match(/^\/api\/status\/([^/]+)$/);
    if (req.method === 'GET' && statusMatch) {
      return send(res, 200, await blotato.postStatus(decodeURIComponent(statusMatch[1])));
    }
    if (req.method === 'POST' && pathname === '/api/run') {
      if (!env.RUN_TOKEN) throw Object.assign(new Error('Set RUN_TOKEN in .env to use /api/run.'), { status: 403 });
      if (!safeEqual(req.headers['x-run-token'] || '', env.RUN_TOKEN)) throw Object.assign(new Error('Wrong run token.'), { status: 401 });
      return send(res, 200, await runAutopilot(await readBody(req)));
    }
    send(res, 404, { error: 'Unknown endpoint.' });
  } catch (err) {
    const status = err.status || 400;
    log.error('api.error', { method: req.method, path: pathname, status, error: err.message });
    send(res, status, { error: err.message });
  }
});

if (require.main === module) {
  server.listen(env.PORT, HOST, () => {
    log.info('server.start', { url: `http://localhost:${env.PORT}`, dryRun: blotato.isDryRun() });
    console.log(`\n  QueryTrends X-Ray is running → http://localhost:${env.PORT}`);
    if (blotato.isDryRun()) console.log('  DRY RUN: no BLOTATO_API_KEY in .env, so nothing will actually post.\n');
  });
}

module.exports = { server, runAutopilot };
