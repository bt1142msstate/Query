import { appServices, registerFilterService } from '../../core/appServices.js';
import { appUiActions } from '../../core/appUiActions.js';
import { MoneyUtils } from '../../core/formatting/moneyUtils.js';
import { OperatorSelectUtils } from '../../core/operatorSelectUtils.js';
import { ValueFormatting } from '../../core/formatting/valueFormatting.js';
import { AppState, QueryChangeManager, QueryStateReaders } from '../../core/queryState.js';
import { SelectorControls } from '../../ui/controls/selectorControls.js';
import {
  fieldDefs,
  getFieldBuilderInputs,
  getFieldFilterOperators,
  isFieldBuildable,
  isFieldBackendFilterable,
  registerDynamicField,
  shouldFieldHavePurpleStyling,
  updateFilteredDefs
} from './fieldDefs.js';
import { DOM } from '../../core/domCache.js';
import { CustomDatePicker } from '../../ui/controls/customDatePicker.js';
import {
    getDateFilterValidationMessage,
    getContradictionMessage,
    isListPasteField,
    supportsListSelectorCondition
} from './filterConditionLogic.js';
import {
    configureFilterInputsForType,
    getComparableDateValue as getComparableDateValueFromPicker,
    isConditionInputVisible as isConditionInputVisibleAdapter,
    setConditionInputVisible as setConditionInputVisibleAdapter,
    syncDatePickerNeverAvailability as syncDatePickerNeverAvailabilityForInputs
} from './condition-editor/filterInputAdapters.js';
import { createFilterPillElement, createPostFilterPillElement } from './filterPills.js';
import { createBuildableFilterFieldHandlers, isOptionalBuilderInput } from './buildableFilterFields.js';
import {
    getPreferredCondition as resolvePreferredCondition,
    removeConditionPanelNote as removePanelNote,
    showFilterError as showPanelFilterError,
    showConditionPanelNote as showPanelNote
} from './condition-editor/filterConditionPanelUi.js';
import {
    createConditionListPasteInput,
    createConditionValueSelector,
    focusBuildableInputWhenReady,
    getPreferredLiteralValues,
    hideConditionSelectControls,
    insertBuildableInputs,
    parseBubbleListValues,
    resetConditionPanel,
    removeConditionSelectControls,
    resolveBackendOperators,
    resolveOperatorConditions
} from './condition-editor/filterConditionPanelBuilder.js';

/**
 * FilterPill UI component class
 * Represents a single active filter condition pill in the UI.
 * (Moved from queryUI.js)
 */
var appState = AppState, services = appServices, uiActions = appUiActions;
function getFilterConditionPanelElement() {
    return DOM?.conditionPanel || document.getElementById('condition-panel');
}

function getFilterInputWrapperElement() {
    return DOM?.inputWrapper || document.getElementById('condition-input-wrapper');
}

function getFilterConditionInputElement() {
    return DOM?.conditionInput || document.getElementById('condition-input');
}

function getFilterConditionInput2Element() {
    return DOM?.conditionInput2 || document.getElementById('condition-input-2');
}

function getFilterBetweenLabelElement() {
    return DOM?.betweenLabel || document.getElementById('between-label');
}

function getFilterQueryInputElement() {
    return DOM?.queryInput || document.getElementById('query-input');
}

function getFilterErrorLabelElement() {
    return DOM?.filterError || document.getElementById('filter-error');
}

function getActiveFilterFieldName() {
    const activeBubble = document.querySelector('.active-bubble') || document.querySelector('.bubble-clone');
    if (activeBubble) {
        const bubbleFieldName = String(activeBubble.dataset.filterFor || activeBubble.textContent || '').trim();
        if (bubbleFieldName) {
            return bubbleFieldName;
        }
    }

    const filterCard = services.getBubbleFilterCardElement ? services.getBubbleFilterCardElement() : null;
    const cardFieldName = String(filterCard?.dataset?.fieldName || '').trim();
    if (cardFieldName) {
        return cardFieldName;
    }

    const selectedFieldName = String(appState.selectedField || '').trim();
    if (selectedFieldName) {
        return selectedFieldName;
    }

    const titleEl = services.getBubbleFilterCardTitleElement ? services.getBubbleFilterCardTitleElement(filterCard) : null;
    return String(titleEl?.textContent || '').trim();
}

