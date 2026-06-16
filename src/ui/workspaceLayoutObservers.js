let formStageMutationObserver = null;
let formCardResizeObserver = null;
let observedFormCard = null;
let pendingViewportHeightSync = 0;

function isMobileWorkspaceViewport(windowRef) {
  return Boolean(
    windowRef?.matchMedia
    && windowRef.matchMedia('(max-width: 1180px)').matches
  );
}

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

  formStageMutationObserver = new windowRef.MutationObserver((mutations = []) => {
    syncFormCardObserver();
    const bodyOnlyMutation = mutations.length > 0
      && mutations.every(mutation => mutation.target === documentRef.body);
    if (bodyOnlyMutation && isMobileWorkspaceViewport(windowRef)) {
      return;
    }
    scheduleSync();
  });
  formStageMutationObserver.observe(formStage, {
    attributeFilter: ['class', 'hidden', 'style'],
    attributes: true,
    childList: true,
    subtree: true
  });
  if (documentRef.body) {
    formStageMutationObserver.observe(documentRef.body, {
      attributeFilter: ['class', 'style'],
      attributes: true
    });
  }
  syncFormCardObserver();
}

export { initializeWorkspaceLayoutObservers };
