import { QueryStateSubscriptions } from '../../../core/queryStateSubscriptions.js';
import { appServices } from '../../../core/appServices.js';
import { AppState, QueryChangeManager, QueryStateReaders } from '../filterQueryState.js';
import { showToastMessage } from '../../../core/toast.js';
import { VisibilityUtils } from '../../../core/visibility.js';
import { registerBubbleInteractionService } from './bubble.js';
import { fieldDefs, isFieldBackendFilterable, isFieldBuildable } from '../fieldDefs.js';
import { DOM } from '../../../core/domCache.js';

var getFilterGroupForField = QueryStateReaders.getFilterGroupForField.bind(QueryStateReaders);
var getLifecycleState = QueryStateReaders.getLifecycleState.bind(QueryStateReaders);
var appState = AppState;
var services = appServices;
let bubbleEventsInitialized = false;

function isMobileBubbleEditorViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 1024px), (hover: none) and (pointer: coarse)').matches;
}

function getEventTargetElement(event) {
  return event.target instanceof Element ? event.target : event.target && event.target.parentElement;
}

function getBubbleClickTarget(event) {
  const targetEl = getEventTargetElement(event);
  return {
    bubble: targetEl ? targetEl.closest('.bubble') : null,
    targetEl
  };
}

function logBubbleClick(event, targetEl, bubble, overlay) {
  services.bubbleDebugLog('document.click', {
    rawTargetNodeType: event.target && event.target.nodeType,
    targetTag: targetEl && targetEl.tagName,
    targetClass: targetEl && targetEl.className,
    resolvedBubble: bubble ? bubble.textContent.trim() : null,
    hasActiveBubble: !!document.querySelector('.active-bubble, .bubble-clone'),
    isBubbleAnimating: !!services.bubble?.isBubbleAnimating,
    isOverlayOpen: !!(overlay && overlay.classList.contains('show'))
  });
}

function getBubbleFieldState(fieldName) {
  const fieldDef = fieldDefs ? fieldDefs.get(fieldName) : null;
  const isBuildable = isFieldBuildable(fieldDef);
  const isFilterable = typeof isFieldBackendFilterable === 'function'
    ? isFieldBackendFilterable(fieldDef || fieldName)
    : Boolean(fieldDef && Array.isArray(fieldDef.filters) && fieldDef.filters.length > 0);

  return { fieldDef, isBuildable, isFilterable };
}

function shouldBlockBubbleOpen(event, bubble, fieldName, fieldState) {
  if (services.isModalInputLocked()) {
    services.bubbleDebugLog('click.blocked.inputLocked');
    event.stopPropagation();
    event.preventDefault();
    return true;
  }

  if (!bubble) {
    return true;
  }

  if (!fieldState.isBuildable && !fieldState.isFilterable) {
    services.bubbleDebugLog('click.ignored.displayOnlyField', { fieldName });
    showToastMessage(`${fieldName} is display-only and does not support filters.`, 'warning');
    return true;
  }

  if (getLifecycleState().queryRunning) {
    services.bubbleDebugLog('click.blocked.queryRunning', { bubble: bubble.textContent.trim() });
    showToastMessage('Cannot edit conditions while a query is running', 'warning');
    event.stopPropagation();
    event.preventDefault();
    return true;
  }

  if (document.querySelector('.active-bubble, .bubble-clone')) {
    services.bubbleDebugLog('click.blocked.activeBubbleAlreadyOpen', { bubble: bubble.textContent.trim() });
    return true;
  }

  if (services.bubble?.isBubbleAnimating) {
    services.bubbleDebugLog('click.blocked.isBubbleAnimating', { bubble: bubble.textContent.trim() });
    return true;
  }

  return false;
}

function createBubbleClone(bubble, fieldName) {
  const rect = bubble.getBoundingClientRect();
  const clone = bubble.cloneNode(true);
  clone.dataset.filterFor = fieldName;
  clone.classList.add('bubble-clone');
  clone._origin = bubble;
  clone._originalRect = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
  clone.style.left = rect.left + 'px';
  clone.style.position = 'fixed';
  clone.style.top = rect.top + 'px';
  clone.style.margin = '0';
  clone.style.pointerEvents = 'none';
  clone.style.color = getComputedStyle(bubble).color;
  document.body.appendChild(clone);
  return clone;
}

