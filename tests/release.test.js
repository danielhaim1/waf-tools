import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'waf-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['scripts', 'src/assets/js', 'data']) {
    await mkdir(join(root, path), { recursive: true });
    await cp(new URL(`../${path}/`, import.meta.url), join(root, path), { recursive: true });
  }
  for (const path of ['package.json', 'package-lock.json'])
    await cp(new URL(`../${path}`, import.meta.url), join(root, path));
  await writeFile(join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- Test change.\n');
  await writeFile(join(root, 'LICENSE'), 'Licensing decision pending\n');
  await writeFile(
    join(root, 'publication.json'),
    JSON.stringify({ codeLicense: null, dataLicense: null, approvedCatalogSha256: null })
  );
  const run = (...args) =>
    execFileSync(process.execPath, ['scripts/release.mjs', ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  return { root, run };
}

test('release preparation updates package, lockfile, and notes without Git side effects', async (t) => {
  const { root, run } = await workspace(t);
  const original = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  const [major, minor, patch] = original.split('.').map(Number);
  run('patch');
  const expected = `${major}.${minor}.${patch + 1}`;
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.version, expected);
  assert.equal(lock.version, expected);
  assert.equal(lock.packages[''].version, expected);
  assert.ok((await readFile(join(root, 'CHANGELOG.md'), 'utf8')).includes(`## [${expected}] - `));
  assert.throws(() => run('patch'), /Add release notes/);
});

test('release checks reject missing approval, mismatched tags, and changed catalog content', async (t) => {
  const { root, run } = await workspace(t);
  run('current');
  assert.throws(() => run('check'), /Choose and record/);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  pkg.license = 'Apache-2.0';
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
  // A dummy license is confined to this temporary test workspace.
  await writeFile(join(root, 'LICENSE'), 'Test license placeholder');
  const approval = {
    codeLicense: 'Apache-2.0',
    dataLicense: 'Apache-2.0',
    approvedCatalogSha256: 'stale',
  };
  await writeFile(join(root, 'publication.json'), JSON.stringify(approval));
  assert.throws(() => run('check'), /Public catalog needs approval/);
  approval.approvedCatalogSha256 = run('hash').trim();
  await writeFile(join(root, 'publication.json'), JSON.stringify(approval));
  assert.match(run('check', `v${pkg.version}`), /verified/);
  assert.throws(() => run('check', 'v9999.0.0'), /Tag does not match/);
  const dataFile = join(root, 'data/rules/certificates-and-private-keys.json');
  const data = JSON.parse(await readFile(dataFile, 'utf8'));
  data.rules[0].notes += ' Changed.';
  await writeFile(dataFile, JSON.stringify(data));
  assert.throws(() => run('check'), /Public catalog needs approval/);
});

test('contribution check requires a fixture for an added rule without a count baseline', async (t) => {
  const { root } = await workspace(t);
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init');
  git('add', '.');
  git(
    '-c',
    'user.name=WAF test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-m',
    'Test baseline'
  );
  const base = git('rev-parse', 'HEAD');
  const dataFile = join(root, 'data/rules/certificates-and-private-keys.json');
  const data = JSON.parse(await readFile(dataFile, 'utf8'));
  const added = structuredClone(data.rules[0]);
  added.id = 'fixture-test-new-rule';
  data.rules.push(added);
  await writeFile(dataFile, JSON.stringify(data));
  const check = () =>
    execFileSync(process.execPath, ['scripts/check-contributions.mjs', base], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  assert.throws(check, /add matching and nonmatching examples/);
  await mkdir(join(root, 'tests/fixtures'), { recursive: true });
  await writeFile(
    join(root, `tests/fixtures/${added.id}.json`),
    JSON.stringify({
      ruleId: added.id,
      cases: [
        { input: added.detection.pattern, matches: true, reason: 'Literal indicator.' },
        { input: '', matches: false, reason: 'No indicator.' },
      ],
    })
  );
  assert.match(check(), /1 new or behavior-changed rules have fixtures/);
});
