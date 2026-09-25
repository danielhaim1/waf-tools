import { createHash } from 'node:crypto';

const pick = (value, fields) =>
  Object.fromEntries(
    fields.filter((key) => value?.[key] !== undefined).map((key) => [key, value[key]])
  );

// Explicit publication boundary: new authoring fields are not published automatically.
export function publicCatalog(catalog) {
  return {
    categories: catalog.categories.map((c) =>
      pick(c, ['id', 'name', 'description', 'group', 'enabled', 'order'])
    ),
    rules: catalog.rules.map((r) => ({
      ...pick(r, ['id', 'categoryId', 'name', 'notes', 'tags']),
      detection: {
        ...pick(r.detection, ['location', 'match', 'pattern', 'case_sensitive']),
        decoding: pick(r.detection.decoding, ['url_decode', 'html_entity_decode']),
      },
      risk: pick(r.risk, ['severity', 'confidence', 'false_positive_risk']),
      action: pick(r.action, ['recommended']),
      applicability: pick(r.applicability, [
        'platforms',
        'operating_systems',
        'web_stacks',
        'requires',
      ]),
      references: pick(r.references, ['cves', 'cwes', 'external']),
      ui: pick(r.ui, ['default_selected', 'recommended']),
    })),
  };
}
export function catalogHash(catalog) {
  return createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
}
