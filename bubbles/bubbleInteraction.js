import { QueryStateSubscriptions } from '../core/queryStateSubscriptions.js';
import { appServices } from '../core/appServices.js';
import { AppState, QueryChangeManager, QueryStateReaders } from '../core/queryState.js';
import { showToastMessage } from '../core/toast.js';
import { VisibilityUtils } from '../core/visibility.js';

var getFilterGroupForField = QueryStateReaders.getFilterGroupForField.bind(QueryStateReaders);
var getLifecycleState = QueryStateReaders.getLifecycleState.bind(QueryStateReaders);
var appState = AppState;
var services = appServices;
let bubbleEventsInitialized = false;

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

  const bubbleContainer = window.DOM.bubbleContainer;
  const scrollContainer = window.DOM.bubbleScrollbar;
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

  const thumb = window.DOM.bubbleScrollbarThumb;
  const track = window.DOM.bubbleScrollbarTrack;

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
    const container = window.DOM.bubbleContainer;
    const listDiv = window.DOM.bubbleList;
    const scrollCont = window.DOM.bubbleScrollbar;
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
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    const bubble = targetEl ? targetEl.closest('.bubble') : null;
    services.bubbleDebugLog('document.click', {
      rawTargetNodeType: e.target && e.target.nodeType,
      targetTag: targetEl && targetEl.tagName,
      targetClass: targetEl && targetEl.className,
      resolvedBubble: bubble ? bubble.textContent.trim() : null,
      hasActiveBubble: !!document.querySelector('.active-bubble, .bubble-clone'),
      isBubbleAnimating: !!services.bubble?.isBubbleAnimating,
      isOverlayOpen: !!(overlay && overlay.classList.contains('show'))
    });

    if (window.modalManager && window.modalManager.isInputLocked) {
      services.bubbleDebugLog('click.blocked.inputLocked');
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (!bubble) return;

    const fieldName = bubble.textContent.trim();
    const fieldDef = window.fieldDefs ? window.fieldDefs.get(fieldName) : null;
    const isBuildable = Boolean(fieldDef && fieldDef.is_buildable);
    const isFilterable = typeof window.isFieldBackendFilterable === 'function'
      ? window.isFieldBackendFilterable(fieldDef || fieldName)
      : Boolean(fieldDef && Array.isArray(fieldDef.filters) && fieldDef.filters.length > 0);

    if (!isBuildable && !isFilterable) {
      services.bubbleDebugLog('click.ignored.displayOnlyField', { fieldName });
      showToastMessage(`${fieldName} is display-only and does not support filters.`, 'warning');
      return;
    }

    if (getLifecycleState().queryRunning) {
      services.bubbleDebugLog('click.blocked.queryRunning', { bubble: bubble.textContent.trim() });
      showToastMessage('Cannot edit conditions while a query is running', 'warning');
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    if (document.querySelector('.active-bubble, .bubble-clone')) {
      services.bubbleDebugLog('click.blocked.activeBubbleAlreadyOpen', { bubble: bubble.textContent.trim() });
      return;
    }
    if (services.bubble?.isBubbleAnimating) {
      services.bubbleDebugLog('click.blocked.isBubbleAnimating', { bubble: bubble.textContent.trim() });
      return;
    }
    services.bubble.isBubbleAnimating = true;
    services.lockModalInput(600);

    const savedCategory = appState.currentCategory;
    const rect = bubble.getBoundingClientRect();
    services.bubbleDebugLog('click.open.start', { fieldName });
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
    bubble.classList.add('bubble-disabled');
    bubble.style.opacity = '0';
    bubble.dataset.filterFor = bubble.textContent.trim();

    let filterCard = services.getBubbleFilterCardElement();
    if (filterCard && !window.DOM?.filterCard) {
      document.body.appendChild(filterCard);
      filterCard.offsetHeight;
    }
    if (!window.filterCard && filterCard) {
      window.filterCard = filterCard;
    }
    if (filterCard) {
      services.prepareBubbleFilterCardForOpen(filterCard);
    }

    if (overlay) {
      overlay.classList.add('show');
    }
    VisibilityUtils.acquireRaisedUi('bubble-editor');
    services.buildBubbleConditionPanel(bubble);

    const inputWrapper = services.getBubbleInputWrapperElement() || (filterCard ? filterCard.querySelector('#condition-input-wrapper') : null);
    if (filterCard) {
      const titleEl = services.getBubbleFilterCardTitleElement(filterCard);
      if (titleEl) titleEl.textContent = fieldName;
    }
    if (window.renderConditionList) {
      window.renderConditionList(fieldName);
    }
    if (inputWrapper && getFilterGroupForField(fieldName)) {
      inputWrapper.classList.add('show');
    }

    let targetWidth = 480;
    let targetHeight = 350;
    if (filterCard) {
      const fcRect = filterCard.getBoundingClientRect();
      if (fcRect.width > 0) targetWidth = fcRect.width;
      if (fcRect.height > 0) targetHeight = fcRect.height;
    }

    const morphDuration = Math.max(0.35, (targetWidth + targetHeight) / 1800);
    clone.style.setProperty('--morph-duration', `${morphDuration}s`);

    appState.currentCategory = savedCategory;
    window.DOM.categoryBar?.querySelectorAll('.category-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.category === appState.currentCategory)
    );

    clone.addEventListener('transitionend', function t(e) {
      services.bubbleDebugLog('clone.transitionend', {
        fieldName,
        propertyName: e.propertyName,
        enlarged: clone.classList.contains('enlarge-bubble')
      });
      if (!clone.classList.contains('enlarge-bubble')) {
        if (e.propertyName === 'top' || e.propertyName === 'left' || e.propertyName === 'transform') {
          requestAnimationFrame(() => {
            clone.classList.add('enlarge-bubble');
            clone.style.setProperty('width', `${targetWidth}px`, 'important');
            clone.style.setProperty('height', `${targetHeight}px`, 'important');
          });
        }
        return;
      }

      if (e.propertyName !== 'width' && e.propertyName !== 'height') return;

      if (conditionPanel) {
        conditionPanel.classList.add('show');
      }
      if (filterCard) {
        const scrollDelay = Math.max(220, Math.min(320, Math.round(morphDuration * 320)));
        services.markBubbleFilterCardOpen(filterCard, { scrollReadyDelay: scrollDelay })
          || filterCard.classList.add('show', 'content-ready');
      }

      clone.classList.add('popping');
      window.createBubblePopParticles(clone);

      clone.removeEventListener('transitionend', t);
      services.bubble.isBubbleAnimating = false;
      services.bubbleDebugLog('click.open.complete', { fieldName });
    });
    requestAnimationFrame(() => clone.classList.add('active-bubble'));

    setTimeout(() => {
      if (!document.body.contains(clone._origin)) {
        let baseFieldName = fieldName;
        const fieldDef = window.fieldDefs ? window.fieldDefs.get(fieldName) : null;
        if (fieldDef && fieldDef.special_payload) {
          baseFieldName = fieldDef.category;
        }

        const fallbackBubble = Array.from(document.querySelectorAll('.bubble')).find(b => b.textContent.trim() === baseFieldName);
        if (fallbackBubble) clone._origin = fallbackBubble;
      }
    }, 60);
    if (clone && overlay) overlay.classList.add('bubble-active');
    const headerBar = window.DOM.headerBar;
    if (clone && headerBar) headerBar.classList.add('header-hide');
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

window.BubbleInteraction = {
  initializeBubbles: initializeBubbleInteractions
};

// Keep bubbles in sync with query state changes reactively.
QueryStateSubscriptions.subscribe(() => {
  services.rerenderBubbles();
}, { displayedFields: true, activeFilters: true });
