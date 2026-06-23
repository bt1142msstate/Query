const MOBILE_TABLE_ACTION_SELECTOR = '.mobile-table-action';
const MOBILE_FILTER_PANEL_CLASS = 'mobile-filter-panel-open';

function createMobileTableControls({
  DOM,
  appUiActions,
  documentRef = document,
  getActiveFilters,
  getDisplayedFields,
  isMobileTableViewport,
  services
}) {
  function getMobileBuilderDrawer() {
    return documentRef.getElementById('mobile-builder-drawer');
  }

  function getMobileBuilderToggle() {
    return documentRef.getElementById('mobile-builder-toggle');
  }

  function getMobileBuilderSummary() {
    return documentRef.getElementById('mobile-builder-summary');
  }

  function getMobileFilterPanelCloseButton() {
    return documentRef.getElementById('filter-panel-mobile-close');
  }

  function getConfiguredFilterCount() {
    return Object.values(getActiveFilters()).reduce((total, data) => {
      return total + (data && Array.isArray(data.filters) ? data.filters.length : 0);
    }, 0);
  }

  function hasDisplayOrFilterPanelContent() {
    return getDisplayedFields().length > 0 || getConfiguredFilterCount() > 0;
  }

  function syncMobileBuilderDrawer() {
    const drawer = getMobileBuilderDrawer();
    const toggle = getMobileBuilderToggle();
    const summary = getMobileBuilderSummary();

    if (!drawer || !toggle) {
      return;
    }

    const fieldCount = getDisplayedFields().length;
    const filterCount = getConfiguredFilterCount();
    const rowCount = Array.isArray(services.getVirtualTableData()?.rows)
      ? services.getVirtualTableData().rows.length
      : 0;
    const hasTableSurface = fieldCount > 0 || rowCount > 0;

    drawer.classList.toggle('is-active', hasTableSurface);
    if (!hasTableSurface || !isMobileTableViewport()) {
      drawer.classList.remove('is-open');
    }

    toggle.setAttribute('aria-expanded', drawer.classList.contains('is-open') ? 'true' : 'false');

    if (summary) {
      const fieldsLabel = `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'}`;
      const filtersLabel = filterCount > 0
        ? `, ${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}`
        : '';
      summary.textContent = hasTableSurface ? `${fieldsLabel}${filtersLabel}` : 'Edit fields and filters';
    }
  }

  function closeMobileFilterPanel() {
    documentRef.body.classList.remove(MOBILE_FILTER_PANEL_CLASS);
    DOM.filterSidePanel?.classList.remove(MOBILE_FILTER_PANEL_CLASS);
    syncMobileTableActions();
  }

  function openMobileFilterPanel() {
    if (!hasDisplayOrFilterPanelContent()) {
      closeMobileFilterPanel();
      return;
    }

    appUiActions.updateFilterSidePanel();
    DOM.filterSidePanel?.classList.remove('panel-hidden');
    DOM.filterSidePanel?.classList.add(MOBILE_FILTER_PANEL_CLASS);
    documentRef.body.classList.add(MOBILE_FILTER_PANEL_CLASS);
    getMobileFilterPanelCloseButton()?.focus({ preventScroll: true });
    syncMobileTableActions();
  }

  function toggleMobileFilterPanel() {
    if (documentRef.body.classList.contains(MOBILE_FILTER_PANEL_CLASS)) {
      closeMobileFilterPanel();
      return;
    }

    openMobileFilterPanel();
  }

  function syncMobileFilterPanel() {
    if (!isMobileTableViewport() || !hasDisplayOrFilterPanelContent()) {
      closeMobileFilterPanel();
    }
  }

  function getMobileActionLabelText({ action, sourceId, source }) {
    if (action === 'fields-panel') {
      return 'Fields';
    }

    if (sourceId === 'run-query-btn') {
      const sourceLabel = source?.getAttribute('aria-label') || '';
      if (/stop/iu.test(sourceLabel)) return 'Stop';
      if (/refresh/iu.test(sourceLabel)) return 'Refresh';
      return 'Run';
    }

    if (sourceId === 'table-add-field-btn') return 'Add';
    if (sourceId === 'post-filter-btn') return 'Filters';
    if (sourceId === 'download-btn') return 'Export';
    if (sourceId === 'split-columns-toggle') return source?.dataset.mobileLabel || 'Split';
    if (sourceId === 'clear-query-btn') return 'Clear';
    if (sourceId === 'table-expand-btn') {
      return source?.dataset.state === 'expanded' ? 'Collapse' : 'Expand';
    }

    return source?.getAttribute('data-mobile-label')
      || source?.getAttribute('aria-label')
      || source?.getAttribute('data-tooltip')
      || 'Action';
  }

  function syncMobileTableActions() {
    documentRef.querySelectorAll(MOBILE_TABLE_ACTION_SELECTOR).forEach(button => {
      const action = button.getAttribute('data-mobile-table-action');
      const sourceId = button.getAttribute('data-mobile-table-action-target');
      const source = sourceId ? documentRef.getElementById(sourceId) : null;
      const isFilterPanelAction = action === 'fields-panel';
      const disabled = isFilterPanelAction
        ? !hasDisplayOrFilterPanelContent()
        : (!source || source.disabled || source.getAttribute('aria-disabled') === 'true');
      const label = isFilterPanelAction
        ? 'Display fields and filters'
        : source?.getAttribute('aria-label')
        || source?.getAttribute('data-tooltip')
        || button.getAttribute('data-default-label')
        || 'Table action';
      const visibleLabel = getMobileActionLabelText({ action, sourceId, source });
      const isActive = isFilterPanelAction
        ? documentRef.body.classList.contains(MOBILE_FILTER_PANEL_CLASS)
        : Boolean(
          source?.classList.contains('table-toolbar-btn-active')
          || (sourceId === 'table-expand-btn' && source?.dataset.state === 'expanded')
        );

      button.disabled = disabled;
      button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      button.setAttribute('aria-label', label);
      button.setAttribute('data-tooltip', label);
      button.classList.toggle('is-active', isActive);

      if (isFilterPanelAction) {
        button.setAttribute('aria-expanded', documentRef.body.classList.contains(MOBILE_FILTER_PANEL_CLASS) ? 'true' : 'false');
      }

      const labelEl = button.querySelector('.mobile-table-action-label');
      if (labelEl) {
        labelEl.textContent = visibleLabel;
      }
    });
  }

  function initializeMobileBuilderDrawer() {
    const toggle = getMobileBuilderToggle();
    const drawer = getMobileBuilderDrawer();

    if (!toggle || !drawer || toggle.dataset.bound === 'true') {
      return;
    }

    toggle.addEventListener('click', () => {
      drawer.classList.toggle('is-open');
      syncMobileBuilderDrawer();
    });
    toggle.dataset.bound = 'true';
  }

  function initializeMobileTableActionBar() {
    const actionBar = documentRef.getElementById('mobile-table-action-bar');
    if (!actionBar || actionBar.dataset.bound === 'true') {
      return;
    }

    actionBar.addEventListener('click', event => {
      const button = event.target.closest(MOBILE_TABLE_ACTION_SELECTOR);
      if (!button || button.disabled) {
        return;
      }

      const action = button.getAttribute('data-mobile-table-action');
      if (action === 'fields-panel') {
        toggleMobileFilterPanel();
        return;
      }

      const sourceId = button.getAttribute('data-mobile-table-action-target');
      const source = sourceId ? documentRef.getElementById(sourceId) : null;
      if (!source || source.disabled || source.getAttribute('aria-disabled') === 'true') {
        syncMobileTableActions();
        return;
      }

      source.click();
      syncMobileTableActions();
    });
    actionBar.dataset.bound = 'true';
  }

  function initializeMobileFilterPanelControls() {
    const closeButton = getMobileFilterPanelCloseButton();
    if (!closeButton || closeButton.dataset.bound === 'true') {
      return;
    }

    closeButton.addEventListener('click', () => {
      closeMobileFilterPanel();
    });
    closeButton.dataset.bound = 'true';
  }

  function initialize() {
    initializeMobileBuilderDrawer();
    initializeMobileTableActionBar();
    initializeMobileFilterPanelControls();
  }

  return Object.freeze({
    closeMobileFilterPanel,
    initialize,
    syncMobileBuilderDrawer,
    syncMobileFilterPanel,
    syncMobileTableActions
  });
}

export {
  MOBILE_FILTER_PANEL_CLASS,
  createMobileTableControls
};
