#!/usr/bin/env node
// Release the web app to PRODUCTION (sate-hardware.vercel.app) — the only way it should be done.
//
//   cd react_app_sate-ui_update
//   npm version patch --no-git-tag-version   # fixes   (1.6.0 → 1.6.1)
//   npm version minor --no-git-tag-version   # features (1.6.1 → 1.7.0)
//   # add a "## 1.6.1 — <date>" entry at the top of CHANGELOG.md (what changed, for users first)
//   git commit -am "web 1.6.1: …"            # the bump + changelog are committed with the release
//   npm run release:prod
//
// It refuses to ship unless:
//   - package.json "version" is NEWER than what production reports at /version.json,
//   - nothing in react_app_sate-ui_update/ is uncommitted (the subtree push ships COMMITS, not the working tree),
//   - CHANGELOG.md has a non-empty "## <version>" entry,
//   - the tag web-<version> does not exist yet,
//   - `npm run build` passes (tsc -b + vite build, noUnusedLocals — what Vercel runs).
// Then: git subtree push → webapp main, tag web-<version> (pushed to origin), and wait until production
// reports the new version. Get the owner's OK before running it: this IS a production deploy.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD = 'https://sate-hardware.vercel.app';
const LEGACY = '1.5.9'; // what production showed before /version.json existed
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..');
const repo = path.resolve(app, '..');
const sh = (cmd, cwd = repo) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const run = (cmd, cwd = repo) => execSync(cmd, { cwd, stdio: 'inherit' });
const die = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

const cmp = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
const liveVersion = async () => {
  try {
    const r = await fetch(`${PROD}/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.version === 'string' ? j : null;
  } catch { return null; }
};

const version = JSON.parse(readFileSync(path.join(app, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) die(`package.json version "${version}" is not x.y.z`);

const live = await liveVersion();
const liveV = live?.version ?? LEGACY;
console.log(`production runs ${liveV}${live ? ` (${live.commit || 'no commit'}, built ${live.built})` : ' (no /version.json yet)'}; releasing ${version}`);
if (cmp(version, liveV) <= 0) {
  die(`version ${version} is not newer than production's ${liveV}.\n  Bump it first:  npm version patch --no-git-tag-version   (or minor for features)\n  then commit the bump and run this again.`);
}

// Every release is logged: CHANGELOG.md must have a non-empty "## <version>" section.
const changelog = (() => { try { return readFileSync(path.join(app, 'CHANGELOG.md'), 'utf8'); } catch { return ''; } })();
const esc = version.replace(/\./g, '\\.');
const entry = changelog.match(new RegExp(`^## ${esc}\\b[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
if (!entry || !entry[1].replace(/\s+/g, '')) {
  die(`CHANGELOG.md has no entry for ${version}.\n  Add "## ${version} — <date>" at the top with what changed (for users first), commit, and run again.`);
}

const dirty = sh('git status --porcelain -- react_app_sate-ui_update');
if (dirty) die(`uncommitted changes in react_app_sate-ui_update/ (the subtree push ships commits only):\n${dirty}`);
const tag = `web-${version}`;
if (sh(`git tag -l ${tag}`)) die(`tag ${tag} already exists — bump the version.`);

console.log('\n▸ npm run build');
run('npm run build', app);

console.log('\n▸ git subtree push --prefix=react_app_sate-ui_update webapp main');
run('git subtree push --prefix=react_app_sate-ui_update webapp main');

run(`git tag -a ${tag} -m "SATE web ${version} (production)"`);
try { run(`git push origin ${tag}`); } catch { console.warn(`(could not push tag ${tag} — push it by hand)`); }

console.log(`\n▸ waiting for ${PROD} to report ${version} …`);
for (let i = 0; i < 45; i++) {
  await new Promise((r) => setTimeout(r, 20000));
  const now = await liveVersion();
  if (now?.version === version) { console.log(`✔ production is on ${version} (${now.commit}, built ${now.built})`); process.exit(0); }
}
die(`production still reports ${(await liveVersion())?.version ?? 'nothing'} after 15 min — check the Vercel deployment.`);
