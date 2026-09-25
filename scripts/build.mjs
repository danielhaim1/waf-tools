import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { readCatalog } from './catalog.mjs';
import { bundleJavaScript } from './bundle.mjs';
import { publicCatalog, catalogHash } from './public-catalog.mjs';
import { renderSiteHtml } from './site-url.mjs';
const output = new URL('../dist/', import.meta.url);
const catalog = publicCatalog(await readCatalog());
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const html = renderSiteHtml(
  await readFile(new URL('../src/index.html', import.meta.url), 'utf8'),
  process.env.SITE_URL
);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(new URL('index.html', output), html);
for (const [directory, extensions] of Object.entries({
  css: ['.css'],
  logos: ['.svg', '.png'],
})) {
  await cp(
    new URL(`../src/assets/${directory}/`, import.meta.url),
    new URL(`assets/${directory}/`, output),
    {
      recursive: true,
      filter: (source) => basename(source) === directory || extensions.includes(extname(source)),
    }
  );
}
await mkdir(new URL('assets/js/', output), { recursive: true });
await writeFile(new URL('assets/js/app.js', output), await bundleJavaScript({ minify: true }));
await mkdir(new URL('data/', output), { recursive: true });
await writeFile(new URL('data/catalog.json', output), JSON.stringify(catalog));
await writeFile(
  new URL('data/release.json', output),
  JSON.stringify(
    {
      version,
      schemaVersion: 1,
      sha256: catalogHash(catalog),
      rules: catalog.rules.length,
      categories: catalog.categories.length,
    },
    null,
    2
  ) + '\n'
);
await mkdir(new URL('licenses/', output), { recursive: true });
await cp(new URL('../LICENSE', import.meta.url), new URL('licenses/PROJECT-LICENSE.txt', output));
console.log(`Built ${catalog.rules.length} rules across ${catalog.categories.length} categories.`);
