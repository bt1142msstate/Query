/**
 * Explicit application bootstrap.
 * Centralizes startup order for UI modules that bind DOM listeners.
 */
(function initializeAppBootstrap() {
  function bootstrap() {
    window.QueryUI?.initialize?.();
    window.TableNameInput?.initialize?.();
    window.QueryBuilderShell?.initialize?.();
  }

  window.onDOMReady(bootstrap);
})();
