import { appServices, registerFilterService } from '../core/appServices.js';
import { appUiActions } from '../core/appUiActions.js';
import { MoneyUtils, OperatorSelectUtils, ValueFormatting } from '../core/utils.js';
import { AppState, QueryChangeManager, QueryStateReaders } from '../core/queryState.js';
import { SelectorControls } from '../ui/selectorControls.js';
import {
  fieldDefs,
  getFieldFilterOperators,
  isFieldBackendFilterable,
  registerDynamicField,
  shouldFieldHavePurpleStyling,
  updateFilteredDefs
} from './fieldDefs.js';
import { DOM } from '../core/domCache.js';
import { CustomDatePicker } from '../ui/customDatePicker.js';
import {
    getDateFilterValidationMessage,
    getContradictionMessage,
    isListPasteField,
    supportsListSelectorCondition
} from './filterConditionLogic.js';
import {
    conditionAllowsNeverDateValue,
    configureConditionInputsForType
} from './filterInputConfiguration.js';
import { createFilterPillElement, createPostFilterPillElement } from './filterPills.js';
import { createBuildableFilterFieldHandlers } from './buildableFilterFields.js';
import {
    getPreferredCondition as resolvePreferredCondition,
    removeConditionPanelNote as removePanelNote,
    showFilterError as showPanelFilterError,
    showConditionPanelNote as showPanelNote
} from './filterConditionPanelUi.js';

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
        && window.matchMedia('(max-width: 1024px), (hover: none) and (pointer: coarse)').matches;
}

function setConditionInputVisible(input, visible) {
    if (!input) return;

    if (CustomDatePicker && typeof CustomDatePicker.setInputVisibility === 'function') {
        CustomDatePicker.setInputVisibility(input, visible);
        return;
    }

    input.style.display = visible ? '' : 'none';
}

function isConditionInputVisible(input) {
    if (!input) return false;

    if (CustomDatePicker && typeof CustomDatePicker.isInputVisible === 'function') {
        return CustomDatePicker.isInputVisible(input);
    }

    return input.style.display !== 'none';
}

function getComparableDateValue(value) {
    if (CustomDatePicker && typeof CustomDatePicker.getComparableValue === 'function') {
        return CustomDatePicker.getComparableValue(value);
    }

    return NaN;
}

