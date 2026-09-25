import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { readCatalog } from '../scripts/catalog.mjs';
const { rules } = await readCatalog();
const directory = new URL('./fixtures/', import.meta.url);
for (const file of (await readdir(directory)).filter((f) => f.endsWith('.json'))) {
  const fixture = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
  test(`detection examples: ${fixture.ruleId}`, () => {
    const rule = rules.find((r) => r.id === fixture.ruleId);
    assert.ok(rule, 'Fixture must reference a current rule');
    assert.equal(file, `${rule.id}.json`);
    const d = rule.detection;
    assert.equal(d.case_sensitive, true);
    assert.deepEqual(d.decoding, { url_decode: false, html_entity_decode: false });
    assert.ok(['exact', 'contains'].includes(d.match));
    assert.ok(
      fixture.cases.some((c) => c.matches === true),
      'Needs a matching example'
    );
    assert.ok(
      fixture.cases.some((c) => c.matches === false),
      'Needs a nonmatching example'
    );
    for (const c of fixture.cases) {
      assert.equal(typeof c.input, 'string');
      assert.equal(typeof c.matches, 'boolean');
      assert.ok(typeof c.reason === 'string' && c.reason.trim());
      const matches = d.match === 'exact' ? c.input === d.pattern : c.input.includes(d.pattern);
      assert.equal(matches, c.matches, c.reason);
    }
  });
}
