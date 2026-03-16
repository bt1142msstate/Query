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
function getFilterValueMap(fieldDef) {
    if (!fieldDef || !fieldDef.values || fieldDef.values.length === 0) {
        return new Map();
    }

    if (window.getLiteralToDisplayMap) {
        return window.getLiteralToDisplayMap(fieldDef);
    }

    return typeof fieldDef.values[0] === 'object'
        ? new Map(fieldDef.values.map(v => [v.RawValue, v.Name]))
        : new Map();
}

function getFilterDisplayValues(filter, fieldDef) {
    const rawValues = filter && filter.cond && filter.cond.toLowerCase() === 'between'
        ? String(filter.val || '').split('|')
        : String(filter && filter.val || '').split(',');
    const valMap = getFilterValueMap(fieldDef);

    return rawValues
        .map(value => String(value).trim())
        .filter(Boolean)
        .map(value => valMap.get(value) || value);
}

function buildListSummaryLabel(values) {
    if (!values || values.length === 0) return '';
    if (values.length === 1) return values[0];
    return `${values[0]}, and ${values.length - 1} more`;
}

function shouldUseFilterListViewer(filter, fieldDef) {
    const values = getFilterDisplayValues(filter, fieldDef);
    return Boolean(fieldDef && fieldDef.allowValueList && values.length > 1);
}

