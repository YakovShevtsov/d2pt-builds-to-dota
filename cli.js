#!/usr/bin/env node
// D2PT → Dota 2 guides (command line; for the page run start.bat / node server.js).
//   node cli.js accounts
//   node cli.js heroes [filter]
//   node cli.js install lion:4,5 "shadow shaman" axe:3 [--account <name>] [--close-steam] [--dry-run] [--fresh] [--fetch auto|curl|browser]
//   node cli.js update [--account ...] [--close-steam]
//   node cli.js remove lion:4 | --all [--account ...] [--close-steam]
const fs = require('fs');
const core = require('./src/core');
const steam = require('./src/steam');

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = {}, positional = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) flags[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--') && ['account', 'fetch', 'steam-root'].includes(k)) flags[k] = argv[++i];
    else flags[k] = true;
  } else positional.push(a);
}
const log = (...a) => console.log(...a);
const steamRoot = () => flags['steam-root'] || steam.findSteamRoot();
const common = () => ({ steamRoot: steamRoot(), account: flags.account, closeSteam: !!flags['close-steam'] });

const commands = {
  async accounts() {
    const root = steamRoot();
    log(`Steam: ${root}`);
    for (const a of core.listAccounts(root)) {
      log(`  ${a.isDefault ? '*' : ' '} ${a.name.padEnd(20)} id ${String(a.accountId).padEnd(11)} D2PT guides: ${Object.keys(a.guides).length}`);
    }
    log('  (* — last login; used by default)');
  },
  async heroes() {
    const heroes = await core.getHeroes({ fresh: flags.fresh, fetchMode: flags.fetch }, log);
    const f = positional[0] ? core.norm(positional[0]) : '';
    for (const h of heroes.filter(h => !f || core.norm(h.name).includes(f) || core.norm(h.npc).includes(f))) {
      const ps = h.positions.map(p => { const m = h.main.includes(p.pos); return `${m ? '[' : ' '}${p.pos}:${String(p.matches).padStart(5)}${m ? ']' : ' '}`; }).join(' ');
      log(`${h.name.padEnd(22)} ${h.npc.padEnd(22)} ${ps}`);
    }
    log('\n[N] — most popular roles (used when no roles are given). Numbers are D2PT matches.');
  },
  async install() {
    if (!positional.length) { log('Name some heroes, e.g.: node cli.js install lion:4,5'); return; }
    const heroes = await core.getHeroes({ fetchMode: flags.fetch }, log);
    const targets = core.resolveSpecs(positional, heroes.map(h => ({ npc: h.npc, displayName: h.name, ...Object.fromEntries(h.positions.map(p => [`pos ${p.pos} matches`, p.matches])) })));
    await core.install({ ...common(), targets, dryRun: !!flags['dry-run'], fresh: !!flags.fresh, fetchMode: flags.fetch }, log);
  },
  async update() {
    await core.install({ ...common(), targets: 'installed', dryRun: !!flags['dry-run'], fresh: !!flags.fresh, fetchMode: flags.fetch }, log);
  },
  async remove() {
    const acc = core.findAccount(steamRoot(), flags.account);
    const mine = core.listAccounts(steamRoot()).find(a => a.accountId === acc.accountId).guides;
    const keys = flags.all ? 'all' : positional.flatMap(s => {
      const [name, pos] = s.split(':');
      return Object.keys(mine).filter(k => core.norm(k.split(':')[0]) === core.norm(name) && (!pos || pos.split(',').includes(k.split(':')[1])));
    });
    await core.remove({ ...common(), keys }, log);
  },
};

if (!commands[cmd]) {
  log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 8).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(cmd ? 1 : 0);
}
commands[cmd]().catch(e => { console.error('Error: ' + e.message); process.exit(1); });