function isMobileFilterEditorViewport() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 1180px), (hover: none) and (pointer: coarse)').matches;
}

function setConditionInputVisible(input, visible) {
    setConditionInputVisibleAdapter(input, visible, CustomDatePicker);
}

function isConditionInputVisible(input) {
    return isConditionInputVisibleAdapter(input, CustomDatePicker);
}

function getComparableDateValue(value) {
    return getComparableDateValueFromPicker(value, CustomDatePicker);
}

function syncDatePickerNeverAvailability(cond) {
    syncDatePickerNeverAvailabilityForInputs([
        getFilterConditionInputElement(),
        getFilterConditionInput2Element()
    ], cond);
}

function getConditionOperatorSelect(conditionPanel = null) {
    const panel = conditionPanel || getFilterConditionPanelElement();
    return panel ? panel.querySelector('#condition-operator-select') : null;
}

function getConditionFromControl(control) {
    if (!control) return '';
    if (control.dataset && control.dataset.cond) {
        return String(control.dataset.cond).trim().toLowerCase();
    }
    if (typeof control.value === 'string') {
        return String(control.value).trim().toLowerCase();
    }
    return '';
}

function createConditionOperatorPicker(conditions, handler) {
    return OperatorSelectUtils.createLabeledPicker(conditions, {
        id: 'condition-operator-select',
        className: 'condition-operator-select',
        ariaLabel: 'Select condition',
        onChange: event => {
            if (typeof handler === 'function') {
                handler({
                    currentTarget: event.currentTarget,
                    stopPropagation() {},
                    preventDefault() {}
                });
            }
        }
    });
}

function showFilterError(message, inputElements = [], duration = 3000) {
    return showPanelFilterError({
        errorLabel: DOM.filterError,
        inputElements,
        message,
        duration
    });
}

function getPreferredCondition(conditions, fieldName) {
    return resolvePreferredCondition(conditions, fieldName, getFilterGroupForField);
}

function syncConditionSelection(conditionPanel, cond) {
    if (!conditionPanel || !cond) return;

    const operatorSelect = getConditionOperatorSelect(conditionPanel);
    if (operatorSelect && operatorSelect.value !== cond) {
        operatorSelect.value = cond;
    }
}

function getSelectedCondition(conditionPanel = null) {
    const panel = conditionPanel || getFilterConditionPanelElement();
    if (!panel) return '';

    const operatorSelect = getConditionOperatorSelect(panel);
    return operatorSelect && operatorSelect.value
        ? String(operatorSelect.value).trim().toLowerCase()
        : '';
}

function removeConditionPanelNote() {
    removePanelNote(document);
}

function showConditionPanelNote(options) {
    showPanelNote({
        document,
        inputWrapper: getFilterInputWrapperElement(),
        options
    });
}

