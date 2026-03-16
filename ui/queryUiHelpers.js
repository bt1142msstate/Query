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
  container.id = 'condition-select-container';

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
  const container = document.createElement('div');
  container.className = 'grouped-selector';
  container.id = 'condition-select-container';

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
  const flatOptionItems = [];

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

  function createOptionItem(val, groupName = '', insideGroup = false) {
    const optionItem = document.createElement('div');
    optionItem.className = 'option-item';
    if (insideGroup) optionItem.dataset.group = groupName;
    optionItem.dataset.value = val.literal;
    optionItem.dataset.display = val.display;

    const input = document.createElement('input');
    input.type = isMultiSelect ? 'checkbox' : 'radio';
    input.name = 'condition-value';
    input.dataset.value = val.literal;
    input.dataset.display = val.display;
    input.checked = currentValues.includes(val.literal);

    if (isMultiSelect && groupName) {
      input.addEventListener('change', () => {
        const groupOptions = optionItem.parentElement.querySelectorAll('input[type="checkbox"]:not(.group-checkbox)');
        const groupCheckbox = optionItem.closest('.group-section')?.querySelector(`.group-checkbox[data-group="${groupName}"]`);
        if (groupCheckbox) {
          groupCheckbox.checked = Array.from(groupOptions).every(opt => opt.checked);
        }
      });
    }

    const label = document.createElement('label');
    label.textContent = insideGroup
      ? val.display.replace(new RegExp(`^${groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`), '')
      : val.display;

    optionItem.appendChild(input);
    optionItem.appendChild(label);
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
      });

      groupHeader.appendChild(groupCheckbox);
    }

    const groupLabel = document.createElement('span');
    groupLabel.className = 'group-label';
    groupLabel.textContent = `${groupName} (${groupValues.length})`;
    groupHeader.appendChild(groupLabel);

    groupSection.appendChild(groupHeader);

    const groupOptions = document.createElement('div');
    groupOptions.className = 'group-options collapsed';

    groupValues.forEach(val => {
      const optionItem = createOptionItem(val, groupName, true);
      groupOptions.appendChild(optionItem);
      flatOptionItems.push(optionItem);
    });

    groupSection.appendChild(groupOptions);
    optionsContainer.appendChild(groupSection);
    groupElements.push({ section: groupSection, header: groupHeader, options: groupOptions, values: groupValues });

    groupHeader.addEventListener('click', e => {
      if (e.target.type === 'checkbox') return;
      groupOptions.classList.toggle('collapsed');
      toggleIcon.innerHTML = groupOptions.classList.contains('collapsed') ? '&#9656;' : '&#9662;';
    });
  });

  ungroupedValues.forEach(val => {
    const optionItem = createOptionItem(val);
    optionItem.classList.add('ungrouped-option');
    optionsContainer.appendChild(optionItem);
    flatOptionItems.push(optionItem);
  });

  searchInput.addEventListener('input', e => {
    const searchTerm = e.target.value.toLowerCase().trim();

    if (searchTerm === '') {
      groupElements.forEach(group => {
        group.section.style.display = '';
        group.options.classList.add('collapsed');
        group.header.querySelector('.toggle-icon').innerHTML = '&#9656;';

        Array.from(group.options.querySelectorAll('.option-item')).forEach(item => {
          item.style.display = '';
          const label = item.querySelector('label');
          label.innerHTML = label.textContent;
        });
      });

      flatOptionItems.forEach(item => {
        item.style.display = '';
        const label = item.querySelector('label');
        label.innerHTML = label.textContent;
      });
    } else {
      groupElements.forEach(group => {
        let hasMatch = false;

        Array.from(group.options.querySelectorAll('.option-item')).forEach(item => {
          const value = item.dataset.value.toLowerCase();
          const display = item.dataset.display.toLowerCase();
          const label = item.querySelector('label');
          const displayText = label.textContent.toLowerCase();

          if (value.includes(searchTerm) || display.includes(searchTerm) || displayText.includes(searchTerm)) {
            item.style.display = '';
            hasMatch = true;
            const originalText = label.textContent;
            const regex = new RegExp(`(${searchTerm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
            label.innerHTML = originalText.replace(regex, '<span class="highlight">$1</span>');
          } else {
            item.style.display = 'none';
          }
        });

        group.section.style.display = hasMatch ? '' : 'none';
        if (hasMatch) {
          group.options.classList.remove('collapsed');
          group.header.querySelector('.toggle-icon').innerHTML = '&#9662;';
        }
      });

      flatOptionItems.forEach(item => {
        const value = item.dataset.value.toLowerCase();
        const display = item.dataset.display.toLowerCase();
        const label = item.querySelector('label');
        const displayText = label.textContent.toLowerCase();

        if (value.includes(searchTerm) || display.includes(searchTerm) || displayText.includes(searchTerm)) {
          item.style.display = '';
          const originalText = label.textContent;
          const regex = new RegExp(`(${searchTerm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
          label.innerHTML = originalText.replace(regex, '<span class="highlight">$1</span>');
        } else {
          item.style.display = 'none';
        }
      });
    }
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
      }
    });

    if (isMultiSelect) {
      groupedData.forEach((_, groupName) => {
        const groupOptions = this.querySelectorAll(`.option-item[data-group="${groupName}"] input`);
        const allChecked = Array.from(groupOptions).every(opt => opt.checked);
        const groupCheckbox = this.querySelector(`.group-checkbox[data-group="${groupName}"]`);
        if (groupCheckbox) {
          groupCheckbox.checked = allChecked && groupOptions.length > 0;
        }
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

window.buildInlineListSummary = function(values) {
  const normalizedValues = Array.isArray(values)
    ? values.map(value => String(value || '').trim()).filter(Boolean)
    : [];

  if (normalizedValues.length === 0) return 'No values loaded';
  if (normalizedValues.length === 1) return normalizedValues[0];
  return `${normalizedValues[0]}, and ${normalizedValues.length - 1} more`;
};

window.ensureListPasteEditor = function() {
  let backdrop = document.getElementById('list-paste-editor-backdrop');
  let panel = document.getElementById('list-paste-editor');

  if (backdrop && panel) {
    return { backdrop, panel };
  }

  backdrop = document.createElement('div');
  backdrop.id = 'list-paste-editor-backdrop';
  backdrop.className = 'list-paste-editor-backdrop hidden';

  panel = document.createElement('div');
  panel.id = 'list-paste-editor';
  panel.className = 'list-paste-editor hidden';
  panel.innerHTML = `
    <div class="list-paste-editor-header">
      <div>
        <div id="list-paste-editor-title" class="list-paste-editor-title">Edit list values</div>
        <div id="list-paste-editor-meta" class="list-paste-editor-meta"></div>
      </div>
      <div class="list-paste-editor-actions">
        <button type="button" id="list-paste-editor-upload" class="list-paste-editor-icon-btn" aria-label="Upload list file" data-tooltip="Upload text or CSV file">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 16V4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 9l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <button type="button" id="list-paste-editor-clear" class="list-paste-editor-icon-btn" aria-label="Clear list values" data-tooltip="Clear all values">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <button type="button" id="list-paste-editor-close" class="list-paste-editor-close" aria-label="Close list editor">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
    <div class="list-paste-editor-body">
      <p id="list-paste-editor-hint" class="list-paste-editor-hint"></p>
      <textarea id="list-paste-editor-textarea" class="list-paste-textarea list-paste-editor-textarea" rows="8"></textarea>
      <div id="list-paste-editor-status" class="list-paste-status"></div>
    </div>
    <div class="list-paste-editor-footer">
      <button type="button" id="list-paste-editor-cancel" class="list-paste-editor-btn list-paste-editor-btn-secondary">Cancel</button>
      <button type="button" id="list-paste-editor-save" class="list-paste-editor-btn">Save</button>
    </div>
  `;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.txt,.csv,text/plain,text/csv';
  fileInput.className = 'list-paste-file-input';
  panel.appendChild(fileInput);

  panel._editorState = {
    control: null,
    textarea: panel.querySelector('#list-paste-editor-textarea'),
    titleEl: panel.querySelector('#list-paste-editor-title'),
    metaEl: panel.querySelector('#list-paste-editor-meta'),
    hintEl: panel.querySelector('#list-paste-editor-hint'),
    statusEl: panel.querySelector('#list-paste-editor-status'),
    fileInput,
    close() {
      backdrop.classList.add('hidden');
      panel.classList.add('hidden');
      panel._editorState.control = null;
      fileInput.value = '';
    },
    updateStatus() {
      const values = window.parseListInputValues(panel._editorState.textarea.value);
      panel._editorState.metaEl.textContent = values.length === 0
        ? 'No values loaded'
        : `${values.length} value${values.length === 1 ? '' : 's'} loaded`;
      panel._editorState.statusEl.textContent = values.length === 0
        ? 'Paste one value per line, comma-separated values, or upload a file.'
        : window.buildInlineListSummary(values);
    },
    open(control) {
      panel._editorState.control = control;
      const controlOptions = control && control._listPasteOptions ? control._listPasteOptions : {};
      panel._editorState.titleEl.textContent = controlOptions.title || 'Edit list values';
      panel._editorState.hintEl.textContent = controlOptions.hint || 'Paste one value per line, comma-separated values, or upload a .txt/.csv file.';
      panel._editorState.textarea.placeholder = controlOptions.placeholder || 'Paste one value per line';
      panel._editorState.textarea.rows = controlOptions.rows || 8;
      panel._editorState.textarea.value = control && typeof control._listRawValue === 'string'
        ? control._listRawValue
        : ((control && Array.isArray(control._listValues)) ? control._listValues.join('\n') : '');
      panel._editorState.updateStatus();
      backdrop.classList.remove('hidden');
      panel.classList.remove('hidden');
      window.requestAnimationFrame(() => panel._editorState.textarea.focus());
    },
    commit(rawText) {
      const nextRawText = String(rawText || '');
      const nextValues = window.parseListInputValues(nextRawText);
      const activeControl = panel._editorState.control;
      if (!activeControl) return;
      activeControl._listRawValue = nextRawText;
      activeControl._listValues = nextValues;
      if (typeof activeControl._refreshListSummary === 'function') {
        activeControl._refreshListSummary();
      }
      if (activeControl._listPasteOptions && typeof activeControl._listPasteOptions.onChange === 'function') {
        activeControl._listPasteOptions.onChange();
      }
    }
  };

  const loadFileIntoEditor = file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      panel._editorState.textarea.value = String(reader.result || '');
      panel._editorState.updateStatus();
    };
    reader.readAsText(file);
  };

  backdrop.addEventListener('click', () => panel._editorState.close());
  panel.querySelector('#list-paste-editor-close').addEventListener('click', () => panel._editorState.close());
  panel.querySelector('#list-paste-editor-cancel').addEventListener('click', () => panel._editorState.close());
  panel.querySelector('#list-paste-editor-save').addEventListener('click', () => {
    panel._editorState.commit(panel._editorState.textarea.value);
    panel._editorState.close();
  });
  panel.querySelector('#list-paste-editor-clear').addEventListener('click', () => {
    panel._editorState.textarea.value = '';
    panel._editorState.updateStatus();
  });
  panel.querySelector('#list-paste-editor-upload').addEventListener('click', () => fileInput.click());
  panel._editorState.textarea.addEventListener('input', () => panel._editorState.updateStatus());
  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files || [];
    if (!file) return;
    loadFileIntoEditor(file);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.classList.contains('hidden')) {
      panel._editorState.close();
    }
  });

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  return { backdrop, panel };
};

window.createListPasteInput = function(currentValues = [], options = {}) {
  const container = document.createElement('div');
  container.className = 'list-paste-input';
  container.id = 'condition-select-container';

  const summary = document.createElement('button');
  summary.type = 'button';
  summary.className = 'list-paste-summary';

  const summaryBody = document.createElement('div');
  summaryBody.className = 'list-paste-summary-body';

  const summaryLabel = document.createElement('div');
  summaryLabel.className = 'list-paste-summary-label';
  summaryLabel.textContent = options.summaryLabel || 'List values';

  const summaryValue = document.createElement('div');
  summaryValue.className = 'list-paste-summary-value';

  const summaryMeta = document.createElement('div');
  summaryMeta.className = 'list-paste-summary-meta';

  const actions = document.createElement('div');
  actions.className = 'list-paste-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'list-paste-btn';
  editBtn.setAttribute('aria-label', 'Edit list values');
  editBtn.setAttribute('data-tooltip', 'Edit list values');
  editBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M12 20h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span class="sr-only">Edit values</span>';

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

  container._listPasteOptions = options;
  container._listRawValue = '';
  container._listValues = [];

  container._refreshListSummary = function() {
    const values = Array.isArray(container._listValues) ? container._listValues : [];
    summaryValue.textContent = window.buildInlineListSummary(values);
    summaryValue.classList.toggle('is-empty', values.length === 0);
    summaryMeta.textContent = values.length === 0
      ? (options.hint || 'Click to add values')
      : `${values.length} value${values.length === 1 ? '' : 's'} configured`;
    clearBtn.disabled = values.length === 0;
  };

  const commitValues = (rawText, shouldNotify = true) => {
    container._listRawValue = String(rawText || '');
    container._listValues = window.parseListInputValues(container._listRawValue);
    container._refreshListSummary();
    if (shouldNotify && typeof options.onChange === 'function') {
      options.onChange();
    }
  };

  const openEditor = () => {
    const editor = window.ensureListPasteEditor();
    editor.panel._editorState.open(container);
  };

  const loadFile = file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      commitValues(String(reader.result || ''));
      container.classList.remove('drag-over');
    };
    reader.readAsText(file);
  };

  summaryBody.appendChild(summaryLabel);
  summaryBody.appendChild(summaryValue);
  summaryBody.appendChild(summaryMeta);
  summary.appendChild(summaryBody);

  summary.addEventListener('click', openEditor);
  editBtn.addEventListener('click', openEditor);
  clearBtn.addEventListener('click', () => commitValues(''));
  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files || [];
    if (!file) return;
    loadFile(file);
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
  actions.appendChild(editBtn);
      }
  container.appendChild(summary);
  container.appendChild(actions);
    container.classList.remove('drag-over');
    const [file] = event.dataTransfer?.files || [];
    if (file) {
    return Array.isArray(container._listValues) ? container._listValues.slice() : [];
    }
  });

  toolbar.appendChild(hint);
  actions.appendChild(uploadBtn);
  actions.appendChild(clearBtn);
  toolbar.appendChild(actions);
    commitValues(Array.isArray(valuesToSet) ? valuesToSet.join('\n') : '', false);
  container.appendChild(textArea);
  container.appendChild(status);
  container.appendChild(fileInput);
    openEditor();
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