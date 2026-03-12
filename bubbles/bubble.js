/**
 * Bubble UI component class for field selection and filtering.
 * Represents a draggable field that can be clicked to set filters.
 * @class Bubble
 */
class Bubble {
  /**
   * Creates a new Bubble instance.
   * @constructor
   * @param {Object} def - Field definition object
   * @param {string} def.name - Field name
   * @param {string} def.type - Field data type
   * @param {string} def.desc - Field description
   * @param {Array} [def.values] - Predefined values for the field
   * @param {Array} [def.filters] - Available filter conditions
   * @param {Object} [state={}] - Initial state object
   */
  constructor(def, state = {}) {
    this.def = def;
    this.state = state;
    this.el = document.createElement('div');
    this.el.className = 'bubble';
    this.el.tabIndex = 0;
    this.update();
  }

  /**
   * Updates the bubble's visual state and properties.
   * Applies styling, tooltips, and drag behavior based on current state.
   * @method update
   * @param {Object} [state={}] - State updates to apply
   */
  update(state = {}) {
    Object.assign(this.state, state);
    const { def } = this;
    const fieldName = def.name;
    this.el.textContent = fieldName;
    if (def.type) {
      this.el.dataset.type = def.type;
    } else {
      delete this.el.dataset.type;
    }
    if (def.values) this.el.dataset.values = JSON.stringify(def.values);
    if (def.filters) this.el.dataset.filters = JSON.stringify(def.filters);
    
    // Tooltip construction
    let categoryValue = def.category || '';
    let descValue = def.desc || '';
    
    // Build a fake FilterGroups array for this field from activeFilters
    const af = activeFilters[fieldName];
    let filterTooltipHtml = '';
    
    if (af && af.filters && af.filters.length > 0) {
      const fakeGroup = [{
        LogicalOperator: af.logical,
        Filters: af.filters.map(f => ({
          FieldName: fieldName,
          FieldOperator: mapBubbleConditionToFieldOperator(f.cond),
          Values: f.cond === 'between' ? f.val.split('|') : f.val.split(',')
        }))
      }];
      filterTooltipHtml = window.formatStandardFilterTooltipHTML(fakeGroup, "Active Filters");
    }

    let tooltipContentHtml = '';
    
    if (categoryValue || filterTooltipHtml) {
      if (categoryValue || descValue) {
        tooltipContentHtml += `<div class="tt-filter-container" style="${filterTooltipHtml ? 'margin-bottom: 12px;' : ''}">`;
        
        if (categoryValue) {
          let titleStyle = (!descValue) ? 'border-bottom: none; margin-bottom: 0; padding-bottom: 0;' : '';
          tooltipContentHtml += `<div class="tt-filter-title" style="color: #93c5fd; display: flex; align-items: center; gap: 6px; ${titleStyle}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            ${categoryValue}
          </div>`;
        }
        
        if (descValue) {
          tooltipContentHtml += `<div style="color: #f8fafc; font-size: 0.95rem; line-height: 1.4; padding-top: 2px;">${descValue}</div>`;
        }
        
        tooltipContentHtml += `</div>`;
      }
      
      if (filterTooltipHtml) {
        tooltipContentHtml += filterTooltipHtml;
      }
    }

    if (tooltipContentHtml) {
      this.el.removeAttribute('data-tooltip');
      this.el.setAttribute('data-tooltip-html', tooltipContentHtml);
    } else if (descValue) {
      // Fallback just in case
      this.el.removeAttribute('data-tooltip-html');
      this.el.setAttribute('data-tooltip', descValue);
    } else {
      this.el.removeAttribute('data-tooltip');
      this.el.removeAttribute('data-tooltip-html');
    }

    if (def.is_buildable || displayedFields.includes(fieldName)) {
      this.el.setAttribute('draggable', 'false');
    } else {
      this.el.setAttribute('draggable', 'true');
    }
    if (animatingBackBubbles.has(fieldName)) {
      this.el.dataset.animatingBack = 'true';
      this.el.style.visibility = 'hidden';
      this.el.style.opacity = '0';
    } else {
      this.el.style.visibility = '';
      this.el.style.opacity = '';
      this.el.removeAttribute('data-animating-back');
    }

    // If the overlay is closed, clear any stale disabled visuals that may linger after rapid close/open cycles.
    const overlayEl = getBubbleOverlayElement();
    const isOverlayOpen = !!(overlayEl && overlayEl.classList.contains('show'));
    if (!isOverlayOpen) {
      this.el.classList.remove('bubble-disabled');
      this.el.style.filter = '';
      this.el.removeAttribute('data-filter-for');
    }

    applyCorrectBubbleStyling(this.el);
  }

