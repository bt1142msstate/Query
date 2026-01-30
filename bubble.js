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
    this.el.dataset.type = def.type;
    if (def.values) this.el.dataset.values = JSON.stringify(def.values);
    if (def.filters) this.el.dataset.filters = JSON.stringify(def.filters);
    // Tooltip: description + filters (if any)
    let tooltip = def.desc || '';
    // Build a fake FilterGroups array for this field from activeFilters
    const af = activeFilters[fieldName];
    let filterTooltip = '';
    if (af && af.filters && af.filters.length > 0) {
      const fakeGroup = [{
        Filters: af.filters.map(f => ({
          FieldName: fieldName,
          FieldOperator: mapOperator(f.cond),
          Values: f.cond === 'between' ? f.val.split('|') : f.val.split(',')
        }))
      }];
      filterTooltip = formatFiltersTooltip(fieldName, fakeGroup);
    }
    if (filterTooltip) {
      tooltip += (tooltip ? '\n\u2014\n' : '');
      tooltip += filterTooltip;
    }
    if (tooltip) {
      this.el.setAttribute('data-tooltip', tooltip);
    } else {
      this.el.removeAttribute('data-tooltip');
    }
    if (def.isSpecialMarc || displayedFields.includes(fieldName)) {
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

/**
 * Applies correct styling to a bubble element based on its filter state.
 * Adds purple styling for filtered fields, removes it for unfiltered fields.
 * @function applyCorrectBubbleStyling
 * @param {HTMLElement} bubbleElement - The bubble DOM element to style
 */
function applyCorrectBubbleStyling(bubbleElement) {
  if (!bubbleElement) return;
  
  const fieldName = bubbleElement.textContent.trim();
  
  if (shouldFieldHavePurpleStyling(fieldName)) {
    bubbleElement.classList.add('bubble-filter');
    bubbleElement.setAttribute('data-filtered', 'true');
  } else {
    bubbleElement.classList.remove('bubble-filter');
    bubbleElement.removeAttribute('data-filtered');
  }
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
  let bubbleInstance;
  if (existingBubble && existingBubble._bubbleInstance) {
    bubbleInstance = existingBubble._bubbleInstance;
    bubbleInstance.update();
    return bubbleInstance.getElement();
  } else {
    bubbleInstance = new Bubble(def);
    const el = bubbleInstance.getElement();
    el._bubbleInstance = bubbleInstance;
    return el;
  }
}

/**
 * Renders all bubbles for the current category and search filter.
 * Handles different categories (All, Selected, specific categories) with appropriate ordering.
 * @function renderBubbles
 */
function renderBubbles(){
  // Safety check for required globals
  if (typeof filteredDefs === 'undefined' || typeof currentCategory === 'undefined') {
    console.log('renderBubbles: Required globals not available yet');
    return;
  }
  
  const container = document.getElementById('bubble-container');
  const listDiv   = document.getElementById('bubble-list');
  if(!container || !listDiv) return;

  // Apply category + search filter
  let list;
  if (currentCategory === 'All') {
    list = filteredDefs;
  } else if (currentCategory === 'Selected') {
    const displayedSet = new Set(displayedFields);
    const filteredSelected = filteredDefs.filter(d => shouldFieldHavePurpleStyling(d.name));
    let orderedList = displayedFields
      .map(name => filteredSelected.find(d => d.name === name))
      .filter(Boolean);
    filteredSelected.forEach(d => {
      if (!displayedSet.has(d.name) && !orderedList.includes(d)) {
        orderedList.push(d);
      }
    });
    list = orderedList;
  } else {
    list = filteredDefs.filter(d => {
      const cat = d.category;
      return Array.isArray(cat) ? cat.includes(currentCategory) : cat === currentCategory;
    });
  }

  // If we're in Selected category, preserve existing bubbles
  if (currentCategory === 'Selected') {
    const existingBubbles = Array.from(listDiv.children);
    const existingBubbleMap = new Map(existingBubbles.map(b => [b.textContent.trim(), b]));
    listDiv.innerHTML = '';
    list.forEach(def => {
      const existingBubble = existingBubbleMap.get(def.name);
      const bubbleEl = createOrUpdateBubble(def, existingBubble);
      listDiv.appendChild(bubbleEl);
    });
  } else {
    listDiv.innerHTML = '';
    list.forEach(def => {
      const bubbleEl = createOrUpdateBubble(def);
      listDiv.appendChild(bubbleEl);
    });
  }

  // --- Dimension calc on first bubble ---
  const firstBubble = listDiv.querySelector('.bubble');
  if(firstBubble){
    const gapVal = getComputedStyle(listDiv).getPropertyValue('gap') || '0px';
    const gap = parseFloat(gapVal) || 0;
    rowHeight  = firstBubble.getBoundingClientRect().height + gap;
    const bubbleW = firstBubble.offsetWidth;
    const rowsVisible = 2;
    const twoRowsH = rowHeight * rowsVisible - gap;
    const sixColsW = bubbleW * 6 + gap * 5;
    const fudge   = 8;
    const paddedH = twoRowsH + 12 - fudge;
    const paddedW = sixColsW + 8;
    container.style.height = paddedH + 'px';
    container.style.width  = paddedW + 'px';
    const scrollCont = document.querySelector('.bubble-scrollbar-container');
    if (scrollCont) scrollCont.style.height = paddedH + 'px';
    totalRows  = Math.ceil(list.length / 6);
    if(scrollRow > totalRows - rowsVisible) scrollRow = Math.max(0, totalRows - rowsVisible);
    listDiv.style.transform = `translateY(-${scrollRow * rowHeight}px)`;
    updateScrollBar();
  }
  Array.from(listDiv.children).forEach(bubble => {
    const fieldName = bubble.textContent.trim();
    if (animatingBackBubbles.has(fieldName)) {
      bubble.style.visibility = 'hidden';
      bubble.style.opacity = '0';
    } else {
      bubble.style.visibility = '';
      bubble.style.opacity = '';
    }
  });
}

// Replace all direct calls to renderBubbles() with a helper:
function safeRenderBubbles() {
  // Safety check for required globals
  if (typeof isBubbleAnimatingBack === 'undefined') {
    console.log('safeRenderBubbles: Required globals not available yet');
    return;
  }
  
  if (isBubbleAnimatingBack) {
    pendingRenderBubbles = true;
    return;
  }
  renderBubbles();
  pendingRenderBubbles = false;
}

/**
 * Updates the custom scrollbar for the bubble container.
 * Creates colored segments representing different scroll positions.
 * @function updateScrollBar
 */
function updateScrollBar(){
  // Safety check for required globals
  if (typeof totalRows === 'undefined' || typeof scrollRow === 'undefined') {
    console.log('updateScrollBar: Required globals not available yet');
    return;
  }
  
  /* Hide scrollbar container entirely when no scrolling is needed */
  const scrollbarContainer = document.querySelector('.bubble-scrollbar-container');
  if(scrollbarContainer){
    const needScroll = totalRows > 2;   // rowsVisible = 2
    scrollbarContainer.style.display = needScroll ? 'block' : 'none';
  }

  const track = document.getElementById('bubble-scrollbar-track');
  const thumb = document.getElementById('bubble-scrollbar-thumb');
  if(!track || !thumb) return;

  const maxStartRow = Math.max(0, totalRows - 2);   // rowsVisible =2
  const trackH = track.clientHeight;

  // Build segments (one per start row)
  track.querySelectorAll('.bubble-scrollbar-segment').forEach(s=>s.remove());
  const colors = ['#fde68a','#fca5a5','#6ee7b7','#93c5fd','#d8b4fe'];
  const segmentH = trackH / (maxStartRow + 1);   // exact pixel height for segments and thumb
  for(let r = 0; r <= maxStartRow; r++){
    const seg = document.createElement('div');
    seg.className = 'bubble-scrollbar-segment';
    seg.style.top = `${r * segmentH}px`;
    seg.style.height = `${segmentH}px`;
    seg.style.background = colors[r % colors.length];
    track.appendChild(seg);
  }

  // Thumb size = half a segment
  const thumbH   = segmentH/2;
  thumb.style.height = `${thumbH}px`;
  const topPos = segmentH*scrollRow + (segmentH-thumbH)/2;
  thumb.style.top = `${topPos}px`;
}

/**
 * Builds the condition panel UI when a bubble is clicked.
 * Creates filter buttons, input fields, and show/hide toggles based on field type.
 * @function buildConditionPanel
 * @param {HTMLElement} bubble - The clicked bubble element
 */
function buildConditionPanel(bubble){
  selectedField = bubble.textContent.trim();
  const type = bubble.dataset.type || 'string';
  let listValues = null;
  let hasValuePairs = false;
  
  // Handle both old and new values format
  try {
    if (bubble.dataset.values) {
      const parsedValues = JSON.parse(bubble.dataset.values);
      if (parsedValues.length > 0) {
        if (typeof parsedValues[0] === 'object' && parsedValues[0].Name && parsedValues[0].RawValue) {
          // New format with Name/RawValue pairs
          hasValuePairs = true;
          listValues = parsedValues;
        } else {
          // Old string format
          listValues = parsedValues;
        }
      }
    }
  } catch (e) {
    console.error("Error parsing values:", e);
  }
  
  const perBubble = bubble.dataset.filters ? JSON.parse(bubble.dataset.filters) : null;
  const isSpecialMarc = selectedField === 'Marc';
  conditionPanel.innerHTML = '';

  // Always remove any existing marcInputGroup from the inputWrapper
  const inputWrapper = document.getElementById('condition-input-wrapper');
  const oldMarcInput = document.getElementById('marc-field-input');
  if (oldMarcInput && oldMarcInput.parentNode) oldMarcInput.parentNode.remove();

  if (isSpecialMarc) {
    // For the special Marc field, create a Marc number input
    const marcInputGroup = document.createElement('div');
    marcInputGroup.className = 'marc-input-group';
    const marcLabel = document.createElement('label');
    marcLabel.textContent = 'Marc Field Number:';
    marcLabel.className = 'marc-label';
    marcInputGroup.appendChild(marcLabel);
    const marcInput = document.createElement('input');
    marcInput.type = 'text';
    marcInput.pattern = '[0-9]+';
    marcInput.placeholder = 'Enter 3-digit Marc field';
    marcInput.className = 'marc-field-input condition-field';
    marcInput.id = 'marc-field-input';
    marcInputGroup.appendChild(marcInput);
    // Insert after conditionInput in inputWrapper
    const refNode = document.getElementById('condition-input');
    if (refNode && inputWrapper) {
      inputWrapper.insertBefore(marcInputGroup, refNode.nextSibling);
    }
    // Add filter buttons
    const standardConds = ['contains', 'starts', 'equals'];
    standardConds.forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'condition-btn';
      btn.dataset.cond = label.split(' ')[0];
      btn.textContent = label[0].toUpperCase() + label.slice(1);
      conditionPanel.appendChild(btn);
    });
  } else {
    // Normal field - add condition buttons as usual
    const conds = perBubble ? perBubble
                : (listValues && listValues.length) ? ['equals']
                : (window.typeConditions[type] || window.typeConditions.string);
    conds.forEach(label => {
      const slug = label.split(' ')[0];
      const btnEl = document.createElement('button');
      btnEl.className = 'condition-btn';
      btnEl.dataset.cond = slug;
      btnEl.textContent = label[0].toUpperCase()+label.slice(1);
      conditionPanel.appendChild(btnEl);
    });
  }

  // --- Dual toggle (Show / Hide) ---
  if (!isSpecialMarc) {
    const toggleGroup = document.createElement('div');
    toggleGroup.className = 'inline-flex';
    ['Show','Hide'].forEach(label=>{
      const btn = document.createElement('button');
      btn.className = 'toggle-half';
      btn.dataset.cond = label.toLowerCase();
      btn.textContent = label;
      if(label === 'Show' ? displayedFields.includes(selectedField) : !displayedFields.includes(selectedField)){
        btn.classList.add('active');
      }
      toggleGroup.appendChild(btn);
    });
    conditionPanel.appendChild(toggleGroup);
  }

  const dynamicBtns = conditionPanel.querySelectorAll('.condition-btn, .toggle-half');
  dynamicBtns.forEach(btn=>btn.addEventListener('click', isSpecialMarc ? window.marcConditionBtnHandler : window.handleConditionBtnClick));

  // Swap text input for select if bubble has list values
  if(listValues && listValues.length){
    const fieldDef = fieldDefs.get(selectedField);
    const isMultiSelect = fieldDef && fieldDef.multiSelect;
    // Clean up any existing selectors
    let existingSelect = document.getElementById('condition-select');
    let existingContainer = document.getElementById('condition-select-container');
    if (existingSelect) existingSelect.parentNode.removeChild(existingSelect);
    if (existingContainer) existingContainer.parentNode.removeChild(existingContainer);
    
    // Get current values if it's a filter update
    let currentLiteralValues = [];
    if (activeFilters[selectedField]) {
      const filter = activeFilters[selectedField].filters.find(f => f.cond === 'equals');
      if (filter) {
        currentLiteralValues = filter.val.split(',').map(v => v.trim());
      }
    }
    
    // Check if any values have dashes for grouped selector
    const hasDashes = hasValuePairs 
      ? listValues.some(val => val.Name.includes('-'))
      : listValues.some(val => val.includes('-'));
    
    if (hasDashes) {
      // Use grouped selector for values with dash
      const selector = createGroupedSelector(listValues, isMultiSelect, currentLiteralValues);
      inputWrapper.insertBefore(selector, confirmBtn);
      conditionInput.style.display = 'none';
    } else {
      // Use standard select for simple values
      let select = document.createElement('select');
      select.id = 'condition-select';
      select.className = 'px-3 py-2 rounded border';
      if (isMultiSelect) {
        select.setAttribute('multiple', 'multiple');
      }
      
      // Create options with proper display/literal handling
      select.innerHTML = listValues.map(v => {
        if (hasValuePairs) {
          // New format with Name/RawValue pairs
          const selected = currentLiteralValues.includes(v.RawValue) ? 'selected' : '';
          return `<option value="${v.RawValue}" data-display="${v.Name}" ${selected}>${v.Name}</option>`;
        } else {
          // Old string format
          const selected = currentLiteralValues.includes(v) ? 'selected' : '';
          return `<option value="${v}" ${selected}>${v}</option>`;
        }
      }).join('');
      
      inputWrapper.insertBefore(select, confirmBtn);
      select.style.display = 'block';
      conditionInput.style.display = 'none';
    }
  } else {
    if(document.getElementById('condition-select')){
      document.getElementById('condition-select').style.display='none';
    }
    if(document.getElementById('condition-select-container')){
      document.getElementById('condition-select-container').style.display='none';
    }
    window.configureInputsForType(type);
    conditionInput.style.display = 'block';
  }

  // Show existing filters, if any
  renderConditionList(selectedField);

  // Focus the Marc field input if this is the Marc bubble
  if (isSpecialMarc) {
    setTimeout(() => {
      document.getElementById('marc-field-input')?.focus();
    }, 300);
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
    const rowsVisible = 2;
    const maxStartRow = Math.max(0, totalRows - rowsVisible);
    const delta = e.deltaY > 0 ? 1 : -1;
    const newRow = Math.max(0, Math.min(maxStartRow, scrollRow + delta));
    if(newRow !== scrollRow){
      scrollRow = newRow;
      const listDiv = document.getElementById('bubble-list');
      if(listDiv) listDiv.style.transform = 
        `translateY(-${scrollRow * rowHeight}px)`;
      updateScrollBar();
    }
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
      const rowsVisible = 2;
      const maxStartRow = Math.max(0, totalRows - rowsVisible);
      const segmentHeight = trackHeight / (maxStartRow + 1);
      
      const rowDelta = Math.round(deltaY / segmentHeight);
      const newRow = Math.max(0, Math.min(maxStartRow, startScrollRow + rowDelta));
      
      if (newRow !== scrollRow) {
        scrollRow = newRow;
        const listDiv = document.getElementById('bubble-list');
        if (listDiv) {
          listDiv.style.transform = `translateY(-${scrollRow * rowHeight}px)`;
        }
        updateScrollBar();
      }
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
      const rowsVisible = 2;
      const maxStartRow = Math.max(0, totalRows - rowsVisible);
      
      const targetRow = Math.round((clickY / trackHeight) * maxStartRow);
      const newRow = Math.max(0, Math.min(maxStartRow, targetRow));
      
      if (newRow !== scrollRow) {
        scrollRow = newRow;
        const listDiv = document.getElementById('bubble-list');
        if (listDiv) {
          listDiv.style.transform = `translateY(-${scrollRow * rowHeight}px)`;
        }
        updateScrollBar();
      }
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
    updateScrollBar();
  });

  // Delegated bubble click events
  document.addEventListener('click', e=>{
    if (window.modalManager && window.modalManager.isInputLocked) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    const bubble = e.target.closest('.bubble');
    if(!bubble) return;
    // Prevent duplicate active bubble
    if(document.querySelector('.active-bubble')) return;
    // Prevent clicking bubbles while animation is running
    if (window.isBubbleAnimating) return;
    window.isBubbleAnimating = true;
    window.lockInput && window.lockInput(600); // Lock input for animation duration + buffer (adjust as needed)

    // Store current category so it doesn't get reset
    const savedCategory = currentCategory; 

    // Animate clone to centre + build panel
    const rect = bubble.getBoundingClientRect();
    // Look up description for this field (no longer used for index card)
    const fieldName = bubble.textContent.trim();
    // const descText = (fieldDefs.find(d => d.name === fieldName) || {}).desc || '';
    const clone = bubble.cloneNode(true);
    clone.dataset.filterFor = fieldName;
    // Remove all index card/descEl logic here
    clone._origin = bubble;
    // Store the original position for accurate return animation
    clone._originalRect = {
      top: rect.top,
      left: rect.left
    };
    clone.style.position='fixed';
    clone.style.top = rect.top+'px';
    clone.style.left=rect.left+'px';
    clone.style.color = getComputedStyle(bubble).color;
    document.body.appendChild(clone);
    bubble.classList.add('bubble-disabled');
    bubble.style.opacity = '0';          // hide origin immediately
    bubble.dataset.filterFor = bubble.textContent.trim();          // add attribute

    overlay.classList.add('show');
    buildConditionPanel(bubble);
    
    // Restore the saved category
    currentCategory = savedCategory;
    // Re-sync category bar UI to match the preserved category
    document.querySelectorAll('#category-bar .category-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.category === currentCategory)
    );

    clone.addEventListener('transitionend',function t(){
      if(!clone.classList.contains('enlarge-bubble')){
        clone.classList.add('enlarge-bubble');
        return;
      }
      conditionPanel.classList.add('show');
      // After the panel is visible, auto-activate Equals (or first option)
      const defaultBtn =
            conditionPanel.querySelector('.condition-btn[data-cond="equals"]') ||
            conditionPanel.querySelector('.condition-btn');
      if (defaultBtn) {
        defaultBtn.classList.add('active');
        window.handleConditionBtnClick({ currentTarget: defaultBtn, stopPropagation(){}, preventDefault(){} });
      }
      // Show input wrapper right away if there are existing filters
      if (activeFilters[selectedField]) {
        inputWrapper.classList.add('show');
      }
      clone.removeEventListener('transitionend',t);
      // Animation is done, allow bubble clicks again
      window.isBubbleAnimating = false;
      // (input lock will be released by timer)
    });
    requestAnimationFrame(()=> clone.classList.add('active-bubble'));

    // After: clone._origin = bubble;
    setTimeout(() => {
      if (!document.body.contains(clone._origin)) {
        // Try to find the Marc creator bubble again
        const marcBubble = Array.from(document.querySelectorAll('.bubble')).find(b => b.textContent.trim() === 'Marc');
        if (marcBubble) clone._origin = marcBubble;
      }
    }, 60);
    if (clone) overlay.classList.add('bubble-active');
    const headerBar = document.getElementById('header-bar');
    if (clone && headerBar) headerBar.classList.add('header-hide');
  });
  
  return true;
}

