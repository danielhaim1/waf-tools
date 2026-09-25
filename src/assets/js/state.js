import { createSearchMatcher } from './search.js';
import { doesRuleMatchFilters } from './filters.js';

const STORAGE_KEY = 'waf-builder-state-v2';

export const PRESETS = {
  none: 'No rules selected.',
  conservative: 'High-confidence rules with low false-positive risk.',
  balanced: 'Recommended defaults and selected high-confidence review candidates.',
  aggressive: 'All rules, including those with higher false-positive risk.',
  custom: 'Your selection.',
};

export function createState() {
  return {
    categories: [],
    rules: [],
    rulesById: {},
    rulesByCategory: {},
    searchIndexByRuleId: new Map(),
    selectedRuleIds: new Set(),
    preset: 'balanced',
    platform: 'cloudflare',
    modsecurityIdBase: 1000000,
    searchQuery: '',
    filters: { severities: new Set(), selection: 'all', reviewOnly: false },
    generation: null,
  };
}

function persistState(state) {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        preset: state.preset,
        selectedRuleIds: [...state.selectedRuleIds],
      })
    );
  } catch {
    // Keep selection usable when browser storage is unavailable.
  }
}

export function presetSelection(rule, preset) {
  const { confidence, false_positive_risk: risk } = rule.risk;
  const action = rule.action.recommended;
  const supportedAction = ['block', 'challenge', 'log'].includes(action);
  if (preset === 'conservative') return confidence === 'high' && risk === 'low' && supportedAction;
  if (preset === 'balanced') {
    return (
      rule.ui?.default_selected === true ||
      rule.ui?.recommended === true ||
      (['block', 'challenge'].includes(action) &&
        risk === 'low' &&
        ['high', 'medium'].includes(confidence)) ||
      (supportedAction && risk === 'medium' && confidence === 'high')
    );
  }
  return preset === 'aggressive';
}

export function hydrateState(state, model) {
  Object.assign(state, model);
  state.searchIndexByRuleId.clear();
  state.generation = null;

  const categoriesById = new Map(state.categories.map((category) => [category.id, category]));

  for (const rule of state.rules) {
    const category = categoriesById.get(rule.categoryId);
    state.searchIndexByRuleId.set(
      rule.id,
      [
        rule.id,
        rule.categoryId,
        rule.name,
        rule.notes,
        rule.description,
        category.name,
        rule.detection.pattern,
        rule.detection.location,
        rule.detection.match,
        ...Object.values(rule.risk),
        rule.action.recommended,
        ...Object.values(rule.applicability || {}).flat(),
        ...Object.values(rule.references || {}).flat(),
        ...(rule.tags || []),
      ]
        .join(' ')
        .toLowerCase()
    );
  }

  let saved;

  try {
    saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    // Ignore unreadable or malformed saved selections.
  }

  if (saved && Object.hasOwn(PRESETS, saved.preset) && Array.isArray(saved.selectedRuleIds)) {
    state.preset = saved.preset;
    state.selectedRuleIds = new Set(
      saved.selectedRuleIds.filter((id) => Object.hasOwn(state.rulesById, id))
    );
  } else {
    applyPreset(state, 'balanced');
  }
}

export function applyPreset(state, preset) {
  if (!Object.hasOwn(PRESETS, preset)) return;
  state.preset = preset;
  if (preset !== 'custom')
    state.selectedRuleIds = new Set(
      state.rules.filter((r) => presetSelection(r, preset)).map((r) => r.id)
    );
  state.generation = null;
  persistState(state);
}

export function setRuleSelection(state, ids, selected) {
  for (const id of ids) {
    if (!Object.hasOwn(state.rulesById, id)) continue;
    if (selected) state.selectedRuleIds.add(id);
    else state.selectedRuleIds.delete(id);
  }

  state.preset = 'custom';
  state.generation = null;
  persistState(state);
}

export function filteredRules(state) {
  const matchesSearch = createSearchMatcher(state.searchQuery);

  return state.rules.filter(
    (rule) =>
      matchesSearch(state.searchIndexByRuleId.get(rule.id) ?? '') &&
      doesRuleMatchFilters(rule, state.selectedRuleIds, state.filters)
  );
}

export function ruleRequiresReview(rule) {
  return ['medium', 'high'].includes(rule.risk.false_positive_risk);
}
