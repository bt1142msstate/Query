function resolveRequestedFormViewMode({ limitedView = false, nextMode = 'form' } = {}) {
  if (limitedView) {
    return 'form';
  }

  return nextMode === 'bubbles' ? 'bubbles' : 'form';
}

function getNextFormViewMode(currentViewMode = 'form') {
  return currentViewMode === 'form' ? 'bubbles' : 'form';
}

function getModeTogglePresentation(viewMode = 'form') {
  const isFormMode = viewMode === 'form';
  return {
    tooltip: isFormMode ? 'Switch to bubble builder' : 'Switch to form mode',
    ariaLabel: isFormMode ? 'Switch to bubble builder' : 'Switch to form mode',
    mobileMenuLabel: isFormMode ? 'Bubble Mode' : 'Form Mode',
    formIconHidden: isFormMode,
    bubbleIconHidden: !isFormMode
  };
}

function getFormModePresentationState(state = {}) {
  const viewMode = state.viewMode === 'bubbles' ? 'bubbles' : 'form';
  return {
    isFormMode: viewMode === 'form',
    isLimitedView: Boolean(state.active && state.limitedView),
    modeToggle: getModeTogglePresentation(viewMode)
  };
}

function getBubbleStageElement(documentRef) {
  return documentRef.getElementById('bubble-container')?.closest('.flex.items-start.justify-center') || null;
}

function syncModeToggleButton(button, presentation) {
  if (!button) {
    return;
  }

  button.classList.toggle('hidden', presentation.isLimitedView);
  button.setAttribute('data-tooltip', presentation.modeToggle.tooltip);
  button.setAttribute('data-tooltip-delay', '0');
  button.setAttribute('aria-label', presentation.modeToggle.ariaLabel);
  button.dataset.mobileMenuLabel = presentation.modeToggle.mobileMenuLabel;

  const formIcon = button.querySelector('[data-form-mode-icon="form"]');
  const bubbleIcon = button.querySelector('[data-form-mode-icon="bubbles"]');
  formIcon?.classList.toggle('hidden', presentation.modeToggle.formIconHidden);
  bubbleIcon?.classList.toggle('hidden', presentation.modeToggle.bubbleIconHidden);
}

function syncFormModePresentation({
  state,
  document: documentRef,
  uiActions,
  queryTableView
} = {}) {
  if (!state || !documentRef) {
    return;
  }

  const presentation = getFormModePresentationState(state);
  const querySearchBlock = documentRef.getElementById('query-input')?.closest('.mb-6') || null;
  const categoryBar = documentRef.getElementById('category-bar');
  const mobileCategorySelector = documentRef.getElementById('mobile-category-selector');
  const bubbleStage = getBubbleStageElement(documentRef);
  const hiddenControlIds = ['toggle-json', 'toggle-queries'];

  documentRef.body?.classList.toggle('form-mode-active', presentation.isFormMode);

  [querySearchBlock, categoryBar, mobileCategorySelector].filter(Boolean).forEach(node => {
    node.classList.toggle('form-mode-hidden', presentation.isFormMode);
  });

  bubbleStage?.classList.toggle('form-mode-stage-active', presentation.isFormMode);
  state.formHost?.classList.toggle('hidden', !presentation.isFormMode);
  state.formCard?.classList.toggle('hidden', !presentation.isFormMode);

  hiddenControlIds.forEach(id => {
    documentRef.getElementById(id)?.classList.toggle('hidden', presentation.isLimitedView);
  });

  syncModeToggleButton(state.modeToggleBtn, presentation);
  uiActions?.updateFilterSidePanel?.();
  queryTableView?.syncEmptyTableMessage?.();
}

function getModeToggleButtonHtml() {
  return `
    <svg data-form-mode-icon="form" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 pointer-events-none">
      <rect x="4" y="4" width="16" height="16" rx="2"></rect>
      <path d="M8 8h8"></path>
      <path d="M8 12h8"></path>
      <path d="M8 16h5"></path>
    </svg>
    <svg data-form-mode-icon="bubbles" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 pointer-events-none hidden">
      <circle cx="12" cy="12" r="7"></circle>
      <path d="M9 17.4c.95.72 2.13 1.1 3.4 1.1 3.09 0 5.68-2.26 6.2-5.2"></path>
      <path d="M8 9.2c.62-2.02 2.49-3.5 4.7-3.5 1.17 0 2.25.42 3.08 1.12"></path>
      <circle cx="9.3" cy="8.7" r="1.15" fill="currentColor" stroke="none" opacity="0.32"></circle>
    </svg>
  `;
}

function ensureFormModeToggleButton({
  state,
  document: documentRef,
  onToggle
} = {}) {
  if (!state || !documentRef || state.modeToggleBtn) {
    return state?.modeToggleBtn || null;
  }

  const headerControls = documentRef.getElementById('header-controls');
  if (!headerControls) {
    return null;
  }

  const button = documentRef.createElement('button');
  button.id = 'form-mode-toggle-btn';
  button.type = 'button';
  button.className = 'p-2 rounded-full bg-white hover:bg-gray-100 text-black focus:outline-none transition-colors border border-gray-200';
  button.innerHTML = getModeToggleButtonHtml();
  button.addEventListener('click', () => {
    if (typeof onToggle === 'function') {
      onToggle();
    }
  });

  headerControls.insertBefore(button, documentRef.getElementById('toggle-json'));
  state.modeToggleBtn = button;
  return button;
}

function refreshBubbleStageAfterModeSwitch({ services, window: windowRef } = {}) {
  if (!services?.bubble?.safeRenderBubbles || !windowRef?.requestAnimationFrame) {
    return;
  }

  windowRef.requestAnimationFrame(() => {
    windowRef.requestAnimationFrame(() => {
      services.rerenderBubbles?.();
    });
  });
}

export {
  ensureFormModeToggleButton,
  getFormModePresentationState,
  getModeTogglePresentation,
  getNextFormViewMode,
  refreshBubbleStageAfterModeSwitch,
  resolveRequestedFormViewMode,
  syncFormModePresentation
};
