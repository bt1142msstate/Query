import { clearHeaderArrangeStatus, showHeaderArrangeStatus } from '../../ui/headerArrangeStatus.js';

const ARRANGE_BODY_CLASS = 'fp-arrange-mode-active';
const ARRANGE_SOURCE_CLASS = 'fp-arrange-source';
const ARRANGE_TARGET_CLASS = 'fp-arrange-target';
const ARRANGE_ACTIVE_TARGET_CLASS = 'fp-arrange-active-target';
const ARRANGE_DROP_BUTTON_CLASS = 'fp-arrange-drop-button';
const ARRANGE_INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]'
].join(', ');
const ARRANGE_AUTO_SCROLL_EDGE_PX = 76;
const ARRANGE_AUTO_SCROLL_DELAY_MS = 160;
const ARRANGE_AUTO_SCROLL_MIN_STEP = 3;
const ARRANGE_AUTO_SCROLL_MAX_STEP = 18;

let activeArrangeState = null;
let arrangeRenderFrame = 0;

function getArrangeItems(state) {
  if (typeof state?.getItems !== 'function') {
    return [];
  }

  return state.getItems().filter(item => item instanceof HTMLElement);
}

function isNoOpPlacement(items, source, target, insertAfter) {
  const sourceIndex = items.indexOf(source);
  const targetIndex = items.indexOf(target);
  if (sourceIndex === -1 || targetIndex === -1) {
    return false;
  }

  return (
    (sourceIndex < targetIndex && insertAfter === false && targetIndex === sourceIndex + 1)
    || (sourceIndex > targetIndex && insertAfter === true && targetIndex === sourceIndex - 1)
  );
}

function getPreferredInsertAfter(target, event = null) {
  if (!Number.isFinite(event?.clientY)) {
    return false;
  }

  const rect = target.getBoundingClientRect();
  return event.clientY >= rect.top + rect.height / 2;
}

function getArrangePlacement(state, target, event = null) {
  const source = state?.source;
  const items = getArrangeItems(state);
  if (!(source instanceof HTMLElement) || !items.includes(target)) {
    return null;
  }

  const preferred = getPreferredInsertAfter(target, event);
  if (!isNoOpPlacement(items, source, target, preferred)) {
    return preferred;
  }

  const alternate = !preferred;
  return isNoOpPlacement(items, source, target, alternate) ? null : alternate;
}

function getArrowSvg(insertAfter) {
  const path = insertAfter ? 'm6 9 6 6 6-6' : 'm18 15-6-6-6 6';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" width="18" height="18" aria-hidden="true"><path d="${path}"/></svg>`;
}

function getArrangeItemLabel(element, fallback = '') {
  return String(
    element?.querySelector?.('.fp-display-name, .fp-field-name')?.textContent
    || fallback
    || element?.textContent
    || ''
  ).replace(/\s+/gu, ' ').trim();
}

function removeArrangeDropButtons(documentRef = globalThis.document) {
  documentRef?.querySelectorAll?.(`.${ARRANGE_DROP_BUTTON_CLASS}`)?.forEach(button => button.remove());
}

function clearActiveTarget(state = activeArrangeState, options = {}) {
  if (state?.hideTimerId) {
    window.clearTimeout(state.hideTimerId);
    state.hideTimerId = 0;
  }
  state?.activeTarget?.classList?.remove(ARRANGE_ACTIVE_TARGET_CLASS);
  if (state) {
    state.activeTarget = null;
    state.activeInsertAfter = false;
  }
  if (!options.keepButton) {
    removeArrangeDropButtons(state?.document);
  }
}

function clearTargetBindings(state = activeArrangeState) {
  if (state?.targetController instanceof AbortController) {
    state.targetController.abort();
  }
  if (state) {
    state.targetController = null;
  }
}

function getArrangeScrollContainer(state) {
  const explicitContainer = state?.scrollContainer;
  if (explicitContainer instanceof HTMLElement) {
    return explicitContainer;
  }

  const container = state?.container;
  if (!(container instanceof HTMLElement)) {
    return null;
  }

  return container.closest('#filter-panel-body') || container;
}

