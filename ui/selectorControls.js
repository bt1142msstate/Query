import { VisibilityUtils } from '../core/visibility.js';
import { initializeSearchInputs } from './searchUI.js';
import { escapeHtml } from '../core/html.js';
import { VirtualList } from './virtualList.js';

function createBooleanPillSelector(values, currentValue = '', options = {}) {
  const onChange = typeof options.onChange === 'function' ? options.onChange : null;
  const containerId = Object.prototype.hasOwnProperty.call(options, 'containerId')
    ? options.containerId
    : 'condition-select-container';
  const normalizedValues = (Array.isArray(values) ? values : []).slice(0, 2).map(value => {
    const display = typeof value === 'object'
      ? (value.Name || value.Display || value.name || value.display || value.RawValue)
      : value;
    const literal = typeof value === 'object'
      ? (value.RawValue ?? value.Value ?? value.value ?? value.Name ?? value.Display)
      : value;
    const description = typeof value === 'object'
      ? (value.Description || value.description || value.Desc || value.desc || '')
      : '';

    return {
      display: String(display),
      literal: String(literal),
      description: String(description || '').trim()
    };
  });

  const container = document.createElement('div');
  container.className = 'boolean-pill-selector';
  if (containerId) {
    container.id = containerId;
  }

  let selectedValue = currentValue ? String(currentValue) : '';

  function render() {
    container.innerHTML = '';

    normalizedValues.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'boolean-pill-option';
      button.dataset.value = option.literal;
      button.dataset.display = option.display;
      button.textContent = option.display;
      button.setAttribute('aria-pressed', selectedValue === option.literal ? 'true' : 'false');
      if (option.description) {
        button.setAttribute('data-tooltip', option.description);
      }
      if (selectedValue === option.literal) {
        button.classList.add('active');
      }
      if (index === 0) {
        button.classList.add('is-left');
      }
      if (index === normalizedValues.length - 1) {
        button.classList.add('is-right');
      }

      button.addEventListener('click', () => {
        if (selectedValue === option.literal) {
          return;
        }
        selectedValue = option.literal;
        render();
        container.dispatchEvent(new Event('change', { bubbles: true }));
        if (onChange) {
          onChange(option.literal, option.display);
        }
      });

      container.appendChild(button);
    });
  }

  container.getSelectedValues = function() {
    return selectedValue ? [selectedValue] : [];
  };

  container.getSelectedDisplayValues = function() {
    const match = normalizedValues.find(option => option.literal === selectedValue);
    return match ? [match.display] : [];
  };

  container.setSelectedValues = function(valuesToSet) {
    const nextValue = Array.isArray(valuesToSet) && valuesToSet.length ? String(valuesToSet[0]) : '';
    selectedValue = nextValue;
    render();
  };

  render();
  return container;
}

function escapeSelectorControlHtml(value) {
  if (typeof escapeHtml === 'function') {
    return escapeHtml(value);
  }

  const temp = document.createElement('div');
  temp.textContent = String(value ?? '');
  return temp.innerHTML;
}

