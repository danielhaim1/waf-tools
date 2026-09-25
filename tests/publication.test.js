import test from 'node:test';
import assert from 'node:assert/strict';
import { readCatalog } from '../scripts/catalog.mjs';
import { publicCatalog, catalogHash } from '../scripts/public-catalog.mjs';
import { createModel } from '../src/assets/js/catalog.js';

test('publication excludes unlisted authoring fields and hashes content changes', async () => {
  const source = await readCatalog();
  const before = publicCatalog(source);
  source.internal = 'private';
  source.rules[0].internal = 'private';
  source.rules[0].detection.internal = 'private';
  source.rules[0].references.internal = 'private';
  assert.deepEqual(publicCatalog(source), before);
  assert.doesNotThrow(() => createModel(before));
  const hash = catalogHash(before);
  before.rules[0].detection.pattern += '-changed';
  assert.notEqual(catalogHash(before), hash);
});