function disableSourceBubble(bubble) {
  bubble.classList.add('bubble-disabled');
  bubble.style.opacity = '0';
  bubble.dataset.filterFor = bubble.textContent.trim();
}

function prepareFilterCardForOpen() {
  const filterCard = services.getBubbleFilterCardElement();
  if (filterCard && !DOM?.filterCard) {
    document.body.appendChild(filterCard);
    void filterCard.offsetHeight;
  }
  if (filterCard) {
    services.prepareBubbleFilterCardForOpen(filterCard);
  }
  return filterCard;
}

function updateCategoryButtons() {
  DOM.categoryBar?.querySelectorAll('.category-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.category === appState.currentCategory)
  );
}

function getBubbleTargetSize(filterCard) {
  const size = { targetHeight: 350, targetWidth: 480 };
  if (!filterCard) {
    return size;
  }

  const fcRect = filterCard.getBoundingClientRect();
  if (fcRect.width > 0) size.targetWidth = fcRect.width;
  if (fcRect.height > 0) size.targetHeight = fcRect.height;
  return size;
}

function prepareBubblePanel({ bubble, fieldName, filterCard, overlay }) {
  if (overlay) {
    overlay.classList.add('show');
  }
  VisibilityUtils.acquireRaisedUi('bubble-editor');
  services.buildBubbleConditionPanel(bubble);

  const inputWrapper = services.getBubbleInputWrapperElement()
    || (filterCard ? filterCard.querySelector('#condition-input-wrapper') : null);
  if (filterCard) {
    const titleEl = services.getBubbleFilterCardTitleElement(filterCard);
    if (titleEl) titleEl.textContent = fieldName;
  }
  services.renderConditionList(fieldName);
  if (inputWrapper && getFilterGroupForField(fieldName)) {
    inputWrapper.classList.add('show');
  }
}

function showMobileBubbleEditor({ clone, conditionPanel, filterCard, overlay, fieldName }) {
  clone.classList.add('active-bubble', 'enlarge-bubble', 'mobile-bubble-editor-clone', 'popping');
  clone.style.opacity = '0';
  clone.style.visibility = 'hidden';

  conditionPanel?.classList.add('show');
  if (filterCard) {
    services.markBubbleFilterCardOpen(filterCard, { scrollReadyDelay: 0 })
      || filterCard.classList.add('show', 'content-ready', 'scroll-ready');
  }
  overlay?.classList.add('bubble-active');
  DOM.headerBar?.classList.add('header-hide');

  services.bubble.isBubbleAnimating = false;
  services.bubbleDebugLog('click.open.mobileSheet', { fieldName });
}

function completeDesktopBubbleOpen({ clone, conditionPanel, filterCard, fieldName, morphDuration }) {
  conditionPanel?.classList.add('show');
  if (filterCard) {
    const scrollDelay = Math.max(220, Math.min(320, Math.round(morphDuration * 320)));
    services.markBubbleFilterCardOpen(filterCard, { scrollReadyDelay: scrollDelay })
      || filterCard.classList.add('show', 'content-ready');
  }

  clone.classList.add('popping');
  services.createBubblePopParticles(clone);
  services.bubble.isBubbleAnimating = false;
  services.bubbleDebugLog('click.open.complete', { fieldName });
}

function attachDesktopBubbleTransition({ clone, conditionPanel, filterCard, fieldName, targetWidth, targetHeight, morphDuration }) {
  clone.addEventListener('transitionend', function t(event) {
    services.bubbleDebugLog('clone.transitionend', {
      fieldName,
      propertyName: event.propertyName,
      enlarged: clone.classList.contains('enlarge-bubble')
    });

    if (!clone.classList.contains('enlarge-bubble')) {
      if (event.propertyName === 'top' || event.propertyName === 'left' || event.propertyName === 'transform') {
        requestAnimationFrame(() => {
          clone.classList.add('enlarge-bubble');
          clone.style.setProperty('width', `${targetWidth}px`, 'important');
          clone.style.setProperty('height', `${targetHeight}px`, 'important');
        });
      }
      return;
    }

    if (event.propertyName !== 'width' && event.propertyName !== 'height') return;

    completeDesktopBubbleOpen({
      clone,
      conditionPanel,
      filterCard,
      fieldName,
      morphDuration
    });
    clone.removeEventListener('transitionend', t);
  });
}

