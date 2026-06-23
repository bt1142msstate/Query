const DEFAULT_FALLBACK_VIEWPORT_HEIGHT = 400;
const DEFAULT_FULL_RENDER_ROW_LIMIT = 500;
const DEFAULT_MAX_OVERSCAN_ROWS = 72;
const DEFAULT_OVERSCAN_ROWS = 10;
const DEFAULT_ROW_HEIGHT = 42;

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function normalizePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function getAvailableBodyHeight({ containerHeight, headerHeight, rowHeight, fallbackViewportHeight }) {
  if (containerHeight > 0) {
    return Math.max(rowHeight, containerHeight - headerHeight);
  }

  return Math.max(rowHeight, fallbackViewportHeight);
}

function calculateVirtualRowRange(options = {}) {
  const rowCount = normalizeCount(options.rowCount);
  const rowHeight = normalizePositiveNumber(options.rowHeight, DEFAULT_ROW_HEIGHT);
  const containerHeight = normalizeNonNegativeNumber(options.containerHeight);
  const headerHeight = normalizeNonNegativeNumber(options.headerHeight);
  const fallbackViewportHeight = normalizePositiveNumber(
    options.fallbackViewportHeight,
    DEFAULT_FALLBACK_VIEWPORT_HEIGHT
  );
  const availableBodyHeight = getAvailableBodyHeight({
    containerHeight,
    headerHeight,
    rowHeight,
    fallbackViewportHeight
  });
  const visibleRows = rowCount === 0 ? 0 : Math.max(1, Math.ceil(availableBodyHeight / rowHeight));
  const overscanRows = calculateAdaptiveOverscanRows({
    baseOverscanRows: options.overscanRows,
    maxOverscanRows: options.maxOverscanRows,
    rowHeight,
    scrollDelta: options.scrollDelta,
    visibleRows
  });
  const totalHeight = rowCount * rowHeight;
  const maxScrollTop = Math.max(0, totalHeight - availableBodyHeight);
  const scrollTop = Math.min(normalizeNonNegativeNumber(options.scrollTop), maxScrollTop);

  if (rowCount === 0) {
    return {
      availableBodyHeight,
      baseStart: 0,
      end: 0,
      maxScrollTop,
      overscanRows,
      renderedRows: 0,
      rowCount,
      rowHeight,
      scrollTop: 0,
      start: 0,
      totalHeight,
      visibleRows: 0
    };
  }

  const maxBaseStart = Math.max(0, rowCount - visibleRows);
  const baseStart = Math.min(Math.floor(scrollTop / rowHeight), maxBaseStart);
  const start = Math.max(0, baseStart - overscanRows);
  const end = Math.min(rowCount, baseStart + visibleRows + overscanRows);

  return {
    availableBodyHeight,
    baseStart,
    end,
    maxScrollTop,
    overscanRows,
    renderedRows: Math.max(0, end - start),
    rowCount,
    rowHeight,
    scrollTop,
    start,
    totalHeight,
    visibleRows
  };
}

function shouldVirtualizeRows(rowCount, fullRenderRowLimit = DEFAULT_FULL_RENDER_ROW_LIMIT) {
  return normalizeCount(rowCount) > normalizeCount(fullRenderRowLimit);
}

function calculateAdaptiveOverscanRows(options = {}) {
  const rowHeight = normalizePositiveNumber(options.rowHeight, DEFAULT_ROW_HEIGHT);
  const baseOverscanRows = normalizeCount(options.baseOverscanRows ?? DEFAULT_OVERSCAN_ROWS);
  const maxOverscanRows = Math.max(baseOverscanRows, normalizeCount(options.maxOverscanRows ?? DEFAULT_MAX_OVERSCAN_ROWS));
  const scrollDeltaRows = Math.ceil(normalizeNonNegativeNumber(options.scrollDelta) / rowHeight);
  const velocityOverscanRows = scrollDeltaRows > 0 ? Math.ceil(scrollDeltaRows * 0.45) : 0;
  return Math.min(maxOverscanRows, Math.max(baseOverscanRows, velocityOverscanRows));
}

function createVirtualRenderPlan(options = {}) {
  const rowCount = normalizeCount(options.rowCount);
  const fullRenderRowLimit = normalizeCount(options.fullRenderRowLimit ?? DEFAULT_FULL_RENDER_ROW_LIMIT);
  const virtualized = shouldVirtualizeRows(rowCount, fullRenderRowLimit);

  if (!virtualized) {
    return {
      availableBodyHeight: 0,
      baseStart: 0,
      end: rowCount,
      maxScrollTop: 0,
      overscanRows: normalizeCount(options.overscanRows ?? DEFAULT_OVERSCAN_ROWS),
      renderedRows: rowCount,
      rowCount,
      rowHeight: normalizePositiveNumber(options.rowHeight, DEFAULT_ROW_HEIGHT),
      scrollTop: 0,
      start: 0,
      totalHeight: 0,
      virtualized,
      visibleRows: rowCount
    };
  }

  return {
    ...calculateVirtualRowRange(options),
    virtualized
  };
}

export {
  DEFAULT_FULL_RENDER_ROW_LIMIT,
  DEFAULT_MAX_OVERSCAN_ROWS,
  DEFAULT_OVERSCAN_ROWS,
  DEFAULT_ROW_HEIGHT,
  calculateAdaptiveOverscanRows,
  calculateVirtualRowRange,
  createVirtualRenderPlan,
  shouldVirtualizeRows
};
