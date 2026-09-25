import assert from 'node:assert/strict';
import { parse } from 'acorn';
import { readFile, readdir, access } from 'node:fs/promises';
import { createModel } from '../src/assets/js/catalog.js';
import { EXPORTERS } from '../src/assets/js/exporters.js';
import { catalogHash } from './public-catalog.mjs';
import { siteUrl } from './site-url.mjs';
const root = new URL('../dist/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(await read('data/catalog.json'));
const release = JSON.parse(await read('data/release.json'));
createModel(catalog);
assert.equal(release.version, pkg.version);
assert.equal(release.sha256, catalogHash(catalog));
assert.equal(release.rules, catalog.rules.length);
for (const provider of Object.values(EXPORTERS))
  await access(new URL(`assets/logos/${provider.logo}`, root));
assert.deepEqual(await readdir(new URL('assets/js/', root)), ['app.js']);
parse(await read('assets/js/app.js'), { ecmaVersion: 5, sourceType: 'script' });
const html = await read('index.html');
const decodeAttribute = (value) =>
  value.replace(
    /&(?:amp|quot|#39|lt|gt);/g,
    (entity) => ({ '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' })[entity]
  );
for (const pattern of [
  /<meta name="url" content="([^"]+)"/,
  /<link rel="home" href="([^"]+)"/,
  /<link rel="canonical" href="([^"]+)"/,
]) {
  const match = html.match(pattern);
  assert.ok(match, `Missing site URL metadata: ${pattern}`);
  assert.equal(decodeAttribute(match[1]), siteUrl(process.env.SITE_URL));
}
assert.ok(!html.includes('example.com'));
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))
  await access(new URL(match[1], root));
assert.ok(html.includes('<script defer src="./assets/js/app.js"></script>'));
assert.ok(!html.includes('type="module"'));
assert.ok(html.includes('https://github.com/danielhaim1/waf-tools'));
assert.ok(!html.includes('?tab=repositories'));
assert.ok(!(await readdir(root)).includes('docs'));
await access(new URL('licenses/PROJECT-LICENSE.txt', root));
console.log('Built catalog, release checksum, single ES5 bundle, and assets verified.');