function ensureFilterListViewer() {
    let backdrop = document.getElementById('filter-list-viewer-backdrop');
    let panel = document.getElementById('filter-list-viewer');

    if (backdrop && panel) {
        return { backdrop, panel };
    }

    backdrop = document.createElement('div');
    backdrop.id = 'filter-list-viewer-backdrop';
    backdrop.className = 'filter-list-viewer-backdrop hidden';

    panel = document.createElement('div');
    panel.id = 'filter-list-viewer';
    panel.className = 'filter-list-viewer hidden';
    panel.innerHTML = `
        <div class="filter-list-viewer-header">
            <div>
                <div id="filter-list-viewer-title" class="filter-list-viewer-title"></div>
                <div id="filter-list-viewer-meta" class="filter-list-viewer-meta"></div>
            </div>
            <div class="filter-list-viewer-actions">
                <button type="button" id="filter-list-viewer-copy" class="filter-list-viewer-icon-btn" aria-label="Copy list" data-tooltip="Copy list">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="2"/></svg>
                </button>
                <button type="button" id="filter-list-viewer-download" class="filter-list-viewer-icon-btn" aria-label="Download list" data-tooltip="Download list as text file">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 21h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
                <button type="button" id="filter-list-viewer-close" class="filter-list-viewer-close" aria-label="Close list viewer">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
            </div>
        </div>
        <div id="filter-list-viewer-body" class="filter-list-viewer-body"></div>
    `;

    const closeViewer = () => {
        backdrop.classList.add('hidden');
        panel.classList.add('hidden');
    };

    panel._viewerState = {
        values: [],
        filenameBase: 'filter-values'
    };

    backdrop.addEventListener('click', closeViewer);
    panel.querySelector('#filter-list-viewer-close').addEventListener('click', closeViewer);
    panel.querySelector('#filter-list-viewer-copy').addEventListener('click', async () => {
        const rawText = (panel._viewerState.values || []).join("\n");
        if (!rawText) return;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(rawText);
            }
            if (window.showToastMessage) {
                window.showToastMessage('List copied to clipboard.', 'success');
            }
        } catch (error) {
            if (window.showToastMessage) {
                window.showToastMessage('Failed to copy list.', 'error');
            }
        }
    });
    panel.querySelector('#filter-list-viewer-download').addEventListener('click', () => {
        const rawText = (panel._viewerState.values || []).join("\n");
        if (!rawText) return;

        const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `${panel._viewerState.filenameBase || 'filter-values'}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);

        if (window.showToastMessage) {
            window.showToastMessage('List downloaded.', 'success');
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.classList.contains('hidden')) {
            closeViewer();
        }
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    return { backdrop, panel };
}

function openFilterListViewer(filter, fieldDef, options = {}) {
    const values = getFilterDisplayValues(filter, fieldDef);
    if (values.length <= 1) {
        return;
    }

    const { backdrop, panel } = ensureFilterListViewer();
    const titleEl = panel.querySelector('#filter-list-viewer-title');
    const metaEl = panel.querySelector('#filter-list-viewer-meta');
    const bodyEl = panel.querySelector('#filter-list-viewer-body');
    const fieldLabel = options.fieldName || fieldDef?.name || 'Selected Values';
    const operatorLabel = options.operatorLabel || (filter.cond.charAt(0).toUpperCase() + filter.cond.slice(1));
    const filenameBase = String(`${fieldLabel} ${operatorLabel}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'filter-values';

    const items = values
        .map(value => `<li class="filter-list-viewer-item">${window.escapeHtml ? window.escapeHtml(value) : value}</li>`)
        .join('');

    titleEl.textContent = `${fieldLabel} ${operatorLabel}`;
    metaEl.textContent = `${values.length} value${values.length === 1 ? '' : 's'}`;
    bodyEl.innerHTML = `<ul class="filter-list-viewer-list">${items}</ul>`;
    panel._viewerState.values = values.slice();
    panel._viewerState.filenameBase = filenameBase;

    backdrop.classList.remove('hidden');
    panel.classList.remove('hidden');
}

function buildFilterValueLabel(filter, fieldDef, betweenSeparator = ' - ') {
    const isBetween = filter.cond.toLowerCase() === 'between';
    const values = getFilterDisplayValues(filter, fieldDef);

    if (fieldDef && fieldDef.type === 'date') {
        if (isBetween) {
            const parts = values;
            if (parts.length === 2) {
                return `${parts[0]}${betweenSeparator}${parts[1]}`;
            }
        }
        return values.join(', ');
    }

    if (isBetween) {
        return values.join(betweenSeparator);
    }

    if (fieldDef && fieldDef.allowValueList && values.length > 1) {
        return buildListSummaryLabel(values);
    }

    return values.join(', ');
}

window.getFilterDisplayValues = getFilterDisplayValues;
window.openFilterListViewer = openFilterListViewer;
window.shouldUseFilterListViewer = shouldUseFilterListViewer;

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

function getFilterOverlayElement() {
    return window.DOM?.overlay || document.getElementById('overlay');
}

function getFilterQueryInputElement() {
    return window.DOM?.queryInput || document.getElementById('query-input');
}

function getFilterErrorLabelElement() {
    return window.DOM?.filterError || document.getElementById('filter-error');
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
        const valueLabel = buildFilterValueLabel(filter, fieldDef);
        const useListViewer = shouldUseFilterListViewer(filter, fieldDef);

        // Operator label (always show full word)
        let opLabel = filter.cond.charAt(0).toUpperCase() + filter.cond.slice(1);
        
        // Trash can SVG
        const trashSVG = `<button type="button" class="filter-trash" aria-label="Remove filter" tabindex="0" style="background:none;border:none;padding:0;margin-left:0.7em;display:flex;align-items:center;cursor:pointer;color:#888;">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
            <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1Zm-3 6h12l-.8 11.2A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-1.99-1.8L6 9Z"/>
          </svg>
        </button>`;
        
        // Render pill content with trash can at the end using flex
        this.el.style.display = 'flex';
        this.el.style.alignItems = 'center';
        this.el.style.justifyContent = 'space-between';
        this.el.innerHTML = `<span>${opLabel} <b>${valueLabel}</b></span>${trashSVG}`;
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

/**
 * Renders the list of active filters for a given field.
 * @param {string} field - The field name
 */
window.renderConditionList = function(field) {
    const container = document.getElementById('bubble-cond-list');
    if (!container) return;
    
    container.innerHTML = '';
    const data = window.activeFilters[field];

    if (!data || !data.filters.length) {
        // Reset specific styling if no filters exist
        document.querySelectorAll('.bubble').forEach(b => {
            if (b.textContent.trim() === field) {
                window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(b);
            }
        });
        
        // Reset selection container inputs
        const selContainer = document.getElementById('condition-select-container');
        if (selContainer && window.selectedField === field) {
                 if (typeof selContainer.setSelectedValues === 'function') {
                     selContainer.setSelectedValues([]);
                 }
             selContainer.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
                input.checked = false;
             });
        }
        
        window.updateCategoryCounts && window.updateCategoryCounts();
        
        // Only re-render bubbles if the field was in Selected and is now gone
        if (window.currentCategory === 'Selected') {
            const stillSelected = window.shouldFieldHavePurpleStyling(field);
            if (!stillSelected) {
                window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
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
            data.filters.splice(idx, 1);
            if (data.filters.length === 0) {
                delete window.activeFilters[field];
                document.querySelectorAll('.bubble').forEach(b => {
                    if (b.textContent.trim() === field) {
                        b.removeAttribute('data-filtered');
                        b.classList.remove('bubble-filter');
                    }
                });
            }
            
            // Sync up select container if visible
            const selContainer = document.getElementById('condition-select-container');
            if (selContainer && window.selectedField === field) {
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
            
            window.updateQueryJson();
            window.renderConditionList(field);
            window.updateCategoryCounts();
            
            if (window.currentCategory === 'Selected') {
                window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
            }
        });
        list.appendChild(pill.getElement());
    });

    container.appendChild(list);
    window.updateCategoryCounts && window.updateCategoryCounts();
    window.FilterSidePanel && window.FilterSidePanel.update();
};

