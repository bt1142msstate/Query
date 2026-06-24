import { onDOMReady } from '../../../core/domReady.js';
import { appServices } from '../tableServices.js';
import { registerAppUiActionDependencies } from '../../../core/appUiActions.js';
import { OperatorLabels } from '../../../core/formatting/operatorLabels.js';
import { QueryStateReaders } from '../tableQueryState.js';
import { QueryStateSubscriptions } from '../../../core/queryStateSubscriptions.js';
import { showToastMessage } from '../tableToast.js';
import { MoneyUtils } from '../../../core/formatting/moneyUtils.js';
import { ValueFormatting } from '../../../core/formatting/valueFormatting.js';
import { VisibilityUtils } from '../../../core/visibility.js';
import { SelectorControls } from '../../../ui/controls/selectorControls.js';
import { CustomDatePicker } from '../../../ui/controls/customDatePicker.js';
import { escapeHtml } from '../../../core/formatting/html.js';
import { getPostFilterDateValidationMessage, postFilterDateOperatorAllowsNever } from './postFilterDateValidation.js';
import { formatPostFilterValue } from './postFilterValueFormatting.js';
import { createPostFilterStreamedEqualsSelector } from './postFilterStreamedEqualsSelector.js';
import { isNoValuePostFilterOperator, normalizeNoValuePostFilterOperator } from './postFilterLogic.js';
let PostFilterSystem;
(function() {
  let equalsValueControl = null, equalsValueControlField = '';
  const { getDisplayedFields } = QueryStateReaders, services = appServices;
  function getElements() {
    return {
      button: document.getElementById('post-filter-btn'),
      overlay: document.getElementById('post-filter-overlay'),
      backdrop: document.getElementById('post-filter-overlay-backdrop'),
      closeBtn: document.getElementById('post-filter-overlay-close'),
      doneBtn: document.getElementById('post-filter-done-btn'),
      clearBtn: document.getElementById('post-filter-clear-btn'),
      fieldSelect: document.getElementById('post-filter-field'),
      operatorSelect: document.getElementById('post-filter-operator'),
      logicSelect: document.getElementById('post-filter-logic'),
      valueInput: document.getElementById('post-filter-value'),
      valueInput2: document.getElementById('post-filter-value-2'),
      valuePickerHost: document.getElementById('post-filter-value-picker-host'),
      betweenLabel: document.getElementById('post-filter-between-label'),
      addBtn: document.getElementById('post-filter-add-btn'),
      summaryRows: document.getElementById('post-filter-summary-rows'),
      summaryBaseRows: document.getElementById('post-filter-summary-base-rows'),
      summaryCount: document.getElementById('post-filter-summary-count'),
      list: document.getElementById('post-filter-list'),
      empty: document.getElementById('post-filter-empty')
    };
  }
  function getValueInputHost(input) {
    if (CustomDatePicker && typeof CustomDatePicker.getInputHost === 'function') {
      return CustomDatePicker.getInputHost(input);
    }

    return input || null;
  }

  function setValueInputVisible(input, visible) {
    if (CustomDatePicker && typeof CustomDatePicker.setInputVisibility === 'function') {
      CustomDatePicker.setInputVisibility(input, visible);
    } else {
      const host = getValueInputHost(input);
      if (!host) {
        return;
      }
      host.style.display = visible ? '' : 'none';
    }

    if (input instanceof HTMLElement) {
      input.classList.toggle('hidden', !visible);
    }
  }

  function getBlankSentinel() {
    return services.table?.postFilterBlankValue || '__QUERY_POST_FILTER_BLANK__';
  }

  function isBlankSentinel(value) {
    return String(value || '') === getBlankSentinel();
  }

  function getAvailableFields() {
    const displayedFields = getDisplayedFields();
    return services.getPostFilterActionFields(displayedFields);
  }

  function getFieldType(fieldName) {
    return ValueFormatting.getFieldType(fieldName);
  }

  function getNumberFormat(fieldName) {
    return ValueFormatting.getNumberFormat(fieldName) || '';
  }

  function getOperatorOptions(fieldName) {
    const type = getFieldType(fieldName);
    const noValueOperators = ['is_blank', 'has_value', 'has_multiple_values', 'does_not_have_multiple_values'];

    if (type === 'number' || type === 'money') {
      return ['greater', 'less', 'equals', 'does_not_equal', 'between', ...noValueOperators];
    }

    if (type === 'date') {
      return ['equals', 'does_not_equal', 'before', 'after', 'on_or_before', 'on_or_after', 'between', ...noValueOperators];
    }

    if (type === 'boolean') {
      return ['equals', 'does_not_equal', ...noValueOperators];
    }

    return ['contains', 'starts', 'equals', 'does_not_equal', ...noValueOperators];
  }

  function usesValuePickerOperator(cond) {
    const normalized = String(cond || '').trim().toLowerCase();
    return normalized === 'equals' || normalized === 'does_not_equal';
  }

  function formatFilterValue(filter, fieldName) {
    return formatPostFilterValue(filter, fieldName, {
      getFieldType,
      isBlankValue: isBlankSentinel
    });
  }

  function destroyEqualsValueControl() {
    if (equalsValueControl && typeof equalsValueControl.destroy === 'function') {
      equalsValueControl.destroy();
    } else if (equalsValueControl && typeof equalsValueControl._cleanupPopup === 'function') {
      equalsValueControl._cleanupPopup();
    }

    equalsValueControl = null;
    equalsValueControlField = '';
  }

  function createStreamedEqualsSelector(fieldName) {
    const baseViewData = services.table?.baseViewData;
    const activeOperator = String(getElements().operatorSelect?.value || 'equals').trim().toLowerCase();
    return createPostFilterStreamedEqualsSelector({
      fieldName,
      baseViewData,
      activeOperator,
      getBlankSentinel,
      getCurrentOperatorValues,
      getFieldType,
      isBlankSentinel,
      formatFilterValue,
      document,
      window
    });
  }

  function getPostFilterSnapshot() {
    return services.getPostFilterState();
  }

  function getCurrentOperatorValues(fieldName, cond = 'equals') {
    const snapshot = getPostFilterSnapshot();
    const fieldFilters = Array.isArray(snapshot[fieldName]?.filters) ? snapshot[fieldName].filters : [];
    const targetFilter = fieldFilters.find(filter => String(filter?.cond || '').toLowerCase() === String(cond || '').toLowerCase());

    if (!targetFilter) {
      return [];
    }

    if (Array.isArray(targetFilter.vals) && targetFilter.vals.length) {
      return targetFilter.vals.map(value => String(value || '')).filter(value => value || isBlankSentinel(value));
    }

    const scalarValue = String(targetFilter.val || '');
    return scalarValue || isBlankSentinel(scalarValue) ? [scalarValue] : [];
  }

  function getFieldLogic(fieldName) {
    const snapshot = getPostFilterSnapshot();
    return String(snapshot[fieldName]?.logic || 'all').toLowerCase() === 'any' ? 'any' : 'all';
  }

  function getFieldRuleCount(fieldName) {
    const snapshot = getPostFilterSnapshot();
    return Array.isArray(snapshot[fieldName]?.filters) ? snapshot[fieldName].filters.length : 0;
  }

  function syncLogicSelect() {
    const elements = getElements();
    if (!elements.fieldSelect || !elements.logicSelect) {
      return;
    }

    const fieldName = String(elements.fieldSelect.value || '').trim();
    const ruleCount = getFieldRuleCount(fieldName);
    const showLogic = ruleCount > 0;
    const logicShell = elements.logicSelect.closest('.post-filter-field');

    elements.logicSelect.value = getFieldLogic(fieldName);
    if (logicShell) {
      logicShell.classList.toggle('hidden', !showLogic);
    }
  }

  function getActiveFilterCount(snapshot = getPostFilterSnapshot()) {
    return Object.values(snapshot).reduce((total, data) => total + (Array.isArray(data?.filters) ? data.filters.length : 0), 0);
  }

  function updateToolbarButton() {
    const { button } = getElements();
    if (!button) return;

    const hasFilters = services.hasPostFilters();
    button.classList.toggle('table-toolbar-btn-active', Boolean(hasFilters));
  }

  function syncOperatorOptions() {
    const elements = getElements();
    if (!elements.fieldSelect || !elements.operatorSelect) return;

    const selectedField = elements.fieldSelect.value;
    const options = getOperatorOptions(selectedField);
    const previousValue = elements.operatorSelect.value;
    elements.operatorSelect.innerHTML = options.map(option => `<option value="${option}">${OperatorLabels.get(option)}</option>`).join('');

    if (options.includes(previousValue)) {
      elements.operatorSelect.value = previousValue;
    }

    syncLogicSelect();
    syncValueInputs();
  }

  function buildEqualsValueControl(fieldName) {
    const elements = getElements();
    if (!elements.valuePickerHost) {
      return;
    }

    destroyEqualsValueControl();
    elements.valuePickerHost.innerHTML = '';

    const selector = createStreamedEqualsSelector(fieldName);
    const control = SelectorControls.createPopupListControl(selector, `${fieldName} values`, 'Choose one or more loaded values...');

    control.classList.add('post-filter-value-control');
    control.destroy = function() {
      if (typeof selector.destroy === 'function') {
        selector.destroy();
      }
      if (typeof control._cleanupPopup === 'function') {
        control._cleanupPopup();
      }
    };

    elements.valuePickerHost.appendChild(control);
    equalsValueControl = control;
    equalsValueControlField = fieldName;
  }

  function syncValuePicker() {
    const elements = getElements();
    if (!elements.operatorSelect || !elements.fieldSelect || !elements.valuePickerHost || !elements.valueInput) {
      return;
    }

    const activeOperator = String(elements.operatorSelect.value || '').trim().toLowerCase();
    const isNoValueOperator = isNoValuePostFilterOperator(activeOperator);
    const isValuePickerOperator = !isNoValueOperator && usesValuePickerOperator(activeOperator);
    const fieldName = String(elements.fieldSelect.value || '').trim();

    elements.valuePickerHost.classList.toggle('hidden', !isValuePickerOperator);
    setValueInputVisible(elements.valueInput, !isValuePickerOperator && !isNoValueOperator);

    if (!isValuePickerOperator || !fieldName) {
      if (isBlankSentinel(elements.valueInput.value)) {
        elements.valueInput.value = '';
      }
      elements.valuePickerHost.innerHTML = '';
      destroyEqualsValueControl();
      return;
    }

    if (!equalsValueControl || equalsValueControlField !== fieldName) {
      buildEqualsValueControl(fieldName);
      return;
    }

    if (typeof equalsValueControl.setSelectedValues === 'function') {
      equalsValueControl.setSelectedValues(getCurrentOperatorValues(fieldName, activeOperator));
    }
  }

  function syncValueInputs() {
    const elements = getElements();
    if (!elements.valueInput || !elements.valueInput2 || !elements.operatorSelect || !elements.fieldSelect || !elements.betweenLabel) return;

    const fieldType = getFieldType(elements.fieldSelect.value);
    const numberFormat = getNumberFormat(elements.fieldSelect.value);
    const activeOperator = normalizeNoValuePostFilterOperator(elements.operatorSelect.value);
    const isBetween = activeOperator === 'between';
    const isNoValueOperator = isNoValuePostFilterOperator(activeOperator);
    const isDate = fieldType === 'date';
    const inputType = 'text';

    [elements.valueInput, elements.valueInput2].forEach(input => {
      if (!isDate) {
        const datePickerApi = input._customDatePickerApi;
        if (datePickerApi && typeof datePickerApi.destroy === 'function') {
          datePickerApi.destroy();
        }
      }

      input.type = inputType;
      input.step = fieldType === 'money' ? '0.01' : (fieldType === 'number' ? '1' : 'any');
      input.inputMode = isDate ? 'numeric' : (fieldType === 'money' ? 'decimal' : (fieldType === 'number' ? 'numeric' : 'text'));
      input.placeholder = isDate ? 'M/D/YYYY' : 'Value';
      if (fieldType === 'money') {
        MoneyUtils.configureInputBehavior(input, true);
      } else if (fieldType === 'number') {
        MoneyUtils.configureInputBehavior(input, numberFormat === 'year' ? false : { kind: 'integer' });
      } else {
        MoneyUtils.configureInputBehavior(input, false);
      }

      if (isDate && CustomDatePicker?.enhanceInput) {
        CustomDatePicker.enhanceInput(input, {
          variant: 'filter',
          enabled: true,
          allowNever: postFilterDateOperatorAllowsNever(activeOperator),
          placeholder: 'M/D/YYYY'
        });
      } else if (!isDate) {
        input.removeAttribute('pattern');
        if (input.dataset.errorMsg === 'Use M/D/YYYY' || input.dataset.errorMsg === 'Enter a date or Never') {
          delete input.dataset.errorMsg;
        }
      }
    });

    setValueInputVisible(elements.valueInput2, isBetween && !isNoValueOperator);
    elements.betweenLabel.classList.toggle('hidden', !isBetween);
    syncValuePicker();
  }

  function populateFieldOptions() {
    const elements = getElements();
    if (!elements.fieldSelect) return;

    const fields = getAvailableFields();
    const currentValue = elements.fieldSelect.value;
    elements.fieldSelect.innerHTML = fields.map(field => `<option value="${field}">${escapeHtml(field)}</option>`).join('');

    if (!fields.length) {
      elements.fieldSelect.innerHTML = '<option value="">No result fields available</option>';
      elements.fieldSelect.value = '';
    } else if (fields.includes(currentValue)) {
      elements.fieldSelect.value = currentValue;
    }

    syncOperatorOptions();
  }

  function renderSummary() {
    const elements = getElements();
    if (!elements.summaryRows || !elements.summaryBaseRows || !elements.summaryCount) return;

    const stats = services.getPostFilterStats() || { filteredRows: 0, totalRows: 0 };
    const activeCount = getActiveFilterCount();

    elements.summaryRows.textContent = Number(stats.filteredRows || 0).toLocaleString();
    elements.summaryBaseRows.textContent = Number(stats.totalRows || 0).toLocaleString();
    elements.summaryCount.textContent = activeCount.toLocaleString();
  }

  function renderFilterList() {
    const elements = getElements();
    if (!elements.list || !elements.empty) return;

    const snapshot = getPostFilterSnapshot();
    const entries = Object.entries(snapshot)
      .filter(([, data]) => Array.isArray(data?.filters) && data.filters.length > 0)
      .map(([field, data]) => ({
        field,
        logic: String(data?.logic || 'all').toLowerCase() === 'any' ? 'any' : 'all',
        showLogic: data.filters.length > 1,
        filters: data.filters.map((filter, index) => ({ filter, index }))
      }));

    elements.empty.classList.toggle('hidden', entries.length > 0);
    elements.list.innerHTML = entries.map(entry => {
      const safeField = escapeHtml(entry.field);
      const ruleLabel = entry.logic === 'any' ? 'Rows can match any rule below' : 'Rows must match every rule below';
      const safeRuleLabel = escapeHtml(ruleLabel);
      const filterMarkup = entry.filters.map(({ filter, index }) => {
        const valueLabel = formatFilterValue(filter, entry.field);
        const label = valueLabel ? `${OperatorLabels.get(filter.cond)} ${valueLabel}` : OperatorLabels.get(filter.cond);
        const safeLabel = escapeHtml(label);
        return `
          <div class="post-filter-pill">
            <span class="post-filter-pill__text">${safeLabel}</span>
            <button type="button" class="post-filter-pill__remove" data-field="${entry.field}" data-index="${index}" aria-label="Remove post filter">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 pointer-events-none">
                <line x1="5" y1="5" x2="15" y2="15"></line>
                <line x1="15" y1="5" x2="5" y2="15"></line>
              </svg>
            </button>
          </div>`;
      }).join('');

      return `
        <section class="post-filter-group" data-field="${entry.field}">
          <div class="post-filter-group__header">
            <div>
              <h4 class="post-filter-group__title">${safeField}</h4>
              <p class="post-filter-group__meta">${entry.filters.length} ${entry.filters.length === 1 ? 'rule' : 'rules'}</p>
            </div>
            ${entry.showLogic ? `
            <label class="post-filter-group__logic">
              <span class="post-filter-group__logic-label">${safeRuleLabel}</span>
              <select class="post-filter-group__logic-select" data-field-logic="${entry.field}" aria-label="Change logic for ${safeField}">
                <option value="all" ${entry.logic === 'all' ? 'selected' : ''}>Require all</option>
                <option value="any" ${entry.logic === 'any' ? 'selected' : ''}>Allow any</option>
              </select>
            </label>` : ''}
          </div>
          <div class="post-filter-group__rules">${filterMarkup}</div>
        </section>`;
    }).join('');
  }

  function refreshOverlay() {
    destroyEqualsValueControl();
    populateFieldOptions();
    renderSummary();
    renderFilterList();
    updateToolbarButton();
  }

  function closeOverlay() {
    const elements = getElements();
    if (!elements.overlay) return;
    VisibilityUtils.hide([elements.overlay], {
      ariaHidden: true,
      bodyClass: 'post-filter-overlay-open',
      raisedUiKey: 'post-filter-overlay'
    });
  }

  function openOverlay() {
    const elements = getElements();
    if (!elements.overlay) return;

    const stats = services.getPostFilterStats();
    const totalRows = Number(stats?.totalRows || 0);

    if (totalRows <= 0) {
      showToastMessage('Run a query before adding post filters.', 'warning');
      return;
    }

    refreshOverlay();
    VisibilityUtils.show([elements.overlay], {
      ariaHidden: false,
      bodyClass: 'post-filter-overlay-open',
      raisedUiKey: 'post-filter-overlay'
    });
    window.requestAnimationFrame(() => elements.fieldSelect?.focus());
  }

  function openOverlayForField(fieldName) {
    const field = services.getFilterActionFieldName(fieldName);
    if (!field) {
      return false;
    }

    const elements = getElements();
    if (!elements.overlay || !elements.fieldSelect || !elements.operatorSelect || !elements.valueInput || !elements.valueInput2) {
      return false;
    }

    const stats = services.getPostFilterStats();
    const totalRows = Number(stats?.totalRows || 0);
    if (totalRows <= 0) {
      showToastMessage('Run a query before adding post filters.', 'warning');
      return false;
    }

    refreshOverlay();

    const availableFields = getAvailableFields();
    if (!availableFields.includes(field)) {
      showToastMessage('This field is not available for post filtering.', 'warning');
      return false;
    }

    elements.fieldSelect.value = field;
    syncOperatorOptions();

    elements.operatorSelect.value = 'equals';
    syncValueInputs();
    elements.valueInput.value = '';
    elements.valueInput2.value = '';

    VisibilityUtils.show([elements.overlay], {
      ariaHidden: false,
      bodyClass: 'post-filter-overlay-open',
      raisedUiKey: 'post-filter-overlay'
    });

    window.requestAnimationFrame(() => {
      if (equalsValueControl && typeof equalsValueControl.focusInput === 'function') {
        equalsValueControl.focusInput();
        return;
      }

      elements.valueInput.focus();
    });

    return true;
  }

  function writeSnapshot(snapshot, options = {}) {
    services.replacePostFilters(snapshot, options);
  }

  function getAddFilterContext(elements) {
    if (!elements.fieldSelect || !elements.operatorSelect || !elements.valueInput || !elements.valueInput2) return;

    const field = String(elements.fieldSelect.value || '').trim();
    const cond = normalizeNoValuePostFilterOperator(elements.operatorSelect.value);
    const logic = elements.logicSelect ? String(elements.logicSelect.value || 'all').trim().toLowerCase() : 'all';
    let value = String(elements.valueInput.value || '').trim();
    let value2 = String(elements.valueInput2.value || '').trim();
    const fieldType = getFieldType(field);
    const numberFormat = getNumberFormat(field);

    if (!field || !cond) {
      return;
    }

    if (fieldType === 'money' || fieldType === 'number') {
      const allowDecimal = fieldType === 'money' || (fieldType === 'number' && numberFormat === 'decimal');
      value = MoneyUtils.sanitizeInputValue(value, { allowDecimal });
      value2 = MoneyUtils.sanitizeInputValue(value2, { allowDecimal });
    }

    return {
      cond,
      elements,
      field,
      fieldType,
      logic,
      value,
      value2
    };
  }

  function validatePostFilterDateInput(context) {
    if (context.fieldType !== 'date' || isNoValuePostFilterOperator(context.cond)) {
      return true;
    }

    const message = getPostFilterDateValidationMessage({
      cond: context.cond,
      customDatePicker: CustomDatePicker,
      field: context.field,
      value: context.value,
      value2: context.value2
    });
    if (message) {
      showToastMessage(message, 'warning');
      return false;
    }
    return true;
  }

  function getSelectedPostFilterValues() {
    if (!equalsValueControl || typeof equalsValueControl.getSelectedValues !== 'function') {
      return [];
    }

    return equalsValueControl.getSelectedValues()
      .map(entry => String(entry || ''))
      .filter(entry => entry || isBlankSentinel(entry));
  }

  function buildPostFilterValue(context) {
    if (isNoValuePostFilterOperator(context.cond)) {
      return { ok: true, selectedValues: [], value: '' };
    }

    if (usesValuePickerOperator(context.cond)) {
      const selectedValues = getSelectedPostFilterValues();
      if (!selectedValues.length) {
        showToastMessage('Choose one or more loaded values for the post filter.', 'warning');
        return { ok: false };
      }
      return { ok: true, selectedValues, value: selectedValues[0] };
    }

    if (context.cond === 'between') {
      if (!context.value || !context.value2) {
        showToastMessage('Enter both values for a between filter.', 'warning');
        return { ok: false };
      }
      return { ok: true, selectedValues: [], value: `${context.value}|${context.value2}` };
    }

    if (!context.value && !isBlankSentinel(context.value)) {
      showToastMessage('Enter a value for the post filter.', 'warning');
      return { ok: false };
    }
    return { ok: true, selectedValues: [], value: context.value };
  }

  function preparePostFilterGroup(snapshot, field, logic) {
    if (!snapshot[field]) {
      snapshot[field] = { logic: 'all', filters: [] };
    }

    if (snapshot[field].filters.length > 0) {
      snapshot[field].logic = logic === 'any' ? 'any' : 'all';
    }

    return snapshot[field];
  }

  function getSelectedValuesKey(values) {
    return values.map(entry => String(entry || '')).join('\u001F');
  }

  function getExistingValuePickerFilterKey(filter) {
    if (!filter) {
      return '';
    }

    return Array.isArray(filter.vals) && filter.vals.length
      ? getSelectedValuesKey(filter.vals)
      : String(filter.val || '');
  }

  function applyValuePickerFilterToSnapshot(snapshot, context, prepared) {
    const group = preparePostFilterGroup(snapshot, context.field, context.logic);
    const nextValuesKey = getSelectedValuesKey(prepared.selectedValues);
    const existingSameCond = group.filters.find(filter => String(filter?.cond || '').toLowerCase() === context.cond);
    if (getExistingValuePickerFilterKey(existingSameCond) === nextValuesKey) {
      showToastMessage('That post filter is already active.', 'info');
      return false;
    }

    group.filters = group.filters.filter(filter => String(filter?.cond || '').toLowerCase() !== context.cond);
    group.filters.push({
      cond: context.cond,
      val: prepared.value,
      vals: prepared.selectedValues
    });

    if (group.filters.length === 1) {
      group.logic = 'all';
    }
    return true;
  }

  function applyScalarFilterToSnapshot(snapshot, context, prepared) {
    const group = preparePostFilterGroup(snapshot, context.field, context.logic);
    const alreadyExists = group.filters.some(filter => filter.cond === context.cond && filter.val === prepared.value);
    if (alreadyExists) {
      showToastMessage('That post filter is already active.', 'info');
      return false;
    }

    group.filters.push({ cond: context.cond, val: prepared.value });
    if (group.filters.length === 1) {
      group.logic = 'all';
    }
    return true;
  }

  function renderAppliedPostFilter(clearInputs) {
    const elements = getElements();
    if (clearInputs) {
      elements.valueInput.value = '';
      elements.valueInput2.value = '';
    }

    renderSummary();
    renderFilterList();
    syncValueInputs();
    updateToolbarButton();
    showToastMessage('Post filter applied.', 'success');
  }

  function addFilter() {
    const elements = getElements();
    const context = getAddFilterContext(elements);
    if (!context) return;

    if (!validatePostFilterDateInput(context)) return;

    const prepared = buildPostFilterValue(context);
    if (!prepared.ok) return;

    const snapshot = getPostFilterSnapshot();
    const usesPicker = usesValuePickerOperator(context.cond) && prepared.selectedValues.length > 0;
    const didApply = usesPicker
      ? applyValuePickerFilterToSnapshot(snapshot, context, prepared)
      : applyScalarFilterToSnapshot(snapshot, context, prepared);
    if (!didApply) {
      return;
    }

    writeSnapshot(snapshot, { refreshView: true, notify: true, resetScroll: true });
    renderAppliedPostFilter(!usesPicker);
  }

  function removeFilter(field, index) {
    const snapshot = getPostFilterSnapshot();
    if (!snapshot[field] || !Array.isArray(snapshot[field].filters) || !snapshot[field].filters[index]) {
      return;
    }

    snapshot[field].filters.splice(index, 1);
    if (!snapshot[field].filters.length) {
      delete snapshot[field];
    }

    writeSnapshot(snapshot, { refreshView: true, notify: true, resetScroll: true });
    renderSummary();
    renderFilterList();
    updateToolbarButton();
  }

  function updateFieldLogic(field, logic) {
    const snapshot = getPostFilterSnapshot();
    if (!snapshot[field] || !Array.isArray(snapshot[field].filters) || !snapshot[field].filters.length) {
      return;
    }

    snapshot[field].logic = String(logic || 'all').toLowerCase() === 'any' ? 'any' : 'all';
    writeSnapshot(snapshot, { refreshView: true, notify: true, resetScroll: false });
    renderSummary();
    renderFilterList();
    syncLogicSelect();
    updateToolbarButton();
  }

  function clearAllFilters() {
    services.clearPostFilters({ refreshView: true, notify: true, resetScroll: true });
    refreshOverlay();
  }

  function handleListClick(event) {
    const logicSelect = event.target.closest('.post-filter-group__logic-select');
    if (logicSelect) {
      return;
    }

    const button = event.target.closest('.post-filter-pill__remove');
    if (!button) return;

    const field = button.getAttribute('data-field') || '';
    const index = Number.parseInt(button.getAttribute('data-index') || '', 10);
    if (!field || Number.isNaN(index)) return;
    removeFilter(field, index);
  }

  function attachListeners() {
    const elements = getElements();
    elements.button?.addEventListener('click', openOverlay);
    elements.backdrop?.addEventListener('click', closeOverlay);
    elements.closeBtn?.addEventListener('click', closeOverlay);
    elements.doneBtn?.addEventListener('click', closeOverlay);
    elements.clearBtn?.addEventListener('click', clearAllFilters);
    elements.addBtn?.addEventListener('click', addFilter);
    elements.fieldSelect?.addEventListener('change', syncOperatorOptions);
    elements.operatorSelect?.addEventListener('change', syncValueInputs);
    elements.logicSelect?.addEventListener('change', () => {
      const field = String(elements.fieldSelect?.value || '').trim();
      if (!field) {
        return;
      }
      const snapshot = getPostFilterSnapshot();
      if (snapshot[field] && Array.isArray(snapshot[field].filters) && snapshot[field].filters.length) {
        updateFieldLogic(field, elements.logicSelect.value);
      }
    });
    elements.list?.addEventListener('click', handleListClick);
    elements.list?.addEventListener('change', event => {
      const logicSelect = event.target.closest('.post-filter-group__logic-select');
      if (!logicSelect) {
        return;
      }

      const field = String(logicSelect.getAttribute('data-field-logic') || '').trim();
      if (!field) {
        return;
      }

      updateFieldLogic(field, logicSelect.value);
    });

    window.addEventListener('postfilters:updated', () => {
      refreshOverlay();
    });

    QueryStateSubscriptions.subscribe(event => {
      if (
        event?.meta?.source === 'VirtualTable.setSplitMode'
        || event?.meta?.optimisticTableDomAlreadySynced === true
        || event?.meta?.skipPostFilterRefresh === true
      ) {
        return;
      }

      services.replacePostFilters(getPostFilterSnapshot(), {
        refreshView: true,
        notify: true,
        resetScroll: false
      });
    }, {
      displayedFields: true
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        const { overlay } = getElements();
        if (overlay && !overlay.classList.contains('hidden')) {
          closeOverlay();
        }
      }
    });

    refreshOverlay();
  }

  PostFilterSystem = Object.freeze({ open: openOverlay, close: closeOverlay, syncToolbarButton: updateToolbarButton, openOverlayForField });
  registerAppUiActionDependencies({ postFilterSystem: PostFilterSystem });
  onDOMReady(attachListeners);
})();

export { PostFilterSystem };