function createGroupedSelector(values, isMultiSelect, currentValues = [], options = {}) {
  const enableGrouping = options.enableGrouping !== false;
  const containerId = Object.prototype.hasOwnProperty.call(options, 'containerId')
    ? options.containerId
    : 'condition-select-container';
  const selectorInstanceId = Math.random().toString(36).slice(2, 10);
  const GROUP_HEADER_HEIGHT = 48;
  const OPTION_ROW_HEIGHT = 50;
  const selectedValues = new Set((Array.isArray(currentValues) ? currentValues : []).map(value => String(value)));
  const groupedData = new Map();
  const ungroupedValues = [];
  const topLevelEntries = [];
  const optionIndex = new Map();
  let visibleRows = [];

  const container = document.createElement('div');
  container.className = 'grouped-selector';
  if (containerId) {
    container.id = containerId;
  }

  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'search-wrapper';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Search options...';
  searchInput.dataset.searchUi = 'enhanced';
  searchInput.dataset.searchWrapperClass = 'grouped-selector-search-field';
  searchInput.dataset.searchClearLabel = 'Clear option search';
  searchWrapper.appendChild(searchInput);
  initializeSearchInputs(searchWrapper);
  container.appendChild(searchWrapper);

  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'grouped-options-container grouped-options-container--virtualized';
  container.appendChild(optionsContainer);

  const emptyState = document.createElement('div');
  emptyState.className = 'post-filter-stream-empty hidden';
  emptyState.textContent = 'No options match this search.';
  emptyState.style.display = 'none';
  container.appendChild(emptyState);

  function compareLabels(a = '', b = '') {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  function highlightText(rawText, searchTerm) {
    if (!searchTerm) {
      return escapeSelectorControlHtml(rawText);
    }

    return escapeSelectorControlHtml(rawText).replace(
      new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi'),
      '<span class="highlight">$1</span>'
    );
  }

  function normalizeValue(value) {
    const display = typeof value === 'object'
      ? (value.Name || value.Display || value.name || value.display || value.RawValue)
      : value;
    const literal = typeof value === 'object'
      ? (value.RawValue ?? value.Value ?? value.value ?? value.Name ?? value.Display)
      : value;
    const explicitGroup = typeof value === 'object' ? (value.Group || value.group || '') : '';
    const description = typeof value === 'object'
      ? (value.Description || value.description || value.Desc || value.desc || '')
      : '';
    const displayText = String(display);
    const derivedGroup = enableGrouping && !explicitGroup && displayText.includes('-')
      ? displayText.split('-')[0].trim()
      : '';
    const group = enableGrouping ? (explicitGroup || derivedGroup) : '';

    return {
      display: displayText,
      literal: String(literal),
      description: String(description || '').trim(),
      group,
      searchText: `${String(displayText)} ${String(literal)}`.toLowerCase()
    };
  }

  values.forEach(rawValue => {
    const normalized = normalizeValue(rawValue);
    if (normalized.group) {
      if (!groupedData.has(normalized.group)) {
        groupedData.set(normalized.group, []);
      }
      groupedData.get(normalized.group).push(normalized);
    } else {
      ungroupedValues.push(normalized);
    }
  });

  groupedData.forEach((groupValues, groupName) => {
    if (groupValues.length < 2) {
      ungroupedValues.push(...groupValues.map(value => ({ ...value, group: '' })));
      return;
    }

    topLevelEntries.push({
      type: 'group',
      name: groupName,
      sortLabel: groupName,
      userExpanded: false,
      options: groupValues.slice()
    });
  });

  ungroupedValues.forEach(value => {
    topLevelEntries.push({
      type: 'item',
      option: value,
      sortLabel: value.display
    });
  });

  function isOptionSelected(option) {
    return selectedValues.has(option.literal);
  }

  function sortOptions(optionList) {
    return optionList.slice().sort((left, right) => {
      const leftSelected = isOptionSelected(left) ? 0 : 1;
      const rightSelected = isOptionSelected(right) ? 0 : 1;
      if (leftSelected !== rightSelected) {
        return leftSelected - rightSelected;
      }

      return compareLabels(left.display || left.literal, right.display || right.literal);
    });
  }

  function topLevelComparator(left, right) {
    const leftSelected = left.type === 'group'
      ? (left.options.some(isOptionSelected) ? 0 : 1)
      : (isOptionSelected(left.option) ? 0 : 1);
    const rightSelected = right.type === 'group'
      ? (right.options.some(isOptionSelected) ? 0 : 1)
      : (isOptionSelected(right.option) ? 0 : 1);

    if (leftSelected !== rightSelected) {
      return leftSelected - rightSelected;
    }

    return compareLabels(left.sortLabel, right.sortLabel);
  }

  function rebuildVisibleRows(resetScroll = false) {
    const searchTerm = searchInput.value.toLowerCase().trim();
    visibleRows = [];
    optionIndex.clear();

    topLevelEntries
      .slice()
      .sort(topLevelComparator)
      .forEach(entry => {
        if (entry.type === 'item') {
          if (searchTerm && !entry.option.searchText.includes(searchTerm)) {
            return;
          }

          visibleRows.push({
            type: 'option',
            option: entry.option,
            groupName: '',
            rawText: entry.option.display,
            height: OPTION_ROW_HEIGHT
          });
          optionIndex.set(entry.option.literal, entry.option);
          return;
        }

        const matchedOptions = sortOptions(entry.options).filter(option => {
          return !searchTerm || option.searchText.includes(searchTerm);
        });

        if (!matchedOptions.length) {
          return;
        }

        const expanded = searchTerm ? true : Boolean(entry.userExpanded);
        visibleRows.push({
          type: 'group',
          groupName: entry.name,
          groupEntry: entry,
          height: GROUP_HEADER_HEIGHT
        });

        if (!expanded) {
          matchedOptions.forEach(option => optionIndex.set(option.literal, option));
          return;
        }

        matchedOptions.forEach(option => {
          optionIndex.set(option.literal, option);
          visibleRows.push({
            type: 'option',
            option,
            groupName: entry.name,
            rawText: option.display.replace(new RegExp(`^${escapeRegExp(entry.name)}\\s*-\\s*`), ''),
            height: OPTION_ROW_HEIGHT
          });
        });
      });

    emptyState.classList.toggle('hidden', visibleRows.length > 0);
    emptyState.style.display = visibleRows.length > 0 ? 'none' : 'block';
    if (optionsContainer.virtualList) {
      optionsContainer.virtualList.setItems(visibleRows, resetScroll);
    } else {
      optionsContainer.innerHTML = '';
      const currentSearch = searchInput.value.toLowerCase().trim();
      visibleRows.forEach(row => {
        optionsContainer.appendChild(row.type === 'group' 
          ? createGroupRow(row, currentSearch) 
          : createOptionRow(row, currentSearch));
      });
    }
  }

  function createGroupRow(row, searchTerm) {
    const element = document.createElement('div');
    element.className = 'group-section';
    element.style.marginBottom = '4px';

    const header = document.createElement('div');
    header.className = 'group-header';

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'toggle-icon';
    const expanded = searchTerm ? true : Boolean(row.groupEntry.userExpanded);
    toggleIcon.innerHTML = expanded ? '&#9662;' : '&#9656;';
    header.appendChild(toggleIcon);

    if (isMultiSelect) {
      const groupCheckbox = document.createElement('input');
      groupCheckbox.type = 'checkbox';
      groupCheckbox.className = 'group-checkbox';
      groupCheckbox.dataset.group = row.groupName;

      const groupOptions = row.groupEntry.options;
      const checkedCount = groupOptions.filter(option => selectedValues.has(option.literal)).length;
      groupCheckbox.checked = checkedCount > 0 && checkedCount === groupOptions.length;
      groupCheckbox.indeterminate = checkedCount > 0 && checkedCount < groupOptions.length;

      groupCheckbox.addEventListener('change', event => {
        const shouldSelect = Boolean(event.currentTarget.checked);
        row.groupEntry.options.forEach(option => {
          if (shouldSelect) {
            selectedValues.add(option.literal);
          } else {
            selectedValues.delete(option.literal);
          }
        });
        container.dispatchEvent(new Event('change', { bubbles: true }));
        rebuildVisibleRows();
      });

      header.appendChild(groupCheckbox);
    }

    const groupLabel = document.createElement('span');
    groupLabel.className = 'group-label';
    groupLabel.innerHTML = highlightText(row.groupName, searchTerm);
    groupLabel.style.display = 'block';
    groupLabel.style.overflow = 'hidden';
    groupLabel.style.textOverflow = 'ellipsis';
    groupLabel.style.whiteSpace = 'nowrap';
    groupLabel.style.flex = '1 1 auto';
    groupLabel.style.minWidth = '0';
    groupLabel.addEventListener('mouseover', function() {
      if (this.offsetWidth < this.scrollWidth) {
        this.setAttribute('data-tooltip', row.groupName);
      } else {
        this.removeAttribute('data-tooltip');
      }
    });
    header.appendChild(groupLabel);

    const visibleCount = row.groupEntry.options.filter(option => !searchTerm || option.searchText.includes(searchTerm)).length;
    const groupCount = document.createElement('span');
    groupCount.className = 'group-count';
    groupCount.textContent = String(visibleCount);
    header.appendChild(groupCount);

    header.addEventListener('click', event => {
      if (event.target instanceof HTMLInputElement) {
        return;
      }
      row.groupEntry.userExpanded = !row.groupEntry.userExpanded;
      rebuildVisibleRows();
    });

    element.appendChild(header);
    return element;
  }

  function createOptionRow(row, searchTerm) {
    const option = row.option;
    const optionItem = document.createElement('div');
    optionItem.className = 'option-item';
    optionItem.style.marginBottom = '4px';
    optionItem.dataset.value = option.literal;
    optionItem.dataset.display = option.display;
    if (row.groupName) {
      optionItem.dataset.group = row.groupName;
    }
    if (option.description) {
      optionItem.setAttribute('data-tooltip', option.description);
    }

    const input = document.createElement('input');
    input.type = isMultiSelect ? 'checkbox' : 'radio';
    input.name = isMultiSelect ? `condition-value-${selectorInstanceId}-multi` : `condition-value-${selectorInstanceId}`;
    input.id = `condition-value-${selectorInstanceId}-${Math.random().toString(36).slice(2, 10)}`;
    input.dataset.value = option.literal;
    input.dataset.display = option.display;
    input.checked = selectedValues.has(option.literal);
    input.className = 'option-item-input';

    const label = document.createElement('label');
    label.className = 'option-item-label';
    label.setAttribute('for', input.id);

    const indicator = document.createElement('span');
    indicator.className = 'option-item-indicator';
    indicator.setAttribute('aria-hidden', 'true');

    const labelText = document.createElement('span');
    labelText.className = 'option-item-text';
    labelText.dataset.rawText = row.rawText || option.display;
    labelText.innerHTML = highlightText(labelText.dataset.rawText, searchTerm);
    labelText.style.display = 'block';
    labelText.style.overflow = 'hidden';
    labelText.style.textOverflow = 'ellipsis';
    labelText.style.whiteSpace = 'nowrap';
    labelText.style.flex = '1 1 auto';
    labelText.style.minWidth = '0';
    labelText.addEventListener('mouseover', function() {
      if (this.offsetWidth < this.scrollWidth) {
        this.setAttribute('data-tooltip', this.dataset.rawText);
      } else {
        this.removeAttribute('data-tooltip');
      }
    });

    label.appendChild(indicator);
    label.appendChild(labelText);
    optionItem.appendChild(input);
    optionItem.appendChild(label);
    optionItem.classList.toggle('is-selected', input.checked);

    input.addEventListener('change', () => {
      if (!isMultiSelect) {
        selectedValues.clear();
      }

      if (input.checked) {
        selectedValues.add(option.literal);
      } else {
        selectedValues.delete(option.literal);
      }

      container.dispatchEvent(new Event('change', { bubbles: true }));
      rebuildVisibleRows();
    });

    return optionItem;
  }

  optionsContainer.virtualList = new VirtualList({
    container: optionsContainer,
    itemHeight: item => item.height || 50,
    renderItem: row => {
      const searchTerm = searchInput.value.toLowerCase().trim();
      return row.type === 'group'
        ? createGroupRow(row, searchTerm)
        : createOptionRow(row, searchTerm);
    }
  });
  optionsContainer.style.overflowY = 'auto';

  searchInput.addEventListener('input', () => {
    rebuildVisibleRows(true);
  });

  container.getSelectedValues = function() {
    return Array.from(selectedValues);
  };

  container.getSelectedDisplayValues = function() {
    return Array.from(selectedValues).map(value => {
      const option = optionIndex.get(value);
      return option ? option.display : value;
    });
  };

  container.setSelectedValues = function(valuesToSet) {
    selectedValues.clear();
    (Array.isArray(valuesToSet) ? valuesToSet : []).forEach(value => {
      selectedValues.add(String(value));
    });
    rebuildVisibleRows();
  };

  container.focusInput = function() {
    searchInput.focus();
  };

  rebuildVisibleRows();
  return container;
}

function parseListInputValues(rawValue) {
  return String(rawValue || '')
    .split(/[\r\n,]+/)
    .map(value => value.trim())
    .filter(Boolean);
}

function createPopupListControl(innerControl, label, placeholder) {
  const resolvedLabel = label || 'Select values';
  const resolvedPlaceholder = placeholder || 'Click to select...';

  const wrapper = document.createElement('div');
  wrapper.className = 'form-mode-popup-list-control';
  const raisedUiKey = `popup-list-control:${Math.random().toString(36).slice(2, 10)}`;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'form-mode-popup-list-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');

  const summarySpan = document.createElement('span');
  summarySpan.className = 'form-mode-popup-list-summary';
  trigger.appendChild(summarySpan);
  trigger.insertAdjacentHTML('beforeend',
    '<svg class="form-mode-popup-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
    '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>'
  );

  const backdrop = document.createElement('div');
  backdrop.className = 'form-mode-popup-list-backdrop';
  backdrop.hidden = true;
  backdrop.classList.add('hidden');

  const popup = document.createElement('div');
  popup.className = 'form-mode-popup-list-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', resolvedLabel);
  popup.hidden = true;
  popup.classList.add('hidden');

  const popupHeader = document.createElement('div');
  popupHeader.className = 'form-mode-popup-list-popup-header';

  const popupTitle = document.createElement('span');
  popupTitle.className = 'form-mode-popup-list-popup-title';
  popupTitle.textContent = resolvedLabel;

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'form-mode-popup-list-done';
  doneBtn.textContent = 'Done';

  const popupBody = document.createElement('div');
  popupBody.className = 'form-mode-popup-list-popup-body';
  popupBody.appendChild(innerControl);

  popupHeader.appendChild(popupTitle);
  popupHeader.appendChild(doneBtn);
  popup.appendChild(popupHeader);
  popup.appendChild(popupBody);

  document.body.appendChild(backdrop);
  document.body.appendChild(popup);
  wrapper.appendChild(trigger);

  function getDisplayValues() {
    if (typeof innerControl.getSelectedDisplayValues === 'function') {
      return innerControl.getSelectedDisplayValues();
    }
    if (typeof innerControl.getSelectedValues === 'function') {
      return innerControl.getSelectedValues();
    }
    if (typeof innerControl.getFormValues === 'function') {
      return innerControl.getFormValues();
    }
    return [];
  }

  function updateSummary() {
    const displayValues = getDisplayValues();
    if (!displayValues || displayValues.length === 0) {
      summarySpan.textContent = resolvedPlaceholder;
      summarySpan.classList.add('is-placeholder');
    } else if (displayValues.length <= 2) {
      summarySpan.textContent = displayValues.join(', ');
      summarySpan.classList.remove('is-placeholder');
    } else {
      summarySpan.innerHTML = escapeSelectorControlHtml(displayValues[0]) + ' <span class="form-mode-popup-more">and ' + (displayValues.length - 1) + ' more</span>';
      summarySpan.classList.remove('is-placeholder');
    }

    trigger.setAttribute('aria-expanded', popup.hidden ? 'false' : 'true');
  }

  function openPopup() {
    VisibilityUtils.show([backdrop, popup], {
      ariaHidden: false,
      raisedUiKey
    });
    trigger.setAttribute('aria-expanded', 'true');

    if (typeof innerControl.focusInput === 'function') {
      innerControl.focusInput();
      return;
    }

    const firstInput = innerControl.querySelector('input:not([type="file"]), textarea');
    if (firstInput) {
      firstInput.focus();
    }
  }

  function closePopup() {
    VisibilityUtils.hide([backdrop, popup], {
      ariaHidden: true,
      raisedUiKey
    });
    trigger.setAttribute('aria-expanded', 'false');
    updateSummary();
    wrapper.dispatchEvent(new Event('change', { bubbles: true }));
  }

  trigger.addEventListener('click', () => {
    if (popup.hidden) {
      openPopup();
    } else {
      closePopup();
    }
  });

  doneBtn.addEventListener('click', closePopup);
  backdrop.addEventListener('click', closePopup);

  const onDocKey = function(event) {
    if (event.key === 'Escape' && !popup.hidden) {
      closePopup();
      trigger.focus();
    }
  };
  document.addEventListener('keydown', onDocKey);

  wrapper._cleanupPopup = function() {
    if (!popup.hidden) {
      VisibilityUtils.hide([backdrop, popup], {
        ariaHidden: true,
        raisedUiKey
      });
    }
    backdrop.remove();
    popup.remove();
    document.removeEventListener('keydown', onDocKey);
  };

  wrapper.getSelectedValues = function() {
    if (typeof innerControl.getSelectedValues === 'function') {
      return innerControl.getSelectedValues();
    }
    if (typeof innerControl.getFormValues === 'function') {
      return innerControl.getFormValues();
    }
    return [];
  };

  wrapper.getSelectedDisplayValues = function() {
    return getDisplayValues();
  };

  wrapper.getFormValues = function() {
    return wrapper.getSelectedValues();
  };

  wrapper.setSelectedValues = function(valuesToSet) {
    if (typeof innerControl.setSelectedValues === 'function') {
      innerControl.setSelectedValues(valuesToSet);
    } else if (typeof innerControl.setFormValues === 'function') {
      innerControl.setFormValues(valuesToSet);
    }
    updateSummary();
  };

  wrapper.setFormValues = function(valuesToSet) {
    wrapper.setSelectedValues(valuesToSet);
  };

  wrapper.focusInput = function() {
    trigger.focus();
  };

  updateSummary();
  return wrapper;
}