/**
 * Handles condition button clicks (Equal, Contains, etc.)
 */
window.handleConditionBtnClick = function(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const conditionPanel = getFilterConditionPanelElement();
    const inputWrapper = getFilterInputWrapperElement();
    const conditionInput = getFilterConditionInputElement();
    const conditionInput2 = getFilterConditionInput2Element();
    const betweenLbl = getFilterBetweenLabelElement();
    const sel = document.getElementById('condition-select');

    if (!conditionPanel || !inputWrapper || !conditionInput || !conditionInput2 || !betweenLbl) return;

    // Update active class
    const all = conditionPanel.querySelectorAll('.condition-btn');
    all.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const cond = btn.dataset.cond;

    // Handle show/hide/display actions
    if (cond === 'show' || cond === 'hide') {
        if (window.selectedField) {
            let success = false;
            // Assuming addColumn/removeColumnByName are global from columnManager/dragDrop refactor
            if (cond === 'show') {
                success = window.addColumn ? window.addColumn(window.selectedField) : false;
            } else if (cond === 'hide' && window.displayedFields.includes(window.selectedField)) {
                success = window.removeColumnByName ? window.removeColumnByName(window.selectedField) : false;
            }
            
            // Update toggle buttons state
            const toggleButtons = conditionPanel.querySelectorAll('.toggle-half');
            toggleButtons.forEach(toggleBtn => {
                toggleBtn.classList.remove('active');
                const toggleCond = toggleBtn.dataset.cond;
                if (toggleCond === 'show' && window.displayedFields.includes(window.selectedField)) {
                    toggleBtn.classList.add('active');
                } else if (toggleCond === 'hide' && !window.displayedFields.includes(window.selectedField)) {
                    toggleBtn.classList.add('active');
                }
            });
        }
        return;
    }

    // "Between" logic
    if (cond === 'between') {
        conditionInput2.style.display = 'block';
        betweenLbl.style.display = 'inline';
        conditionInput2.type = conditionInput.type;
    } else {
        conditionInput2.style.display = 'none';
        betweenLbl.style.display = 'none';
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
    const bubble = document.querySelector('.active-bubble');
    if (!bubble) return;
    
    const conditionPanel = getFilterConditionPanelElement();
    const conditionInput = getFilterConditionInputElement();
    const conditionInput2 = getFilterConditionInput2Element();
    const sel = document.getElementById('condition-select');
    const selContainer = document.getElementById('condition-select-container');
    const overlay = getFilterOverlayElement();

    if (!conditionPanel || !conditionInput || !conditionInput2) return;
    
    const field = bubble.dataset.filterFor || bubble.textContent.trim();
    const activeBtn = document.querySelector('.condition-btn.active');
    const cond = activeBtn?.dataset.cond;
    let val = conditionInput.value.trim();
    let val2 = conditionInput2.value.trim();
    
    const fieldDef = window.fieldDefs.get(field);
    const isBuildable = fieldDef && fieldDef.is_buildable;

    // Special handling for buildable fields
    if (isBuildable) {
        handleBuildableFieldConfirm(fieldDef, cond, val);
        window.finalizeConfirmAction();
        return;
    }

    const isMultiSelect = fieldDef && fieldDef.multiSelect;

    // Validation
    if (cond && cond !== 'display') {
        const tintInputs = [conditionInput, conditionInput2];
        
        if (cond === 'between' && (val === '' || val2 === '')) {
            window.showError('Please enter both values', tintInputs);
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
                window.showError('Please enter a value', tintInputs);
                return;
            }
        }
    }

    // Between Validation: Value Order
    if (cond === 'between') {
        const type = bubble.dataset.type || 'string';
        let a = val, b = val2;
        if (type === 'number' || type === 'money') {
            a = parseFloat(a); b = parseFloat(b);
        } else if (type === 'date') {
            a = new Date(a).getTime(); b = new Date(b).getTime();
        }
        
        if (a === b) {
            window.showError('Between values must be different', [conditionInput, conditionInput2]);
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
            if (!window.activeFilters[field]) {
                window.activeFilters[field] = { filters: [] };
            }

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

            const fieldType = bubble.dataset.type || 'string';
            const newFilterObj = { cond, val: filterValue };
            const existingSet = window.activeFilters[field];
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
                window.showError(conflictMsg, [conditionInput, conditionInput2]);
                return;
            }

            if (filterValue !== '') {
                console.log(`Applying filter for ${field}: ${cond} ${filterValue}`);
                
                if (shouldReplaceExistingEquals) {
                    const existingEqualsIdx = window.activeFilters[field].filters.findIndex(f => f.cond === 'equals');
                    if (existingEqualsIdx !== -1) {
                        window.activeFilters[field].filters[existingEqualsIdx].val = filterValue;
                    } else {
                        window.activeFilters[field].filters.push({ cond, val: filterValue });
                    }
                }
                else {
                    window.activeFilters[field].filters.push({ cond, val: filterValue });
                }

                // Update UI state
                document.querySelectorAll('.bubble').forEach(b => {
                    if (b.textContent.trim() === field) {
                        window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(b);
                    }
                });
                
                window.renderConditionList(field);
                
                if (window.currentCategory === 'Selected') {
                    window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
                }
            }
        } catch (error) {
            console.error('Error applying filter:', error);
            window.showError('Error applying filter: ' + error.message, []);
            return;
        }
    }

    // Logic for "display", "show", "hide" buttons
    if (cond === 'display' || cond === 'show' || cond === 'hide') {
        if (cond === 'show') {
            window.DragDropSystem.restoreFieldWithDuplicates(field);
            window.showExampleTable(window.displayedFields).catch(console.error);
        } else if ((cond === 'hide' || cond === 'display') && window.displayedFields.includes(field)) {
            const idx = window.displayedFields.indexOf(field);
            window.displayedFields.splice(idx, 1);
            window.showExampleTable(window.displayedFields).catch(console.error);
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
           window.showError(errorMsg, [inp]);
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
    
    window.DragDropSystem.restoreFieldWithDuplicates(dynamicFieldName);

    // Apply filter if one was selected
    if (cond && val) {
        if (!window.activeFilters[dynamicFieldName]) {
            window.activeFilters[dynamicFieldName] = { filters: [] };
        }
        const alreadyExists = window.activeFilters[dynamicFieldName].filters.some(f => f.cond === cond && f.val === val);
        if (!alreadyExists) {
            window.activeFilters[dynamicFieldName].filters.push({ cond, val });
        }
    }

    // Update table once
    window.showExampleTable(window.displayedFields).catch(console.error);

    // Clear search
    const queryInput = getFilterQueryInputElement();
    if (queryInput && queryInput.value.trim()) {
        queryInput.value = '';
        window.updateFilteredDefs(''); 
    }

    setTimeout(() => {
        // Switch to Selected category
        window.currentCategory = 'Selected';
        document.querySelectorAll('#category-bar .category-btn').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.category === 'Selected')
        );
        
        window.updateCategoryCounts();
        window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
    }, 200);
    
    // Clean up base buildable filters just in case
    if (window.activeFilters[fieldDef.name]) delete window.activeFilters[fieldDef.name];
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
    window.updateQueryJson();

    window.FilterSidePanel && window.FilterSidePanel.update();
    window.updateCategoryCounts && window.updateCategoryCounts();
};

