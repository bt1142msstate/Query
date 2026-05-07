import { appServices, registerFilterService } from '../core/appServices.js';
import { appUiActions } from '../core/appUiActions.js';
import { Icons, MoneyUtils, OperatorSelectUtils, ValueFormatting } from '../core/utils.js';
import { AppState, QueryChangeManager, QueryStateReaders } from '../core/queryState.js';
import {
    buildFilterValueLabel,
    getFilterDisplayValues,
    openFilterListViewer,
    shouldUseFilterListViewer
} from './filterValueUi.js';
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
import { escapeHtml } from '../core/html.js';
import {
    getContradictionMessage,
    isListPasteField,
    supportsListSelectorCondition
} from './filterConditionLogic.js';

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
    const errorLabel = DOM.filterError;

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

function getSelectedCondition(conditionPanel = null) {
    const panel = conditionPanel || getFilterConditionPanelElement();
    if (!panel) return '';

    const operatorSelect = getConditionOperatorSelect(panel);
    return operatorSelect && operatorSelect.value
        ? String(operatorSelect.value).trim().toLowerCase()
        : '';
}

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
    const kicker = config.kicker ? `<span class="condition-panel-note-kicker">${escapeHtml(config.kicker)}</span>` : '';
    const title = config.title ? `<strong class="condition-panel-note-title">${escapeHtml(config.title)}</strong>` : '';
    const body = config.body ? `<p class="condition-panel-note-body">${escapeHtml(config.body)}</p>` : '';
    const hint = config.hint ? `<p class="condition-panel-note-hint">${escapeHtml(config.hint)}</p>` : '';
    note.innerHTML = `${kicker}${title}${body}${hint}`;

    inputWrapper.appendChild(note);
    inputWrapper.style.display = 'flex';
    inputWrapper.classList.add('show');
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
            const firstInput = document.querySelector('.dynamic-builder-input');
            if (firstInput) firstInput.focus();
        }, 300);
    }
}

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
        
        const trashSVG = `<button type="button" class="filter-trash" aria-label="Remove filter" tabindex="0" style="background:none;border:none;padding:0;margin-left:0.7em;display:flex;align-items:center;cursor:pointer;color:#888;">${Icons.trashSVG(20, 20)}</button>`;
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

var getDisplayedFields = QueryStateReaders.getDisplayedFields.bind(QueryStateReaders);
var getFilterGroupForField = QueryStateReaders.getFilterGroupForField.bind(QueryStateReaders);

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