function getConditionPanelContext(bubble) {
    const conditionPanel = getFilterConditionPanelElement();
    const inputWrapper = getFilterInputWrapperElement();
    const conditionInput = getFilterConditionInputElement();
    const confirmBtn = DOM?.confirmBtn || document.getElementById('confirm-btn');
    const filterCard = services.getBubbleFilterCardElement ? services.getBubbleFilterCardElement() : null;

    if (!conditionPanel || !inputWrapper || !conditionInput || !confirmBtn) {
        console.warn('buildConditionPanel skipped: missing condition panel DOM nodes');
        return;
    }

    appState.selectedField = bubble.textContent.trim();
    if (filterCard) {
        filterCard.dataset.fieldName = appState.selectedField;
    }
    const type = bubble.dataset.type || 'string';
    const { hasValuePairs, listValues } = parseBubbleListValues(bubble.dataset.values);
    const fieldDefInfo = fieldDefs ? fieldDefs.get(appState.selectedField) : null;
    const isBuildable = isFieldBuildable(fieldDefInfo);
    const backendOperators = resolveBackendOperators({
        bubble,
        fieldDefInfo,
        getFieldFilterOperators
    });
    const operatorConditions = resolveOperatorConditions(backendOperators);

    return {
        backendOperators,
        bubble,
        conditionInput,
        conditionPanel,
        confirmBtn,
        fieldDefInfo,
        filterCard,
        hasValuePairs,
        inputWrapper,
        isBuildable,
        listValues,
        operatorConditions,
        type
    };
}

function showDisplayOnlyConditionPanel(context) {
    setConditionInputVisible(context.conditionInput, false);
    const conditionInput2 = getFilterConditionInput2Element();
    const betweenLabel = getFilterBetweenLabelElement();
    if (conditionInput2) setConditionInputVisible(conditionInput2, false);
    if (betweenLabel) betweenLabel.style.display = 'none';
    hideConditionSelectControls(document);
    context.confirmBtn.style.display = 'none';
    showConditionPanelNote({
        kicker: 'Display Only',
        title: 'This field cannot be filtered',
        body: 'The backend does not expose any valid filter operators for this field, so no filter input is available here.',
        hint: 'You can still add it as a results column and use it in the table output.'
    });
    renderConditionList(appState.selectedField);
}

function configureBuildableConditionPanel(context) {
    insertBuildableInputs({
        conditionInput: context.conditionInput,
        document,
        getFieldBuilderInputs,
        inputWrapper: context.inputWrapper,
        isOptionalBuilderInput,
        fieldDefInfo: context.fieldDefInfo
    });
    const operatorConditions = context.backendOperators.length > 0
        ? context.backendOperators
        : ['contains', 'starts', 'equals', 'does_not_equal'];
    context.conditionPanel.appendChild(createConditionOperatorPicker(operatorConditions, buildableConditionBtnHandler));
    return operatorConditions;
}

function configureListValueConditionPanel(context) {
    const fieldDef = fieldDefs.get(appState.selectedField);
    removeConditionSelectControls(document);
    const currentLiteralValues = getPreferredLiteralValues({
        fieldName: appState.selectedField,
        getFilterGroupForField,
        getPreferredCondition,
        operatorConditions: context.operatorConditions,
        supportsListSelectorCondition
    });
    const { hideConfirm, selector } = createConditionValueSelector({
        SelectorControls,
        confirmBtn: context.confirmBtn,
        currentLiteralValues,
        fieldDef,
        hasValuePairs: context.hasValuePairs,
        listValues: context.listValues
    });
    context.inputWrapper.insertBefore(selector, context.confirmBtn);
    setConditionInputVisible(context.conditionInput, false);
    if (hideConfirm) {
        context.confirmBtn.style.display = 'none';
    }
}

function configureListPasteConditionPanel(context) {
    const currentLiteralValues = getPreferredLiteralValues({
        fieldName: appState.selectedField,
        getFilterGroupForField,
        getPreferredCondition,
        operatorConditions: context.operatorConditions,
        supportsListSelectorCondition
    });
    const listInput = createConditionListPasteInput({ SelectorControls, currentLiteralValues });
    context.inputWrapper.insertBefore(listInput, context.confirmBtn);
    setConditionInputVisible(context.conditionInput, false);
}

function configurePlainConditionPanel(context) {
    hideConditionSelectControls(document);
    configureInputsForType(context.type);

    if (isListPasteField(context.fieldDefInfo)) {
        configureListPasteConditionPanel(context);
    } else {
        setConditionInputVisible(context.conditionInput, true);
    }
    context.confirmBtn.style.display = '';
}

