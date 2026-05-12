export function resolveColumnResizeStartTarget(event, options = {}) {
  const isResizeModeActive = typeof options.isResizeModeActive === 'function'
    ? options.isResizeModeActive
    : () => false;
  const getColumnResizeState = typeof options.getColumnResizeState === 'function'
    ? options.getColumnResizeState
    : () => ({ active: false, fieldName: '' });

  const resizeHandle = event.target.closest('.th-resize-handle');
  if (resizeHandle) {
    const th = resizeHandle.closest('th');
    return th ? { resizeHandle, th } : null;
  }

  if (!isResizeModeActive()) {
    return null;
  }

  const th = event.target.closest('#example-table thead th[data-col-index]');
  if (!th) {
    return null;
  }

  const resizeState = getColumnResizeState();
  const fieldName = th.getAttribute('data-sort-field') || '';
  if (!fieldName || fieldName !== resizeState.fieldName) {
    return null;
  }

  return {
    resizeHandle: th.querySelector('.th-resize-handle-right') || th,
    th
  };
}
