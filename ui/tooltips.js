import { OperatorLabels } from '../core/operatorLabels.js';
import { formatFieldOperatorForDisplay, mapFieldOperatorToUiCond, normalizeUiConfigFilters } from '../filters/queryPayload.js';
import { getFilterDisplayValues } from '../filters/filterValueUi.js';

// escapeHtml is defined in utils.js (loaded before this file)
const escapeHtml = window.escapeHtml;

/**
 * Custom Tooltip Component
 * Provides intelligent tooltip positioning and behavior for elements with data-tooltip attributes.
 * @module TooltipManager
 */
/**
 * Tooltip manager handling tooltip creation, positioning, and lifecycle.
 * @namespace TooltipManager
 */
window.TooltipManager = (() => {
  const TOOLTIP_SELECTOR = '[data-tooltip], [data-tooltip-html]';
  const TOOLTIP_DELAY_ATTR = 'data-tooltip-delay';
  const HOVER_SHOW_DELAY_MS = 2500;
  let tooltipEl = null;
  let arrowEl = null;
  let currentTarget = null;
  let currentTooltipIsHtml = false;
  let hideTimeout = null;
  let showTimeout = null;
  let pendingTarget = null;
  let isDragging = false; // Track drag state
  let targetMonitorFrame = null;

  function resetDragState() {
    isDragging = false;
  }

  function tooltipDebugLog(eventName, payload = {}) {
    if (!window) return;
    const debugEnabled = window.BUBBLE_DEBUG === true || (window.localStorage && window.localStorage.getItem('BUBBLE_DEBUG') === '1');
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
   * @memberof TooltipManager
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

  function getTooltipDelay(target) {
    if (!(target instanceof Element)) {
      return HOVER_SHOW_DELAY_MS;
    }

    const rawDelay = target.getAttribute(TOOLTIP_DELAY_ATTR);
    if (rawDelay === null || rawDelay === '') {
      return HOVER_SHOW_DELAY_MS;
    }

    const parsedDelay = Number(rawDelay);
    if (!Number.isFinite(parsedDelay)) {
      return HOVER_SHOW_DELAY_MS;
    }

    return Math.max(0, parsedDelay);
  }

  function isTooltipVisible() {
    return !!(tooltipEl && tooltipEl.style.display === 'block');
  }

  /**
   * Shows a tooltip for the specified target element.
   * @function showTooltip
   * @memberof TooltipManager
   * @param {HTMLElement} target - The element to show tooltip for
   * @param {string} text - The tooltip text to display
   * @param {Event} [event] - Optional mouse event for positioning
   * @param {boolean} [isHtml=false] - Whether the text contains HTML
   */
  function showTooltip(target, text, event, isHtml = false) {
    if (isDragging) return; // Do not show tooltip while dragging
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
      if (tooltipEl) {
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
   * @memberof TooltipManager
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
   * @memberof TooltipManager
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
   * @memberof TooltipManager
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
   * @memberof TooltipManager
   */
  function attach() {
    document.addEventListener('mouseover', e => {
      if (isDragging) return;
      const el = closestFromTarget(e.target, TOOLTIP_SELECTOR);
      if (!el) return;
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

    // On click, update tooltip if data-tooltip changed
    document.addEventListener('click', e => {
      const el = closestFromTarget(e.target, TOOLTIP_SELECTOR);
      if (!el) return;
      const { isHtml, text } = readTooltipContent(el);
      if (currentTarget === el && isTooltipVisible()) {
        // If tooltip is already showing for this element, update text if changed
        const currentContent = isHtml ? tooltipEl.innerHTML : tooltipEl.textContent;
        // Basic check to prevent unnecessary updates, might not be perfect for HTML due to serialization differences but sufficient
        if (currentContent !== text && !isHtml) { // For simplicity, only check change on text
          showTooltip(el, text, e, isHtml);
        } else if (isHtml) {
          showTooltip(el, text, e, isHtml);
        }
      } else if (text) {
        showTooltip(el, text, e, isHtml);
      }
    });
  }
  attach();
  return {
    forceHide,
    formatFieldDefinitionTooltipHTML,
    formatStandardFilterTooltipHTML,
    hide: hideTooltip,
    show: showTooltip
  };
})();

/**
 * Standardized formatter for filter tooltips across the application.
 * Accepts flat filters or legacy grouped filters and generates structured HTML.
 * @param {Array|Object} filtersInput - Filters array or ui_config object
 * @param {string} [title=""] - Optional title for the tooltip
 * @returns {string} HTML string for data-tooltip-html
 */
function formatStandardFilterTooltipHTML(filtersInput, title = "") {
  const filters = normalizeUiConfigFilters(filtersInput);
  if (!filters || filters.length === 0) return '';
  
  let hasFilters = false;
  
  let html = '<div class="tt-filter-container">';
  if (title) {
      html += '<div class="tt-filter-title">' + title + '</div>';
  }
  html += '<ul class="tt-filter-list">';
  
  filters.forEach(f => {
    hasFilters = true;
    const fieldDef = window.fieldDefs ? window.fieldDefs.get(f.FieldName) : null;
    const op = formatFieldOperatorForDisplay(f.FieldOperator);
    const uiCond = mapFieldOperatorToUiCond(f.FieldOperator);
    
    let valStr = '';
    if (f.Values && f.Values.length > 0) {
        if (uiCond === 'between' && f.Values.length >= 2) {
            valStr = '<span class="tt-val">' + escapeHtml(f.Values[0]) + '</span> <span class="tt-op">and</span> <span class="tt-val">' + escapeHtml(f.Values[1]) + '</span>';
      } else if (fieldDef && fieldDef.allowValueList && f.Values.length > 1) {
        const values = getFilterDisplayValues({ cond: uiCond, val: f.Values.join(',') }, fieldDef);
        const summary = values[0] ? escapeHtml(values[0]) + ' <span class="tt-value-more">and ' + (values.length - 1) + ' more</span>' : '';
        valStr = '<div class="tt-val-stack"><div class="tt-val tt-val-summary">' + summary + '</div></div>';
        } else {
            valStr = '<span class="tt-val">' + escapeHtml(f.Values.join(', ')) + '</span>';
        }
    }
    
    html += '<li class="tt-filter-item">';
    html += '  <span class="tt-field">' + escapeHtml(f.FieldName || '') + '</span>';
    html += '  <span class="tt-op">' + escapeHtml(op) + '</span>';
    html += '  ' + valStr;
    html += '</li>';
  });
  
  html += '</ul></div>';
  
  return hasFilters ? html : '';
}

function formatFieldDefinitionTooltipHTML(fieldDef, options = {}) {
  if (!fieldDef || typeof fieldDef !== 'object') {
    return '';
  }

  const normalizedType = String(fieldDef.type || '').trim().toLowerCase();
  const normalizedNumberFormat = String(fieldDef.numberFormat || fieldDef.numericFormat || '').trim().toLowerCase();
  const categoryValue = typeof fieldDef.category === 'string'
    ? fieldDef.category.trim()
    : '';
  const descSource = typeof fieldDef.desc === 'string' && fieldDef.desc.trim()
    ? fieldDef.desc
    : (typeof fieldDef.description === 'string' ? fieldDef.description : '');
  const descValue = typeof descSource === 'string'
    ? descSource.trim()
    : '';
  const title = typeof options.title === 'string' ? options.title.trim() : '';
  const isFilterable = typeof window.isFieldBackendFilterable === 'function'
    ? window.isFieldBackendFilterable(fieldDef)
    : Array.isArray(fieldDef.filters) && fieldDef.filters.length > 0;
  const filterOperators = typeof window.getFieldFilterOperators === 'function'
    ? window.getFieldFilterOperators(fieldDef)
    : (Array.isArray(fieldDef.filters) ? fieldDef.filters : []);
  const typeLabel = (() => {
    if (normalizedType === 'money' || normalizedNumberFormat === 'currency') return 'Money';
    if (normalizedType === 'date') return 'Date';
    if (normalizedType === 'boolean') return 'Boolean';
    if (normalizedType === 'number') {
      if (normalizedNumberFormat === 'year') return 'Year';
      if (normalizedNumberFormat === 'decimal') return 'Decimal';
      return 'Integer';
    }
    if (normalizedType === 'string') return 'Text';
    return normalizedType ? normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1) : '';
  })();

  if (!title && !categoryValue && !descValue && !typeLabel && filterOperators.length === 0) {
    return '';
  }

  let html = '<div class="tt-filter-container tt-field-definition">';
  if (title) {
    html += '<div class="tt-filter-title">' + escapeHtml(title) + '</div>';
  }

  if (categoryValue) {
    html += '<div class="tt-field-definition-category">' + escapeHtml(categoryValue) + '</div>';
  }

  html += '<div class="tt-field-definition-meta">';
  if (typeLabel) {
    html += '<span class="tt-field-definition-badge data-type">' + escapeHtml(typeLabel) + '</span>';
  }
  html += '<span class="tt-field-definition-badge ' + (isFilterable ? 'filterable' : 'display-only') + '">';
  html += isFilterable ? 'Filterable' : 'Display only';
  html += '</span>';
  if (filterOperators.length > 0) {
    html += '<span class="tt-field-definition-meta-text">';
    html += filterOperators.length === 1 ? '1 backend operator' : filterOperators.length + ' backend operators';
    html += '</span>';
  }
  html += '</div>';

  if (descValue) {
    html += '<div class="tt-field-definition-desc">' + escapeHtml(descValue) + '</div>';
  }

  if (filterOperators.length > 0) {
    html += '<div class="tt-field-definition-operators">';
    html += filterOperators.map(operator => {
      const label = OperatorLabels.get(operator, operator);
      return '<span class="tt-field-definition-operator">' + escapeHtml(label) + '</span>';
    }).join('');
    html += '</div>';
  }

  html += '</div>';
  return html;
}
