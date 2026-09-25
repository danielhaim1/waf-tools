import { assessCompatibility, EXPORTERS } from './exporters.js';

export function renderCompatibility(state) {
  const selected = state.rules.filter((r) => state.selectedRuleIds.has(r.id));
  const { compatible, excluded, errors } = assessCompatibility(selected, state.platform, {
    idBase: state.modsecurityIdBase,
  });
  document.querySelector('#compatibility-summary').textContent = !selected.length
    ? 'Select rules to check export compatibility.'
    : `${compatible.length} of ${selected.length} selected rules can be exported for ${EXPORTERS[state.platform].name}${excluded.length ? `; ${excluded.length} need review.` : '.'}`;

  const error = document.querySelector('#compatibility-errors');
  error.hidden = !errors.length;
  error.textContent = errors.join(' ');

  const details = document.querySelector('#excluded-rules');
  details.hidden = !excluded.length;

  const groups = new Map();

  for (const rule of excluded) {
    if (!groups.has(rule.reason)) groups.set(rule.reason, []);
    groups.get(rule.reason).push(rule);
  }

  const container = document.querySelector('#excluded-rule-groups');
  container.replaceChildren();

  for (const [reason, rules] of groups) {
    const heading = document.createElement('p');
    heading.textContent = `${rules.length} rules: ${reason}`;

    const list = document.createElement('ul');

    for (const rule of rules) {
      const item = document.createElement('li');
      item.textContent = rule.name;

      const id = document.createElement('small');
      id.textContent = rule.id;
      item.append(id);
      list.append(item);
    }

    container.append(heading, list);
  }

  const partial = document.querySelector('#export-compatible');
  partial.hidden = !excluded.length;
  partial.disabled = !compatible.length || !!errors.length;
  partial.textContent = `Export ${compatible.length} compatible rules`;

  const generate = document.querySelector('#generate-rules');
  generate.disabled = !compatible.length || !!errors.length;
  generate.dataset.compatibleOnly = String(excluded.length > 0);
  generate.textContent = excluded.length
    ? `Export ${compatible.length} Compatible Rules`
    : state.platform === 'cloudflare'
      ? 'Generate Expressions'
      : 'Generate Export';

  const notice = document.querySelector('#export-exclusion-notice');
  notice.hidden = !excluded.length;
  notice.textContent = `${excluded.length} selected rules will be excluded.`;
  document.querySelector('#modsecurity-settings').hidden = state.platform !== 'modsecurity';
}
