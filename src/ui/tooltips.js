/**
 * Custom Tooltip Component
 * Provides intelligent tooltip positioning and behavior for elements with data-tooltip attributes.
 * @module Tooltips
 */
const TOOLTIP_DELAY_ATTR = 'data-tooltip-delay';
const TOOLTIP_INTENT_ATTR = 'data-tooltip-intent';
const HOVER_SHOW_DELAY_MS = 2500;
const INSTANT_TOOLTIP_DELAY_MS = 0;

const IMMEDIATE_TOOLTIP_SELECTOR = [
  '[data-tooltip-intent="instant"]',
  '.query-table-truncated-cell',
  '.query-table-truncated-trigger',
  '.query-table-collapsed-row',
  '.th-action',
  '.table-toolbar-btn',
  '.form-mode-field-picker-field-info',
  '.list-paste-btn',
  '.post-filter-pill__remove',
  '.filter-trash'
].join(', ');

const DELAYED_TOOLTIP_SELECTOR = [
  '[data-tooltip-intent="delayed"]',
  '.form-mode-field-picker-option',
  '.form-mode-field-picker-option-name',
  '.option-item',
  '.option-item-text',
  '.group-label',
  '.templates-list-item',
  '.category-btn',
  '.boolean-pill-option'
].join(', ');

function parseTooltipDelay(rawDelay) {
  if (rawDelay === null || rawDelay === undefined || rawDelay === '') {
    return null;
  }

  const parsedDelay = Number(rawDelay);
  if (!Number.isFinite(parsedDelay)) {
    return null;
  }

  return Math.max(0, parsedDelay);
}

function resolveTooltipDelay({
  rawDelay = null,
  intent = '',
  isDenseListTarget = false,
  isImmediateTarget = false,
  isCompactControl = false
} = {}) {
  const explicitDelay = parseTooltipDelay(rawDelay);
  if (explicitDelay !== null) {
    return explicitDelay;
  }

  if (intent === 'instant') {
    return INSTANT_TOOLTIP_DELAY_MS;
  }

  if (intent === 'delayed' || isDenseListTarget) {
    return HOVER_SHOW_DELAY_MS;
  }

  if (isImmediateTarget || isCompactControl) {
    return INSTANT_TOOLTIP_DELAY_MS;
  }

  return HOVER_SHOW_DELAY_MS;
}

function matchesSelector(el, selector) {
  return Boolean(
    el
    && typeof el.matches === 'function'
    && selector
    && el.matches(selector)
  );
}

function closestMatching(el, selector) {
  return el && typeof el.closest === 'function' && selector
    ? el.closest(selector)
    : null;
}

function hasCompactControlShape(target) {
  const control = closestMatching(target, 'button, [role="button"]');
  if (!control || matchesSelector(control, DELAYED_TOOLTIP_SELECTOR)) {
    return false;
  }

  if (!control.hasAttribute('data-tooltip') && !control.hasAttribute('data-tooltip-html')) {
    return false;
  }

  const label = String(control.getAttribute('aria-label') || '').trim();
  if (!label) {
    return false;
  }

  const text = String(control.textContent || '').replace(/\s+/gu, ' ').trim();
  const className = String(control.className || '');
  const hasSvg = Boolean(typeof control.querySelector === 'function' && control.querySelector('svg'));
  const hasCompactClass = /(?:^|\s|[-_])(?:action|icon|toolbar|control|copy|sort|trash|remove|clear|close|upload|download|zoom|expand|info|help|settings)(?:$|\s|[-_])/iu.test(className);
  const isShortGlyph = text.length <= 2 || /^[×?!i]+$/iu.test(text);

  return Boolean(hasSvg || hasCompactClass || isShortGlyph || text.length === 0);
}

/**
 * Tooltip manager handling tooltip creation, positioning, and lifecycle.
 * @namespace Tooltips
 */
