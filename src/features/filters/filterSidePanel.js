/* ==========================================
   FILTER SIDE PANEL
    Collapsible side panel showing all active filters,
    supporting inline edit, remove, and add-condition.
   ========================================== */
import {
    buildFilterValueLabel,
    getFilterDisplayValues,
    openFilterListEditor,
    shouldUseFilterListViewer
} from './filterValueUi.js';
import { appServices } from '../../core/appServices.js';
import { appUiActions, registerAppUiActionDependencies } from '../../core/appUiActions.js';
import { AppState, QueryChangeManager, QueryStateReaders } from './filterQueryState.js';
import { QueryStateSubscriptions } from '../../core/queryStateSubscriptions.js';
import { showToastMessage } from '../../core/toast.js';
import { OperatorLabels } from '../../core/formatting/operatorLabels.js';
import { Icons } from '../../core/icons.js';
import { SharedFieldPicker } from '../../ui/field-picker/fieldPicker.js';
import { fieldDefs } from './fieldDefs.js';
import { beginPanelArrangeMode, clearPanelArrangeMode, isPanelArrangeModeActive } from './panelArrange.js';
import { createFilterSidePanelReorderActions } from './filterSidePanelReorderActions.js';
import { QueryTableView } from '../../ui/queryTableView.js';
import { DOM } from '../../core/domCache.js';

