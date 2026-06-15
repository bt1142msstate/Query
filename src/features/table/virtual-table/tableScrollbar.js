const TABLE_SCROLLBAR_MIN_THUMB_HEIGHT = 40;
const TABLE_SCROLLBAR_FALLBACK_SIZE = 12;

function clampScrollTop(value, maxScroll) {
  return Math.max(0, Math.min(Number(value) || 0, maxScroll));
}

function getMaxScroll(container) {
  if (!container) return 0;
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

function getHeaderOffset(container) {
  const header = container?.querySelector('#example-table thead');
  if (header) {
    return Math.max(0, Math.ceil(header.getBoundingClientRect().height));
  }

  const cssValue = getComputedStyle(document.documentElement)
    .getPropertyValue('--table-header-height')
    .trim();
  return Math.max(0, parseFloat(cssValue) || 0);
}

function getHorizontalGutter(container) {
  if (!container || container.scrollWidth <= container.clientWidth) {
    return 0;
  }

  const cssValue = getComputedStyle(container)
    .getPropertyValue('--table-scrollbar-size')
    .trim();
  return Math.max(0, parseFloat(cssValue) || TABLE_SCROLLBAR_FALLBACK_SIZE);
}

export function createTableScrollbarController(options = {}) {
  let elements = null;
  let isDragging = false;
  let layoutMetrics = null;
  let pendingDragScrollTop = null;
  let pendingGeometryRefresh = false;
  let scrollDragFrame = 0;
  let syncFrame = 0;
  const getRowHeight = typeof options.getRowHeight === 'function'
    ? options.getRowHeight
    : () => 42;

  function handleResize() {
    scheduleSync({ refreshGeometry: true });
  }

  function updateAria(container, track, maxScroll = getMaxScroll(container)) {
    track.setAttribute('aria-valuemax', String(Math.round(maxScroll)));
    track.setAttribute('aria-valuenow', String(Math.round(container.scrollTop)));
  }

  function readLayoutMetrics(container, host, track, thumb) {
    const maxScroll = getMaxScroll(container);
    const headerOffset = getHeaderOffset(container);
    const horizontalGutter = getHorizontalGutter(container);
    const hostRect = host.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    track.style.top = `${Math.max(0, containerRect.top - hostRect.top + headerOffset)}px`;
    track.style.right = `${Math.max(0, hostRect.right - containerRect.right)}px`;
    track.style.bottom = `${Math.max(0, hostRect.bottom - containerRect.bottom + horizontalGutter)}px`;

    const trackHeight = Math.max(0, container.clientHeight - headerOffset - horizontalGutter);
    const thumbHeight = Math.min(
      trackHeight,
      Math.max(TABLE_SCROLLBAR_MIN_THUMB_HEIGHT, Math.round((container.clientHeight / container.scrollHeight) * trackHeight))
    );
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    thumb.style.height = `${thumbHeight}px`;

    return {
      maxScroll,
      maxThumbTop,
      thumbHeight,
      trackHeight,
      trackTop: containerRect.top + headerOffset
    };
  }

  function applyThumbPosition(scrollTop) {
    const thumb = elements?.thumb;
    const metrics = layoutMetrics;
    if (!thumb || !metrics) return;

    const thumbTop = metrics.maxScroll > 0
      ? (scrollTop / metrics.maxScroll) * metrics.maxThumbTop
      : 0;
    thumb.style.transform = `translate3d(0, ${Math.round(thumbTop)}px, 0)`;
  }

  function sync(options = {}) {
    syncFrame = 0;
    const shouldRefreshGeometry = options.refreshGeometry === true;

    const container = elements?.container;
    const host = elements?.host;
    const track = elements?.track;
    const thumb = elements?.thumb;
    if (!container || !host || !track || !thumb) return null;

    const maxScroll = shouldRefreshGeometry || !layoutMetrics
      ? getMaxScroll(container)
      : layoutMetrics.maxScroll;
    const shouldShowScrollbar = maxScroll > 1;
    container.classList.toggle('has-vertical-scroll', shouldShowScrollbar);
    track.classList.toggle('is-visible', shouldShowScrollbar);
    updateAria(container, track, maxScroll);

    if (!shouldShowScrollbar) {
      layoutMetrics = null;
      thumb.style.height = '';
      thumb.style.transform = '';
      return null;
    }

    const metrics = shouldRefreshGeometry || !layoutMetrics
      ? readLayoutMetrics(container, host, track, thumb)
      : layoutMetrics;
    layoutMetrics = metrics;
    applyThumbPosition(container.scrollTop);
    return metrics;
  }

  function scheduleSync(options = {}) {
    pendingGeometryRefresh = pendingGeometryRefresh || options.refreshGeometry === true;
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(() => {
      const refreshGeometry = pendingGeometryRefresh;
      pendingGeometryRefresh = false;
      sync({ refreshGeometry });
    });
  }

  function scrollFromPointer(clientY) {
    const container = elements?.container;
    const track = elements?.track;
    const thumb = elements?.thumb;
    if (!container || !track || !thumb) return;

    const metrics = sync({ refreshGeometry: !layoutMetrics });
    if (!metrics) return;

    const maxThumbTop = Math.max(1, metrics.maxThumbTop);
    const localThumbTop = Math.max(0, Math.min(clientY - metrics.trackTop - (metrics.thumbHeight / 2), maxThumbTop));
    const nextScrollTop = (localThumbTop / maxThumbTop) * metrics.maxScroll;
    container.scrollTop = nextScrollTop;
    applyThumbPosition(nextScrollTop);
  }

  function flushPendingDragScroll() {
    const container = elements?.container;
    const maxScroll = layoutMetrics?.maxScroll ?? getMaxScroll(container);
    if (!container || pendingDragScrollTop === null) return;

    const nextScrollTop = clampScrollTop(pendingDragScrollTop, maxScroll);
    pendingDragScrollTop = null;
    container.scrollTop = nextScrollTop;
    applyThumbPosition(nextScrollTop);
    updateAria(container, elements.track, maxScroll);
  }

  function queueDragScroll(nextScrollTop) {
    pendingDragScrollTop = nextScrollTop;
    if (scrollDragFrame) return;

    scrollDragFrame = requestAnimationFrame(() => {
      scrollDragFrame = 0;
      flushPendingDragScroll();
    });
  }

  function handleKeydown(event) {
    const container = elements?.container;
    if (!container) return;

    const scrollBy = amount => {
      container.scrollTop += amount;
      event.preventDefault();
    };

    switch (event.key) {
      case 'ArrowUp':
        scrollBy(-getRowHeight());
        break;
      case 'ArrowDown':
        scrollBy(getRowHeight());
        break;
      case 'PageUp':
        scrollBy(-container.clientHeight);
        break;
      case 'PageDown':
        scrollBy(container.clientHeight);
        break;
      case 'Home':
        container.scrollTop = 0;
        event.preventDefault();
        break;
      case 'End':
        container.scrollTop = getMaxScroll(container);
        event.preventDefault();
        break;
      default:
        break;
    }
  }

  function handlePointerDown(event) {
    const container = elements?.container;
    const track = elements?.track;
    const thumb = elements?.thumb;
    if (!container || !track || !thumb || event.button !== 0) return;

    event.preventDefault();
    isDragging = true;
    track.classList.add('is-dragging');
    track.setPointerCapture?.(event.pointerId);

    const metrics = sync({ refreshGeometry: true });
    const maxScroll = metrics?.maxScroll ?? getMaxScroll(container);
    const maxThumbTop = Math.max(1, metrics?.maxThumbTop ?? 1);
    const startY = event.clientY;
    let startScrollTop = container.scrollTop;

    if (event.target !== thumb) {
      scrollFromPointer(event.clientY);
      startScrollTop = container.scrollTop;
    }

    const handlePointerMove = moveEvent => {
      if (moveEvent.pointerId !== event.pointerId) return;
      moveEvent.preventDefault();
      const nextScrollTop = startScrollTop + ((moveEvent.clientY - startY) / maxThumbTop) * maxScroll;
      queueDragScroll(nextScrollTop);
    };

    const handlePointerUp = upEvent => {
      if (upEvent.pointerId !== event.pointerId) return;
      if (scrollDragFrame) {
        cancelAnimationFrame(scrollDragFrame);
        scrollDragFrame = 0;
      }
      flushPendingDragScroll();
      isDragging = false;
      track.classList.remove('is-dragging');
      track.releasePointerCapture?.(event.pointerId);
      scheduleSync();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }

  function attach(container) {
    if (!container) return;

    const host = container.closest('#table-shell') || container.parentElement || container;
    const existingTrack = host.querySelector('.table-scrollbar');
    if (elements?.container === container && existingTrack) {
      scheduleSync({ refreshGeometry: true });
      return;
    }

    if (elements?.track) {
      elements.track.removeEventListener('pointerdown', handlePointerDown);
      elements.track.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('resize', handleResize);
      if (elements.track !== existingTrack) {
        elements.track.remove();
      }
    }

    const track = existingTrack || document.createElement('div');
    const thumb = track.querySelector('.table-scrollbar-thumb') || document.createElement('div');

    track.className = 'table-scrollbar';
    track.setAttribute('role', 'scrollbar');
    track.setAttribute('aria-controls', 'table-container');
    track.setAttribute('aria-label', 'Results table vertical scroll');
    track.setAttribute('aria-orientation', 'vertical');
    track.setAttribute('aria-valuemin', '0');
    track.tabIndex = 0;

    thumb.className = 'table-scrollbar-thumb';
    if (!thumb.parentElement) track.appendChild(thumb);
    if (!track.parentElement) host.appendChild(track);

    track.addEventListener('pointerdown', handlePointerDown);
    track.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleResize);
    container.classList.add('table-scrollbar-enhanced');
    elements = { container, host, track, thumb };
    layoutMetrics = null;
    scheduleSync({ refreshGeometry: true });
  }

  function remove() {
    if (syncFrame) {
      cancelAnimationFrame(syncFrame);
      syncFrame = 0;
    }
    if (scrollDragFrame) {
      cancelAnimationFrame(scrollDragFrame);
      scrollDragFrame = 0;
    }

    if (elements?.track) {
      elements.track.removeEventListener('pointerdown', handlePointerDown);
      elements.track.removeEventListener('keydown', handleKeydown);
      elements.track.remove();
    }
    window.removeEventListener('resize', handleResize);

    elements?.container?.classList.remove('has-vertical-scroll');
    elements?.container?.classList.remove('table-scrollbar-enhanced');
    isDragging = false;
    layoutMetrics = null;
    pendingDragScrollTop = null;
    pendingGeometryRefresh = false;
    elements = null;
  }

  return {
    attach,
    isDragging: () => isDragging,
    remove,
    scheduleSync,
    sync
  };
}