  /**
   * Returns the DOM element for this bubble.
   * @method getElement
   * @returns {HTMLElement} The bubble's DOM element
   */
  getElement() {
    return this.el;
  }
}

function getBubbleOverlayElement() {
  return window.DOM?.overlay || document.getElementById('overlay');
}

function getBubbleConditionPanelElement() {
  return window.DOM?.conditionPanel || document.getElementById('condition-panel');
}

function getBubbleInputWrapperElement() {
  return window.DOM?.inputWrapper || document.getElementById('condition-input-wrapper');
}

function getBubbleConditionInputElement() {
  return window.DOM?.conditionInput || document.getElementById('condition-input');
}

function getBubbleConfirmButtonElement() {
  return window.DOM?.confirmBtn || document.getElementById('confirm-btn');
}

function getBubbleFilterCardElement() {
  return document.getElementById('filter-card') || window.filterCard || null;
}

function getBubbleFilterCardTitleElement(filterCard = getBubbleFilterCardElement()) {
  return (filterCard && filterCard.querySelector('#filter-card-title')) || document.getElementById('filter-card-title');
}

function mapBubbleConditionToFieldOperator(condition) {
  if (typeof window.mapUiCondToFieldOperator === 'function') {
    return window.mapUiCondToFieldOperator(condition);
  }

  const normalized = String(condition || '').trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Equals';
}

const BUBBLE_VISIBLE_ROWS = 2;

function getBubbleMaxStartRow() {
  if (window.BubbleRender && typeof window.BubbleRender.getBubbleMaxStartRow === 'function') {
    return window.BubbleRender.getBubbleMaxStartRow();
  }
  if (typeof totalRows === 'undefined') return 0;
  return Math.max(0, totalRows - BUBBLE_VISIBLE_ROWS);
}

function clampBubbleScrollRow(nextRow) {
  if (window.BubbleRender && typeof window.BubbleRender.clampBubbleScrollRow === 'function') {
    return window.BubbleRender.clampBubbleScrollRow(nextRow);
  }
  const numericRow = Number.isFinite(nextRow) ? nextRow : 0;
  const roundedRow = Math.round(numericRow);
  return Math.max(0, Math.min(getBubbleMaxStartRow(), roundedRow));
}

function applyBubbleScrollRow(nextRow, options = {}) {
  if (window.BubbleRender && typeof window.BubbleRender.applyBubbleScrollRow === 'function') {
    return window.BubbleRender.applyBubbleScrollRow(nextRow, options);
  }
  return false;
}

function scrollBubblesByRows(deltaRows) {
  if (window.BubbleRender && typeof window.BubbleRender.scrollBubblesByRows === 'function') {
    return window.BubbleRender.scrollBubblesByRows(deltaRows);
  }
  return false;
}

function resetBubbleScroll() {
  if (window.BubbleRender && typeof window.BubbleRender.resetBubbleScroll === 'function') {
    window.BubbleRender.resetBubbleScroll();
  }
}

function bubbleDebugLog(eventName, payload = {}) {
  if (!window) return;
  const debugEnabled = window.BUBBLE_DEBUG === true || (window.localStorage && window.localStorage.getItem('BUBBLE_DEBUG') === '1');
  if (!debugEnabled) return;
  try {
    console.log(`[BubbleDebug] ${eventName}`, payload);
  } catch (_) {
    // Never allow debug logging to interfere with UI interactions.
  }
}

if (typeof window !== 'undefined' && typeof window.setBubbleDebug !== 'function') {
  window.setBubbleDebug = function setBubbleDebug(enabled = true) {
    const nextValue = !!enabled;
    window.BUBBLE_DEBUG = nextValue;
    try {
      window.localStorage && window.localStorage.setItem('BUBBLE_DEBUG', nextValue ? '1' : '0');
    } catch (_) {
      // Ignore storage restrictions.
    }
    console.log(`[BubbleDebug] ${nextValue ? 'enabled' : 'disabled'}`);
  };
}

