/**
 * Custom Tooltip Component
 * Provides intelligent tooltip positioning and behavior for elements with data-tooltip attributes.
 * @module TooltipManager
 */
/**
 * Tooltip manager handling tooltip creation, positioning, and lifecycle.
 * @namespace TooltipManager
 */
const TooltipManager = (() => {
  const TOOLTIP_SELECTOR = '[data-tooltip], [data-tooltip-html]';
  let tooltipEl = null;
  let arrowEl = null;
  let currentTarget = null;
  let hideTimeout = null;
  let isDragging = false; // Track drag state

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
  }

  /**
   * Hides the currently visible tooltip with a delay.
   * @function hideTooltip
   * @memberof TooltipManager
   */
  function hideTooltip() {
    if (!tooltipEl) return;

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
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    hideTooltipElement();
    currentTarget = null;
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
    if (event && event.type && event.type.startsWith('mouse')) {
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
      if (text) showTooltip(el, text, e, isHtml);
    });

    document.addEventListener('mousemove', e => {
      if (isDragging) return;
      if (currentTarget && isTooltipVisible()) {
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
          // Check if mouse is still reasonably close to the target element
          const rect = currentTarget.getBoundingClientRect();
          const mouseX = e.clientX;
          const mouseY = e.clientY;
          
          // If mouse is far from the target (with generous buffer), hide tooltip
          if (mouseX < rect.left - 50 || mouseX > rect.right + 50 || 
              mouseY < rect.top - 50 || mouseY > rect.bottom + 50) {
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
    document.addEventListener('dragend', () => {
      isDragging = false;
    });

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
  return { show: showTooltip, hide: hideTooltip, forceHide: forceHide };
})();

/**
 * Standardized formatter for filter tooltips across the application.
 * Accepts an array of FilterGroups and generates structured HTML.
 * @param {Array} filterGroups - Array of groups containing {LogicalOperator, Filters: [{FieldName, FieldOperator, Values}]}
 * @param {string} [title=""] - Optional title for the tooltip
 * @returns {string} HTML string for data-tooltip-html
 */
window.formatStandardFilterTooltipHTML = function(filterGroups, title = "") {
  if (!filterGroups || filterGroups.length === 0) return '';
  
  let hasFilters = false;
  
  let html = '<div class="tt-filter-container">';
  if (title) {
      html += '<div class="tt-filter-title">' + title + '</div>';
  }
  html += '<ul class="tt-filter-list">';
  
  filterGroups.forEach((group, gIdx) => {
    if (!group.Filters || group.Filters.length === 0) return;
    
    // Support OR/AND logic between groups if necessary
    if (gIdx > 0) {
        let logicOp = group.LogicalOperator || 'AND';
        html += '<li class="tt-logic">' + logicOp.toUpperCase() + '</li>';
    }
    
    group.Filters.forEach((f, fIdx) => {
      hasFilters = true;
      const op = typeof window.formatFieldOperatorForDisplay === 'function'
        ? window.formatFieldOperatorForDisplay(f.FieldOperator)
        : f.FieldOperator;
      const uiCond = typeof window.mapFieldOperatorToUiCond === 'function'
        ? window.mapFieldOperatorToUiCond(f.FieldOperator)
        : String(f.FieldOperator || '').toLowerCase();
      
      let valStr = '';
      if (f.Values && f.Values.length > 0) {
          if (uiCond === 'between' && f.Values.length >= 2) {
              valStr = '<span class="tt-val">' + escapeHtml(f.Values[0]) + '</span> <span class="tt-op">and</span> <span class="tt-val">' + escapeHtml(f.Values[1]) + '</span>';
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
  });
  
  html += '</ul></div>';
  
  return hasFilters ? html : '';
};

// Helper function to escape HTML to prevent XSS in tooltips
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
