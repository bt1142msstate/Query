import { QueryChangeManager, QueryStateReaders } from '../../core/queryState.js';
import { OperatorLabels } from '../../core/formatting/operatorLabels.js';
import { showToastMessage } from '../../core/toast.js';
import { VisibilityUtils } from '../../core/visibility.js';
import { fieldDefs, isFieldBackendFilterable, isFieldBuildable } from '../../features/filters/fieldDefs.js';
import { FormModeControls as formModeControls } from '../form-mode/formModeControls.js';
import {
  assignQueryPreviewDefaultValues,
  getQueryPreviewDefaultValues,
  normalizeQueryPreviewOperator,
  readQueryPreviewFilterValues
} from '../field-picker/fieldPickerQueryPreview.js';

const EDITOR_RAISED_UI_KEY = 'query-filter-editor';

function cloneActiveFiltersSnapshot(activeFilters = {}) {
  return Object.fromEntries(
    Object.entries(activeFilters || {}).map(([field, data]) => [
      field,
      {
        filters: Array.isArray(data?.filters)
          ? data.filters.map(filter => ({
              cond: String(filter?.cond || ''),
              val: String(filter?.val || '')
            }))
          : []
      }
    ])
  );
}

function hasEditorValues(previewState) {
  const values = Array.isArray(previewState?.values)
    ? previewState.values.map(value => String(value ?? '').trim())
    : [];
  const operator = String(previewState?.operator || '').trim().toLowerCase();

  if (operator === 'between') {
    return Boolean(values[0] || values[1]);
  }

  return values.some(Boolean);
}

function buildFilterValueFromPreview(previewState) {
  const values = Array.isArray(previewState?.values)
    ? previewState.values.map(value => String(value ?? '').trim())
    : [];
  const operator = String(previewState?.operator || '').trim().toLowerCase();

  if (operator === 'between') {
    return `${values[0] || ''}|${values[1] || ''}`;
  }

  return values.filter(Boolean).join(',');
}

function normalizeEditorIndex(filterIndex, filterCount) {
  const parsedIndex = Number.isInteger(filterIndex)
    ? filterIndex
    : Number.parseInt(String(filterIndex ?? ''), 10);

  if (!Number.isInteger(parsedIndex) || parsedIndex < 0 || parsedIndex >= filterCount) {
    return -1;
  }

  return parsedIndex;
}

function buildNextActiveFiltersForEditor(activeFilters, fieldName, filterIndex, previewState) {
  const normalizedField = String(fieldName || '').trim();
  const nextFilters = cloneActiveFiltersSnapshot(activeFilters);
  if (!normalizedField) {
    return nextFilters;
  }

  const fieldFilters = Array.isArray(nextFilters[normalizedField]?.filters)
    ? nextFilters[normalizedField].filters.slice()
    : [];
  const normalizedIndex = normalizeEditorIndex(filterIndex, fieldFilters.length);
  const hasValues = hasEditorValues(previewState);

  if (!hasValues) {
    if (normalizedIndex >= 0) {
      fieldFilters.splice(normalizedIndex, 1);
    }
  } else {
    const nextFilter = {
      cond: normalizeQueryPreviewOperator(fieldDefs?.get(normalizedField), previewState.operator || 'equals'),
      val: buildFilterValueFromPreview(previewState)
    };

    if (normalizedIndex >= 0) {
      fieldFilters[normalizedIndex] = nextFilter;
    } else {
      fieldFilters.push(nextFilter);
    }
  }

  if (fieldFilters.length > 0) {
    nextFilters[normalizedField] = { filters: fieldFilters };
  } else {
    delete nextFilters[normalizedField];
  }

  return nextFilters;
}

