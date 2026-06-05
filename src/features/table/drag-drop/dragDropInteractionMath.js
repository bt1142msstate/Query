const DEFAULT_INSERT_AFFORDANCE_THRESHOLD = 40;
const DEFAULT_AUTO_SCROLL_THRESHOLD = 90;

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRect(rect) {
  const left = toFiniteNumber(rect?.left);
  const right = toFiniteNumber(rect?.right, left + toFiniteNumber(rect?.width));
  const top = toFiniteNumber(rect?.top);
  const bottom = toFiniteNumber(rect?.bottom, top + toFiniteNumber(rect?.height));
  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function getRectSpan(rects) {
  const top = Math.min(...rects.map(rect => rect.top));
  const bottom = Math.max(...rects.map(rect => rect.bottom));
  return {
    top,
    height: Math.max(0, bottom - top)
  };
}

function calculateHeaderActionLayout({
  containerWidth,
  labelWidth,
  sortWidth = 0,
  actionsWidth = 0,
  actionsVisible = false
}) {
  const roundedSortWidth = Math.ceil(Math.max(0, toFiniteNumber(sortWidth)));
  const roundedActionsWidth = actionsVisible ? Math.ceil(Math.max(0, toFiniteNumber(actionsWidth))) : 0;
  const roundedLabelWidth = Math.ceil(Math.max(0, toFiniteNumber(labelWidth)));
  const roundedContainerWidth = Math.ceil(Math.max(0, toFiniteNumber(containerWidth)));
  const sideBalance = Math.max(roundedSortWidth + 10, roundedActionsWidth + 18, 26);
  const availableInlineWidth = roundedContainerWidth - (sideBalance * 2);
  const stackActions = Boolean(actionsVisible && availableInlineWidth < (roundedLabelWidth + 18));

  return {
    stackActions,
    balanceSpace: stackActions ? Math.max(roundedSortWidth + 10, 26) : sideBalance,
    sideBalance,
    availableInlineWidth
  };
}

function getHeaderInsertPositionFromRects(
  headerRects,
  clientX,
  threshold = DEFAULT_INSERT_AFFORDANCE_THRESHOLD
) {
  const rects = headerRects.map(normalizeRect);
  if (rects.length === 0) {
    return null;
  }

  const firstRect = rects[0];
  const lastRect = rects[rects.length - 1];
  const fullSpan = getRectSpan([firstRect, lastRect]);
  const pointerX = toFiniteNumber(clientX);
  let bestCandidate = null;
  let bestDistance = Infinity;

  function useCandidate(candidate) {
    const distance = Math.abs(pointerX - candidate.boundaryX);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidate = candidate;
    }
  }

  useCandidate({
    insertAt: 0,
    boundaryX: firstRect.left,
    top: fullSpan.top,
    height: fullSpan.height
  });

  for (let index = 0; index < rects.length - 1; index += 1) {
    const leftRect = rects[index];
    const rightRect = rects[index + 1];
    const span = getRectSpan([leftRect, rightRect]);
    useCandidate({
      insertAt: index + 1,
      boundaryX: (leftRect.right + rightRect.left) / 2,
      top: span.top,
      height: span.height
    });
  }

  useCandidate({
    insertAt: rects.length,
    boundaryX: lastRect.right,
    top: fullSpan.top,
    height: fullSpan.height
  });

  return bestDistance <= threshold ? bestCandidate : null;
}

function isPointInsideRect(rect, pointerX, pointerY) {
  return pointerX >= rect.left
    && pointerX <= rect.right
    && pointerY >= rect.top
    && pointerY <= rect.bottom;
}

function getAutoScrollIntent({
  pointerX,
  pointerY,
  containerRect,
  scrollLeft,
  scrollWidth,
  clientWidth,
  threshold = DEFAULT_AUTO_SCROLL_THRESHOLD
}) {
  const rect = normalizeRect(containerRect);
  const currentScrollLeft = Math.max(0, toFiniteNumber(scrollLeft));
  const maxScrollLeft = Math.max(0, toFiniteNumber(scrollWidth) - toFiniteNumber(clientWidth));
  const x = toFiniteNumber(pointerX);
  const y = toFiniteNumber(pointerY);

  if (!isPointInsideRect(rect, x, y)) {
    return {
      direction: null,
      outside: true,
      maxScrollLeft
    };
  }

  if (x < rect.left + threshold && currentScrollLeft > 0) {
    return {
      direction: 'left',
      outside: false,
      maxScrollLeft
    };
  }

  if (x > rect.right - threshold && currentScrollLeft < maxScrollLeft) {
    return {
      direction: 'right',
      outside: false,
      maxScrollLeft
    };
  }

  return {
    direction: null,
    outside: false,
    maxScrollLeft
  };
}

function calculateAutoScrollStep({
  direction,
  pointerX,
  containerRect,
  scrollLeft,
  scrollWidth,
  clientWidth,
  threshold = DEFAULT_AUTO_SCROLL_THRESHOLD
}) {
  const rect = normalizeRect(containerRect);
  const currentScrollLeft = Math.max(0, toFiniteNumber(scrollLeft));
  const maxScrollLeft = Math.max(0, toFiniteNumber(scrollWidth) - toFiniteNumber(clientWidth));
  const x = toFiniteNumber(pointerX);
  let proximity = 0;

  if (direction === 'left') {
    proximity = Math.max(0, (rect.left + threshold) - x);
  } else if (direction === 'right') {
    proximity = Math.max(0, x - (rect.right - threshold));
  }

  const intensity = Math.min(1, proximity / threshold);
  const scrollAmount = Math.max(4, Math.round(4 + (intensity * 8)));
  let nextScrollLeft = currentScrollLeft;

  if (direction === 'left') {
    nextScrollLeft = Math.max(0, currentScrollLeft - scrollAmount);
  } else if (direction === 'right') {
    nextScrollLeft = Math.min(maxScrollLeft, currentScrollLeft + scrollAmount);
  }

  return {
    proximity,
    intensity,
    scrollAmount,
    nextScrollLeft,
    changed: nextScrollLeft !== currentScrollLeft,
    maxScrollLeft
  };
}

export {
  calculateAutoScrollStep,
  calculateHeaderActionLayout,
  getAutoScrollIntent,
  getHeaderInsertPositionFromRects
};
