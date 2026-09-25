import test from 'node:test';
import assert from 'node:assert/strict';
import { readCatalog } from '../scripts/catalog.mjs';
import {
  EXPORTERS,
  generateExport,
  downloadText,
  assessCompatibility,
  modsecurityId,
  exclusionReport,
} from '../src/assets/js/exporters.js';

const catalog = await readCatalog();
function rule(location = 'path', pattern = '.pem', match = 'contains', action = 'block') {
  const value = structuredClone(catalog.rules[0]);
  value.detection = {
    location,
    pattern,
    match,
    case_sensitive: true,
    decoding: { url_decode: false, html_entity_decode: false },
  };
  value.action.recommended = action;
  delete value.implementations;
  return value;
}
const content = (rules, target) => {
  const result = generateExport(rules, target);
  assert.deepEqual(result.errors, []);
  return downloadText(result);
};

test('every platform exports a supported selection; empty and unknown formats fail', () => {
  for (const target of Object.keys(EXPORTERS)) {
    assert.ok(content([rule('user_agent', 'Scanner')], target).length);
    assert.ok(generateExport([], target).errors.length);
  }
  assert.ok(generateExport([rule()], 'missing').errors.length);
});

test('JSON exports only pattern strings and plain text preserves matching metadata', () => {
  assert.deepEqual(
    JSON.parse(content(catalog.rules, 'json')),
    catalog.rules.map((r) => r.detection.pattern)
  );
  const selected = rule('query', 'x="a"');
  assert.deepEqual(JSON.parse(content([selected], 'json')), ['x="a"']);
  const text = content([rule('query', 'x="a"')], 'text');
  assert.ok(text.includes('URL decode: false'));
  assert.ok(text.includes('x=\\"a\\"'));
});

