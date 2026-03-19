const BUBBLE_RENDER_VISIBLE_ROWS = 2;
const { getDisplayedFields, getActiveFilters, hasActiveFilters } = window.QueryStateReaders;

function bubbleRenderGetMaxStartRow() {
  if (typeof totalRows === 'undefined') return 0;
  return Math.max(0, totalRows - BUBBLE_RENDER_VISIBLE_ROWS);
}

function bubbleRenderClampScrollRow(nextRow) {
  const numericRow = Number.isFinite(nextRow) ? nextRow : 0;
  const roundedRow = Math.round(numericRow);
  return Math.max(0, Math.min(bubbleRenderGetMaxStartRow(), roundedRow));
}

function bubbleRenderApplyScrollRow(nextRow, options = {}) {
  const { force = false } = options;
  if (typeof scrollRow === 'undefined') return false;

  const clampedRow = bubbleRenderClampScrollRow(nextRow);
  const changed = clampedRow !== scrollRow;
  if (!changed && !force) return false;

  scrollRow = clampedRow;

  const listDiv = document.getElementById('bubble-list');
  if (listDiv) {
    listDiv.style.transform = `translateY(-${scrollRow * rowHeight}px)`;
  }

  bubbleRenderUpdateScrollBar();
  return changed;
}

function bubbleRenderScrollByRows(deltaRows) {
  return bubbleRenderApplyScrollRow((typeof scrollRow === 'number' ? scrollRow : 0) + deltaRows);
}

function bubbleRenderResetScroll() {
  bubbleRenderApplyScrollRow(0, { force: true });
}

function bubbleRenderCreateOrUpdateBubble(def, existingBubble = null) {
  const BubbleCtor = window.BubbleSystem && window.BubbleSystem.Bubble;
  if (!BubbleCtor) {
    throw new Error('Bubble class is not available for rendering');
  }

  let bubbleInstance;
  if (existingBubble && existingBubble._bubbleInstance) {
    bubbleInstance = existingBubble._bubbleInstance;
    bubbleInstance.update();
    return bubbleInstance.getElement();
  }

  bubbleInstance = new BubbleCtor(def);
  const el = bubbleInstance.getElement();
  el._bubbleInstance = bubbleInstance;
  return el;
}

function bubbleRenderAll() {
  if (typeof filteredDefs === 'undefined' || typeof currentCategory === 'undefined') {
    console.log('renderBubbles: Required globals not available yet');
    return;
  }

  const container = document.getElementById('bubble-container');
  const listDiv = document.getElementById('bubble-list');
  if (!container || !listDiv) return;

  let list;
  if (currentCategory === 'All') {
    list = filteredDefs;
  } else if (currentCategory === 'Selected') {
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
      return Array.isArray(cat) ? cat.includes(currentCategory) : cat === currentCategory;
    });
  }

  list.sort((a, b) => {
    const aFilter = hasActiveFilters(a.name);
    const bFilter = hasActiveFilters(b.name);
    if (aFilter && !bFilter) return -1;
    if (!aFilter && bFilter) return 1;
    return 0;
  });

  if (currentCategory === 'Selected') {
    const existingBubbles = Array.from(listDiv.children);
    const existingBubbleMap = new Map(existingBubbles.map(b => [b.textContent.trim(), b]));
    listDiv.innerHTML = '';
    list.forEach(def => {
      const existingBubble = existingBubbleMap.get(def.name);
      const bubbleEl = bubbleRenderCreateOrUpdateBubble(def, existingBubble);
      listDiv.appendChild(bubbleEl);
    });
  } else {
    listDiv.innerHTML = '';
    list.forEach(def => {
      const bubbleEl = bubbleRenderCreateOrUpdateBubble(def);
      listDiv.appendChild(bubbleEl);
    });
  }

  const firstBubble = listDiv.querySelector('.bubble');
  if (firstBubble) {
    const gapVal = getComputedStyle(listDiv).getPropertyValue('gap') || '0px';
    const gap = parseFloat(gapVal) || 0;
    rowHeight = firstBubble.getBoundingClientRect().height + gap;
    const bubbleW = firstBubble.offsetWidth;
    const twoRowsH = rowHeight * BUBBLE_RENDER_VISIBLE_ROWS - gap;
    const sixColsW = bubbleW * 6 + gap * 5;
    const fudge = 8;
    const paddedH = twoRowsH + 12 - fudge;
    const paddedW = sixColsW + 8;
    container.style.height = paddedH + 'px';
    container.style.width = paddedW + 'px';
    const scrollCont = document.querySelector('.bubble-scrollbar-container');
    if (scrollCont) scrollCont.style.height = paddedH + 'px';
    totalRows = Math.ceil(list.length / 6);
    bubbleRenderApplyScrollRow(scrollRow, { force: true });
  } else {
    totalRows = 0;
    scrollRow = 0;
    rowHeight = 0;
    bubbleRenderUpdateScrollBar();
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

function bubbleRenderSafe() {
  if (typeof isBubbleAnimatingBack === 'undefined') {
    console.log('safeRenderBubbles: Required globals not available yet');
    return;
  }

  if (isBubbleAnimatingBack) {
    pendingRenderBubbles = true;
    return;
  }

  bubbleRenderAll();
  pendingRenderBubbles = false;
}

function bubbleRenderUpdateScrollBar() {
  if (typeof totalRows === 'undefined' || typeof scrollRow === 'undefined') {
    return;
  }

  const listDiv = document.getElementById('bubble-list');
  const renderedBubbleCount = listDiv ? listDiv.querySelectorAll('.bubble').length : 0;
  const scrollbarContainer = document.querySelector('.bubble-scrollbar-container');
  if (scrollbarContainer) {
    const needScroll = renderedBubbleCount > 0 && totalRows > BUBBLE_RENDER_VISIBLE_ROWS;
    scrollbarContainer.style.display = needScroll ? 'block' : 'none';
    if (!needScroll) return;
  }

  const track = document.getElementById('bubble-scrollbar-track');
  const thumb = document.getElementById('bubble-scrollbar-thumb');
  if (!track || !thumb) return;

  const maxStartRow = bubbleRenderGetMaxStartRow();
  const trackH = track.clientHeight;
  track.style.background = 'rgba(255, 255, 255, 0.15)';

  const visibleRatio = totalRows > 0 ? (BUBBLE_RENDER_VISIBLE_ROWS / totalRows) : 1;
  let thumbH = Math.max(24, trackH * visibleRatio);
  thumbH = Math.min(thumbH, trackH);

  const scrollRatio = maxStartRow > 0 ? (scrollRow / maxStartRow) : 0;
  const maxTopPos = trackH - thumbH;
  const topPos = scrollRatio * maxTopPos;

  thumb.style.height = `${thumbH}px`;
  thumb.style.top = `${topPos}px`;
}

window.BubbleRender = {
  getBubbleMaxStartRow: bubbleRenderGetMaxStartRow,
  clampBubbleScrollRow: bubbleRenderClampScrollRow,
  applyBubbleScrollRow: bubbleRenderApplyScrollRow,
  scrollBubblesByRows: bubbleRenderScrollByRows,
  resetBubbleScroll: bubbleRenderResetScroll,
  createOrUpdateBubble: bubbleRenderCreateOrUpdateBubble,
  renderBubbles: bubbleRenderAll,
  safeRenderBubbles: bubbleRenderSafe,
  updateScrollBar: bubbleRenderUpdateScrollBar
};