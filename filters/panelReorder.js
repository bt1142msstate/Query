const DEFAULT_INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '.fp-display-actions',
  '.fp-display-insert',
  '.fp-cond-actions',
  '.fp-cond-text-clickable',
  '.fp-add-cond-btn'
].join(', ');

const DESKTOP_DRAG_THRESHOLD = 5;
const TOUCH_DRAG_THRESHOLD = 7;
const TOUCH_HOLD_DELAY = 90;
const EDGE_SCROLL_ZONE = 64;
const MAX_EDGE_SCROLL_STEP = 18;

function isInteractiveTarget(target, interactiveSelector = DEFAULT_INTERACTIVE_SELECTOR) {
  return Boolean(target?.closest?.(interactiveSelector));
}

function clearReorderIndicators(container, itemSelector) {
  container?.querySelectorAll?.(itemSelector)?.forEach(item => {
    item.classList.remove('fp-drag-over-top', 'fp-drag-over-bottom');
  });
}

function getInsertAfter(target, clientY) {
  const rect = target.getBoundingClientRect();
  return clientY >= rect.top + rect.height / 2;
}

function findNearestReorderTarget(container, itemSelector, draggedElement, clientX, clientY) {
  const directTarget = document
    .elementFromPoint(clientX, clientY)
    ?.closest?.(itemSelector);

  if (directTarget && directTarget !== draggedElement && container.contains(directTarget)) {
    return directTarget;
  }

  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  container.querySelectorAll(itemSelector).forEach(candidate => {
    if (candidate === draggedElement) {
      return;
    }

    const rect = candidate.getBoundingClientRect();
    const clampedX = Math.max(rect.left, Math.min(clientX, rect.right));
    const clampedY = Math.max(rect.top, Math.min(clientY, rect.bottom));
    const distance = Math.hypot(clientX - clampedX, clientY - clampedY);

    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  });

  return nearest;
}

