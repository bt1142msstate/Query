import { appRuntime } from '../core/appRuntime.js';
/* Keep the condition input capsule aligned above the active editor controls. */
appRuntime.positionInputWrapper = function() {
  const inputWrapper = appRuntime.DOM.inputWrapper;
  const conditionPanel = appRuntime.DOM.conditionPanel;

  if (!inputWrapper || !conditionPanel || !inputWrapper.classList.contains('show')) return;

  const panelRect = conditionPanel.getBoundingClientRect();
  const wrapperRect = inputWrapper.getBoundingClientRect();
  const gap = 12;

  let top = panelRect.top - wrapperRect.height - gap;

  const headerHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10) || 64;
  const minTop = headerHeight + 24;
  if (top < minTop) {
    top = minTop;
  }

  inputWrapper.style.top = `${top}px`;
  inputWrapper.style.setProperty('--wrapper-top', `${top}px`);
  inputWrapper.style.setProperty('--panel-top', `${panelRect.top}px`);
};