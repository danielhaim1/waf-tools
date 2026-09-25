import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { readCatalog } from './catalog.mjs';
const base = process.argv[2];
if (!/^[0-9a-f]{40}$/.test(base || '')) throw new Error('Pass the pull request base commit SHA.');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const files = git('ls-tree', '-r', '--name-only', base, '--', 'data/rules')
  .trim()
  .split('\n')
  .filter((p) => p.endsWith('.json'));
const previous = new Map();
for (const file of files) {
  for (const rule of JSON.parse(git('show', `${base}:${file}`)).rules) previous.set(rule.id, rule);
}
let count = 0;
for (const rule of (await readCatalog()).rules) {
  const old = previous.get(rule.id);
  if (
    old &&
    JSON.stringify(old.detection) === JSON.stringify(rule.detection) &&
    JSON.stringify(old.action) === JSON.stringify(rule.action)
  )
    continue;
  const path = new URL(`../tests/fixtures/${rule.id}.json`, import.meta.url);
  const fixture = JSON.parse(
    await readFile(path, 'utf8').catch(() => {
      throw new Error(
        `${rule.id}: add matching and nonmatching examples in tests/fixtures/${rule.id}.json`
      );
    })
  );
  if (fixture.ruleId !== rule.id) throw new Error(`Wrong fixture ID for ${rule.id}`);
  count++;
}
console.log(
  `${count} new or behavior-changed rules have fixtures; npm test verifies their examples.`
);
