export function createColumnResizeController(options = {}) {
  const services = options.services || {};
  const getColumnResizeState = typeof options.getColumnResizeState === 'function'
    ? options.getColumnResizeState
    : () => ({ active: false, fieldName: '' });
  let activeSession = null;

  function stop(options = {}) {
    const hadActiveSession = Boolean(activeSession);
    if (activeSession) {
      window.removeEventListener('pointermove', activeSession.onMove);
      window.removeEventListener('pointerup', activeSession.onUp);
      window.removeEventListener('pointercancel', activeSession.onUp);
      window.removeEventListener('touchmove', activeSession.onMove);
      window.removeEventListener('touchend', activeSession.onUp);
      window.removeEventListener('touchcancel', activeSession.onUp);
      if (activeSession.renderFrame) {
        cancelAnimationFrame(activeSession.renderFrame);
      }
      document.body.classList.remove('table-column-resizing');
      activeSession = null;
    }

    if (options.keepMode !== true) {
      services.clearColumnResizeMode?.();
    } else {
      services.syncColumnResizeModeUi?.();
    }

    if (hadActiveSession) {
      services.renderVirtualTable?.();
    }
  }

  function getEventPoint(event) {
    const touch = event.touches?.[0] || event.changedTouches?.[0] || null;
    if (touch) {
      return {
        clientX: touch.clientX,
        clientY: touch.clientY
      };
    }

    return {
      clientX: event.clientX,
      clientY: event.clientY
    };
  }

  function schedulePreviewRender() {
    const session = activeSession;
    if (!session || session.renderFrame) {
      return;
    }

    session.renderFrame = requestAnimationFrame(() => {
      if (activeSession !== session) {
        return;
      }

      session.renderFrame = 0;
      services.renderVirtualTable?.();
      services.syncColumnResizeModeUi?.();
    });
  }

  function begin(event, handle, th) {
    const resizeState = getColumnResizeState();
    const fieldName = handle.getAttribute('data-field-name') || th.getAttribute('data-sort-field') || '';
    const edge = handle.getAttribute('data-edge') || 'right';
    if (!resizeState.active || resizeState.fieldName !== fieldName) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    stop({ keepMode: true });

    const initialWidth = th.getBoundingClientRect().width;
    const startPoint = getEventPoint(event);
    const startX = startPoint.clientX;
    if (!Number.isFinite(startX)) {
      return;
    }

    document.body.classList.add('table-column-resizing');

    const onMove = moveEvent => {
      moveEvent.preventDefault?.();
      const movePoint = getEventPoint(moveEvent);
      if (!Number.isFinite(movePoint.clientX)) {
        return;
      }

      const deltaX = movePoint.clientX - startX;
      const signedDelta = edge === 'left' ? -deltaX : deltaX;
      services.setManualColumnWidth?.(fieldName, initialWidth + signedDelta);
      schedulePreviewRender();
    };

    const onUp = upEvent => {
      upEvent?.preventDefault?.();
      stop({ keepMode: true });
    };

    activeSession = { onMove, onUp, renderFrame: 0 };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp, { once: true });
    window.addEventListener('touchcancel', onUp, { once: true });
  }

  return {
    begin,
    hasActiveSession: () => Boolean(activeSession),
    stop
  };
}
