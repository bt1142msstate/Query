/* ==========================================
   FILTER SIDE PANEL
    Collapsible side panel showing all active filters,
    supporting inline edit, remove, and add-condition.
   ========================================== */
window.FilterSidePanel = (function () {
    let currentViewMode = 'both';
    const VIEW_MODES = new Set(['both', 'filters', 'display']);
    let shellResizeObserver = null;
    let unsubscribeQueryState = null;

    const $ = id => document.getElementById(id);

    function getDisplayedFields() {
        if (window.QueryChangeManager && typeof window.QueryChangeManager.getSnapshot === 'function') {
            return window.QueryChangeManager.getSnapshot().displayedFields || [];
        }

        return Array.isArray(window.displayedFields) ? Array.from(window.displayedFields) : [];
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

    function syncPanelHeight() {
        const panel = $('filter-side-panel');
        const shell = $('table-shell');

        if (!panel) {
            return;
        }

        if (window.innerWidth <= 1024 || !shell) {
            panel.style.height = '';
            return;
        }

        panel.style.height = `${Math.ceil(shell.getBoundingClientRect().height)}px`;
    }

    function ensureShellResizeObserver() {
        if (shellResizeObserver || typeof ResizeObserver !== 'function') {
            return;
        }

        const shell = $('table-shell');
        if (!shell) {
            return;
        }

        shellResizeObserver = new ResizeObserver(() => {
            syncPanelHeight();
        });
        shellResizeObserver.observe(shell);
    }

    function ensureQueryStateSubscription() {
        if (unsubscribeQueryState) {
            return;
        }

        unsubscribeQueryState = window.QueryStateSubscriptions.subscribe(() => {
            update();
        }, {
            displayedFields: true,
            activeFilters: true
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
        ensureShellResizeObserver();
        syncPanelHeight();
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
            panel.style.height = '';
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

    function openBubbleForField(field) {
        if (!field) {
            return;
        }

        const overlay = window.DOM?.overlay || document.getElementById('overlay');
        if (window.selectedField === field && overlay?.classList.contains('show')) {
            window.renderConditionList && window.renderConditionList(field);
            const operatorSelect = document.getElementById('condition-operator-select');
            const conditionInput = window.DOM?.conditionInput || document.getElementById('condition-input');
            (operatorSelect || conditionInput)?.focus();
            return;
        }

        const bubble = Array.from(document.querySelectorAll('.bubble')).find(
            b => b.textContent.trim() === field && !b.classList.contains('bubble-disabled')
        );
        if (bubble) {
            bubble.click();
            return;
        }

        if (window.currentCategory !== 'All') {
            window.currentCategory = 'All';
            if (window.BubbleSystem && typeof window.BubbleSystem.safeRenderBubbles === 'function') {
                window.BubbleSystem.safeRenderBubbles();
            }
            const rerenderedBubble = Array.from(document.querySelectorAll('.bubble')).find(
                b => b.textContent.trim() === field && !b.classList.contains('bubble-disabled')
            );
            if (rerenderedBubble) {
                rerenderedBubble.click();
                return;
            }
        }

        const queryInput = getFilterQueryInputElement();
        if (queryInput) {
            queryInput.value = field;
            queryInput.dispatchEvent(new Event('input', { bubbles: true }));
            queryInput.focus();
            queryInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function moveDisplayedFieldByOffset(index, offset) {
        const fields = getDisplayedFields();
        const targetIndex = index + offset;
        if (index < 0 || index >= fields.length || targetIndex < 0 || targetIndex >= fields.length) {
            return;
        }

        moveDisplayedField(index, targetIndex, 'FilterSidePanel.moveDisplayedField');
    }

    function moveDisplayedField(fromIndex, toIndex, source) {
        const fields = getDisplayedFields();
        if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) {
            return false;
        }

        if (fromIndex < 0 || fromIndex >= fields.length) {
            return false;
        }

        window.QueryChangeManager.moveDisplayedField(fromIndex, toIndex, {
            source
        });

        return true;
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
    }

    function openDisplayFieldPicker(insertAt = -1) {
        if (!window.SharedFieldPicker || typeof window.SharedFieldPicker.openQueryFieldPicker !== 'function') {
            return;
        }

        window.SharedFieldPicker.openQueryFieldPicker({ insertAt }).catch(error => {
            console.error('Failed to open side panel field picker:', error);
            if (window.showToastMessage) {
                window.showToastMessage('Failed to open the field picker.', 'error');
            }
        });
    }

    function createDisplayInsertControl(insertAt, label) {
        const row = document.createElement('div');
        row.className = 'fp-display-insert';
        row.dataset.insertAt = String(insertAt);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'fp-display-insert-btn';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.25a.75.75 0 0 1 .75.75v4.25H15a.75.75 0 0 1 0 1.5h-4.25V15a.75.75 0 0 1-1.5 0v-4.25H5a.75.75 0 0 1 0-1.5h4.25V5a.75.75 0 0 1 .75-.75z" fill="currentColor"/></svg>`;
        button.addEventListener('click', () => openDisplayFieldPicker(insertAt));

        row.appendChild(button);
        return row;
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
            const emptyWrap = document.createElement('div');
            emptyWrap.className = 'fp-display-empty-wrap';

            const empty = document.createElement('div');
            empty.className = 'fp-empty-state';
            empty.textContent = 'Add columns to start building the display list.';
            emptyWrap.appendChild(empty);
            const emptyInsert = createDisplayInsertControl(0, 'Add the first displayed field');
            emptyInsert.classList.add('fp-display-insert-bottom');
            emptyWrap.appendChild(emptyInsert);
            wrapper.appendChild(emptyWrap);
            return wrapper;
        }

        const list = document.createElement('div');
        list.className = 'fp-display-list';

        fields.forEach((field, index) => {
            const slot = document.createElement('div');
            slot.className = 'fp-display-slot';

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

                moveDisplayedField(fromIndex, targetIndex, 'FilterSidePanel.dragDisplayedField');
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
                `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M9.32 15.653a.812.812 0 0 1-.086-.855c.176-.342.245-.733.2-1.118a2.106 2.106 0 0 0-.267-.779 2.027 2.027 0 0 0-.541-.606 3.96 3.96 0 0 1-1.481-2.282c-1.708 2.239-1.053 3.51-.235 4.63a.748.748 0 0 1-.014.901.87.87 0 0 1-.394.283.838.838 0 0 1-.478.023c-1.105-.27-2.145-.784-2.85-1.603a4.686 4.686 0 0 1-.906-1.555 4.811 4.811 0 0 1-.263-1.797s-.133-2.463 2.837-4.876c0 0 3.51-2.978 2.292-5.18a.621.621 0 0 1 .112-.653.558.558 0 0 1 .623-.147l.146.058a7.63 7.63 0 0 1 2.96 3.5c.58 1.413.576 3.06.184 4.527.325-.292.596-.641.801-1.033l.029-.064c.198-.477.821-.325 1.055-.013.086.137 2.292 3.343 1.107 6.048a5.516 5.516 0 0 1-1.84 2.027 6.127 6.127 0 0 1-2.138.893.834.834 0 0 1-.472-.038.867.867 0 0 1-.381-.29zM7.554 7.892a.422.422 0 0 1 .55.146c.04.059.066.126.075.198l.045.349c.02.511.014 1.045.213 1.536.206.504.526.95.932 1.298a3.06 3.06 0 0 1 1.16 1.422c.22.564.25 1.19.084 1.773a4.123 4.123 0 0 0 1.39-.757l.103-.084c.336-.277.613-.623.813-1.017.201-.393.322-.825.354-1.269.065-1.025-.284-2.054-.827-2.972-.248.36-.59.639-.985.804-.247.105-.509.17-.776.19a.792.792 0 0 1-.439-.1.832.832 0 0 1-.321-.328.825.825 0 0 1-.035-.729c.412-.972.54-2.05.365-3.097a5.874 5.874 0 0 0-1.642-3.16c-.156 2.205-2.417 4.258-2.881 4.7a3.537 3.537 0 0 1-.224.194c-2.426 1.965-2.26 3.755-2.26 3.834a3.678 3.678 0 0 0 .459 2.043c.365.645.89 1.177 1.52 1.54C4.5 12.808 4.5 10.89 7.183 8.14l.372-.25z"/></svg>`,
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

            if (index === 0) {
                const topInsert = createDisplayInsertControl(0, 'Insert a displayed field at the top');
                topInsert.classList.add('fp-display-insert-top');
                slot.appendChild(topInsert);
            }

            slot.appendChild(item);

            const bottomInsert = createDisplayInsertControl(index + 1, `Insert a displayed field after ${field}`);
            bottomInsert.classList.add('fp-display-insert-bottom');
            slot.appendChild(bottomInsert);

            list.appendChild(slot);
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
            editBtn.title = 'Edit in shared filter editor';
            editBtn.setAttribute('aria-label', `Edit ${field} in shared filter editor`);
            editBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
            editBtn.addEventListener('click', e => {
                e.stopPropagation();
                openBubbleForField(field);
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'fp-cond-btn fp-del-btn';
            delBtn.title = 'Remove this filter';
            delBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M9.32 15.653a.812.812 0 0 1-.086-.855c.176-.342.245-.733.2-1.118a2.106 2.106 0 0 0-.267-.779 2.027 2.027 0 0 0-.541-.606 3.96 3.96 0 0 1-1.481-2.282c-1.708 2.239-1.053 3.51-.235 4.63a.748.748 0 0 1-.014.901.87.87 0 0 1-.394.283.838.838 0 0 1-.478.023c-1.105-.27-2.145-.784-2.85-1.603a4.686 4.686 0 0 1-.906-1.555 4.811 4.811 0 0 1-.263-1.797s-.133-2.463 2.837-4.876c0 0 3.51-2.978 2.292-5.18a.621.621 0 0 1 .112-.653.558.558 0 0 1 .623-.147l.146.058a7.63 7.63 0 0 1 2.96 3.5c.58 1.413.576 3.06.184 4.527.325-.292.596-.641.801-1.033l.029-.064c.198-.477.821-.325 1.055-.013.086.137 2.292 3.343 1.107 6.048a5.516 5.516 0 0 1-1.84 2.027 6.127 6.127 0 0 1-2.138.893.834.834 0 0 1-.472-.038.867.867 0 0 1-.381-.29zM7.554 7.892a.422.422 0 0 1 .55.146c.04.059.066.126.075.198l.045.349c.02.511.014 1.045.213 1.536.206.504.526.95.932 1.298a3.06 3.06 0 0 1 1.16 1.422c.22.564.25 1.19.084 1.773a4.123 4.123 0 0 0 1.39-.757l.103-.084c.336-.277.613-.623.813-1.017.201-.393.322-.825.354-1.269.065-1.025-.284-2.054-.827-2.972-.248.36-.59.639-.985.804-.247.105-.509.17-.776.19a.792.792 0 0 1-.439-.1.832.832 0 0 1-.321-.328.825.825 0 0 1-.035-.729c.412-.972.54-2.05.365-3.097a5.874 5.874 0 0 0-1.642-3.16c-.156 2.205-2.417 4.258-2.881 4.7a3.537 3.537 0 0 1-.224.194c-2.426 1.965-2.26 3.755-2.26 3.834a3.678 3.678 0 0 0 .459 2.043c.365.645.89 1.177 1.52 1.54C4.5 12.808 4.5 10.89 7.183 8.14l.372-.25z"/></svg>`;
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

        ensureQueryStateSubscription();

        cleanupPopupControls(body);

        if (!hasPanelContent()) {
            hideFully();
            return;
        }

        const panel = $('filter-side-panel');
        if (panel && panel.classList.contains('panel-hidden')) {
            open();
        }

        ensureShellResizeObserver();
        syncPanelHeight();

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

window.addEventListener('resize', () => {
    if (window.FilterSidePanel && typeof window.FilterSidePanel.update === 'function') {
        const panel = document.getElementById('filter-side-panel');
        if (panel && !panel.classList.contains('panel-hidden')) {
            window.FilterSidePanel.update();
        }
    }
});