import { initializeSearchInputs } from '../../../ui/searchUI.js';

const STREAMED_EQUALS_BATCH_SIZE = 800;
const STREAMED_EQUALS_ROW_HEIGHT = 50;
const STREAMED_EQUALS_OVERSCAN = 6;

export function getNormalizedEqualsOptionValues({
  fieldName,
  rawValue,
  getBlankSentinel,
  getFieldType
}) {
  const fieldType = getFieldType(fieldName);

  if (rawValue === undefined || rawValue === null) {
    return [getBlankSentinel()];
  }

  if (typeof rawValue === 'string') {
    if (rawValue.includes('\x1F')) {
      const values = rawValue
        .split('\x1F')
        .map(part => String(part).trim())
        .filter(Boolean);

      return values.length ? values : [getBlankSentinel()];
    }

    if (!rawValue.trim()) {
      return [getBlankSentinel()];
    }
  }

  if (fieldType === 'number' || fieldType === 'money' || fieldType === 'date') {
    return [String(rawValue).trim()].filter(Boolean);
  }

  return [String(rawValue ?? '').trim()].filter(Boolean);
}

export function createPostFilterStreamedEqualsSelector({
  fieldName,
  baseViewData,
  activeOperator,
  getBlankSentinel,
  getCurrentOperatorValues,
  getFieldType,
  isBlankSentinel,
  formatFilterValue,
  document,
  window
}) {
  const rows = Array.isArray(baseViewData?.rows) ? baseViewData.rows : [];
  const columnIndex = baseViewData?.columnMap instanceof Map ? baseViewData.columnMap.get(fieldName) : undefined;
  const selectedValues = new Set(getCurrentOperatorValues(fieldName, activeOperator).map(value => String(value || '')));
  const optionMap = new Map();
  const optionOrder = [];
  const container = document.createElement('div');
  const searchWrapper = document.createElement('div');
  const searchInput = document.createElement('input');
  const status = document.createElement('div');
  const optionsContainer = document.createElement('div');
  const spacer = document.createElement('div');
  const viewport = document.createElement('div');
  const emptyState = document.createElement('div');

  let filteredValues = [];
  let searchTerm = '';
  let scanIndex = 0;
  let scanComplete = false;
  let scanFrame = null;
  let renderFrame = null;
  let disposed = false;

  container.className = 'grouped-selector grouped-selector--streamed';

  searchWrapper.className = 'search-wrapper';
  searchInput.type = 'search';
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Search loaded values...';
  searchInput.dataset.searchUi = 'enhanced';
  searchInput.dataset.searchWrapperClass = 'grouped-selector-search-field';
  searchInput.dataset.searchClearLabel = 'Clear loaded value search';
  searchWrapper.appendChild(searchInput);
  initializeSearchInputs(searchWrapper);

  status.className = 'post-filter-stream-status';
  searchWrapper.appendChild(status);

  optionsContainer.className = 'grouped-options-container grouped-options-container--virtualized';
  spacer.className = 'post-filter-stream-spacer';
  viewport.className = 'post-filter-stream-viewport';
  emptyState.className = 'post-filter-stream-empty hidden';
  emptyState.style.display = 'none';

  optionsContainer.appendChild(spacer);
  optionsContainer.appendChild(viewport);
  optionsContainer.appendChild(emptyState);
  container.appendChild(searchWrapper);
  container.appendChild(optionsContainer);

  function getOptionDisplay(optionValue) {
    if (isBlankSentinel(optionValue)) {
      return '(Blank values)';
    }

    return formatFilterValue({ cond: 'equals', val: optionValue }, fieldName);
  }

  function compareOptions(leftValue, rightValue) {
    const left = optionMap.get(leftValue);
    const right = optionMap.get(rightValue);
    const leftSelected = selectedValues.has(leftValue) ? 0 : 1;
    const rightSelected = selectedValues.has(rightValue) ? 0 : 1;

    if (leftSelected !== rightSelected) {
      return leftSelected - rightSelected;
    }

    return String(left?.display || leftValue).localeCompare(String(right?.display || rightValue), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }

  function applyFilter() {
    const normalizedTerm = searchTerm.toLowerCase().trim();
    filteredValues = !normalizedTerm
      ? optionOrder.slice()
      : optionOrder.filter(optionValue => {
        const option = optionMap.get(optionValue);
        return Boolean(option && option.searchText.includes(normalizedTerm));
      });
  }

  function scheduleRender(resetScroll = false) {
    if (disposed) {
      return;
    }

    if (resetScroll) {
      optionsContainer.scrollTop = 0;
    }

    if (renderFrame !== null) {
      return;
    }

    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = null;
      renderOptions();
    });
  }

  function updateStatus() {
    if (!rows.length || columnIndex === undefined) {
      status.textContent = 'No loaded values are available for this field.';
      return;
    }

    const rowCountLabel = Number(rows.length || 0).toLocaleString();
    const loadedCountLabel = Number(optionOrder.length || 0).toLocaleString();
    status.textContent = scanComplete
      ? `${loadedCountLabel} distinct loaded values`
      : `Loading values from ${rowCountLabel} rows • ${loadedCountLabel} distinct so far`;
  }

  function upsertOption(optionValue) {
    const normalizedValue = String(optionValue || '');
    const existingOption = optionMap.get(normalizedValue);

    if (existingOption) {
      existingOption.count += 1;
      return;
    }

    const display = getOptionDisplay(normalizedValue);
    optionMap.set(normalizedValue, {
      value: normalizedValue,
      display,
      count: 1,
      searchText: `${display} ${normalizedValue}`.toLowerCase()
    });
    optionOrder.push(normalizedValue);
  }

  function createOptionItem(optionValue, absoluteIndex) {
    const option = optionMap.get(optionValue);
    const item = document.createElement('div');
    const input = document.createElement('input');
    const label = document.createElement('label');
    const indicator = document.createElement('span');
    const labelText = document.createElement('span');

    item.className = 'option-item post-filter-stream-option';
    item.style.top = `${absoluteIndex * STREAMED_EQUALS_ROW_HEIGHT}px`;
    item.style.height = `${STREAMED_EQUALS_ROW_HEIGHT - 4}px`;

    input.type = 'checkbox';
    input.className = 'option-item-input';
    input.checked = selectedValues.has(optionValue);
    input.id = `post-filter-streamed-${Math.random().toString(36).slice(2, 10)}`;

    if (input.checked) {
      item.classList.add('is-selected');
    }

    label.className = 'option-item-label';
    label.setAttribute('for', input.id);

    indicator.className = 'option-item-indicator';
    indicator.setAttribute('aria-hidden', 'true');

    labelText.className = 'option-item-text';
    labelText.textContent = `${option.display} (${Number(option.count || 0).toLocaleString()})`;
    labelText.style.display = 'block';
    labelText.style.overflow = 'hidden';
    labelText.style.textOverflow = 'ellipsis';
    labelText.style.whiteSpace = 'nowrap';
    labelText.style.flex = '1 1 auto';
    labelText.style.minWidth = '0';
    labelText.addEventListener('mouseover', function() {
      if (this.offsetWidth < this.scrollWidth) {
        this.setAttribute('data-tooltip', `${option.display} (${Number(option.count || 0).toLocaleString()} loaded rows)`);
      } else {
        this.removeAttribute('data-tooltip');
      }
    });

    label.appendChild(indicator);
    label.appendChild(labelText);
    item.appendChild(input);
    item.appendChild(label);

    input.addEventListener('change', () => {
      if (input.checked) {
        selectedValues.add(optionValue);
      } else {
        selectedValues.delete(optionValue);
      }

      optionOrder.sort(compareOptions);
      applyFilter();
      scheduleRender();
      container.dispatchEvent(new Event('change', { bubbles: true }));
    });

    return item;
  }

  function renderOptions() {
    if (disposed) {
      return;
    }

    updateStatus();
    viewport.innerHTML = '';

    const viewportHeight = optionsContainer.clientHeight || 320;
    const totalCount = filteredValues.length;
    const start = Math.max(0, Math.floor(optionsContainer.scrollTop / STREAMED_EQUALS_ROW_HEIGHT) - STREAMED_EQUALS_OVERSCAN);
    const visibleCount = Math.ceil(viewportHeight / STREAMED_EQUALS_ROW_HEIGHT) + (STREAMED_EQUALS_OVERSCAN * 2);
    const end = Math.min(totalCount, start + visibleCount);

    spacer.style.height = `${Math.max(totalCount * STREAMED_EQUALS_ROW_HEIGHT, viewportHeight)}px`;
    emptyState.classList.toggle('hidden', totalCount > 0);
    emptyState.style.display = totalCount > 0 ? 'none' : 'block';
    emptyState.textContent = scanComplete ? 'No loaded values match this search.' : 'Loading matching values...';

    for (let index = start; index < end; index += 1) {
      viewport.appendChild(createOptionItem(filteredValues[index], index));
    }
  }

  function processScanChunk() {
    scanFrame = null;

    if (disposed || columnIndex === undefined) {
      scanComplete = true;
      applyFilter();
      scheduleRender();
      return;
    }

    const end = Math.min(scanIndex + STREAMED_EQUALS_BATCH_SIZE, rows.length);
    for (let index = scanIndex; index < end; index += 1) {
      const row = rows[index];
      const rawValue = Array.isArray(row) ? row[columnIndex] : undefined;
      const seenInRow = new Set();

      getNormalizedEqualsOptionValues({
        fieldName,
        rawValue,
        getBlankSentinel,
        getFieldType
      }).forEach(optionValue => {
        const normalizedValue = String(optionValue || '');
        if (!normalizedValue || seenInRow.has(normalizedValue)) {
          return;
        }

        seenInRow.add(normalizedValue);
        upsertOption(normalizedValue);
      });
    }

    scanIndex = end;
    if (scanIndex >= rows.length) {
      scanComplete = true;
      optionOrder.sort(compareOptions);
    }

    applyFilter();
    scheduleRender();

    if (!scanComplete && !disposed) {
      scanFrame = window.requestAnimationFrame(processScanChunk);
    }
  }

  searchInput.addEventListener('input', event => {
    searchTerm = String(event.target?.value || '');
    applyFilter();
    scheduleRender(true);
  });

  optionsContainer.addEventListener('scroll', () => {
    scheduleRender();
  }, { passive: true });

  container.getSelectedValues = function() {
    return Array.from(selectedValues);
  };

  container.getSelectedDisplayValues = function() {
    return Array.from(selectedValues).map(value => {
      const option = optionMap.get(value);
      return option ? option.display : getOptionDisplay(value);
    });
  };

  container.setSelectedValues = function(valuesToSet) {
    selectedValues.clear();
    (Array.isArray(valuesToSet) ? valuesToSet : []).forEach(value => {
      const normalizedValue = String(value || '');
      if (normalizedValue) {
        selectedValues.add(normalizedValue);
      }
    });

    optionOrder.sort(compareOptions);
    applyFilter();
    scheduleRender();
  };

  container.focusInput = function() {
    searchInput.focus();
  };

  container.destroy = function() {
    disposed = true;
    if (scanFrame !== null) {
      window.cancelAnimationFrame(scanFrame);
    }
    if (renderFrame !== null) {
      window.cancelAnimationFrame(renderFrame);
    }
  };

  applyFilter();
  updateStatus();
  scheduleRender();
  scanFrame = window.requestAnimationFrame(processScanChunk);

  return container;
}