const Tooltips = (() => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    const noop = () => {};
    return Object.freeze({
      attach: noop,
      forceHide: noop,
      hide: noop,
      hideTooltip: noop,
      isVisible: () => false,
      showTooltip: noop
    });
  }

  const TOOLTIP_SELECTOR = '[data-tooltip], [data-tooltip-html]';
  let tooltipEl = null;
  let arrowEl = null;
  let currentTarget = null;
  let currentTooltipIsHtml = false;
  let hideTimeout = null;
  let showTimeout = null;
  let pendingTarget = null;
  let isDragging = false; // Track drag state
  let targetMonitorFrame = null;
  let attached = false;

  function resetDragState() {
    isDragging = false;
  }

  function tooltipDebugLog(eventName, payload = {}) {
    if (!window) return;
    const debugEnabled = window.localStorage && window.localStorage.getItem('BUBBLE_DEBUG') === '1';
    if (!debugEnabled) return;
    try {
      console.log(`[TooltipDebug] ${eventName}`, payload);
    } catch (_) {
      // Keep debugging non-disruptive.
    }
  }

  function closestFromTarget(target, selector) {
    const el = target instanceof Element ? target : target && target.parentElement;
    return el ? el.closest(selector) : null;
  }

  function cancelTargetMonitor() {
    if (targetMonitorFrame !== null) {
      window.cancelAnimationFrame(targetMonitorFrame);
      targetMonitorFrame = null;
    }
  }

  function clearShowTimeout() {
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
    pendingTarget = null;
  }

  function isTooltipTargetAlive(target) {
    if (!(target instanceof Element) || !target.isConnected) {
      return false;
    }

    if (target.hidden || target.closest('[hidden], [inert], [aria-hidden="true"]')) {
      return false;
    }

    const style = window.getComputedStyle(target);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    return target.getClientRects().length > 0;
  }

  function monitorCurrentTarget() {
    cancelTargetMonitor();

    const tick = () => {
      if (!currentTarget || !isTooltipVisible()) {
        targetMonitorFrame = null;
        return;
      }

      if (!isTooltipTargetAlive(currentTarget)) {
        forceHide();
        return;
      }

      targetMonitorFrame = window.requestAnimationFrame(tick);
    };

    targetMonitorFrame = window.requestAnimationFrame(tick);
  }

  function isPointerOverCurrentTooltipTarget(clientX, clientY) {
    if (!currentTarget || typeof document.elementFromPoint !== 'function') {
      return false;
    }

    const hoveredEl = document.elementFromPoint(clientX, clientY);
    if (!hoveredEl) {
      return false;
    }

    const tooltipTarget = closestFromTarget(hoveredEl, TOOLTIP_SELECTOR);
    return Boolean(
      tooltipTarget
      && (tooltipTarget === currentTarget || currentTarget.contains(tooltipTarget) || tooltipTarget.contains(currentTarget))
    );
  }

  /**
   * Creates the tooltip DOM element and arrow.
   * @function createTooltip
   * @memberof Tooltips
   */
  function createTooltip() {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'custom-tooltip';
    arrowEl = document.createElement('div');
    arrowEl.className = 'custom-tooltip-arrow';
    arrowEl.innerHTML = '<svg width="14" height="7"><polygon points="0,0 7,7 14,0" fill="#222"/></svg>';
    tooltipEl.appendChild(arrowEl);
    document.body.appendChild(tooltipEl);
  }

  function resetTooltipContent() {
    tooltipEl.textContent = '';
    tooltipEl.appendChild(arrowEl);
  }

  function hideTooltipElement() {
    if (!tooltipEl) return;
    cancelTargetMonitor();
    tooltipEl.classList.remove('show');
    tooltipEl.style.opacity = '0';
    tooltipEl.style.display = 'none';
    resetTooltipContent();
  }

  function readTooltipContent(el) {
    const isHtml = el.hasAttribute('data-tooltip-html');
    return {
      isHtml,
      text: isHtml ? el.getAttribute('data-tooltip-html') : el.getAttribute('data-tooltip')
    };
  }

  function shouldSuppressTooltip(el) {
    return el instanceof Element
      && el.getAttribute('aria-haspopup') === 'menu'
      && el.getAttribute('aria-expanded') === 'true';
  }

  function getTooltipDelay(target) {
    if (!(target instanceof Element)) {
      return HOVER_SHOW_DELAY_MS;
    }

    return resolveTooltipDelay({
      rawDelay: target.getAttribute(TOOLTIP_DELAY_ATTR),
      intent: target.getAttribute(TOOLTIP_INTENT_ATTR) || '',
      isDenseListTarget: Boolean(closestMatching(target, DELAYED_TOOLTIP_SELECTOR)),
      isImmediateTarget: Boolean(closestMatching(target, IMMEDIATE_TOOLTIP_SELECTOR)),
      isCompactControl: hasCompactControlShape(target)
    });
  }

  function isTooltipVisible() {
    return !!(tooltipEl && tooltipEl.style.display === 'block');
  }

  /**
   * Shows a tooltip for the specified target element.
   * @function showTooltip
   * @memberof Tooltips
   * @param {HTMLElement} target - The element to show tooltip for
   * @param {string} text - The tooltip text to display
   * @param {Event} [event] - Optional mouse event for positioning
   * @param {boolean} [isHtml=false] - Whether the text contains HTML
   */
  function showTooltip(target, text, event, isHtml = false) {
    if (isDragging) return; // Do not show tooltip while dragging
    if (shouldSuppressTooltip(target)) return;
    if (!tooltipEl) createTooltip();
    clearShowTimeout();

    tooltipDebugLog('showTooltip', {
      targetText: target && target.textContent ? target.textContent.trim() : null,
      hasHtml: !!isHtml,
      textLength: text ? text.length : 0,
      eventType: event && event.type
    });

    // Clear any pending hide timeout
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    resetTooltipContent();
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.setAttribute('aria-live', 'polite');
    tooltipEl.style.display = 'block';
    tooltipEl.classList.add('show');
    
    if (isHtml) {
      tooltipEl.classList.add('is-html');
    } else {
      tooltipEl.classList.remove('is-html');
    }
    currentTooltipIsHtml = Boolean(isHtml);

    tooltipEl.style.opacity = '0';
    // Set text
    if (isHtml) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = text;
      tooltipEl.insertBefore(wrapper, arrowEl);
    } else {
      tooltipEl.insertBefore(document.createTextNode(text), arrowEl);
    }
    // Position
    positionTooltip(target, event);
    setTimeout(() => {
      if (tooltipEl && currentTarget === target && tooltipEl.style.display === 'block') {
        tooltipEl.classList.add('show');
        tooltipEl.style.opacity = '1';
      }
    }, 10);
    currentTarget = target;
    monitorCurrentTarget();
  }

  /**
   * Hides the currently visible tooltip with a delay.
   * @function hideTooltip
   * @memberof Tooltips
   */
  function hideTooltip() {
    if (!tooltipEl) return;
    clearShowTimeout();

    tooltipDebugLog('hideTooltip', {
      currentTargetText: currentTarget && currentTarget.textContent ? currentTarget.textContent.trim() : null
    });

    tooltipEl.classList.remove('show');
    tooltipEl.style.opacity = '0';

    hideTimeout = setTimeout(() => {
      hideTooltipElement();
      currentTarget = null;
      hideTimeout = null;
    }, 120);
  }

  /**
   * Immediately hides the tooltip without delay.
   * @function forceHide
   * @memberof Tooltips
   */
  function forceHide() {
    clearShowTimeout();
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    hideTooltipElement();
    currentTarget = null;
    currentTooltipIsHtml = false;
    tooltipDebugLog('forceHide');
  }

  /**
   * Positions the tooltip relative to the target element.
   * Handles viewport boundary detection and arrow positioning.
   * @function positionTooltip
   * @memberof Tooltips
   * @param {HTMLElement} target - The target element
   * @param {Event} [event] - Optional mouse event for cursor-following
   */
  function positionTooltip(target, event) {
    if (!tooltipEl) return;
    const rect = target.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;
    let top = rect.top + scrollY - tooltipEl.offsetHeight - 10;
    let left = rect.left + scrollX + rect.width / 2 - tooltipEl.offsetWidth / 2;
    let arrowDirection = 'arrow-up';
    let anchorX = rect.left + rect.width / 2 + scrollX;
    // If mouse event, follow mouse
    if (!currentTooltipIsHtml && event && event.type && event.type.startsWith('mouse')) {
      anchorX = event.clientX + scrollX;
      left = anchorX - tooltipEl.offsetWidth / 2;
      top = rect.top + scrollY - tooltipEl.offsetHeight - 14;
    }
    // Clamp to viewport
    const minLeft = 8;
    const maxLeft = window.innerWidth - tooltipEl.offsetWidth - 8;
    let clampedLeft = Math.max(minLeft, Math.min(left, maxLeft));
    // If tooltip would go above viewport, show below element
    if (top < scrollY + 4) {
      top = rect.bottom + scrollY + 14;
      arrowDirection = 'arrow-down';
    }
    tooltipEl.style.left = clampedLeft + 'px';
    tooltipEl.style.top = top + 'px';
    // Arrow direction class
    tooltipEl.classList.remove('arrow-up', 'arrow-down');
    tooltipEl.classList.add(arrowDirection);
    // Arrow horizontal position: anchorX relative to tooltip left
    let arrowLeft = anchorX - clampedLeft;
    // Clamp arrow within tooltip
    const arrowMargin = 12;
    arrowLeft = Math.max(arrowMargin, Math.min(arrowLeft, tooltipEl.offsetWidth - arrowMargin));
    arrowEl.style.left = arrowLeft + 'px';
    arrowEl.style.right = '';
    arrowEl.style.transform = 'translateX(-50%)' + (arrowDirection === 'arrow-down' ? ' rotate(180deg)' : '');
  }

  /**
   * Attaches global event listeners for tooltip functionality.
   * Handles mouse events, focus events, drag events, and keyboard shortcuts.
   * @function attach
   * @memberof Tooltips
   */
  function attach() {
    if (attached) return;
    attached = true;

    document.addEventListener('mouseover', e => {
      if (isDragging) return;
      const el = closestFromTarget(e.target, TOOLTIP_SELECTOR);
      if (!el) return;
      if (shouldSuppressTooltip(el)) {
        forceHide();
        return;
      }
      tooltipDebugLog('mouseover', {
        targetText: el.textContent ? el.textContent.trim() : null,
        rawTargetNodeType: e.target && e.target.nodeType
      });
      const { isHtml, text } = readTooltipContent(el);
      if (!text) return;
      clearShowTimeout();
      pendingTarget = el;
      const delay = getTooltipDelay(el);
      showTimeout = setTimeout(() => {
        if (pendingTarget !== el) {
          return;
        }
        showTimeout = null;
        pendingTarget = null;
        showTooltip(el, text, e, isHtml);
      }, delay);
    });

    document.addEventListener('mousemove', e => {
      if (isDragging) return;
      if (currentTarget && isTooltipVisible() && !currentTooltipIsHtml) {
        positionTooltip(currentTarget, e);
      }
    });

    document.addEventListener('mouseout', e => {
      const el = closestFromTarget(e.target, TOOLTIP_SELECTOR);
      if (!el) return;
      const relatedEl = e.relatedTarget instanceof Element
        ? e.relatedTarget
        : e.relatedTarget && e.relatedTarget.parentElement;
      tooltipDebugLog('mouseout', {
        sourceText: el.textContent ? el.textContent.trim() : null,
        relatedTag: relatedEl && relatedEl.tagName,
        relatedClass: relatedEl && relatedEl.className,
        stayedWithinSource: !!(relatedEl && el.contains(relatedEl))
      });
      if (relatedEl && el.contains(relatedEl)) return;
      if (pendingTarget === el) {
        clearShowTimeout();
      }
      hideTooltip();
    });

    document.addEventListener('focusin', e => {
      if (isDragging) return;
      const el = closestFromTarget(e.target, TOOLTIP_SELECTOR);
      if (!el) return;
      if (shouldSuppressTooltip(el)) {
        forceHide();
        return;
      }
      tooltipDebugLog('focusin', {
        targetText: el.textContent ? el.textContent.trim() : null
      });
      const { isHtml, text } = readTooltipContent(el);
      if (text) showTooltip(el, text, undefined, isHtml);
    });

    document.addEventListener('focusout', e => {
      if (closestFromTarget(e.target, TOOLTIP_SELECTOR)) hideTooltip();
    });

    // Hide tooltip on scroll or escape
    window.addEventListener('scroll', forceHide, true); // Use capture to catch all scroll events
    window.addEventListener('query-app:hide-tooltips', forceHide);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') forceHide();
    });
    
    // Additional cleanup for mouse movements outside target area
    let mouseDistanceCheck = null;
    document.addEventListener('mousemove', e => {
      if (isDragging) return;
      
      // Debounce the distance check for performance
      if (mouseDistanceCheck) clearTimeout(mouseDistanceCheck);
      
      mouseDistanceCheck = setTimeout(() => {
        if (currentTarget && isTooltipVisible()) {
          if (!isPointerOverCurrentTooltipTarget(e.clientX, e.clientY)) {
            forceHide();
          }
        }
      }, 50);
    });

    // Hide tooltip on dragstart, show again on dragend
    document.addEventListener('dragstart', () => {
      isDragging = true;
      forceHide();
    });
    document.addEventListener('dragend', resetDragState);
    document.addEventListener('drop', resetDragState, true);
    document.addEventListener('mouseup', resetDragState, true);
    window.addEventListener('drop', resetDragState, true);
    window.addEventListener('blur', resetDragState);

    // Clicking a control should perform the action, not leave its tooltip behind.
    document.addEventListener('click', e => {
      const el = closestFromTarget(e.target, TOOLTIP_SELECTOR);
      if (!el) return;
      forceHide();
    });
  }
  attach();
  return Object.freeze({
    attach,
    forceHide,
    hide: forceHide,
    hideTooltip,
    isVisible: isTooltipVisible,
    showTooltip
  });
})();

export { HOVER_SHOW_DELAY_MS, INSTANT_TOOLTIP_DELAY_MS, Tooltips, resolveTooltipDelay };
