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
    const startX = event.clientX;
    document.body.classList.add('table-column-resizing');

    const onMove = moveEvent => {
      const deltaX = moveEvent.clientX - startX;
      const signedDelta = edge === 'left' ? -deltaX : deltaX;
      services.setManualColumnWidth?.(fieldName, initialWidth + signedDelta);
      schedulePreviewRender();
    };

    const onUp = () => {
      stop({ keepMode: true });
    };

    activeSession = { onMove, onUp, renderFrame: 0 };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  return {
    begin,
    hasActiveSession: () => Boolean(activeSession),
    stop
  };
}
