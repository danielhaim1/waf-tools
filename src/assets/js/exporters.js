import { generateRules, compileRule, exportText } from './generate.js';

export const EXPORTERS = {
  cloudflare: {
    name: 'Cloudflare',
    logo: 'cloudflare.svg',
    extension: 'txt',
    note: 'Custom expressions. Use one custom rule per expression, in the order shown. Log requires Enterprise.',
  },
  modsecurity: {
    name: 'ModSecurity',
    logo: 'modsecurity.png',
    extension: 'conf',
    note: 'ModSecurity 3 · experimental. Compatibility is checked before export.',
    instructions:
      'Enable SecRuleEngine On and configure audit logging in your host configuration. Reserve the numeric ID range shown in the export; replace the previous generated set instead of appending. Validate with your ModSecurity connector and test matching and non-matching requests before deploying. Full-URL rules are not automatically narrowed to path and query.',
  },
  aws: {
    name: 'AWS WAF',
    logo: 'aws.svg',
    extension: 'json',
    note: 'WAFv2 API Rules array with base64 SearchString values. Log maps to Count; enable web ACL logging separately. Check WCU and rule quotas before importing.',
  },
  azure: {
    name: 'Azure Front Door',
    logo: 'azure-front-door.svg',
    extension: 'json',
    note: 'Azure Front Door customRules object. Query and User-Agent rules only; URI rules need a verified mapping. Maximum 100 rules. Enable diagnostic logging.',
  },
  nginx: {
    name: 'NGINX',
    logo: 'nginx.svg',
    extension: 'conf',
    note: 'Block rules only. Place maps in the http context and the return condition in your server. Validate with nginx -t.',
  },
  caddy: {
    name: 'Caddy',
    logo: 'caddy.svg',
    extension: 'caddy',
    note: 'Block rules only. Add inside your site block before request rewrites. Validate with caddy validate.',
  },
  haproxy: {
    name: 'HAProxy',
    logo: 'haproxy.png',
    extension: 'cfg',
    note: 'Block rules only. Add to an HTTP frontend before rewrites. Validate with haproxy -c -f your-config.',
  },
  json: {
    name: 'JSON',
    logo: 'json.svg',
    extension: 'json',
    note: 'A JSON array of selected pattern strings. Match locations, operators, actions, and catalog metadata are not included.',
  },
  csv: {
    name: 'CSV',
    logo: 'csv.svg',
    extension: 'csv',
    note: 'A spreadsheet-friendly audit table. Formula-like cells are prefixed with an apostrophe; JSON preserves the original pattern strings.',
  },
  text: {
    name: 'TXT',
    logo: 'txt.svg',
    extension: 'txt',
    note: 'A readable audit list with patterns, matching behavior, actions, and rule IDs.',
  },
};

