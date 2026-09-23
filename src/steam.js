// Steam discovery and Steam Cloud index (remotecache.vdf) handling for Dota 2 (app 570).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');
const { t } = require('./i18n');

const STEAMID64_BASE = 76561197960265728n;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findSteamRoot() {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { encoding: 'utf8', windowsHide: true });
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/);
    if (m && fs.existsSync(m[1].trim())) return path.normalize(m[1].trim());
  } catch {}
  const fallback = 'C:\\Program Files (x86)\\Steam';
  if (fs.existsSync(fallback)) return fallback;
  throw new Error(t('err.noSteam'));
}

// Accounts that have Dota 2 data on this PC, most recently logged in first.
function listAccounts(steamRoot) {
  const vdf = fs.readFileSync(path.join(steamRoot, 'config', 'loginusers.vdf'), 'utf8');
  const users = [];
  for (const m of vdf.matchAll(/"(\d{17})"\s*\{([^}]*)\}/g)) {
    const field = k => (m[2].match(new RegExp(`"${k}"\\s+"([^"]*)"`, 'i')) || [])[1];
    const accountId = Number(BigInt(m[1]) - STEAMID64_BASE);
    const dir = path.join(steamRoot, 'userdata', String(accountId), '570');
    if (!fs.existsSync(dir)) continue;
    users.push({ accountId, name: field('PersonaName'), login: field('AccountName'), mostRecent: field('MostRecent') === '1', timestamp: Number(field('Timestamp') || 0), dir });
  }
  return users.sort((a, b) => b.mostRecent - a.mostRecent || b.timestamp - a.timestamp);
}

function isProcessRunning(image) {
  try {
    const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/NH'], { encoding: 'utf8', windowsHide: true });
    return out.toLowerCase().includes(image.toLowerCase());
  } catch { return false; }
}

async function shutdownSteam(steamRoot, log = () => {}) {
  if (!isProcessRunning('steam.exe')) return;
  log(t('log.closingSteam'));
  execFileSync(path.join(steamRoot, 'steam.exe'), ['-shutdown'], { windowsHide: true });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    if (!isProcessRunning('steam.exe')) return;
  }
  throw new Error(t('err.steamNotClosed'));
}

async function waitForProcess(image, running, timeoutMs = 60000) {
  for (let waited = 0; waited < timeoutMs; waited += 1000) {
    if (isProcessRunning(image) === running) return true;
    await sleep(1000);
  }
  return isProcessRunning(image) === running;
}

// Dota ignores a launch request while it is running, so it has to be closed first.
function closeDota() {
  try { execFileSync('taskkill', ['/IM', 'dota2.exe', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {}
}

function startSteam(steamRoot) {
  spawn(path.join(steamRoot, 'steam.exe'), [], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

// Steam's own way of starting a game; 570 is Dota 2.
function launchDota(steamRoot) {
  spawn(path.join(steamRoot, 'steam.exe'), ['-applaunch', '570'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

const cachePath = accountDir => path.join(accountDir, 'remotecache.vdf');

// Guides we just wrote are marked "pending upload" (syncstate 3) until Steam sends them to the
// cloud. Dota only sees them afterwards, so we wait for that before launching the game.
async function waitCloudSynced(accountDir, relPaths, timeoutMs = 90000) {
  const pending = () => {
    const f = cachePath(accountDir);
    if (!fs.existsSync(f)) return false;
    const text = fs.readFileSync(f, 'utf8');
    return relPaths.some(rel => {
      const m = text.match(new RegExp(`"${rel.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}"\\s*\\{([^}]*)\\}`));
      return m && /"syncstate"\s+"3"/.test(m[1]);
    });
  };
  for (let waited = 0; waited < timeoutMs; waited += 2000) {
    if (!pending()) return true;
    await sleep(2000);
  }
  return !pending();
}

function isRegistered(accountDir, relPath) {
  const f = cachePath(accountDir);
  return fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(`"${relPath}"`);
}

// Adds files as "pending upload" (syncstate 3) so Steam uploads them on next start and
// Dota lists them. Steam must be closed, otherwise it overwrites the index on exit.
function registerFiles(accountDir, relPaths) {
  const f = cachePath(accountDir);
  const text = fs.readFileSync(f, 'utf8');
  const todo = relPaths.filter(p => !text.includes(`"${p}"`));
  if (!todo.length) return [];

  fs.copyFileSync(f, `${f}.bak_d2pt_${Date.now()}`);
  const entries = todo.map(rel => {
    const file = path.join(accountDir, 'remote', rel);
    const data = fs.readFileSync(file);
    const mtime = Math.floor(fs.statSync(file).mtimeMs / 1000);
    const sha = crypto.createHash('sha1').update(data).digest('hex');
    return `\t"${rel}"\n\t{\n` +
      `\t\t"root"\t\t"0"\n\t\t"size"\t\t"${data.length}"\n\t\t"localtime"\t\t"${mtime}"\n\t\t"time"\t\t"${mtime}"\n` +
      `\t\t"remotetime"\t\t"0"\n\t\t"sha"\t\t"${sha}"\n\t\t"syncstate"\t\t"3"\n\t\t"persiststate"\t\t"0"\n` +
      `\t\t"platformstosync2"\t\t"-1"\n\t}\n`;
  }).join('');

  const anchor = text.match(/^\t"OSType"[^\n]*\n/m) || text.match(/^\{\n/m);
  if (!anchor) throw new Error(t('err.badCache'));
  const at = anchor.index + anchor[0].length;
  fs.writeFileSync(f, text.slice(0, at) + entries + text.slice(at));
  return todo;
}

// Removes entries from the index (used when deleting guides). Steam must be closed.
function unregisterFiles(accountDir, relPaths) {
  const f = cachePath(accountDir);
  let text = fs.readFileSync(f, 'utf8');
  const present = relPaths.filter(p => text.includes(`"${p}"`));
  if (!present.length) return [];
  fs.copyFileSync(f, `${f}.bak_d2pt_${Date.now()}`);
  for (const rel of present) {
    const esc = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`^\\t"${esc}"\\n\\t\\{\\n[^}]*\\t\\}\\n`, 'm'), '');
  }
  fs.writeFileSync(f, text);
  return present;
}

module.exports = {
  findSteamRoot, listAccounts, isProcessRunning, waitForProcess, shutdownSteam, startSteam, launchDota, closeDota,
  isRegistered, registerFiles, unregisterFiles, waitCloudSynced,
};