const FilterSidePanel = (function () {
    const services = appServices;
    const uiActions = appUiActions;
    let currentViewMode = 'both';
    const VIEW_MODES = new Set(['both', 'filters', 'display']);
    let shellResizeObserver = null;
    let unsubscribeQueryState = null;
    let deferredSplitUpdate = 0;
    const { getDisplayedFields, getActiveFilters } = QueryStateReaders;

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

    function replaceFilterListValues(field, index, nextValues) {
        const values = (Array.isArray(nextValues) ? nextValues : [])
            .map(value => String(value || '').trim())
            .filter(Boolean);

        if (values.length === 0) {
            QueryChangeManager.removeFilter(field, {
                index,
                source: 'FilterSidePanel.clearListFilter'
            });
        } else {
            const activeFilters = getActiveFilters();
            const nextFilters = Object.fromEntries(
                Object.entries(activeFilters).map(([filterField, data]) => [
                    filterField,
                    {
                        ...data,
                        filters: Array.isArray(data.filters)
                            ? data.filters.map(filter => ({ ...filter }))
                            : []
                    }
                ])
            );

            if (!nextFilters[field] || !Array.isArray(nextFilters[field].filters) || !nextFilters[field].filters[index]) {
                return;
            }

            nextFilters[field].filters[index] = {
                ...nextFilters[field].filters[index],
                val: values.join(',')
            };

            QueryChangeManager.replaceActiveFilters(nextFilters, {
                source: 'FilterSidePanel.updateListFilter'
            });
        }

        uiActions.updateQueryJson();
        services.renderConditionList(field);
        update();
    }

    function syncPanelHeight() {
        const panel = DOM.filterSidePanel;
        const shell = DOM.tableShell;

        if (!panel) {
            return;
        }

        if (window.innerWidth <= 1180 || !shell) {
            panel.style.height = '';
            return;
        }

        panel.style.height = `${Math.ceil(shell.getBoundingClientRect().height)}px`;
    }

    function ensureShellResizeObserver() {
        if (shellResizeObserver || typeof ResizeObserver !== 'function') {
            return;
        }

        const shell = DOM.tableShell;
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

        unsubscribeQueryState = QueryStateSubscriptions.subscribe(event => {
            if (event?.meta?.source === 'VirtualTable.setSplitMode') {
                scheduleDeferredSplitUpdate();
                return;
            }
            update();
        }, {
            displayedFields: true,
            activeFilters: true
        });
    }

    function scheduleDeferredSplitUpdate() {
        if (deferredSplitUpdate) {
            return;
        }

        const run = () => {
            deferredSplitUpdate = 0;
            update();
        };

        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
            deferredSplitUpdate = window.requestIdleCallback(run, { timeout: 500 });
            return;
        }

        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            deferredSplitUpdate = window.requestAnimationFrame(run);
            return;
        }

        deferredSplitUpdate = setTimeout(run, 0);
    }

    function hasAnyFilters() {
        return getActiveFilterEntries().length > 0;
    }

    function getActiveFilterEntries() {
        return Object.entries(getActiveFilters())
            .filter(([, data]) => data && Array.isArray(data.filters) && data.filters.length > 0);
    }

    function getActiveFilterFields() {
        return getActiveFilterEntries().map(([field]) => field);
    }

    function hasDisplayedFields() {
        return getDisplayedFields().length > 0;
    }

    function hasPanelContent() {
        return hasDisplayedFields() || hasAnyFilters();
    }

    function open() {
        const panel = DOM.filterSidePanel;
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
        const panel = DOM.filterSidePanel;
        if (panel && panel.classList.contains('panel-hidden')) {
            open();
        } else {
            hideFully();
        }
    }

    function hideFully() {
        const panel = DOM.filterSidePanel;
        clearPanelArrangeMode();
        if (panel) {
            cleanupPopupControls(DOM.filterPanelBody);
            panel.classList.remove('panel-open');
            panel.classList.add('panel-hidden');
            panel.style.height = '';

            const body = DOM.filterPanelBody;
            if (body) {
                // Clear the body so that if form-mode CSS forces it visible,
                // it respects the empty state rather than showing zombie DOM.
                body.innerHTML = '';
            }
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

    function isMobileFilterEditorViewport() {
        return typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(max-width: 1180px), (hover: none) and (pointer: coarse)').matches;
    }

    function openBubbleForField(field) {
        if (!field) {
            return;
        }

        const overlay = DOM.overlay;
        if (AppState.selectedField === field && overlay?.classList.contains('show')) {
            services.renderConditionList(field);
            const operatorSelect = document.getElementById('condition-operator-select');
            const conditionInput = DOM.conditionInput;
            if (!isMobileFilterEditorViewport()) {
                (operatorSelect || conditionInput)?.focus();
            }
            return;
        }

        if (document.body.classList.contains('mobile-filter-panel-open')) {
            appUiActions.closeMobileFilterPanel();
        }

        const bubble = Array.from(document.querySelectorAll('.bubble')).find(
            b => b.textContent.trim() === field && !b.classList.contains('bubble-disabled')
        );
        if (bubble) {
            bubble.click();
            return;
        }

        if (AppState.currentCategory !== 'All') {
            AppState.currentCategory = 'All';
            services.rerenderBubbles();
            const rerenderedBubble = Array.from(document.querySelectorAll('.bubble')).find(
                b => b.textContent.trim() === field && !b.classList.contains('bubble-disabled')
            );
            if (rerenderedBubble) {
                rerenderedBubble.click();
                return;
            }
        }

        const queryInput = DOM?.queryInput || document.getElementById('query-input');
        if (queryInput) {
            queryInput.value = field;
            queryInput.dispatchEvent(new Event('input', { bubbles: true }));
            queryInput.focus();
            queryInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function openDisplayFieldPicker(insertAt = -1) {
        const lifecycleState = QueryStateReaders?.getLifecycleState?.();
        if (lifecycleState?.queryRunning) {
            return;
        }

        const normalizedInsertAt = Number.isInteger(insertAt)
            ? insertAt
            : Number.parseInt(String(insertAt ?? ''), 10);

        SharedFieldPicker.openQueryFieldPicker({
            insertAt: Number.isInteger(normalizedInsertAt) ? normalizedInsertAt : -1
        }).catch(error => {
            console.error('Failed to open side panel field picker:', error);
            showToastMessage('Failed to open the field picker.', 'error');
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

    function getArrangeIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><path d="m8 7 4-4 4 4"/><path d="M12 3v18"/><path d="m8 17 4 4 4-4"/></svg>';
    }

    const reorderActions = createFilterSidePanelReorderActions({
        DOM,
        QueryChangeManager,
        QueryStateReaders,
        QueryTableView,
        createDisplaySection,
        getActiveFilterFields,
        services,
        uiActions
    });

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

    function createDisplaySection(displayedFieldsOverride = null) {
        const wrapper = document.createElement('section');
        wrapper.className = 'fp-section fp-display-section';
        const fields = Array.isArray(displayedFieldsOverride)
            ? displayedFieldsOverride
            : getDisplayedFields();

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

            const rank = document.createElement('span');
            rank.className = 'fp-display-rank';
            rank.textContent = String(index + 1);

            const name = document.createElement('span');
            name.className = 'fp-display-name';
            name.textContent = field;

            const controls = document.createElement('div');
            controls.className = 'fp-display-actions';

            const arrangeButton = createIconButton(
                'fp-display-btn fp-arrange-btn fp-display-arrange-btn',
                `Arrange ${field}`,
                getArrangeIconSvg(),
                () => beginPanelArrangeMode({
                    source: item,
                    container: list,
                    label: field,
                    getItems: () => Array.from(list.querySelectorAll('.fp-display-item')),
                    commit: (targetItem, insertAfter) => reorderActions.moveDisplayedFieldRelativeToTarget(item, targetItem, insertAfter)
                })
            );
            if (fields.length <= 1) {
                arrangeButton.setAttribute('disabled', 'true');
            }
            controls.appendChild(arrangeButton);

            controls.appendChild(createIconButton(
                'fp-display-btn fp-display-btn-up',
                `Move ${field} up`,
                `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="m18 15-6-6-6 6"/></svg>`,
                () => reorderActions.moveDisplayedFieldItemByOffset(item, -1)
            ));

            controls.appendChild(createIconButton(
                'fp-display-btn fp-display-btn-down',
                `Move ${field} down`,
                `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="m6 9 6 6 6-6"/></svg>`,
                () => reorderActions.moveDisplayedFieldItemByOffset(item, 1)
            ));

            controls.appendChild(createIconButton(
                'fp-display-btn fp-display-btn-remove',
                `Remove ${field} from display`,
                Icons.trashSVG(14, 14),
                () => reorderActions.removeDisplayedFieldItem(item)
            ));

            if (index === 0) {
                controls.querySelector('.fp-display-btn-up')?.setAttribute('disabled', 'true');
            }
            if (index === fields.length - 1) {
                controls.querySelector('.fp-display-btn-down')?.setAttribute('disabled', 'true');
            }

            item.appendChild(rank);
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

    function createFilterGroup(field, data, container, options = {}) {
        const fieldDef = fieldDefs ? fieldDefs.get(field) : null;
        const group = document.createElement('div');
        group.className = 'fp-field-group';
        group.dataset.field = field;

        const fieldHeader = document.createElement('div');
        fieldHeader.className = 'fp-field-header';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'fp-field-name';
        nameSpan.textContent = field;

        const headerActions = document.createElement('div');
        headerActions.className = 'fp-field-header-actions';

        const arrangeButton = createIconButton(
            'fp-display-btn fp-arrange-btn fp-filter-arrange-btn',
            `Arrange ${field} filter`,
            getArrangeIconSvg(),
            () => beginPanelArrangeMode({
                source: group,
                container,
                label: `${field} filter`,
                getItems: () => Array.from(container.querySelectorAll('.fp-field-group')),
                commit: (targetGroup, insertAfter) => reorderActions.moveFilterGroupRelativeToTarget(field, targetGroup?.dataset?.field || '', insertAfter)
            })
        );
        const moveUpButton = createIconButton(
            'fp-display-btn fp-filter-order-btn fp-filter-order-btn-up',
            `Move ${field} filter up`,
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="m18 15-6-6-6 6"/></svg>`,
            () => reorderActions.moveFilterGroupItemByOffset(group, -1)
        );
        const moveDownButton = createIconButton(
            'fp-display-btn fp-filter-order-btn fp-filter-order-btn-down',
            `Move ${field} filter down`,
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="m6 9 6 6 6-6"/></svg>`,
            () => reorderActions.moveFilterGroupItemByOffset(group, 1)
        );

        if (options.index === 0) {
            moveUpButton.setAttribute('disabled', 'true');
        }
        if (options.index === options.total - 1) {
            moveDownButton.setAttribute('disabled', 'true');
        }
        if (options.total <= 1) {
            arrangeButton.setAttribute('disabled', 'true');
        }

        headerActions.appendChild(arrangeButton);
        headerActions.appendChild(moveUpButton);
        headerActions.appendChild(moveDownButton);

        fieldHeader.appendChild(nameSpan);
        fieldHeader.appendChild(headerActions);
        group.appendChild(fieldHeader);

        const condsList = document.createElement('div');
        condsList.className = 'fp-conds-list';

        data.filters.forEach((filterItem, idx) => {
            const useListViewer = shouldUseFilterListViewer(filterItem, fieldDef);
            const row = document.createElement('div');
            row.className = 'fp-cond-row';

            const textSpan = document.createElement('span');
            textSpan.className = 'fp-cond-text';

            // Between: render each bound separately so it reads "Between X and Y"
            if (filterItem.cond.toLowerCase() === 'between') {
                const parts = getFilterDisplayValues(filterItem, fieldDef);
                const lo = parts[0] || '';
                const hi = parts[1] || '';
                textSpan.innerHTML = `<span class="fp-cond-op">${OperatorLabels.get(filterItem.cond)}</span> <b>${lo}</b> <span class="fp-cond-sep">and</span> <b>${hi}</b>`;
            } else {
                const valueLabel = buildFilterValueLabel(filterItem, fieldDef, ' – ');
                textSpan.innerHTML = `<span class="fp-cond-op">${OperatorLabels.get(filterItem.cond)}</span> <b>${valueLabel}</b>`;
            }
            if (useListViewer) {
                textSpan.classList.add('fp-cond-text-clickable');
                textSpan.setAttribute('role', 'button');
                textSpan.setAttribute('tabindex', '0');
                textSpan.setAttribute('aria-label', `View ${field} filter values`);
                const openViewer = () => {
                    openFilterListEditor(filterItem, fieldDef, {
                        fieldName: field,
                        operatorLabel: OperatorLabels.get(filterItem.cond),
                        onChange: nextValues => replaceFilterListValues(field, idx, nextValues)
                    });
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
            delBtn.innerHTML = Icons.trashSVG(14, 14);
            delBtn.addEventListener('click', e => {
                e.stopPropagation();
                QueryChangeManager.removeFilter(field, {
                    index: idx,
                    source: 'FilterSidePanel.removeFilter'
                });
                uiActions.updateQueryJson();
                services.renderConditionList(field);
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
        addCondBtn.textContent = 'Edit filter';
        addCondBtn.addEventListener('click', () => openBubbleForField(field));
        group.appendChild(addCondBtn);

        return group;
    }

    function createFiltersSection() {
        const wrapper = document.createElement('section');
        wrapper.className = 'fp-section fp-filters-section';
        const filterEntries = getActiveFilterEntries();
        const totalFilters = filterEntries.reduce((sum, [, data]) => sum + data.filters.length, 0);

        wrapper.appendChild(createSectionHeader('Filters', totalFilters, totalFilters === 1 ? 'active filter' : 'active filters'));

        if (filterEntries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'fp-empty-state';
            empty.textContent = 'No filters yet. Click a field to add one.';
            wrapper.appendChild(empty);
            return wrapper;
        }

        const list = document.createElement('div');
        list.className = 'fp-filter-list';
        filterEntries.forEach(([field, data], index) => {
            list.appendChild(createFilterGroup(field, data, list, {
                index,
                total: filterEntries.length
            }));
        });
        wrapper.appendChild(list);
        return wrapper;
    }

    function update() {
        const body = DOM.filterPanelBody;
        if (!body) return;
        if (isPanelArrangeModeActive()) {
            return;
        }
        const previousScrollTop = body.scrollTop;

        ensureQueryStateSubscription();

        cleanupPopupControls(body);

        if (!hasPanelContent()) {
            hideFully();
            return;
        }

        const panel = DOM.filterSidePanel;
        if (panel && panel.classList.contains('panel-hidden')) {
            open();
        }

        ensureShellResizeObserver();
        syncPanelHeight();

        const titleEl = DOM.filterPanelTitle;
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

        window.requestAnimationFrame(() => {
            const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
            body.scrollTop = Math.min(previousScrollTop, maxScrollTop);
        });
    }

    return { update, open, close, toggle, setViewMode, syncDisplayListOrder: reorderActions.syncDisplayListOrder };
}());

registerAppUiActionDependencies({ filterSidePanel: FilterSidePanel });

window.addEventListener('resize', () => {
    const panel = DOM.filterSidePanel;
    if (panel && !panel.classList.contains('panel-hidden')) {
        appUiActions.updateFilterSidePanel();
    }
});

export { FilterSidePanel };
