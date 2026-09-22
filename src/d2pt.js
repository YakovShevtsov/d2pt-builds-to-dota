// D2PT data access. Primary transport: Windows' built-in curl.exe (passes Cloudflare where Node's
// own TLS stack is blocked). Fallback: an installed Chromium browser (see browser.js).
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { openBrowserSession } = require('./browser');
const { t, STRINGS } = require('./i18n');

const ORIGIN = 'https://dota2protracker.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const CURL = process.env.D2PT_CURL || (process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'curl.exe') : 'curl');
const REQUEST_DELAY_MS = 1000;
const CACHE_TTL_MS = 6 * 3600e3; // D2PT stats refresh slowly; avoid re-requesting the same pages

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Cloudflare's JS challenge page (HTML). A browser can get past it; curl can't.
const isChallenge = ({ status, body }) => (status === 403 || status === 503) && /<!DOCTYPE|Just a moment/i.test(body.slice(0, 2000));
// D2PT's own refusal (JSON {"message":"Forbidden"}), seen after repeated requests for the same hero.
// Tied to the IP, so switching to a browser doesn't help.
const isLimited = ({ status, body }) => (status === 403 || status === 429) && !isChallenge({ status, body });

class LimitedError extends Error {}

class TransportError extends Error {}

function curlGet(url) {
  return new Promise((resolve, reject) => {
    execFile(CURL, ['-sS', '--max-time', '30', '-A', UA, '-H', 'Accept: application/json, text/plain, */*', '-w', '\n%{http_code}', url],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          const code = typeof err.code === 'number' ? err.code : null;
          const why = (code && STRINGS.curl[code]) || (stderr || '').trim().split('\n').pop() || err.message;
          return reject(new TransportError(t('err.curlRequest', { why }) + (code ? ` (curl ${code})` : '')));
        }
        const i = stdout.lastIndexOf('\n');
        resolve({ status: Number(stdout.slice(i + 1)), body: stdout.slice(0, i) });
      });
  });
}

async function createClient({ mode = 'auto', log = () => {}, cacheDir = null, fresh = false } = {}) {
  let browser = null;
  let transport = mode === 'browser' ? 'browser' : 'curl';

  async function raw(url) {
    if (transport === 'curl') {
      let r;
      try {
        r = await curlGet(url);
      } catch (e) {
        if (!(e instanceof TransportError)) throw e;
        if (mode === 'curl') throw new Error(`curl ${e.message}`);
        log(t('log.curlFailed', { reason: e.message }));
        transport = 'browser';
      }
      if (r) {
        if (!isChallenge(r)) return r;
        if (mode === 'curl') throw new Error(t('err.curlOnly'));
        log(t('log.curlChallenged'));
        transport = 'browser';
      }
    }
    browser ??= await openBrowserSession(ORIGIN, { log });
    const r = await browser.getText(url);
    if (isChallenge(r)) throw new Error(t('err.browserChallenged'));
    return r;
  }

  let last = 0;
  async function fetchJson(apiPath) {
    const wait = last + REQUEST_DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const r = await raw(ORIGIN + apiPath);
    if (isLimited(r)) throw new LimitedError(t('err.limited'));
    if (r.status !== 200) throw new Error(t('err.http', { path: apiPath, status: r.status }));
    return JSON.parse(r.body);
  }

  // Responses are cached on disk so repeated runs don't hit D2PT again.
  async function get(apiPath) {
    const file = cacheDir && path.join(cacheDir, apiPath.replace(/[^a-z0-9]+/gi, '_') + '.json');
    if (file && !fresh && fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < CACHE_TTL_MS) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    const data = await fetchJson(apiPath);
    if (file) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); }
    return data;
  }

  return {
    get transport() { return browser ? `browser (${browser.name})` : 'curl'; },
    heroes: () => get('/api/heroes/list'),
    builds: (heroId, pos) => get(`/api/hero/${heroId}/builds?position=pos%20${pos}`),
    close: async () => { if (browser) await browser.close(); },
  };
}

// OpenDota item id -> internal name map, cached on disk.
async function loadItemNames(cacheFile) {
  const fresh = fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < 24 * 3600e3;
  if (!fresh) {
    try {
      const ids = await fetch('https://api.opendota.com/api/constants/item_ids').then(r => r.json());
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(ids));
    } catch (e) {
      if (!fs.existsSync(cacheFile)) throw new Error(t('err.itemsFailed', { why: e.message }));
    }
  }
  const ids = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  return id => (ids[id] ? 'item_' + ids[id] : null);
}

// Reduce D2PT's raw /builds payload to what the guide generator needs.
function extractBuild(raw, hero, pos, itemName) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const B = [...raw].sort((a, c) => c.num_matches - a.num_matches)[0];
  const d = B.build_data;
  const nm = itemName;

  const items = {};
  const put = (id, min, pr, wr) => {
    const k = nm(id);
    if (k && !items[k]) items[k] = { min: min != null ? +min.toFixed(1) : null, pr: pr != null ? +pr.toFixed(3) : null, wr: wr != null ? +wr.toFixed(3) : null };
  };
  for (const t of [...(d.items_mid_late || []), ...(d.anchor_items || [])]) put(t.raw_item_id, t.avg_minute, t.rel_pr ?? t.pr, t.win_rate);
  for (const [id, s] of Object.entries(d.anchor_item_stats || {})) put(+id, s.avg_minute, s.pr / 100, s.win_rate);

  const anchor = d.anchor_build?.[0] || [];
  const situational = (d.items_mid_late || [])
    .filter(t => !anchor.includes(t.raw_item_id) && (t.rel_pr ?? t.pr) >= 0.05 && t.count >= 20)
    .map(t => nm(t.raw_item_id));

  const build = [...new Set(anchor.map(nm))].filter(Boolean);
  const situ = [...new Set(situational)].filter(Boolean);
  const used = new Set([...build, ...situ]);

  return {
    heroId: B.hero_id, hero: hero.npc, heroName: hero.displayName, pos,
    patch: (d.data_scope?.patch_versions || []).join(','),
    matches: B.num_matches, wr: +d.win_rate.toFixed(3),
    start: (d.starting_items_new?.[0]?.[0] || []).map(nm).filter(Boolean),
    build, situational: situ,
    abilities: (d.abilities || []).map(a => a.name),
    talents: (d.talents || []).map(t => ({
      lvl: t.lvl,
      options: [t.left, t.right].map(o => ({ name: o.name, label: o.displayName, pr: +o.pick_rate.toFixed(3), wr: o.win_rate, n: o.count })),
    })),
    items: Object.fromEntries(Object.entries(items).filter(([k]) => used.has(k))),
  };
}

module.exports = { createClient, loadItemNames, extractBuild, LimitedError };
