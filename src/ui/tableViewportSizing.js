const DEFAULT_TABLE_VIEWPORT_HEIGHT = 400;
const MIN_DESKTOP_TABLE_VIEWPORT_HEIGHT = 220;
const WORKSPACE_BOTTOM_GAP = 18;

function getVisibleBlockHeight(element, windowRef) {
  if (!element || !windowRef) {
    return 0;
  }

  const style = windowRef.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return 0;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return 0;
  }

  const marginTop = Number.parseFloat(style.marginTop || '0') || 0;
  const marginBottom = Number.parseFloat(style.marginBottom || '0') || 0;
  return Math.ceil(rect.height + marginTop + marginBottom);
}

function getNormalTableViewportHeight(tableShell, tableContainer, {
  documentRef = globalThis.document,
  isMobileViewport = false,
  windowRef = globalThis.window
} = {}) {
  if (isMobileViewport || !tableShell || !tableContainer || !windowRef || !documentRef) {
    return DEFAULT_TABLE_VIEWPORT_HEIGHT;
  }

  const viewportHeight = windowRef.visualViewport?.height || windowRef.innerHeight || DEFAULT_TABLE_VIEWPORT_HEIGHT;
  const shellRect = tableShell.getBoundingClientRect();
  const containerRect = tableContainer.getBoundingClientRect();
  const shellStyle = windowRef.getComputedStyle(tableShell);
  const tableChromeHeight = Math.max(0, Math.ceil(containerRect.top - shellRect.top));
  const tableMarginBottom = Number.parseFloat(shellStyle.marginBottom || '0') || 0;
  const formCardHeight = getVisibleBlockHeight(documentRef.getElementById('form-mode-card'), windowRef);
  const bottomPanelReserve = formCardHeight > 0 ? formCardHeight + WORKSPACE_BOTTOM_GAP : 0;
  const availableHeight = Math.floor(
    viewportHeight
    - shellRect.top
    - tableChromeHeight
    - tableMarginBottom
    - bottomPanelReserve
  );

  return Math.max(MIN_DESKTOP_TABLE_VIEWPORT_HEIGHT, availableHeight);
}

export { getNormalTableViewportHeight };
