/**
 * Bubble UI component class for field selection and filtering.
 * Represents a draggable field that can be clicked to set filters.
 * @class Bubble
 */
var getDisplayedFields = window.QueryStateReaders.getDisplayedFields.bind(window.QueryStateReaders);
var getActiveFilters = window.QueryStateReaders.getActiveFilters.bind(window.QueryStateReaders);
var hasFiltersForField = window.QueryStateReaders.hasFiltersForField.bind(window.QueryStateReaders);
var appState = window.AppState;

class Bubble {
  constructor(def, state = {}) {
    this.def = def;
    this.state = state;
    this.el = document.createElement('div');
    this.el.className = 'bubble';
    this.el.tabIndex = 0;
    this.update();
  }

  update(state = {}) {
    Object.assign(this.state, state);
    const { def } = this;
    const fieldName = def.name;
    const isFilterable = typeof window.isFieldBackendFilterable === 'function'
      ? window.isFieldBackendFilterable(def)
      : Array.isArray(def.filters) && def.filters.length > 0;
    this.el.textContent = fieldName;

    if (def.type) {
      this.el.dataset.type = def.type;
    } else {
      delete this.el.dataset.type;
    }
    this.el.dataset.filterable = isFilterable ? 'true' : 'false';
    if (def.values) this.el.dataset.values = JSON.stringify(def.values);
    if (def.filters) this.el.dataset.filters = JSON.stringify(def.filters);

    let descValue = def.desc || '';
    const af = getActiveFilters()[fieldName];
    let filterTooltipHtml = '';

    if (af && af.filters && af.filters.length > 0) {
      const filters = af.filters.map(f => ({
        FieldName: fieldName,
        FieldOperator: mapBubbleConditionToFieldOperator(f.cond),
        Values: f.cond === 'between' ? f.val.split('|') : f.val.split(',')
      }));
      filterTooltipHtml = window.formatStandardFilterTooltipHTML(filters, 'Active Filters');
    }

    let tooltipContentHtml = typeof window.formatFieldDefinitionTooltipHTML === 'function'
      ? window.formatFieldDefinitionTooltipHTML(def)
      : '';
    if (tooltipContentHtml && filterTooltipHtml) {
      tooltipContentHtml = `<div class="tt-tooltip-stack">${tooltipContentHtml}${filterTooltipHtml}</div>`;
    } else if (tooltipContentHtml) {
      tooltipContentHtml = `<div class="tt-tooltip-stack">${tooltipContentHtml}</div>`;
    } else if (filterTooltipHtml) {
      tooltipContentHtml = `<div class="tt-tooltip-stack">${filterTooltipHtml}</div>`;
    }

    if (tooltipContentHtml) {
      this.el.removeAttribute('data-tooltip');
      this.el.setAttribute('data-tooltip-html', tooltipContentHtml);
    } else if (descValue) {
      this.el.removeAttribute('data-tooltip-html');
      this.el.setAttribute('data-tooltip', descValue);
    } else {
      this.el.removeAttribute('data-tooltip');
      this.el.removeAttribute('data-tooltip-html');
    }

    this.el.setAttribute('draggable', def.is_buildable || getDisplayedFields().includes(fieldName) ? 'false' : 'true');

    if (_animatingBackBubbles.has(fieldName)) {
      this.el.dataset.animatingBack = 'true';
      this.el.style.visibility = 'hidden';
      this.el.style.opacity = '0';
    } else {
      this.el.style.visibility = '';
      this.el.style.opacity = '';
      this.el.removeAttribute('data-animating-back');
    }

    const overlayEl = getBubbleOverlayElement();
    const isOverlayOpen = !!(overlayEl && overlayEl.classList.contains('show'));
    if (!isOverlayOpen) {
      this.el.classList.remove('bubble-disabled');
      this.el.style.filter = '';
      this.el.removeAttribute('data-filter-for');
    }

    this.el.classList.toggle('bubble-display-only', !isFilterable && !def.is_buildable);

    applyCorrectBubbleStyling(this.el);
  }

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
  return window.DOM?.filterCard || window.filterCard || null;
}

function getBubbleFilterCardTitleElement(filterCard = getBubbleFilterCardElement()) {
  return (filterCard && filterCard.querySelector('#filter-card-title')) || window.DOM?.filterCardTitle || null;
}

function prepareBubbleFilterCardForOpen(filterCard = getBubbleFilterCardElement()) {
  if (!filterCard) {
    return null;
  }

  if (filterCard._showTimer) {
    clearTimeout(filterCard._showTimer);
    filterCard._showTimer = null;
  }
  if (filterCard._scrollReadyTimer) {
    clearTimeout(filterCard._scrollReadyTimer);
    filterCard._scrollReadyTimer = null;
  }
  if (filterCard._contentRevealTimer) {
    clearTimeout(filterCard._contentRevealTimer);
    filterCard._contentRevealTimer = null;
  }

  filterCard.classList.remove('content-ready', 'scroll-ready', 'show');
  return filterCard;
}