function createPostFilterPill() {
    const summary = getPostFilterSummary();
    if (!summary.hasPostFilters) {
        return null;
    }

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'cond-pill cond-pill-post-filter cond-pill-clickable';
    pill.setAttribute('aria-label', 'Open post filters');
    pill.setAttribute('data-tooltip', 'Edit active post filters');

    const fieldLabel = summary.fieldCount === 1 ? 'field' : 'fields';
    const ruleLabel = summary.ruleCount === 1 ? 'rule' : 'rules';
    pill.innerHTML = `Post Filters <b>${summary.ruleCount} ${ruleLabel}</b> across <b>${summary.fieldCount} ${fieldLabel}</b>`;

    pill.addEventListener('click', () => {
        uiActions.openPostFilters();
    });

    pill.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            uiActions.openPostFilters();
        }
    });

    return pill;
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
    const postFilterPill = createPostFilterPill();
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
            const pill = new FilterPill(f, fieldDef, () => {
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
            list.appendChild(pill.getElement());
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

    if (!conditionPanel || !inputWrapper || !conditionInput || !conditionInput2 || !betweenLbl) return;

    const cond = getConditionFromControl(control);
    if (!cond) return;

    syncConditionSelection(conditionPanel, cond);

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

    inputWrapper.classList.add('show');
    uiActions.positionInputWrapper();
    
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
        
        if (cond !== 'between') {
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

        if (fieldType === 'date') {
            const hasInvalidPrimaryDate = val && (!CustomDatePicker || !CustomDatePicker.isValidDateValue(val));
            const hasInvalidSecondaryDate = cond === 'between' && val2 && (!CustomDatePicker || !CustomDatePicker.isValidDateValue(val2));
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
            a = getComparableDateValue(a); b = getComparableDateValue(b);
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
    registerDynamicField(dynamicFieldName, {
        special_payload: specialPayload
    });
    
    services.restoreFieldWithDuplicates(dynamicFieldName);

    // Apply filter if one was selected
    if (cond && val) {
        const alreadyExists = Boolean(getFilterGroupForField(dynamicFieldName)?.filters?.some(f => f.cond === cond && f.val === val));
        if (!alreadyExists) {
            QueryChangeManager.upsertFilter(dynamicFieldName, { cond, val }, {
                dedupe: true,
                source: 'FilterManager.addDynamicFieldFilter'
            });
        }
    }

    // Clear search
    const queryInput = getFilterQueryInputElement();
    if (queryInput && queryInput.value.trim()) {
        queryInput.value = '';
        updateFilteredDefs('');
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
        QueryChangeManager.removeFilter(fieldDef.name, {
            removeAll: true,
            source: 'FilterManager.clearBuildableBaseFilter'
        });
    }
}

// Global confirm action finalizer
function finalizeConfirmAction() {
    uiActions.updateQueryJson();

    uiActions.updateFilterSidePanel();
    uiActions.updateCategoryCounts();
}

/**
 * Special handler for condition buttons when in a buildable field (e.g., Marc)
 */
function buildableConditionBtnHandler(e) {
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
        setConditionInputVisible(conditionInput2, true);
        betweenLbl.style.display = 'block';
        conditionInput2.type = conditionInput.type;     // match type (date, number, text)
        if (inputWrapper) inputWrapper.classList.add('is-between');
    } else {
        setConditionInputVisible(conditionInput2, false);
        betweenLbl.style.display = 'none';
        if (inputWrapper) inputWrapper.classList.remove('is-between');
    }
    
    if (inputWrapper) {
        inputWrapper.classList.add('show');
        uiActions.positionInputWrapper();
    }
    
    if (conditionInput) conditionInput.focus();
    
    // Re-position after toggling second input visibility
    uiActions.positionInputWrapper();
}

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

function setNumericFieldAppearance(inputs, numericKind) {
    inputs.forEach(inp => {
        const isMoney = numericKind === 'money';
        const isInteger = numericKind === 'integer';
        const isDecimal = numericKind === 'decimal';
        inp.classList.toggle('condition-field-money', isMoney);
        if (isMoney) {
            inp.placeholder = '0.00';
        } else if (isDecimal) {
            inp.placeholder = '0.00';
        } else if (isInteger) {
            inp.placeholder = '0';
        } else if (inp.placeholder === '0.00') {
            inp.placeholder = 'Enter value...';
        } else if (inp.placeholder === '0') {
            inp.placeholder = 'Enter value...';
        }

        const mode = isMoney
          ? true
          : (isDecimal ? { kind: 'decimal' } : (isInteger ? { kind: 'integer' } : false));
        MoneyUtils.configureInputBehavior(inp, mode);
    });
}

function configureInputsForType(type){
    const inp1 = getFilterConditionInputElement();
    const inp2 = getFilterConditionInput2Element();
    const inputs=[inp1,inp2].filter(Boolean);
  const isMoney  = type==='money';
  const isNumber = type==='number';
    const currentFieldName = getActiveFilterFieldName();
    const numberFormat = ValueFormatting.getNumberFormat(currentFieldName) || '';
    const isDate = type === 'date';
    const htmlType = 'text';

    if (!isDate) {
        inputs.forEach(inp => {
            const datePickerApi = inp._customDatePickerApi;
            if (datePickerApi && typeof datePickerApi.destroy === 'function') {
                datePickerApi.destroy();
            }
        });
    }

  inputs.forEach(inp=> inp.type = htmlType);

  if(isMoney || (isNumber && numberFormat === 'decimal')){
    setNumericProps(inputs,true);
  }else if(isNumber){
    setNumericProps(inputs,false);
  }else{
    clearNumericProps(inputs);
  }

    setNumericFieldAppearance(
      inputs,
      isMoney ? 'money' : (
        isNumber
          ? (numberFormat === 'decimal' ? 'decimal' : (numberFormat !== 'year' ? 'integer' : 'plain'))
          : 'plain'
      )
    );

    if (CustomDatePicker && typeof CustomDatePicker.enhanceInput === 'function') {
        inputs.forEach(inp => {
            if (isDate) {
                CustomDatePicker.enhanceInput(inp, {
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
}