function applyPreferredCondition(context, operatorConditions) {
    const operatorSelect = context.conditionPanel.querySelector('#condition-operator-select');
    const preferredCondition = getPreferredCondition(operatorConditions, appState.selectedField);
    if (!operatorSelect || !preferredCondition) {
        return;
    }

    operatorSelect.value = preferredCondition;
    handleConditionBtnClick({
        currentTarget: operatorSelect,
        stopPropagation() {},
        preventDefault() {}
    });
}

function buildBubbleConditionPanel(bubble) {
    const context = getConditionPanelContext(bubble);
    if (!context) return;

    resetConditionPanel({ context, document, removeConditionPanelNote });
    let operatorConditions = context.operatorConditions;
    if (context.isBuildable) {
        operatorConditions = configureBuildableConditionPanel(context);
    } else {
        if (operatorConditions.length === 0) {
            showDisplayOnlyConditionPanel(context);
            return;
        }

        context.conditionPanel.appendChild(createConditionOperatorPicker(operatorConditions, handleConditionBtnClick));
        if (context.listValues && context.listValues.length) {
            configureListValueConditionPanel(context);
        } else {
            configurePlainConditionPanel(context);
        }
    }

    renderConditionList(appState.selectedField);
    applyPreferredCondition(context, operatorConditions);
    if (context.isBuildable) focusBuildableInputWhenReady({ document, isMobileFilterEditorViewport });
}

var getDisplayedFields = QueryStateReaders.getDisplayedFields.bind(QueryStateReaders);
var getFilterGroupForField = QueryStateReaders.getFilterGroupForField.bind(QueryStateReaders);
const {
    buildableConditionBtnHandler,
    handleBuildableFieldConfirm
} = createBuildableFilterFieldHandlers({
    appState,
    document,
    getDisplayedFields,
    getFilterBetweenLabelElement,
    getFilterConditionInput2Element,
    getFilterConditionInputElement,
    getFilterConditionPanelElement,
    getFilterErrorLabelElement,
    getFilterInputWrapperElement,
    getFilterQueryInputElement,
    getConditionFromControl,
    getFilterGroupForField,
    isMobileFilterEditorViewport,
    queryChangeManager: QueryChangeManager,
    registerDynamicField,
    services,
    setConditionInputVisible,
    showFilterError,
    syncConditionSelection,
    updateFilteredDefs,
    uiActions
});

function getPostFilterSummary() {
    const snapshot = services.getPostFilterState ? services.getPostFilterState() : {};
    const fieldEntries = Object.entries(snapshot).filter(([, data]) => Array.isArray(data?.filters) && data.filters.length > 0);
    const fieldCount = fieldEntries.length;
    const ruleCount = fieldEntries.reduce((total, [, data]) => total + data.filters.length, 0);

    return {
        fieldCount,
        ruleCount,
        hasPostFilters: ruleCount > 0
    };
}

/**
 * Renders the list of active filters for a given field.
 * @param {string} field - The field name
 */
