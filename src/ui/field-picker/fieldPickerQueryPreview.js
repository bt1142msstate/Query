import { QueryChangeManager, QueryStateReaders, getBaseFieldName } from '../../core/queryState.js';
import { mapFieldOperatorToUiCond } from '../../features/filters/queryPayload.js';
import { fieldDefs, isFieldBackendFilterable, isFieldBuildable } from '../../features/filters/fieldDefs.js';
import { FormModeControls as formModeControls } from '../form-mode/formModeControls.js';

export function fieldMatchesBase(fieldName, targetField) {
  return getBaseFieldName(fieldName) === getBaseFieldName(targetField);
}

export function createQueryFilterPreview(container, fieldName, context = {}) {
  const controls = formModeControls;
  if (
    !container
    || !fieldDefs
    || !controls
    || typeof controls.createGeneratedInputSpec !== 'function'
    || typeof controls.createControl !== 'function'
    || typeof controls.createFieldRow !== 'function'
  ) {
    return null;
  }

  const fieldDef = fieldDefs.get(fieldName);
  if (isFieldBuildable(fieldDef)) {
    return null;
  }

  if (!fieldDef || (typeof isFieldBackendFilterable === 'function' && !isFieldBackendFilterable(fieldDef))) {
    return null;
  }

  const activeFilterGroup = QueryStateReaders.getFilterGroupForField(fieldName);
  const existingFilter = Array.isArray(activeFilterGroup?.filters) && activeFilterGroup.filters.length > 0
    ? activeFilterGroup.filters[0]
    : null;
  const draftPreviewState = context.previewState && context.previewState.fieldName === fieldName
    ? context.previewState
    : null;
  const previewInputSpec = controls.createGeneratedInputSpec(
    fieldName,
    [],
    baseKey => String(baseKey || 'field'),
    normalizeQueryPreviewOperator
  );

  if (!previewInputSpec) {
    return null;
  }

  previewInputSpec.operator = normalizeQueryPreviewOperator(
    fieldDef,
    (draftPreviewState && draftPreviewState.operator)
      || (existingFilter && existingFilter.cond)
      || previewInputSpec.operator
      || 'equals'
  );
  assignQueryPreviewDefaultValues(
    previewInputSpec,
    draftPreviewState
      ? draftPreviewState.values
      : readQueryPreviewFilterValues(existingFilter),
    fieldDef
  );

  let control = null;
  let previewRow = null;

  function getPreviewState() {
    const values = control && typeof control.getFormValues === 'function'
      ? control.getFormValues()
      : getQueryPreviewDefaultValues(previewInputSpec);
    return {
      fieldName,
      operator: previewInputSpec.operator,
      values: Array.isArray(values) ? values.map(value => String(value ?? '').trim()) : []
    };
  }

  function renderPreviewControl() {
    const activeFilterGroup = QueryStateReaders.getFilterGroupForField(fieldName);
    const isCurrentlyFiltered = Array.isArray(activeFilterGroup?.filters) && activeFilterGroup.filters.length > 0;

    control = controls.createControl(
      fieldDef,
      previewInputSpec,
      getQueryPreviewDefaultValues(previewInputSpec),
      previewInputSpec.operator,
      normalizeQueryPreviewOperator
    );
    previewRow = controls.createFieldRow({
      inputSpec: previewInputSpec,
      fieldDef,
      control,
      normalizeOperatorForField: normalizeQueryPreviewOperator,
      removeSpecInputByKey: () => {
        QueryChangeManager.removeFilter(fieldName, {
          removeAll: true,
          source: 'SharedFieldPicker.previewRemove'
        });
        if (typeof context.onRemoveFilter === 'function') {
          context.onRemoveFilter();
        }
      },
      rebuildFormCardFromSpec: () => {},
      captureCurrentControlDefaults: () => {},
      showRemoveButton: true,
      onOperatorChange: nextOperator => {
        const previousValues = getPreviewState().values;
        previewInputSpec.operator = normalizeQueryPreviewOperator(fieldDef, nextOperator);
        assignQueryPreviewDefaultValues(previewInputSpec, previousValues, fieldDef);
        renderPreviewControl();
      }
    });

    const removeBtn = previewRow.querySelector('.form-mode-field-remove');
    if (removeBtn) {
      if (!isCurrentlyFiltered) {
        removeBtn.hidden = true;
        removeBtn.setAttribute('aria-hidden', 'true');
        removeBtn.tabIndex = -1;
        removeBtn.style.display = 'none';
      } else {
        removeBtn.hidden = false;
        removeBtn.removeAttribute('aria-hidden');
        removeBtn.removeAttribute('tabindex');
        removeBtn.style.display = '';
      }
    }

    previewRow.classList.add('form-mode-field-picker-preview-row');
    container.replaceChildren(previewRow);

    const notifyPreviewChange = typeof context.onPreviewChange === 'function'
      ? context.onPreviewChange
      : null;
    if (notifyPreviewChange) {
      const emitPreviewChange = () => {
        window.setTimeout(() => notifyPreviewChange(getPreviewState()), 0);
      };
      ['input', 'change', 'click'].forEach(eventName => {
        previewRow.addEventListener(eventName, emitPreviewChange);
      });
    }
  }

  renderPreviewControl();

  return {
    getState: getPreviewState,
    cleanup() {
      if (control && typeof control._cleanupPopup === 'function') {
        control._cleanupPopup();
      }
    }
  };
}

