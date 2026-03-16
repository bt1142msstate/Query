/* Re-position the input capsule so it keeps a constant gap above the condition buttons */
window.positionInputWrapper = function(){
  const inputWrapper = window.DOM.inputWrapper;
  const conditionPanel = window.DOM.conditionPanel;

  if(!inputWrapper.classList.contains('show')) return;
  const panelRect   = conditionPanel.getBoundingClientRect();
  const wrapperRect = inputWrapper.getBoundingClientRect();
  const GAP = 12;

  let top = panelRect.top - wrapperRect.height - GAP;

  const headerHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 64;
  const minTop = headerHeight + 24;
  if (top < minTop) {
    top = minTop;
  }

  inputWrapper.style.top = `${top}px`;
  inputWrapper.style.setProperty('--wrapper-top', `${top}px`);
  inputWrapper.style.setProperty('--panel-top', `${panelRect.top}px`);
};

/** Rebuild the query JSON and show it */
window.jsonTreeCollapsedPaths = window.jsonTreeCollapsedPaths || new Set();

window.escapeJsonHtml = function(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

window.renderJsonPrimitive = function(value) {
  if (value === null) {
    return '<span class="json-null">null</span>';
  }

  if (typeof value === 'string') {
    return `<span class="json-string">"${window.escapeJsonHtml(value)}"</span>`;
  }

  if (typeof value === 'number') {
    return `<span class="json-number">${String(value)}</span>`;
  }

  if (typeof value === 'boolean') {
    return `<span class="json-boolean">${String(value)}</span>`;
  }

  return `<span class="json-string">"${window.escapeJsonHtml(String(value))}"</span>`;
};

window.renderJsonNode = function(key, value, depth, isLast, path) {
  const comma = isLast ? '' : '<span class="json-comma">,</span>';
  const indent = `<span class="json-indent" style="--json-depth:${depth}"></span>`;
  const keyHtml = key === null
    ? ''
    : `<span class="json-key">"${window.escapeJsonHtml(key)}"</span><span class="json-colon">: </span>`;

  if (value === null || typeof value !== 'object') {
    return `
      <div class="json-line">
        ${indent}
        <span class="json-disclosure-spacer" aria-hidden="true"></span>
        ${keyHtml}${window.renderJsonPrimitive(value)}${comma}
      </div>
    `;
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);
  const openToken = isArray ? '[' : '{';
  const closeToken = isArray ? ']' : '}';

  if (entries.length === 0) {
    return `
      <div class="json-line">
        ${indent}
        <span class="json-disclosure-spacer" aria-hidden="true"></span>
        ${keyHtml}<span class="json-bracket">${openToken}${closeToken}</span>${comma}
      </div>
    `;
  }

  const childHtml = entries.map(([childKey, childValue], index) => {
    const childPath = `${path}.${window.escapeJsonHtml(childKey)}`;
    return window.renderJsonNode(isArray ? null : childKey, childValue, depth + 1, index === entries.length - 1, childPath);
  }).join('');
  const summaryLabel = `${entries.length} ${isArray ? (entries.length === 1 ? 'item' : 'items') : (entries.length === 1 ? 'key' : 'keys')}`;
  const isOpen = !window.jsonTreeCollapsedPaths.has(path);

  return `
    <details class="json-node" data-json-path="${path}"${isOpen ? ' open' : ''}>
      <summary class="json-summary">
        ${indent}
        <span class="json-disclosure" aria-hidden="true"></span>
        ${keyHtml}<span class="json-bracket">${openToken}</span><span class="json-collapsed-preview"><span class="json-meta">${summaryLabel}</span><span class="json-bracket">${closeToken}</span>${comma}</span>
      </summary>
      <div class="json-children">
        ${childHtml}
      </div>
      <div class="json-closing">
        ${indent}
        <span class="json-disclosure-spacer" aria-hidden="true"></span>
        <span class="json-bracket">${closeToken}</span>${comma}
      </div>
    </details>
  `;
};

window.renderJsonTree = function(payload) {
  const tree = document.getElementById('query-json-tree');
  if (!tree) return;
  tree.innerHTML = window.renderJsonNode(null, payload, 0, true, '$');
};

window.copyQueryJsonToClipboard = async function() {
  const queryBox = window.DOM.queryBox;
  const rawJson = queryBox instanceof HTMLTextAreaElement
    ? queryBox.value
    : (queryBox?.textContent || '');
  if (!rawJson) return;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(rawJson);
    } else {
      const scratch = document.createElement('textarea');
      scratch.value = rawJson;
      scratch.setAttribute('readonly', '');
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.appendChild(scratch);
      scratch.select();
      document.execCommand('copy');
      scratch.remove();
    }

    const copyBtn = document.getElementById('copy-json-btn');
    copyBtn?.classList.add('copied');
    setTimeout(() => copyBtn?.classList.remove('copied'), 1200);
  } catch (error) {
    console.error('Failed to copy JSON:', error);
  }
};

