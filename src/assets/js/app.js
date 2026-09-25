import { loadExplorerModel } from './data-loader.js';
import {
  createState,
  hydrateState,
  applyPreset,
  setRuleSelection,
  filteredRules,
} from './state.js';
import { extractFilterValues } from './filters.js';
import { mountCatalog, mountExportOptions, renderSelection, renderOutput } from './render.js';
import { EXPORTERS, generateExport } from './exporters.js';
import { renderCompatibility } from './compatibility.js';

const state = createState();
const form = document.querySelector('#discovery-toolbar');
const search = document.querySelector('#rule-search');
const catalog = document.querySelector('#catalog');
let nodes;
const render = () => {
  renderSelection(state, nodes);
  renderCompatibility(state);
};

function readFilters() {
  const values = extractFilterValues(form);
  state.filters = { ...values, severities: new Set(values.severities) };
}

async function bootstrap() {
  try {
    hydrateState(state, await loadExplorerModel());
    nodes = mountCatalog(state, catalog);

    const platformOptions = mountExportOptions(state.platform);
    const updatePlatform = () => {
      document.querySelector('#platform-description').textContent = EXPORTERS[state.platform].note;
    };
    updatePlatform();
    platformOptions.addEventListener('change', (event) => {
      state.platform = event.target.value;
      state.generation = null;
      updatePlatform();
      render();
    });

    form.addEventListener('submit', (event) => event.preventDefault());

    search.addEventListener('input', () => {
      state.searchQuery = search.value;
      renderSelection(state, nodes);
    });

    form.addEventListener('change', (event) => {
      if (event.target.id === 'preset-selector') {
        applyPreset(state, event.target.value);
        render();
      } else {
        readFilters();
        renderSelection(state, nodes);
      }
    });

    document.querySelector('#reset-filters').addEventListener('click', () => {
      for (const control of form.querySelectorAll('input[type="checkbox"]'))
        control.checked = false;

      form.elements.selection.value = 'all';
      readFilters();
      renderSelection(state, nodes);
    });

    document.querySelector('#select-all-rules').addEventListener('change', (event) => {
      setRuleSelection(
        state,
        filteredRules(state).map((r) => r.id),
        event.target.checked
      );
      render();
    });

    catalog.addEventListener('change', (event) => {
      const { ruleId, categoryId } = event.target.dataset;
      if (ruleId) setRuleSelection(state, [ruleId], event.target.checked);
      else if (categoryId) {
        setRuleSelection(
          state,
          state.rulesByCategory[categoryId].map((r) => r.id),
          event.target.checked
        );
        // Reveal the category selection even when search or selection filters hid some rules.
        search.value = '';
        state.searchQuery = '';
        form.elements.selection.value = 'all';
        form.elements['review-only'].checked = false;
        readFilters();
      } else return;
      render();
    });

    const generate = (compatibleOnly = false) => {
      state.generation = generateExport(
        state.rules.filter((r) => state.selectedRuleIds.has(r.id)),
        state.platform,
        { compatibleOnly, idBase: state.modsecurityIdBase }
      );
      renderOutput(state.generation);
    };
    document
      .querySelector('#generate-rules')
      .addEventListener('click', (event) =>
        generate(event.currentTarget.dataset.compatibleOnly === 'true')
      );

    document.querySelector('#export-compatible').addEventListener('click', () => generate(true));

    document.querySelector('#modsecurity-id-base').addEventListener('input', (event) => {
      state.modsecurityIdBase = event.target.valueAsNumber;
      state.generation = null;
      render();
    });

    document.querySelector('#load-status').hidden = true;
    document.querySelector('#builder').hidden = false;
    render();
  } catch (error) {
    document.querySelector('#load-status').textContent = `Unable to load rules: ${error.message}`;
  }
}
bootstrap();
