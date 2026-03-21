/**
 * Filter Management
 * Handles filter UI, inputs, and confirmation logic.
 * @module FilterManager
 */

/**
 * FilterPill UI component class
 * Represents a single active filter condition pill in the UI.
 * (Moved from queryUI.js)
 */
var appState = window.AppState;
var services = window.AppServices;
var filterValueUi = window.FilterValueUi;
var uiActions = window.AppUiActions;
const getFilterDisplayValues = filterValueUi.getFilterDisplayValues;
const shouldUseFilterListViewer = filterValueUi.shouldUseFilterListViewer;
const openFilterListViewer = filterValueUi.openFilterListViewer;
const buildFilterValueLabel = filterValueUi.buildFilterValueLabel;

function getFilterConditionPanelElement() {
    return window.DOM?.conditionPanel || document.getElementById('condition-panel');
}

function getFilterInputWrapperElement() {
    return window.DOM?.inputWrapper || document.getElementById('condition-input-wrapper');
}

function getFilterConditionInputElement() {
    return window.DOM?.conditionInput || document.getElementById('condition-input');
}

function getFilterConditionInput2Element() {
    return window.DOM?.conditionInput2 || document.getElementById('condition-input-2');
}

function getFilterBetweenLabelElement() {
    return window.DOM?.betweenLabel || document.getElementById('between-label');
}

function getFilterQueryInputElement() {
    return window.DOM?.queryInput || document.getElementById('query-input');
}