function renderConditionList(field) {
    const container = DOM.bubbleCondList;
    if (!container) return;
    
    container.innerHTML = '';
    const normalizedField = String(field || '').trim();
    const data = normalizedField ? getFilterGroupForField(normalizedField) : { filters: [] };
    const postFilterPill = createPostFilterPillElement(getPostFilterSummary(), () => {
        uiActions.openPostFilters();
    });
    const hasFieldFilters = Boolean(data && Array.isArray(data.filters) && data.filters.length);

    if (!hasFieldFilters && !postFilterPill) {
        // Reset specific styling if no filters exist
        document.querySelectorAll('.bubble').forEach(b => {
            if (b.textContent.trim() === normalizedField) {
                services.applyBubbleStyling(b);
            }
        });
        
        // Reset selection container inputs
        const selContainer = document.getElementById('condition-select-container');
        if (selContainer && appState.selectedField === normalizedField) {
                 if (typeof selContainer.setSelectedValues === 'function') {
                     selContainer.setSelectedValues([]);
                 }
             selContainer.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
                input.checked = false;
             });
        }
        
        uiActions.updateCategoryCounts();
        
        // Only re-render bubbles if the field was in Selected and is now gone
        if (appState.currentCategory === 'Selected') {
            const stillSelected = shouldFieldHavePurpleStyling(normalizedField);
            if (!stillSelected) {
                services.rerenderBubbles();
            }
        }
        return;
    }

    const list = document.createElement('div');
    list.className = 'cond-list';

    // Create pills for each filter
    const fieldDef = normalizedField ? fieldDefs.get(normalizedField) : null;
    if (hasFieldFilters) {
        data.filters.forEach((f, idx) => {
            const pill = createFilterPillElement(f, fieldDef, () => {
                QueryChangeManager.removeFilter(normalizedField, {
                index: idx,
                source: 'FilterManager.removeFilterPill'
            });

            if (!getFilterGroupForField(normalizedField)) {
                document.querySelectorAll('.bubble').forEach(b => {
                    if (b.textContent.trim() === normalizedField) {
                        b.removeAttribute('data-filtered');
                        b.classList.remove('bubble-filter');
                    }
                });
            }
            
            // Sync up select container if visible
            const selContainer = document.getElementById('condition-select-container');
            if (selContainer && appState.selectedField === normalizedField) {
                if (supportsListSelectorCondition(f.cond)) {
                    const activeCond = getSelectedCondition(getFilterConditionPanelElement()) || String(f.cond || '').trim().toLowerCase();
                    const remainingFilter = data.filters.find(filterItem => String(filterItem.cond || '').trim().toLowerCase() === activeCond);
                    const nextValues = remainingFilter ? remainingFilter.val.split(',').map(v => v.trim()).filter(Boolean) : [];

                    if (typeof selContainer.setSelectedValues === 'function') {
                        selContainer.setSelectedValues(nextValues);
                    }

                    const valueSet = new Set(nextValues);
                    selContainer.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
                        const inputValue = input.value || input.dataset.value;
                        input.checked = valueSet.has(inputValue);
                    });
                    
                    // Update group checkboxes
                    selContainer.querySelectorAll('.group-checkbox').forEach(checkbox => {
                        const groupName = checkbox.dataset.group;
                        const groupOptions = selContainer.querySelectorAll(`.option-item[data-group="${groupName}"] input`);
                        checkbox.checked = Array.from(groupOptions).some(opt => opt.checked);
                    });
                }
            }
            
            // updateQueryJson and safeRenderBubbles are handled reactively by
            // jsonViewerUI.js and bubbleInteraction.js QueryStateSubscriptions — no need to call again here.
            renderConditionList(normalizedField);
            uiActions.updateCategoryCounts();
        });
            list.appendChild(pill);
        });
    }

    if (postFilterPill) {
        list.appendChild(postFilterPill);
    }

    container.appendChild(list);
    uiActions.updateCategoryCounts();
    uiActions.updateFilterSidePanel();
}

window.addEventListener('postfilters:updated', () => {
    const activeField = getActiveFilterFieldName() || appState.selectedField || '';
    renderConditionList(activeField);
});

registerFilterService({
    buildBubbleConditionPanel,
    handleFilterConfirm,
    renderConditionList
});

/**
 * Handles condition button clicks (Equal, Contains, etc.)
 */