export function applyQueryPreviewFilterState(fieldName, previewState) {
  if (!fieldName || !previewState || typeof QueryChangeManager.setQueryState !== 'function') {
    return;
  }

  const rawValues = Array.isArray(previewState.values)
    ? previewState.values.map(value => String(value ?? '').trim())
    : [];
  const isBetween = String(previewState.operator || '').trim().toLowerCase() === 'between';
  const hasActiveValue = isBetween
    ? Boolean(rawValues[0] || rawValues[1])
    : rawValues.some(Boolean);

  if (!hasActiveValue) {
    if (typeof QueryChangeManager.removeFilter === 'function') {
      QueryChangeManager.removeFilter(fieldName, {
        removeAll: true,
        source: 'SharedFieldPicker.previewUpdateEmpty'
      });
    }
    return;
  }

  const validValues = isBetween ? rawValues.slice(0, 2) : rawValues.filter(Boolean);
  const nextActiveFilters = JSON.parse(JSON.stringify(QueryStateReaders.getActiveFilters?.() || {}));
  nextActiveFilters[fieldName] = {
    filters: [{
      cond: previewState.operator,
      val: isBetween
        ? `${validValues[0] || ''}|${validValues[1] || ''}`
        : validValues.join(',')
    }]
  };

  QueryChangeManager.setQueryState({
    activeFilters: nextActiveFilters
  }, {
    source: 'SharedFieldPicker.previewUpdate'
  });
}

function normalizeQueryPreviewOperator(fieldDef, operator) {
  const normalized = mapFieldOperatorToUiCond(operator);

  if (!fieldDef || !fieldDef.type) {
    return normalized;
  }

  if (fieldDef.type === 'date') {
    if (normalized === 'greater') return 'after';
    if (normalized === 'less') return 'before';
    if (normalized === 'greater_or_equal') return 'on_or_after';
    if (normalized === 'less_or_equal') return 'on_or_before';
  }

  return normalized;
}

function splitQueryPreviewValues(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map(value => String(value ?? '').trim()).filter(Boolean);
  }

  return String(rawValue || '')
    .split(/[\n,]+/)
    .map(value => value.trim())
    .filter(Boolean);
}

function readQueryPreviewFilterValues(filter) {
  if (!filter) {
    return [];
  }

  if (String(filter.cond || '').toLowerCase() === 'between') {
    return String(filter.val || '')
      .split('|')
      .map(value => value.trim())
      .filter(Boolean)
      .slice(0, 2);
  }

  return splitQueryPreviewValues(filter.val || '');
}

function getQueryPreviewDefaultValues(inputSpec) {
  if (!inputSpec) {
    return [];
  }

  if (inputSpec.operator === 'between') {
    return Array.isArray(inputSpec.defaultValue)
      ? inputSpec.defaultValue.slice(0, 2).map(value => String(value ?? ''))
      : ['', ''];
  }

  if (Array.isArray(inputSpec.defaultValue)) {
    return inputSpec.defaultValue.map(value => String(value ?? '')).filter(Boolean);
  }

  if (inputSpec.defaultValue === undefined || inputSpec.defaultValue === null || inputSpec.defaultValue === '') {
    return [];
  }

  return splitQueryPreviewValues(inputSpec.defaultValue);
}

function assignQueryPreviewDefaultValues(inputSpec, values, fieldDef) {
  if (!inputSpec) {
    return;
  }

  const normalizedValues = Array.isArray(values)
    ? values.map(value => String(value ?? '').trim())
    : [];

  if (inputSpec.operator === 'between') {
    inputSpec.defaultValue = [normalizedValues[0] || '', normalizedValues[1] || ''];
    inputSpec.multiple = false;
    return;
  }

  const supportsMultiple = Boolean(
    inputSpec.multiple
    || (fieldDef && fieldDef.allowValueList)
    || (fieldDef && fieldDef.multiSelect)
    || normalizedValues.filter(Boolean).length > 1
  );

  inputSpec.multiple = supportsMultiple;
  inputSpec.defaultValue = supportsMultiple
    ? normalizedValues.filter(Boolean)
    : (normalizedValues[0] || '');
}
