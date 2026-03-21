/**
 * Thin facade for cross-module UI actions.
 * Keeps callers from reaching directly into exported window functions.
 */
(function initializeAppUiActions() {
  function showExampleTable(fields, options = {}) {
    if (typeof window.showExampleTable !== 'function') {
      return Promise.resolve();
    }

    return window.showExampleTable(fields, options);
  }

  function updateCategoryCounts() {
    window.updateCategoryCounts?.();
  }

  function updateButtonStates() {
    window.updateButtonStates?.();
  }

  function updateRunButtonIcon(validationError) {
    window.updateRunButtonIcon?.(validationError);
  }

  function updateQueryJson() {
    window.updateQueryJson?.();
  }

  function refreshTableViewport() {
    window.refreshTableViewport?.();
  }

  function updateTableChromeState() {
    window.updateTableChromeState?.();
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
