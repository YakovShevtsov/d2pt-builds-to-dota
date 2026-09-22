#!/usr/bin/env node
// Builds d2pt-guides.zip for sharing: only the files needed to run, without personal data
// (data/manifest.json, data/cache, out/). Uses Windows' built-in tar.exe to create the zip.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const INCLUDE = ['start.bat', 'server.js', 'cli.js', 'README.md', 'src', 'ui', 'data/item_ids.json'];
const OUT = path.join(ROOT, 'd2pt-guides.zip');

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'd2pt-pack-'));
const dest = path.join(stage, 'd2pt-guides');
try {
  for (const rel of INCLUDE) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(dest, rel), { recursive: true });
  }
  fs.rmSync(OUT, { force: true });
  const tar = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
  execFileSync(tar, ['-a', '-c', '-f', OUT, 'd2pt-guides'], { cwd: stage, stdio: 'inherit' });

  const files = execFileSync(tar, ['-t', '-f', OUT], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(f => !f.endsWith('/'));
  console.log(`Done: ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${files.length} files)`);
  for (const f of files) console.log('  ' + f);
  console.log('\nSend the archive to a friend: unpack it and run start.bat (needs Node.js 22+).');
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
