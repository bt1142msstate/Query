/* ==========================================
   FILTER SIDE PANEL
    Collapsible side panel showing all active filters,
    supporting inline edit, remove, and add-condition.
   ========================================== */
window.FilterSidePanel = (function () {
    let currentViewMode = 'both';
    const VIEW_MODES = new Set(['both', 'filters', 'display']);

    const $ = id => document.getElementById(id);

    function getDisplayedFields() {
        return Array.isArray(window.displayedFields) ? window.displayedFields : [];
    }

    function cleanupPopupControls(container) {
        if (!container) {
            return;
        }

        Array.from(container.querySelectorAll('.form-mode-popup-list-control')).forEach(control => {
            if (typeof control._cleanupPopup === 'function') {
                control._cleanupPopup();
            }
        });
    }

    function hasAnyFilters() {
        return window.activeFilters &&
            Object.keys(window.activeFilters).some(
                k => window.activeFilters[k] &&
                     window.activeFilters[k].filters &&
                     window.activeFilters[k].filters.length > 0
            );
    }

    function hasDisplayedFields() {
        return getDisplayedFields().length > 0;
    }

    function hasPanelContent() {
        return hasDisplayedFields() || hasAnyFilters();
    }

    function open() {
        const panel = $('filter-side-panel');
        if (panel) {
            panel.classList.remove('panel-hidden');
            panel.classList.add('panel-open');
        }
    }

    function close() {
        hideFully();
    }

    function toggle() {
        const panel = $('filter-side-panel');
        if (panel && panel.classList.contains('panel-hidden')) {
            open();
        } else {
            hideFully();
        }
    }

    function hideFully() {
        const panel = $('filter-side-panel');
        if (panel) {
            cleanupPopupControls($('filter-panel-body'));
            panel.classList.remove('panel-open');
            panel.classList.add('panel-hidden');
        }
    }

    function setViewMode(nextMode) {
        if (!VIEW_MODES.has(nextMode)) {
            return;
        }

        currentViewMode = nextMode;
        update();
    }

    function shouldShowDisplaySection() {
        return currentViewMode === 'both' || currentViewMode === 'display';
    }

    function shouldShowFiltersSection() {
        return currentViewMode === 'both' || currentViewMode === 'filters';
    }

    function condLabel(cond) {
        const map = {
            contains: 'Contains', starts: 'Starts with', equals: 'Equals',
            greater: 'Greater than', less: 'Less than', between: 'Between',
            before: 'Before', after: 'After', doesnotcontain: 'Does not contain',
            on_or_after: 'On or after', on_or_before: 'On or before'
        };
        return map[cond] || (cond.charAt(0).toUpperCase() + cond.slice(1).replace(/_/g, ' '));
    }

    function parseFieldListValues(fieldDef) {
        if (!fieldDef || !fieldDef.values) {
            return { listValues: null, hasValuePairs: false };
        }

        try {
            const parsed = typeof fieldDef.values === 'string' ? JSON.parse(fieldDef.values) : fieldDef.values;
            if (!Array.isArray(parsed) || parsed.length === 0) {
                return { listValues: null, hasValuePairs: false };
            }

            const hasValuePairs = typeof parsed[0] === 'object' && parsed[0].Name && parsed[0].RawValue;
            const listValues = parsed.slice().sort((a, b) => {
                const aLabel = hasValuePairs ? a.Name : a;
                const bLabel = hasValuePairs ? b.Name : b;
                return String(aLabel).localeCompare(String(bLabel), undefined, {
                    numeric: true,
                    sensitivity: 'base'
                });
            });

            return { listValues, hasValuePairs };
        } catch (error) {
            return { listValues: null, hasValuePairs: false };
        }
    }

    function createInlineValueEditor(fieldDef, initialValue, options = {}) {
        const { listValues } = parseFieldListValues(fieldDef);
        const fieldType = (fieldDef && fieldDef.type) || 'string';
        const inputType = fieldType === 'date'
            ? 'date'
            : fieldType === 'money' ? 'text' : fieldType === 'number' ? 'number' : 'text';
        const currentValues = String(initialValue || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean);

        if (window.isListPasteField && window.isListPasteField(fieldDef) && typeof window.createListPasteInput === 'function' && !listValues) {
            const listInput = window.createListPasteInput(currentValues, {
                placeholder: 'Paste one key per line',
                hint: 'Paste values or upload a text/CSV file.'
            });
            if (typeof window.createPopupListControl === 'function') {
                return window.createPopupListControl(listInput, fieldDef?.name || 'Edit values', 'Click to edit values...');
            }
            return listInput;
        }

        if (!listValues) {
            const input = document.createElement('input');
            input.className = 'fp-edit-val-input';
            input.type = inputType;
            input.value = fieldType === 'money' && window.formatMoneyInputValue
                ? window.formatMoneyInputValue(initialValue)
                : initialValue;
            input.placeholder = 'Value';
            if (fieldType === 'money' && window.configureMoneyInputBehavior) {
                window.configureMoneyInputBehavior(input, true);
            }
            return input;
        }

        const isMultiSelect = Boolean(fieldDef && fieldDef.multiSelect);
        const shouldGroupValues = Boolean(fieldDef && fieldDef.groupValues);
        const isBooleanField = Boolean(fieldDef && fieldDef.type === 'boolean');
        const hasDashes = listValues.some(value => {
            const label = typeof value === 'object'
                ? (value.Name || value.Display || value.name || value.display || value.RawValue)
                : value;
            return String(label).includes('-');
        });

        if (isBooleanField && listValues.length === 2) {
            return createBooleanPillSelector(listValues, currentValues[0] || '', {
                onChange: options.onChange
            });
        }

        const selector = createGroupedSelector(listValues, isMultiSelect, currentValues, {
            enableGrouping: shouldGroupValues && hasDashes
        });

        if (typeof window.createPopupListControl === 'function') {
            return window.createPopupListControl(
                selector,
                fieldDef?.name || 'Edit values',
                isMultiSelect ? 'Click to edit values...' : 'Click to choose a value...'
            );
        }

        return selector;
    }

    function getInlineEditorValues(inputEl) {
        if (!inputEl) return [];
        if (typeof inputEl.getSelectedValues === 'function') {
            return inputEl.getSelectedValues();
        }
        if (inputEl.tagName && inputEl.tagName.toLowerCase() === 'select') {
            if (inputEl.multiple) {
                return Array.from(inputEl.selectedOptions).map(option => option.value);
            }
            return inputEl.value ? [inputEl.value] : [];
        }

        const value = typeof inputEl.value === 'string' ? inputEl.value.trim() : '';
        return value ? [value] : [];
    }

    function startInlineEdit(field, filterIndex, rowEl) {
        const filterData = window.activeFilters[field];
        if (!filterData) return;
        const filter = filterData.filters[filterIndex];
        if (!filter) return;

        const fieldDef = window.fieldDefs ? window.fieldDefs.get(field) : null;
        const fieldType = (fieldDef && fieldDef.type) || 'string';
        const availableConds = (fieldDef && fieldDef.filters)
            ? fieldDef.filters
            : (window.typeConditions && window.typeConditions[fieldType])
                || (window.typeConditions && window.typeConditions.string)
                || ['contains', 'starts', 'equals'];

        const isBetweenNow = filter.cond === 'between';
        const vals = isBetweenNow ? filter.val.split('|') : [filter.val, ''];

        const form = document.createElement('div');
        form.className = 'fp-edit-form';

        const condSel = document.createElement('select');
        condSel.className = 'fp-edit-cond-select';
        availableConds.forEach(c => {
            const slug = c.split(' ')[0];
            const opt = document.createElement('option');
            opt.value = slug;
            opt.textContent = condLabel(slug);
            if (slug === filter.cond) opt.selected = true;
            condSel.appendChild(opt);
        });

        const inputType = (fieldType === 'date') ? 'date'
            : fieldType === 'money' ? 'text' : (fieldType === 'number') ? 'number' : 'text';

        let saveEdit = null;

        const val1 = createInlineValueEditor(fieldDef, vals[0], {
            onChange: () => {
                if (typeof saveEdit === 'function') {
                    saveEdit();
                }
            }
        });

        const sep = document.createElement('span');
        sep.className = 'fp-edit-separator';
        sep.textContent = '–';

        const val2 = document.createElement('input');
        val2.className = 'fp-edit-val-input';
        val2.type = inputType;
        val2.value = fieldType === 'money' && window.formatMoneyInputValue
            ? window.formatMoneyInputValue(vals[1])
            : vals[1];
        val2.placeholder = 'To';
        if (fieldType === 'money' && window.configureMoneyInputBehavior) {
            window.configureMoneyInputBehavior(val2, true);
        }

        function syncBetween() {
            const bet = condSel.value === 'between';
            sep.style.display = bet ? '' : 'none';
            val2.style.display = bet ? '' : 'none';
        }
        condSel.addEventListener('change', syncBetween);
        syncBetween();

        const saveBtn = document.createElement('button');
        saveBtn.className = 'fp-edit-save-btn';
        saveBtn.textContent = '✓';
        saveBtn.title = 'Save';
        saveEdit = () => {
            const newCond = condSel.value;
            let newVal = getInlineEditorValues(val1).join(',');

            const newVal2 = fieldType === 'money' && window.sanitizeMoneyInputValue
                ? window.sanitizeMoneyInputValue(val2.value.trim())
                : val2.value.trim();
            if (fieldType === 'money' && window.sanitizeMoneyInputValue) {
                newVal = newVal
                    .split(',')
                    .map(value => window.sanitizeMoneyInputValue(value))
                    .filter(Boolean)
                    .join(',');
            }
            if (!newVal) return;
            if (newCond === 'between') {
                if (!newVal2) return;
                newVal = `${newVal}|${newVal2}`;
            }

            const nextActiveFilters = Object.fromEntries(
                Object.entries(window.activeFilters || {}).map(([activeField, activeData]) => [
                    activeField,
                    {
                        filters: Array.isArray(activeData?.filters)
                            ? activeData.filters.map(filter => ({ ...filter }))
                            : []
                    }
                ])
            );

            if (!nextActiveFilters[field] || !Array.isArray(nextActiveFilters[field].filters) || !nextActiveFilters[field].filters[filterIndex]) {
                return;
            }

            nextActiveFilters[field].filters[filterIndex] = { cond: newCond, val: newVal };

            window.QueryChangeManager.replaceActiveFilters(nextActiveFilters, {
                source: 'FilterSidePanel.editFilter'
            });

            window.renderConditionList && window.renderConditionList(field);
            update();
        };
        saveBtn.addEventListener('click', saveEdit);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'fp-edit-cancel-btn';
        cancelBtn.textContent = '✕';
        cancelBtn.title = 'Cancel';
        cancelBtn.addEventListener('click', () => update());

        const btns = document.createElement('div');
        btns.className = 'fp-edit-btns';
        btns.appendChild(saveBtn);
        btns.appendChild(cancelBtn);

        form.appendChild(condSel);
        form.appendChild(val1);
        form.appendChild(sep);
        form.appendChild(val2);
        form.appendChild(btns);

        rowEl.replaceWith(form);
    }

    function openBubbleForField(field) {
        const bubble = Array.from(document.querySelectorAll('.bubble')).find(
            b => b.textContent.trim() === field && !b.classList.contains('bubble-disabled')
        );
        if (bubble) {
            bubble.click();
            return;
        }
        const queryInput = getFilterQueryInputElement();
        if (queryInput) {
            queryInput.value = field;
            queryInput.dispatchEvent(new Event('input', { bubbles: true }));
            queryInput.focus();
            queryInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function syncDisplayFieldChange() {
        const displayedFields = getDisplayedFields();

        if (typeof window.showExampleTable === 'function') {
            window.showExampleTable(displayedFields).catch(console.error);
        }

        if (typeof window.updateCategoryCounts === 'function') {
            window.updateCategoryCounts();
        }

        if (window.BubbleSystem && typeof window.BubbleSystem.safeRenderBubbles === 'function') {
            window.BubbleSystem.safeRenderBubbles();
        }
    }

    function moveDisplayedFieldByOffset(index, offset) {
        const fields = getDisplayedFields();
        const targetIndex = index + offset;
        if (index < 0 || index >= fields.length || targetIndex < 0 || targetIndex >= fields.length) {
            return;
        }

        window.QueryChangeManager.moveDisplayedField(index, targetIndex, {
            source: 'FilterSidePanel.moveDisplayedField'
        });
        syncDisplayFieldChange();
    }

    function removeDisplayedFieldAt(index) {
        const fields = getDisplayedFields();
        const fieldName = fields[index];
        if (!fieldName) {
            return;
        }

        window.QueryChangeManager.removeDisplayedField(fieldName, {
            all: false,
            source: 'FilterSidePanel.removeDisplayedField'
        });
        syncDisplayFieldChange();
    }

    function createIconButton(className, title, svgMarkup, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.innerHTML = svgMarkup;
        button.addEventListener('click', event => {
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    function createPanelModeSwitch() {
        const switcher = document.createElement('div');
        switcher.className = 'fp-mode-switch';
        switcher.setAttribute('role', 'tablist');
        switcher.setAttribute('aria-label', 'Panel sections');

        const modes = [
            { key: 'both', label: 'Both' },
            { key: 'filters', label: 'Filters' },
            { key: 'display', label: 'Display' }
        ];

        modes.forEach(mode => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'fp-mode-pill';
            button.textContent = mode.label;
            button.dataset.mode = mode.key;
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', String(currentViewMode === mode.key));
            if (currentViewMode === mode.key) {
                button.classList.add('active');
            }
            button.addEventListener('click', () => setViewMode(mode.key));
            switcher.appendChild(button);
        });

        return switcher;
    }

    function createSectionHeader(label, count, countLabel) {
        const header = document.createElement('div');
        header.className = 'fp-section-header';

        const title = document.createElement('span');
        title.className = 'fp-section-title';
        title.textContent = label;

        const meta = document.createElement('span');
        meta.className = 'fp-section-count';
        meta.textContent = `${count} ${countLabel}`;

        header.appendChild(title);
        header.appendChild(meta);
        return header;
    }

    function createDisplaySection() {
        const wrapper = document.createElement('section');
        wrapper.className = 'fp-section fp-display-section';
        const fields = getDisplayedFields();

        wrapper.appendChild(createSectionHeader('Fields Being Displayed', fields.length, fields.length === 1 ? 'field' : 'fields'));

        if (fields.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'fp-empty-state';
            empty.textContent = 'Add columns to start building the display list.';
            wrapper.appendChild(empty);
            return wrapper;
        }

        const list = document.createElement('div');
        list.className = 'fp-display-list';

        fields.forEach((field, index) => {
            const item = document.createElement('div');
            item.className = 'fp-display-item';
            item.dataset.index = String(index);
            item.draggable = false;

            item.addEventListener('dragstart', event => {
                item.classList.add('fp-dragging');
                event.dataTransfer.setData('text/plain', String(index));
                event.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', () => {
                item.draggable = false;
                item.classList.remove('fp-dragging');
                list.querySelectorAll('.fp-display-item').forEach(entry => {
                    entry.classList.remove('fp-drag-over-top', 'fp-drag-over-bottom');
                });
            });

            item.addEventListener('dragover', event => {
                event.preventDefault();
                const rect = item.getBoundingClientRect();
                const isTopHalf = event.clientY < rect.top + rect.height / 2;
                item.classList.toggle('fp-drag-over-top', isTopHalf);
                item.classList.toggle('fp-drag-over-bottom', !isTopHalf);
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('fp-drag-over-top', 'fp-drag-over-bottom');
            });

            item.addEventListener('drop', event => {
                event.preventDefault();
                item.classList.remove('fp-drag-over-top', 'fp-drag-over-bottom');

                const fromIndex = Number.parseInt(event.dataTransfer.getData('text/plain'), 10);
                if (!Number.isInteger(fromIndex) || fromIndex === index) {
                    return;
                }

                const rect = item.getBoundingClientRect();
                const isTopHalf = event.clientY < rect.top + rect.height / 2;
                const targetIndex = isTopHalf
                    ? (fromIndex < index ? index - 1 : index)
                    : (fromIndex < index ? index : index + 1);

                window.QueryChangeManager.moveDisplayedField(fromIndex, targetIndex, {
                    source: 'FilterSidePanel.dragDisplayedField'
                });
                syncDisplayFieldChange();
            });

            const rank = document.createElement('span');
            rank.className = 'fp-display-rank';
            rank.textContent = String(index + 1);

            const dragHandle = document.createElement('button');
            dragHandle.type = 'button';
            dragHandle.className = 'fp-display-drag';
            dragHandle.title = 'Drag to reorder';
            dragHandle.setAttribute('aria-label', `Drag to reorder ${field}`);
            dragHandle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
            dragHandle.addEventListener('mousedown', () => {
                item.draggable = true;
            });
            dragHandle.addEventListener('mouseup', () => {
                item.draggable = false;
            });
            dragHandle.addEventListener('mouseleave', () => {
                item.draggable = false;
            });

            const name = document.createElement('span');
            name.className = 'fp-display-name';
            name.textContent = field;

            const controls = document.createElement('div');
            controls.className = 'fp-display-actions';

            controls.appendChild(createIconButton(
                'fp-display-btn fp-display-btn-up',
                `Move ${field} up`,
                `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="m18 15-6-6-6 6"/></svg>`,
                () => moveDisplayedFieldByOffset(index, -1)
            ));

            controls.appendChild(createIconButton(
                'fp-display-btn fp-display-btn-down',
                `Move ${field} down`,
                `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="m6 9 6 6 6-6"/></svg>`,
                () => moveDisplayedFieldByOffset(index, 1)
            ));

            controls.appendChild(createIconButton(
                'fp-display-btn fp-display-btn-remove',
                `Remove ${field} from display`,
                `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1Zm-3 6h12l-.8 11.2A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-1.99-1.8L6 9Z" fill="currentColor"/></svg>`,
                () => removeDisplayedFieldAt(index)
            ));

            if (index === 0) {
                controls.querySelector('.fp-display-btn-up')?.setAttribute('disabled', 'true');
            }
            if (index === fields.length - 1) {
                controls.querySelector('.fp-display-btn-down')?.setAttribute('disabled', 'true');
            }

            item.appendChild(rank);
            item.appendChild(dragHandle);
            item.appendChild(name);
            item.appendChild(controls);
            list.appendChild(item);
        });

        wrapper.appendChild(list);
        return wrapper;
    }

    function attachFilterGroupDragHandlers(group, field, container) {
        group.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', field);
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => group.classList.add('fp-dragging'), 0);
        });

        group.addEventListener('dragend', () => {
            group.removeAttribute('draggable');
            group.classList.remove('fp-dragging');
            container.querySelectorAll('.fp-field-group').forEach(item => {
                item.classList.remove('fp-drag-over-top', 'fp-drag-over-bottom');
            });
        });

        group.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const rect = group.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                group.classList.add('fp-drag-over-top');
                group.classList.remove('fp-drag-over-bottom');
            } else {
                group.classList.add('fp-drag-over-bottom');
                group.classList.remove('fp-drag-over-top');
            }
        });

        group.addEventListener('dragleave', () => {
            group.classList.remove('fp-drag-over-top', 'fp-drag-over-bottom');
        });

        group.addEventListener('drop', (e) => {
            e.preventDefault();
            group.classList.remove('fp-drag-over-top', 'fp-drag-over-bottom');

            const draggedField = e.dataTransfer.getData('text/plain');
            if (!draggedField || draggedField === field) return;

            const draggedGroup = container.querySelector(`.fp-field-group[data-field="${CSS.escape(draggedField)}"]`);
            if (!draggedGroup) return;

            const rect = group.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;

            if (e.clientY < midY) {
                container.insertBefore(draggedGroup, group);
            } else {
                container.insertBefore(draggedGroup, group.nextSibling);
            }

            const newActiveFilters = {};
            for (const child of container.children) {
                if (child.classList.contains('fp-field-group')) {
                    const childField = child.dataset.field;
                    if (childField && window.activeFilters[childField]) {
                        newActiveFilters[childField] = window.activeFilters[childField];
                    }
                }
            }

            window.QueryChangeManager.reorderFilterGroups(Object.keys(newActiveFilters), {
                source: 'FilterSidePanel.reorderGroups'
            });
            window.updateQueryJson && window.updateQueryJson();
        });
    }

    function createFilterGroup(field, data, container) {
        const fieldDef = window.fieldDefs ? window.fieldDefs.get(field) : null;
        const group = document.createElement('div');
        group.className = 'fp-field-group';
        group.dataset.field = field;
        attachFilterGroupDragHandlers(group, field, container);

        const fieldHeader = document.createElement('div');
        fieldHeader.className = 'fp-field-header';

        const dragHandle = document.createElement('span');
        dragHandle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
        dragHandle.className = 'fp-drag-handle';
        dragHandle.title = 'Drag to reorder';
        dragHandle.addEventListener('mousedown', () => group.setAttribute('draggable', 'true'));
        dragHandle.addEventListener('mouseup', () => group.removeAttribute('draggable'));
        dragHandle.addEventListener('mouseleave', () => group.removeAttribute('draggable'));

        const nameSpan = document.createElement('span');
        nameSpan.className = 'fp-field-name';
        nameSpan.textContent = field;

        fieldHeader.appendChild(dragHandle);
        fieldHeader.appendChild(nameSpan);
        group.appendChild(fieldHeader);

        const condsList = document.createElement('div');
        condsList.className = 'fp-conds-list';

        data.filters.forEach((filterItem, idx) => {
            const valueLabel = buildFilterValueLabel(filterItem, fieldDef, ' – ');
            const useListViewer = window.shouldUseFilterListViewer && window.shouldUseFilterListViewer(filterItem, fieldDef);
            const row = document.createElement('div');
            row.className = 'fp-cond-row';

            const textSpan = document.createElement('span');
            textSpan.className = 'fp-cond-text';
            textSpan.innerHTML = `<span class="fp-cond-op">${condLabel(filterItem.cond)}</span> <b>${valueLabel}</b>`;
            if (useListViewer) {
                textSpan.classList.add('fp-cond-text-clickable');
                textSpan.setAttribute('role', 'button');
                textSpan.setAttribute('tabindex', '0');
                textSpan.setAttribute('aria-label', `View ${field} filter values`);
                const openViewer = () => {
                    if (window.openFilterListViewer) {
                        window.openFilterListViewer(filterItem, fieldDef, {
                            fieldName: field,
                            operatorLabel: condLabel(filterItem.cond)
                        });
                    }
                };
                textSpan.addEventListener('click', openViewer);
                textSpan.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openViewer();
                    }
                });
            }

            const actions = document.createElement('div');
            actions.className = 'fp-cond-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'fp-cond-btn fp-edit-btn';
            editBtn.title = 'Edit this condition';
            editBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
            editBtn.addEventListener('click', e => {
                e.stopPropagation();
                startInlineEdit(field, idx, row);
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'fp-cond-btn fp-del-btn';
            delBtn.title = 'Remove this filter';
            delBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1Zm-3 6h12l-.8 11.2A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-1.99-1.8L6 9Z"/></svg>`;
            delBtn.addEventListener('click', e => {
                e.stopPropagation();
                window.QueryChangeManager.removeFilter(field, {
                    index: idx,
                    source: 'FilterSidePanel.removeFilter'
                });
                window.updateQueryJson && window.updateQueryJson();
                window.renderConditionList && window.renderConditionList(field);
                update();
            });

            actions.appendChild(editBtn);
            actions.appendChild(delBtn);
            row.appendChild(textSpan);
            row.appendChild(actions);
            condsList.appendChild(row);
        });

        group.appendChild(condsList);

        const addCondBtn = document.createElement('button');
        addCondBtn.className = 'fp-add-cond-btn';
        addCondBtn.textContent = '+ Add condition';
        addCondBtn.addEventListener('click', () => openBubbleForField(field));
        group.appendChild(addCondBtn);

        return group;
    }

    function createFiltersSection() {
        const wrapper = document.createElement('section');
        wrapper.className = 'fp-section fp-filters-section';
        const filterEntries = Object.entries(window.activeFilters || {})
            .filter(([, data]) => data && Array.isArray(data.filters) && data.filters.length > 0);
        const totalFilters = filterEntries.reduce((sum, [, data]) => sum + data.filters.length, 0);

        wrapper.appendChild(createSectionHeader('Filters', totalFilters, totalFilters === 1 ? 'active filter' : 'active filters'));

        if (filterEntries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'fp-empty-state';
            empty.textContent = 'No filters yet. Click a field to add conditions.';
            wrapper.appendChild(empty);
            return wrapper;
        }

        const list = document.createElement('div');
        list.className = 'fp-filter-list';
        filterEntries.forEach(([field, data]) => {
            list.appendChild(createFilterGroup(field, data, list));
        });
        wrapper.appendChild(list);
        return wrapper;
    }

    function update() {
        const body = $('filter-panel-body');
        if (!body) return;

        cleanupPopupControls(body);

        if (!hasPanelContent()) {
            hideFully();
            return;
        }

        const panel = $('filter-side-panel');
        if (panel && panel.classList.contains('panel-hidden')) {
            open();
        }

        const titleEl = $('filter-panel-title');
        if (titleEl) {
            titleEl.textContent = 'Display & Filters';
        }

        body.innerHTML = '';

        body.appendChild(createPanelModeSwitch());

        const showDisplay = shouldShowDisplaySection();
        const showFilters = shouldShowFiltersSection();

        if (showDisplay) {
            body.appendChild(createDisplaySection());
        }

        if (showDisplay && showFilters) {
            const divider = document.createElement('div');
            divider.className = 'fp-section-divider';
            body.appendChild(divider);
        }

        if (showFilters) {
            body.appendChild(createFiltersSection());
        }
    }

    return { update, open, close, toggle, setViewMode };
}());