function stopArrangeAutoScroll(state = activeArrangeState) {
  if (state?.autoScrollPendingTimerId) {
    const windowRef = state.document?.defaultView || globalThis.window;
    windowRef.clearTimeout(state.autoScrollPendingTimerId);
    state.autoScrollPendingTimerId = 0;
  }
  if (state?.autoScrollTimerId) {
    const windowRef = state.document?.defaultView || globalThis.window;
    windowRef.clearInterval(state.autoScrollTimerId);
    state.autoScrollTimerId = 0;
  }
  if (state) {
    state.autoScrollStep = 0;
  }
}

function getArrangeAutoScrollStep(state, event) {
  if (!Number.isFinite(event?.clientY) || state?.locked) {
    return 0;
  }

  const scrollContainer = getArrangeScrollContainer(state);
  if (!scrollContainer || scrollContainer.scrollHeight <= scrollContainer.clientHeight + 1) {
    return 0;
  }

  const rect = scrollContainer.getBoundingClientRect();
  const edgeSize = Math.max(36, Math.min(ARRANGE_AUTO_SCROLL_EDGE_PX, rect.height / 3));
  const topDistance = event.clientY - rect.top;
  const bottomDistance = rect.bottom - event.clientY;
  const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
  let direction = 0;
  let intensity = 0;

  if (topDistance < edgeSize && scrollContainer.scrollTop > 0) {
    direction = -1;
    intensity = (edgeSize - Math.max(0, topDistance)) / edgeSize;
  } else if (bottomDistance < edgeSize && scrollContainer.scrollTop < maxScrollTop) {
    direction = 1;
    intensity = (edgeSize - Math.max(0, bottomDistance)) / edgeSize;
  }

  if (!direction || intensity <= 0) {
    return 0;
  }

  const step = ARRANGE_AUTO_SCROLL_MIN_STEP
    + Math.round((ARRANGE_AUTO_SCROLL_MAX_STEP - ARRANGE_AUTO_SCROLL_MIN_STEP) * Math.min(1, intensity));
  return direction * step;
}

function startArrangeAutoScroll(state, step) {
  if (!state || !step) {
    stopArrangeAutoScroll(state);
    return;
  }

  state.autoScrollStep = step;
  if (state.autoScrollTimerId || state.autoScrollPendingTimerId) {
    return;
  }

  const windowRef = state.document?.defaultView || globalThis.window;
  state.autoScrollPendingTimerId = windowRef.setTimeout(() => {
    state.autoScrollPendingTimerId = 0;
    if (!state.autoScrollStep || state.locked) {
      return;
    }
    state.autoScrollTimerId = windowRef.setInterval(() => {
      const scrollContainer = getArrangeScrollContainer(state);
      if (!scrollContainer || !state.autoScrollStep || state.locked) {
        stopArrangeAutoScroll(state);
        return;
      }

      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, scrollContainer.scrollTop + state.autoScrollStep));
      if (nextScrollTop === scrollContainer.scrollTop) {
        stopArrangeAutoScroll(state);
        return;
      }

      scrollContainer.scrollTop = nextScrollTop;
      queueArrangeTargetRender();
    }, 16);
  }, ARRANGE_AUTO_SCROLL_DELAY_MS);
}

function updateArrangeAutoScroll(event) {
  const state = activeArrangeState;
  const step = getArrangeAutoScrollStep(state, event);
  if (!step) {
    stopArrangeAutoScroll(state);
    return;
  }
  startArrangeAutoScroll(state, step);
}

function handleArrangePointerMove(event) {
  updateArrangeAutoScroll(event);
}

function scheduleButtonHide(state, event = null) {
  if (!state || (event?.pointerType && event.pointerType !== 'mouse')) {
    return;
  }

  if (state.hideTimerId) {
    window.clearTimeout(state.hideTimerId);
  }

  state.hideTimerId = window.setTimeout(() => {
    const focusedElement = state.document?.activeElement;
    if (focusedElement instanceof HTMLElement && focusedElement.closest(`.${ARRANGE_DROP_BUTTON_CLASS}`)) {
      return;
    }
    clearActiveTarget(state);
  }, 180);
}

