export function getDragScrollContainer(table) {
  return table?.closest('.overflow-x-auto, #table-container') || null;
}

export function getDropIndicatorViewportRect(table) {
  const scrollContainer = getDragScrollContainer(table);
  const target = scrollContainer || table;
  return target ? target.getBoundingClientRect() : null;
}

export function isPointerWithinDropViewport(table, clientX, clientY) {
  const rect = getDropIndicatorViewportRect(table);
  if (!rect) {
    return false;
  }

  return clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top
    && clientY <= rect.bottom;
}

export function isPointerNearDropViewport(table, clientX, clientY, options = {}) {
  const rect = getDropIndicatorViewportRect(table);
  if (!rect) {
    return false;
  }

  const horizontalTolerance = Number.isFinite(Number(options.horizontalTolerance))
    ? Math.max(0, Number(options.horizontalTolerance))
    : 140;
  const verticalTolerance = Number.isFinite(Number(options.verticalTolerance))
    ? Math.max(0, Number(options.verticalTolerance))
    : 220;

  return clientX >= rect.left - horizontalTolerance
    && clientX <= rect.right + horizontalTolerance
    && clientY >= rect.top - verticalTolerance
    && clientY <= rect.bottom + verticalTolerance;
}

export function getVisibleHeaderTargets(table, scrollContainer = getDragScrollContainer(table)) {
  const headers = Array.from(table.querySelectorAll('thead th[data-col-index]'));
  if (!headers.length || !scrollContainer) {
    return headers;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const visibleHeaders = headers.filter(th => {
    const rect = th.getBoundingClientRect();
    return rect.right > containerRect.left + 1 && rect.left < containerRect.right - 1;
  });

  return visibleHeaders.length ? visibleHeaders : headers;
}

export function getClosestVisibleHeaderByX(table, clientX, scrollContainer = getDragScrollContainer(table)) {
  const headers = getVisibleHeaderTargets(table, scrollContainer);
  if (!headers.length) {
    return null;
  }

  let best = headers[0];
  let bestDist = Infinity;

  headers.forEach(th => {
    const rect = th.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const dist = Math.abs(clientX - center);
    if (dist < bestDist) {
      bestDist = dist;
      best = th;
    }
  });

  return best;
}