test('CSV quotes multiline cells and protects spreadsheet formulas', () => {
  const r = rule('query', '=HYPERLINK("bad")');
  r.notes = 'one,"two"\nthree';
  const output = content([r], 'csv');
  assert.ok(output.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(output.includes('"one,""two""\nthree"'));
});

test('unsupported rules stop the entire export without partial downloads', () => {
  for (const target of ['nginx', 'modsecurity', 'haproxy', 'caddy', 'aws', 'azure']) {
    const bad = rule('full_uri');
    bad.id = 'full-uri-test';
    const result = generateExport([rule('user_agent'), bad], target);
    assert.equal(result.blocks.length, 0);
    assert.match(result.errors.join(' '), /full-uri-test/);
  }
  for (const target of ['nginx', 'haproxy', 'caddy']) {
    assert.match(
      generateExport([rule('path', 'test', 'contains', 'log')], target).errors.join(' '),
      /Log-only/
    );
  }
  assert.match(generateExport([rule()], 'azure').errors.join(' '), /Path-only/);
  const decoded = rule();
  decoded.detection.decoding.url_decode = true;
  assert.match(generateExport([decoded], 'nginx').errors.join(' '), /Decoding/);
});

test('AWS API export base64 encodes UTF-8, preserves fields and orders Count first', () => {
  const block = rule('path', 'café', 'exact');
  const log = rule('query', 'q=test', 'contains', 'log');
  log.id = 'query-log';
  const out = JSON.parse(content([block, log], 'aws'));
  assert.deepEqual(out[0].Action, { Count: {} });
  assert.deepEqual(out[1].Action, { Block: {} });
  assert.equal(out[1].Statement.ByteMatchStatement.SearchString, 'Y2Fmw6k=');
  assert.deepEqual(out[1].Statement.ByteMatchStatement.FieldToMatch, { UriPath: {} });
  assert.equal(out[1].Statement.ByteMatchStatement.PositionalConstraint, 'EXACTLY');
  assert.deepEqual(out[0].Statement.ByteMatchStatement.TextTransformations, [
    { Priority: 0, Type: 'NONE' },
  ]);
  assert.match(
    generateExport([rule('query', 'a'.repeat(201))], 'aws').errors.join(' '),
    /200 bytes/
  );
});

test('Azure targets Front Door query and header schemas, with a rule limit', () => {
  const out = JSON.parse(content([rule('user_agent', 'Scanner', 'exact', 'log')], 'azure'));
  assert.equal(out.rules[0].action, 'Log');
  assert.deepEqual(out.rules[0].matchConditions[0], {
    matchVariable: 'RequestHeader',
    selector: 'User-Agent',
    operator: 'Equal',
    negateCondition: false,
    matchValue: ['Scanner'],
    transforms: [],
  });
  const rules = Array.from({ length: 101 }, (_, i) => ({ ...rule('query'), id: `rule-${i}` }));
  assert.match(generateExport(rules, 'azure').errors.join(' '), /100 custom rules/);
});

test('HAProxy uses literal matching and escapes configuration interpolation', () => {
  const out = content([rule('query', '-i "$HOME"\\file')], 'haproxy');
  assert.ok(out.includes('query -m sub -- "-i \\"\\$HOME\\"\\\\file"'));
  assert.ok(content([rule('path', '/a', 'exact')], 'haproxy').includes('path -m str -- "/a"'));
});

// Translate only the generated PCRE/RE2 literal subset to JS to exercise its match boundaries.
function matcher(r) {
  const out = content([r], 'caddy');
  const token = out
    .split('\n')
    .find((line) => line.startsWith('@'))
    .split(' ')
    .slice(3)
    .join(' ');
  const expression = JSON.parse(token)
    .replaceAll('\\A', '^')
    .replaceAll('\\z', '$')
    .replace(/\\x\{([0-9a-f]+)\}/g, (_, hex) => `\\u{${hex}}`);
  return new RegExp(expression, 'u');
}
test('raw URI regex preserves path/query boundaries and literal metacharacters', () => {
  const path = matcher(rule('path', '.pem'));
  assert.ok(path.test('/a.pem?x=1'));
  assert.ok(!path.test('/a?x=.pem'));
  assert.ok(!path.test('/aXpem'));
  const exact = matcher(rule('path', '/secret', 'exact'));
  assert.ok(exact.test('/secret?x=1'));
  assert.ok(!exact.test('/secret-more'));
  const query = matcher(rule('query', 'a=1', 'exact'));
  assert.ok(query.test('/path?a=1'));
  assert.ok(!query.test('/a=1'));
  assert.ok(!query.test('/path?a=12'));
  const escaped = matcher(rule('path', '/"${env}#\\file', 'exact'));
  assert.ok(escaped.test('/"${env}#\\file'));
});

test('ModSecurity Log is non-terminating and precedes blocking rules', () => {
  const log = rule('query', 'foo', 'contains', 'log');
  log.id = 'log-test';
  const out = content([rule(), log], 'modsecurity');
  assert.ok(out.indexOf('pass,log,auditlog') < out.indexOf('deny,status:403'));
  assert.ok(out.includes('phase:1,t:none'));
});

test('ModSecurity preflight accounts for every catalog rule', () => {
  const check = assessCompatibility(catalog.rules, 'modsecurity');
  assert.equal(check.compatible.length + check.excluded.length, catalog.rules.length);
  assert.deepEqual(check.errors, []);
  const strict = generateExport(catalog.rules, 'modsecurity');
  if (check.excluded.length) assert.equal(strict.blocks.length, 0);
  const partial = generateExport(catalog.rules, 'modsecurity', { compatibleOnly: true });
  assert.deepEqual(partial.errors, []);
  assert.equal(partial.blocks[0].ruleIds.length, check.compatible.length);
  const report = JSON.parse(exclusionReport(partial));
  assert.equal(report.excluded.length, check.excluded.length);
  assert.equal(report.exportedRuleIds.length, check.compatible.length);
  if (check.excluded.length)
    assert.ok(downloadText(partial).startsWith(`# PARTIAL EXPORT: ${check.excluded.length}`));
  assert.deepEqual(
    new Set([...report.exportedRuleIds, ...report.excluded.map((r) => r.id)]),
    new Set(catalog.rules.map((r) => r.id))
  );
});

test('ModSecurity numeric IDs survive reorder, subset selection and ID range changes', () => {
  const a = rule();
  const b = rule('query', 'example');
  b.id = 'second-rule';
  const id = modsecurityId(a.id);
  for (const rules of [[a], [a, b], [b, a]]) {
    assert.ok(content(rules, 'modsecurity').includes(`id:${id},`));
  }
  const moved = generateExport([a], 'modsecurity', { idBase: 3000000 });
  assert.ok(downloadText(moved).includes(`id:${id + 2000000},`));
  for (const base of [0, -1, 1.2, NaN, 2146483649]) {
    assert.ok(
      generateExport([a], 'modsecurity', { idBase: base, compatibleOnly: true }).errors.length
    );
  }
});

test('partial export cannot bypass duplicate IDs or export an entirely unsupported selection', () => {
  assert.equal(
    generateExport([rule(), rule()], 'modsecurity', { compatibleOnly: true }).blocks.length,
    0
  );
  assert.equal(
    generateExport([rule('full_uri')], 'modsecurity', { compatibleOnly: true }).blocks.length,
    0
  );
});

test('numeric ID collisions fail instead of renumbering rules', () => {
  const seen = new Map();
  let pair;
  for (let i = 0; i < 20000; i++) {
    const id = `collision-check-${i}`;
    const number = modsecurityId(id);
    if (seen.has(number)) {
      pair = [seen.get(number), id];
      break;
    }
    seen.set(number, id);
  }
  assert.ok(pair);
  const rules = pair.map((id) => ({ ...rule(), id }));
  const output = generateExport(rules, 'modsecurity', { compatibleOnly: true });
  assert.equal(output.blocks.length, 0);
  assert.match(output.errors.join(' '), /collision/);
});
