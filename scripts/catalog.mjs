import { readFile, readdir } from 'node:fs/promises';
import { createModel } from '../src/assets/js/catalog.js';
const data = new URL('../data/', import.meta.url);
export async function readCatalog() {
  const { categories } = JSON.parse(await readFile(new URL('categories.json', data), 'utf8'));
  const files = (await readdir(new URL('rules/', data))).filter((f) => f.endsWith('.json')).sort();
  const documents = await Promise.all(
    files.map(async (file) => {
      const document = JSON.parse(await readFile(new URL(`rules/${file}`, data), 'utf8'));
      if (
        document.schema_version !== 1 ||
        !document.category?.id ||
        !Array.isArray(document.rules)
      ) {
        throw new Error(`Invalid rule document: ${file}`);
      }
      return document;
    })
  );
  const rules = documents.flatMap((d) =>
    d.rules.map((rule) => ({ ...rule, categoryId: d.category.id }))
  );
  createModel({ categories, rules });
  return { categories, rules };
}
