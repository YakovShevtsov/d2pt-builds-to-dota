// Fallback transport: drives any installed Chromium-based browser over the DevTools protocol
// (no npm dependencies; Node 22 has a global WebSocket).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { t } = require('./i18n');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function findBrowsers() {
  const L = process.env.LOCALAPPDATA || '', P = process.env.ProgramFiles || '', X = process.env['ProgramFiles(x86)'] || '';
  const candidates = [
    ['Google Chrome', [P, X, L].map(d => path.join(d, 'Google/Chrome/Application/chrome.exe'))],
    ['Microsoft Edge', [X, P].map(d => path.join(d, 'Microsoft/Edge/Application/msedge.exe'))],
    ['Yandex Browser', [path.join(L, 'Yandex/YandexBrowser/Application/browser.exe')]],
    ['Brave', [P, X, L].map(d => path.join(d, 'BraveSoftware/Brave-Browser/Application/brave.exe'))],
    ['Vivaldi', [L, P].map(d => path.join(d, 'Vivaldi/Application/vivaldi.exe'))],
    ['Opera', [path.join(L, 'Programs/Opera/opera.exe')]],
    ['Opera GX', [path.join(L, 'Programs/Opera GX/opera.exe')]],
    ['Chromium', [path.join(L, 'Chromium/Application/chrome.exe')]],
  ];
  const found = [];
  for (const [name, paths] of candidates) {
    const exe = paths.find(p => fs.existsSync(p));
    if (exe) found.push({ name, exe });
  }
  return found;
}

class Cdp {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  on(method, cb) { this.listeners.set(method, cb); }
  open() {
    return new Promise((res, rej) => {
      this.ws.onopen = res; this.ws.onerror = () => rej(new Error('CDP connection failed'));
      this.ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (!m.id) return this.listeners.get(m.method)?.(m.params);
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function openBrowserSession(origin, { log = () => {} } = {}) {
  const browsers = findBrowsers();
  if (!browsers.length) throw new Error(t('err.noBrowser'));
  const { name, exe } = browsers[0];
  log(t('log.usingBrowser', { name }));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'd2pt-browser-'));
  const proc = spawn(exe, [
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--window-position=-2400,-2400', '--window-size=800,600', origin,
  ], { stdio: 'ignore', detached: false });

  const portFile = path.join(profile, 'DevToolsActivePort');
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(200);
    if (fs.existsSync(portFile)) port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  }
  if (!port) { proc.kill(); throw new Error(t('err.noDebugPort', { name })); }

  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  const page = targets.find(t => t.type === 'page' && t.url.startsWith(origin)) || targets.find(t => t.type === 'page');
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  if (!page.url.startsWith(origin)) await cdp.send('Page.navigate', { url: origin + '/' });

  // Wait until the tab is on D2PT and Cloudflare's "Just a moment..." interstitial is gone.
  const probe = `location.origin + "|" + document.readyState + "|" + document.title`;
  for (let i = 0; ; i++) {
    const [o, state, title = ''] = String(await cdp.eval(probe).catch(() => '')).split('|');
    if (o === origin && state === 'complete' && !/just a moment|momento|момент/i.test(title)) break;
    if (i === 10) log(t('log.waitingCloudflare'));
    if (i > 120) { cdp.close(); proc.kill(); throw new Error(t('err.challengeTimeout')); }
    await sleep(500);
  }

  const isChallengePage = body => /<!DOCTYPE|Just a moment/i.test(body.slice(0, 2000));

  // Cloudflare answers background requests with its challenge page, which a fetch() can't solve.
  // Opening the URL as a normal page lets the browser pass the check and show the JSON.
  let lastStatus = null;
  cdp.on('Network.responseReceived', p => { if (p.type === 'Document') lastStatus = p.response.status; });
  await cdp.send('Network.enable');

  async function navigateGet(url) {
    lastStatus = null;
    await cdp.send('Page.navigate', { url });
    for (let i = 0; ; i++) {
      const [state, title = ''] = String(await cdp.eval('document.readyState + "|" + document.title').catch(() => '')).split('|');
      if (state === 'complete' && !/just a moment|momento|момент/i.test(title)) break;
      if (i > 120) throw new Error(t('err.challengeTimeout'));
      await sleep(500);
    }
    const body = await cdp.eval('document.body.innerText');
    return { status: lastStatus ?? 200, body };
  }

  return {
    name,
    async getText(url) {
      const r = await cdp.eval(`fetch(${JSON.stringify(url)}).then(async r => ({ status: r.status, body: await r.text() }))`);
      return isChallengePage(r.body) ? navigateGet(url) : r;
    },
    async close() {
      try { await cdp.send('Browser.close'); } catch {}
      cdp.close();
      await sleep(500);
      try { proc.kill(); } catch {}
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    },
  };
}

module.exports = { findBrowsers, openBrowserSession };
