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

function clearReorderIndicators(container, itemSelector, options = {}) {
  container?.querySelectorAll?.(itemSelector)?.forEach(item => {
    item.classList.remove('fp-drag-over-top', 'fp-drag-over-bottom', 'fp-drop-target');
  });
  const anchor = container?.ownerDocument?.querySelector?.('.fp-drop-anchor');
  if (options.removeAnchor) {
    anchor?.remove?.();
  } else if (anchor) {
    anchor.style.display = 'none';
  }
}

function getInsertAfter(target, clientY) {
  const rect = target.getBoundingClientRect();
  return clientY >= rect.top + rect.height / 2;
}

function isNoOpDrop(container, itemSelector, draggedElement, target, insertAfter) {
  const items = Array.from(container?.querySelectorAll?.(itemSelector) || []);
  const sourceIndex = items.indexOf(draggedElement);
  const targetIndex = items.indexOf(target);
  if (sourceIndex === -1 || targetIndex === -1) {
    return false;
  }

  return (
    (sourceIndex < targetIndex && insertAfter === false && targetIndex === sourceIndex + 1)
    || (sourceIndex > targetIndex && insertAfter === true && targetIndex === sourceIndex - 1)
  );
}

function findNearestDropPlacement(container, itemSelector, draggedElement, clientX, clientY) {
  const documentRef = container?.ownerDocument || globalThis.document;
  const directTarget = documentRef
    .elementFromPoint(clientX, clientY)
    ?.closest?.(itemSelector);
  const candidates = [];
  const seen = new Set();

  function addCandidate(candidate) {
    if (!candidate || candidate === draggedElement || !container.contains(candidate) || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    candidates.push(candidate);
  }

  addCandidate(directTarget);
  Array.from(container.querySelectorAll(itemSelector))
    .filter(candidate => candidate !== draggedElement && !seen.has(candidate))
    .map(candidate => {
      const rect = candidate.getBoundingClientRect();
      const clampedX = Math.max(rect.left, Math.min(clientX, rect.right));
      const clampedY = Math.max(rect.top, Math.min(clientY, rect.bottom));
      return {
        candidate,
        distance: Math.hypot(clientX - clampedX, clientY - clampedY)
      };
    })
    .sort((left, right) => left.distance - right.distance)
    .forEach(({ candidate }) => addCandidate(candidate));

  for (let index = 0; index < candidates.length; index += 1) {
    const target = candidates[index];
    const insertAfter = getInsertAfter(target, clientY);
    if (!isNoOpDrop(container, itemSelector, draggedElement, target, insertAfter)) {
      return { insertAfter, target };
    }
  }

  return null;
}

function getScrollableParent(element) {
  let node = element?.parentElement || null;
  const documentRef = element?.ownerDocument || globalThis.document;
  while (node && node !== documentRef.body) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/u.test(`${style.overflowY} ${style.overflow}`) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return documentRef.scrollingElement || documentRef.documentElement;
}

function createDragPreview(element, rect) {
  const documentRef = element?.ownerDocument || globalThis.document;
  const preview = element.cloneNode(true);
  preview.classList.add('fp-drag-preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  documentRef.body.appendChild(preview);
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

function ensureDropAnchor(documentRef) {
  let anchor = documentRef.querySelector('.fp-drop-anchor');
  if (!anchor) {
    anchor = documentRef.createElement('div');
    anchor.className = 'fp-drop-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    documentRef.body.appendChild(anchor);
  }
  return anchor;
}

function updateDropAnchor(container, target, insertAfter) {
  const documentRef = container?.ownerDocument || globalThis.document;
  const anchor = ensureDropAnchor(documentRef);
  const targetRect = target.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const horizontalInset = Math.min(10, Math.max(0, containerRect.width * 0.04));
  const left = Math.max(containerRect.left + horizontalInset, targetRect.left);
  const right = Math.min(containerRect.right - horizontalInset, targetRect.right);
  const top = insertAfter ? targetRect.bottom : targetRect.top;

  anchor.style.left = `${Math.round(left)}px`;
  anchor.style.top = `${Math.round(top)}px`;
  anchor.style.width = `${Math.max(32, Math.round(right - left))}px`;
  anchor.style.display = 'block';
  return anchor;
}

function autoScrollWhileDragging(dragState, event) {
  const scrollParent = dragState.scrollParent;
  if (!scrollParent) {
    return;
  }

  const documentRef = dragState.document || globalThis.document;
  const windowRef = documentRef.defaultView || globalThis.window;
  const isDocumentScroller = scrollParent === documentRef.scrollingElement || scrollParent === documentRef.documentElement;
  const rect = isDocumentScroller
    ? { top: 0, bottom: windowRef.innerHeight }
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
  let suppressNextClick = false;

  const documentRef = element.ownerDocument || globalThis.document;
  const windowRef = documentRef.defaultView || globalThis.window;
  const listenerOptions = { capture: true };
  let documentListenersAttached = false;

  function clearHoldTimer() {
    if (dragState?.holdTimerId) {
      window.clearTimeout(dragState.holdTimerId);
      dragState.holdTimerId = null;
    }
  }

  function attachDocumentListeners() {
    if (documentListenersAttached) {
      return;
    }
    documentListenersAttached = true;
    documentRef.addEventListener('pointermove', handlePointerMove, listenerOptions);
    documentRef.addEventListener('pointerup', cleanup, listenerOptions);
    documentRef.addEventListener('pointercancel', cleanup, listenerOptions);
    windowRef?.addEventListener?.('blur', cleanupWithoutPointer, listenerOptions);
  }

  function detachDocumentListeners() {
    if (!documentListenersAttached) {
      return;
    }
    documentListenersAttached = false;
    documentRef.removeEventListener('pointermove', handlePointerMove, listenerOptions);
    documentRef.removeEventListener('pointerup', cleanup, listenerOptions);
    documentRef.removeEventListener('pointercancel', cleanup, listenerOptions);
    windowRef?.removeEventListener?.('blur', cleanupWithoutPointer, listenerOptions);
  }

  function cleanupWithoutPointer() {
    cleanup();
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
    detachDocumentListeners();

    element.classList.remove('fp-reorder-armed', 'fp-dragging');
    documentRef.body.classList.remove('dragging-cursor');
    clearReorderIndicators(container, itemSelector, { removeAnchor: true });
    dragPreview?.remove?.();
    if (pointerCaptured) {
      releasePointer(element, pointerId);
    }

    if (completedDrag) {
      suppressNextClick = true;
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

    cleanup();
    clearHoldTimer();
    const isTouch = event.pointerType === 'touch' || event.pointerType === 'pen';
    dragState = {
      document: documentRef,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      isTouch,
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
    attachDocumentListeners();

    if (!isTouch) {
      dragState.pointerCaptured = capturePointer(element, event.pointerId);
    } else {
      dragState.pointerCaptured = capturePointer(element, event.pointerId);
      dragState.scrollParent = getScrollableParent(container);
    }

    if (isTouch) {
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
    documentRef.body.classList.add('dragging-cursor');
    updateDragPreview(dragState, event);
  }

  function handlePointerMove(event) {
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
    const placement = findNearestDropPlacement(container, itemSelector, element, event.clientX, event.clientY);
    const target = placement?.target || dragState.target;
    const insertAfter = placement?.target ? placement.insertAfter : dragState.insertAfter;
    clearReorderIndicators(container, itemSelector);

    if (!target) {
      dragState.target = null;
      dragState.insertAfter = false;
      return;
    }

    target.classList.toggle('fp-drag-over-bottom', insertAfter);
    target.classList.toggle('fp-drag-over-top', !insertAfter);
    target.classList.add('fp-drop-target');
    updateDropAnchor(container, target, insertAfter);
    dragState.target = target;
    dragState.insertAfter = insertAfter;
  }

  element.addEventListener('click', event => {
    if (!suppressNextClick) {
      return;
    }
    suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

export { attachPointerReorder, clearReorderIndicators };
