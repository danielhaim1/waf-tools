import test from 'node:test';
import assert from 'node:assert/strict';
import { readCatalog } from '../scripts/catalog.mjs';
import { createModel } from '../src/assets/js/catalog.js';
import { generateRules, compileRule, rawString, exportText } from '../src/assets/js/generate.js';
import {
  createState,
  hydrateState,
  setRuleSelection,
  applyPreset,
  filteredRules,
  presetSelection,
  ruleRequiresReview,
} from '../src/assets/js/state.js';

const catalog = await readCatalog();
const model = createModel(catalog);
const sample = (changes = {}) => ({ ...structuredClone(model.rules[0]), ...changes });

test('broad key indicator stays available but requires deliberate selection', () => {
  const rule = model.rules.find((r) => r.id === 'certificates-and-private-keys-pki-key-path');
  assert.equal(rule.detection.match, 'contains');
  assert.ok('/assets/site.keyframes.css'.includes(rule.detection.pattern));
  assert.equal(ruleRequiresReview(rule), true);
  assert.equal(presetSelection(rule, 'conservative'), false);
  assert.equal(presetSelection(rule, 'balanced'), false);
  assert.equal(presetSelection(rule, 'aggressive'), true);
  assert.equal(generateRules([rule]).errors.length, 0);
});

test('catalog retains unique IDs, category references, and valid metadata', () => {
  assert.ok(model.categories.length > 0);
  assert.ok(model.rules.length > 0);
  assert.equal(new Set(model.rules.map((r) => r.id)).size, model.rules.length);
  const bad = structuredClone(catalog);
  bad.rules.push(bad.rules[0]);
  assert.throws(() => createModel(bad), /duplicate ID/);
  bad.rules.pop();
  bad.rules[0].categoryId = 'missing';
  assert.throws(() => createModel(bad), /unknown category/);
  bad.rules[0].categoryId = catalog.rules[0].categoryId;
  delete bad.rules[0].detection.case_sensitive;
  assert.throws(() => createModel(bad), /flags/);
});

test('all rules generate once, in action groups with Log first and bounded expressions', () => {
  const result = generateRules(model.rules);
  assert.deepEqual(result.errors, []);
  const ids = result.blocks.flatMap((b) => b.ruleIds);
  assert.equal(ids.length, model.rules.length);
  assert.deepEqual([...ids].sort(), model.rules.map((r) => r.id).sort());
  assert.equal(result.blocks[0].action, 'log');
  let hasBlock = false;
  for (const block of result.blocks) {
    assert.ok(block.expression.length <= 4000);
    if (block.action === 'block') hasBlock = true;
    if (hasBlock) assert.equal(block.action, 'block');
    for (const id of block.ruleIds)
      assert.equal(model.rulesById[id].action.recommended, block.action);
  }
  assert.match(exportText(result), /Action: log/);
  assert.match(exportText(result), /Action: block/);
});