function restoreCloneOriginAfterRender(clone, fieldName) {
  setTimeout(() => {
    if (document.body.contains(clone._origin)) {
      return;
    }

    let baseFieldName = fieldName;
    const fieldDef = fieldDefs ? fieldDefs.get(fieldName) : null;
    if (fieldDef && fieldDef.dynamic_parent) {
      baseFieldName = fieldDef.dynamic_parent;
    }

    const fallbackBubble = Array.from(document.querySelectorAll('.bubble')).find(b => b.textContent.trim() === baseFieldName);
    if (fallbackBubble) clone._origin = fallbackBubble;
  }, 60);
}

function initializeBubbleInteractions() {
  if (!QueryChangeManager) {
    console.log('Bubble system: Required globals not yet available, skipping initialization');
    return false;
  }

  try {
    services.renderBubbles();
  } catch (error) {
    console.error('Error during bubble initialization:', error);
    return false;
  }

  if (bubbleEventsInitialized) return true;
  bubbleEventsInitialized = true;

  const bubbleContainer = DOM.bubbleContainer;
  const scrollContainer = DOM.bubbleScrollbar;
  [bubbleContainer, scrollContainer].forEach(el => {
    if (!el) return;
    el.addEventListener('mouseenter', () => appState.hoverScrollArea = true);
    el.addEventListener('mouseleave', () => appState.hoverScrollArea = false);
  });

  function handleWheelScroll(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    services.scrollBubblesByRows(delta);
  }

  [bubbleContainer, scrollContainer].forEach(el => {
    if (!el) return;
    el.addEventListener('wheel', handleWheelScroll, { passive: false });
  });

  const thumb = DOM.bubbleScrollbarThumb;
  const track = DOM.bubbleScrollbarTrack;

  if (thumb && track) {
    let isDragging = false;
    let startY = 0;
    let startScrollRow = 0;

    thumb.addEventListener('mousedown', e => {
      isDragging = true;
      startY = e.clientY;
      startScrollRow = appState.scrollRow;
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!isDragging) return;

      const deltaY = e.clientY - startY;
      const trackHeight = track.clientHeight;
      const thumbHeight = thumb.clientHeight;
      const maxScrollPixels = trackHeight - thumbHeight;
      const maxStartRow = services.getBubbleMaxStartRow();

      if (maxScrollPixels <= 0) return;

      const startRatio = maxStartRow > 0 ? (startScrollRow / maxStartRow) : 0;
      let newY = (startRatio * maxScrollPixels) + deltaY;
      newY = Math.max(0, Math.min(maxScrollPixels, newY));

      const newRatio = newY / maxScrollPixels;
      const exactRow = newRatio * maxStartRow;
      const newRow = Math.round(exactRow);

      services.applyBubbleScrollRow(newRow);
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
      }
    });

    track.addEventListener('click', e => {
      if (e.target === thumb) return;

      const rect = track.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const trackHeight = track.clientHeight;
      const thumbHeight = thumb.clientHeight;
      const maxScrollPixels = trackHeight - thumbHeight;
      const maxStartRow = services.getBubbleMaxStartRow();

      if (maxScrollPixels <= 0) return;

      let targetY = clickY - (thumbHeight / 2);
      targetY = Math.max(0, Math.min(maxScrollPixels, targetY));

      const ratio = targetY / maxScrollPixels;
      const newRow = Math.max(0, Math.min(maxStartRow, Math.round(ratio * maxStartRow)));

      services.applyBubbleScrollRow(newRow);
    });
  }

  window.addEventListener('resize', () => {
    const container = DOM.bubbleContainer;
    const listDiv = DOM.bubbleList;
    const scrollCont = DOM.bubbleScrollbar;
    if (!container || !listDiv || !scrollCont) return;
    const firstBubble = listDiv.querySelector('.bubble');
    if (!firstBubble) return;
    const gapVal = getComputedStyle(listDiv).getPropertyValue('gap') || '0px';
    const gap = parseFloat(gapVal) || 0;
    const fudge = 8;
    const twoRowsH = (firstBubble.getBoundingClientRect().height + gap) * 2 - gap;
    const paddedH = twoRowsH + 12 - fudge;
    const sixColsW = firstBubble.offsetWidth * 6 + gap * 5;
    container.style.height = paddedH + 'px';
    container.style.width = sixColsW + 'px';
    scrollCont.style.height = paddedH + 'px';
    services.applyBubbleScrollRow(appState.scrollRow, { force: true });
  });

  document.addEventListener('click', e => {
    const overlay = services.getBubbleOverlayElement();
    const conditionPanel = services.getBubbleConditionPanelElement();
    const { targetEl, bubble } = getBubbleClickTarget(e);
    logBubbleClick(e, targetEl, bubble, overlay);

    const fieldName = bubble ? bubble.textContent.trim() : '';
    const fieldState = bubble ? getBubbleFieldState(fieldName) : { isBuildable: false, isFilterable: false };
    if (shouldBlockBubbleOpen(e, bubble, fieldName, fieldState)) return;

    services.bubble.isBubbleAnimating = true;
    services.lockModalInput(600);

    const savedCategory = appState.currentCategory;
    services.bubbleDebugLog('click.open.start', { fieldName });
    const clone = createBubbleClone(bubble, fieldName);
    disableSourceBubble(bubble);
    const filterCard = prepareFilterCardForOpen();
    prepareBubblePanel({ bubble, fieldName, filterCard, overlay });

    const { targetWidth, targetHeight } = getBubbleTargetSize(filterCard);

    const morphDuration = Math.max(0.35, (targetWidth + targetHeight) / 1800);
    clone.style.setProperty('--morph-duration', `${morphDuration}s`);

    appState.currentCategory = savedCategory;
    updateCategoryButtons();

    if (isMobileBubbleEditorViewport()) {
      showMobileBubbleEditor({ clone, conditionPanel, filterCard, overlay, fieldName });
      return;
    }

    attachDesktopBubbleTransition({
      clone,
      conditionPanel,
      filterCard,
      fieldName,
      targetWidth,
      targetHeight,
      morphDuration
    });
    requestAnimationFrame(() => clone.classList.add('active-bubble'));

    restoreCloneOriginAfterRender(clone, fieldName);
    overlay?.classList.add('bubble-active');
    DOM.headerBar?.classList.add('header-hide');
  });

  document.addEventListener('mouseover', e => {
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    const bubble = targetEl ? targetEl.closest('.bubble') : null;
    if (!bubble) return;
    services.bubbleDebugLog('bubble.mouseover', {
      bubble: bubble.textContent ? bubble.textContent.trim() : null,
      targetTag: targetEl && targetEl.tagName,
      targetClass: targetEl && targetEl.className
    });
  });

  document.addEventListener('mouseout', e => {
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    const bubble = targetEl ? targetEl.closest('.bubble') : null;
    if (!bubble) return;
    const relatedEl = e.relatedTarget instanceof Element
      ? e.relatedTarget
      : e.relatedTarget && e.relatedTarget.parentElement;
    const stayedWithinBubble = !!(relatedEl && bubble.contains(relatedEl));
    services.bubbleDebugLog('bubble.mouseout', {
      bubble: bubble.textContent ? bubble.textContent.trim() : null,
      relatedTag: relatedEl && relatedEl.tagName,
      relatedClass: relatedEl && relatedEl.className,
      stayedWithinBubble
    });
  });

  return true;
}

registerBubbleInteractionService({
  initializeBubbles: initializeBubbleInteractions
});

let deferredSplitBubbleRender = 0;

function scheduleDeferredBubbleRender() {
  if (deferredSplitBubbleRender) {
    return;
  }

  const run = () => {
    deferredSplitBubbleRender = 0;
    services.rerenderBubbles();
  };

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    deferredSplitBubbleRender = window.requestIdleCallback(run, { timeout: 500 });
    return;
  }

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    deferredSplitBubbleRender = window.requestAnimationFrame(run);
    return;
  }

  deferredSplitBubbleRender = setTimeout(run, 0);
}

// Keep bubbles in sync with query state changes reactively.
QueryStateSubscriptions.subscribe(event => {
  if (event?.meta?.source === 'VirtualTable.setSplitMode') {
    scheduleDeferredBubbleRender();
    return;
  }
  services.rerenderBubbles();
}, { displayedFields: true, activeFilters: true });
