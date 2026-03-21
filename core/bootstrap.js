/**
 * Explicit application bootstrap.
 * Centralizes startup order for UI modules that bind DOM listeners.
 */
(function initializeAppBootstrap() {
  function runInitializer(label, initializer) {
    if (typeof initializer !== 'function') {
      return;
    }

    Promise.resolve(initializer()).catch(error => {
      console.error(`Failed to initialize ${label}:`, error);
      if (window.showToastMessage) {
        window.showToastMessage(`Failed to initialize ${label}.`, 'error');
      }
    });
  }

  function bootstrap() {
    runInitializer('query UI', window.QueryUI?.initialize);
    runInitializer('table name input', window.TableNameInput?.initialize);
    runInitializer('query builder shell', window.QueryBuilderShell?.initialize);
    runInitializer('form mode', window.QueryFormMode?.initialize);
  }

  window.onDOMReady(bootstrap);
})();