/**
 * Applies correct styling to a bubble element based on its filter state.
 * Adds purple styling for filtered fields, removes it for unfiltered fields.
 * @function applyCorrectBubbleStyling
 * @param {HTMLElement} bubbleElement - The bubble DOM element to style
 */
function applyCorrectBubbleStyling(bubbleElement) {
  if (!bubbleElement) return;
  
  const fieldName = bubbleElement.textContent.trim();
  
  // Use global base function directly to avoid dependency on query.js
  if (window.shouldFieldHavePurpleStylingBase(fieldName, window.displayedFields, window.activeFilters)) {
    bubbleElement.classList.add('bubble-filter');
    bubbleElement.setAttribute('data-filtered', 'true');
  } else {
    bubbleElement.classList.remove('bubble-filter');
    bubbleElement.removeAttribute('data-filtered');
  }

  // Aura only when the field has actual filter conditions set (not just displayed)
  const hasActiveFilters = !!(window.activeFilters?.[fieldName]?.filters?.length);
  bubbleElement.classList.toggle('bubble-active-filter', hasActiveFilters);
}

/**
 * Creates a new bubble or updates an existing one using the Bubble class.
 * Reuses existing bubble instances when possible for performance.
 * @function createOrUpdateBubble
 * @param {Object} def - Field definition object
 * @param {HTMLElement|null} [existingBubble=null] - Existing bubble element to update
 * @returns {HTMLElement} The bubble DOM element
 */
function createOrUpdateBubble(def, existingBubble = null) {
  if (window.BubbleRender && typeof window.BubbleRender.createOrUpdateBubble === 'function') {
    return window.BubbleRender.createOrUpdateBubble(def, existingBubble);
  }

  let bubbleInstance;
  if (existingBubble && existingBubble._bubbleInstance) {
    bubbleInstance = existingBubble._bubbleInstance;
    bubbleInstance.update();
    return bubbleInstance.getElement();
  }

  bubbleInstance = new Bubble(def);
  const el = bubbleInstance.getElement();
  el._bubbleInstance = bubbleInstance;
  return el;
}

/**
 * Renders all bubbles for the current category and search filter.
 * Handles different categories (All, Selected, specific categories) with appropriate ordering.
 * @function renderBubbles
 */
function renderBubbles(){
  if (window.BubbleRender && typeof window.BubbleRender.renderBubbles === 'function') {
    return window.BubbleRender.renderBubbles();
  }
}

function safeRenderBubbles() {
  if (window.BubbleRender && typeof window.BubbleRender.safeRenderBubbles === 'function') {
    return window.BubbleRender.safeRenderBubbles();
  }
}

/**
 * Updates the custom scrollbar for the bubble container.
 * Creates a CSS gradient track and scales thumb proportionally.
 * @function updateScrollBar
 */
function updateScrollBar(){
  if (window.BubbleRender && typeof window.BubbleRender.updateScrollBar === 'function') {
    return window.BubbleRender.updateScrollBar();
  }
}

function buildConditionPanel(bubble) {
  if (window.BubbleConditionPanel && typeof window.BubbleConditionPanel.buildConditionPanel === 'function') {
    return window.BubbleConditionPanel.buildConditionPanel(bubble);
  }
}

/**
 * Creates visual water-like splash particles when a bubble pops into the filter card
 * @param {HTMLElement} bubbleClone The final enlarged bubble clone element
 */
window.createBubblePopParticles = function(bubbleClone) {
  const rect = bubbleClone.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const numParticles = 25;

  for (let i = 0; i < numParticles; i++) {
    const particle = document.createElement('div');
    particle.className = 'bubble-particle';
    particle.style.zIndex = getComputedStyle(bubbleClone).zIndex;
    
    // Pick a random angle around the circle
    const angle = Math.random() * Math.PI * 2;
    // Set an initial position somewhat near the edge of the expanded container
    const radiusX = (rect.width / 2) * (0.8 + Math.random() * 0.3);
    const radiusY = (rect.height / 2) * (0.8 + Math.random() * 0.3);
    
    const startX = centerX + Math.cos(angle) * radiusX;
    const startY = centerY + Math.sin(angle) * radiusY;

    // Set origin
    particle.style.left = `${startX}px`;
    particle.style.top = `${startY}px`;

    // Randomize drop size
    const size = Math.random() * 10 + 4; // Between 4px and 14px
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;

    // Calculate outward explosion velocity
    const burstSpeed = 20 + Math.random() * 50; 
    const travelX = Math.cos(angle) * burstSpeed;
    // Add downward gravity onto the Y travel
    const gravity = 60 + Math.random() * 60;
    const travelY = Math.sin(angle) * burstSpeed + gravity;

    // Apply CSS variables for the animation
    particle.style.setProperty('--tx', `${travelX}px`);
    particle.style.setProperty('--ty', `${travelY}px`);

    // Randomize slightly off-sync durations
    const duration = 0.35 + Math.random() * 0.25; 
    particle.style.animation = `bubble-pop-anim ${duration}s ease-in forwards`;

    document.body.appendChild(particle);

    // Clean up
    setTimeout(() => {
      if (particle.parentNode) particle.remove();
    }, duration * 1000);
  }
}

