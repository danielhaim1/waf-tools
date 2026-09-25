import { downloadText, exclusionReport, EXPORTERS } from './exporters.js';
import { PRESETS, filteredRules, ruleRequiresReview } from './state.js';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function checkbox(label, data) {
  const input = element('input');
  input.type = 'checkbox';
  input.setAttribute('aria-label', label);
  Object.assign(input.dataset, data);

  return input;
}

export function mountExportOptions(selectedPlatform) {
  const platformOptions = document.querySelector('#platform-options');
  const togglePlatforms = document.querySelector('#toggle-platforms');
  const additionalPlatforms = new Set(['caddy', 'haproxy', 'json', 'csv', 'text']);

  for (const [id, provider] of Object.entries(EXPORTERS)) {
    const label = document.createElement('label');
    label.className = 'platform-option';
    label.dataset.platform = id;
    label.hidden = additionalPlatforms.has(id) && id !== selectedPlatform;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'export-platform';
    input.value = id;
    input.checked = id === selectedPlatform;

    const mark = document.createElement('img');
    mark.className = 'platform-logo';
    mark.setAttribute('aria-hidden', 'true');
    mark.src = new URL(
      `./assets/logos/${provider.logo}`,
      document.baseURI || window.location.href
    ).href;
    mark.alt = '';
    mark.width = 88;
    mark.height = 28;

    const name = document.createElement('span');
    name.textContent = provider.name;
    label.append(input, mark, name);
    platformOptions.insertBefore(label, togglePlatforms);
  }

  togglePlatforms.addEventListener('click', () => {
    for (const option of platformOptions.children) option.hidden = false;

    togglePlatforms.remove();
    platformOptions.querySelector('input[name="export-platform"]').focus();
  });

  return platformOptions;
}