// Helper to format filters for tooltips (used by bubbles)
function formatFiltersTooltip(fieldName, filterGroups) {
  const lines = [];
  filterGroups.forEach(group => {
    group.Filters.forEach(filter => {
      const op = filter.FieldOperator;
      const vals = filter.Values;
      let line = `${fieldName} ${op}`;
      if (vals && vals.length > 0) {
        if (op === 'between' && vals.length >= 2) {
          line += ` ${vals[0]} and ${vals[1]}`;
        } else {
          line += ` ${vals.join(', ')}`;
        }
      }
      lines.push(line);
    });
  });
  return lines.join('\n');
}

/**
 * Resets active/enlarged bubbles, animating them back to their original position.
 * Handles the cleanup of clones and restoration of original bubbles.
 */
function resetActiveBubbles() {
  // Ensure input lock is always cleared
  if (window.ModalSystem) {
    window.ModalSystem.lockInput(0);
  }
  
  const clones = document.querySelectorAll('.active-bubble');
  if (clones.length > 0) window.isBubbleAnimatingBack = true; 
  
  clones.forEach(clone => {
    const origin = clone._origin;
    const originInDOM = origin && document.body.contains(origin);
    const fieldName = origin ? origin.textContent.trim() : (clone.textContent ? clone.textContent.trim() : '');

    if (originInDOM) {
      if (window.animatingBackBubbles) window.animatingBackBubbles.add(fieldName);
      
      const originalRect = clone._originalRect;
      if (originalRect) {
        clone.style.top  = originalRect.top + 'px';
        clone.style.left = originalRect.left + 'px';
      } else {
        const nowRect = origin.getBoundingClientRect();
        clone.style.top  = nowRect.top + 'px';
        clone.style.left = nowRect.left + 'px';
      }

      origin.style.opacity = '0';
      origin.style.visibility = 'hidden';
      
      clone.classList.remove('enlarge-bubble');
      clone.classList.remove('active-bubble');
      
      clone.addEventListener('transitionend', () => {
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
        }
      }, { once: true });
    } else {
      clone.remove();
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
                matchingBubble.classList.remove('bubble-disabled');
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
      }
    }
  });
  
  setTimeout(() => {
    if (clones.length === 0) {
      window.isBubbleAnimatingBack = false;
      window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
    }
  }, 0);
}

// Export the main functions that query.js needs
if (typeof window !== 'undefined') {
  window.BubbleSystem = {
    Bubble,
    applyCorrectBubbleStyling,
    createOrUpdateBubble,
    renderBubbles,
    safeRenderBubbles,
    updateScrollBar,
    buildConditionPanel,
    initializeBubbles,
    formatFiltersTooltip,
    resetActiveBubbles
  };
}