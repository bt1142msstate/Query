import { appServices, registerFormModeService } from '../core/appServices.js';
import { appUiActions } from '../core/appUiActions.js';
import { ClipboardUtils } from '../core/clipboard.js';
import { QueryChangeManager, getBaseFieldName, QueryStateReaders } from '../core/queryState.js';
import { showToastMessage } from '../core/toast.js';
import { QueryStateSubscriptions } from '../core/queryStateSubscriptions.js';
import { FormModeControls as formModeControls } from './formModeControls.js';
import {
  cloneSpec,
  decodeSpec,
  encodeSpec,
  getInputParamKeys,
  interpolateValue,
  normalizeSpec,
  resolveLimitedView,
  splitListValues
} from './formModeSpec.js';
import {
  buildClearedBrowserUrl,
  buildFormShareUrl,
  isShareableFormSpec
} from './formModeShareUrl.js';
import {
  assignInputSpecDefaultValues,
  buildGeneratedInputSpecsFromActiveFilters,
  clearInputSpecDefaultValue,
  getInputSignature,
  getInputSpecDefaultValues,
  normalizeOperatorForField,
  syncInputSpecFromState,
  uniqueInputKey
} from './formModeQuerySpec.js';
import { FormModeStateHelpers as formModeStateHelpers } from './formModeStateHelpers.js';
import { SharedFieldPicker } from './fieldPicker.js';
import { QueryTableView } from './queryTableView.js';
import { QueryUI } from './queryUI.js';
import { fieldDefs, isFieldBackendFilterable, loadFieldDefinitions } from '../filters/fieldDefs.js';
import { DOM } from '../core/domCache.js';

let QueryFormMode;