test('raw literals preserve quotes, backslashes and delimiter collisions', () => {
  for (const value of ['a"b', 'a"#b', 'C:\\files\\key', 'x"##y']) {
    const literal = rawString(value);
    const hashes = literal.match(/^r(#{0,255})"/)[1];
    const content = literal.slice(2 + hashes.length, -(1 + hashes.length));
    assert.equal(content, value);
    assert.ok(!content.includes('"' + hashes));
  }
});

test('exact and contains use their canonical fields and operators', () => {
  const exact = model.rules.find((r) => r.detection.match === 'exact');
  assert.match(compileRule(exact), / eq r/);
  assert.match(
    compileRule(model.rules.find((r) => r.detection.match === 'contains')),
    / contains r/
  );
});

test('splits at complete expressions and accepts an exact length boundary', () => {
  const first = sample({ id: 'test-one' });
  const second = sample({ id: 'test-two' });
  const expression = compileRule(first);
  assert.equal(generateRules([first], expression.length).blocks.length, 1);
  assert.equal(generateRules([first, second], expression.length * 2 + 4).blocks.length, 1);
  const split = generateRules([first, second], expression.length * 2 + 3);
  assert.equal(split.blocks.length, 2);
  assert.equal(split.blocks[0].expression, expression);
  assert.equal(split.blocks[1].expression, expression);
  assert.equal(generateRules([first], expression.length - 1).blocks.length, 0);
});

test('unsupported semantics, actions and conflicting implementations block the whole export', () => {
  for (const change of [
    (r) => {
      r.detection.case_sensitive = false;
    },
    (r) => {
      r.detection.decoding.url_decode = true;
    },
    (r) => {
      r.detection.decoding.html_entity_decode = true;
    },
    (r) => {
      r.detection.match = 'regex';
    },
    (r) => {
      r.action.recommended = 'challenge';
    },
    (r) => {
      r.implementations.cloudflare.field = 'http.host';
    },
    (r) => {
      r.detection.pattern = 'x\ny';
    },
  ]) {
    const bad = sample({ id: 'invalid-rule' });
    change(bad);
    const output = generateRules([model.rules[1], bad]);
    assert.equal(output.blocks.length, 0);
    assert.equal(output.errors.length, 1);
    assert.match(output.errors[0], /^invalid-rule:/);
  }
  assert.ok(generateRules([]).errors.length);
  assert.ok(generateRules([model.rules[0], model.rules[0]]).errors.length);
});

test('empty and custom selections survive reload; stale IDs are discarded', () => {
  let saved;
  globalThis.window = {
    sessionStorage: {
      getItem: () => saved,
      setItem: (_, value) => {
        saved = value;
      },
    },
  };
  try {
    const state = createState();
    hydrateState(state, model);
    assert.equal(
      state.selectedRuleIds.size,
      model.rules.filter((r) => presetSelection(r, 'balanced')).length
    );
    setRuleSelection(
      state,
      model.rules.map((r) => r.id),
      false
    );
    assert.equal(state.selectedRuleIds.size, 0);
    let restored = createState();
    hydrateState(restored, model);
    assert.equal(restored.selectedRuleIds.size, 0);
    setRuleSelection(
      state,
      model.rules.slice(0, 8).map((r) => r.id),
      true
    );
    restored = createState();
    hydrateState(restored, model);
    assert.deepEqual(restored.selectedRuleIds, state.selectedRuleIds);
    assert.equal(restored.preset, 'custom');
    const snapshot = JSON.parse(saved);
    snapshot.selectedRuleIds.push('missing-rule');
    saved = JSON.stringify(snapshot);
    hydrateState(restored, model);
    assert.equal(restored.selectedRuleIds.size, 8);
  } finally {
    delete globalThis.window;
  }
});

test('conservative excludes review candidates and does not fall back to all rules', () => {
  const rule = sample();
  rule.risk.false_positive_risk = 'medium';
  rule.ui = { default_selected: true };
  assert.equal(presetSelection(rule, 'conservative'), false);
  const state = createState();
  state.rules = [rule];
  applyPreset(state, 'conservative');
  assert.equal(state.selectedRuleIds.size, 0);
});

test('selection changes invalidate output while search leaves it intact', () => {
  const state = createState();
  hydrateState(state, model);
  state.generation = generateRules(model.rules);
  state.searchQuery = 'union select';
  assert.ok(filteredRules(state).length > 0);
  assert.ok(state.generation);
  setRuleSelection(state, [model.rules[0].id], false);
  assert.equal(state.generation, null);
});

test('search handles case, whitespace, category IDs, and multiple required terms', () => {
  const state = createState();
  hydrateState(state, model);
  state.searchQuery = '  CERTIFICATES-AND-PRIVATE-KEYS   .KEY  ';
  const ids = filteredRules(state).map((rule) => rule.id);
  assert.ok(ids.includes('certificates-and-private-keys-pki-key-path'));
  assert.ok(!ids.includes('certificates-and-private-keys-x-509-pem-path'));
  state.searchQuery += ' no-such-indicator';
  assert.equal(filteredRules(state).length, 0);
  state.searchQuery = ' \t\n ';
  assert.equal(filteredRules(state).length, state.rules.length);
});

test('severity, review, and selection filters combine without changing selection', () => {
  const state = createState();
  hydrateState(state, model);
  const id = 'certificates-and-private-keys-pki-key-path';
  state.selectedRuleIds = new Set([id]);
  state.filters = { severities: new Set(['critical']), selection: 'selected', reviewOnly: true };
  assert.deepEqual(
    filteredRules(state).map((rule) => rule.id),
    [id]
  );
  state.filters.severities = new Set(['low']);
  assert.equal(filteredRules(state).length, 0);
  state.filters.severities.clear();
  state.filters.selection = 'unselected';
  assert.ok(filteredRules(state).every((rule) => rule.id !== id && ruleRequiresReview(rule)));
  assert.deepEqual([...state.selectedRuleIds], [id]);
});

test('reloading a catalog clears stale search indexes and generated output', () => {
  const state = createState();
  hydrateState(state, model);
  state.generation = generateRules(model.rules);
  const rule = model.rules[0];
  const reduced = createModel({ categories: catalog.categories, rules: [rule] });
  hydrateState(state, reduced);
  assert.equal(state.generation, null);
  assert.deepEqual([...state.searchIndexByRuleId.keys()], [rule.id]);
  assert.ok([...state.selectedRuleIds].every((id) => id === rule.id));
});

test('category indexes preserve rule order and omit disabled categories', () => {
  const category = catalog.categories[0];
  const sourceRules = catalog.rules.filter((rule) => rule.categoryId === category.id);
  const enabled = createModel(catalog);
  assert.deepEqual(enabled.rulesByCategory[category.id], sourceRules);
  const disabled = createModel({
    ...catalog,
    categories: catalog.categories.map((item) => ({ ...item, enabled: item.id !== category.id })),
  });
  assert.equal(Object.hasOwn(disabled.rulesByCategory, category.id), false);
  assert.ok(disabled.rules.every((rule) => rule.categoryId !== category.id));
});
