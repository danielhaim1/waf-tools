import { readCatalog } from './catalog.mjs';
import { compileRule } from '../src/assets/js/generate.js';
const catalog = await readCatalog();
if (!catalog.rules.length || !catalog.categories.length)
  throw new Error('Catalog must not be empty.');
for (const rule of catalog.rules) compileRule(rule);
console.log(`Validated ${catalog.rules.length} rules and ${catalog.categories.length} categories.`);