function handleConditionBtnClick(e) {
    e.stopPropagation();
    const control = e.currentTarget;
    const conditionPanel = getFilterConditionPanelElement();
    const inputWrapper = getFilterInputWrapperElement();
    const conditionInput = getFilterConditionInputElement();
    const conditionInput2 = getFilterConditionInput2Element();
    const betweenLbl = getFilterBetweenLabelElement();
    const sel = document.getElementById('condition-select');
    const selContainer = document.getElementById('condition-select-container');

    if (!conditionPanel || !inputWrapper || !conditionInput || !conditionInput2 || !betweenLbl) return;

    const cond = getConditionFromControl(control);
    if (!cond) return;

    syncConditionSelection(conditionPanel, cond);
    syncDatePickerNeverAvailability(cond);

    // Handle show/hide/display actions
    if (cond === 'show' || cond === 'hide') {
        if (appState.selectedField) {
            if (cond === 'show') {
                QueryChangeManager.showField(appState.selectedField, {
                    source: 'FilterManager.handleConditionBtnClick.show'
                });
            } else if (cond === 'hide' && getDisplayedFields().includes(appState.selectedField)) {
                QueryChangeManager.hideField(appState.selectedField, {
                    source: 'FilterManager.handleConditionBtnClick.hide'
                });
            }
            
            // Update toggle buttons state
            const toggleButtons = conditionPanel.querySelectorAll('.toggle-half');
            toggleButtons.forEach(toggleBtn => {
                toggleBtn.classList.remove('active');
                const toggleCond = toggleBtn.dataset.cond;
                if (toggleCond === 'show' && getDisplayedFields().includes(appState.selectedField)) {
                    toggleBtn.classList.add('active');
                } else if (toggleCond === 'hide' && !getDisplayedFields().includes(appState.selectedField)) {
                    toggleBtn.classList.add('active');
                }
            });
        }
        return;
    }

    // "Between" logic
    const isNeverCondition = cond === 'never';
    const hasValuePicker = Boolean(
        (sel && sel.style.display !== 'none') ||
        (selContainer && selContainer.style.display !== 'none')
    );
    setConditionInputVisible(conditionInput, !isNeverCondition && !hasValuePicker);
    if (cond === 'between') {
        setConditionInputVisible(conditionInput2, true);
        betweenLbl.style.display = 'block';
        conditionInput2.type = conditionInput.type;
        inputWrapper.classList.add('is-between');
    } else {
        setConditionInputVisible(conditionInput2, false);
        betweenLbl.style.display = 'none';
        inputWrapper.classList.remove('is-between');
    }
    if (isNeverCondition) conditionInput.value = 'NEVER';

    inputWrapper.classList.add('show');
    uiActions.positionInputWrapper();
    
    if (!isMobileFilterEditorViewport()) {
        const listPasteInput = document.getElementById('condition-select-container');
        if (listPasteInput && typeof listPasteInput.focusInput === 'function' && listPasteInput.style.display !== 'none') {
            listPasteInput.focusInput();
        } else if (sel && sel.style.display !== 'none') {
            sel.focus();
        } else if (!isNeverCondition) {
            (cond === 'between' ? conditionInput2 : conditionInput).focus();
        }
    }
    
    // Reposition again after layout change
    uiActions.positionInputWrapper();
}

/**
 * Handles filter confirmation action
 */
function isControlVisible(control) {
    return Boolean(control && control.style.display !== 'none');
}

function getFilterConfirmContext() {
    const bubble = document.querySelector('.active-bubble') || document.querySelector('.bubble-clone');
    const conditionPanel = getFilterConditionPanelElement();
    const conditionInput = getFilterConditionInputElement();
    const conditionInput2 = getFilterConditionInput2Element();
    const sel = document.getElementById('condition-select');
    const selContainer = document.getElementById('condition-select-container');
    if (!conditionPanel || !conditionInput || !conditionInput2) return null;

    const field = (bubble && (bubble.dataset.filterFor || bubble.textContent.trim())) || appState.selectedField;
    if (!field) return null;

    const cond = getSelectedCondition(conditionPanel);
    const fieldDef = fieldDefs.get(field);
    const fieldType = (bubble && bubble.dataset.type) || (fieldDef && fieldDef.type) || 'string';

    return {
        bubble,
        conditionInput,
        conditionInput2,
        conditionPanel,
        cond,
        field,
        fieldDef,
        fieldType,
        isBuildable: isFieldBuildable(fieldDef),
        sel,
        selContainer
    };
}