function syncDatePickerNeverAvailability(cond) {
    [getFilterConditionInputElement(), getFilterConditionInput2Element()]
        .filter(Boolean)
        .forEach(input => {
            if (input._customDatePickerApi) {
                input._customDatePickerApi.allowNever = conditionAllowsNeverDateValue(cond);
            }
        });
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

function buildBubbleConditionPanel(bubble) {
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
    let listValues = null;
    let hasValuePairs = false;

    try {
        if (bubble.dataset.values) {
            const parsedValues = JSON.parse(bubble.dataset.values);
            if (parsedValues.length > 0) {
                if (typeof parsedValues[0] === 'object' && parsedValues[0].Name && parsedValues[0].RawValue) {
                    hasValuePairs = true;
                    listValues = parsedValues.sort((a, b) => a.Name.localeCompare(b.Name, undefined, { numeric: true, sensitivity: 'base' }));
                } else {
                    listValues = parsedValues.sort((a, b) => a.toString().localeCompare(b.toString(), undefined, { numeric: true, sensitivity: 'base' }));
                }
            }
        }
    } catch (error) {
        console.error('Error parsing values:', error);
    }

    const perBubble = bubble.dataset.filters ? JSON.parse(bubble.dataset.filters) : null;
    const fieldDefInfo = fieldDefs ? fieldDefs.get(appState.selectedField) : null;
    const isBuildable = fieldDefInfo && fieldDefInfo.is_buildable;
    const backendOperators = typeof getFieldFilterOperators === 'function'
        ? getFieldFilterOperators(fieldDefInfo)
        : ((perBubble && perBubble.length > 0)
            ? perBubble.map(label => String(label).split(' ')[0].toLowerCase())
            : []);
    let operatorConditions = [];
    conditionPanel.innerHTML = '';
    removeConditionPanelNote();

    const oldMarcInput = document.getElementById('marc-field-input');
    if (oldMarcInput && oldMarcInput.parentNode) oldMarcInput.parentNode.remove();
    document.querySelectorAll('.dynamic-input-group').forEach(el => el.remove());

    if (isBuildable) {
        if (fieldDefInfo.builder_inputs) {
            [...fieldDefInfo.builder_inputs].reverse().forEach(input => {
                const group = document.createElement('div');
                group.className = 'dynamic-input-group marc-input-group';

                const label = document.createElement('label');
                label.textContent = input.label;
                label.className = 'dynamic-label marc-label';

                const inputEl = document.createElement('input');
                inputEl.type = input.type;
                inputEl.pattern = input.pattern;
                inputEl.placeholder = input.placeholder;
                inputEl.dataset.inputId = input.id;
                inputEl.dataset.errorMsg = input.error_msg || 'Invalid input';
                inputEl.className = 'dynamic-builder-input condition-field';
                if (input.id === 'tag') {
                    inputEl.id = 'marc-field-input';
                    inputEl.classList.add('marc-field-input');
                }

                group.appendChild(label);
                group.appendChild(inputEl);

                const refNode = conditionInput;
                if (refNode && inputWrapper) {
                    inputWrapper.insertBefore(group, refNode.nextSibling);
                }
            });
        }

        operatorConditions = backendOperators.length > 0
            ? backendOperators
            : ['contains', 'starts', 'equals', 'does_not_equal'];
        conditionPanel.appendChild(createConditionOperatorPicker(operatorConditions, buildableConditionBtnHandler));
    } else {
        if (backendOperators.length === 0) {
            operatorConditions = [];
        } else if (listValues && listValues.length && backendOperators.length > 0) {
            operatorConditions = backendOperators;
        } else {
            operatorConditions = backendOperators;
        }

        // No applicable conditions for this field — hide the input area entirely
        // so an empty select and stray value input are never shown to the user.
        if (operatorConditions.length === 0) {
            if (conditionInput) setConditionInputVisible(conditionInput, false);
            const conditionInput2 = getFilterConditionInput2Element();
            const betweenLabel = getFilterBetweenLabelElement();
            const existingSelect = document.getElementById('condition-select');
            const existingContainer = document.getElementById('condition-select-container');
            if (conditionInput2) setConditionInputVisible(conditionInput2, false);
            if (betweenLabel) betweenLabel.style.display = 'none';
            if (existingSelect) existingSelect.style.display = 'none';
            if (existingContainer && existingContainer.parentNode) existingContainer.parentNode.removeChild(existingContainer);
            if (confirmBtn) confirmBtn.style.display = 'none';
            showConditionPanelNote({
                kicker: 'Display Only',
                title: 'This field cannot be filtered',
                body: 'The backend does not expose any valid filter operators for this field, so no filter input is available here.',
                hint: 'You can still add it as a results column and use it in the table output.'
            });
            renderConditionList(appState.selectedField);
            return;
        }

        conditionPanel.appendChild(createConditionOperatorPicker(operatorConditions, handleConditionBtnClick));

        if (listValues && listValues.length) {
            const fieldDef = fieldDefs.get(appState.selectedField);
            const isMultiSelect = fieldDef && fieldDef.multiSelect;
            const shouldGroupValues = Boolean(fieldDef && fieldDef.groupValues);
            const isBooleanField = Boolean(fieldDef && fieldDef.type === 'boolean');
            const existingSelect = document.getElementById('condition-select');
            const existingContainer = document.getElementById('condition-select-container');
            if (existingSelect) existingSelect.parentNode.removeChild(existingSelect);
            if (existingContainer) existingContainer.parentNode.removeChild(existingContainer);

            let currentLiteralValues = [];
            const selectedFieldFilters = getFilterGroupForField(appState.selectedField);
            const listCondition = getPreferredCondition(operatorConditions, appState.selectedField);
            if (selectedFieldFilters && supportsListSelectorCondition(listCondition)) {
                const filter = selectedFieldFilters.filters.find(f => String(f.cond || '').trim().toLowerCase() === listCondition);
                if (filter) {
                    currentLiteralValues = filter.val.split(',').map(v => v.trim());
                }
            }

            const hasDashes = hasValuePairs
                ? listValues.some(val => val.Name.includes('-'))
                : listValues.some(val => val.includes('-'));

            const selector = isBooleanField && listValues.length === 2
                ? SelectorControls.createBooleanPillSelector(listValues, currentLiteralValues[0] || '', {
                    onChange: () => {
                        confirmBtn.click();
                    }
                })
                : SelectorControls.createGroupedSelector(listValues, isMultiSelect, currentLiteralValues, {
                    enableGrouping: shouldGroupValues && hasDashes
                });
            inputWrapper.insertBefore(selector, confirmBtn);
            setConditionInputVisible(conditionInput, false);
            if (isBooleanField && listValues.length === 2) {
                confirmBtn.style.display = 'none';
            }
        } else {
            const existingSelect = document.getElementById('condition-select');
            const existingContainer = document.getElementById('condition-select-container');
            if (existingSelect) existingSelect.style.display = 'none';
            if (existingContainer) existingContainer.parentNode.removeChild(existingContainer);
            configureInputsForType(type);

            if (isListPasteField(fieldDefInfo)) {
                let currentLiteralValues = [];
                const selectedFieldFilters = getFilterGroupForField(appState.selectedField);
                const listCondition = getPreferredCondition(operatorConditions, appState.selectedField);
                if (selectedFieldFilters && supportsListSelectorCondition(listCondition)) {
                    const filter = selectedFieldFilters.filters.find(f => String(f.cond || '').trim().toLowerCase() === listCondition);
                    if (filter) {
                        currentLiteralValues = String(filter.val).split(',').map(v => v.trim()).filter(Boolean);
                    }
                }

                const listInput = SelectorControls.createListPasteInput(currentLiteralValues, {
                    placeholder: 'Paste one key per line',
                    hint: 'Paste keys one per line, paste comma-separated keys, or upload a text/CSV file.'
                });
                inputWrapper.insertBefore(listInput, confirmBtn);
                setConditionInputVisible(conditionInput, false);
            } else {
                setConditionInputVisible(conditionInput, true);
            }
            confirmBtn.style.display = '';
        }
    }

    renderConditionList(appState.selectedField);

    const operatorSelect = conditionPanel.querySelector('#condition-operator-select');
    const preferredCondition = getPreferredCondition(operatorConditions, appState.selectedField);
    if (operatorSelect && preferredCondition) {
        operatorSelect.value = preferredCondition;
        handleConditionBtnClick({
            currentTarget: operatorSelect,
            stopPropagation() {},
            preventDefault() {}
        });
    }

    if (isBuildable) {
        setTimeout(() => {
            if (isMobileFilterEditorViewport()) return;
            const firstInput = document.querySelector('.dynamic-builder-input');
            if (firstInput) firstInput.focus();
        }, 300);
    }
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
function handleFilterConfirm(e) {
    e.stopPropagation();
    
    // Dependencies
    const bubble = document.querySelector('.active-bubble') || document.querySelector('.bubble-clone');
    
    const conditionPanel = getFilterConditionPanelElement();
    const conditionInput = getFilterConditionInputElement();
    const conditionInput2 = getFilterConditionInput2Element();
    const sel = document.getElementById('condition-select');
    const selContainer = document.getElementById('condition-select-container');
    if (!conditionPanel || !conditionInput || !conditionInput2) return;
    
    const field = (bubble && (bubble.dataset.filterFor || bubble.textContent.trim())) || appState.selectedField;
    if (!field) return;

    const cond = getSelectedCondition(conditionPanel);
    let val = conditionInput.value.trim();
    let val2 = conditionInput2.value.trim();
    if (cond === 'never') {
        val = 'NEVER';
        val2 = '';
    }
    
    const fieldDef = fieldDefs.get(field);
    const fieldType = (bubble && bubble.dataset.type) || (fieldDef && fieldDef.type) || 'string';
    const numberFormat = ValueFormatting.getNumberFormat(field) || '';
    if (fieldType === 'money' || fieldType === 'number') {
        const allowDecimal = fieldType === 'money' || (fieldType === 'number' && numberFormat === 'decimal');
        val = MoneyUtils.sanitizeInputValue(val, { allowDecimal });
        val2 = MoneyUtils.sanitizeInputValue(val2, { allowDecimal });
    }
    const isBuildable = fieldDef && fieldDef.is_buildable;

    // Special handling for buildable fields
    if (isBuildable) {
        handleBuildableFieldConfirm(fieldDef, cond, val);
        finalizeConfirmAction();
        return;
    }

    // Validation
    if (cond && cond !== 'display') {
        if (!isBuildable && typeof isFieldBackendFilterable === 'function' && !isFieldBackendFilterable(fieldDef)) {
            showFilterError('This field is not filterable in the backend.', []);
            return;
        }

        const tintInputs = [conditionInput, conditionInput2];
        
        if (cond === 'between' && (val === '' || val2 === '')) {
            showFilterError('Please enter both values', tintInputs);
            return;
        }
        
        if (cond !== 'between' && cond !== 'never') {
            const isTextInputVisible = isConditionInputVisible(conditionInput);
            const isTextInputEmpty = val === '';
            const isSelectVisible = sel && sel.style.display !== 'none';
            const isSelectEmpty = isSelectVisible && sel.value === '';
            const isContainerVisible = selContainer && selContainer.style.display !== 'none';
            const isContainerEmpty = isContainerVisible && selContainer.getSelectedValues().length === 0;

            if ((isTextInputVisible && isTextInputEmpty) ||
                (isSelectVisible && isSelectEmpty) ||
                (isContainerVisible && isContainerEmpty)) {
                showFilterError('Please enter a value', tintInputs);
                return;
            }
        }

        if (fieldType === 'date' && cond !== 'never') {
            const hasInvalidPrimaryDate = val && (!CustomDatePicker || !CustomDatePicker.isValidDateValue(val));
            const hasInvalidSecondaryDate = cond === 'between' && val2 && (!CustomDatePicker || !CustomDatePicker.isValidDateValue(val2));
            if (hasInvalidPrimaryDate || hasInvalidSecondaryDate) {
                showFilterError('Enter a date or Never', tintInputs);
                return;
            }

            const dateLogicMessage = getDateFilterValidationMessage({
                cond,
                val: cond === 'between' ? `${val}|${val2}` : val
            }, field, {
                getComparableDateValue
            });
            if (dateLogicMessage) {
                showFilterError(dateLogicMessage, tintInputs);
                return;
            }
        }
    }

    // Between Validation: Value Order
    if (cond === 'between') {
        const type = fieldType;
        let a = val, b = val2;
        if (type === 'number' || type === 'money') {
            a = parseFloat(a); b = parseFloat(b);
        }
        
        if ((type === 'number' || type === 'money') && a === b) {
            showFilterError('Between values must be different', [conditionInput, conditionInput2]);
            return;
        }
        if ((type === 'number' || type === 'money') && a > b) {
            // Swap values
            conditionInput.value = val2;
            conditionInput2.value = val;
            val = conditionInput.value.trim();
            val2 = conditionInput2.value.trim();
        }
    }

    // Applying logic
    if (cond && cond !== 'display') {
        try {
            const isContainerVisible = selContainer && selContainer.style.display !== 'none';
            const isSelectVisible = sel && sel.style.display !== 'none';
            
            let filterValue = val;
            
            if (cond === 'between') {
                filterValue = `${val}|${val2}`;
            } else if (isContainerVisible && selContainer) {
                filterValue = selContainer.getSelectedValues().join(',');
            } else if (isSelectVisible && sel) {
                if (sel.multiple) {
                    filterValue = Array.from(sel.selectedOptions).map(o => o.value).join(',');
                } else {
                    filterValue = sel.value;
                }
            }

            const newFilterObj = { cond, val: filterValue };
            const existingSet = getFilterGroupForField(field) || { filters: [] };
            const shouldReplaceExistingListCondition = Boolean(
                supportsListSelectorCondition(cond) &&
                filterValue !== '' &&
                ((isContainerVisible && selContainer) || (isSelectVisible && sel))
            );
            const contradictionSet = shouldReplaceExistingListCondition
                ? {
                    ...existingSet,
                    filters: existingSet.filters.filter(existingFilter => existingFilter.cond !== cond)
                }
                : existingSet;
            
            // Check for contradictions
            const conflictMsg = getContradictionMessage(contradictionSet, newFilterObj, fieldType, field, {
                getComparableDateValue
            });
            if (conflictMsg) {
                showFilterError(conflictMsg, [conditionInput, conditionInput2]);
                return;
            }

            if (filterValue !== '') {
                console.log(`Applying filter for ${field}: ${cond} ${filterValue}`);
                QueryChangeManager.upsertFilter(field, { cond, val: filterValue }, {
                    replaceByCond: shouldReplaceExistingListCondition,
                    source: 'FilterManager.applyFilter'
                });

                // Update UI state
                document.querySelectorAll('.bubble').forEach(b => {
                    if (b.textContent.trim() === field) {
                        services.applyBubbleStyling(b);
                    }
                });
                
                renderConditionList(field);
                
            }
        } catch (error) {
            console.error('Error applying filter:', error);
            showFilterError('Error applying filter: ' + error.message, []);
            return;
        }
    }

    // Logic for "display", "show", "hide" buttons
    if (cond === 'display' || cond === 'show' || cond === 'hide') {
        if (cond === 'show') {
            services.restoreFieldWithDuplicates(field);
        } else if ((cond === 'hide' || cond === 'display') && getDisplayedFields().includes(field)) {
            QueryChangeManager.hideField(field, {
                source: 'FilterManager.hideField'
            });
        }
    }

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
    const inputs=[inp1,inp2].filter(Boolean);
    configureConditionInputsForType({
      type,
      inputs,
      currentFieldName: getActiveFilterFieldName(),
      selectedCondition: getSelectedCondition(getFilterConditionPanelElement()),
      customDatePicker: CustomDatePicker,
      moneyUtils: MoneyUtils,
      valueFormatting: ValueFormatting
    });
}
