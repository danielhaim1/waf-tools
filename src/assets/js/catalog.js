// Shared by the browser and build: reject incomplete data before it reaches selection or export.
export function createModel(catalog) {
  if (!Array.isArray(catalog?.categories) || !Array.isArray(catalog?.rules)) {
    throw new Error('Catalog must contain categories and rules arrays.');
  }

  const categoryIds = new Set();
  const ruleIds = new Set();

  for (const category of catalog.categories) {
    if (
      typeof category.id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category.id) ||
      categoryIds.has(category.id) ||
      !category.name
    ) {
      throw new Error(`Invalid or duplicate category: ${category.id}`);
    }
    categoryIds.add(category.id);
  }

  for (const rule of catalog.rules) {
    const fail = (message) => {
      throw new Error(`${rule.id || 'Unnamed rule'}: ${message}`);
    };

    if (
      typeof rule.id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rule.id) ||
      ruleIds.has(rule.id)
    )
      fail('invalid or duplicate ID');
    ruleIds.add(rule.id);
    if (!categoryIds.has(rule.categoryId)) fail('unknown category');
    if (typeof rule.name !== 'string' || !rule.name.trim()) fail('missing name');

    const detection = rule.detection;
    if (!detection || typeof detection.pattern !== 'string' || !detection.pattern.length)
      fail('missing pattern');

    if (typeof detection.location !== 'string' || typeof detection.match !== 'string')
      fail('missing detection semantics');

    if (
      typeof detection.case_sensitive !== 'boolean' ||
      typeof detection.decoding?.url_decode !== 'boolean' ||
      typeof detection.decoding?.html_entity_decode !== 'boolean'
    )
      fail('missing case or decoding flags');

    for (const [field, allowed] of Object.entries({
      severity: ['critical', 'high', 'medium', 'low'],
      confidence: ['high', 'medium', 'low'],
      false_positive_risk: ['high', 'medium', 'low'],
    })) {
      if (!allowed.includes(rule.risk?.[field])) fail(`invalid ${field}`);
    }

    if (typeof rule.action?.recommended !== 'string') fail('missing recommended action');
  }

  const categories = catalog.categories
    .filter((c) => c.enabled !== false)
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name));
  const enabledIds = new Set(categories.map((c) => c.id));
  const rules = catalog.rules.filter((r) => enabledIds.has(r.categoryId));
  const rulesByCategory = Object.fromEntries(categories.map((category) => [category.id, []]));

  for (const rule of rules) {
    rulesByCategory[rule.categoryId].push(rule);
  }

  return {
    categories,
    rules,
    rulesById: Object.fromEntries(rules.map((r) => [r.id, r])),
    rulesByCategory,
  };
}