function getScrollableParent(element) {
  let node = element?.parentElement || null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/u.test(`${style.overflowY} ${style.overflow}`) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function createDragPreview(element, rect) {
  const preview = element.cloneNode(true);
  preview.classList.add('fp-drag-preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  document.body.appendChild(preview);
  return preview;
}

function updateDragPreview(dragState, event) {
  if (!dragState.dragPreview) {
    return;
  }

  const left = event.clientX - dragState.dragOffsetX;
  const top = event.clientY - dragState.dragOffsetY;
  dragState.dragPreview.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

function autoScrollWhileDragging(dragState, event) {
  const scrollParent = dragState.scrollParent;
  if (!scrollParent) {
    return;
  }

  const isDocumentScroller = scrollParent === document.scrollingElement || scrollParent === document.documentElement;
  const rect = isDocumentScroller
    ? { top: 0, bottom: window.innerHeight }
    : scrollParent.getBoundingClientRect();

  let scrollStep = 0;
  if (event.clientY < rect.top + EDGE_SCROLL_ZONE) {
    const intensity = (rect.top + EDGE_SCROLL_ZONE - event.clientY) / EDGE_SCROLL_ZONE;
    scrollStep = -Math.ceil(Math.min(1, intensity) * MAX_EDGE_SCROLL_STEP);
  } else if (event.clientY > rect.bottom - EDGE_SCROLL_ZONE) {
    const intensity = (event.clientY - (rect.bottom - EDGE_SCROLL_ZONE)) / EDGE_SCROLL_ZONE;
    scrollStep = Math.ceil(Math.min(1, intensity) * MAX_EDGE_SCROLL_STEP);
  }

  if (scrollStep !== 0) {
    scrollParent.scrollTop += scrollStep;
  }
}

function capturePointer(element, pointerId) {
  try {
    if (typeof element.setPointerCapture !== 'function') {
      return false;
    }
    element.setPointerCapture(pointerId);
    return true;
  } catch (_) {
    // Pointer capture is optional in older embedded browsers.
    return false;
  }
}

function releasePointer(element, pointerId) {
  try {
    element.releasePointerCapture?.(pointerId);
  } catch (_) {
    // Pointer capture may already be released after pointercancel.
  }
}

function attachPointerReorder({
  element,
  container,
  itemSelector,
  onMove,
  interactiveSelector = DEFAULT_INTERACTIVE_SELECTOR
}) {
  if (!element || !container || typeof onMove !== 'function') {
    return;
  }

  let dragState = null;

  function clearHoldTimer() {
    if (dragState?.holdTimerId) {
      window.clearTimeout(dragState.holdTimerId);
      dragState.holdTimerId = null;
    }
  }

  function cleanup(event) {
    if (!dragState || (event && event.pointerId !== dragState.pointerId)) {
      return;
    }

    const completedDrag = dragState.dragging;
    const target = dragState.target;
    const insertAfter = dragState.insertAfter;
    const pointerId = dragState.pointerId;
    const pointerCaptured = dragState.pointerCaptured;
    const dragPreview = dragState.dragPreview;
    clearHoldTimer();
    dragState = null;

    element.classList.remove('fp-reorder-armed', 'fp-dragging');
    document.body.classList.remove('dragging-cursor');
    clearReorderIndicators(container, itemSelector);
    dragPreview?.remove?.();
    if (pointerCaptured) {
      releasePointer(element, pointerId);
    }

    if (completedDrag && target && target !== element) {
      event?.preventDefault?.();
      onMove(target, insertAfter);
    }
  }

  element.addEventListener('pointerdown', event => {
    const isTouch = event.pointerType === 'touch' || event.pointerType === 'pen';
    const startsOnInteractive = isInteractiveTarget(event.target, interactiveSelector);
    if ((event.button ?? 0) !== 0 || (!isTouch && startsOnInteractive)) {
      return;
    }

    clearHoldTimer();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      isTouch,
      startsOnInteractive,
      armed: !isTouch,
      dragging: false,
      scrolling: false,
      pointerCaptured: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
      dragPreview: null,
      scrollParent: null,
      target: null,
      insertAfter: false,
      holdTimerId: null
    };

    if (!isTouch) {
      dragState.pointerCaptured = capturePointer(element, event.pointerId);
    } else {
      dragState.pointerCaptured = capturePointer(element, event.pointerId);
      dragState.scrollParent = getScrollableParent(container);
    }

    if (isTouch && !startsOnInteractive) {
      dragState.holdTimerId = window.setTimeout(() => {
        if (!dragState || dragState.pointerId !== event.pointerId || dragState.scrolling) {
          return;
        }
        dragState.armed = true;
        dragState.pointerCaptured = capturePointer(element, event.pointerId) || dragState.pointerCaptured;
        dragState.holdTimerId = null;
        element.classList.add('fp-reorder-armed');
      }, TOUCH_HOLD_DELAY);
    }
  });

  function startDragging(event) {
    if (!dragState || dragState.dragging) {
      return;
    }

    const rect = element.getBoundingClientRect();
    dragState.pointerCaptured = capturePointer(element, event.pointerId) || dragState.pointerCaptured;
    dragState.dragging = true;
    dragState.dragOffsetX = event.clientX - rect.left;
    dragState.dragOffsetY = event.clientY - rect.top;
    dragState.scrollParent = getScrollableParent(element);
    dragState.dragPreview = createDragPreview(element, rect);
    element.classList.add('fp-dragging');
    document.body.classList.add('dragging-cursor');
    updateDragPreview(dragState, event);
  }

  element.addEventListener('pointermove', event => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const distance = Math.hypot(deltaX, deltaY);
    const threshold = dragState.isTouch ? TOUCH_DRAG_THRESHOLD : DESKTOP_DRAG_THRESHOLD;

    if (dragState.isTouch && !dragState.armed && !dragState.dragging) {
      if (Math.abs(deltaY) > threshold && Math.abs(deltaY) >= Math.abs(deltaX)) {
        dragState.scrolling = true;
        clearHoldTimer();
        if (dragState.scrollParent) {
          dragState.scrollParent.scrollTop += dragState.lastY - event.clientY;
        }
        dragState.lastY = event.clientY;
        event.preventDefault();
      } else if (distance > threshold) {
        clearHoldTimer();
      }
      return;
    }

    if (!dragState.dragging) {
      if (distance < threshold) {
        return;
      }
      startDragging(event);
    }

    event.preventDefault();
    updateDragPreview(dragState, event);
    autoScrollWhileDragging(dragState, event);
    const target = findNearestReorderTarget(container, itemSelector, element, event.clientX, event.clientY);
    clearReorderIndicators(container, itemSelector);

    if (!target) {
      dragState.target = null;
      dragState.insertAfter = false;
      return;
    }

    const insertAfter = getInsertAfter(target, event.clientY);
    target.classList.toggle('fp-drag-over-bottom', insertAfter);
    target.classList.toggle('fp-drag-over-top', !insertAfter);
    dragState.target = target;
    dragState.insertAfter = insertAfter;
  });

  element.addEventListener('pointerup', cleanup);
  element.addEventListener('pointercancel', cleanup);
}

export { attachPointerReorder, clearReorderIndicators, getInsertAfter };