function markBubbleFilterCardOpen(filterCard = getBubbleFilterCardElement(), options = {}) {
  if (!filterCard) {
    return null;
  }

  const { scrollReadyDelay = 240 } = options;
  filterCard.classList.add('show', 'content-ready');

  filterCard._scrollReadyTimer = window.setTimeout(() => {
    if (filterCard.classList.contains('show')) {
      filterCard.classList.add('scroll-ready');
    }
    filterCard._scrollReadyTimer = null;
  }, scrollReadyDelay);

  return filterCard;
}

function resetBubbleEditorUi(options = {}) {
  const {
    clearPanelContent = false,
    removeFilterCard = false,
    clearConditionListSelection = false
  } = options;

  const overlay = getBubbleOverlayElement();
  const conditionPanel = getBubbleConditionPanelElement();
  const inputWrapper = getBubbleInputWrapperElement();
  const conditionInput = getBubbleConditionInputElement();
  const conditionInput2 = window.DOM?.conditionInput2 || document.getElementById('condition-input-2');
  const betweenLabel = window.DOM?.betweenLabel || document.getElementById('between-label');
  const filterError = window.DOM?.filterError || document.getElementById('filter-error');
  const filterCard = prepareBubbleFilterCardForOpen(getBubbleFilterCardElement());
  const headerBar = window.DOM?.headerBar || document.getElementById('header-bar');

  if (overlay) {
    overlay.classList.remove('show', 'bubble-active');
  }
  if (headerBar) {
    headerBar.classList.remove('header-hide');
  }
  if (conditionPanel) {
    conditionPanel.classList.remove('show');
    if (clearPanelContent) {
      conditionPanel.innerHTML = '';
    }
  }
  if (inputWrapper) {
    inputWrapper.classList.remove('show');
  }
  if (conditionInput) {
    conditionInput.value = '';
    conditionInput.classList.remove('error');
    conditionInput.style.display = 'block';
  }
  if (conditionInput2) {
    conditionInput2.value = '';
    conditionInput2.classList.remove('error');
    conditionInput2.style.display = 'none';
  }
  if (betweenLabel) {
    betweenLabel.style.display = 'none';
  }
  if (filterError) {
    filterError.textContent = '';
    filterError.style.display = 'none';
  }

  const operatorSelect = conditionPanel?.querySelector('#condition-operator-select');
  if (operatorSelect) {
    operatorSelect.selectedIndex = 0;
  }

  document.getElementById('condition-select')?.remove();
  document.getElementById('condition-select-container')?.remove();
  document.querySelectorAll('.dynamic-input-group').forEach(el => el.remove());
  document.querySelectorAll('.toggle-half.active').forEach(btn => btn.classList.remove('active'));

  if (clearConditionListSelection) {
    document.getElementById('bubble-cond-list')?.replaceChildren();
  }

  if (removeFilterCard && filterCard) {
    window.setTimeout(() => {
      if (!filterCard.classList.contains('show') && filterCard.parentNode) {
        filterCard.remove();
      }
    }, 250);
  }
}

function mapBubbleConditionToFieldOperator(condition) {
  return window.mapUiCondToFieldOperator(condition);
}

const BUBBLE_VISIBLE_ROWS = 2;

// Animation state — private to this module, exposed read/write via BubbleSystem
let _isBubbleAnimating = false;
let _isBubbleAnimatingBack = false;
let _pendingRenderBubbles = false;
const _animatingBackBubbles = new Set();

function getBubbleMaxStartRow() {
  return Math.max(0, appState.totalRows - BUBBLE_VISIBLE_ROWS);
}

function clampBubbleScrollRow(nextRow) {
  const numericRow = Number.isFinite(nextRow) ? nextRow : 0;
  const roundedRow = Math.round(numericRow);
  return Math.max(0, Math.min(getBubbleMaxStartRow(), roundedRow));
}

function applyBubbleScrollRow(nextRow, options = {}) {
  const { force = false } = options;
  const clampedRow = clampBubbleScrollRow(nextRow);
  const changed = clampedRow !== appState.scrollRow;
  if (!changed && !force) return false;

  appState.scrollRow = clampedRow;

  const listDiv = window.DOM?.bubbleList || document.getElementById('bubble-list');
  if (listDiv) {
    listDiv.style.transform = `translateY(-${appState.scrollRow * appState.rowHeight}px)`;
  }

  updateScrollBar();
  return changed;
}