/**
 * Initializes the bubble system with event handlers and initial rendering.
 * Sets up scroll handling, click events, and drag/drop functionality.
 * @function initializeBubbles
 * @returns {boolean} True if initialization succeeded, false if required globals unavailable
 */
function initializeBubbles() {
  // Only initialize if all required globals are available
  if (typeof activeFilters === 'undefined' || typeof displayedFields === 'undefined') {
    console.log('Bubble system: Required globals not yet available, skipping initialization');
    return false;
  }
  
  try {
    // Initial render
    renderBubbles();
  } catch (error) {
    console.error('Error during bubble initialization:', error);
    return false;
  }

  // Prevent double-binding event listeners on multiple calls
  if (window._bubbleEventsInitialized) return true;
  window._bubbleEventsInitialized = true;

  // Attach mouseenter / mouseleave on bubble grid & scrollbar (for arrow-key scroll)
  const bubbleContainer   = document.getElementById('bubble-container');
  const scrollContainer   = document.querySelector('.bubble-scrollbar-container');
  [bubbleContainer, scrollContainer].forEach(el=>{
    if(!el) return;
    el.addEventListener('mouseenter', ()=> hoverScrollArea = true);
    el.addEventListener('mouseleave', ()=> hoverScrollArea = false);
  });

  // Wheel scroll support for bubble grid / scrollbar
  function handleWheelScroll(e){
    e.preventDefault();          // keep page from scrolling
    const delta = e.deltaY > 0 ? 1 : -1;
    scrollBubblesByRows(delta);
  }

  // Listen for wheel events when hovering over grid or custom scrollbar
  [bubbleContainer, scrollContainer].forEach(el=>{
    if(!el) return;
    el.addEventListener('wheel', handleWheelScroll, { passive:false });
  });

  // Add scrollbar thumb dragging functionality
  const thumb = document.getElementById('bubble-scrollbar-thumb');
  const track = document.getElementById('bubble-scrollbar-track');
  
  if (thumb && track) {
    let isDragging = false;
    let startY = 0;
    let startScrollRow = 0;
    
    // Thumb drag functionality
    thumb.addEventListener('mousedown', (e) => {
      isDragging = true;
      startY = e.clientY;
      startScrollRow = scrollRow;
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const deltaY = e.clientY - startY;
      const trackHeight = track.clientHeight;
      const thumbHeight = thumb.clientHeight;
      const maxScrollPixels = trackHeight - thumbHeight;
      const maxStartRow = getBubbleMaxStartRow();
      
      if (maxScrollPixels <= 0) return;

      const startRatio = maxStartRow > 0 ? (startScrollRow / maxStartRow) : 0;
      let newY = (startRatio * maxScrollPixels) + deltaY;
      newY = Math.max(0, Math.min(maxScrollPixels, newY));
      
      const newRatio = newY / maxScrollPixels;
      const exactRow = newRatio * maxStartRow;
      const newRow = Math.round(exactRow);

      applyBubbleScrollRow(newRow);
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
      }
    });
    
    // Track click functionality - jump to clicked position
    track.addEventListener('click', (e) => {
      if (e.target === thumb) return; // Don't handle clicks on thumb
      
      const rect = track.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const trackHeight = track.clientHeight;
      const thumbHeight = thumb.clientHeight;
      const maxScrollPixels = trackHeight - thumbHeight;
      const maxStartRow = getBubbleMaxStartRow();
      
      if (maxScrollPixels <= 0) return;
      
      // Center the thumb rigidly on the click coordinate
      let targetY = clickY - (thumbHeight / 2);
      targetY = Math.max(0, Math.min(maxScrollPixels, targetY));
      
      const ratio = targetY / maxScrollPixels;
      const newRow = Math.max(0, Math.min(maxStartRow, Math.round(ratio * maxStartRow)));

      applyBubbleScrollRow(newRow);
    });
  }

  // --- Keep bubble scrollbar height in sync on window resize ---
  window.addEventListener('resize', () => {
    const container = document.getElementById('bubble-container');
    const listDiv   = document.getElementById('bubble-list');
    const scrollCont= document.querySelector('.bubble-scrollbar-container');
    if (!container || !listDiv || !scrollCont) return;
    const firstBubble = listDiv.querySelector('.bubble');
    if (!firstBubble) return;
    const gapVal = getComputedStyle(listDiv).getPropertyValue('gap') || '0px';
    const gap    = parseFloat(gapVal) || 0;
    const fudge = 8;
    const twoRowsH = (firstBubble.getBoundingClientRect().height + gap) * 2 - gap;
    const paddedH  = twoRowsH + 12 - fudge;     // match render logic
    const sixColsW = firstBubble.offsetWidth * 6 + gap * 5;
    container.style.height = paddedH + 'px';
    container.style.width  = sixColsW  + 'px';
    scrollCont.style.height = paddedH + 'px';
    applyBubbleScrollRow(scrollRow, { force: true });
  });

  // Delegated bubble click events
  document.addEventListener('click', e=>{
    const overlay = getBubbleOverlayElement();
    const conditionPanel = getBubbleConditionPanelElement();
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    const bubble = targetEl ? targetEl.closest('.bubble') : null;
    bubbleDebugLog('document.click', {
      rawTargetNodeType: e.target && e.target.nodeType,
      targetTag: targetEl && targetEl.tagName,
      targetClass: targetEl && targetEl.className,
      resolvedBubble: bubble ? bubble.textContent.trim() : null,
      hasActiveBubble: !!document.querySelector('.active-bubble, .bubble-clone'),
      isBubbleAnimating: !!window.isBubbleAnimating,
      isOverlayOpen: !!(overlay && overlay.classList.contains('show'))
    });

    if (window.modalManager && window.modalManager.isInputLocked) {
      bubbleDebugLog('click.blocked.inputLocked');
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if(!bubble) return;
    
    // Disable opening index cards and modifying conditions while querying
    if (window.queryRunning) {
      bubbleDebugLog('click.blocked.queryRunning', { bubble: bubble.textContent.trim() });
      if (window.showToastMessage) window.showToastMessage("Cannot edit conditions while a query is running", "warning");
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    // Prevent duplicate active bubble
    if(document.querySelector('.active-bubble, .bubble-clone')) {
      bubbleDebugLog('click.blocked.activeBubbleAlreadyOpen', { bubble: bubble.textContent.trim() });
      return;
    }
    // Prevent clicking bubbles while animation is running
    if (window.isBubbleAnimating) {
      bubbleDebugLog('click.blocked.isBubbleAnimating', { bubble: bubble.textContent.trim() });
      return;
    }
    window.isBubbleAnimating = true;
    window.lockInput && window.lockInput(600); // Lock input for animation duration + buffer (adjust as needed)

    // Store current category so it doesn't get reset
    const savedCategory = currentCategory; 

    // Animate clone to centre + build panel
    const rect = bubble.getBoundingClientRect();
    // Look up description for this field (no longer used for index card)
    const fieldName = bubble.textContent.trim();
    bubbleDebugLog('click.open.start', { fieldName });
    // const descText = (fieldDefs.find(d => d.name === fieldName) || {}).desc || '';
    const clone = bubble.cloneNode(true);
    clone.dataset.filterFor = fieldName;
    clone.classList.add('bubble-clone');
    // Remove all index card/descEl logic here
    clone._origin = bubble;
    // Store the original position for accurate return animation
    clone._originalRect = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
    clone.style.position='fixed';
    clone.style.top = rect.top+'px';
    clone.style.left=rect.left+'px';
    clone.style.pointerEvents = 'none';
    clone.style.color = getComputedStyle(bubble).color;
    document.body.appendChild(clone);
    bubble.classList.add('bubble-disabled');
    bubble.style.opacity = '0';          // hide origin immediately
    bubble.dataset.filterFor = bubble.textContent.trim();          // add attribute

    // Ensure filter card is attached BEFORE calling buildConditionPanel
    let filterCard = getBubbleFilterCardElement();
    if (filterCard && !document.getElementById('filter-card')) {
      document.body.appendChild(filterCard);
      // force layout recalculation so transition works
      filterCard.offsetHeight;
    }
    if (!window.filterCard && filterCard) {
      window.filterCard = filterCard;
    }

    if (overlay) {
      overlay.classList.add('show');
    }
    if (window.BubbleConditionPanel && window.BubbleConditionPanel.buildConditionPanel) {
      window.BubbleConditionPanel.buildConditionPanel(bubble);
    }

    // --- Pre-populate filter card to accurately measure target dimensions ---
    const inputWrapper = getBubbleInputWrapperElement() || (filterCard ? filterCard.querySelector('#condition-input-wrapper') : null);
    if (filterCard) {
      const titleEl = getBubbleFilterCardTitleElement(filterCard);
      if (titleEl) titleEl.textContent = fieldName;
    }
    const defaultBtn = conditionPanel
      ? (conditionPanel.querySelector('.condition-btn[data-cond="equals"]') || conditionPanel.querySelector('.condition-btn'))
      : null;
    if (defaultBtn) {
      defaultBtn.classList.add('active');
      if(window.handleConditionBtnClick) window.handleConditionBtnClick({ currentTarget: defaultBtn, stopPropagation(){}, preventDefault(){} });
    }
    if (window.renderConditionList) {
      window.renderConditionList(fieldName);
    }
    if (inputWrapper && activeFilters[fieldName]) {
      inputWrapper.classList.add('show');
    }
    
    let targetWidth = 480;
    let targetHeight = 350;
    if (filterCard) {
      const fcRect = filterCard.getBoundingClientRect();
      if(fcRect.width > 0) targetWidth = fcRect.width;
      if(fcRect.height > 0) targetHeight = fcRect.height;
    }
    
    // Scale animation duration based on target expanding size
    const morphDuration = Math.max(0.35, (targetWidth + targetHeight) / 1800);
    clone.style.setProperty('--morph-duration', `${morphDuration}s`);
    
    // Restore the saved category
    currentCategory = savedCategory;
    // Re-sync category bar UI to match the preserved category
    document.querySelectorAll('#category-bar .category-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.category === currentCategory)
    );

    clone.addEventListener('transitionend',function t(e){
      bubbleDebugLog('clone.transitionend', {
        fieldName,
        propertyName: e.propertyName,
        enlarged: clone.classList.contains('enlarge-bubble')
      });
      if(!clone.classList.contains('enlarge-bubble')){
        // Only trigger the enlarge phase once a primary positioning transition finishes
        if(e.propertyName === 'top' || e.propertyName === 'left' || e.propertyName === 'transform') {
          // Apply exact computed dimensions for the morph
          requestAnimationFrame(() => {
            clone.classList.add('enlarge-bubble');
            clone.style.setProperty('width', `${targetWidth}px`, 'important');
            clone.style.setProperty('height', `${targetHeight}px`, 'important');
          });
        }
        return;
      }
      
      // Enlarge phase is ongoing, wait for width or height to finish
      if(e.propertyName !== 'width' && e.propertyName !== 'height') return;

      if (conditionPanel) {
        conditionPanel.classList.add('show');
      }
      // Reveal the unified filter card
      if (filterCard) {
        filterCard.classList.add('show');
      }
      // Hide the bubble clone with a pop and reveal the card
      clone.classList.add('popping');
      window.createBubblePopParticles(clone);
      
      // Removed duplicate pre-activation code since we did it above
      clone.removeEventListener('transitionend',t);
      // Animation is done, allow bubble clicks again
      window.isBubbleAnimating = false;
      bubbleDebugLog('click.open.complete', { fieldName });
      // (input lock will be released by timer)
    });
    requestAnimationFrame(()=> clone.classList.add('active-bubble'));

    // After: clone._origin = bubble;
    setTimeout(() => {
      if (!document.body.contains(clone._origin)) {
        // Try to find the creator bubble again
        let baseFieldName = fieldName;
        const fieldDef = window.fieldDefs ? window.fieldDefs.get(fieldName) : null;
        if (fieldDef && fieldDef.special_payload) {
          // It's a generated field, probably originated from its category base (e.g., 'Marc')
          baseFieldName = fieldDef.category; 
        }
        
        const fallbackBubble = Array.from(document.querySelectorAll('.bubble')).find(b => b.textContent.trim() === baseFieldName);
        if (fallbackBubble) clone._origin = fallbackBubble;
      }
    }, 60);
    if (clone && overlay) overlay.classList.add('bubble-active');
    const headerBar = window.DOM?.headerBar || document.getElementById('header-bar');
    if (clone && headerBar) headerBar.classList.add('header-hide');
  });

  // Hover diagnostics for bubbles, even when tooltip attributes are absent.
  document.addEventListener('mouseover', e => {
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    const bubble = targetEl ? targetEl.closest('.bubble') : null;
    if (!bubble) return;
    bubbleDebugLog('bubble.mouseover', {
      bubble: bubble.textContent ? bubble.textContent.trim() : null,
      targetTag: targetEl && targetEl.tagName,
      targetClass: targetEl && targetEl.className
    });
  });

  document.addEventListener('mouseout', e => {
    const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
    const bubble = targetEl ? targetEl.closest('.bubble') : null;
    if (!bubble) return;
    const relatedEl = e.relatedTarget instanceof Element
      ? e.relatedTarget
      : e.relatedTarget && e.relatedTarget.parentElement;
    const stayedWithinBubble = !!(relatedEl && bubble.contains(relatedEl));
    bubbleDebugLog('bubble.mouseout', {
      bubble: bubble.textContent ? bubble.textContent.trim() : null,
      relatedTag: relatedEl && relatedEl.tagName,
      relatedClass: relatedEl && relatedEl.className,
      stayedWithinBubble
    });
  });
  
  return true;
}

/**
 * Restores bubble interaction and visual state after close/reset paths.
 * Prevents stale disabled bubbles when close occurs mid-animation.
 * @param {Set<string>} [skipFields] - Optional fields to skip while fly-back is active.
 */
function reconcileBubbleInteractionState(skipFields = new Set()) {
  const bubbles = Array.from(document.querySelectorAll('.bubble'));
  bubbles.forEach(b => {
    const fieldName = b.textContent ? b.textContent.trim() : '';
    if (skipFields.has(fieldName)) return;
    b.classList.remove('bubble-disabled');
    b.style.visibility = '';
    b.style.opacity = '';
    b.removeAttribute('data-filter-for');
    window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(b);
  });
}

/**
 * Resets active/enlarged bubbles, animating them back to their original position.
 * Handles the cleanup of clones and restoration of original bubbles.
 */
function resetActiveBubbles() {
  // Always clear any generic animating flag so we aren't stuck preventing clicks if closed early
  window.isBubbleAnimating = false;
  
  // Ensure input lock is always cleared
  if (window.ModalSystem) {
    window.ModalSystem.lockInput(0);
  }
  
  const clones = document.querySelectorAll('.active-bubble, .bubble-clone');
  bubbleDebugLog('reset.start', { cloneCount: clones.length });
  if (clones.length > 0) window.isBubbleAnimatingBack = true; 
  
  clones.forEach(clone => {
    const origin = clone._origin;
    const originInDOM = origin && document.body.contains(origin);
    const fieldName = origin ? origin.textContent.trim() : (clone.textContent ? clone.textContent.trim() : '');

    if (originInDOM) {
      if (window.animatingBackBubbles) window.animatingBackBubbles.add(fieldName);
      
      const originalRect = clone._originalRect;
      
      // Restore bubble clone visibility before fly-back
      clone.style.opacity = '1';
      
      // Override standard CSS to apply a smooth "all" transition while returning back
      clone.style.transition = 'all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
      
      // Disable backdrop filter which causes massive GPU redraw lag during active layout reflows!
      clone.style.backdropFilter = 'none';
      clone.style.webkitBackdropFilter = 'none';

      if (originalRect) {
        clone.style.top  = originalRect.top + 'px';
        clone.style.left = originalRect.left + 'px';
        if (originalRect.width) clone.style.width = originalRect.width + 'px';
        if (originalRect.height) clone.style.height = originalRect.height + 'px';
      } else {
        const nowRect = origin.getBoundingClientRect();
        clone.style.top  = nowRect.top + 'px';
        clone.style.left = nowRect.left + 'px';
      }
      
      clone.style.transform = 'translate(0, 0)'; 
      // Unset these so they animate naturally back to inherited .bubble styles
      clone.style.fontSize = ''; 
      clone.style.padding = '';

      origin.style.opacity = '0';
      origin.style.visibility = 'hidden';
      
      clone.classList.remove('enlarge-bubble');
      clone.classList.remove('active-bubble');
      clone.classList.remove('bubble-clone');
      
      clone.addEventListener('transitionend', () => {
        bubbleDebugLog('reset.clone.transitionend', { fieldName });
        clone.remove();
        if (window.animatingBackBubbles) window.animatingBackBubbles.delete(fieldName);
        
        requestAnimationFrame(() => {
          const bubbles = Array.from(document.querySelectorAll('.bubble'));
          bubbles.forEach(b => {
             if (b.textContent.trim() === fieldName) {
                const stillExists = window.fieldDefs.has(fieldName) && window.shouldFieldHavePurpleStyling(fieldName);
                if (!stillExists && window.currentCategory === 'Selected') {
                    b.remove();
                } else {
                    b.style.visibility = '';
                    b.style.opacity = '1';
                    b.classList.remove('bubble-disabled');
                  b.removeAttribute('data-filter-for');
                    window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(b);
                }
             }
          });
        });
        
        if (window.animatingBackBubbles && window.animatingBackBubbles.size === 0) {
            window.isBubbleAnimatingBack = false;
            if (window.pendingRenderBubbles) {
                window.BubbleSystem.renderBubbles();
                window.pendingRenderBubbles = false;
            }
            reconcileBubbleInteractionState();
            bubbleDebugLog('reset.complete', { reason: 'all-transitionend' });
        }
      }, { once: true });
    } else {
      clone.remove();
      bubbleDebugLog('reset.clone.removedWithoutOrigin', { fieldName });
      if (origin) {
         if (window.animatingBackBubbles) window.animatingBackBubbles.delete(fieldName);
         const matchingBubble = Array.from(document.querySelectorAll('.bubble'))
              .find(b => b.textContent.trim() === fieldName);
          if (matchingBubble) {
               const stillExists = window.fieldDefs.has(fieldName) && window.shouldFieldHavePurpleStyling(fieldName);
              if (!stillExists && window.currentCategory === 'Selected') {
                matchingBubble.remove();
              } else {
                matchingBubble.style.opacity = '';
                matchingBubble.style.visibility = '';
                matchingBubble.classList.remove('bubble-disabled');
                matchingBubble.removeAttribute('data-filter-for');
                window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(matchingBubble);
              }
          }
      }
      
      if (window.animatingBackBubbles && window.animatingBackBubbles.size === 0) {
        window.isBubbleAnimatingBack = false;
        if (window.pendingRenderBubbles) {
          window.BubbleSystem.renderBubbles();
          window.pendingRenderBubbles = false;
        }
        reconcileBubbleInteractionState();
        bubbleDebugLog('reset.complete', { reason: 'no-origin-clone' });
      }
    }
  });
  
  setTimeout(() => {
    if (clones.length === 0) {
      window.isBubbleAnimatingBack = false;
      window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
      reconcileBubbleInteractionState();
      bubbleDebugLog('reset.complete', { reason: 'no-clones' });
    }
  }, 0);

  // Fallback: some browsers can skip transitionend during rapid close/open.
  setTimeout(() => {
    if (!window.isBubbleAnimatingBack) return;
    window.isBubbleAnimatingBack = false;
    window.pendingRenderBubbles = false;
    const staleCloneCount = document.querySelectorAll('.bubble-clone').length;
    document.querySelectorAll('.bubble-clone').forEach(c => c.remove());
    reconcileBubbleInteractionState();
    window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
    bubbleDebugLog('reset.complete', { reason: 'fallback-timeout', removedStaleClones: staleCloneCount });
  }, 650);
}

// Export the main functions that query.js needs
if (typeof window !== 'undefined') {
  window.BubbleSystem = {
    Bubble,
    applyCorrectBubbleStyling,
    createOrUpdateBubble,
    applyBubbleScrollRow,
    scrollBubblesByRows,
    resetBubbleScroll,
    renderBubbles,
    safeRenderBubbles,
    updateScrollBar,
    buildConditionPanel,
    initializeBubbles,
    resetActiveBubbles
  };
}