import { showToastMessage } from '../../core/toast.js';
import { VisibilityUtils } from '../../core/visibility.js';
import { getRankedFieldPickerOptions } from './fieldPickerSearch.js';
import { createQueryFieldPickerIntegration } from './fieldPickerQueryIntegration.js';
import { createFieldPickerModal } from './fieldPickerModal.js';
import { getFieldPickerOptionsFromDefinitions } from './fieldPickerOptions.js';
import { initializeSearchInputs } from '../controls/searchUI.js';
import { VirtualList } from '../controls/virtualList.js';
import {
  buildFieldPickerOptionBadges,
  buildFieldPickerStatusText,
  getFieldPerformanceWarning,
  isOptionBuildable,
  isOptionDisplayable,
  isOptionLocalDynamic,
  normalizePickerState
} from './fieldPickerOptionState.js';
let SharedFieldPicker;

(function() {
  async function openSharedFieldPicker(config = {}) {
    if (typeof config.beforeOpen === 'function') {
      await config.beforeOpen();
    }

    const resolvedOptions = await (typeof config.getOptions === 'function'
      ? config.getOptions()
      : getFieldPickerOptionsFromDefinitions());
    const options = Array.isArray(resolvedOptions) ? resolvedOptions : [];

    if (options.length === 0) {
      showToastMessage(config.emptyToastMessage || 'No fields are available right now.', 'warning');
      return;
    }

    const labels = {
      kicker: 'Add Field',
      title: 'Choose a field',
      description: 'Select a field, then decide how it should be used.',
      displayChoice: 'Display in results',
      filterChoice: 'Add filter control',
      displayBadge: 'Displayed',
      filterBadge: 'Filter',
      selectedFieldLabel: 'Selected field',
      footerNote: 'Changes apply automatically.',
      ...config.labels
    };

    const allowDisplay = config.allowDisplay !== false;
    const allowFilter = config.allowFilter !== false;
    const autoApplyDisplayOnOptionClick = Boolean(config.autoApplyDisplayOnOptionClick && allowDisplay);
    const compactLayout = Boolean(config.compactLayout);
    const autoAddFilterFromPreview = Boolean(
      config.autoAddFilterFromPreview
      && allowFilter
      && typeof config.renderFilterPreview === 'function'
    );
    const getFieldState = typeof config.getFieldState === 'function'
      ? config.getFieldState
      : (() => ({ display: false, filter: false }));

    const {
      backdrop,
      categorySelect,
      closeButton,
      displayChoice,
      fieldInfoEl,
      fieldMetaEl,
      fieldNameEl,
      fieldWarningEl,
      filterChoice,
      filterPreviewHost,
      filterPreviewLabelEl,
      filterPreviewWrap,
      listEl,
      modal,
      removeBuiltFieldBtn,
      searchInput,
      statusEl
    } = createFieldPickerModal({
      allowDisplay,
      allowFilter,
      autoAddFilterFromPreview,
      compactLayout,
      hasFilterPreview: typeof config.renderFilterPreview === 'function',
      labels,
      showDisplayChoice: config.showDisplayChoice
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    let currentFilterPreviewApi = null;
    let previewSyncTimer = null;
    const filterPreviewDrafts = new Map();

    if (searchInput) {
      initializeSearchInputs(modal);
    }

    let selectedFieldName = options.some(option => option.name === config.initialFieldName)
      ? config.initialFieldName
      : options[0].name;
    let searchTerm = '';
    let selectedCategory = '';
    let syncingControls = false;
    const shownPerformanceWarnings = new Set();

    const categories = options
      .flatMap(option => String(option.category || '')
        .split(',')
        .map(category => category.trim())
        .filter(Boolean))
      .filter((category, index, list) => list.indexOf(category) === index)
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

    if (categorySelect) {
      categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
      });
    }

    function clearFilterPreview() {
      if (previewSyncTimer) {
        window.clearTimeout(previewSyncTimer);
        previewSyncTimer = null;
      }
      if (currentFilterPreviewApi && typeof currentFilterPreviewApi.cleanup === 'function') {
        currentFilterPreviewApi.cleanup();
      }
      currentFilterPreviewApi = null;
      if (filterPreviewHost) {
        filterPreviewHost.replaceChildren();
      }
      if (filterPreviewWrap) {
        filterPreviewWrap.classList.add('hidden');
      }
      if (filterPreviewLabelEl) {
        filterPreviewLabelEl.textContent = 'Filter preview';
      }
    }

    function destroyFieldList() {
      if (!listEl.virtualList) {
        return;
      }

      listEl.virtualList.destroy();
      delete listEl.virtualList;
    }

    function cleanup() {
      document.removeEventListener('keydown', onKeyDown);
      clearFilterPreview();
      destroyFieldList();
      VisibilityUtils.hide([backdrop, modal], {
        ariaHidden: true,
        raisedUiKey: 'field-picker-modal'
      });
      backdrop.remove();
      modal.remove();
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        cleanup();
      }
    }

    function getSelectedState() {
      return normalizePickerState(getFieldState(selectedFieldName));
    }

    function syncChoiceInputs() {
      const state = getSelectedState();
      const selected = options.find(option => option.name === selectedFieldName) || null;
      syncingControls = true;
      if (displayChoice) {
        displayChoice.checked = state.display && isOptionDisplayable(selected);
        displayChoice.disabled = !isOptionDisplayable(selected);
      }
      if (filterChoice) {
        filterChoice.checked = state.filter;
        filterChoice.disabled = Boolean(selected && selected.filterable === false);
      }
      syncingControls = false;
    }

    function syncOptionBadges() {
      listEl.querySelectorAll('.form-mode-field-picker-option').forEach(button => {
        const fieldName = String(button.dataset.fieldName || '').trim();
        if (!fieldName) return;

        button.classList.toggle('is-selected', fieldName === selectedFieldName);
        const option = options.find(candidate => candidate.name === fieldName) || null;
        button.classList.toggle('is-display-disabled', !isOptionDisplayable(option));

        const badgesEl = button.querySelector('.form-mode-field-picker-option-badges');
        if (badgesEl) {
          badgesEl.innerHTML = buildFieldPickerOptionBadges({
            allowDisplay,
            allowFilter,
            labels,
            option,
            state: getFieldState(fieldName)
          });
        }
      });
    }

    function getCurrentFilterPreviewState() {
      if (currentFilterPreviewApi && typeof currentFilterPreviewApi.getState === 'function') {
        return currentFilterPreviewApi.getState();
      }

      return filterPreviewDrafts.get(selectedFieldName) || null;
    }

    function isFilterPreviewReady(previewState) {
      if (typeof config.isFilterPreviewReady === 'function') {
        return Boolean(config.isFilterPreviewReady(previewState));
      }

      if (!previewState || !Array.isArray(previewState.values)) {
        return false;
      }

      const values = previewState.values.map(value => String(value ?? '').trim());
      if (String(previewState.operator || '').trim().toLowerCase() === 'between') {
        return values[0] !== '' && values[1] !== '';
      }

      return values.some(value => value !== '');
    }

    async function syncAutoFilterFromPreview() {
      if (!autoAddFilterFromPreview) {
        return;
      }

      const selected = options.find(option => option.name === selectedFieldName) || null;
      if (!selected || selected.filterable === false) {
        return;
      }

      const previewState = getCurrentFilterPreviewState();
      const currentState = normalizePickerState(getFieldState(selectedFieldName));
      const isReady = isFilterPreviewReady(previewState);

      if (!isReady && !currentState.filter) {
        return;
      }

      if (typeof config.onFilterPreviewChange === 'function') {
        await config.onFilterPreviewChange(selectedFieldName, previewState, {
          modal,
          cleanup,
          isNewFilter: !currentState.filter
        });
        syncOptionBadges();
        syncChoiceInputs();
        syncStatusTextOnly(selected);
        
        if (filterPreviewHost) {
          const removeBtn = filterPreviewHost.querySelector('.form-mode-field-remove');
          if (removeBtn) {
            const hasFilterNow = normalizePickerState(getFieldState(selectedFieldName)).filter;
            if (!hasFilterNow) {
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
        }
        return;
      }
    }

    function scheduleAutoFilterSync(previewState = null) {
      if (!autoAddFilterFromPreview) {
        return;
      }

      if (previewState && previewState.fieldName) {
        filterPreviewDrafts.set(previewState.fieldName, {
          fieldName: previewState.fieldName,
          operator: previewState.operator,
          values: Array.isArray(previewState.values) ? previewState.values.slice() : []
        });
      }

      if (previewSyncTimer) {
        window.clearTimeout(previewSyncTimer);
      }

      previewSyncTimer = window.setTimeout(() => {
        previewSyncTimer = null;
        syncAutoFilterFromPreview().catch(error => {
          console.error('Failed to auto-add filter from preview:', error);
        });
      }, 0);
    }

    function syncFilterPreview() {
      if (!filterPreviewWrap || !filterPreviewHost || typeof config.renderFilterPreview !== 'function') {
        return;
      }

      clearFilterPreview();
      const selected = options.find(option => option.name === selectedFieldName) || null;
      if (!selected || (selected.filterable === false && isOptionDisplayable(selected))) {
        return;
      }

      const previewApi = config.renderFilterPreview(filterPreviewHost, selectedFieldName, {
        selected,
        state: getSelectedState(),
        cleanup,
        previewState: filterPreviewDrafts.get(selectedFieldName) || null,
        onPreviewChange: scheduleAutoFilterSync,
        onRemoveFilter: () => {
          filterPreviewDrafts.delete(selectedFieldName);
          syncOptionBadges();
          syncChoiceInputs();
          syncDetails();
        }
      });

      if (previewApi && typeof previewApi === 'object') {
        currentFilterPreviewApi = previewApi;
      }
      if (filterPreviewLabelEl) {
        filterPreviewLabelEl.textContent = typeof previewApi?.label === 'string' && previewApi.label.trim()
          ? previewApi.label.trim()
          : 'Filter preview';
      }
      if (filterPreviewHost.childNodes.length > 0) {
        filterPreviewWrap.classList.remove('hidden');
      }
    }

    function syncStatusTextOnly(selected = options.find(option => option.name === selectedFieldName) || null) {
      if (!statusEl) {
        return;
      }

      if (!selected) {
        statusEl.textContent = 'No field selected.';
        return;
      }

      statusEl.textContent = buildFieldPickerStatusText({
        allowDisplay,
        allowFilter,
        autoAddFilterFromPreview,
        displayChoice,
        filterChoice,
        labels,
        selected,
        state: getSelectedState()
      });
    }

    function showPerformanceWarningToast(option, action) {
      const warning = getFieldPerformanceWarning(option);
      if (!warning) return;

      const fieldName = String(option?.name || selectedFieldName || '').trim();
      const key = `${fieldName}:${action}:${warning.message}`;
      if (shownPerformanceWarnings.has(key)) return;

      shownPerformanceWarnings.add(key);
      const level = warning.level === 'info' ? 'info' : 'warning';
      showToastMessage(`${fieldName}: ${warning.message}`, level, 8500);
    }

    function syncDetails() {
      if (!fieldNameEl || !fieldMetaEl || !statusEl) {
        return;
      }

      const selected = options.find(option => option.name === selectedFieldName) || null;
      if (!selected) {
        fieldNameEl.textContent = '';
        if (fieldInfoEl) {
          fieldInfoEl.classList.add('hidden');
          fieldInfoEl.removeAttribute('data-tooltip-html');
        }
        fieldMetaEl.textContent = '';
        fieldMetaEl.classList.add('hidden');
        if (fieldWarningEl) {
          fieldWarningEl.textContent = '';
          fieldWarningEl.classList.add('hidden');
        }
        if (removeBuiltFieldBtn) {
          removeBuiltFieldBtn.classList.add('hidden');
          removeBuiltFieldBtn.disabled = true;
        }
        statusEl.textContent = 'No field selected.';
        clearFilterPreview();
        return;
      }

      fieldNameEl.textContent = selected.name;
      if (fieldInfoEl) {
        if (selected.tooltipHtml) {
          fieldInfoEl.classList.remove('hidden');
          fieldInfoEl.setAttribute('data-tooltip-html', selected.tooltipHtml);
          fieldInfoEl.setAttribute('aria-label', `Show details for ${selected.name}`);
        } else {
          fieldInfoEl.classList.add('hidden');
          fieldInfoEl.removeAttribute('data-tooltip-html');
          fieldInfoEl.setAttribute('aria-label', 'Show field details');
        }
      }
      fieldMetaEl.textContent = '';
      fieldMetaEl.classList.add('hidden');
      if (fieldWarningEl) {
        const warning = getFieldPerformanceWarning(selected);
        fieldWarningEl.textContent = warning?.message || '';
        fieldWarningEl.classList.toggle('hidden', !warning);
      }
      if (removeBuiltFieldBtn) {
        const canRemove = isOptionLocalDynamic(selected) && typeof config.onRemoveDynamicField === 'function';
        removeBuiltFieldBtn.classList.toggle('hidden', !canRemove);
        removeBuiltFieldBtn.disabled = !canRemove;
        removeBuiltFieldBtn.setAttribute('aria-label', canRemove ? `Remove built field ${selected.name}` : 'Remove built field');
      }

      syncStatusTextOnly(selected);
      syncFilterPreview();
    }

    async function handlePickerActionResult(result) {
      if (result && result.close) {
        cleanup();
        if (typeof result.afterClose === 'function') {
          window.setTimeout(() => result.afterClose(), 0);
        }
        return;
      }
      renderList();
      syncChoiceInputs();
      syncDetails();
    }

    async function applyDisplayChange(fieldName, nextChecked, options = {}) {
      if (!fieldName || typeof config.onDisplayChange !== 'function') {
        return;
      }

      const selected = optionsListFind(fieldName);
      if (nextChecked && !isOptionDisplayable(selected)) {
        showToastMessage(`${fieldName} must be created before it can be displayed.`, 'warning');
        renderList();
        syncChoiceInputs();
        syncDetails();
        return;
      }

      const currentState = normalizePickerState(getFieldState(fieldName));
      if (currentState.display === nextChecked) {
        if (options.closeIfUnchanged) {
          cleanup();
        } else {
          renderList();
          syncChoiceInputs();
          syncDetails();
        }
        return;
      }

      selectedFieldName = fieldName;
      if (nextChecked) {
        showPerformanceWarningToast(selected, 'display');
      }
      const result = await config.onDisplayChange(fieldName, nextChecked, { cleanup, modal, trigger: options.trigger });
      await handlePickerActionResult(result);

      if (options.closeAfterApply) {
        cleanup();
      }
    }

    async function applyFilterChange(fieldName, nextChecked, options = {}) {
      if (!fieldName || typeof config.onFilterChange !== 'function') {
        return;
      }

      const selected = optionsListFind(fieldName);
      if (selected && selected.filterable === false) {
        syncChoiceInputs();
        syncDetails();
        return;
      }

      const currentState = normalizePickerState(getFieldState(fieldName));
      if (currentState.filter === nextChecked) {
        renderList();
        syncChoiceInputs();
        syncDetails();
        return;
      }

      selectedFieldName = fieldName;
      if (nextChecked) {
        showPerformanceWarningToast(selected, 'filter');
      }
      const result = await config.onFilterChange(fieldName, nextChecked, {
        cleanup,
        modal,
        trigger: options.trigger,
        getFilterPreviewState: () => options.previewState || getCurrentFilterPreviewState()
      });
      if (options.trigger === 'preview-auto-add' && !(result && result.close)) {
        syncOptionBadges();
        syncChoiceInputs();
        syncStatusTextOnly(optionsListFind(fieldName));
        return;
      }
      await handlePickerActionResult(result);
    }

    function optionsListFind(fieldName) {
      return options.find(option => option.name === fieldName) || null;
    }

    async function applySelectedFieldChanges(changeType) {
      if (!selectedFieldName) return;

      if (changeType === 'display' && allowDisplay && displayChoice) {
        await applyDisplayChange(selectedFieldName, displayChoice.checked, { trigger: 'details-toggle' });
        return;
      }

      if (changeType === 'filter' && allowFilter && filterChoice) {
        await applyFilterChange(selectedFieldName, filterChoice.checked, { trigger: 'details-toggle' });
      }
    }

    async function applyDisplaySelectionFromOption(fieldName) {
      if (!fieldName) {
        return false;
      }

      const currentState = normalizePickerState(getFieldState(fieldName));
      if (currentState.display) {
        showToastMessage(`${fieldName} is already in results. Double-click to remove.`, 'info');
        return true;
      }

      const selected = optionsListFind(fieldName);
      if (!isOptionDisplayable(selected)) {
        if (isOptionBuildable(selected) && filterPreviewHost) {
          selectedFieldName = fieldName;
          renderList();
          syncChoiceInputs();
          syncDetails();
          return true;
        }
        showToastMessage(`${fieldName} must be created before it can be displayed.`, 'warning');
        return true;
      }

      await applyDisplayChange(fieldName, true, {
        trigger: 'option-click',
        closeAfterApply: true,
        closeIfUnchanged: true
      });
      return true;
    }

    function createOptionButton(option) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'form-mode-field-picker-option';
      button.style.marginBottom = '8px';
      button.dataset.fieldName = option.name;
      if (option.name === selectedFieldName) {
        button.classList.add('is-selected');
      }
      if (!isOptionDisplayable(option)) {
        button.classList.add('is-display-disabled');
      }

      if (option.tooltipHtml) {
        button.setAttribute('data-tooltip-html', option.tooltipHtml);
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'form-mode-field-picker-option-name';
      nameSpan.textContent = option.name;
      nameSpan.style.display = 'block';
      nameSpan.style.overflow = 'hidden';
      nameSpan.style.textOverflow = 'ellipsis';
      nameSpan.style.whiteSpace = 'nowrap';
      nameSpan.style.flex = '1 1 auto';
      nameSpan.style.minWidth = '0';
      nameSpan.addEventListener('mouseover', function() {
        if (this.offsetWidth < this.scrollWidth) {
          this.setAttribute('data-tooltip', option.name);
        } else {
          this.removeAttribute('data-tooltip');
        }
      });

      const badgesSpan = document.createElement('span');
      badgesSpan.className = 'form-mode-field-picker-option-badges';
      badgesSpan.innerHTML = buildFieldPickerOptionBadges({
        allowDisplay,
        allowFilter,
        labels,
        option,
        state: getFieldState(option.name)
      });

      button.innerHTML = '';
      button.appendChild(nameSpan);
      button.appendChild(badgesSpan);

      button.addEventListener('click', async () => {
        if (autoApplyDisplayOnOptionClick) {
          await applyDisplaySelectionFromOption(option.name);
          return;
        }

        const wasAlreadySelected = selectedFieldName === option.name;
        selectedFieldName = option.name;

        if (config.autoDisplayOnSelect) {
          const state = normalizePickerState(getFieldState(option.name));
          if (!isOptionDisplayable(option)) {
            renderList();
            syncChoiceInputs();
            syncDetails();
          } else if (!state.display) {
            await applyDisplayChange(option.name, true, { trigger: 'option-click' });
          } else {
            renderList();
            syncChoiceInputs();
            syncDetails();
            if (wasAlreadySelected) {
              showToastMessage(`Double-click to remove ${option.name} from results.`, 'info');
            }
          }
        } else {
          renderList();
          syncChoiceInputs();
          syncDetails();
        }
      });

      button.addEventListener('dblclick', async () => {
        if (autoApplyDisplayOnOptionClick) {
          const state = normalizePickerState(getFieldState(option.name));
          if (state.display) {
            await applyDisplayChange(option.name, false, {
              trigger: 'option-dblclick',
              closeAfterApply: true,
              closeIfUnchanged: true
            });
          }
          return;
        }

        selectedFieldName = option.name;

        if (config.autoDisplayOnSelect) {
          const state = normalizePickerState(getFieldState(option.name));
          if (state.display) {
            await applyDisplayChange(option.name, false, { trigger: 'option-dblclick' });
          }
        }
      });
      
      return button;
    }

    if (!listEl.virtualList) {
      listEl.virtualList = new VirtualList({
        container: listEl,
        itemHeight: 52, // Approximate height of the option button (44px) + 8px margin
        renderItem: createOptionButton
      });
      listEl.style.overflowY = 'auto';
    }

    function renderList() {
      const filteredOptions = getRankedFieldPickerOptions(options, {
        searchTerm,
        selectedCategory
      });

      let emptyState = listEl.parentNode.querySelector('.form-mode-field-picker-empty');
      if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'form-mode-field-picker-empty';
        emptyState.style.padding = '1rem';
        emptyState.style.textAlign = 'center';
        emptyState.textContent = 'No fields match that search.';
        listEl.parentNode.appendChild(emptyState);
      }

      if (filteredOptions.length === 0) {
        listEl.innerHTML = '<p class="form-mode-field-picker-empty">No fields match that search.</p>';
        if (listEl.virtualList) listEl.virtualList.setItems([]);
        emptyState.style.display = 'block';
        listEl.style.display = 'none';
        selectedFieldName = '';
        syncDetails();
        return;
      }

      emptyState.style.display = 'none';
      listEl.style.display = 'block';

      if (!filteredOptions.some(option => option.name === selectedFieldName)) {
        selectedFieldName = filteredOptions[0].name;
      }

      listEl.innerHTML = '';
      if (listEl.virtualList) {
        listEl.virtualList.setItems(filteredOptions);
        
        listEl.querySelectorAll('.form-mode-field-picker-option').forEach(btn => {
          btn.classList.toggle('is-selected', btn.dataset.fieldName === selectedFieldName);
        });
      } else {
        filteredOptions.forEach(option => {
          listEl.appendChild(createOptionButton(option));
        });
      }

      syncChoiceInputs();
      syncDetails();
    }

    if (displayChoice) {
      displayChoice.addEventListener('change', async () => {
        if (syncingControls) return;
        await applySelectedFieldChanges('display');
      });
    }

    if (filterChoice) {
      filterChoice.addEventListener('change', async () => {
        if (syncingControls) return;
        await applySelectedFieldChanges('filter');
      });
    }

    if (removeBuiltFieldBtn) {
      removeBuiltFieldBtn.addEventListener('click', async () => {
        const selected = optionsListFind(selectedFieldName);
        if (!selected || !isOptionLocalDynamic(selected) || typeof config.onRemoveDynamicField !== 'function') {
          return;
        }

        removeBuiltFieldBtn.disabled = true;
        const result = await config.onRemoveDynamicField(selectedFieldName, { cleanup, modal });
        removeBuiltFieldBtn.disabled = false;
        if (result === false || result?.removed === false) {
          syncDetails();
          return;
        }

        const removedFieldName = selectedFieldName;
        const optionIndex = options.findIndex(option => option.name === removedFieldName);
        if (optionIndex >= 0) {
          options.splice(optionIndex, 1);
        }

        selectedFieldName = options[0]?.name || '';
        showToastMessage(result?.successMessage || `${removedFieldName} removed from built fields.`, 'success');
        renderList();
      });
    }

    searchInput.addEventListener('input', event => {
      searchTerm = String(event.target.value || '').trim().toLowerCase();
      renderList();
    });

    if (categorySelect) {
      categorySelect.addEventListener('change', event => {
        selectedCategory = String(event.target.value || '').trim();
        renderList();
      });
    }

    [backdrop, closeButton].forEach(target => {
      if (!target) return;
      target.addEventListener('click', cleanup);
    });

    document.addEventListener('keydown', onKeyDown);
    renderList();
    VisibilityUtils.show([backdrop, modal], {
      ariaHidden: false,
      raisedUiKey: 'field-picker-modal'
    });
    window.requestAnimationFrame(() => {
      searchInput.focus();
      searchInput.select();
    });
  }

  const queryFieldPickerIntegration = createQueryFieldPickerIntegration({
    openSharedFieldPicker,
    getFieldPickerOptionsFromDefinitions
  });

  SharedFieldPicker = Object.freeze({
    getFieldOptions: getFieldPickerOptionsFromDefinitions,
    open: openSharedFieldPicker,
    openQueryFieldPicker: queryFieldPickerIntegration.openQueryFieldPicker,
    openQueryFilterEditor: queryFieldPickerIntegration.openQueryFilterEditor
  });

  queryFieldPickerIntegration.initQueryFieldPickerButton();
})();

export { SharedFieldPicker };