function createDropButton(state, target, insertAfter) {
  const documentRef = state?.document || globalThis.document;
  const windowRef = documentRef.defaultView || globalThis.window;
  const source = state?.source instanceof HTMLElement ? state.source : null;
  const rect = target.getBoundingClientRect();
  const buttonSize = Number(state?.buttonSize || 40);
  const label = source?.querySelector?.('.fp-display-name, .fp-field-name')?.textContent?.trim()
    || state?.label
    || 'selected item';
  const placement = insertAfter ? 'after' : 'before';
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = `${ARRANGE_DROP_BUTTON_CLASS} ${ARRANGE_DROP_BUTTON_CLASS}-${placement}`;
  button.dataset.arrangePlacement = placement;
  button.title = `Place ${placement}`;
  button.setAttribute('aria-label', `Place ${label} ${placement} this item`);
  button.innerHTML = getArrowSvg(insertAfter);

  const left = rect.left + rect.width / 2 - buttonSize / 2;
  const top = (insertAfter ? rect.bottom : rect.top) - buttonSize / 2;
  button.style.left = `${Math.round(Math.max(8, Math.min(windowRef.innerWidth - buttonSize - 8, left)))}px`;
  button.style.top = `${Math.round(Math.max(8, Math.min(windowRef.innerHeight - buttonSize - 8, top)))}px`;
  button.addEventListener('click', event => handleDropButtonClick(event, target, insertAfter));
  return button;
}

function showDropButtonForTarget(state, target, event = null) {
  const insertAfter = getArrangePlacement(state, target, event);
  if (insertAfter === null) {
    clearActiveTarget(state);
    return;
  }

  const documentRef = state.document || globalThis.document;
  const existingButton = documentRef.querySelector(`.${ARRANGE_DROP_BUTTON_CLASS}`);
  if (
    state.activeTarget === target
    && state.activeInsertAfter === insertAfter
    && existingButton instanceof HTMLButtonElement
  ) {
    if (state.hideTimerId) {
      window.clearTimeout(state.hideTimerId);
      state.hideTimerId = 0;
    }
    return;
  }

  clearActiveTarget(state, { keepButton: true });
  removeArrangeDropButtons(documentRef);
  target.classList.add(ARRANGE_ACTIVE_TARGET_CLASS);
  const button = createDropButton(state, target, insertAfter);
  state.activeTarget = target;
  state.activeInsertAfter = insertAfter;
  button.addEventListener('pointerenter', () => {
    if (state.hideTimerId) {
      window.clearTimeout(state.hideTimerId);
      state.hideTimerId = 0;
    }
  });
  button.addEventListener('pointerleave', leaveEvent => scheduleButtonHide(state, leaveEvent));
  button.addEventListener('focus', () => {
    if (state.hideTimerId) {
      window.clearTimeout(state.hideTimerId);
      state.hideTimerId = 0;
    }
  });
  button.addEventListener('blur', () => scheduleButtonHide(state));
  documentRef.body.appendChild(button);
}

function bindTargetInteractions(state, targets) {
  clearTargetBindings(state);
  state.targetController = new AbortController();
  const { signal } = state.targetController;
  targets.forEach(target => {
    target.addEventListener('pointerenter', event => showDropButtonForTarget(state, target, event), { signal });
    target.addEventListener('pointermove', event => showDropButtonForTarget(state, target, event), { signal });
    target.addEventListener('pointerleave', event => scheduleButtonHide(state, event), { signal });
    target.addEventListener('focusin', () => showDropButtonForTarget(state, target), { signal });
    target.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest(`.${ARRANGE_DROP_BUTTON_CLASS}, ${ARRANGE_INTERACTIVE_SELECTOR}`)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      showDropButtonForTarget(state, target, event);
    }, { signal });
  });
}

function renderArrangeTargets() {
  arrangeRenderFrame = 0;
  const state = activeArrangeState;
  clearTargetBindings(state);
  removeArrangeDropButtons(state?.document);
  state?.container?.querySelectorAll?.(`.${ARRANGE_TARGET_CLASS}, .${ARRANGE_ACTIVE_TARGET_CLASS}`)?.forEach(item => {
    item.classList.remove(ARRANGE_TARGET_CLASS, ARRANGE_ACTIVE_TARGET_CLASS);
  });
  if (!state || state.locked || !(state.source instanceof HTMLElement)) {
    return;
  }

  const items = getArrangeItems(state).filter(item => item.isConnected);
  if (!items.includes(state.source)) {
    clearPanelArrangeMode();
    return;
  }

  const targets = items.filter(item => item !== state.source);
  targets.forEach(target => target.classList.add(ARRANGE_TARGET_CLASS));
  bindTargetInteractions(state, targets);
  if (state.activeTarget instanceof HTMLElement && targets.includes(state.activeTarget)) {
    showDropButtonForTarget(state, state.activeTarget);
  }
}

