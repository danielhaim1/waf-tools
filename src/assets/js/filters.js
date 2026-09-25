function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .trim();
}

export function extractFilterValues(form) {
  const data = new FormData(form);

  return {
    severities: data.getAll('severity').map(normalize).filter(Boolean),
    selection: data.get('selection') || 'all',
    reviewOnly: data.get('review-only') === 'on',
  };
}

export function doesRuleMatchFilters(rule, selectedRuleIds, filters) {
  const ruleSeverity = normalize(rule?.risk?.severity);
  const isSelected = selectedRuleIds instanceof Set ? selectedRuleIds.has(rule.id) : false;

  if (filters.severities?.size && !filters.severities.has(ruleSeverity)) {
    return false;
  }

  const falsePositive = normalize(rule?.risk?.false_positive_risk);
  if (filters.reviewOnly && falsePositive !== 'medium' && falsePositive !== 'high') {
    return false;
  }

  if (filters.selection === 'selected' && !isSelected) {
    return false;
  }

  if (filters.selection === 'unselected' && isSelected) {
    return false;
  }

  return true;
}