(function() {
  const services = appServices;
  const uiActions = appUiActions;
  const {
    collectBindings: collectFormBindings,
    setTableName: syncFormTableName,
    ensureColumnsRegistered,
    buildActiveFilters,
    updateHeaderCopy: syncFormHeaderCopy,
    getValidationError: getFormValidationError
  } = formModeStateHelpers;
  const {
    getFieldInputType,
    supportsMultipleValues,
    createGeneratedInputSpec: buildFormModeInputSpec,
    resolveInputInitialValues: resolveFormInputInitialValues,
    createControl: createFormControl,
    createFieldRow: createFormFieldRow
  } = formModeControls;
  let initialized = false;
  const state = {
    active: false,
    spec: null,
    specSource: 'generated',
    initialSpec: null,
    sharedBaselineSpec: null,
    searchParams: null,
    initialSearchParams: null,
    sharedBaselineSearchParams: null,
    viewMode: 'form',
    formCard: null,
    validationEl: null,
    runBtn: null,
    copyBtn: null,
    resetOriginalBtn: null,
    resetSharedBtn: null,
    modeToggleBtn: null,
    mobileModeToggleBtn: null,
    formHost: null,
    controls: new Map(),
    originalUpdateButtonStates: null,
    unsubscribeQueryState: null,
    lastSuggestedTableName: '',
    lastBrowserUrl: '',
    suppressAutoTableNameOnce: false,
    forceTableNameSyncOnce: false,
    isClearingQuery: false,
    isApplyingFormState: false,
    limitedView: false,
    pendingQuerySync: null,
    querySyncQueued: false,
    tableNameListenersBound: false,
    hiddenNodes: []
  };
  const { getDisplayedFields, getActiveFilters } = QueryStateReaders;

  function getQuerySnapshot() {
    if (QueryStateReaders && typeof QueryStateReaders.getSnapshot === 'function') {
      return QueryStateReaders.getSnapshot();
    }

    return {
      displayedFields: getDisplayedFields(),
      activeFilters: getActiveFilters()
    };
  }

  function getCurrentTableNameValue() {
    return DOM && DOM.tableNameInput
      ? DOM.tableNameInput.value.trim()
      : '';
  }

  function shouldRemoveUnmatchedInputFromQuerySync(inputSpec) {
    if (!inputSpec) {
      return false;
    }

    if (inputSpec.source === 'query-filter') {
      return true;
    }

    return state.specSource === 'generated';
  }

  function syncActiveSpecWithCurrentQuery(options = {}) {
    if (!state.active || !state.spec) {
      return false;
    }

    const {
      rebuildCard = false,
      refreshUrl = true
    } = options;

    const querySnapshot = getQuerySnapshot();
    let changed = syncSpecColumnsWithDisplayedFields({ refreshUrl: false, snapshot: querySnapshot });

    const existingInputs = Array.isArray(state.spec.inputs) ? state.spec.inputs.slice() : [];
    const generatedInputs = buildGeneratedInputSpecsFromActiveFilters(existingInputs, querySnapshot.activeFilters, {
      fieldDefs
    });
    const existingBySignature = new Map();
    const controlsToSync = [];

    existingInputs.forEach(inputSpec => {
      const signature = getInputSignature(inputSpec);
      if (!existingBySignature.has(signature)) {
        existingBySignature.set(signature, []);
      }
      existingBySignature.get(signature).push(inputSpec);
    });

    const usedInputs = new Set();
    const nextInputs = [];

    generatedInputs.forEach(generatedInput => {
      const signature = getInputSignature(generatedInput);
      const candidates = existingBySignature.get(signature) || [];
      const match = candidates.find(candidate => !usedInputs.has(candidate));

      if (!match) {
        nextInputs.push(generatedInput);
        changed = true;
        return;
      }

      const fieldDef = fieldDefs ? fieldDefs.get(match.field) : null;
      const previousOperator = match.operator;
      const previousType = match.type;
      const previousDefaults = JSON.stringify(getInputSpecDefaultValues(match));
      const nextDefaults = getInputSpecDefaultValues(generatedInput);
      const nextMultiple = Boolean(generatedInput.multiple);

      match.operator = generatedInput.operator;
      match.type = generatedInput.type || match.type;
      assignInputSpecDefaultValues(match, nextDefaults, fieldDef);
      if (match.multiple !== nextMultiple) {
        match.multiple = nextMultiple;
      }

      const defaultsChanged = previousDefaults !== JSON.stringify(getInputSpecDefaultValues(match));
      const operatorChanged = previousOperator !== match.operator;
      const typeChanged = previousType !== match.type;

      if (defaultsChanged || operatorChanged || typeChanged) {
        changed = true;
        controlsToSync.push({
          inputSpec: match,
          previousOperator
        });
      }

      usedInputs.add(match);
      nextInputs.push(match);
    });

    existingInputs.forEach(inputSpec => {
      if (usedInputs.has(inputSpec)) {
        return;
      }

      if (shouldRemoveUnmatchedInputFromQuerySync(inputSpec)) {
        changed = true;
        return;
      }

      const previousDefaults = JSON.stringify(getInputSpecDefaultValues(inputSpec));
      clearInputSpecDefaultValue(inputSpec);
      if (previousDefaults !== JSON.stringify(getInputSpecDefaultValues(inputSpec))) {
        changed = true;
      }
      nextInputs.push(inputSpec);
    });

    if (
      state.spec.inputs.length !== nextInputs.length
      || state.spec.inputs.some((inputSpec, index) => inputSpec !== nextInputs[index])
    ) {
      state.spec.inputs = nextInputs;
      changed = true;
    }

    if (rebuildCard && state.viewMode === 'form') {
      rebuildFormCardFromSpec({
        preserveCurrentDefaults: false,
        applyState: false,
        refreshUrl: false,
        clearSearchParams: true
      });
    } else if (state.viewMode === 'form' && controlsToSync.length > 0) {
      controlsToSync.forEach(({ inputSpec, previousOperator }) => {
        syncMountedControlFromInputSpec(inputSpec, {
          previousOperator,
          querySource: 'QueryFormMode.syncActiveSpecWithCurrentQuery'
        });
      });
    }

    if (changed && refreshUrl) {
      refreshBrowserUrl();
    }

    return changed;
  }

  function buildSpecFromCurrentQuery() {
    const querySnapshot = getQuerySnapshot();
    const columns = Array.isArray(querySnapshot.displayedFields) ? querySnapshot.displayedFields.slice() : [];
    const tableNameInput = DOM && DOM.tableNameInput;
    const title = tableNameInput ? tableNameInput.value.trim() : '';
    const inputs = buildGeneratedInputSpecsFromActiveFilters([], querySnapshot.activeFilters, {
      fieldDefs
    });

    return normalizeSpec({
      title,
      queryName: title,
      description: '',
      columns,
      inputs,
      lockedFilters: []
    });
  }

  function getFieldPickerOptions() {
    return SharedFieldPicker.getFieldOptions();
  }

  function syncSpecColumnsWithDisplayedFields(options = {}) {
    if (!state.active || !state.spec) return false;

    const snapshot = options.snapshot || getQuerySnapshot();
    const nextColumns = Array.isArray(snapshot.displayedFields) ? snapshot.displayedFields.slice() : [];
    if (state.isClearingQuery && nextColumns.length === 0) return false;

    const currentColumns = Array.isArray(state.spec.columns) ? state.spec.columns : [];
    const columnsChanged = currentColumns.length !== nextColumns.length
      || currentColumns.some((column, index) => column !== nextColumns[index]);

    if (!columnsChanged) return false;

    state.spec.columns = nextColumns;

    if (options.refreshUrl !== false) {
      refreshBrowserUrl();
    }

    return true;
  }

  function shouldPersistFormUrlInBrowser() {
    return state.active && isShareableFormSpec(state.spec);
  }

  function syncShareUi() {
    if (!state.copyBtn) {
      return;
    }

    const isShareable = isShareableFormSpec(state.spec);
    state.copyBtn.disabled = !isShareable;
    state.copyBtn.setAttribute(
      'data-tooltip',
      isShareable
        ? 'Copy a shareable link and save this as the reset baseline.'
        : 'Add a displayed field or filter control before sharing this form.'
    );
    state.copyBtn.setAttribute(
      'aria-label',
      isShareable
        ? 'Share form link'
        : 'Share unavailable until fields are added'
    );

    if (state.resetSharedBtn) {
      const hasSharedBaseline = Boolean(state.sharedBaselineSpec);
      state.resetSharedBtn.disabled = !hasSharedBaseline;
      state.resetSharedBtn.setAttribute(
        'data-tooltip',
        hasSharedBaseline
          ? 'Restore the last version you shared.'
          : 'Share this form first to create a shared baseline.'
      );
    }
  }

  function saveCurrentFormAsSharedBaseline() {
    if (!state.active || !state.spec) {
      return false;
    }

    captureCurrentControlDefaults();
    const nextSpec = cloneSpec(state.spec);
    if (!nextSpec) {
      return false;
    }

    state.sharedBaselineSpec = nextSpec;
    const shareUrl = buildCurrentShareUrl();
    state.sharedBaselineSearchParams = shareUrl
      ? new URL(shareUrl).searchParams
      : new URLSearchParams();
    return true;
  }

  function stopRunningQueryForReset() {
    const lifecycleState = QueryStateReaders.getLifecycleState();
    if (lifecycleState.queryRunning && lifecycleState.currentQueryId) {
      Promise.resolve(services.cancelHistoryQuery(lifecycleState.currentQueryId)).catch(console.error);
      QueryChangeManager.setLifecycleState({ queryRunning: false }, { source: 'QueryFormMode.reset.stopQuery', silent: true });
      uiActions.updateRunButtonIcon();
    }
  }

  function clearRenderedQueryResults() {
    services.clearVirtualTableData();

    QueryTableView.renderEmptyQueryTableState();
  }

  function resetFormToBaseline(kind) {
    const isShared = kind === 'shared';
    const nextSpec = cloneSpec(isShared ? state.sharedBaselineSpec : state.initialSpec) || cloneSpec(state.spec);
    const nextSearchParamsSource = isShared ? state.sharedBaselineSearchParams : state.initialSearchParams;

    if (!nextSpec) {
      return;
    }

    state.searchParams = nextSearchParamsSource ? new URLSearchParams(nextSearchParamsSource.toString()) : new URLSearchParams();
    state.spec = nextSpec;
    state.lastSuggestedTableName = '';
    state.suppressAutoTableNameOnce = false;
    state.forceTableNameSyncOnce = true;

    stopRunningQueryForReset();
    clearRenderedQueryResults();

    rebuildFormCardFromSpec({
      preserveCurrentDefaults: false,
      applyState: true,
      refreshUrl: true,
      clearSearchParams: false,
      querySource: isShared ? 'QueryFormMode.resetToShared' : 'QueryFormMode.resetToOriginal'
    });
  }

  function refreshBrowserUrl(options = {}) {
    const forceShareUrl = options.forceShareUrl === true;
    const forceClearUrl = options.forceClearUrl === true;
    const nextUrl = (forceShareUrl || (!forceClearUrl && shouldPersistFormUrlInBrowser()))
      ? buildCurrentShareUrl()
      : buildClearedBrowserUrl(window.location.href);

    if (state.lastBrowserUrl === nextUrl || window.location.href === nextUrl) {
      state.lastBrowserUrl = nextUrl;
      syncShareUi();
      return nextUrl;
    }

    window.history.replaceState({}, '', nextUrl);
    state.lastBrowserUrl = nextUrl;
    syncShareUi();
    return nextUrl;
  }

  function hasSpecColumn(fieldName) {
    if (!state.spec || !Array.isArray(state.spec.columns)) return false;
    const baseFieldName = getBaseFieldName(fieldName);

    return state.spec.columns.some(column => {
      const baseColumnName = getBaseFieldName(column);
      return baseColumnName === baseFieldName;
    });
  }

  function hasSpecFilterInput(fieldName) {
    if (!state.spec || !Array.isArray(state.spec.inputs)) return false;
    const baseFieldName = getBaseFieldName(fieldName);

    return state.spec.inputs.some(inputSpec => {
      const baseInputField = getBaseFieldName(inputSpec.field);
      return baseInputField === baseFieldName;
    });
  }

  function removeSpecFilterInputs(fieldName) {
    if (!state.spec || !Array.isArray(state.spec.inputs)) return;
    const baseFieldName = getBaseFieldName(fieldName);

    state.spec.inputs = state.spec.inputs.filter(inputSpec => {
      const baseInputField = getBaseFieldName(inputSpec.field);
      return baseInputField !== baseFieldName;
    });
  }

  function removeSpecInputByKey(inputKey) {
    if (!state.spec || !Array.isArray(state.spec.inputs) || !inputKey) return;
    state.spec.inputs = state.spec.inputs.filter(inputSpec => inputSpec.key !== inputKey);
  }

  function captureCurrentControlDefaults(excludedInputKey = '') {
    if (!state.spec || !Array.isArray(state.spec.inputs) || state.controls.size === 0) {
      return;
    }

    state.spec.inputs.forEach(inputSpec => {
      if (excludedInputKey && inputSpec.key === excludedInputKey) {
        return;
      }
      const fieldDef = fieldDefs ? fieldDefs.get(inputSpec.field) : null;
      syncInputSpecFromState(inputSpec, {
        operator: inputSpec.operator,
        values: getControlValues(inputSpec)
      }, fieldDef);
    });
  }

  function clearFormControlDefaults() {
    if (!state.spec || !Array.isArray(state.spec.inputs)) {
      return;
    }

    state.spec.inputs.forEach(inputSpec => {
      if (inputSpec.operator === 'between') {
        inputSpec.defaultValue = ['', ''];
        return;
      }

      inputSpec.defaultValue = inputSpec.multiple ? [] : '';
    });
  }

  function cleanupFormControls() {
    state.controls.forEach(control => {
      if (control && typeof control._cleanupPopup === 'function') {
        control._cleanupPopup();
      }
    });
    state.controls.clear();
  }

  function resetActiveFormAfterClear() {
    if (!state.active || !state.spec) {
      return;
    }

    state.searchParams = new URLSearchParams();
    state.lastSuggestedTableName = '';
    state.suppressAutoTableNameOnce = true;
    clearFormControlDefaults();
    cleanupFormControls();

    // A full query clear should leave form mode with no active query structure,
    // regardless of whether the form came from the URL or was generated locally.
    // Reset can still restore the original spec from state.initialSpec.
    state.spec.title = '';
    state.spec.queryName = '';
    state.spec.inputs = [];
    state.spec.columns = [];
    state.spec.lockedFilters = [];

    if (state.formCard && state.formCard.parentNode) {
      state.formCard.parentNode.removeChild(state.formCard);
    }

    rebuildFormCardFromSpec({
      preserveCurrentDefaults: false,
      applyState: false,
      refreshUrl: false,
      clearSearchParams: true
    });
    refreshBrowserUrl({ forceClearUrl: true });
  }

  function rebuildFormCardFromSpec(options = {}) {
    const {
      preserveCurrentDefaults = true,
      applyState = true,
      refreshUrl = true,
      clearSearchParams = true,
      querySource = 'QueryFormMode.rebuildFormCard'
    } = options;

    if (preserveCurrentDefaults) {
      captureCurrentControlDefaults();
    }
    if (clearSearchParams) {
      state.searchParams = new URLSearchParams();
    }
    cleanupFormControls();
    buildFormCard();
    if (applyState) {
      applyFormState({ source: querySource });
    } else {
      const bindings = collectFormBindings(state.spec, getCurrentInputValues, supportsMultipleValues, getInputParamKeys);
      syncFormTableName(state, bindings, interpolateValue);
      syncFormHeaderCopy(state.formCard, state.spec, bindings, interpolateValue);
      syncValidationUi();
    }
    syncPresentationMode();

    uiActions.updateButtonStates();

    if (refreshUrl) {
      refreshBrowserUrl();
    }
  }

  async function activateGeneratedFormFromCurrentQuery() {
    if (typeof loadFieldDefinitions === 'function') {
      await loadFieldDefinitions();
    }

    const nextSpec = buildSpecFromCurrentQuery();
    if (!nextSpec) {
      showToastMessage('Could not build form definition.', 'warning');
      return false;
    }

    state.active = true;
    state.specSource = 'generated';
    state.spec = nextSpec;
    state.initialSpec = cloneSpec(nextSpec);
    state.sharedBaselineSpec = null;
    state.searchParams = new URLSearchParams();
    state.initialSearchParams = new URLSearchParams();
    state.sharedBaselineSearchParams = null;
    state.viewMode = 'form';
    state.controls.clear();

    buildFormCard();
    wrapUpdateButtonStates();
    applyFormState({ source: 'QueryFormMode.activateGeneratedForm' });
    syncPresentationMode();

    uiActions.updateButtonStates();

    refreshBrowserUrl();
    return true;
  }

  async function syncGeneratedFormFromCurrentQuery(options = {}) {
    if (typeof loadFieldDefinitions === 'function') {
      await loadFieldDefinitions();
    }

    const nextSpec = buildSpecFromCurrentQuery();
    if (!nextSpec) {
      return false;
    }

    state.active = true;
    state.specSource = 'generated';
    state.spec = nextSpec;
    state.initialSpec = cloneSpec(nextSpec);
    state.sharedBaselineSpec = state.sharedBaselineSpec ? cloneSpec(state.sharedBaselineSpec) : null;
    state.searchParams = new URLSearchParams();

    if (options.forceFormMode) {
      state.viewMode = 'form';
    }

    if (state.viewMode === 'form' || options.rebuildCard) {
      state.controls.clear();
      buildFormCard();
      wrapUpdateButtonStates();
      applyFormState({ source: 'QueryFormMode.syncGeneratedForm' });
      syncPresentationMode();

      uiActions.updateButtonStates();
    }

    refreshBrowserUrl();
    return true;
  }

  function createGeneratedInputSpec(fieldName) {
    return buildFormModeInputSpec(
      fieldName,
      state.spec && Array.isArray(state.spec.inputs) ? state.spec.inputs : [],
      uniqueInputKey,
      normalizeOperatorForField
    );
  }

  async function openFieldPicker() {
    await SharedFieldPicker.open({
      beforeOpen: async () => {
        if (typeof loadFieldDefinitions === 'function') {
          await loadFieldDefinitions();
        }
        syncSpecColumnsWithDisplayedFields({ refreshUrl: false });
      },
      getOptions: getFieldPickerOptions,
      labels: {
        kicker: 'Add Field',
        title: 'Choose a field for this form',
        description: 'Select a field to add it to results, then optionally set a filter right away.',
        displayChoice: 'Display in results',
        displayBadge: 'Displayed',
        filterBadge: 'Filter',
        selectedFieldLabel: 'Selected field',
        footerNote: 'Filters are added automatically once the preview has a value.'
      },
      autoDisplayOnSelect: true,
      showDisplayChoice: false,
      autoAddFilterFromPreview: true,
      getFieldState: fieldName => ({
        display: hasSpecColumn(fieldName),
        filter: hasSpecFilterInput(fieldName)
      }),
      renderFilterPreview: (container, fieldName, context = {}) => {
        if (!container || !state.spec || !fieldDefs) {
          return null;
        }

        const fieldDef = fieldDefs.get(fieldName);
        if (!fieldDef || (typeof isFieldBackendFilterable === 'function' && !isFieldBackendFilterable(fieldDef))) {
          return null;
        }

        const existingInputSpec = Array.isArray(state.spec.inputs)
          ? state.spec.inputs.find(inputSpec => inputSpec && inputSpec.field === fieldName)
          : null;
        const draftPreviewState = context.previewState && context.previewState.fieldName === fieldName
          ? context.previewState
          : null;
        const previewInputSpec = existingInputSpec
          ? JSON.parse(JSON.stringify(existingInputSpec))
          : createGeneratedInputSpec(fieldName);

        if (!previewInputSpec) {
          return null;
        }

        previewInputSpec.operator = normalizeOperatorForField(
          fieldDef,
          (draftPreviewState && draftPreviewState.operator) || previewInputSpec.operator || 'equals'
        );
        assignInputSpecDefaultValues(
          previewInputSpec,
          draftPreviewState
            ? draftPreviewState.values
            : (existingInputSpec ? getCurrentInputValues(existingInputSpec) : getInputSpecDefaultValues(previewInputSpec)),
          fieldDef
        );

        let control = null;
        let previewRow = null;
        function renderPreviewControl() {
          control = createFormControl(
            fieldDef,
            previewInputSpec,
            getInputSpecDefaultValues(previewInputSpec),
            previewInputSpec.operator,
            normalizeOperatorForField
          );
          previewRow = createFormFieldRow({
            inputSpec: previewInputSpec,
            fieldDef,
            control,
            normalizeOperatorForField,
            removeSpecInputByKey: () => {},
            rebuildFormCardFromSpec: () => {},
            captureCurrentControlDefaults: () => {},
            showRemoveButton: false,
            onOperatorChange: nextOperator => {
              const previousValues = getPreviewState().values;
              previewInputSpec.operator = normalizeOperatorForField(fieldDef, nextOperator);
              assignInputSpecDefaultValues(previewInputSpec, previousValues, fieldDef);
              renderPreviewControl();
            }
          });
          previewRow.classList.add('form-mode-field-picker-preview-row');
          container.replaceChildren(previewRow);

          const notifyPreviewChange = typeof context.onPreviewChange === 'function'
            ? context.onPreviewChange
            : null;
          if (notifyPreviewChange) {
            const emitPreviewChange = () => {
              window.setTimeout(() => notifyPreviewChange(getPreviewState()), 0);
            };

            // Listen at the row level so wrapped controls that emit change/input
            // from custom container elements still propagate into form state.
            ['input', 'change', 'click'].forEach(eventName => {
              previewRow.addEventListener(eventName, emitPreviewChange);
            });
          }
        }

        function getPreviewState() {
          const values = control && typeof control.getFormValues === 'function'
            ? control.getFormValues()
            : getInputSpecDefaultValues(previewInputSpec);
          return {
            fieldName,
            operator: previewInputSpec.operator,
            values: Array.isArray(values) ? values.map(value => String(value ?? '').trim()) : []
          };
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
      },
      onDisplayChange: async (fieldName, nextChecked) => {
        if (!state.spec) return;

        if (nextChecked) {
          if (!QueryStateReaders.hasDisplayedField(fieldName)) {
            QueryChangeManager.addDisplayedField(fieldName, {
              source: 'QueryFormMode.fieldPicker.addDisplayedField'
            });
            syncSpecColumnsWithDisplayedFields({ refreshUrl: false });
            refreshBrowserUrl();
            showToastMessage(`${fieldName}: added results column.`, 'success');
          }
          return;
        }

        if (QueryStateReaders.hasDisplayedField(fieldName)) {
          QueryChangeManager.hideField(fieldName, {
            source: 'QueryFormMode.fieldPicker.removeDisplayedField'
          });
          syncSpecColumnsWithDisplayedFields({ refreshUrl: false });
          refreshBrowserUrl();
          showToastMessage(`${fieldName}: removed results column.`, 'success');
        }
      },
      onFilterChange: async (fieldName, nextChecked, options = {}) => {
        if (!state.spec) return;

        if (nextChecked) {
          if (!hasSpecFilterInput(fieldName)) {
            captureCurrentControlDefaults();
            const inputSpec = createGeneratedInputSpec(fieldName);
            if (!inputSpec) {
              showToastMessage(`${fieldName}: backend filtering is not available for this field.`, 'warning');
              return;
            }

            const previewState = typeof options.getFilterPreviewState === 'function'
              ? options.getFilterPreviewState()
              : null;
            const fieldDef = fieldDefs ? fieldDefs.get(fieldName) : null;
            if (previewState && previewState.fieldName === fieldName) {
              syncInputSpecFromState(inputSpec, previewState, fieldDef);
            }

            state.spec.inputs.push(inputSpec);
            rebuildFormCardFromSpec({
              preserveCurrentDefaults: false,
              querySource: 'QueryFormMode.fieldPicker.addFilterInput'
            });
            showToastMessage(`${fieldName}: added filter control.`, 'success');
          }
          return;
        }

        if (hasSpecFilterInput(fieldName)) {
          removeSpecFilterInputs(fieldName);
          rebuildFormCardFromSpec({ querySource: 'QueryFormMode.fieldPicker.removeFilterInput' });
          showToastMessage(`${fieldName}: removed filter control.`, 'success');
        }
      },
      onFilterPreviewChange: async (fieldName, previewState, options = {}) => {
        if (!state.spec || !previewState) {
          return;
        }

        let targetInputSpec = state.spec.inputs.find(inputSpec => inputSpec && inputSpec.field === fieldName);
        const fieldDef = fieldDefs ? fieldDefs.get(fieldName) : null;

        if (!targetInputSpec) {
          captureCurrentControlDefaults();
          targetInputSpec = createGeneratedInputSpec(fieldName);
          if (!targetInputSpec) {
            return;
          }
          const previousOperator = targetInputSpec.operator;
          syncInputSpecFromState(targetInputSpec, previewState, fieldDef);
          state.spec.inputs.push(targetInputSpec);

          if (options.isNewFilter) {
            rebuildFormCardFromSpec({
              preserveCurrentDefaults: false,
              querySource: 'QueryFormMode.fieldPicker.addFilterInput'
            });
            syncMountedControlFromInputSpec(targetInputSpec, {
              previousOperator,
              querySource: 'QueryFormMode.fieldPicker.addFilterInput'
            });
            applyFormState({ source: 'QueryFormMode.fieldPicker.previewUpdate' });
            syncValidationUi();
            uiActions.updateButtonStates();
            return;
          }
        }

        const previousOperator = targetInputSpec.operator;
        syncInputSpecFromState(targetInputSpec, previewState, fieldDef);
        syncMountedControlFromInputSpec(targetInputSpec, {
          previousOperator,
          querySource: 'QueryFormMode.fieldPicker.previewUpdate'
        });
        applyFormState({ source: 'QueryFormMode.fieldPicker.previewUpdate' });
        syncValidationUi();
        uiActions.updateButtonStates();
      }
    });
  }

  function getControlValues(inputSpec) {
    const control = state.controls.get(inputSpec.key);
    if (!control || typeof control.getFormValues !== 'function') {
      return [];
    }

    const values = control.getFormValues();
    if (!Array.isArray(values)) return [];
    return values.map(value => String(value ?? '').trim());
  }

  function getCurrentInputValues(inputSpec) {
    const controlValues = getControlValues(inputSpec);
    if (inputSpec && inputSpec.operator === 'between') {
      if (controlValues.length > 0) {
        return [controlValues[0] || '', controlValues[1] || ''];
      }
      return getInputSpecDefaultValues(inputSpec).slice(0, 2);
    }

    const nonEmptyControlValues = controlValues.filter(value => value !== '');
    if (nonEmptyControlValues.length > 0) {
      return nonEmptyControlValues;
    }

    return getInputSpecDefaultValues(inputSpec).filter(value => value !== '');
  }

  function syncMountedControlFromInputSpec(inputSpec, options = {}) {
    if (!inputSpec) {
      return;
    }

    const {
      previousOperator = inputSpec.operator,
      querySource = 'QueryFormMode.syncMountedControl'
    } = options;

    let mountedControl = state.controls.get(inputSpec.key);

    if (previousOperator !== inputSpec.operator) {
      captureCurrentControlDefaults(inputSpec.key);
      rebuildFormCardFromSpec({
        preserveCurrentDefaults: false,
        querySource
      });
      mountedControl = state.controls.get(inputSpec.key);
    }

    if (!mountedControl) {
      return;
    }

    const nextValues = getInputSpecDefaultValues(inputSpec);
    if (typeof mountedControl.setFormValues === 'function') {
      mountedControl.setFormValues(nextValues);
      return;
    }

    if (typeof mountedControl.setSelectedValues === 'function') {
      mountedControl.setSelectedValues(nextValues);
    }
  }

  function applyFormState(options = {}) {
    if (!state.active || !state.spec) return;

    const source = options.source || 'QueryFormMode.applyFormState';

    const bindings = collectFormBindings(state.spec, getCurrentInputValues, supportsMultipleValues, getInputParamKeys);
    syncFormTableName(state, bindings, interpolateValue);
    syncFormHeaderCopy(state.formCard, state.spec, bindings, interpolateValue);

    const columns = state.spec.columns.slice();
    ensureColumnsRegistered(columns);
    const nextActiveFilters = buildActiveFilters(
      state.spec,
      bindings,
      getCurrentInputValues,
      supportsMultipleValues,
      interpolateValue
    );

    state.isApplyingFormState = true;
    try {
      QueryChangeManager.setQueryState({
        displayedFields: columns,
        activeFilters: nextActiveFilters
      }, { source });
    } finally {
      state.isApplyingFormState = false;
    }

    refreshBrowserUrl();
  }

  function getValidationError() {
    return getFormValidationError(state, state.controls, getControlValues, getFieldInputType);
  }

  function syncValidationUi() {
    const error = getValidationError();
    if (state.validationEl) {
      state.validationEl.textContent = error;
      state.validationEl.classList.toggle('hidden', !error);
    }

    if (state.runBtn) {
      state.runBtn.disabled = Boolean(error) || Boolean(DOM && DOM.runBtn && DOM.runBtn.disabled);
    }

    return error;
  }

  function buildCurrentShareUrl() {
    return buildFormShareUrl(window.location.href, state.spec, {
      fieldDefs,
      getInputValues: getCurrentInputValues,
      supportsMultipleValues,
      tableName: getCurrentTableNameValue()
    });
  }

  function syncPresentationMode() {
    const isLimitedView = state.active && state.limitedView;
    const querySearchBlock = document.getElementById('query-input') && document.getElementById('query-input').closest('.mb-6');
    const categoryBar = document.getElementById('category-bar');
    const mobileCategorySelector = document.getElementById('mobile-category-selector');
    const bubbleStage = document.getElementById('bubble-container') && document.getElementById('bubble-container').closest('.flex.items-start.justify-center');
    const hiddenControlIds = ['toggle-json', 'toggle-queries'];
    document.body.classList.toggle('form-mode-active', state.viewMode === 'form');

    [querySearchBlock, categoryBar, mobileCategorySelector].filter(Boolean).forEach(node => {
      node.classList.toggle('form-mode-hidden', state.viewMode === 'form');
    });

    if (bubbleStage) {
      bubbleStage.classList.toggle('form-mode-stage-active', state.viewMode === 'form');
    }

    if (state.formHost) {
      state.formHost.classList.toggle('hidden', state.viewMode !== 'form');
    }

    if (state.formCard) {
      state.formCard.classList.toggle('hidden', state.viewMode !== 'form');
    }

    hiddenControlIds.forEach(id => {
      const control = document.getElementById(id);
      if (control) {
        control.classList.toggle('hidden', isLimitedView);
      }
    });

    if (state.modeToggleBtn) {
      state.modeToggleBtn.classList.toggle('hidden', isLimitedView);
      state.modeToggleBtn.setAttribute('data-tooltip', state.viewMode === 'form' ? 'Switch to bubble builder' : 'Switch to form mode');
      state.modeToggleBtn.setAttribute('data-tooltip-delay', '0');
      state.modeToggleBtn.setAttribute('aria-label', state.viewMode === 'form' ? 'Switch to bubble builder' : 'Switch to form mode');
      const formIcon = state.modeToggleBtn.querySelector('[data-form-mode-icon="form"]');
      const bubbleIcon = state.modeToggleBtn.querySelector('[data-form-mode-icon="bubbles"]');
      if (formIcon) {
        formIcon.classList.toggle('hidden', state.viewMode === 'form');
      }
      if (bubbleIcon) {
        bubbleIcon.classList.toggle('hidden', state.viewMode !== 'form');
      }
    }

    if (state.modeToggleBtn) {
      state.modeToggleBtn.dataset.mobileMenuLabel = state.viewMode === 'form' ? 'Bubble Mode' : 'Form Mode';
    }

    uiActions.updateFilterSidePanel();
    QueryTableView.syncEmptyTableMessage();
  }

  function refreshBubbleStageAfterModeSwitch() {
    if (!services.bubble?.safeRenderBubbles) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        services.rerenderBubbles();
      });
    });
  }

  async function setViewMode(nextMode, options = {}) {
    const requestedMode = state.limitedView
      ? 'form'
      : (nextMode === 'bubbles' ? 'bubbles' : 'form');

    if (requestedMode === 'form' && !state.active) {
      const activated = await activateGeneratedFormFromCurrentQuery();
      if (!activated) {
        return;
      }
    } else if (requestedMode === 'form' && state.active && state.specSource === 'generated') {
      // Re-entering form mode after changes in bubble mode: sync spec and rebuild controls
      // so the form reflects the current query state rather than stale control values.
      await syncGeneratedFormFromCurrentQuery({ forceFormMode: true, rebuildCard: true });
    }

    state.viewMode = requestedMode;
    syncPresentationMode();

    if (requestedMode === 'bubbles') {
      refreshBubbleStageAfterModeSwitch();
    }

    if (options.updateUrl !== false) {
      refreshBrowserUrl();
    }
  }

  function toggleViewMode() {
    setViewMode(state.viewMode === 'form' ? 'bubbles' : 'form').catch(error => {
      console.error('Failed to toggle form mode:', error);
      showToastMessage('Failed to switch modes.', 'error');
    });
  }

  function scheduleApply() {
    applyFormState({ source: 'QueryFormMode.scheduleApply' });
    uiActions.updateButtonStates();
    syncValidationUi();
  }

  function buildFormCard() {
    // Cleanup any previously body-appended popups from prior form card builds
    state.controls.forEach(function(control) {
      if (typeof control._cleanupPopup === 'function') control._cleanupPopup();
    });

    const bubbleStage = document.getElementById('bubble-container') && document.getElementById('bubble-container').closest('.flex.items-start.justify-center');
    if (!bubbleStage) return;

    let host = document.getElementById('form-mode-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'form-mode-host';
      host.className = 'form-mode-host hidden';
      bubbleStage.insertBefore(host, bubbleStage.firstChild);
    }

    state.formHost = host;
    if (!host) return;

    const card = document.createElement('section');
    card.id = 'form-mode-card';
    card.className = 'form-mode-card';
    card.innerHTML = `
      <div class="form-mode-header">
        <div>
          <h2 class="form-mode-title" data-form-mode-title></h2>
          <p class="form-mode-description hidden" data-form-mode-description></p>
        </div>
        <div class="form-mode-actions">
          <button type="button" id="form-mode-add-field" class="form-mode-btn form-mode-btn-secondary">+ Add Field</button>
          <button type="button" id="form-mode-run" class="form-mode-btn form-mode-btn-primary">Run Form</button>
          <button type="button" id="form-mode-reset-original" class="form-mode-btn" data-tooltip="Restore the original form version.">Reset to Original</button>
          <button type="button" id="form-mode-reset-shared" class="form-mode-btn" data-tooltip="Share this form first to create a shared baseline.">Reset to Last Shared</button>
          <button type="button" id="form-mode-copy" class="form-mode-btn">Share</button>
        </div>
      </div>
      <div class="form-mode-body">
        <div id="form-mode-fields" class="form-mode-fields"></div>
        <p id="form-mode-validation" class="form-mode-validation hidden"></p>
      </div>
    `;

    host.innerHTML = '';
    host.appendChild(card);
    state.formCard = card;
    state.validationEl = card.querySelector('#form-mode-validation');
    state.runBtn = card.querySelector('#form-mode-run');
    state.copyBtn = card.querySelector('#form-mode-copy');
    state.resetOriginalBtn = card.querySelector('#form-mode-reset-original');
    state.resetSharedBtn = card.querySelector('#form-mode-reset-shared');

    const fieldsWrap = card.querySelector('#form-mode-fields');
    const visibleInputs = state.spec.inputs.filter(inputSpec => !inputSpec.hidden);

    if (visibleInputs.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'form-mode-empty-state';
      emptyState.innerHTML = `
        <strong>No filters yet.</strong>
        <p>This form does not have any filter controls yet. Use "Add Filter" to add one.</p>
      `;
      fieldsWrap.appendChild(emptyState);
    }

    visibleInputs.forEach(inputSpec => {
      const fieldDef = fieldDefs ? fieldDefs.get(inputSpec.field) : null;
      inputSpec.operator = normalizeOperatorForField(fieldDef, inputSpec.operator);
      const control = createFormControl(
        fieldDef,
        inputSpec,
        resolveFormInputInitialValues(inputSpec, state.searchParams, getInputParamKeys, splitListValues),
        inputSpec.operator,
        normalizeOperatorForField
      );
      control.addEventListener('change', scheduleApply);
      control.addEventListener('input', scheduleApply);
      state.controls.set(inputSpec.key, control);
      fieldsWrap.appendChild(createFormFieldRow({
        inputSpec,
        fieldDef,
        control,
        normalizeOperatorForField,
        removeSpecInputByKey,
        rebuildFormCardFromSpec,
        captureCurrentControlDefaults
      }));
    });

    state.runBtn.addEventListener('click', () => {
      const error = syncValidationUi();
      if (error) {
        showToastMessage(error, 'warning');
        return;
      }
      DOM && DOM.runBtn && DOM.runBtn.click();
    });

    card.querySelector('#form-mode-add-field').addEventListener('click', () => {
      openFieldPicker().catch(error => {
        console.error('Failed to open field picker:', error);
        showToastMessage('Failed to open the field picker.', 'error');
      });
    });

    state.resetOriginalBtn.addEventListener('click', () => {
      resetFormToBaseline('original');
    });

    state.resetSharedBtn.addEventListener('click', () => {
      if (!state.sharedBaselineSpec) {
        showToastMessage('Share this form first to create a shared baseline.', 'warning');
        return;
      }
      resetFormToBaseline('shared');
    });

    state.copyBtn.addEventListener('click', async () => {
      const saved = saveCurrentFormAsSharedBaseline();
      if (!saved) {
        showToastMessage('No form link is available to share.', 'warning');
        return;
      }

      await ClipboardUtils.copyFromSource(() => buildCurrentShareUrl(), {
        successMessage: 'Shared link copied. Reset to Last Shared now returns to this version.',
        errorMessage: 'Failed to copy form link.',
        emptyMessage: 'No form link is available to share.'
      });
    });
    syncShareUi();
  }

  function ensureModeToggleButtons() {
    const headerControls = document.getElementById('header-controls');
    if (headerControls && !state.modeToggleBtn) {
      const button = document.createElement('button');
      button.id = 'form-mode-toggle-btn';
      button.type = 'button';
      button.className = 'p-2 rounded-full bg-white hover:bg-gray-100 text-black focus:outline-none transition-colors border border-gray-200';
      button.innerHTML = `
        <svg data-form-mode-icon="form" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 pointer-events-none">
          <rect x="4" y="4" width="16" height="16" rx="2"></rect>
          <path d="M8 8h8"></path>
          <path d="M8 12h8"></path>
          <path d="M8 16h5"></path>
        </svg>
        <svg data-form-mode-icon="bubbles" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 pointer-events-none hidden">
          <circle cx="12" cy="12" r="7"></circle>
          <path d="M9 17.4c.95.72 2.13 1.1 3.4 1.1 3.09 0 5.68-2.26 6.2-5.2"></path>
          <path d="M8 9.2c.62-2.02 2.49-3.5 4.7-3.5 1.17 0 2.25.42 3.08 1.12"></path>
          <circle cx="9.3" cy="8.7" r="1.15" fill="currentColor" stroke="none" opacity="0.32"></circle>
        </svg>
      `;
      button.addEventListener('click', toggleViewMode);
      headerControls.insertBefore(button, document.getElementById('toggle-json'));
      state.modeToggleBtn = button;
    }

    syncPresentationMode();
  }

  function wrapUpdateButtonStates() {
    if (state.originalUpdateButtonStates || typeof QueryUI.updateButtonStates !== 'function') return;

    state.originalUpdateButtonStates = typeof QueryUI.getBaseUpdateButtonStates === 'function'
      ? QueryUI.getBaseUpdateButtonStates()
      : QueryUI.updateButtonStates;
    QueryUI.setUpdateButtonStatesImpl(function wrappedFormModeUpdateButtonStates() {
      state.originalUpdateButtonStates();
      if (!state.active) return;

      const error = syncValidationUi();
      if (error && DOM && DOM.runBtn) {
        DOM.runBtn.disabled = true;
        uiActions.updateRunButtonIcon(error);
      }
    });
  }

  function bindTableNameUrlSync() {
    if (state.tableNameListenersBound) {
      return;
    }

    const tableNameInput = DOM && DOM.tableNameInput;
    if (!tableNameInput) {
      return;
    }

    tableNameInput.placeholder = 'No name';

    const syncBrowserUrl = () => {
      if (!state.active || !state.spec || state.isClearingQuery) {
        return;
      }

      const currentTableName = tableNameInput.value.trim();
      state.spec.title = currentTableName;
      state.spec.queryName = currentTableName;

      const bindings = collectFormBindings(state.spec, getCurrentInputValues, supportsMultipleValues, getInputParamKeys);
      syncFormHeaderCopy(state.formCard, state.spec, bindings, interpolateValue);
      refreshBrowserUrl();
    };

    tableNameInput.addEventListener('input', syncBrowserUrl);
    tableNameInput.addEventListener('change', syncBrowserUrl);
    state.tableNameListenersBound = true;
  }

  function deferCompletedClearReset() {
    const runReset = () => {
      if (!state.active) {
        state.isClearingQuery = false;
        return;
      }

      try {
        resetActiveFormAfterClear();
      } finally {
        state.isClearingQuery = false;
      }
    };

    if (typeof window.queueMicrotask === 'function') {
      window.queueMicrotask(runReset);
      return;
    }

    Promise.resolve().then(runReset);
  }

  function queueQueryStateReconcile(options = {}) {
    const nextOptions = {
      rebuildCard: Boolean(options.rebuildCard),
      refreshUrl: options.refreshUrl !== false
    };

    if (state.pendingQuerySync) {
      state.pendingQuerySync.rebuildCard = state.pendingQuerySync.rebuildCard || nextOptions.rebuildCard;
      state.pendingQuerySync.refreshUrl = state.pendingQuerySync.refreshUrl || nextOptions.refreshUrl;
    } else {
      state.pendingQuerySync = nextOptions;
    }

    if (state.querySyncQueued) {
      return;
    }

    state.querySyncQueued = true;
    const runSync = () => {
      state.querySyncQueued = false;
      const queuedOptions = state.pendingQuerySync;
      state.pendingQuerySync = null;

      if (!queuedOptions || !state.active || state.isClearingQuery || state.isApplyingFormState) {
        return;
      }

      syncActiveSpecWithCurrentQuery(queuedOptions);

      if (state.viewMode === 'form') {
        syncValidationUi();
      }
    };

    if (typeof window.queueMicrotask === 'function') {
      window.queueMicrotask(runSync);
      return;
    }

    Promise.resolve().then(runSync);
  }

  function getQueryStateSyncOptions(event) {
    const source = String(event && event.meta && event.meta.source || '');
    if (source === 'QueryChangeManager.clearQuery') {
      return { action: 'clear' };
    }

    if (state.isClearingQuery) {
      return { action: 'skip' };
    }

    const hasActiveFilterChanges = Boolean(event && event.changes && event.changes.activeFilters);
    const baseOptions = {
      rebuildCard: Boolean(state.viewMode === 'form' && hasActiveFilterChanges),
      refreshUrl: true
    };

    if (state.isApplyingFormState) {
      return {
        action: 'queue',
        options: {
          rebuildCard: false,
          refreshUrl: baseOptions.refreshUrl
        }
      };
    }

    return {
      action: 'sync',
      options: baseOptions
    };
  }

  async function initialize() {
    if (initialized) {
      return;
    }

    initialized = true;
    const searchParams = new URLSearchParams(window.location.search);
    state.initialSearchParams = new URLSearchParams(window.location.search);
    state.searchParams = searchParams;
    state.lastBrowserUrl = window.location.href;

    if (!state.unsubscribeQueryState) {
      state.unsubscribeQueryState = QueryStateSubscriptions.subscribe(event => {
        if (!state.active) {
          return;
        }

        const syncPlan = getQueryStateSyncOptions(event);
        if (syncPlan.action === 'clear') {
          state.isClearingQuery = true;
          deferCompletedClearReset();
          return;
        }

        if (syncPlan.action === 'skip') {
          return;
        }

        if (syncPlan.action === 'queue') {
          queueQueryStateReconcile(syncPlan.options);
          return;
        }

        syncActiveSpecWithCurrentQuery(syncPlan.options);

        if (state.viewMode === 'form') {
          syncValidationUi();
        }
      }, {
        displayedFields: true,
        activeFilters: true,
        predicate: () => state.active
      });
    }

    wrapUpdateButtonStates();
    bindTableNameUrlSync();
    ensureModeToggleButtons();

    const rawFormSpec = searchParams.get('form');
    if (!rawFormSpec) {
      await setViewMode('form', { updateUrl: false });
      return;
    }

    let decodedSpec;
    try {
      decodedSpec = normalizeSpec(decodeSpec(rawFormSpec));
    } catch (error) {
      console.error('Failed to parse form mode spec:', error);
      showToastMessage('Invalid form URL. Opening standard builder.', 'error');
      return;
    }

    if (!decodedSpec || decodedSpec.columns.length === 0) {
      showToastMessage('Form mode requires at least one output column.', 'warning');
      return;
    }

    state.active = true;
    state.specSource = 'url';
    state.spec = decodedSpec;
    state.limitedView = resolveLimitedView(decodedSpec, searchParams);
    state.spec.limitedView = state.limitedView;
    state.initialSpec = cloneSpec(decodedSpec);
    state.sharedBaselineSpec = null;
    state.searchParams = searchParams;
    state.sharedBaselineSearchParams = null;
    state.viewMode = state.limitedView
      ? 'form'
      : (searchParams.get('mode') === 'bubbles' ? 'bubbles' : 'form');

    if (typeof loadFieldDefinitions === 'function') {
      await loadFieldDefinitions();
    }

    services.clearVirtualTableData();

    state.controls.clear();
    buildFormCard();
    ensureModeToggleButtons();
    applyFormState({ source: 'QueryFormMode.initializeFromUrl' });
    syncPresentationMode();
    state.searchParams = new URLSearchParams();
    refreshBrowserUrl();
    uiActions.updateButtonStates();
  }

  QueryFormMode = {
    initialize,
    encodeSpec,
    decodeSpec,
    async activateFromCurrentQuery() {
      return activateGeneratedFormFromCurrentQuery();
    },
    async syncFromCurrentQuery(options = {}) {
      return syncGeneratedFormFromCurrentQuery(options);
    },
    isActive() {
      return state.active;
    },
    isLimitedView() {
      return state.active && state.limitedView;
    },
    getValidationError,
    buildCurrentShareUrl
  };
  registerFormModeService(QueryFormMode);
})();

export { QueryFormMode };
