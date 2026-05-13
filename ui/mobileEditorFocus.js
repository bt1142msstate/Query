const MOBILE_EDITOR_QUERY = '(max-width: 1024px), (hover: none) and (pointer: coarse)';
const EDITABLE_SELECTOR = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select, [contenteditable="true"]';
const EDITOR_SCROLL_SELECTOR = [
  '#filter-card',
  '.post-filter-dialog__body',
  '.form-mode-popup-list-popup-body',
  '.form-mode-field-picker-list'
].join(', ');

let viewportQuery = null;
let initialized = false;

function isMobileEditorViewport() {
  viewportQuery = viewportQuery || window.matchMedia?.(MOBILE_EDITOR_QUERY);
  return Boolean(viewportQuery?.matches);
}

function adjustFocusedControlIntoEditor(control) {
  const scroller = control.closest(EDITOR_SCROLL_SELECTOR);
  if (!scroller) return;

  const scrollRect = scroller.getBoundingClientRect();
  const controlRect = control.getBoundingClientRect();
  const topInset = Math.min(28, scrollRect.height * 0.12);
  const bottomInset = Math.min(112, Math.max(48, scrollRect.height * 0.28));
  const topOverflow = controlRect.top - (scrollRect.top + topInset);
  const bottomOverflow = controlRect.bottom - (scrollRect.bottom - bottomInset);

  if (bottomOverflow > 0) {
    scroller.scrollTop += bottomOverflow;
  } else if (topOverflow < 0) {
    scroller.scrollTop += topOverflow;
  }
}

function queueFocusAdjustment(control = document.activeElement) {
  if (!control?.matches?.(EDITABLE_SELECTOR) || !isMobileEditorViewport()) return;
  requestAnimationFrame(() => {
    adjustFocusedControlIntoEditor(control);
    setTimeout(() => adjustFocusedControlIntoEditor(control), 140);
  });
}

function initializeMobileEditorFocus() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  document.addEventListener('focusin', event => queueFocusAdjustment(event.target), true);
  window.visualViewport?.addEventListener?.('resize', () => queueFocusAdjustment());
  window.addEventListener('orientationchange', () => queueFocusAdjustment());
}

initializeMobileEditorFocus();

export { initializeMobileEditorFocus };