function createListPasteInput(currentValues = [], options = {}) {
  const containerId = Object.prototype.hasOwnProperty.call(options, 'containerId')
    ? options.containerId
    : 'condition-select-container';
  const container = document.createElement('div');
  container.className = 'list-paste-input';
  if (containerId) {
    container.id = containerId;
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'list-paste-toolbar';

  const hint = document.createElement('span');
  hint.className = 'list-paste-hint';
  hint.textContent = options.hint || 'Paste one value per line, comma-separated values, or upload a .txt/.csv file.';

  const actions = document.createElement('div');
  actions.className = 'list-paste-actions';

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'list-paste-btn';
  uploadBtn.setAttribute('aria-label', 'Upload list file');
  uploadBtn.setAttribute('data-tooltip', 'Upload text or CSV file');
  uploadBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M12 16V4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 9l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="sr-only">Upload file</span>';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'list-paste-btn list-paste-btn-secondary';
  clearBtn.setAttribute('aria-label', 'Clear list values');
  clearBtn.setAttribute('data-tooltip', 'Clear loaded values');
  clearBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="sr-only">Clear values</span>';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.txt,.csv,text/plain,text/csv';
  fileInput.className = 'list-paste-file-input';

  const textArea = document.createElement('textarea');
  textArea.className = 'list-paste-textarea';
  textArea.rows = options.rows || 6;
  textArea.placeholder = options.placeholder || 'Paste one value per line';

  const status = document.createElement('div');
  status.className = 'list-paste-status';

  const loadFile = file => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      textArea.value = String(reader.result || '');
      updateStatus();
      container.classList.remove('drag-over');
      if (typeof options.onChange === 'function') {
        options.onChange();
      }
    };
    reader.readAsText(file);
  };

  const updateStatus = () => {
    const values = parseListInputValues(textArea.value);
    status.textContent = values.length === 0
      ? 'No values loaded'
      : `${values.length} value${values.length === 1 ? '' : 's'} ready`;
  };

  uploadBtn.addEventListener('click', () => fileInput.click());
  clearBtn.addEventListener('click', () => {
    textArea.value = '';
    fileInput.value = '';
    updateStatus();
    if (typeof options.onChange === 'function') {
      options.onChange();
    }
  });

  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files || [];
    if (!file) return;
    loadFile(file);
  });

  textArea.addEventListener('input', () => {
    updateStatus();
    if (typeof options.onChange === 'function') {
      options.onChange();
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    container.addEventListener(eventName, event => {
      event.preventDefault();
      container.classList.add('drag-over');
    });
  });

  ['dragleave', 'dragend'].forEach(eventName => {
    container.addEventListener(eventName, event => {
      event.preventDefault();
      if (!container.contains(event.relatedTarget)) {
        container.classList.remove('drag-over');
      }
    });
  });

  container.addEventListener('drop', event => {
    event.preventDefault();
    container.classList.remove('drag-over');
    const [file] = event.dataTransfer?.files || [];
    if (file) {
      loadFile(file);
    }
  });

  toolbar.appendChild(hint);
  actions.appendChild(uploadBtn);
  actions.appendChild(clearBtn);
  toolbar.appendChild(actions);

  container.appendChild(toolbar);
  container.appendChild(textArea);
  container.appendChild(status);
  container.appendChild(fileInput);

  container.getSelectedValues = function() {
    return parseListInputValues(textArea.value);
  };

  container.getSelectedDisplayValues = function() {
    return this.getSelectedValues();
  };

  container.setSelectedValues = function(valuesToSet) {
    textArea.value = Array.isArray(valuesToSet) ? valuesToSet.join('\n') : '';
    updateStatus();
  };

  container.focusInput = function() {
    textArea.focus();
  };

  container.setSelectedValues(currentValues);
  return container;
}

const SelectorControls = Object.freeze({
  createBooleanPillSelector,
  createGroupedSelector,
  createListPasteInput,
  createPopupListControl,
  parseListInputValues
});

export {
  SelectorControls,
  createBooleanPillSelector,
  createGroupedSelector,
  createListPasteInput,
  createPopupListControl,
  parseListInputValues
};
