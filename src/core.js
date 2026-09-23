// Shared logic for the CLI and the web UI: accounts, hero list, install/update/remove of D2PT guides.
const fs = require('fs');
const path = require('path');
const { createClient, loadItemNames, extractBuild, LimitedError } = require('./d2pt');
const { renderGuide } = require('./generate');
const steam = require('./steam');
const { DATA, OUT, ensureData } = require('./runtime');
const { t } = require('./i18n');

const MANIFEST = path.join(DATA, 'manifest.json');
const MAIN_POS_SHARE = 0.15, MAIN_POS_MIN_MATCHES = 200;

// ---------- manifest ----------
function loadManifest() {
  if (!fs.existsSync(MANIFEST)) return { accounts: {} };
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return m.accounts ? m : { accounts: {} };
}
function saveManifest(m) {
  ensureData();
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

// ---------- helpers ----------
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function listAccounts(steamRoot) {
  const m = loadManifest();
  return steam.listAccounts(steamRoot).map((a, i) => ({ ...a, isDefault: i === 0, guides: m.accounts[a.accountId] || {} }));
}

function findAccount(steamRoot, query) {
  const accounts = steam.listAccounts(steamRoot);
  if (!accounts.length) throw new Error(t('err.noAccounts'));
  if (query == null || query === '') return accounts[0];
  const want = norm(query);
  const acc = accounts.find(a => String(a.accountId) === String(query) || norm(a.name) === want || norm(a.login) === want);
  if (!acc) throw new Error(t('err.accountNotFound', { q: query, list: accounts.map(a => a.name).join(', ') }));
  return acc;
}

function posMatches(h) {
  return [1, 2, 3, 4, 5].map(p => ({ pos: p, matches: h[`pos ${p} matches`] || 0, wr: h[`pos ${p} winrate`] ?? null }));
}
function mainPositions(h) {
  const ps = posMatches(h), total = ps.reduce((s, p) => s + p.matches, 0);
  return ps.filter(p => p.matches >= MAIN_POS_MIN_MATCHES && p.matches >= total * MAIN_POS_SHARE).map(p => p.pos);
}

// Parses CLI specs like "lion:4,5", "shadow shaman", "axe:3" into { npc, pos } targets.
function resolveSpecs(specs, heroes) {
  const out = [];
  for (const spec of specs) {
    const [name, posPart] = spec.split(':');
    const h = heroes.find(x => norm(x.npc) === norm(name) || norm(x.displayName) === norm(name));
    if (!h) throw new Error(t('err.heroNotFound', { name }));
    const positions = posPart ? posPart.split(',').map(Number) : mainPositions(h);
    if (!positions.length || positions.some(p => !(p >= 1 && p <= 5))) throw new Error(t('err.badPositions', { hero: h.displayName, positions: posPart }));
    for (const pos of positions) out.push({ npc: h.npc, pos });
  }
  return out;
}

const makeClient = (opts, log) =>
  createClient({ mode: opts.fetchMode || 'auto', log, cacheDir: path.join(DATA, 'cache'), fresh: !!opts.fresh });

async function getHeroes(opts = {}, log = () => {}) {
  const client = await makeClient(opts, log);
  try {
    const heroes = await client.heroes();
    return heroes.map(h => ({
      npc: h.npc, name: h.displayName, id: h.hero_id, attr: h.primary_attribute,
      positions: posMatches(h), main: mainPositions(h),
    })).sort((a, b) => a.name.localeCompare(b.name));
  } finally { await client.close(); }
}

// Installs/updates guides. targets: [{ npc, pos }] or 'installed' (= update everything we manage).
// Returns a summary; never throws for a single hero failing.
async function install({ steamRoot, account, targets, closeSteam = false, dryRun = false, fresh = false, fetchMode }, log = () => {}) {
  const L = t;
  const root = steamRoot || steam.findSteamRoot();
  const acc = findAccount(root, account);
  const manifest = loadManifest();
  const mine = (manifest.accounts[acc.accountId] ??= {});
  const summary = { account: acc.name, written: [], failed: [], skippedNeedSteamClose: [], registered: 0 };
  log(L('log.account', { name: acc.name }) + (dryRun ? L('log.dryRun') : ''));

  const client = await makeClient({ fresh, fetchMode }, log);
  const results = [];
  try {
    const heroes = await client.heroes();
    const list = targets === 'installed' ? Object.keys(mine).map(k => ({ npc: k.split(':')[0], pos: Number(k.split(':')[1]) })) : targets;
    if (!list.length) { log(L('log.nothingToInstall')); return summary; }

    const itemName = await loadItemNames(path.join(DATA, 'item_ids.json'));
    log(L('log.loading', { n: list.length }));
    for (const target of list) {
      const hero = heroes.find(h => h.npc === target.npc);
      const label = `${hero?.displayName || target.npc} pos ${target.pos}`;
      if (!hero) { summary.failed.push({ ...target, reason: 'hero not found' }); log(L('log.heroNotFound', { label })); continue; }
      try {
        const b = extractBuild(await client.builds(hero.hero_id, target.pos), hero, target.pos, itemName);
        if (b) results.push(b);
        else { summary.failed.push({ ...target, reason: 'no build for this role' }); log(L('log.noBuild', { label })); }
      } catch (e) {
        if (!(e instanceof LimitedError)) throw e;
        summary.failed.push({ ...target, reason: e.message });
        log(L('log.failed', { label, reason: e.message }));
      }
    }
    log(L('log.source', { transport: client.transport }));
  } finally { await client.close(); }
  if (!results.length) return summary;

  const guidesDir = dryRun ? OUT : path.join(acc.dir, 'remote', 'guides');
  fs.mkdirSync(guidesDir, { recursive: true });

  let ts = Math.floor(Date.now() / 1000);
  const plan = results.map(b => {
    const key = `${b.hero}:${b.pos}`;
    const entry = mine[key];
    const known = entry && fs.existsSync(path.join(acc.dir, 'remote', 'guides', entry.file)) && steam.isRegistered(acc.dir, `guides/${entry.file}`);
    return { b, key, isNew: !known, file: known ? entry.file : `${b.hero}_${ts++}.build`, revision: (known ? entry.revision : 0) + 1 };
  });

  let canRegister = true;
  const newOnes = plan.filter(p => p.isNew);
  if (!dryRun && newOnes.length && steam.isProcessRunning('steam.exe')) {
    if (closeSteam) await steam.shutdownSteam(root, log);
    else {
      canRegister = false;
      summary.skippedNeedSteamClose = newOnes.map(p => ({ npc: p.b.hero, pos: p.b.pos }));
      log(L('log.needSteamClosed', { list: newOnes.map(p => `${p.b.heroName} pos ${p.b.pos}`).join(', ') }));
    }
  }

  const written = [];
  for (const p of plan) {
    if (p.isNew && !canRegister) continue;
    const { text, talents } = renderGuide(p.b, { ts: ts++, revision: p.revision, accountId: acc.accountId });
    fs.writeFileSync(path.join(guidesDir, p.file), text, 'utf8');
    written.push(p);
    const tal = talents.map(t => `${t.lvl}${t.byWinrate ? '*' : ''}`).join(' ');
    log(L('log.guideLine', { mark: L(p.isNew ? 'log.newGuide' : 'log.updatedGuide'), hero: p.b.heroName, pos: p.b.pos, patch: p.b.patch, matches: p.b.matches, wr: Math.round(p.b.wr * 100) + '%', talents: tal }));
    summary.written.push({ npc: p.b.hero, pos: p.b.pos, isNew: p.isNew, file: p.file });
  }

  if (dryRun) { log(L('log.dryRunPath', { dir: guidesDir })); return summary; }

  const reg = steam.registerFiles(acc.dir, written.filter(p => p.isNew).map(p => `guides/${p.file}`));
  summary.registered = reg.length;
  for (const p of written) mine[p.key] = { file: p.file, revision: p.revision, patch: p.b.patch, updated: new Date().toISOString() };
  saveManifest(manifest);

  log(L('log.done', { n: written.length, registered: reg.length ? L('log.registered', { n: reg.length }) : '' }));
  if (reg.length) log(L('log.startSteam'));
  else if (steam.isProcessRunning('dota2.exe')) log(L('log.restartDota'));
  return summary;
}

// Removes guides we manage. keys: ['lion:4', ...] or 'all'.
async function remove({ steamRoot, account, keys, closeSteam = false }, log = () => {}) {
  const L = t;
  const root = steamRoot || steam.findSteamRoot();
  const acc = findAccount(root, account);
  const manifest = loadManifest();
  const mine = manifest.accounts[acc.accountId] || {};
  const list = (keys === 'all' ? Object.keys(mine) : keys).filter(k => mine[k]);
  if (!list.length) { log(L('log.nothingToRemove')); return { removed: [] }; }
  if (steam.isProcessRunning('steam.exe')) {
    if (closeSteam) await steam.shutdownSteam(root, log);
    else { log(L('log.removeNeedsSteamClosed')); return { removed: [], needSteamClose: true }; }
  }
  steam.unregisterFiles(acc.dir, list.map(k => `guides/${mine[k].file}`));
  for (const k of list) {
    fs.rmSync(path.join(acc.dir, 'remote', 'guides', mine[k].file), { force: true });
    log(L('log.removed', { key: k }));
    delete mine[k];
  }
  saveManifest(manifest);
  log(L('log.removedTotal', { n: list.length }));
  return { removed: list };
}

// One button's worth of work: close Dota, restart Steam so it picks up the guide list,
// wait until the guides are in the cloud, then start the game again.
async function restart({ steamRoot, account, startDota = true }, log = () => {}) {
  const root = steamRoot || steam.findSteamRoot();
  const acc = findAccount(root, account);
  if (steam.isProcessRunning('dota2.exe')) {
    log(t('log.closingDota'));
    steam.closeDota();
    await steam.waitForProcess('dota2.exe', false, 20000);
  }
  // The cloud index is only ever edited while Steam is closed, so a running Steam means
  // nothing was registered this time and it can keep running.
  if (steam.isProcessRunning('steam.exe')) {
    log(t('log.steamKeepsRunning'));
  } else {
    log(t('log.startingSteam'));
    steam.startSteam(root);
    if (!await steam.waitForProcess('steam.exe', true)) throw new Error(t('err.steamNotStarted'));
    log(t('log.steamReady'));
  }
  const mine = loadManifest().accounts[acc.accountId] || {};
  const rels = Object.values(mine).map(e => 'guides/' + e.file);
  if (rels.length) {
    log(t('log.waitingSync'));
    log(await steam.waitCloudSynced(acc.dir, rels) ? t('log.syncDone') : t('log.syncSlow'));
  }
  if (!startDota) return { steamStarted: true };
  log(t('log.launchingDota'));
  steam.launchDota(root);
  return { launched: true };
}

function status() {
  return { steamRunning: steam.isProcessRunning('steam.exe'), dotaRunning: steam.isProcessRunning('dota2.exe') };
}

module.exports = { listAccounts, findAccount, getHeroes, resolveSpecs, install, remove, restart, status, mainPositions, posMatches, norm, DATA };
