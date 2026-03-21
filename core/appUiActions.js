/**
 * Thin facade for cross-module UI actions.
 * Keeps callers from reaching directly into exported window functions.
 */
(function initializeAppUiActions() {
  function showExampleTable(fields, options = {}) {
    const showTable = window.QueryTableView?.showExampleTable;
    if (typeof showTable !== 'function') {
      return Promise.resolve();
    }

    return showTable(fields, options);
  }

  function updateCategoryCounts() {
    window.updateCategoryCounts?.();
  }

  function updateButtonStates() {
    window.QueryUI?.updateButtonStates?.();
  }

  function updateRunButtonIcon(validationError) {
    window.QueryUI?.updateRunButtonIcon?.(validationError);
  }

  function updateQueryJson() {
    window.JsonViewerUI?.updateQueryJson?.();
  }

  function refreshTableViewport() {
    window.QueryUI?.refreshTableViewport?.();
  }

  function updateTableChromeState() {
    window.QueryUI?.updateTableChromeState?.();
  }

  const appUiActions = Object.freeze({
    showExampleTable,
    updateCategoryCounts,
    updateButtonStates,
    updateRunButtonIcon,
    updateQueryJson,
    refreshTableViewport,
    updateTableChromeState
  });

  Object.defineProperty(window, 'AppUiActions', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: appUiActions
  });
})();