function createEditorInputSpec(fieldName, fieldDef, filter) {
  const inputSpec = formModeControls.createGeneratedInputSpec(
    fieldName,
    [],
    baseKey => String(baseKey || 'filter'),
    normalizeQueryPreviewOperator
  );

  if (!inputSpec) {
    return null;
  }

  inputSpec.label = fieldName;
  inputSpec.operator = normalizeQueryPreviewOperator(
    fieldDef,
    filter?.cond || inputSpec.operator || 'equals'
  );
  assignQueryPreviewDefaultValues(
    inputSpec,
    readQueryPreviewFilterValues(filter),
    fieldDef
  );

  return inputSpec;
}

function openQueryFilterEditor(fieldName, options = {}) {
  const normalizedField = String(fieldName || '').trim();
  const fieldDef = fieldDefs?.get(normalizedField);
  if (
    !normalizedField
    || !fieldDef
    || isFieldBuildable(fieldDef)
    || (typeof isFieldBackendFilterable === 'function' && !isFieldBackendFilterable(fieldDef))
  ) {
    showToastMessage(`${normalizedField || 'This field'} cannot be filtered.`, 'warning');
    return false;
  }

  const activeFilterGroup = QueryStateReaders.getFilterGroupForField(normalizedField);
  const filters = Array.isArray(activeFilterGroup?.filters) ? activeFilterGroup.filters : [];
  let filterIndex = normalizeEditorIndex(options.filterIndex, filters.length);
  const existingFilter = filterIndex >= 0 ? filters[filterIndex] : null;
  const inputSpec = createEditorInputSpec(normalizedField, fieldDef, existingFilter);
  if (!inputSpec) {
    showToastMessage(`${normalizedField} cannot be filtered.`, 'warning');
    return false;
  }

  let control = null;
  let row = null;
  let applyTimer = 0;
  let closed = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'form-mode-field-picker-backdrop query-filter-editor-backdrop hidden';
  backdrop.hidden = true;

  const modal = document.createElement('div');
  modal.className = 'form-mode-field-picker-modal form-mode-field-picker-modal--compact query-filter-editor-modal hidden';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'query-filter-editor-title');

  modal.innerHTML = `
    <div class="form-mode-field-picker-header query-filter-editor-header">
      <div>
        <span class="form-mode-field-picker-kicker">Filter</span>
        <h3 id="query-filter-editor-title" class="form-mode-field-picker-title"></h3>
      </div>
      <button type="button" class="form-mode-field-picker-close panel-close-button" aria-label="Close filter editor">×</button>
    </div>
    <div class="form-mode-field-picker-body query-filter-editor-body">
      <div class="query-filter-editor-control"></div>
    </div>
    <div class="form-mode-field-picker-footer query-filter-editor-footer">
      <span class="query-filter-editor-status" aria-live="polite"></span>
      <div class="query-filter-editor-actions">
        <button type="button" class="form-mode-btn form-mode-btn-secondary query-filter-editor-remove">Remove</button>
        <button type="button" class="form-mode-btn form-mode-btn-primary query-filter-editor-done">Done</button>
      </div>
    </div>
  `;

  const closeButton = modal.querySelector('.form-mode-field-picker-close');
  const removeButton = modal.querySelector('.query-filter-editor-remove');
  const doneButton = modal.querySelector('.query-filter-editor-done');
  const statusEl = modal.querySelector('.query-filter-editor-status');
  const controlHost = modal.querySelector('.query-filter-editor-control');
  const titleEl = modal.querySelector('#query-filter-editor-title');
  if (titleEl) {
    titleEl.textContent = normalizedField;
  }

  function getEditorState() {
    const values = control && typeof control.getFormValues === 'function'
      ? control.getFormValues()
      : getQueryPreviewDefaultValues(inputSpec);

    return {
      fieldName: normalizedField,
      operator: inputSpec.operator,
      values: Array.isArray(values) ? values.map(value => String(value ?? '').trim()) : []
    };
  }

  function applyEditorState(source = 'QueryFilterEditor.updateFilter') {
    const activeFilters = QueryStateReaders.getActiveFilters?.() || {};
    const existingCount = Array.isArray(activeFilters[normalizedField]?.filters)
      ? activeFilters[normalizedField].filters.length
      : 0;
    const editorState = getEditorState();
    const nextFilters = buildNextActiveFiltersForEditor(
      activeFilters,
      normalizedField,
      filterIndex,
      editorState
    );

    QueryChangeManager.replaceActiveFilters(nextFilters, { source });
    if (filterIndex < 0 && hasEditorValues(editorState)) {
      filterIndex = existingCount;
    } else if (filterIndex >= 0 && !hasEditorValues(editorState)) {
      filterIndex = -1;
    }
    removeButton.hidden = filterIndex < 0;
    if (statusEl) {
      statusEl.textContent = hasEditorValues(editorState)
        ? `${OperatorLabels.get(inputSpec.operator)} filter updated.`
        : 'Empty filter removed.';
    }
  }

  function scheduleApply() {
    window.clearTimeout(applyTimer);
    applyTimer = window.setTimeout(() => applyEditorState(), 80);
  }

  function renderControl() {
    if (control && typeof control._cleanupPopup === 'function') {
      control._cleanupPopup();
    }

    control = formModeControls.createControl(
      fieldDef,
      inputSpec,
      getQueryPreviewDefaultValues(inputSpec),
      inputSpec.operator,
      normalizeQueryPreviewOperator
    );
    row = formModeControls.createFieldRow({
      inputSpec,
      fieldDef,
      control,
      normalizeOperatorForField: normalizeQueryPreviewOperator,
      removeSpecInputByKey: () => {},
      rebuildFormCardFromSpec: () => {},
      captureCurrentControlDefaults: () => {},
      showRemoveButton: false,
      onOperatorChange: nextOperator => {
        const previousValues = getEditorState().values;
        inputSpec.operator = normalizeQueryPreviewOperator(fieldDef, nextOperator);
        assignQueryPreviewDefaultValues(inputSpec, previousValues, fieldDef);
        renderControl();
        scheduleApply();
      }
    });
    row.classList.add('query-filter-editor-row');
    ['input', 'change', 'click'].forEach(eventName => {
      row.addEventListener(eventName, scheduleApply);
    });
    controlHost.replaceChildren(row);
  }

  function cleanup() {
    if (closed) return;
    closed = true;
    window.clearTimeout(applyTimer);
    if (control && typeof control._cleanupPopup === 'function') {
      control._cleanupPopup();
    }
    VisibilityUtils.hide([backdrop, modal], {
      ariaHidden: true,
      raisedUiKey: EDITOR_RAISED_UI_KEY
    });
    backdrop.remove();
    modal.remove();
    document.removeEventListener('keydown', onKeyDown);
  }

  function removeFilter() {
    const nextFilters = buildNextActiveFiltersForEditor(
      QueryStateReaders.getActiveFilters?.() || {},
      normalizedField,
      filterIndex,
      { fieldName: normalizedField, operator: inputSpec.operator, values: [] }
    );
    QueryChangeManager.replaceActiveFilters(nextFilters, { source: 'QueryFilterEditor.removeFilter' });
    showToastMessage(`${normalizedField} filter removed.`, 'info');
    cleanup();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      cleanup();
    }
  }

  renderControl();
  removeButton.hidden = filterIndex < 0;
  removeButton.addEventListener('click', removeFilter);
  doneButton.addEventListener('click', cleanup);
  closeButton.addEventListener('click', cleanup);
  backdrop.addEventListener('click', cleanup);
  document.addEventListener('keydown', onKeyDown);

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  VisibilityUtils.show([backdrop, modal], {
    ariaHidden: false,
    raisedUiKey: EDITOR_RAISED_UI_KEY
  });
  window.requestAnimationFrame(() => {
    if (control && typeof control.focusInput === 'function') {
      control.focusInput();
    }
  });

  return true;
}

export {
  buildNextActiveFiltersForEditor,
  openQueryFilterEditor
};
