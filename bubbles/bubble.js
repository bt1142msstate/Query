/**
 * Bubble UI component class for field selection and filtering.
 * Represents a draggable field that can be clicked to set filters.
 * @class Bubble
 */
const { getDisplayedFields, getActiveFilters, hasActiveFilters } = window.QueryStateReaders;

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
    this.el.textContent = fieldName;

    if (def.type) {
      this.el.dataset.type = def.type;
    } else {
      delete this.el.dataset.type;
    }
    if (def.values) this.el.dataset.values = JSON.stringify(def.values);
    if (def.filters) this.el.dataset.filters = JSON.stringify(def.filters);

    let categoryValue = def.category || '';
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
      tooltipContentHtml += filterTooltipHtml;
    } else if (filterTooltipHtml) {
      tooltipContentHtml = filterTooltipHtml;
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

    if (animatingBackBubbles.has(fieldName)) {
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
  return document.getElementById('filter-card') || window.filterCard || null;
}

function getBubbleFilterCardTitleElement(filterCard = getBubbleFilterCardElement()) {
  return (filterCard && filterCard.querySelector('#filter-card-title')) || document.getElementById('filter-card-title');
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

  bubbleElement.classList.toggle('bubble-active-filter', hasActiveFilters(fieldName));
}

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

function renderBubbles() {
  if (window.BubbleRender && typeof window.BubbleRender.renderBubbles === 'function') {
    return window.BubbleRender.renderBubbles();
  }
}

function safeRenderBubbles() {
  if (window.BubbleRender && typeof window.BubbleRender.safeRenderBubbles === 'function') {
    return window.BubbleRender.safeRenderBubbles();
  }
}

function updateScrollBar() {
  if (window.BubbleRender && typeof window.BubbleRender.updateScrollBar === 'function') {
    return window.BubbleRender.updateScrollBar();
  }
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

function reconcileBubbleInteractionState(skipFields = new Set()) {
  if (window.BubbleReset && typeof window.BubbleReset.reconcileBubbleInteractionState === 'function') {
    return window.BubbleReset.reconcileBubbleInteractionState(skipFields);
  }
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
    resetActiveBubbles
  };
}