const dataFormats = new Set(['json', 'csv', 'text']);
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const quote = (value) => JSON.stringify(value);
const haproxyQuote = (value) => '"' + value.replace(/[\\"$]/g, '\\$&') + '"';
// Hex literals prevent configuration, regex, and placeholder injection across engines.
const literal = (value) =>
  Array.from(value, (c) => `\\x{${c.codePointAt(0).toString(16)}}`).join('');

function validate(rule, target) {
  const detection = rule.detection;
  if (!/^[a-z0-9-]+$/.test(rule.id)) throw new Error('Invalid rule ID.');
  if (
    !['path', 'query', 'user_agent', 'full_uri'].includes(detection?.location) ||
    !['exact', 'contains'].includes(detection.match)
  )
    throw new Error('Unsupported detection.');

  if (
    !detection.pattern ||
    typeof detection.pattern !== 'string' ||
    Array.from(detection.pattern).some((c) => c.codePointAt(0) < 32 || c.codePointAt(0) === 127)
  )
    throw new Error('Empty pattern or control characters.');

  if (
    detection.case_sensitive !== true ||
    detection.decoding?.url_decode !== false ||
    detection.decoding?.html_entity_decode !== false
  )
    throw new Error('Decoding or case conversion is not supported by this exporter.');

  if (!['block', 'log'].includes(rule.action?.recommended)) throw new Error('Unsupported action.');
  if (detection.location === 'full_uri')
    throw new Error(
      'Full-URI matching is not supported by this exporter. Use Cloudflare or a data export.'
    );

  if (['nginx', 'haproxy', 'caddy'].includes(target) && rule.action.recommended === 'log')
    throw new Error(
      'Log-only rules are not supported by this exporter. Deselect this rule or choose another format.'
    );

  if (target === 'azure' && detection.location === 'path')
    throw new Error('Path-only matching is not supported by the Azure Front Door exporter yet.');

  if (
    ['nginx', 'modsecurity'].includes(target) &&
    Array.from(detection.pattern).some((c) => c.codePointAt(0) > 127)
  )
    throw new Error(
      'Non-ASCII patterns require a verified Unicode configuration for this exporter.'
    );

  if (
    ['nginx', 'modsecurity', 'caddy'].includes(target) &&
    detection.location === 'path' &&
    detection.pattern.includes('?')
  )
    throw new Error('A path pattern containing ? cannot be mapped to the raw request target.');
}

function regex(rule) {
  const detection = rule.detection;
  const value = literal(detection.pattern);
  const contains = detection.match === 'contains';
  if (detection.location === 'user_agent') return contains ? value : `\\A${value}\\z`;
  if (detection.location === 'path')
    return `\\A${contains ? '[^?]*' : ''}${value}${contains ? '[^?]*' : ''}(?:\\?.*)?\\z`;
  return `\\A[^?]*\\?${contains ? '.*' : ''}${value}${contains ? '.*' : ''}\\z`;
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function auditCSV(rules) {
  const rows = [
    [
      'id',
      'name',
      'category',
      'location',
      'match',
      'pattern',
      'case_sensitive',
      'url_decode',
      'html_entity_decode',
      'action',
      'severity',
      'confidence',
      'false_positive_risk',
      'notes',
    ],
  ];

  for (const rule of rules)
    rows.push([
      rule.id,
      rule.name,
      rule.categoryId,
      rule.detection.location,
      rule.detection.match,
      rule.detection.pattern,
      rule.detection.case_sensitive,
      rule.detection.decoding.url_decode,
      rule.detection.decoding.html_entity_decode,
      rule.action.recommended,
      rule.risk.severity,
      rule.risk.confidence,
      rule.risk.false_positive_risk,
      rule.notes,
    ]);

  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function compileText(rules) {
  return (
    rules
      .map(
        (rule) =>
          `${rule.name}\nID: ${rule.id}\nMatch: ${rule.detection.location} / ${rule.detection.match} / ${quote(rule.detection.pattern)}\nCase sensitive: ${rule.detection.case_sensitive}; URL decode: ${rule.detection.decoding.url_decode}; HTML decode: ${rule.detection.decoding.html_entity_decode}\nAction: ${rule.action.recommended}; Severity: ${rule.risk.severity}\n${rule.notes || ''}`
      )
      .join('\n\n') + '\n'
  );
}

function compileNginx(rules) {
  const maps = rules.map(
    (rule, i) =>
      `# ${rule.id}\nmap ${rule.detection.location === 'user_agent' ? '$http_user_agent' : '$request_uri'} $waf_rule_${i + 1} {\n    default 0;\n    ${quote('~' + regex(rule))} 1;\n}`
  );

  return (
    '# Place these maps in the http context.\n' +
    maps.join('\n\n') +
    `\n\nmap "${rules.map((_, i) => '$waf_rule_' + (i + 1)).join('')}" $waf_block {\n    default 0;\n    ~1 1;\n}\n\n# Place this condition inside your server block.\n# if ($waf_block) { return 403; }\n`
  );
}

function compileModSecurity(rules, options = {}) {
  return (
    `# ModSecurity 3; reserved ID range ${options.idBase ?? 1000000}-${(options.idBase ?? 1000000) + 999999}.\n# IDs are derived from source rule IDs; replace the previous generated set.\n` +
    rules
      .map(
        (rule) =>
          `# ${rule.id}\nSecRule ${rule.detection.location === 'user_agent' ? 'REQUEST_HEADERS:User-Agent' : 'REQUEST_URI_RAW'} ${quote('@rx ' + regex(rule))} "id:${modsecurityId(rule.id, options.idBase)},phase:1,t:none,${rule.action.recommended === 'log' ? 'pass,log,auditlog' : 'deny,status:403,log'},msg:'${rule.id}'"`
      )
      .join('\n\n') +
    '\n'
  );
}

function compileHAProxy(rules) {
  return (
    '# Add to an HTTP frontend before request rewrites.\n' +
    rules
      .map(
        (rule, i) =>
          `# ${rule.id}\nacl waf_rule_${i + 1} ${rule.detection.location === 'user_agent' ? 'req.hdr(user-agent)' : rule.detection.location === 'path' ? 'path' : 'query'} -m ${rule.detection.match === 'exact' ? 'str' : 'sub'} -- ${haproxyQuote(rule.detection.pattern)}\nhttp-request deny deny_status 403 if waf_rule_${i + 1}`
      )
      .join('\n\n') +
    '\n'
  );
}

function compileCaddy(rules) {
  return (
    '# Add inside your site block, before rewrites.\n' +
    rules
      .map(
        (rule, i) =>
          `# ${rule.id}\n@waf_rule_${i + 1} vars_regexp ${rule.detection.location === 'user_agent' ? '{http.request.header.User-Agent}' : '{http.request.orig_uri}'} ${quote(regex(rule))}\nrespond @waf_rule_${i + 1} 403`
      )
      .join('\n\n') +
    '\n'
  );
}

function compileAWS(rules) {
  return json(
    rules.map((rule, i) => {
      const detection = rule.detection;
      const bytes = new globalThis.TextEncoder().encode(detection.pattern);
      if (bytes.length > 200)
        throw new Error(`${rule.id}: AWS byte-match patterns must be at most 200 bytes.`);
      return {
        Name: `waf_rule_${i + 1}`,
        Priority: i,
        Action: { [rule.action.recommended === 'log' ? 'Count' : 'Block']: {} },
        Statement: {
          ByteMatchStatement: {
            SearchString: globalThis.btoa(String.fromCharCode(...bytes)),
            FieldToMatch:
              detection.location === 'path'
                ? { UriPath: {} }
                : detection.location === 'query'
                  ? { QueryString: {} }
                  : { SingleHeader: { Name: 'user-agent' } },
            PositionalConstraint: detection.match === 'exact' ? 'EXACTLY' : 'CONTAINS',
            TextTransformations: [{ Priority: 0, Type: 'NONE' }],
          },
        },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: `waf_rule_${i + 1}`,
        },
      };
    })
  );
}

function compileAzure(rules) {
  if (rules.length > 100)
    throw new Error(
      'Azure Front Door supports at most 100 custom rules per policy. Reduce the selection.'
    );
  return json({
    rules: rules.map((rule, i) => ({
      name: `WafRule${i + 1}`,
      priority: i + 1,
      enabledState: 'Enabled',
      ruleType: 'MatchRule',
      action: rule.action.recommended === 'log' ? 'Log' : 'Block',
      matchConditions: [
        {
          matchVariable: rule.detection.location === 'query' ? 'QueryString' : 'RequestHeader',
          ...(rule.detection.location === 'user_agent' ? { selector: 'User-Agent' } : {}),
          operator: rule.detection.match === 'exact' ? 'Equal' : 'Contains',
          negateCondition: false,
          matchValue: [rule.detection.pattern],
          transforms: [],
        },
      ],
    })),
  });
}

const compilers = {
  json: (rules) => json(rules.map((rule) => rule.detection.pattern)),
  csv: auditCSV,
  text: compileText,
  nginx: compileNginx,
  modsecurity: compileModSecurity,
  haproxy: compileHAProxy,
  caddy: compileCaddy,
  aws: compileAWS,
  azure: compileAzure,
};

function compile(rules, target, options) {
  if (!Object.hasOwn(compilers, target)) throw new Error('Unknown export format.');
  return compilers[target](rules, options);
}

// Fixed hash slots keep IDs stable across selection changes and catalog ordering.
// Collisions stop generation rather than silently renumbering an existing rule.

export function modsecurityId(id, base = 1000000) {
  if (!Number.isSafeInteger(base) || base < 1 || base > 2146483648)
    throw new Error('ID range start must be an integer from 1 to 2146483648.');

  let hash = 2166136261;

  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;

  return base + (hash % 1000000);
}

export function assessCompatibility(rules, target, options = {}) {
  const compatible = [];
  const excluded = [];
  const errors = [];
  if (!Object.hasOwn(EXPORTERS, target))
    return { compatible, excluded, errors: ['Unknown export format.'] };

  if (target === 'modsecurity') {
    try {
      modsecurityId('', options.idBase);
    } catch (error) {
      errors.push(error.message);
    }
  }

  const seen = new Set();
  const numericIds = new Map();

  for (const rule of rules) {
    if (seen.has(rule.id)) {
      errors.push(`Duplicate rule ID: ${rule.id}`);
      continue;
    }
    seen.add(rule.id);

    try {
      if (target === 'cloudflare') compileRule(rule);
      else if (!dataFormats.has(target)) validate(rule, target);

      if (
        target === 'aws' &&
        new globalThis.TextEncoder().encode(rule.detection.pattern).length > 200
      )
        throw new Error('AWS byte-match patterns must be at most 200 bytes.');

      if (target === 'modsecurity' && !errors.length) {
        const id = modsecurityId(rule.id, options.idBase);
        if (numericIds.has(id))
          errors.push(
            `Numeric ID collision: ${rule.id} and ${numericIds.get(id)}. Resolve the source identifiers before exporting.`
          );
        numericIds.set(id, rule.id);
      }
      compatible.push(rule);
    } catch (error) {
      const binary = /\\x[0-9a-f]{2}/i.test(rule.detection?.pattern || '');
      excluded.push({
        id: rule.id,
        name: rule.name,
        reason:
          target === 'modsecurity' && binary
            ? 'Source rule needs review: literal hexadecimal escape text is described as binary traffic. It has not been converted into byte matching.'
            : error.message,
      });
    }
  }

  if (target === 'azure' && compatible.length > 100)
    errors.push(
      'Azure Front Door supports at most 100 custom rules per policy. Reduce the selection.'
    );
  return { compatible, excluded, errors };
}

export function generateExport(rules, target = 'cloudflare', options = {}) {
  const provider = Object.hasOwn(EXPORTERS, target) ? EXPORTERS[target] : null;
  const result = { blocks: [], errors: [], excluded: [], target, provider };
  if (!provider) {
    result.errors.push('Unknown export format.');

    return result;
  }

  if (!rules.length) {
    result.errors.push('Select at least one rule.');

    return result;
  }

  const assessment = assessCompatibility(rules, target, options);
  result.errors.push(...assessment.errors);
  result.excluded = assessment.excluded;
  if (!options.compatibleOnly)
    result.errors.push(...assessment.excluded.map((rule) => `${rule.id}: ${rule.reason}`));

  if (result.errors.length) return result;
  if (!assessment.compatible.length) {
    result.errors.push('No compatible rules selected.');

    return result;
  }

  if (target === 'cloudflare') return { ...result, ...generateRules(assessment.compatible) };

  try {
    const ordered = dataFormats.has(target)
      ? assessment.compatible
      : [...assessment.compatible].sort(
          (a, b) => Number(b.action.recommended === 'log') - Number(a.action.recommended === 'log')
        );
    result.blocks.push({
      sequence: 1,
      action: 'export',
      expression: compile(ordered, target, options),
      ruleIds: ordered.map((rule) => rule.id),
    });
  } catch (error) {
    result.errors.push(error.message);
  }

  return result;
}

export function exclusionReport(generation) {
  return json({
    platform: generation.target,
    exportedRuleIds: generation.blocks.flatMap((b) => b.ruleIds),
    excluded: generation.excluded || [],
  });
}

export function downloadText(generation) {
  if (!generation.target || generation.target === 'cloudflare') return exportText(generation);

  const content = generation.blocks.map((block) => block.expression).join('\n');
  const supportsComments = ['nginx', 'modsecurity', 'haproxy', 'caddy'].includes(generation.target);
  if (!supportsComments || !generation.excluded?.length) return content;

  const exclusions = generation.excluded.map((rule) => `# Excluded: ${rule.id} — ${rule.reason}`);

  return [
    `# PARTIAL EXPORT: ${generation.excluded.length} selected rules excluded.`,
    ...exclusions,
    '',
    content,
  ].join('\n');
}
