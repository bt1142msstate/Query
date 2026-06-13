let formStageMutationObserver = null;
let formCardResizeObserver = null;
let observedFormCard = null;
let pendingViewportHeightSync = 0;

function initializeWorkspaceLayoutObservers({
  documentRef = globalThis.document,
  renderVirtualTable,
  syncTableViewportHeight,
  windowRef = globalThis.window
} = {}) {
  if (!documentRef || !windowRef || typeof syncTableViewportHeight !== 'function') {
    return;
  }

  const scheduleSync = () => {
    if (pendingViewportHeightSync || typeof windowRef.requestAnimationFrame !== 'function') {
      return;
    }

    pendingViewportHeightSync = windowRef.requestAnimationFrame(() => {
      pendingViewportHeightSync = 0;
      syncTableViewportHeight();
      renderVirtualTable?.();
    });
  };

  const syncFormCardObserver = () => {
    if (typeof windowRef.ResizeObserver !== 'function') {
      return;
    }

    const formCard = documentRef.getElementById('form-mode-card');
    if (formCard === observedFormCard) {
      return;
    }

    formCardResizeObserver?.disconnect();
    observedFormCard = formCard;
    formCardResizeObserver = null;

    if (formCard) {
      formCardResizeObserver = new windowRef.ResizeObserver(scheduleSync);
      formCardResizeObserver.observe(formCard);
      scheduleSync();
    }
  };

  if (formStageMutationObserver || typeof windowRef.MutationObserver !== 'function') {
    syncFormCardObserver();
    return;
  }

  const formStage = documentRef.getElementById('field-bubble-stage');
  if (!formStage) {
    return;
  }

  formStageMutationObserver = new windowRef.MutationObserver(() => {
    syncFormCardObserver();
    scheduleSync();
  });
  formStageMutationObserver.observe(formStage, { childList: true, subtree: true });
  syncFormCardObserver();
}

export { initializeWorkspaceLayoutObservers };
