/* ==========================================
   FILTER SIDE PANEL
   Collapsible side panel showing all active filters,
   supporting inline edit, remove, add-condition, and add-field.
   ========================================== */
window.FilterSidePanel = (function () {
    let isOpen = false;

    const $ = id => document.getElementById(id);

    function hasAnyFilters() {
        return window.activeFilters &&
            Object.keys(window.activeFilters).some(
                k => window.activeFilters[k] &&
                     window.activeFilters[k].filters &&
                     window.activeFilters[k].filters.length > 0
            );
    }

    function open() {
        isOpen = true;
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
        isOpen = false;
        const panel = $('filter-side-panel');
        if (panel) {
            panel.classList.remove('panel-open');
            panel.classList.add('panel-hidden');
        }
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
            : (fieldType === 'number' || fieldType === 'money') ? 'number' : 'text';

        let listValues = null;
        let hasValuePairs = false;
        if (fieldDef && fieldDef.values) {
           try {
               let parsed = typeof fieldDef.values === 'string' ? JSON.parse(fieldDef.values) : fieldDef.values;
               if (Array.isArray(parsed) && parsed.length > 0) {
                   listValues = parsed;
                   if (typeof parsed[0] === 'object' && parsed[0].Name && parsed[0].RawValue) {
                       hasValuePairs = true;
                   }
               }
           } catch(e) {}
        }
        const isMultiSelect = fieldDef && fieldDef.multiSelect;

        let val1;
        if (listValues) {
            val1 = document.createElement('select');
            val1.className = 'fp-edit-val-input fp-edit-cond-select';
            if (isMultiSelect) val1.multiple = true;
            if (isMultiSelect) val1.style.minHeight = '70px';

            const currentVals = vals[0].split(',').map(v => v.trim());

            listValues.forEach(v => {
                const opt = document.createElement('option');
                if (hasValuePairs) {
                    opt.value = v.RawValue;
                    opt.textContent = v.Name;
                    if (currentVals.includes(String(v.RawValue))) opt.selected = true;
                } else {
                    opt.value = v;
                    opt.textContent = v;
                    if (currentVals.includes(String(v))) opt.selected = true;
                }
                val1.appendChild(opt);
            });
        } else {
            val1 = document.createElement('input');
            val1.className = 'fp-edit-val-input';
            val1.type = inputType;
            val1.value = vals[0];
            val1.placeholder = 'Value';
        }

        const sep = document.createElement('span');
        sep.className = 'fp-edit-separator';
        sep.textContent = '–';

        const val2 = document.createElement('input');
        val2.className = 'fp-edit-val-input';
        val2.type = inputType;
        val2.value = vals[1];
        val2.placeholder = 'To';

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
        saveBtn.addEventListener('click', () => {
            const newCond = condSel.value;
            let newVal;
            if (val1.tagName && val1.tagName.toLowerCase() === 'select') {
                if (val1.multiple) {
                    newVal = Array.from(val1.selectedOptions).map(o => o.value).join(',');
                } else {
                    newVal = val1.value;
                }
            } else {
                newVal = val1.value.trim();
            }

            const newVal2 = val2.value.trim();
            if (!newVal) return;
            if (newCond === 'between') {
                if (!newVal2) return;
                newVal = `${newVal}|${newVal2}`;
            }
            filterData.filters[filterIndex] = { cond: newCond, val: newVal };
            window.updateQueryJson && window.updateQueryJson();
            window.renderConditionList && window.renderConditionList(field);
            update();
        });

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

    function update() {
        const body = $('filter-panel-body');
        if (!body) return;

        const hasFilters = hasAnyFilters();
        if (!hasFilters) {
            hideFully();
            return;
        }

        const panel = $('filter-side-panel');
        if (panel && panel.classList.contains('panel-hidden')) {
            open();
        }

        const titleEl = $('filter-panel-title');
        if (titleEl) {
            const total = Object.values(window.activeFilters)
                .reduce((s, v) => s + (v.filters ? v.filters.length : 0), 0);
            titleEl.textContent = `Filters (${total})`;
        }

        body.innerHTML = '';

        for (const field of Object.keys(window.activeFilters)) {
            const data = window.activeFilters[field];
            if (!data || !data.filters || data.filters.length === 0) continue;

            const fieldDef = window.fieldDefs ? window.fieldDefs.get(field) : null;

            const group = document.createElement('div');
            group.className = 'fp-field-group';
            group.dataset.field = field;

            group.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', field);
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => group.classList.add('fp-dragging'), 0);
            });

            group.addEventListener('dragend', () => {
                group.removeAttribute('draggable');
                group.classList.remove('fp-dragging');
                document.querySelectorAll('.fp-field-group').forEach(g => {
                    g.classList.remove('fp-drag-over-top', 'fp-drag-over-bottom');
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

                const draggedGroup = body.querySelector(`.fp-field-group[data-field="${CSS.escape(draggedField)}"]`);
                if (!draggedGroup) return;

                const rect = group.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                if (e.clientY < midY) {
                    body.insertBefore(draggedGroup, group);
                } else {
                    body.insertBefore(draggedGroup, group.nextSibling);
                }

                const newActiveFilters = {};
                for (const child of body.children) {
                    if (child.classList.contains('fp-field-group')) {
                        const f = child.dataset.field;
                        if (f && window.activeFilters[f]) {
                            newActiveFilters[f] = window.activeFilters[f];
                        }
                    }
                }
                window.activeFilters = newActiveFilters;
                window.updateQueryJson && window.updateQueryJson();
            });

            const fieldHeader = document.createElement('div');
            fieldHeader.className = 'fp-field-header';

            const dragHandle = document.createElement('span');
            dragHandle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
            dragHandle.className = 'fp-drag-handle';
            dragHandle.title = 'Drag to reorder';
            dragHandle.style.cssText = 'margin-right: 8px; cursor: grab; color: #9ca3af; display: inline-flex; align-items: center; user-select: none;';
            dragHandle.addEventListener('mousedown', () => group.setAttribute('draggable', 'true'));
            dragHandle.addEventListener('mouseup', () => group.removeAttribute('draggable'));
            dragHandle.addEventListener('mouseleave', () => group.removeAttribute('draggable'));

            const nameSpan = document.createElement('span');
            nameSpan.className = 'fp-field-name';
            nameSpan.textContent = field;

            fieldHeader.appendChild(dragHandle);
            fieldHeader.appendChild(nameSpan);
            group.appendChild(fieldHeader);

            if (data.filters.length > 1) {
                const logicBtn = document.createElement('button');
                logicBtn.className = 'fp-logic-toggle' + (data.logical === 'And' ? ' active' : '');
                logicBtn.textContent = data.logical.toUpperCase();
                logicBtn.title = 'Click to switch AND / OR logic';
                logicBtn.addEventListener('click', () => {
                    data.logical = data.logical === 'And' ? 'Or' : 'And';
                    window.updateQueryJson && window.updateQueryJson();
                    update();
                });
                group.appendChild(logicBtn);
            }

            const condsList = document.createElement('div');
            condsList.className = 'fp-conds-list';

            data.filters.forEach((f, idx) => {
                const valueLabel = buildFilterValueLabel(f, fieldDef, ' – ');
                const row = document.createElement('div');
                row.className = 'fp-cond-row';

                const textSpan = document.createElement('span');
                textSpan.className = 'fp-cond-text';
                textSpan.innerHTML = `<span class="fp-cond-op">${condLabel(f.cond)}</span> <b>${valueLabel}</b>`;

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
                    data.filters.splice(idx, 1);
                    if (data.filters.length === 0) delete window.activeFilters[field];
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

            body.appendChild(group);
        }
    }

    function init() {
        const addBtn = $('filter-panel-add-btn');

        if (addBtn) {
            addBtn.addEventListener('click', e => {
                e.stopPropagation();
                const qi = getFilterQueryInputElement();
                if (qi) {
                    qi.focus();
                    qi.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
    }

    document.addEventListener('DOMContentLoaded', init);

    return { update, open, close, toggle };
}());