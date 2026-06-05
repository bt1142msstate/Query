export function createDragDropHeaderInsertAffordance({
  document,
  window,
  getLifecycleState,
  getHeaderInsertPosition,
  isResizeModeActive,
  isDragging
}) {
  const insertButton = document.createElement('button');
  insertButton.type = 'button';
  insertButton.className = 'th-insert-button';
  insertButton.setAttribute('aria-label', 'Insert field at this position');
  insertButton.setAttribute('data-tooltip', 'Add field here');
  insertButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M19 11H13V5h-2v6H5v2h6v6h2v-6h6z"/>
    </svg>
  `;

  const root = document.createElement('div');
  root.className = 'th-insert-affordance';
  root.appendChild(insertButton);

  let showTimer = null;
  let hideTimer = null;
  let pendingCandidate = null;

  function applyPosition(candidate) {
    root.dataset.insertAt = String(candidate.insertAt);
    root.style.left = `${candidate.boundaryX + window.scrollX}px`;
    root.style.top = `${candidate.top + (candidate.height / 2) + window.scrollY}px`;
  }

  function show(candidate) {
    if (!candidate) return;

    clearTimeout(hideTimer);
    applyPosition(candidate);

    if (!root.parentNode) {
      document.body.appendChild(root);
    }

    window.requestAnimationFrame(() => {
      root.classList.add('is-visible');
    });
  }

  function clear(options = {}) {
    const immediate = options.immediate === true;
    clearTimeout(showTimer);
    pendingCandidate = null;
    root.removeAttribute('data-insert-at');

    if (!root.parentNode) {
      return;
    }

    root.classList.remove('is-visible');

    clearTimeout(hideTimer);
    if (immediate) {
      root.parentNode.removeChild(root);
      return;
    }

    hideTimer = window.setTimeout(() => {
      if (root.parentNode && !root.classList.contains('is-visible')) {
        root.parentNode.removeChild(root);
      }
    }, 160);
  }

  function update(table, clientX) {
    if (!table || getLifecycleState().queryRunning || isDragging() || isResizeModeActive()) {
      clear({ immediate: true });
      return;
    }

    const candidate = getHeaderInsertPosition(table, clientX);
    if (!candidate) {
      clear();
      return;
    }

    const currentInsertAt = Number.parseInt(root.dataset.insertAt || '', 10);
    const hasVisibleAffordance = root.parentNode && root.classList.contains('is-visible');

    if (hasVisibleAffordance && currentInsertAt === candidate.insertAt) {
      clearTimeout(hideTimer);
      applyPosition(candidate);
      return;
    }

    pendingCandidate = candidate;
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    if (pendingCandidate && pendingCandidate.insertAt === candidate.insertAt) {
      show(candidate);
    }
  }

  function getInsertAt() {
    return Number.parseInt(root.dataset.insertAt || '', 10);
  }

  function contains(target) {
    return root.contains(target);
  }

  return {
    root,
    insertButton,
    clear,
    contains,
    getInsertAt,
    update
  };
}