function getFilterErrorLabelElement() {
    return window.DOM?.filterError || document.getElementById('filter-error');
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
    return window.OperatorSelectUtils.createLabeledPicker(conditions, {
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
    const errorLabel = window.DOM.filterError;

    inputElements.forEach(inp => {
        if (inp) inp.classList.add('error');
    });

    if (errorLabel) {
        errorLabel.textContent = message;
        errorLabel.style.display = 'block';
    }

    setTimeout(() => {
        if (errorLabel) errorLabel.style.display = 'none';
        inputElements.forEach(inp => {
            if (inp) inp.classList.remove('error');
        });
    }, duration);

    return false;
}

function getPreferredCondition(conditions, fieldName) {
    const available = Array.isArray(conditions) ? conditions.filter(Boolean) : [];
    if (!available.length) return '';

    const activeFieldFilters = fieldName ? getFilterGroupForField(fieldName) : null;
    const filterConds = activeFieldFilters && Array.isArray(activeFieldFilters.filters)
        ? activeFieldFilters.filters.map(filter => String(filter.cond || '').trim().toLowerCase())
        : [];

    const preferredFromActive = filterConds.find(cond => available.includes(cond));
    if (preferredFromActive) {
        return preferredFromActive;
    }

    if (available.includes('equals')) {
        return 'equals';
    }

    return available[0];
}

function syncConditionSelection(conditionPanel, cond) {
    if (!conditionPanel || !cond) return;

    const operatorSelect = getConditionOperatorSelect(conditionPanel);
    if (operatorSelect && operatorSelect.value !== cond) {
        operatorSelect.value = cond;
    }
}

window.getSelectedCondition = function(conditionPanel = null) {
    const panel = conditionPanel || getFilterConditionPanelElement();
    if (!panel) return '';

    const operatorSelect = getConditionOperatorSelect(panel);
    return operatorSelect && operatorSelect.value
        ? String(operatorSelect.value).trim().toLowerCase()
        : '';
};

function removeConditionPanelNote() {
    const existingNote = document.getElementById('condition-panel-note');
    if (existingNote && existingNote.parentNode) {
        existingNote.parentNode.removeChild(existingNote);
    }
}

function showConditionPanelNote(options) {
    const inputWrapper = getFilterInputWrapperElement();
    if (!inputWrapper) return;

    const config = typeof options === 'string'
        ? { body: options }
        : (options && typeof options === 'object' ? options : {});

    removeConditionPanelNote();

    const note = document.createElement('div');
    note.id = 'condition-panel-note';
    note.className = 'condition-panel-note';
    const kicker = config.kicker ? `<span class="condition-panel-note-kicker">${window.escapeHtml(config.kicker)}</span>` : '';
    const title = config.title ? `<strong class="condition-panel-note-title">${window.escapeHtml(config.title)}</strong>` : '';
    const body = config.body ? `<p class="condition-panel-note-body">${window.escapeHtml(config.body)}</p>` : '';
    const hint = config.hint ? `<p class="condition-panel-note-hint">${window.escapeHtml(config.hint)}</p>` : '';
    note.innerHTML = `${kicker}${title}${body}${hint}`;

    inputWrapper.appendChild(note);
    inputWrapper.style.display = 'flex';
    inputWrapper.classList.add('show');
}

function buildBubbleConditionPanel(bubble) {
    const conditionPanel = getFilterConditionPanelElement();
    const inputWrapper = getFilterInputWrapperElement();
    const conditionInput = getFilterConditionInputElement();
    const confirmBtn = window.DOM?.confirmBtn || document.getElementById('confirm-btn');

    if (!conditionPanel || !inputWrapper || !conditionInput || !confirmBtn) {
        console.warn('buildConditionPanel skipped: missing condition panel DOM nodes');
        return;
    }

    appState.selectedField = bubble.textContent.trim();
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
    const fieldDefInfo = window.fieldDefs ? window.fieldDefs.get(appState.selectedField) : null;
    const isBuildable = fieldDefInfo && fieldDefInfo.is_buildable;
    const backendOperators = typeof window.getFieldFilterOperators === 'function'
        ? window.getFieldFilterOperators(fieldDefInfo)
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
            : ['contains', 'starts', 'equals'];
        conditionPanel.appendChild(createConditionOperatorPicker(operatorConditions, window.buildableConditionBtnHandler));
    } else {
        if (backendOperators.length === 0) {
            operatorConditions = [];
        } else if (listValues && listValues.length && backendOperators.includes('equals')) {
            operatorConditions = ['equals'];
        } else {
            operatorConditions = backendOperators;
        }

        // No applicable conditions for this field — hide the input area entirely
        // so an empty select and stray value input are never shown to the user.
        if (operatorConditions.length === 0) {
            if (conditionInput) conditionInput.style.display = 'none';
            const conditionInput2 = getFilterConditionInput2Element();
            const betweenLabel = getFilterBetweenLabelElement();
            const existingSelect = document.getElementById('condition-select');
            const existingContainer = document.getElementById('condition-select-container');
            if (conditionInput2) (conditionInput2._customDatePickerApi?.shell || conditionInput2).style.display = 'none';
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
            window.renderConditionList(appState.selectedField);
            return;
        }

        conditionPanel.appendChild(createConditionOperatorPicker(operatorConditions, window.handleConditionBtnClick));

        if (listValues && listValues.length) {
            const fieldDef = window.fieldDefs.get(appState.selectedField);
            const isMultiSelect = fieldDef && fieldDef.multiSelect;
            const shouldGroupValues = Boolean(fieldDef && fieldDef.groupValues);
            const isBooleanField = Boolean(fieldDef && fieldDef.type === 'boolean');
            const existingSelect = document.getElementById('condition-select');
            const existingContainer = document.getElementById('condition-select-container');
            if (existingSelect) existingSelect.parentNode.removeChild(existingSelect);
            if (existingContainer) existingContainer.parentNode.removeChild(existingContainer);

            let currentLiteralValues = [];
            const selectedFieldFilters = getFilterGroupForField(appState.selectedField);
            if (selectedFieldFilters) {
                const filter = selectedFieldFilters.filters.find(f => f.cond === 'equals');
                if (filter) {
                    currentLiteralValues = filter.val.split(',').map(v => v.trim());
                }
            }

            const hasDashes = hasValuePairs
                ? listValues.some(val => val.Name.includes('-'))
                : listValues.some(val => val.includes('-'));

            const selector = isBooleanField && listValues.length === 2
                ? createBooleanPillSelector(listValues, currentLiteralValues[0] || '', {
                    onChange: () => {
                        confirmBtn.click();
                    }
                })
                : createGroupedSelector(listValues, isMultiSelect, currentLiteralValues, {
                    enableGrouping: shouldGroupValues && hasDashes
                });
            inputWrapper.insertBefore(selector, confirmBtn);
            conditionInput.style.display = 'none';
            if (isBooleanField && listValues.length === 2) {
                confirmBtn.style.display = 'none';
            }
        } else {
            const existingSelect = document.getElementById('condition-select');
            const existingContainer = document.getElementById('condition-select-container');
            if (existingSelect) existingSelect.style.display = 'none';
            if (existingContainer) existingContainer.parentNode.removeChild(existingContainer);
            window.configureInputsForType(type);

            if (window.isListPasteField(fieldDefInfo) && typeof window.createListPasteInput === 'function') {
                let currentLiteralValues = [];
                const selectedFieldFilters = getFilterGroupForField(appState.selectedField);
                if (selectedFieldFilters) {
                    const filter = selectedFieldFilters.filters.find(f => f.cond === 'equals');
                    if (filter) {
                        currentLiteralValues = String(filter.val).split(',').map(v => v.trim()).filter(Boolean);
                    }
                }

                const listInput = window.createListPasteInput(currentLiteralValues, {
                    placeholder: 'Paste one key per line',
                    hint: 'Paste keys one per line, paste comma-separated keys, or upload a text/CSV file.'
                });
                inputWrapper.insertBefore(listInput, confirmBtn);
                conditionInput.style.display = 'none';
            } else {
                conditionInput.style.display = 'block';
            }
            confirmBtn.style.display = '';
        }
    }

    window.renderConditionList(appState.selectedField);

    const operatorSelect = conditionPanel.querySelector('#condition-operator-select');
    const preferredCondition = getPreferredCondition(operatorConditions, appState.selectedField);
    if (operatorSelect && preferredCondition) {
        operatorSelect.value = preferredCondition;
        const handler = window.handleConditionBtnClick;
        if (typeof handler === 'function') {
            handler({
                currentTarget: operatorSelect,
                stopPropagation() {},
                preventDefault() {}
            });
        }
    }

    if (isBuildable) {
        setTimeout(() => {
            const firstInput = document.querySelector('.dynamic-builder-input');
            if (firstInput) firstInput.focus();
        }, 300);
    }
}

window.BubbleConditionPanel = {
    buildConditionPanel: buildBubbleConditionPanel
};

class FilterPill {
    constructor(filter, fieldDef, onRemove) {
        this.filter = filter; // Note: using 'filter' prop consistent with queryUI version logic
        this.filterData = filter; // Keep compatibility if needed
        this.fieldDef = fieldDef;
        this.onRemove = onRemove;
        this.el = document.createElement('span');
        this.el.className = 'cond-pill'; // Changed class to match queryUI style
        this.render();
    }

    render() {
        const { filter, fieldDef } = this;
        const useListViewer = shouldUseFilterListViewer(filter, fieldDef);

        // Operator label (always show full word)
        let opLabel = filter.cond.charAt(0).toUpperCase() + filter.cond.slice(1);

        // Between: show each bound separately so it reads naturally: "Between X and Y"
        let condContent;
        if (filter.cond.toLowerCase() === 'between') {
            const parts = getFilterDisplayValues(filter, fieldDef);
            const lo = parts[0] || '';
            const hi = parts[1] || '';
            condContent = `Between <b>${lo}</b> and <b>${hi}</b>`;
        } else {
            const valueLabel = buildFilterValueLabel(filter, fieldDef);
            condContent = `${opLabel} <b>${valueLabel}</b>`;
        }
        
                // Remove icon SVG
        const trashSVG = `<button type="button" class="filter-trash" aria-label="Remove filter" tabindex="0" style="background:none;border:none;padding:0;margin-left:0.7em;display:flex;align-items:center;cursor:pointer;color:#888;">${window.Icons.trashSVG(20, 20)}</button>`;
        
        // Render pill content with trash can at the end using flex
        this.el.style.display = 'flex';
        this.el.style.alignItems = 'center';
        this.el.style.justifyContent = 'space-between';
        this.el.innerHTML = `<span>${condContent}</span>${trashSVG}`;
        if (useListViewer) {
            this.el.classList.add('cond-pill-clickable');
            this.el.setAttribute('role', 'button');
            this.el.setAttribute('tabindex', '0');
            this.el.setAttribute('aria-label', `View ${fieldDef?.name || 'filter'} values`);
            this.el.removeAttribute('data-tooltip-html');
            this.el.removeAttribute('data-tooltip');
            this.el.addEventListener('click', event => {
                if (event.target.closest('.filter-trash')) return;
                openFilterListViewer(filter, fieldDef, { fieldName: fieldDef?.name, operatorLabel: opLabel });
            });
            this.el.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openFilterListViewer(filter, fieldDef, { fieldName: fieldDef?.name, operatorLabel: opLabel });
                }
            });
        } else {
            this.el.classList.remove('cond-pill-clickable');
            this.el.removeAttribute('role');
            this.el.removeAttribute('data-tooltip-html');
        }
    
        this.el.querySelector('.filter-trash').addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onRemove) this.onRemove();
        });
    }

    getElement() {
        return this.el;
    }
}

