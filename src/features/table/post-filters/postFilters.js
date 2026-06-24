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
import { getPostFilterElements } from './postFilterElements.js';
import { createPostFilterStreamedEqualsSelector } from './postFilterStreamedEqualsSelector.js';
import { createPostFilterAutoApplyController } from './postFilterAutoApply.js';
import {
  applyScalarFilterToSnapshot,
  applyValuePickerFilterToSnapshot
} from './postFilterSnapshotMutations.js';
import { buildPostFilterListMarkup } from './postFilterListMarkup.js';
import { isNoValuePostFilterOperator, normalizeNoValuePostFilterOperator } from './postFilterLogic.js';
let PostFilterSystem;
(function() {
  let equalsValueControl = null, equalsValueControlField = '';
  let autoApplyController = null;
  const { getDisplayedFields } = QueryStateReaders, services = appServices;
  function getElements() {
    return getPostFilterElements(document);
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

    const renderedList = buildPostFilterListMarkup(getPostFilterSnapshot(), {
      escapeHtml,
      formatFilterValue,
      getOperatorLabel: cond => OperatorLabels.get(cond)
    });
    elements.empty.classList.toggle('hidden', renderedList.hasEntries);
    elements.list.innerHTML = renderedList.html;
  }

  function refreshOverlay() {
    destroyEqualsValueControl();
    populateFieldOptions();
    renderSummary();
    renderFilterList();
    updateToolbarButton();
  }

  function closeOverlay() {
    flushAutoApply();
    getAutoApplyController().stop();
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
    getAutoApplyController().start();
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
    getAutoApplyController().start();

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

  function getAutoApplyController() {
    if (!autoApplyController) {
      autoApplyController = createPostFilterAutoApplyController({
        applyDraft: applyCurrentFilterAutomatically,
        getDraftSignature,
        window
      });
    }
    return autoApplyController;
  }

  function getDraftSignature() {
    const elements = getElements();
    return JSON.stringify({
      field: elements.fieldSelect?.value || '',
      operator: elements.operatorSelect?.value || '',
      value: elements.valueInput?.value || '',
      value2: elements.valueInput2?.value || '',
      selectedValues: getSelectedPostFilterValues()
    });
  }

  function clearDraftValues() {
    const elements = getElements();
    if (elements.valueInput) {
      elements.valueInput.value = '';
    }
    if (elements.valueInput2) {
      elements.valueInput2.value = '';
    }
    if (equalsValueControl && typeof equalsValueControl.setSelectedValues === 'function') {
      equalsValueControl.setSelectedValues([]);
    }
  }

  function resetDraftRule() {
    const elements = getElements();
    if (elements.operatorSelect && elements.operatorSelect.options.length) {
      elements.operatorSelect.selectedIndex = 0;
    }
    clearDraftValues();
    syncValueInputs();
    getAutoApplyController().reset();
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

  function validatePostFilterDateInput(context, options = {}) {
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
      if (options.showWarnings === false) {
        return false;
      }
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

  function buildPostFilterValue(context, options = {}) {
    const showWarnings = options.showWarnings !== false;
    if (isNoValuePostFilterOperator(context.cond)) {
      return { ok: true, selectedValues: [], value: '' };
    }

    if (usesValuePickerOperator(context.cond)) {
      const selectedValues = getSelectedPostFilterValues();
      if (!selectedValues.length) {
        if (showWarnings) {
          showToastMessage('Choose one or more loaded values for the post filter.', 'warning');
        }
        return { ok: false };
      }
      return { ok: true, selectedValues, value: selectedValues[0] };
    }

    if (context.cond === 'between') {
      if (!context.value || !context.value2) {
        if (showWarnings) {
          showToastMessage('Enter both values for a between filter.', 'warning');
        }
        return { ok: false };
      }
      return { ok: true, selectedValues: [], value: `${context.value}|${context.value2}` };
    }

    if (!context.value && !isBlankSentinel(context.value)) {
      if (showWarnings) {
        showToastMessage('Enter a value for the post filter.', 'warning');
      }
      return { ok: false };
    }
    return { ok: true, selectedValues: [], value: context.value };
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

  function applyCurrentFilter(options = {}) {
    const elements = getElements();
    const context = getAddFilterContext(elements);
    if (!context) return false;

    if (!validatePostFilterDateInput(context, options)) return false;

    const prepared = buildPostFilterValue(context, options);
    if (!prepared.ok) return false;

    const snapshot = getPostFilterSnapshot();
    const mutationOptions = { ...options, showToastMessage };
    const usesPicker = usesValuePickerOperator(context.cond) && prepared.selectedValues.length > 0;
    const didApply = usesPicker
      ? applyValuePickerFilterToSnapshot(snapshot, context, prepared, mutationOptions)
      : applyScalarFilterToSnapshot(snapshot, context, prepared, mutationOptions);
    if (!didApply) {
      return false;
    }

    writeSnapshot(snapshot, {
      refreshView: true,
      notify: options.notify !== false,
      resetScroll: options.resetScroll !== false
    });
    if (options.showSuccessToast === true) {
      renderAppliedPostFilter(Boolean(options.clearInputs) && !usesPicker);
    } else {
      renderSummary();
      renderFilterList();
      syncLogicSelect();
      updateToolbarButton();
    }
    return true;
  }

  function applyCurrentFilterAutomatically() {
    return applyCurrentFilter({
      notify: false,
      replaceSameCondition: true,
      resetScroll: true,
      showDuplicateToast: false,
      showSuccessToast: false,
      showWarnings: false
    });
  }

  function scheduleAutoApply(delay) {
    getAutoApplyController().schedule(delay);
  }

  function flushAutoApply() {
    getAutoApplyController().flush();
  }

  function removeFilter(field, index) {
    getAutoApplyController().cancel();
    const snapshot = getPostFilterSnapshot();
    if (!snapshot[field] || !Array.isArray(snapshot[field].filters) || !snapshot[field].filters[index]) {
      return;
    }

    snapshot[field].filters.splice(index, 1);
    if (!snapshot[field].filters.length) {
      delete snapshot[field];
    }

    writeSnapshot(snapshot, { refreshView: true, notify: true, resetScroll: true });
    resetDraftRule();
    renderSummary();
    renderFilterList();
    updateToolbarButton();
    getAutoApplyController().reset();
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
    getAutoApplyController().cancel();
    clearDraftValues();
    services.clearPostFilters({ refreshView: true, notify: true, resetScroll: true });
    refreshOverlay();
    resetDraftRule();
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
    elements.fieldSelect?.addEventListener('change', () => {
      clearDraftValues();
      syncOperatorOptions();
      scheduleAutoApply(0);
    });
    elements.operatorSelect?.addEventListener('change', () => {
      syncValueInputs();
      scheduleAutoApply(0);
    });
    elements.valueInput?.addEventListener('input', () => scheduleAutoApply());
    elements.valueInput2?.addEventListener('input', () => scheduleAutoApply());
    elements.valueInput?.addEventListener('change', () => scheduleAutoApply(0));
    elements.valueInput2?.addEventListener('change', () => scheduleAutoApply(0));
    elements.valueInput?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        flushAutoApply();
      }
    });
    elements.valueInput2?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        flushAutoApply();
      }
    });
    elements.valuePickerHost?.addEventListener('change', () => scheduleAutoApply(0));
    elements.overlay?.addEventListener('input', event => {
      if (
        event.target === elements.valueInput
        || event.target === elements.valueInput2
        || event.target?.closest?.('#post-filter-value-picker-host')
      ) {
        scheduleAutoApply();
      }
    });
    elements.overlay?.addEventListener('change', event => {
      if (
        event.target === elements.valueInput
        || event.target === elements.valueInput2
        || event.target?.closest?.('#post-filter-value-picker-host')
      ) {
        scheduleAutoApply(0);
      }
    });
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
