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
window.updateQueryJson = function(){
  const tableNameInput = window.DOM.tableNameInput;
  const queryName = tableNameInput ? tableNameInput.value.trim() : '';
  const payload = window.buildBackendQueryPayload(queryName);
  if (window.DOM.queryBox) {
    window.DOM.queryBox.textContent = JSON.stringify(payload, null, 2);
  }
  if (window.updateButtonStates) window.updateButtonStates();
};

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

window.createBooleanPillSelector = function(values, currentValue = '') {
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
        selectedValue = option.literal;
        render();
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