function getConfirmValues(context) {
    let val = context.conditionInput.value.trim();
    let val2 = context.conditionInput2.value.trim();
    if (context.cond === 'never') {
        return { val: 'NEVER', val2: '' };
    }

    if (context.fieldType === 'money' || context.fieldType === 'number') {
        const numberFormat = ValueFormatting.getNumberFormat(context.field) || '';
        const allowDecimal = context.fieldType === 'money' || (context.fieldType === 'number' && numberFormat === 'decimal');
        val = MoneyUtils.sanitizeInputValue(val, { allowDecimal });
        val2 = MoneyUtils.sanitizeInputValue(val2, { allowDecimal });
    }
    return { val, val2 };
}

function hasMissingConfirmValue(context, values) {
    if (context.cond === 'between') {
        return values.val === '' || values.val2 === '';
    }
    if (context.cond === 'never') {
        return false;
    }

    const isTextInputEmpty = isConditionInputVisible(context.conditionInput) && values.val === '';
    const isSelectEmpty = isControlVisible(context.sel) && context.sel.value === '';
    const isContainerEmpty = isControlVisible(context.selContainer)
        && context.selContainer.getSelectedValues().length === 0;
    return isTextInputEmpty || isSelectEmpty || isContainerEmpty;
}

function validateDateConfirmValues(context, values, tintInputs) {
    if (context.fieldType !== 'date' || context.cond === 'never') {
        return true;
    }

    const hasInvalidPrimaryDate = values.val && (!CustomDatePicker || !CustomDatePicker.isValidDateValue(values.val));
    const hasInvalidSecondaryDate = context.cond === 'between' && values.val2 && (!CustomDatePicker || !CustomDatePicker.isValidDateValue(values.val2));
    if (hasInvalidPrimaryDate || hasInvalidSecondaryDate) {
        showFilterError('Enter a date or Never', tintInputs);
        return false;
    }

    const dateLogicMessage = getDateFilterValidationMessage({
        cond: context.cond,
        val: context.cond === 'between' ? `${values.val}|${values.val2}` : values.val
    }, context.field, {
        getComparableDateValue
    });
    if (dateLogicMessage) {
        showFilterError(dateLogicMessage, tintInputs);
        return false;
    }
    return true;
}

function validateConfirmValues(context, values) {
    if (!context.cond || context.cond === 'display') {
        return true;
    }

    const tintInputs = [context.conditionInput, context.conditionInput2];
    if (!context.isBuildable && typeof isFieldBackendFilterable === 'function' && !isFieldBackendFilterable(context.fieldDef)) {
        showFilterError('This field is not filterable in the backend.', []);
        return false;
    }
    if (hasMissingConfirmValue(context, values)) {
        showFilterError(context.cond === 'between' ? 'Please enter both values' : 'Please enter a value', tintInputs);
        return false;
    }
    return validateDateConfirmValues(context, values, tintInputs);
}

function normalizeBetweenConfirmValues(context, values) {
    if (context.cond !== 'between') {
        return values;
    }
    if (context.fieldType !== 'number' && context.fieldType !== 'money') {
        return values;
    }

    const firstValue = parseFloat(values.val);
    const secondValue = parseFloat(values.val2);
    if (firstValue === secondValue) {
        showFilterError('Between values must be different', [context.conditionInput, context.conditionInput2]);
        return null;
    }
    if (firstValue <= secondValue) {
        return values;
    }

    context.conditionInput.value = values.val2;
    context.conditionInput2.value = values.val;
    return {
        val: context.conditionInput.value.trim(),
        val2: context.conditionInput2.value.trim()
    };
}