window.updateQueryJson = function(){
  const tableNameInput = window.DOM.tableNameInput;
  const queryName = tableNameInput ? tableNameInput.value.trim() : '';
  const payload = window.buildBackendQueryPayload(queryName);
  if (window.DOM.queryBox) {
    const formattedJson = JSON.stringify(payload, null, 2);
    if (window.DOM.queryBox instanceof HTMLTextAreaElement) {
      window.DOM.queryBox.value = formattedJson;
    } else {
      window.DOM.queryBox.textContent = formattedJson;
    }
  }
  window.renderJsonTree(payload);
  if (window.updateButtonStates) window.updateButtonStates();
};

window.onDOMReady(() => {
  const jsonTree = document.getElementById('query-json-tree');
  if (jsonTree) {
    jsonTree.addEventListener('toggle', (event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.dataset.jsonPath) return;
      if (details.open) {
        window.jsonTreeCollapsedPaths.delete(details.dataset.jsonPath);
      } else {
        window.jsonTreeCollapsedPaths.add(details.dataset.jsonPath);
      }
    });
  }

  const copyBtn = document.getElementById('copy-json-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      window.copyQueryJsonToClipboard();
    });
  }
});

window.shouldFieldHavePurpleStyling = function(fieldName) {
  if (!fieldName) return false;

  if (window.shouldFieldHavePurpleStylingBase) {
    return window.shouldFieldHavePurpleStylingBase(fieldName, window.displayedFields, window.activeFilters);
  }

  return !!(
    window.displayedFields && window.displayedFields.includes(fieldName) ||
    window.activeFilters && window.activeFilters[fieldName] &&
    window.activeFilters[fieldName].filters &&
    window.activeFilters[fieldName].filters.length > 0
  );
};

