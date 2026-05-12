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
const TOUCH_HOLD_DELAY = 140;

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
    clearHoldTimer();
    dragState = null;

    element.classList.remove('fp-reorder-armed', 'fp-dragging');
    document.body.classList.remove('dragging-cursor');
    clearReorderIndicators(container, itemSelector);
    if (pointerCaptured) {
      releasePointer(element, pointerId);
    }

    if (completedDrag && target && target !== element) {
      event?.preventDefault?.();
      onMove(target, insertAfter);
    }
  }

  element.addEventListener('pointerdown', event => {
    if ((event.button ?? 0) !== 0 || isInteractiveTarget(event.target, interactiveSelector)) {
      return;
    }

    clearHoldTimer();
    const isTouch = event.pointerType === 'touch' || event.pointerType === 'pen';
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      isTouch,
      armed: !isTouch,
      dragging: false,
      pointerCaptured: false,
      target: null,
      insertAfter: false,
      holdTimerId: null
    };

    if (!isTouch) {
      dragState.pointerCaptured = capturePointer(element, event.pointerId);
    }

    if (isTouch) {
      dragState.holdTimerId = window.setTimeout(() => {
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }
        dragState.armed = true;
        dragState.pointerCaptured = capturePointer(element, event.pointerId) || dragState.pointerCaptured;
        dragState.holdTimerId = null;
        element.classList.add('fp-reorder-armed');
      }, TOUCH_HOLD_DELAY);
    }
  });

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
        clearHoldTimer();
        cleanup(event);
      } else if (distance > threshold) {
        clearHoldTimer();
      }
      return;
    }

    if (!dragState.dragging) {
      if (distance < threshold) {
        return;
      }
      dragState.pointerCaptured = capturePointer(element, event.pointerId) || dragState.pointerCaptured;
      dragState.dragging = true;
      element.classList.add('fp-dragging');
      document.body.classList.add('dragging-cursor');
    }

    event.preventDefault();
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
