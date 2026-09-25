// Cloudflare custom expressions: preserve catalog semantics; never silently skip a selected rule.
const FIELDS = {
  path: 'http.request.uri.path',
  query: 'http.request.uri.query',
  full_uri: 'http.request.full_uri',
  user_agent: 'http.user_agent',
};
const OPERATORS = { exact: 'eq', contains: 'contains' };

export const MAX_EXPRESSION_LENGTH = 4000; // Below Cloudflare's 4,096-character limit.

export function rawString(value) {
  for (let n = 0; n <= 255; n++) {
    const hashes = '#'.repeat(n);
    if (!value.includes(`"${hashes}`)) return `r${hashes}"${value}"${hashes}`;
  }
  throw new Error('Pattern cannot be represented as a raw string.');
}

export function compileRule(rule) {
  const detection = rule.detection;
  const field = Object.hasOwn(FIELDS, detection?.location) ? FIELDS[detection.location] : null;
  const operator = Object.hasOwn(OPERATORS, detection?.match) ? OPERATORS[detection.match] : null;
  if (!field || !operator) throw new Error('Unsupported detection location or match type.');
  if (
    detection.case_sensitive !== true ||
    detection.decoding?.url_decode !== false ||
    detection.decoding?.html_entity_decode !== false
  ) {
    throw new Error('Case conversion or decoding is not supported yet.');
  }

  if (
    typeof detection.pattern !== 'string' ||
    !detection.pattern ||
    Array.from(detection.pattern).some(
      (char) => char.codePointAt(0) < 32 || char.codePointAt(0) === 127
    )
  ) {
    throw new Error('Pattern is empty or contains unsupported control characters.');
  }

  const implementation = rule.implementations?.cloudflare;
  if (implementation && (implementation.field !== field || implementation.operator !== operator)) {
    throw new Error('Cloudflare implementation disagrees with canonical detection.');
  }

  if (!['block', 'log'].includes(rule.action?.recommended))
    throw new Error('Unsupported recommended action.');
  return `(${field} ${operator} ${rawString(detection.pattern)})`;
}

export function generateRules(rules, maxLength = MAX_EXPRESSION_LENGTH) {
  if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > MAX_EXPRESSION_LENGTH)
    throw new Error('Invalid expression limit.');

  const errors = [];
  if (!rules.length) return { blocks: [], errors: ['Select at least one rule.'] };

  const groups = new Map([
    ['log', []],
    ['block', []],
  ]);
  const seen = new Set();

  for (const rule of rules) {
    try {
      if (seen.has(rule.id)) throw new Error('Duplicate rule ID.');
      seen.add(rule.id);

      const code = compileRule(rule);
      if (code.length > maxLength) throw new Error(`Expression exceeds ${maxLength} characters.`);
      groups.get(rule.action.recommended).push({ rule, code });
    } catch (error) {
      errors.push(`${rule.id}: ${error.message}`);
    }
  }

  if (errors.length) return { blocks: [], errors };

  const blocks = [];
  // Put non-terminating Log rules first so an earlier Block does not prevent their evaluation.

  for (const [action, entries] of groups) {
    let block = null;

    for (const { rule, code } of entries) {
      if (!block || block.expression.length + 4 + code.length > maxLength) {
        block = { sequence: blocks.length + 1, action, expression: '', ruleIds: [] };
        blocks.push(block);
      }
      block.expression += (block.expression ? '\nor ' : '') + code;
      block.ruleIds.push(rule.id);
    }
  }

  return { blocks, errors };
}

export function exportText(generation) {
  return (
    generation.blocks
      .map(
        (block) =>
          `# Rule ${block.sequence} — Action: ${block.action}\n# Source rules: ${block.ruleIds.join(', ')}\n${block.expression}`
      )
      .join('\n\n') + '\n'
  );
}