function scrollBubblesByRows(deltaRows) {
  return applyBubbleScrollRow(appState.scrollRow + deltaRows);
}

function resetBubbleScroll() {
  applyBubbleScrollRow(0, { force: true });
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

function applyCorrectBubbleStyling(bubbleElement) {
  if (!bubbleElement) return;

  const fieldName = bubbleElement.textContent.trim();
  if (window.shouldFieldHavePurpleStylingBase(fieldName, getDisplayedFields(), getActiveFilters())) {
    bubbleElement.classList.add('bubble-filter');
    bubbleElement.setAttribute('data-filtered', 'true');
  } else {
    bubbleElement.classList.remove('bubble-filter');
    bubbleElement.removeAttribute('data-filtered');
  }

  bubbleElement.classList.toggle('bubble-active-filter', hasFiltersForField(fieldName));
}

function createOrUpdateBubble(def, existingBubble = null) {
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

function renderBubbles() {
  if (typeof filteredDefs === 'undefined') {
    console.log('renderBubbles: Required globals not available yet');
    return;
  }

  const container = window.DOM?.bubbleContainer || document.getElementById('bubble-container');
  const listDiv = window.DOM?.bubbleList || document.getElementById('bubble-list');
  if (!container || !listDiv) return;

  let list;
  if (appState.currentCategory === 'All') {
    list = filteredDefs;
  } else if (appState.currentCategory === 'Selected') {
    const displayedFields = getDisplayedFields();
    const activeFilters = getActiveFilters();
    const displayedSet = new Set(displayedFields);
    const filteredSelected = filteredDefs.filter(d => window.shouldFieldHavePurpleStylingBase(d.name, displayedFields, activeFilters));
    const orderedList = displayedFields
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
      return Array.isArray(cat) ? cat.includes(appState.currentCategory) : cat === appState.currentCategory;
    });
  }

  list.sort((a, b) => {
    const aFilter = hasFiltersForField(a.name);
    const bFilter = hasFiltersForField(b.name);
    if (aFilter && !bFilter) return -1;
    if (!aFilter && bFilter) return 1;
    return 0;
  });

  if (appState.currentCategory === 'Selected') {
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

  const firstBubble = listDiv.querySelector('.bubble');
  if (firstBubble) {
    const gapVal = getComputedStyle(listDiv).getPropertyValue('gap') || '0px';
    const gap = parseFloat(gapVal) || 0;
    appState.rowHeight = firstBubble.getBoundingClientRect().height + gap;
    const bubbleW = firstBubble.offsetWidth;
    const twoRowsH = appState.rowHeight * BUBBLE_VISIBLE_ROWS - gap;
    const sixColsW = bubbleW * 6 + gap * 5;
    const fudge = 8;
    const paddedH = twoRowsH + 12 - fudge;
    const paddedW = sixColsW + 8;
    container.style.height = paddedH + 'px';
    container.style.width = paddedW + 'px';
    const scrollCont = document.querySelector('.bubble-scrollbar-container');
    if (scrollCont) scrollCont.style.height = paddedH + 'px';
    appState.totalRows = Math.ceil(list.length / 6);
    applyBubbleScrollRow(appState.scrollRow, { force: true });
  } else {
    appState.totalRows = 0;
    appState.scrollRow = 0;
    appState.rowHeight = 0;
    updateScrollBar();
  }

  Array.from(listDiv.children).forEach(bubble => {
    const fieldName = bubble.textContent.trim();
    if (_animatingBackBubbles.has(fieldName)) {
      bubble.style.visibility = 'hidden';
      bubble.style.opacity = '0';
    } else {
      bubble.style.visibility = '';
      bubble.style.opacity = '';
    }
  });
}

function safeRenderBubbles() {
  if (_isBubbleAnimatingBack) {
    _pendingRenderBubbles = true;
    return;
  }

  renderBubbles();
  _pendingRenderBubbles = false;
}

function updateScrollBar() {
  const listDiv = window.DOM?.bubbleList || document.getElementById('bubble-list');
  const renderedBubbleCount = listDiv ? listDiv.querySelectorAll('.bubble').length : 0;
  const scrollbarContainer = document.querySelector('.bubble-scrollbar-container');
  if (scrollbarContainer) {
    const needScroll = renderedBubbleCount > 0 && appState.totalRows > BUBBLE_VISIBLE_ROWS;
    scrollbarContainer.style.display = needScroll ? 'block' : 'none';
    if (!needScroll) return;
  }

  const track = window.DOM?.bubbleScrollbarTrack || document.getElementById('bubble-scrollbar-track');
  const thumb = window.DOM?.bubbleScrollbarThumb || document.getElementById('bubble-scrollbar-thumb');
  if (!track || !thumb) return;

  const maxStartRow = getBubbleMaxStartRow();
  const trackH = track.clientHeight;
  track.style.background = 'rgba(255, 255, 255, 0.15)';

  const visibleRatio = appState.totalRows > 0 ? (BUBBLE_VISIBLE_ROWS / appState.totalRows) : 1;
  let thumbH = Math.max(24, trackH * visibleRatio);
  thumbH = Math.min(thumbH, trackH);

  const scrollRatio = maxStartRow > 0 ? (appState.scrollRow / maxStartRow) : 0;
  const maxTopPos = trackH - thumbH;
  const topPos = scrollRatio * maxTopPos;

  thumb.style.height = `${thumbH}px`;
  thumb.style.top = `${topPos}px`;
}

window.createBubblePopParticles = function(bubbleClone) {
  if (!bubbleClone) return;

  const rect = bubbleClone.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const particleCount = 25;

  for (let index = 0; index < particleCount; index++) {
    const particle = document.createElement('div');
    particle.className = 'bubble-particle';
    particle.style.zIndex = getComputedStyle(bubbleClone).zIndex;

    const angle = Math.random() * Math.PI * 2;
    const radiusX = (rect.width / 2) * (0.8 + Math.random() * 0.3);
    const radiusY = (rect.height / 2) * (0.8 + Math.random() * 0.3);
    const startX = centerX + Math.cos(angle) * radiusX;
    const startY = centerY + Math.sin(angle) * radiusY;

    particle.style.left = `${startX}px`;
    particle.style.top = `${startY}px`;

    const size = Math.random() * 10 + 4;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;

    const burstSpeed = 20 + Math.random() * 50;
    const travelX = Math.cos(angle) * burstSpeed;
    const gravity = 60 + Math.random() * 60;
    const travelY = Math.sin(angle) * burstSpeed + gravity;

    particle.style.setProperty('--tx', `${travelX}px`);
    particle.style.setProperty('--ty', `${travelY}px`);

    const duration = 0.35 + Math.random() * 0.25;
    particle.style.animation = `bubble-pop-anim ${duration}s ease-in forwards`;

    document.body.appendChild(particle);
    setTimeout(() => {
      if (particle.parentNode) particle.remove();
    }, duration * 1000);
  }
};

function buildConditionPanel(bubble) {
  if (window.BubbleConditionPanel && typeof window.BubbleConditionPanel.buildConditionPanel === 'function') {
    return window.BubbleConditionPanel.buildConditionPanel(bubble);
  }
}

function initializeBubbles() {
  if (window.BubbleInteraction && typeof window.BubbleInteraction.initializeBubbles === 'function') {
    return window.BubbleInteraction.initializeBubbles();
  }
  return false;
}

function resetActiveBubbles() {
  if (window.BubbleReset && typeof window.BubbleReset.resetActiveBubbles === 'function') {
    return window.BubbleReset.resetActiveBubbles();
  }
}

if (typeof window !== 'undefined') {
  window.BubbleSystem = {
    Bubble,
    applyCorrectBubbleStyling,
    bubbleDebugLog,
    getBubbleMaxStartRow,
    getOverlayElement: getBubbleOverlayElement,
    getConditionPanelElement: getBubbleConditionPanelElement,
    getInputWrapperElement: getBubbleInputWrapperElement,
    getConditionInputElement: getBubbleConditionInputElement,
    getConfirmButtonElement: getBubbleConfirmButtonElement,
    getFilterCardElement: getBubbleFilterCardElement,
    getFilterCardTitleElement: getBubbleFilterCardTitleElement,
    prepareFilterCardForOpen: prepareBubbleFilterCardForOpen,
    markFilterCardOpen: markBubbleFilterCardOpen,
    resetEditorUi: resetBubbleEditorUi,
    createOrUpdateBubble,
    applyBubbleScrollRow,
    scrollBubblesByRows,
    resetBubbleScroll,
    renderBubbles,
    safeRenderBubbles,
    updateScrollBar,
    buildConditionPanel,
    initializeBubbles,
    resetActiveBubbles,
    // Animation state — writable through these accessors only
    get isBubbleAnimating() { return _isBubbleAnimating; },
    set isBubbleAnimating(v) { _isBubbleAnimating = !!v; },
    get isBubbleAnimatingBack() { return _isBubbleAnimatingBack; },
    set isBubbleAnimatingBack(v) { _isBubbleAnimatingBack = !!v; },
    get pendingRenderBubbles() { return _pendingRenderBubbles; },
    set pendingRenderBubbles(v) { _pendingRenderBubbles = !!v; },
    get animatingBackBubbles() { return _animatingBackBubbles; }
  };
}
