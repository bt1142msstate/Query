export function bindBubbleDocumentDragHandlers({
  document,
  window,
  dragDropManager,
  bubbleFieldDragMime,
  getLifecycleState,
  getDisplayedFields,
  isResizeModeActive,
  clearInsertAffordance,
  clearDropAnchor,
  isPointerWithinDropViewport
}) {
  document.addEventListener('dragstart', event => {
    if (getLifecycleState().queryRunning || isResizeModeActive()) {
      event.preventDefault();
      return;
    }
    clearInsertAffordance({ immediate: true });
    const bubble = event.target.closest('.bubble');
    if (!bubble) return;

    const fieldName = bubble.textContent.trim();
    if (getDisplayedFields().includes(fieldName)) {
      event.preventDefault();
      return;
    }

    dragDropManager.draggedBubble = bubble;
    dragDropManager.draggedBubbleOriginalRect = bubble.getBoundingClientRect();
    dragDropManager.dropSuccessful = false;

    event.dataTransfer.setData(bubbleFieldDragMime, fieldName);
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.dropEffect = 'move';
    dragDropManager.setBubbleDrag(true);

    const wrapper = document.createElement('div');
    const pad = 16;
    wrapper.style.position = 'absolute';
    wrapper.style.top = '-9999px';
    wrapper.style.left = '-9999px';
    wrapper.style.padding = pad / 2 + 'px';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.boxSizing = 'content-box';
    const ghost = bubble.cloneNode(true);
    ghost.style.overflow = 'visible';
    wrapper.appendChild(ghost);
    document.body.appendChild(wrapper);
    event.dataTransfer.setDragImage(wrapper, wrapper.offsetWidth / 2, wrapper.offsetHeight / 2);
    setTimeout(() => wrapper.remove(), 0);

    bubble.style.opacity = '0.3';
  });

  document.addEventListener('dragover', event => {
    if (document.body.classList.contains('dragging-cursor') && !dragDropManager.isBubbleDrag) {
      dragDropManager.lastDragX = event.clientX;
      dragDropManager.lastDragY = event.clientY;

      if (dragDropManager.activeTable && !isPointerWithinDropViewport(dragDropManager.activeTable, event.clientX, event.clientY)) {
        clearDropAnchor();
      }

      if (dragDropManager.scrollContainer) {
        dragDropManager.checkAutoScroll(event, dragDropManager.scrollContainer);
      }
    }

    if (dragDropManager.isBubbleDrag) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const margin = 50;
      const clampedX = Math.max(margin, Math.min(window.innerWidth - margin, event.clientX));
      const clampedY = Math.max(margin, Math.min(window.innerHeight - margin, event.clientY));

      dragDropManager.lastDragX = clampedX;
      dragDropManager.lastDragY = clampedY;

      if (dragDropManager.scrollContainer) {
        dragDropManager.checkAutoScroll(event, dragDropManager.scrollContainer);
      }
    }
  });

  document.addEventListener('drop', event => {
    if (dragDropManager.isBubbleDrag) {
      event.preventDefault();
    }
  });

  window.addEventListener('dragover', event => {
    if (dragDropManager.isBubbleDrag) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  }, { capture: true });

  window.addEventListener('drop', event => {
    if (dragDropManager.isBubbleDrag) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  }, { capture: true });

  document.addEventListener('dragend', event => {
    const bubble = event.target.closest('.bubble');
    if (bubble && dragDropManager.draggedBubble) {
      dragDropManager.setBubbleDrag(false);
      dragDropManager.stopAutoScroll();
      dragDropManager.activeTable = null;

      const fieldName = bubble.textContent.trim();
      const wasActuallyDropped = getDisplayedFields().includes(fieldName);

      if (!wasActuallyDropped && dragDropManager.draggedBubble && dragDropManager.draggedBubbleOriginalRect && !dragDropManager.isAnimating) {
        startReturnAnimation({ bubble, fieldName, dragDropManager, document, window });
      } else if (dragDropManager.draggedBubble) {
        dragDropManager.draggedBubble.style.opacity = '';
        dragDropManager.draggedBubble.style.visibility = '';
      }

      dragDropManager.draggedBubble = null;
      dragDropManager.draggedBubbleOriginalRect = null;
      dragDropManager.dropSuccessful = false;
      dragDropManager.lastDragX = 0;
      dragDropManager.lastDragY = 0;
      dragDropManager.isAnimating = false;
    }
  });
}

function startReturnAnimation({ bubble, fieldName, dragDropManager, document, window }) {
  dragDropManager.isAnimating = true;
  const originalRect = dragDropManager.draggedBubbleOriginalRect;
  const originalBubble = dragDropManager.draggedBubble;

  const returnClone = bubble.cloneNode(true);
  const rootStyles = getComputedStyle(document.documentElement);
  returnClone.style.position = 'fixed';
  returnClone.style.zIndex = rootStyles.getPropertyValue('--z-drag-ghost').trim() || '1000';
  returnClone.style.pointerEvents = 'none';
  returnClone.style.opacity = '1';
  returnClone.style.transition = 'transform 0.45s ease';
  returnClone.style.transform = 'translate(0, 0)';

  let startX = dragDropManager.lastDragX - 25;
  let startY = dragDropManager.lastDragY - 15;

  if (dragDropManager.lastDragX === 0 && dragDropManager.lastDragY === 0) {
    startX = window.innerWidth / 2 - 25;
    startY = window.innerHeight / 2 - 15;
  }

  const margin = 50;
  startX = Math.max(margin, Math.min(window.innerWidth - margin, startX));
  startY = Math.max(margin, Math.min(window.innerHeight - margin, startY));
  returnClone.style.top = startY + 'px';
  returnClone.style.left = startX + 'px';

  document.body.appendChild(returnClone);
  returnClone.offsetHeight;

  const deltaX = originalRect.left - startX;
  const deltaY = originalRect.top - startY;

  requestAnimationFrame(() => {
    returnClone.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
  });

  returnClone.addEventListener('transitionend', function cleanup() {
    returnClone.remove();
    originalBubble.style.opacity = '';
    dragDropManager.isAnimating = false;
  }, { once: true });

  setTimeout(() => {
    if (returnClone.parentNode) {
      returnClone.remove();
    }
    originalBubble.style.opacity = '';
    dragDropManager.isAnimating = false;
  }, 600);
}
