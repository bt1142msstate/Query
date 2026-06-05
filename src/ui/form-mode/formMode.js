import { appServices, registerFormModeService } from '../../core/appServices.js';
import { appUiActions } from '../../core/appUiActions.js';
import { ClipboardUtils } from '../../core/clipboard.js';
import { QueryChangeManager, getBaseFieldName, QueryStateReaders } from '../../core/queryState.js';
import { showToastMessage } from '../../core/toast.js';
import { QueryStateSubscriptions } from '../../core/queryStateSubscriptions.js';
import { createFormModeEmptyState, getVisibleFormInputs, mountFormModeCard } from './formModeCard.js';
import { buildInteractiveFormModeCard } from './formModeCardBuilder.js';
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
  clearFormSpecControlDefaults,
  hasSpecColumn as hasFormSpecColumn,
  hasSpecFilterInput as hasFormSpecFilterInput,
  removeSpecFilterInputs as removeFormSpecFilterInputs,
  removeSpecInputByKey as removeFormSpecInputByKey,
  resetFormSpecToEmptyQuery
} from './formModeSpecMutations.js';
import {
  resolveRequestedFormViewMode,
  syncFormModePresentation
} from './formModePresentation.js';
import {
  buildGeneratedInputSpecsFromActiveFilters,
  getDisplayableFormColumns,
  getInputSpecDefaultValues,
  normalizeOperatorForField,
  syncInputSpecFromState,
  uniqueInputKey
} from './formModeQuerySpec.js';
import { getQueryStateSyncPlan, mergeQuerySyncOptions, normalizeQuerySyncOptions, shouldRunQueuedQuerySync } from './formModeQueryReconcile.js';
import { bindFormModeQueryStateSync } from './formModeQueryStateBridge.js';
import { bindFormModeTableNameUrlSync } from './formModeTableNameSync.js';
import { syncSpecInputsWithActiveFilters } from './formModeQuerySync.js';
import { FormModeStateHelpers as formModeStateHelpers } from './formModeStateHelpers.js';
import { openFormModeFieldPicker } from './formModeFieldPicker.js';
import { QueryTableView } from '../queryTableView.js';
import { QueryUI } from '../queryUI.js';
import { fieldDefs, isFieldDisplayable, loadFieldDefinitions } from '../../features/filters/fieldDefs.js';
import { DOM } from '../../core/domCache.js';

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

    const inputSync = syncSpecInputsWithActiveFilters({
      spec: state.spec,
      activeFilters: querySnapshot.activeFilters,
      fieldDefs,
      specSource: state.specSource
    });
    changed = changed || inputSync.changed;

    if (rebuildCard && state.viewMode === 'form') {
      rebuildFormCardFromSpec({
        preserveCurrentDefaults: false,
        applyState: false,
        refreshUrl: false,
        clearSearchParams: true
      });
    } else if (state.viewMode === 'form' && inputSync.controlsToSync.length > 0) {
      inputSync.controlsToSync.forEach(({ inputSpec, previousOperator }) => {
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
    const columns = getDisplayableColumns(querySnapshot.displayedFields);
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

  function syncSpecColumnsWithDisplayedFields(options = {}) {
    if (!state.active || !state.spec) return false;

    const snapshot = options.snapshot || getQuerySnapshot();
    const nextColumns = getDisplayableColumns(snapshot.displayedFields);
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

  function getDisplayableColumns(columns = []) {
    return getDisplayableFormColumns(columns, { isFieldDisplayable });
  }

  function sanitizeSpecDisplayColumns(spec = state.spec) {
    if (!spec || !Array.isArray(spec.columns)) {
      return false;
    }

    const nextColumns = getDisplayableColumns(spec.columns);
    const changed = spec.columns.length !== nextColumns.length
      || spec.columns.some((column, index) => column !== nextColumns[index]);
    if (changed) {
      spec.columns = nextColumns;
    }
    return changed;
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
    sanitizeSpecDisplayColumns(state.spec);
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
    sanitizeSpecDisplayColumns(state.spec);
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
    const useFormUrl = forceShareUrl || (!forceClearUrl && shouldPersistFormUrlInBrowser());
    const nextUrl = useFormUrl
      ? buildCurrentShareUrl({ limited: forceShareUrl })
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
    return hasFormSpecColumn(state.spec, fieldName, getBaseFieldName);
  }

  function hasSpecFilterInput(fieldName) {
    return hasFormSpecFilterInput(state.spec, fieldName, getBaseFieldName);
  }

  function removeSpecFilterInputs(fieldName) {
    removeFormSpecFilterInputs(state.spec, fieldName, getBaseFieldName);
  }

  function removeSpecInputByKey(inputKey) {
    removeFormSpecInputByKey(state.spec, inputKey);
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
    clearFormSpecControlDefaults(state.spec);
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
    resetFormSpecToEmptyQuery(state.spec);

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
    await openFormModeFieldPicker({
      state,
      hasSpecColumn,
      hasSpecFilterInput,
      createGeneratedInputSpec,
      getCurrentInputValues,
      syncSpecColumnsWithDisplayedFields,
      refreshBrowserUrl,
      captureCurrentControlDefaults,
      rebuildFormCardFromSpec,
      removeSpecInputByKey,
      removeSpecFilterInputs,
      syncMountedControlFromInputSpec,
      applyFormState,
      syncValidationUi,
      updateButtonStates() {
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

    sanitizeSpecDisplayColumns(state.spec);
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

  function buildCurrentShareUrl(options = {}) {
    sanitizeSpecDisplayColumns(state.spec);
    return buildFormShareUrl(window.location.href, state.spec, {
      fieldDefs,
      getInputValues: getCurrentInputValues,
      supportsMultipleValues,
      tableName: getCurrentTableNameValue(),
      ...options
    });
  }

  function syncPresentationMode() {
    syncFormModePresentation({
      state,
      document,
      uiActions,
      queryTableView: QueryTableView
    });
  }

  async function setViewMode(nextMode, options = {}) {
    const requestedMode = resolveRequestedFormViewMode({ nextMode });

    if (requestedMode === 'form' && !state.active) {
      const activated = await activateGeneratedFormFromCurrentQuery();
      if (!activated) {
        return;
      }
    } else if (requestedMode === 'form' && state.active && state.specSource === 'generated') {
      await syncGeneratedFormFromCurrentQuery({ forceFormMode: true, rebuildCard: true });
    }

    state.viewMode = requestedMode;
    syncPresentationMode();

    if (options.updateUrl !== false) {
      refreshBrowserUrl();
    }
  }

  function scheduleApply() {
    applyFormState({ source: 'QueryFormMode.scheduleApply' });
    uiActions.updateButtonStates();
    syncValidationUi();
  }

  function buildFormCard() {
    buildInteractiveFormModeCard({
      document,
      state,
      fieldDefs,
      mountFormModeCard,
      createFormModeEmptyState,
      getVisibleFormInputs,
      normalizeOperatorForField,
      createFormControl,
      resolveFormInputInitialValues,
      getInputParamKeys,
      splitListValues,
      createFormFieldRow,
      scheduleApply,
      removeSpecInputByKey,
      rebuildFormCardFromSpec,
      captureCurrentControlDefaults,
      openFieldPicker,
      resetFormToBaseline,
      saveCurrentFormAsSharedBaseline,
      buildCurrentShareUrl,
      syncShareUi,
      syncValidationUi,
      showToastMessage,
      clipboardUtils: ClipboardUtils,
      cleanupControls() {
        // Cleanup any previously body-appended popups from prior form card builds.
        state.controls.forEach(function(control) {
          if (typeof control._cleanupPopup === 'function') control._cleanupPopup();
        });
      },
      runQuery() {
        DOM && DOM.runBtn && DOM.runBtn.click();
      }
    });
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

  async function initialize() {
    if (initialized) {
      return;
    }

    initialized = true;
    const searchParams = new URLSearchParams(window.location.search);
    state.initialSearchParams = new URLSearchParams(window.location.search);
    state.searchParams = searchParams;
    state.lastBrowserUrl = window.location.href;

    bindFormModeQueryStateSync({
      state,
      window,
      queryStateSubscriptions: QueryStateSubscriptions,
      getQueryStateSyncPlan,
      mergeQuerySyncOptions,
      normalizeQuerySyncOptions,
      shouldRunQueuedQuerySync,
      syncActiveSpecWithCurrentQuery,
      syncValidationUi,
      resetActiveFormAfterClear
    });

    wrapUpdateButtonStates();
    bindFormModeTableNameUrlSync({
      state,
      tableNameInput: DOM && DOM.tableNameInput,
      collectFormBindings,
      getCurrentInputValues,
      supportsMultipleValues,
      getInputParamKeys,
      syncFormHeaderCopy,
      interpolateValue,
      refreshBrowserUrl
    });
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
    state.sharedBaselineSpec = null;
    state.searchParams = searchParams;
    state.sharedBaselineSearchParams = null;
    state.viewMode = 'form';

    if (typeof loadFieldDefinitions === 'function') {
      await loadFieldDefinitions();
    }

    sanitizeSpecDisplayColumns(state.spec);
    if (state.spec.columns.length === 0) {
      state.active = false;
      state.spec = null;
      showToastMessage('Form mode requires a real output column. Create the generated field first, then display it.', 'warning');
      return;
    }
    state.initialSpec = cloneSpec(state.spec);

    services.clearVirtualTableData();

    state.controls.clear();
    buildFormCard();
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
