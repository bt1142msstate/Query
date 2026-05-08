const TABLE_SCROLLBAR_MIN_THUMB_HEIGHT = 40;
const TABLE_SCROLLBAR_FALLBACK_SIZE = 12;

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
  let syncFrame = 0;
  const getRowHeight = typeof options.getRowHeight === 'function'
    ? options.getRowHeight
    : () => 42;

  function updateAria(container, track) {
    track.setAttribute('aria-valuemax', String(Math.round(getMaxScroll(container))));
    track.setAttribute('aria-valuenow', String(Math.round(container.scrollTop)));
  }

  function sync() {
    syncFrame = 0;

    const container = elements?.container;
    const host = elements?.host;
    const track = elements?.track;
    const thumb = elements?.thumb;
    if (!container || !host || !track || !thumb) return;

    const maxScroll = getMaxScroll(container);
    const shouldShowScrollbar = maxScroll > 1;
    container.classList.toggle('has-vertical-scroll', shouldShowScrollbar);
    track.classList.toggle('is-visible', shouldShowScrollbar);
    updateAria(container, track);

    if (!shouldShowScrollbar) {
      thumb.style.height = '';
      thumb.style.transform = '';
      return;
    }

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
    const thumbTop = maxScroll > 0 ? (container.scrollTop / maxScroll) * maxThumbTop : 0;

    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${Math.round(thumbTop)}px)`;
  }

  function scheduleSync() {
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(sync);
  }

  function scrollFromPointer(clientY) {
    const container = elements?.container;
    const track = elements?.track;
    const thumb = elements?.thumb;
    if (!container || !track || !thumb) return;

    const maxScroll = getMaxScroll(container);
    const trackRect = track.getBoundingClientRect();
    const thumbHeight = thumb.getBoundingClientRect().height || TABLE_SCROLLBAR_MIN_THUMB_HEIGHT;
    const maxThumbTop = Math.max(1, trackRect.height - thumbHeight);
    const localThumbTop = Math.max(0, Math.min(clientY - trackRect.top - (thumbHeight / 2), maxThumbTop));
    container.scrollTop = (localThumbTop / maxThumbTop) * maxScroll;
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
    track.classList.add('is-dragging');
    track.setPointerCapture?.(event.pointerId);

    const maxScroll = getMaxScroll(container);
    const trackRect = track.getBoundingClientRect();
    const thumbHeight = thumb.getBoundingClientRect().height || TABLE_SCROLLBAR_MIN_THUMB_HEIGHT;
    const maxThumbTop = Math.max(1, trackRect.height - thumbHeight);
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
      container.scrollTop = Math.max(0, Math.min(nextScrollTop, maxScroll));
    };

    const handlePointerUp = upEvent => {
      if (upEvent.pointerId !== event.pointerId) return;
      track.classList.remove('is-dragging');
      track.releasePointerCapture?.(event.pointerId);
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
      scheduleSync();
      return;
    }

    if (elements?.track) {
      elements.track.removeEventListener('pointerdown', handlePointerDown);
      elements.track.removeEventListener('keydown', handleKeydown);
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
    window.addEventListener('resize', scheduleSync);
    container.classList.add('table-scrollbar-enhanced');
    elements = { container, host, track, thumb };
    scheduleSync();
  }

  function remove() {
    if (syncFrame) {
      cancelAnimationFrame(syncFrame);
      syncFrame = 0;
    }

    if (elements?.track) {
      elements.track.removeEventListener('pointerdown', handlePointerDown);
      elements.track.removeEventListener('keydown', handleKeydown);
      elements.track.remove();
    }
    window.removeEventListener('resize', scheduleSync);

    elements?.container?.classList.remove('has-vertical-scroll');
    elements?.container?.classList.remove('table-scrollbar-enhanced');
    elements = null;
  }

  return {
    attach,
    remove,
    scheduleSync,
    sync
  };
}
