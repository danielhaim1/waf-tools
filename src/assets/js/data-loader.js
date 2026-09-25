import { createModel } from './catalog.js';

export async function loadExplorerModel() {
  const response = await fetch(
    new URL('./data/catalog.json', document.baseURI || window.location.href)
  );
  if (!response.ok) throw new Error(`Unable to load catalog (${response.status}).`);
  return createModel(await response.json());
}