window.createBooleanPillSelector = function(values, currentValue = '', options = {}) {
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

    return {
      display: String(display),
      literal: String(literal)
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
};

window.createGroupedSelector = function(values, isMultiSelect, currentValues = [], options = {}) {
  const enableGrouping = options.enableGrouping !== false;
  const containerId = Object.prototype.hasOwnProperty.call(options, 'containerId')
    ? options.containerId
    : 'condition-select-container';
  const selectorInstanceId = Math.random().toString(36).slice(2, 10);
  const container = document.createElement('div');
  container.className = 'grouped-selector';
  if (containerId) {
    container.id = containerId;
  }

  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'search-wrapper';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Search options...';
  searchWrapper.appendChild(searchInput);
  container.appendChild(searchWrapper);

  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'grouped-options-container';
  container.appendChild(optionsContainer);

  const groupedData = new Map();
  const ungroupedValues = [];
  const groupElements = [];
  const allOptionItems = [];

  values.forEach(value => {
    const display = typeof value === 'object' ? (value.Name || value.Display || value.name || value.display || value.RawValue) : value;
    const literal = typeof value === 'object' ? (value.RawValue ?? value.Value ?? value.value ?? value.Name ?? value.Display) : value;
    const explicitGroup = typeof value === 'object' ? (value.Group || value.group || '') : '';
    const displayText = String(display);
    const derivedGroup = enableGrouping && !explicitGroup && displayText.includes('-')
      ? displayText.split('-')[0].trim()
      : '';
    const group = enableGrouping ? (explicitGroup || derivedGroup) : '';
    const normalized = { display: displayText, literal: String(literal) };

    if (group) {
      if (!groupedData.has(group)) groupedData.set(group, []);
      groupedData.get(group).push(normalized);
    } else {
      ungroupedValues.push(normalized);
    }
  });

  function syncOptionItemState(optionItem, input) {
    if (!optionItem || !input) return;
    optionItem.classList.toggle('is-selected', Boolean(input.checked));
  }

  function syncGroupCheckboxState(root, groupName) {
    if (!isMultiSelect || !root || !groupName) return;

    const groupOptions = root.querySelectorAll(`.option-item[data-group="${groupName}"] input[type="checkbox"]:not(.group-checkbox)`);
    const groupCheckbox = root.querySelector(`.group-checkbox[data-group="${groupName}"]`);
    if (!groupCheckbox) return;

    const checkedCount = Array.from(groupOptions).filter(opt => opt.checked).length;
    groupCheckbox.checked = checkedCount > 0 && checkedCount === groupOptions.length;
    groupCheckbox.indeterminate = checkedCount > 0 && checkedCount < groupOptions.length;
  }

  function setLabelHighlight(labelTextEl, searchTerm = '') {
    if (!labelTextEl) return;

    const rawText = labelTextEl.dataset.rawText || '';
    if (!searchTerm) {
      labelTextEl.textContent = rawText;
      return;
    }

    const regex = new RegExp(`(${searchTerm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
    labelTextEl.innerHTML = rawText.replace(regex, '<span class="highlight">$1</span>');
  }

  function itemMatchesSearch(optionItem, searchTerm) {
    if (!optionItem || !searchTerm) return true;

    const value = String(optionItem.dataset.value || '').toLowerCase();
    const display = String(optionItem.dataset.display || '').toLowerCase();
    const labelText = optionItem.querySelector('.option-item-text');
    const rawText = String(labelText?.dataset.rawText || '').toLowerCase();
    return value.includes(searchTerm) || display.includes(searchTerm) || rawText.includes(searchTerm);
  }

  function setGroupExpanded(groupEntry, expanded) {
    if (!groupEntry) return;
    groupEntry.options.classList.toggle('collapsed', !expanded);
    groupEntry.header.querySelector('.toggle-icon').innerHTML = expanded ? '&#9662;' : '&#9656;';
  }

  function applySearch(searchTerm) {
    allOptionItems.forEach(item => {
      const matches = itemMatchesSearch(item, searchTerm);
      const labelText = item.querySelector('.option-item-text');
      item.style.display = matches ? '' : 'none';
      setLabelHighlight(labelText, matches ? searchTerm : '');
    });

    if (!searchTerm) {
      groupElements.forEach(groupEntry => {
        groupEntry.section.style.display = '';
        setGroupExpanded(groupEntry, false);
      });
      return;
    }

    groupElements.forEach(groupEntry => {
      const hasMatch = groupEntry.items.some(item => item.style.display !== 'none');
      groupEntry.section.style.display = hasMatch ? '' : 'none';
      if (hasMatch) {
        setGroupExpanded(groupEntry, true);
      }
    });
  }

  function createOptionItem(val, groupName = '', insideGroup = false) {
    const optionItem = document.createElement('div');
    optionItem.className = 'option-item';
    if (insideGroup) optionItem.dataset.group = groupName;
    optionItem.dataset.value = val.literal;
    optionItem.dataset.display = val.display;

    const input = document.createElement('input');
    input.type = isMultiSelect ? 'checkbox' : 'radio';
    input.name = isMultiSelect ? `condition-value-${selectorInstanceId}-multi` : `condition-value-${selectorInstanceId}`;
    input.id = `condition-value-${selectorInstanceId}-${Math.random().toString(36).slice(2, 10)}`;
    input.dataset.value = val.literal;
    input.dataset.display = val.display;
    input.checked = currentValues.includes(val.literal);
    input.className = 'option-item-input';

    if (isMultiSelect && groupName) {
      input.addEventListener('change', () => {
        syncGroupCheckboxState(container, groupName);
      });
    }

    const label = document.createElement('label');
    label.className = 'option-item-label';
    label.setAttribute('for', input.id);

    const indicator = document.createElement('span');
    indicator.className = 'option-item-indicator';
    indicator.setAttribute('aria-hidden', 'true');

    const labelText = document.createElement('span');
    labelText.className = 'option-item-text';
    labelText.dataset.rawText = insideGroup
      ? val.display.replace(new RegExp(`^${groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*-\s*`), '')
      : val.display;
    labelText.textContent = labelText.dataset.rawText;

    label.appendChild(indicator);
    label.appendChild(labelText);

    input.addEventListener('change', () => {
      syncOptionItemState(optionItem, input);
    });

    optionItem.appendChild(input);
    optionItem.appendChild(label);
    syncOptionItemState(optionItem, input);
    allOptionItems.push(optionItem);
    return optionItem;
  }

  groupedData.forEach((groupValues, groupName) => {
    if (groupValues.length < 2) {
      ungroupedValues.push(...groupValues);
      return;
    }

    const groupSection = document.createElement('div');
    groupSection.className = 'group-section';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'toggle-icon';
    toggleIcon.innerHTML = '&#9656;';
    groupHeader.appendChild(toggleIcon);

    if (isMultiSelect) {
      const groupCheckbox = document.createElement('input');
      groupCheckbox.type = 'checkbox';
      groupCheckbox.className = 'group-checkbox';
      groupCheckbox.dataset.group = groupName;

      const allSelected = groupValues.every(val => currentValues.includes(val.literal));
      groupCheckbox.checked = allSelected && groupValues.length > 0;

      groupCheckbox.addEventListener('change', e => {
        const checked = e.target.checked;
        const options = groupSection.querySelectorAll(`.option-item[data-group="${groupName}"] input`);
        options.forEach(opt => {
          opt.checked = checked;
          opt.dispatchEvent(new Event('change', { bubbles: true }));
        });
        syncGroupCheckboxState(groupSection, groupName);
      });

      groupHeader.appendChild(groupCheckbox);
    }

    const groupLabel = document.createElement('span');
    groupLabel.className = 'group-label';
    groupLabel.textContent = groupName;
    groupHeader.appendChild(groupLabel);

    const groupCount = document.createElement('span');
    groupCount.className = 'group-count';
    groupCount.textContent = String(groupValues.length);
    groupHeader.appendChild(groupCount);

    groupSection.appendChild(groupHeader);

    const groupOptions = document.createElement('div');
    groupOptions.className = 'group-options collapsed';
    const groupItems = [];

    groupValues.forEach(val => {
      const optionItem = createOptionItem(val, groupName, true);
      groupOptions.appendChild(optionItem);
      groupItems.push(optionItem);
    });

    groupSection.appendChild(groupOptions);
    optionsContainer.appendChild(groupSection);
    groupElements.push({ section: groupSection, header: groupHeader, options: groupOptions, items: groupItems });

    groupHeader.addEventListener('click', e => {
      if (e.target.type === 'checkbox') return;
      setGroupExpanded({ header: groupHeader, options: groupOptions }, groupOptions.classList.contains('collapsed'));
    });
  });

  ungroupedValues.forEach(val => {
    const optionItem = createOptionItem(val);
    optionItem.classList.add('ungrouped-option');
    optionsContainer.appendChild(optionItem);
  });

  searchInput.addEventListener('input', e => {
    applySearch(e.target.value.toLowerCase().trim());
  });

  container.getSelectedValues = function() {
    const selected = [];
    this.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked').forEach(input => {
      if (input.dataset.value && !input.classList.contains('group-checkbox')) {
        selected.push(input.dataset.value);
      }
    });
    return selected;
  };

  container.getSelectedDisplayValues = function() {
    const selected = [];
    this.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked').forEach(input => {
      if (input.dataset.display && !input.classList.contains('group-checkbox')) {
        selected.push(input.dataset.display);
      }
    });
    return selected;
  };

  container.setSelectedValues = function(valuesToSet) {
    const valueSet = new Set(valuesToSet);
    this.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
      if (input.dataset.value) {
        input.checked = valueSet.has(input.dataset.value);
        syncOptionItemState(input.closest('.option-item'), input);
      }
    });

    if (isMultiSelect) {
      groupedData.forEach((_, groupName) => {
        syncGroupCheckboxState(this, groupName);
      });
    }
  };

  return container;
};

window.parseListInputValues = function(rawValue) {
  return String(rawValue || '')
    .split(/[\r\n,]+/)
    .map(value => value.trim())
    .filter(Boolean);
};

window.createPopupListControl = function(innerControl, label, placeholder) {
  const resolvedLabel = label || 'Select values';
  const resolvedPlaceholder = placeholder || 'Click to select...';

  const wrapper = document.createElement('div');
  wrapper.className = 'form-mode-popup-list-control';

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

  const popup = document.createElement('div');
  popup.className = 'form-mode-popup-list-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', resolvedLabel);
  popup.hidden = true;

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
    const escFn = window.escapeHtml || function(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    if (!displayValues || displayValues.length === 0) {
      summarySpan.textContent = resolvedPlaceholder;
      summarySpan.classList.add('is-placeholder');
    } else if (displayValues.length <= 2) {
      summarySpan.textContent = displayValues.join(', ');
      summarySpan.classList.remove('is-placeholder');
    } else {
      summarySpan.innerHTML = escFn(displayValues[0]) + ' <span class="form-mode-popup-more">and ' + (displayValues.length - 1) + ' more</span>';
      summarySpan.classList.remove('is-placeholder');
    }

    trigger.setAttribute('aria-expanded', popup.hidden ? 'false' : 'true');
  }

  function openPopup() {
    backdrop.hidden = false;
    popup.hidden = false;
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
    backdrop.hidden = true;
    popup.hidden = true;
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
};

window.createListPasteInput = function(currentValues = [], options = {}) {
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
    const values = window.parseListInputValues(textArea.value);
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
    return window.parseListInputValues(textArea.value);
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
};

window.showError = function(message, inputElements = [], duration = 3000) {
  const errorLabel = window.DOM.filterError;

  inputElements.forEach(inp => {
    if (inp) inp.classList.add('error');
  });

  if (errorLabel) {
    errorLabel.textContent = message;
    errorLabel.style.display = 'block';
  }

  setTimeout(() => {
    if (errorLabel) errorLabel.style.display = 'none';
    inputElements.forEach(inp => {
      if (inp) inp.classList.remove('error');
    });
  }, duration);

  return false;
};

window.formatDuration = function(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  const remainingSeconds = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hr${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds} sec`);

  return parts.join(' ');
};