function detailContent(rule) {
  const panel = element('div', undefined, 'rule-detail');
  const detection = rule.detection;
  if (rule.notes) panel.append(element('p', rule.notes, 'detail-description'));

  const pattern = element('div', undefined, 'detail-pattern');
  pattern.append(
    element('span', 'Match pattern', 'pattern-heading'),
    element('pre', detection.pattern)
  );
  pattern.append(
    element(
      'p',
      `${detection.location} · ${detection.match} · ${detection.case_sensitive ? 'Case sensitive' : 'Case insensitive'}`,
      'muted'
    )
  );
  panel.append(pattern);

  const metrics = element('dl', undefined, 'detail-metrics');

  for (const [label, value, tone] of [
    ['Action', rule.action.recommended, rule.action.recommended === 'block' ? 'action' : 'neutral'],
    ['Confidence', rule.risk.confidence, rule.risk.confidence === 'high' ? 'positive' : 'caution'],
    [
      'False-positive risk',
      rule.risk.false_positive_risk,
      rule.risk.false_positive_risk === 'high'
        ? 'danger'
        : rule.risk.false_positive_risk === 'medium'
          ? 'caution'
          : 'positive',
    ],
  ]) {
    const metric = element('div');
    metric.append(element('dt', label), element('dd', value, `detail-value tone-${tone}`));
    metrics.append(metric);
  }

  panel.append(metrics);

  const fields = element('dl', undefined, 'detail-fields');
  const addField = (container, label, value) => {
    if (value) container.append(element('dt', label), element('dd', value));
  };
  const meaningful = (values) =>
    (values || []).filter((value) => !['any', 'generic'].includes(value.toLowerCase())).join(', ');
  addField(fields, 'Applies to', meaningful(rule.applicability?.platforms));
  addField(fields, 'Operating systems', meaningful(rule.applicability?.operating_systems));
  addField(fields, 'Web stacks', meaningful(rule.applicability?.web_stacks));
  addField(fields, 'Requirements', rule.applicability?.requires?.join(', '));

  const decoding = `URL: ${detection.decoding.url_decode ? 'yes' : 'no'}; HTML entities: ${detection.decoding.html_entity_decode ? 'yes' : 'no'}`;
  if (detection.decoding.url_decode || detection.decoding.html_entity_decode)
    addField(fields, 'Decoding', decoding);

  const references = element('dd', undefined, 'detail-references');

  for (const ref of [
    ...(rule.references?.cves || []),
    ...(rule.references?.cwes || []),
    ...(rule.references?.external || []),
  ]) {
    let href;
    if (/^CVE-\d{4}-\d+$/i.test(ref)) href = `https://nvd.nist.gov/vuln/detail/${ref}`;
    else if (/^CWE-\d+$/i.test(ref))
      href = `https://cwe.mitre.org/data/definitions/${ref.slice(4)}.html`;
    else if (/^https?:\/\//i.test(ref)) href = ref;

    const link = element(href ? 'a' : 'span', ref);
    if (href) {
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    references.append(link);
  }

  if (references.childElementCount) fields.append(element('dt', 'References'), references);
  if (fields.childElementCount) panel.append(fields);

  const technical = element('details', undefined, 'technical-details');
  technical.append(element('summary', 'Technical details'));

  const extra = element('dl', undefined, 'detail-fields');
  addField(extra, 'Rule ID', rule.id);
  addField(extra, 'Decoding', decoding);
  addField(extra, 'Tags', rule.tags?.join(', '));
  technical.append(extra);
  panel.append(technical);

  return panel;
}

// Build once; filter and select by updating these nodes, preserving focus and disclosure state.

export function mountCatalog(state, container) {
  const categories = new Map();
  const rules = new Map();
  const fragment = document.createDocumentFragment();

  for (const category of state.categories) {
    const row = element('div', undefined, 'category');
    const select = checkbox(`Select all rules in ${category.name}`, { categoryId: category.id });
    const details = element('details');
    const summary = element('summary');
    summary.append(element('span', category.name, 'category-name'));

    const count = element('span', '', 'category-count');
    summary.append(count);

    const list = element('ul', undefined, 'rule-list');

    for (const rule of state.rulesByCategory[category.id]) {
      const item = element('li', undefined, 'rule');
      const check = checkbox(`Select rule ${rule.name}`, { ruleId: rule.id });
      const disclosure = element('details');
      const title = element('summary');
      const label = element('span', rule.name, 'rule-label');
      title.append(label);
      label.append(element('span', rule.risk.severity, `badge badge-${rule.risk.severity}`));
      if (ruleRequiresReview(rule)) {
        const review = element('span', undefined, 'badge badge-review');
        const icon = element('span', '⚠');
        icon.setAttribute('aria-hidden', 'true');
        review.append(icon, document.createTextNode(' Requires review'));
        label.append(review);
      }

      const info = element('span', 'i', 'rule-info');
      info.setAttribute('aria-hidden', 'true');
      title.append(info);
      title.title = `Show details for ${rule.name}`;
      disclosure.append(title);

      let populated = false;
      disclosure.addEventListener('toggle', () => {
        title.title = `${disclosure.open ? 'Hide' : 'Show'} details for ${rule.name}`;
        if (disclosure.open && !populated) {
          disclosure.append(detailContent(rule));
          populated = true;
        }
      });

      item.append(check, disclosure);
      list.append(item);
      rules.set(rule.id, { item, check });
    }

    details.append(summary, list);
    row.append(select, details);
    fragment.append(row);
    categories.set(category.id, { row, select, details, count });
  }

  container.replaceChildren(fragment);

  return { categories, rules };
}

export function renderSelection(state, nodes) {
  const matching = filteredRules(state);
  const visible = new Set(matching.map((r) => r.id));

  for (const rule of state.rules) {
    const node = nodes.rules.get(rule.id);
    node.item.hidden = !visible.has(rule.id);
    node.check.checked = state.selectedRuleIds.has(rule.id);
  }

  for (const category of state.categories) {
    const node = nodes.categories.get(category.id);
    const rules = state.rulesByCategory[category.id];
    const selected = rules.filter((r) => state.selectedRuleIds.has(r.id)).length;
    const matches = rules.filter((r) => visible.has(r.id)).length;
    node.row.hidden = matches === 0;
    node.select.checked = rules.length > 0 && selected === rules.length;
    node.select.indeterminate = selected > 0 && selected < rules.length;
    node.count.textContent = `${selected}/${rules.length}`;
    node.count.setAttribute('aria-label', `${selected} of ${rules.length} rules selected`);
  }

  const selectAll = document.querySelector('#select-all-rules');
  const selectedMatches = matching.filter((r) => state.selectedRuleIds.has(r.id)).length;
  selectAll.checked = matching.length > 0 && selectedMatches === matching.length;
  selectAll.indeterminate = selectedMatches > 0 && selectedMatches < matching.length;
  selectAll.disabled = !matching.length;
  document.querySelector('#search-summary').textContent =
    `${matching.length} of ${state.rules.length} rules`;
  document.querySelector('#empty-results').hidden = matching.length > 0;
  document.querySelector('#selected-count').textContent = `${state.selectedRuleIds.size} selected`;

  const reviewCount = state.rules.filter(
    (r) => state.selectedRuleIds.has(r.id) && ruleRequiresReview(r)
  ).length;
  document.querySelector('#review-count').textContent = reviewCount
    ? `${reviewCount} require review`
    : '';
  document.querySelector('#preset-selector').value = state.preset;
  document.querySelector('#preset-description').textContent = PRESETS[state.preset];

  const filters =
    state.filters.severities.size +
    Number(state.filters.selection !== 'all') +
    Number(state.filters.reviewOnly);
  document.querySelector('#filter-count').textContent = filters ? `(${filters})` : '';
  if (!state.generation) {
    document.querySelector('#output').hidden = true;
    clearDownload();
    document.querySelector('#generation-status').textContent = '';
  }
}

function clearDownload() {
  for (const link of document.querySelectorAll('#download-output, #download-exclusions')) {
    if (link.hasAttribute('href')) URL.revokeObjectURL(link.href);
    link.removeAttribute('href');
  }
}

export function renderOutput(generation) {
  clearDownload();

  const provider = generation.provider || EXPORTERS.cloudflare;
  const cloudflare = !generation.target || generation.target === 'cloudflare';
  document.querySelector('#provider-output-title').textContent = provider.name;
  document.querySelector('#export-instructions').textContent =
    provider.instructions || provider.note;

  const isDataExport = ['json', 'csv', 'text'].includes(generation.target);
  document.querySelector('#installation-instructions').hidden = isDataExport;

  const excluded = generation.excluded || [];
  const exportedCount = generation.blocks.reduce((n, b) => n + b.ruleIds.length, 0);
  document.querySelector('#export-coverage').textContent = generation.errors.length
    ? ''
    : `${exportedCount} rules exported${excluded.length ? `; ${excluded.length} selected rules excluded. This is a partial export.` : '; all selected rules included.'}`;

  const report = document.querySelector('#download-exclusions');
  report.hidden = !excluded.length || !generation.blocks.length;
  if (!report.hidden)
    report.href = URL.createObjectURL(
      new Blob([exclusionReport(generation)], { type: 'application/json' })
    );
  document.querySelector('#export-validation').hidden = isDataExport;
  document.querySelector('#download-output').download =
    `waf-rules-${generation.target || 'cloudflare'}.${provider.extension}`;

  if (generation.blocks.length) {
    document.querySelector('#download-output').href = URL.createObjectURL(
      new Blob([downloadText(generation)], {
        type:
          provider.extension === 'json'
            ? 'application/json;charset=utf-8'
            : provider.extension === 'csv'
              ? 'text/csv;charset=utf-8'
              : 'text/plain;charset=utf-8',
      })
    );
  }

  const output = document.querySelector('#output');
  const container = document.querySelector('#generation-output');
  container.replaceChildren();
  output.hidden = false;
  document.querySelector('#download-output').hidden = !generation.blocks.length;
  document.querySelector('#log-warning').hidden =
    !cloudflare || !generation.blocks.some((b) => b.action === 'log');

  if (generation.errors.length) {
    const errors = element('ul', undefined, 'error');

    for (const error of generation.errors.slice(0, 3)) errors.append(element('li', error));

    container.append(
      element(
        'p',
        `Export stopped: ${generation.errors.length} issue${generation.errors.length === 1 ? '' : 's'} need attention. Adjust your selection or choose another format.`
      )
    );
    container.append(errors);
    if (generation.errors.length > 3) {
      const remaining = element('details');
      remaining.append(element('summary', `Show ${generation.errors.length - 3} more issues`));

      const list = element('ul', undefined, 'error');

      for (const error of generation.errors.slice(3)) list.append(element('li', error));

      remaining.append(list);
      container.append(remaining);
    }
  }

  for (const block of generation.blocks) {
    const section = element('section', undefined, 'output-block');
    const head = element('header');
    const title = element(
      'h4',
      cloudflare
        ? `Rule ${block.sequence} · ${block.action === 'log' ? 'Log' : 'Block'}`
        : `${provider.name} export`
    );
    const copy = element('button', cloudflare ? 'Copy expression' : 'Copy export');
    copy.type = 'button';
    copy.setAttribute(
      'aria-label',
      cloudflare ? `Copy expression ${block.sequence}` : `Copy ${provider.name} export`
    );

    const exportContent = cloudflare ? block.expression : downloadText(generation);
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(exportContent);
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Copy unavailable — select text below';
      }
    });

    head.append(title, copy);
    section.append(
      head,
      element(
        'p',
        `${block.ruleIds.length} source rules · ${exportContent.length} characters`,
        'muted'
      ),
      element('pre', exportContent)
    );
    container.append(section);
  }

  document.querySelector('#generation-status').textContent = generation.errors.length
    ? 'Generation stopped. Review the errors above.'
    : cloudflare
      ? `${generation.blocks.length} expressions generated.`
      : `${provider.name} export generated.`;
  output.focus();
}