function queueArrangeTargetRender() {
  if (!activeArrangeState || arrangeRenderFrame) {
    return;
  }
  arrangeRenderFrame = window.requestAnimationFrame(renderArrangeTargets);
}

function handleArrangeEscape(event) {
  if (event.key !== 'Escape' || !activeArrangeState) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  clearPanelArrangeMode();
}

async function handleDropButtonClick(event, target, insertAfter) {
  event.preventDefault();
  event.stopPropagation();
  const state = activeArrangeState;
  const source = state?.source;
  const items = getArrangeItems(state);
  if (
    !state
    || state.locked
    || !(source instanceof HTMLElement)
    || !(target instanceof HTMLElement)
    || isNoOpPlacement(items, source, target, insertAfter)
  ) {
    clearPanelArrangeMode();
    return;
  }

  state.locked = true;
  state.document?.querySelectorAll?.(`.${ARRANGE_DROP_BUTTON_CLASS}`)?.forEach(button => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  });
  try {
    await state.commit(target, insertAfter);
  } finally {
    clearPanelArrangeMode();
  }
}

function clearPanelArrangeMode() {
  const state = activeArrangeState;
  if (arrangeRenderFrame) {
    window.cancelAnimationFrame(arrangeRenderFrame);
    arrangeRenderFrame = 0;
  }
  clearTargetBindings(state);
  stopArrangeAutoScroll(state);
  clearActiveTarget(state);
  state?.container?.querySelectorAll?.(`.${ARRANGE_SOURCE_CLASS}, .${ARRANGE_TARGET_CLASS}, .${ARRANGE_ACTIVE_TARGET_CLASS}`)?.forEach(item => {
    item.classList.remove(ARRANGE_SOURCE_CLASS, ARRANGE_TARGET_CLASS, ARRANGE_ACTIVE_TARGET_CLASS);
    item.removeAttribute('aria-grabbed');
  });
  state?.document?.body?.classList?.remove(ARRANGE_BODY_CLASS);
  state?.document?.removeEventListener?.('keydown', handleArrangeEscape, true);
  state?.document?.removeEventListener?.('pointermove', handleArrangePointerMove, true);
  const windowRef = state?.document?.defaultView || globalThis.window;
  windowRef?.removeEventListener?.('scroll', queueArrangeTargetRender, true);
  windowRef?.removeEventListener?.('resize', queueArrangeTargetRender, true);
  clearHeaderArrangeStatus({ documentRef: state?.document || globalThis.document });
  activeArrangeState = null;
}

function isPanelArrangeModeActive() {
  return Boolean(activeArrangeState);
}

function beginPanelArrangeMode(config = {}) {
  const source = config.source;
  const container = config.container;
  if (!(source instanceof HTMLElement) || !(container instanceof HTMLElement) || typeof config.commit !== 'function') {
    return false;
  }
  if (activeArrangeState?.source === source) {
    clearPanelArrangeMode();
    return false;
  }

  clearPanelArrangeMode();
  const documentRef = source.ownerDocument || globalThis.document;
  const windowRef = documentRef.defaultView || globalThis.window;
  activeArrangeState = {
    ...config,
    source,
    container,
    document: documentRef,
    buttonSize: config.buttonSize || 40,
    locked: false,
    hideTimerId: 0,
    autoScrollStep: 0,
    autoScrollPendingTimerId: 0,
    autoScrollTimerId: 0,
    scrollContainer: config.scrollContainer instanceof HTMLElement
      ? config.scrollContainer
      : container.closest?.('#filter-panel-body') || container,
    targetController: null,
    activeTarget: null,
    activeInsertAfter: false
  };
  source.classList.add(ARRANGE_SOURCE_CLASS);
  source.setAttribute('aria-grabbed', 'true');
  documentRef.body.classList.add(ARRANGE_BODY_CLASS);
  showHeaderArrangeStatus(getArrangeItemLabel(source, config.label), {
    action: 'Arranging',
    documentRef
  });
  documentRef.addEventListener('keydown', handleArrangeEscape, true);
  documentRef.addEventListener('pointermove', handleArrangePointerMove, true);
  windowRef?.addEventListener?.('scroll', queueArrangeTargetRender, true);
  windowRef?.addEventListener?.('resize', queueArrangeTargetRender, true);
  renderArrangeTargets();
  return true;
}

export { beginPanelArrangeMode, clearPanelArrangeMode, isPanelArrangeModeActive };
