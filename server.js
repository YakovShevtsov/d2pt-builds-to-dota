#!/usr/bin/env node
// Local web UI for D2PT → Dota 2 guides. Listens on 127.0.0.1 only.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const core = require('./src/core');
const steam = require('./src/steam');

const PORT = Number(process.env.PORT) || 7353;
const RUN_ID = Date.now().toString(36); // changes on every start.bat launch -> welcome screen shows once per run
const UI = path.join(__dirname, 'ui', 'index.html');
let busy = false;

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Runs a long job and streams its log to the page as NDJSON lines.
async function stream(res, job) {
  if (busy) return json(res, 409, { error: 'Уже выполняется другая операция' });
  busy = true;
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
  const send = obj => res.write(JSON.stringify(obj) + '\n');
  const log = (...a) => { const text = a.join(' '); console.log(text); send({ type: 'log', text }); };
  try {
    send({ type: 'done', result: await job(log) });
  } catch (e) {
    console.error(e);
    send({ type: 'error', message: e.message });
  } finally {
    busy = false;
    res.end();
  }
}

const routes = {
  'GET /': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(UI).pipe(res);
  },

  'GET /api/state': (req, res) => {
    const root = steam.findSteamRoot();
    const accounts = core.listAccounts(root).map(a => ({ accountId: a.accountId, name: a.name, isDefault: a.isDefault, guides: a.guides }));
    json(res, 200, { accounts, ...core.status(), busy, runId: RUN_ID });
  },

  'GET /api/heroes': async (req, res, url) => {
    try { json(res, 200, await core.getHeroes({ fresh: url.searchParams.get('fresh') === '1' })); }
    catch (e) { json(res, 502, { error: e.message }); }
  },

  // body: { account, install: [{npc,pos}], remove: ['npc:pos'], closeSteam }
  'POST /api/apply': async (req, res) => {
    const body = await readBody(req);
    await stream(res, async log => {
      const out = {};
      if (body.remove?.length) out.remove = await core.remove({ account: body.account, keys: body.remove, closeSteam: !!body.closeSteam }, log);
      if (body.install?.length) out.install = await core.install({ account: body.account, targets: body.install, closeSteam: !!body.closeSteam }, log);
      return out;
    });
  },

  // body: { account, fresh }
  'POST /api/update': async (req, res) => {
    const body = await readBody(req);
    await stream(res, log => core.install({ account: body.account, targets: 'installed', fresh: !!body.fresh }, log));
  },
};

const ASSETS = path.join(__dirname, 'ui', 'assets');
const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveAsset(res, name) {
  const type = MIME[path.extname(name).toLowerCase()];
  const file = path.join(ASSETS, path.basename(name)); // basename: no path traversal
  if (!type || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=86400' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // Only accept requests addressed to this machine (blocks DNS-rebinding from other sites).
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end(); }
  if (req.method === 'GET' && url.pathname.startsWith('/assets/')) return serveAsset(res, url.pathname.slice('/assets/'.length));
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) { res.writeHead(404); return res.end('Not found'); }
  try { await handler(req, res, url); }
  catch (e) { console.error(e); if (!res.headersSent) json(res, 500, { error: e.message }); else res.end(); }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Порт ${PORT} занят — похоже, тулза уже запущена. Открываю страницу.`);
    openBrowser();
    setTimeout(() => process.exit(0), 500);
  } else throw e;
});

function openBrowser() {
  const url = `http://127.0.0.1:${PORT}/`;
  if (process.env.NO_OPEN) return;
  execFile('cmd', ['/c', 'start', '', url], { windowsHide: true });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`D2PT → Dota 2: http://127.0.0.1:${PORT}/`);
  console.log('Закрой это окно, чтобы выйти.');
  openBrowser();
});
