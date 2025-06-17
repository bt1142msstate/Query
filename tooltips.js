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
  let tooltipEl = null;
  let arrowEl = null;
  let currentTarget = null;
  let hideTimeout = null;
  let isDragging = false; // Track drag state

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

  /**
   * Shows a tooltip for the specified target element.
   * @function showTooltip
   * @memberof TooltipManager
   * @param {HTMLElement} target - The element to show tooltip for
   * @param {string} text - The tooltip text to display
   * @param {Event} [event] - Optional mouse event for positioning
   */
  function showTooltip(target, text, event) {
    if (isDragging) return; // Do not show tooltip while dragging
    if (!tooltipEl) createTooltip();

    // Clear any pending hide timeout
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    tooltipEl.textContent = '';
    tooltipEl.appendChild(arrowEl); // keep arrow at end
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.setAttribute('aria-live', 'polite');
    tooltipEl.style.display = 'block';
    tooltipEl.classList.add('show');
    tooltipEl.style.opacity = '0';
    // Set text
    tooltipEl.insertBefore(document.createTextNode(text), arrowEl);
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

    tooltipEl.classList.remove('show');
    tooltipEl.style.opacity = '0';

    hideTimeout = setTimeout(() => {
      if (tooltipEl) {
        tooltipEl.style.display = 'none';
        tooltipEl.textContent = '';
        tooltipEl.appendChild(arrowEl);
      }
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
    if (tooltipEl) {
      tooltipEl.classList.remove('show');
      tooltipEl.style.opacity = '0';
      tooltipEl.style.display = 'none';
      tooltipEl.textContent = '';
      tooltipEl.appendChild(arrowEl);
    }
    currentTarget = null;
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
    let arrowOffset = tooltipEl.offsetWidth / 2; // default: center
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
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      const text = el.getAttribute('data-tooltip');
      if (text) showTooltip(el, text, e);
    });

    document.addEventListener('mousemove', e => {
      if (isDragging) return;
      if (currentTarget && tooltipEl && tooltipEl.style.display === 'block') {
        positionTooltip(currentTarget, e);
      }
    });

    document.addEventListener('mouseout', e => {
      const el = e.target.closest('[data-tooltip]');
      if (el) hideTooltip();
    });

    document.addEventListener('focusin', e => {
      if (isDragging) return;
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      const text = el.getAttribute('data-tooltip');
      if (text) showTooltip(el, text);
    });

    document.addEventListener('focusout', e => {
      if (e.target.closest('[data-tooltip]')) hideTooltip();
    });

    // Hide tooltip on scroll or escape
    window.addEventListener('scroll', forceHide);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') forceHide();
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
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      const text = el.getAttribute('data-tooltip');
      if (currentTarget === el && tooltipEl && tooltipEl.style.display === 'block') {
        // If tooltip is already showing for this element, update text if changed
        if (tooltipEl.textContent !== text) {
          showTooltip(el, text, e);
        }
      } else if (text) {
        showTooltip(el, text, e);
      }
    });
  }
  attach();
  return { show: showTooltip, hide: hideTooltip, forceHide: forceHide };
})();