function getConfirmFilterValue(context, values) {
    if (context.cond === 'between') {
        return `${values.val}|${values.val2}`;
    }
    if (isControlVisible(context.selContainer)) {
        return context.selContainer.getSelectedValues().join(',');
    }
    if (!isControlVisible(context.sel)) {
        return values.val;
    }
    return context.sel.multiple
        ? Array.from(context.sel.selectedOptions).map(option => option.value).join(',')
        : context.sel.value;
}

function shouldReplaceListFilterCondition(context, filterValue) {
    return Boolean(
        supportsListSelectorCondition(context.cond)
        && filterValue !== ''
        && (isControlVisible(context.selContainer) || isControlVisible(context.sel))
    );
}

function applyBackendFilter(context, values) {
    if (!context.cond || context.cond === 'display') {
        return true;
    }

    try {
        const filterValue = getConfirmFilterValue(context, values);
        const shouldReplaceExistingListCondition = shouldReplaceListFilterCondition(context, filterValue);
        const existingSet = getFilterGroupForField(context.field) || { filters: [] };
        const contradictionSet = shouldReplaceExistingListCondition
            ? {
                ...existingSet,
                filters: existingSet.filters.filter(existingFilter => existingFilter.cond !== context.cond)
            }
            : existingSet;
        const newFilterObj = { cond: context.cond, val: filterValue };
        const conflictMsg = getContradictionMessage(contradictionSet, newFilterObj, context.fieldType, context.field, {
            getComparableDateValue
        });
        if (conflictMsg) {
            showFilterError(conflictMsg, [context.conditionInput, context.conditionInput2]);
            return false;
        }

        if (filterValue !== '') {
            console.log(`Applying filter for ${context.field}: ${context.cond} ${filterValue}`);
            QueryChangeManager.upsertFilter(context.field, newFilterObj, {
                replaceByCond: shouldReplaceExistingListCondition,
                source: 'FilterManager.applyFilter'
            });
            document.querySelectorAll('.bubble').forEach(b => {
                if (b.textContent.trim() === context.field) {
                    services.applyBubbleStyling(b);
                }
            });
            renderConditionList(context.field);
        }
        return true;
    } catch (error) {
        console.error('Error applying filter:', error);
        showFilterError('Error applying filter: ' + error.message, []);
        return false;
    }
}

function applyDisplayCondition(context) {
    if (context.cond === 'show') {
        services.restoreFieldWithDuplicates(context.field);
    } else if ((context.cond === 'hide' || context.cond === 'display') && getDisplayedFields().includes(context.field)) {
        QueryChangeManager.hideField(context.field, {
            source: 'FilterManager.hideField'
        });
    }
}

function handleFilterConfirm(e) {
    e.stopPropagation();
    const context = getFilterConfirmContext();
    if (!context) return;

    const values = getConfirmValues(context);
    if (context.isBuildable) {
        handleBuildableFieldConfirm(context.fieldDef, context.cond, values.val);
        finalizeConfirmAction();
        return;
    }

    if (!validateConfirmValues(context, values)) return;
    const normalizedValues = normalizeBetweenConfirmValues(context, values);
    if (!normalizedValues) return;
    if (!applyBackendFilter(context, normalizedValues)) return;

    applyDisplayCondition(context);

    finalizeConfirmAction();
}

// Global confirm action finalizer
function finalizeConfirmAction() {
    uiActions.updateQueryJson();

    uiActions.updateFilterSidePanel();
    uiActions.updateCategoryCounts();
}

function configureInputsForType(type){
    const inp1 = getFilterConditionInputElement();
    const inp2 = getFilterConditionInput2Element();
    configureFilterInputsForType({
      type,
      inputs: [inp1, inp2],
      currentFieldName: getActiveFilterFieldName(),
      selectedCondition: getSelectedCondition(getFilterConditionPanelElement()),
      customDatePicker: CustomDatePicker,
      moneyUtils: MoneyUtils,
      valueFormatting: ValueFormatting
    });
}
