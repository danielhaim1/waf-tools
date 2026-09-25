import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { readCatalog } from './catalog.mjs';
import { publicCatalog, catalogHash } from './public-catalog.mjs';

const readJSON = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const pkg = await readJSON('../package.json');
const command = process.argv[2];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const changelogURL = new URL('../CHANGELOG.md', import.meta.url);
const changelog = await readFile(changelogURL, 'utf8');
const hash = catalogHash(publicCatalog(await readCatalog()));

if (command === 'hash') {
  console.log(hash);
} else if (['patch', 'minor', 'major', 'current'].includes(command)) {
  const section = changelog.match(/## Unreleased\n([\s\S]*?)(?=\n## |$)/);
  if (!section?.[1].trim()) throw new Error('Add release notes under ## Unreleased first.');
  const parts = pkg.version.split('.').map(Number);
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Expected a stable x.y.z version.');
  if (command === 'major') {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
  }
  if (command === 'minor') {
    parts[1]++;
    parts[2] = 0;
  }
  if (command === 'patch') parts[2]++;
  const version = parts.join('.');
  if (changelog.includes(`## [${version}]`)) throw new Error('Version already has release notes.');
  const lock = await readJSON('../package-lock.json');
  pkg.version = lock.version = lock.packages[''].version = version;
  await writeFile(new URL('../package.json', import.meta.url), JSON.stringify(pkg, null, 2) + '\n');
  await writeFile(
    new URL('../package-lock.json', import.meta.url),
    JSON.stringify(lock, null, 2) + '\n'
  );
  await writeFile(
    changelogURL,
    changelog.replace(
      section[0],
      `## Unreleased\n\n## [${version}] - ${new Date().toISOString().slice(0, 10)}\n${section[1]}`
    )
  );
  console.log(
    `Prepared v${version}. Review, run npm run check, and commit. Then run npm run release:tag. Nothing was committed or pushed.`
  );
} else if (['check', 'tag'].includes(command)) {
  const approval = await readJSON('../publication.json');
  if (!approval.codeLicense || !approval.dataLicense || pkg.license === 'UNLICENSED')
    throw new Error('Choose and record code/data licenses before release.');
  const license = await readFile(new URL('../LICENSE', import.meta.url), 'utf8');
  if (license.includes('Licensing decision pending'))
    throw new Error('Replace the pending LICENSE with the chosen license text.');
  if (approval.approvedCatalogSha256 !== hash)
    throw new Error(
      `Public catalog needs approval. Review dist/data/catalog.json; current SHA-256: ${hash}`
    );
  if (!changelog.includes(`## [${pkg.version}] - `))
    throw new Error('Prepare versioned changelog notes before release.');
  const tag = process.argv[3] || `v${pkg.version}`;
  if (tag !== `v${pkg.version}`) throw new Error('Tag does not match package version.');
  if (command === 'tag') {
    if (git('status', '--porcelain')) throw new Error('Commit reviewed changes before tagging.');
    git('tag', '-a', tag, '-m', `WAF Tools ${tag}`);
    console.log(`Created local tag ${tag}. Push explicitly with: git push origin ${tag}`);
  } else console.log(`Release ${tag} and catalog approval verified.`);
} else throw new Error('Use hash, current, patch, minor, major, check, or tag.');