// Expose globally
window.FilterPill = FilterPill;
var getDisplayedFields = window.QueryStateReaders.getDisplayedFields.bind(window.QueryStateReaders);
var getFilterGroupForField = window.QueryStateReaders.getFilterGroupForField.bind(window.QueryStateReaders);

/**
 * Renders the list of active filters for a given field.
 * @param {string} field - The field name
 */
window.renderConditionList = function(field) {
    const container = window.DOM.bubbleCondList;
    if (!container) return;
    
    container.innerHTML = '';
    const data = getFilterGroupForField(field);

    if (!data || !data.filters.length) {
        // Reset specific styling if no filters exist
        document.querySelectorAll('.bubble').forEach(b => {
            if (b.textContent.trim() === field) {
                services.applyBubbleStyling(b);
            }
        });
        
        // Reset selection container inputs
        const selContainer = document.getElementById('condition-select-container');
        if (selContainer && appState.selectedField === field) {
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
            const stillSelected = window.shouldFieldHavePurpleStyling(field);
            if (!stillSelected) {
                services.rerenderBubbles();
            }
        }
        return;
    }

    const list = document.createElement('div');
    list.className = 'cond-list';

    // Create pills for each filter
    const fieldDef = window.fieldDefs.get(field);
    data.filters.forEach((f, idx) => {
        const pill = new FilterPill(f, fieldDef, () => {
            window.QueryChangeManager.removeFilter(field, {
                index: idx,
                source: 'FilterManager.removeFilterPill'
            });

            if (!getFilterGroupForField(field)) {
                document.querySelectorAll('.bubble').forEach(b => {
                    if (b.textContent.trim() === field) {
                        b.removeAttribute('data-filtered');
                        b.classList.remove('bubble-filter');
                    }
                });
            }
            
            // Sync up select container if visible
            const selContainer = document.getElementById('condition-select-container');
            if (selContainer && appState.selectedField === field) {
                if (f.cond === 'equals') {
                    const remainingEquals = data.filters.find(filterItem => filterItem.cond === 'equals');
                    const nextValues = remainingEquals ? remainingEquals.val.split(',').map(v => v.trim()).filter(Boolean) : [];

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
            window.renderConditionList(field);
            uiActions.updateCategoryCounts();
        });
        list.appendChild(pill.getElement());
    });

    container.appendChild(list);
    uiActions.updateCategoryCounts();
    uiActions.updateFilterSidePanel();
};

/**
 * Handles condition button clicks (Equal, Contains, etc.)
 */
window.handleConditionBtnClick = function(e) {
    e.stopPropagation();
    const control = e.currentTarget;
    const conditionPanel = getFilterConditionPanelElement();
    const inputWrapper = getFilterInputWrapperElement();
    const conditionInput = getFilterConditionInputElement();
    const conditionInput2 = getFilterConditionInput2Element();
    const betweenLbl = getFilterBetweenLabelElement();
    const sel = document.getElementById('condition-select');

    if (!conditionPanel || !inputWrapper || !conditionInput || !conditionInput2 || !betweenLbl) return;

    const cond = getConditionFromControl(control);
    if (!cond) return;

    syncConditionSelection(conditionPanel, cond);

    // Handle show/hide/display actions
    if (cond === 'show' || cond === 'hide') {
        if (appState.selectedField) {
            if (cond === 'show') {
                window.QueryChangeManager.showField(appState.selectedField, {
                    source: 'FilterManager.handleConditionBtnClick.show'
                });
            } else if (cond === 'hide' && getDisplayedFields().includes(appState.selectedField)) {
                window.QueryChangeManager.hideField(appState.selectedField, {
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
    if (cond === 'between') {
        (conditionInput2._customDatePickerApi?.shell || conditionInput2).style.display = 'block';
        conditionInput2.style.display = '';
        betweenLbl.style.display = 'block';
        conditionInput2.type = conditionInput.type;
        inputWrapper.classList.add('is-between');
    } else {
        (conditionInput2._customDatePickerApi?.shell || conditionInput2).style.display = 'none';
        betweenLbl.style.display = 'none';
        inputWrapper.classList.remove('is-between');
    }

    inputWrapper.classList.add('show');
    window.positionInputWrapper();
    
    // Focus appropriate input
    const listPasteInput = document.getElementById('condition-select-container');
    if (listPasteInput && typeof listPasteInput.focusInput === 'function' && listPasteInput.style.display !== 'none') {
        listPasteInput.focusInput();
    } else if (sel && sel.style.display !== 'none') {
        sel.focus();
    } else {
        (cond === 'between' ? conditionInput2 : conditionInput).focus();
    }
    
    // Reposition again after layout change
    window.positionInputWrapper();
};

/**
 * Handles filter confirmation action
 */
window.handleFilterConfirm = function(e) {
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

    const cond = window.getSelectedCondition(conditionPanel);
    let val = conditionInput.value.trim();
    let val2 = conditionInput2.value.trim();
    
    const fieldDef = window.fieldDefs.get(field);
    const fieldType = (bubble && bubble.dataset.type) || (fieldDef && fieldDef.type) || 'string';
    if (fieldType === 'money') {
        val = window.MoneyUtils.sanitizeInputValue(val);
        val2 = window.MoneyUtils.sanitizeInputValue(val2);
    }
    const isBuildable = fieldDef && fieldDef.is_buildable;

    // Special handling for buildable fields
    if (isBuildable) {
        handleBuildableFieldConfirm(fieldDef, cond, val);
        window.finalizeConfirmAction();
        return;
    }

    // Validation
    if (cond && cond !== 'display') {
        if (!isBuildable && typeof window.isFieldBackendFilterable === 'function' && !window.isFieldBackendFilterable(fieldDef)) {
            showFilterError('This field is not filterable in the backend.', []);
            return;
        }

        const tintInputs = [conditionInput, conditionInput2];
        
        if (cond === 'between' && (val === '' || val2 === '')) {
            showFilterError('Please enter both values', tintInputs);
            return;
        }
        
        if (cond !== 'between') {
            const isTextInputVisible = conditionInput.style.display !== 'none';
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

        if (fieldType === 'date') {
            const hasInvalidPrimaryDate = val && (!window.CustomDatePicker || !window.CustomDatePicker.isValidDateValue(val));
            const hasInvalidSecondaryDate = cond === 'between' && val2 && (!window.CustomDatePicker || !window.CustomDatePicker.isValidDateValue(val2));
            if (hasInvalidPrimaryDate || hasInvalidSecondaryDate) {
                showFilterError('Use M/D/YYYY', tintInputs);
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
        } else if (type === 'date') {
            a = new Date(a).getTime(); b = new Date(b).getTime();
        }
        
        if (a === b) {
            showFilterError('Between values must be different', [conditionInput, conditionInput2]);
            return;
        }
        if (a > b) {
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
            const shouldReplaceExistingEquals = Boolean(
                cond === 'equals' &&
                filterValue !== '' &&
                ((isContainerVisible && selContainer) || (isSelectVisible && sel))
            );
            const contradictionSet = shouldReplaceExistingEquals
                ? {
                    ...existingSet,
                    filters: existingSet.filters.filter(existingFilter => existingFilter.cond !== 'equals')
                }
                : existingSet;
            
            // Check for contradictions
            const conflictMsg = window.getContradictionMessage(contradictionSet, newFilterObj, fieldType, field);
            if (conflictMsg) {
                showFilterError(conflictMsg, [conditionInput, conditionInput2]);
                return;
            }

            if (filterValue !== '') {
                console.log(`Applying filter for ${field}: ${cond} ${filterValue}`);
                window.QueryChangeManager.upsertFilter(field, { cond, val: filterValue }, {
                    replaceByCond: shouldReplaceExistingEquals,
                    source: 'FilterManager.applyFilter'
                });

                // Update UI state
                document.querySelectorAll('.bubble').forEach(b => {
                    if (b.textContent.trim() === field) {
                        services.applyBubbleStyling(b);
                    }
                });
                
                window.renderConditionList(field);
                
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
            window.QueryChangeManager.removeDisplayedField(field, {
                all: false,
                source: 'FilterManager.hideField'
            });
        }
    }

    window.finalizeConfirmAction();
};

/**
 * Specific logic for MARC fields creation
 */
function handleBuildableFieldConfirm(fieldDef, cond, val) {
    const inputs = document.querySelectorAll('.dynamic-builder-input');
    const inputVals = {};
    
    // Gather all variables
    let missingInput = false;
    for (const inp of inputs) {
        let value = inp.value.trim();
        const patternStr = inp.getAttribute('pattern');
        const errorMsg = inp.dataset.errorMsg || 'Invalid input';
        const inputId = inp.dataset.inputId;
        
        if (!value || (patternStr && !new RegExp(patternStr).test(value))) {
           missingInput = true;
              showFilterError(errorMsg, [inp]);
           break;
        }
        
        inputVals[inputId] = value;
    }
    
    if (missingInput) return;

    // Build the dynamic field name from the template
    let dynamicFieldName = fieldDef.field_template || fieldDef.name;
    let specialPayload = fieldDef.special_payload_template ? JSON.parse(JSON.stringify(fieldDef.special_payload_template)) : null;

    for (const [key, v] of Object.entries(inputVals)) {
        dynamicFieldName = dynamicFieldName.replace(`{${key}}`, v);
        if (specialPayload) {
            // Replace references in special payload
            for (const pKey in specialPayload) {
                if (typeof specialPayload[pKey] === 'string') {
                    specialPayload[pKey] = specialPayload[pKey].replace(`{${key}}`, v);
                }
            }
        }
    }
    
    if (dynamicFieldName === fieldDef.name) return;
    
    // Dynamically add field definition if missing
    window.registerDynamicField(dynamicFieldName, {
        special_payload: specialPayload
    });
    
    services.restoreFieldWithDuplicates(dynamicFieldName);

    // Apply filter if one was selected
    if (cond && val) {
        const alreadyExists = Boolean(getFilterGroupForField(dynamicFieldName)?.filters?.some(f => f.cond === cond && f.val === val));
        if (!alreadyExists) {
            window.QueryChangeManager.upsertFilter(dynamicFieldName, { cond, val }, {
                dedupe: true,
                source: 'FilterManager.addDynamicFieldFilter'
            });
        }
    }

    // Clear search
    const queryInput = getFilterQueryInputElement();
    if (queryInput && queryInput.value.trim()) {
        queryInput.value = '';
        window.updateFilteredDefs(''); 
    }

    setTimeout(() => {
        // Switch to Selected category
        appState.currentCategory = 'Selected';
        document.querySelectorAll('#category-bar .category-btn').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.category === 'Selected')
        );
        services.rerenderBubbles();
    }, 200);
    
    // Clean up base buildable filters just in case
    if (getFilterGroupForField(fieldDef.name)) {
        window.QueryChangeManager.removeFilter(fieldDef.name, {
            removeAll: true,
            source: 'FilterManager.clearBuildableBaseFilter'
        });
    }
}

/**
 * Ensures a dynamically-created field is registered in the in-memory field registries
 * so it participates in selector filtering and counts. Safe to call multiple times
 * for the same field.
 *
 * @param {string} fieldName - The resolved field name
 * @param {Object} [opts] - Optional overrides: type, category, desc, special_payload
 */
window.registerDynamicField = function(fieldName, opts = {}) {
    if (!fieldName || window.fieldDefs.has(fieldName)) return;

    // Copy metadata from a matching buildable parent template when available.
    let parentDef = null;
    if (window.fieldDefsArray) {
        parentDef = window.fieldDefsArray.find(d => {
            if (!d.is_buildable || !d.field_template) return false;
            // Build a regex from the template, replacing {key} placeholders with dynamic segments.
            const pattern = d.field_template.replace(/\{[^}]+\}/g, '[^|]+');
            return new RegExp('^' + pattern + '$').test(fieldName);
        });
    }

    // Resolve special_payload from the parent's template by substituting captured values.
    let resolvedPayload = opts.special_payload || null;
    if (!resolvedPayload && parentDef && parentDef.special_payload_template && parentDef.field_template) {
        const keys = [];
        const capturingPattern = parentDef.field_template.replace(/\{([^}]+)\}/g, (_, key) => {
            keys.push(key);
            return '(.+)';
        });
        const match = new RegExp('^' + capturingPattern + '$').exec(fieldName);
        if (match) {
            resolvedPayload = JSON.parse(JSON.stringify(parentDef.special_payload_template));
            keys.forEach((key, i) => {
                for (const pKey in resolvedPayload) {
                    if (typeof resolvedPayload[pKey] === 'string') {
                        resolvedPayload[pKey] = resolvedPayload[pKey].replace(`{${key}}`, match[i + 1]);
                    }
                }
            });
        }
    }

    const newDef = {
        name: fieldName,
        type: opts.type ?? (parentDef ? parentDef.type : null),
        category: opts.category || (parentDef ? parentDef.category : null),
        desc: opts.desc ?? (parentDef ? parentDef.desc : ''),
        special_payload: resolvedPayload
    };

    window.fieldDefs.set(fieldName, newDef);

    if (window.fieldDefsArray && !window.fieldDefsArray.find(d => d.name === fieldName)) {
        window.fieldDefsArray.push({ ...newDef });
    }
    if (window.filteredDefs && !window.filteredDefs.find(d => d.name === fieldName)) {
        window.filteredDefs.push({ ...newDef });
    }
};

// Global confirm action finalizer
window.finalizeConfirmAction = function() {
    uiActions.updateQueryJson();

    uiActions.updateFilterSidePanel();
    uiActions.updateCategoryCounts();
};

/**
 * Special handler for condition buttons when in a buildable field (e.g., Marc)
 */
window.buildableConditionBtnHandler = function(e) {
    e.stopPropagation();
    const control = e.currentTarget;
    const conditionPanel = getFilterConditionPanelElement();
    const conditionInput = getFilterConditionInputElement();
    const inputWrapper = getFilterInputWrapperElement();
    const conditionInput2 = getFilterConditionInput2Element();
    const betweenLbl = getFilterBetweenLabelElement();

    if (!conditionPanel || !conditionInput || !conditionInput2 || !betweenLbl) return;
    
    const cond = getConditionFromControl(control);
    if (!cond) return;

    syncConditionSelection(conditionPanel, cond);
    
    // Validate the dynamic inputs
    const inputs = document.querySelectorAll('.dynamic-builder-input');
    let isValid = true;
    for (const inp of inputs) {
        let value = inp.value.trim();
        const patternStr = inp.getAttribute('pattern');
        const errorMsg = inp.dataset.errorMsg || 'Invalid input';
        
        const firstVal = value.split(',')[0].trim();
        if (!firstVal || (patternStr && !new RegExp(patternStr).test(firstVal))) {
            const errorLabel = getFilterErrorLabelElement();
            if (errorLabel) {
                errorLabel.textContent = errorMsg;
                errorLabel.style.display = 'block';
                setTimeout(() => { errorLabel.style.display = 'none'; }, 3000);
            }
            isValid = false;
            break;
        }
    }
    
    if (!isValid) return;
    
    // Normal condition button behavior (show input field)
    // Show second input and "and" label only for "between"
    if (cond === 'between') {
        (conditionInput2._customDatePickerApi?.shell || conditionInput2).style.display = 'block';
        conditionInput2.style.display = '';
        betweenLbl.style.display = 'block';
        conditionInput2.type = conditionInput.type;     // match type (date, number, text)
        if (inputWrapper) inputWrapper.classList.add('is-between');
    } else {
        (conditionInput2._customDatePickerApi?.shell || conditionInput2).style.display = 'none';
        betweenLbl.style.display = 'none';
        if (inputWrapper) inputWrapper.classList.remove('is-between');
    }
    
    if (inputWrapper) {
        inputWrapper.classList.add('show');
        if (window.positionInputWrapper) window.positionInputWrapper();
    }
    
    if (conditionInput) conditionInput.focus();
    
    // Re-position after toggling second input visibility
    if (window.positionInputWrapper) window.positionInputWrapper();
};

// --- Condition templates by type ---
window.typeConditions = {
  string: ['contains','starts','equals'],     // no "between" for plain strings
  number: ['greater','less','equals','between'],
  money : ['greater','less','equals','between'],
  date  : ['equals','before','after','on_or_before','on_or_after','between']
};

/* ---------- Input helpers to avoid duplicated numeric-config blocks ---------- */
function setNumericProps(inputs, allowDecimal){
  inputs.forEach(inp=>{
    inp.setAttribute('inputmode', allowDecimal ? 'decimal' : 'numeric');
    inp.setAttribute('step', allowDecimal ? '0.01' : '1');
    inp.onkeypress = e=>{
      const regex = allowDecimal ? /[0-9.]/ : /[0-9]/;
      if(!regex.test(e.key)) e.preventDefault();
    };
  });
}

function clearNumericProps(inputs){
  inputs.forEach(inp=>{
    inp.removeAttribute('inputmode');
    inp.removeAttribute('step');
    inp.onkeypress = null;
  });
}

function setMoneyFieldAppearance(inputs, isMoney) {
    inputs.forEach(inp => {
        inp.classList.toggle('condition-field-money', Boolean(isMoney));
        if (isMoney) {
            inp.placeholder = '0.00';
        } else if (inp.placeholder === '0.00') {
            inp.placeholder = 'Enter value...';
        }

        window.MoneyUtils.configureInputBehavior(inp, Boolean(isMoney));
    });
}

window.configureInputsForType = function(type){
    const inp1 = getFilterConditionInputElement();
    const inp2 = getFilterConditionInput2Element();
    const inputs=[inp1,inp2].filter(Boolean);
  const isMoney  = type==='money';
  const isNumber = type==='number';
    const isDate = type === 'date';
    const htmlType = isDate ? 'text' : isMoney ? 'text' : isNumber ? 'number' : 'text';

    if (!isDate) {
        inputs.forEach(inp => {
            const datePickerApi = inp._customDatePickerApi;
            if (datePickerApi && typeof datePickerApi.destroy === 'function') {
                datePickerApi.destroy();
            }
        });
    }

  inputs.forEach(inp=> inp.type = htmlType);

  if(isMoney){
    setNumericProps(inputs,true);
  }else if(isNumber){
    setNumericProps(inputs,false);
  }else{
    clearNumericProps(inputs);
  }

    setMoneyFieldAppearance(inputs, isMoney);

    if (window.CustomDatePicker && typeof window.CustomDatePicker.enhanceInput === 'function') {
        inputs.forEach(inp => {
            if (isDate) {
                window.CustomDatePicker.enhanceInput(inp, {
                    variant: 'filter',
                    enabled: true,
                    placeholder: 'M/D/YYYY'
                });
                inp.dataset.errorMsg = 'Use M/D/YYYY';
                inp.setAttribute('pattern', '^\\d{1,2}\\/\\d{1,2}\\/\\d{4}$');
            } else {
                inp.removeAttribute('pattern');
                if (inp.dataset.errorMsg === 'Use M/D/YYYY') {
                    delete inp.dataset.errorMsg;
                }
            }
        });
    }
};

window.isListPasteField = function(fieldDef) {
    return Boolean(fieldDef && fieldDef.allowValueList && (!fieldDef.values || fieldDef.values.length === 0));
};

/* ---------- Check for contradiction & return human-readable reason ---------- */
window.getContradictionMessage = function(existing, newF, fieldType, fieldLabel){
    if(!existing || !Array.isArray(existing.filters)) return null;

  const toNum = v=>{
    if(fieldType === 'date'){
      return new Date(v).getTime();
    }
    return parseFloat(v);
  };
  const parseVals = f => (f.cond === 'between')
    ? f.val.split('|').map(v=>v.trim())
    : [f.val.trim()];

  const numericVals = f => parseVals(f).map(toNum);

  /* build a human-readable phrase like "equal 5", "be greater than 10", etc. */
  const phrase = f=>{
    const vals = parseVals(f);
    switch(f.cond){
      case 'equals':  return `equal ${vals[0]}`;
      case 'contains':return `contain ${vals[0]}`;
      case 'starts':  return `start with ${vals[0]}`;
      case 'doesnotcontain': return `not contain ${vals[0]}`;
      case 'greater': return `be greater than ${vals[0]}`;
      case 'less':    return `be less than ${vals[0]}`;
      case 'between': return `be between ${vals[0]} and ${vals[1]}`;
      case 'before':  return `be before ${vals[0]}`;
      case 'on_or_before': return `be on or before ${vals[0]}`;
      case 'after':   return `be after ${vals[0]}`;
      case 'on_or_after':  return `be on or after ${vals[0]}`;
      default:        return `${f.cond} ${vals.join(' and ')}`;
    }
  };

  const nLabel = phrase(newF);
  const nVals  = numericVals(newF);
  const nLow   = Math.min(...nVals);
  const nHigh  = Math.max(...nVals);

  for(const f of existing.filters){
    const fLabel = phrase(f);
    const fVals  = numericVals(f);
    const low    = Math.min(...fVals);
    const high   = Math.max(...fVals);

    /* Helper to produce final message */
    const msg = `${fieldLabel} cannot ${nLabel} and ${fLabel}`;

    // Equals conflicts
    if(newF.cond === 'equals'){
      if(f.cond === 'equals'     && nVals[0] !== fVals[0]) return msg;
      if(f.cond === 'greater'    && nVals[0] <= fVals[0])  return msg;
      if(f.cond === 'less'       && nVals[0] >= fVals[0])  return msg;
      if(f.cond === 'between'    && (nVals[0] < low || nVals[0] > high)) return msg;
    }
    if(f.cond === 'equals'){
      if(newF.cond === 'greater' && fVals[0] <= nVals[0])  return msg;
      if(newF.cond === 'less'    && fVals[0] >= nVals[0])  return msg;
      if(newF.cond === 'between' && (fVals[0] < nLow || fVals[0] > nHigh)) return msg;
    }

    // Greater / Less conflicts
    if(newF.cond === 'greater'){
      if(f.cond === 'less'   && nVals[0] >= fVals[0]) return msg;
      if(f.cond === 'between'&& nVals[0] >= high)     return msg;
    }
    if(newF.cond === 'less'){
      if(f.cond === 'greater'&& nVals[0] <= fVals[0]) return msg;
      if(f.cond === 'between'&& nVals[0] <= low)      return msg;
    }
    if(newF.cond === 'between'){
      if(f.cond === 'greater'&& nHigh <= fVals[0]) return msg;
      if(f.cond === 'less'   && nLow  >= fVals[0]) return msg;
      if(f.cond === 'between'&& (high < nLow || low > nHigh)) return msg;
    }
  }
  return null;
};