/**
 * Special handler for condition buttons when in a buildable field (e.g., Marc)
 */
window.buildableConditionBtnHandler = function(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const conditionPanel = getFilterConditionPanelElement();
    const conditionInput = getFilterConditionInputElement();
    const inputWrapper = getFilterInputWrapperElement();
    const conditionInput2 = getFilterConditionInput2Element();
    const betweenLbl = getFilterBetweenLabelElement();

    if (!conditionPanel || !conditionInput || !conditionInput2 || !betweenLbl) return;
    
    // Update active state
    const all = conditionPanel.querySelectorAll('.condition-btn');
    all.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const cond = btn.dataset.cond;
    
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
        conditionInput2.style.display = 'block';
        betweenLbl.style.display = 'inline';
        conditionInput2.type = conditionInput.type;     // match type (date, number, text)
    } else {
        conditionInput2.style.display = 'none';
        betweenLbl.style.display = 'none';
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
    });
}

window.configureInputsForType = function(type){
    const inp1 = getFilterConditionInputElement();
    const inp2 = getFilterConditionInput2Element();
    const inputs=[inp1,inp2].filter(Boolean);
  const isMoney  = type==='money';
  const isNumber = type==='number';
  const htmlType = (type==='date') ? 'date' : (isMoney||isNumber) ? 'number':'text';
  inputs.forEach(inp=> inp.type = htmlType);

  if(isMoney){
    setNumericProps(inputs,true);
  }else if(isNumber){
    setNumericProps(inputs,false);
  }else{
    clearNumericProps(inputs);
  }

    setMoneyFieldAppearance(inputs, isMoney);
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
