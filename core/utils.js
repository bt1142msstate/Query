/**
 * Shared Utility Functions
 * Common utilities used across multiple modules to eliminate code duplication.
 * @module Utils
 */

/**
 * DOM Ready Utility - Executes callback when DOM is ready
 * Eliminates duplicate DOM ready checking patterns across files.
 * @function onDOMReady
 * @param {Function} callback - Function to execute when DOM is ready
 */
window.onDOMReady = function(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
};

/**
 * Text Measurement Utility - Measures text width using canvas
 * Shared canvas instance to avoid creating multiple canvas elements.
 * @namespace TextMeasurement
 */
window.TextMeasurement = {
  canvas: document.createElement('canvas'),
  
  get ctx() {
    return this.canvas.getContext('2d');
  },
  
  /**
   * Measures the width of text with specified font.
   * @param {string} text - Text to measure
   * @param {string} [font] - CSS font specification
   * @returns {number} Text width in pixels
   */
  measureText(text, font = '14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto') {
    this.ctx.font = font;
    return this.ctx.measureText(text).width;
  },
  
  /**
   * Finds maximum characters that fit within specified width.
   * Uses binary search for efficient calculation.
   * @param {string} text - Original text
   * @param {number} maxWidth - Maximum width in pixels
   * @param {string} [font] - CSS font specification
   * @returns {number} Maximum character count that fits
   */
  findMaxFittingChars(text, maxWidth, font) {
    this.ctx.font = font || '14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    
    let left = 0;
    let right = text.length;
    let maxFitChars = 0;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const testText = text.substring(0, mid) + '...';
      const testWidth = this.ctx.measureText(testText).width;
      
      if (testWidth <= maxWidth) {
        maxFitChars = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    
    return maxFitChars;
  }
};

/**
 * Event Handler Utilities - Bulk event listener attachment
 * @namespace EventUtils
 */
window.EventUtils = {
  /**
   * Attaches click event listeners to multiple elements by ID.
   * @param {Object} elementIdToHandlerMap - Map of element IDs to click handlers
   */
  attachBulkClickListeners(elementIdToHandlerMap) {
    Object.entries(elementIdToHandlerMap).forEach(([id, handler]) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('click', handler);
      }
    });
  },
  
  /**
   * Attaches multiple event types to multiple elements.
   * @param {HTMLElement[]} elements - Array of elements
   * @param {Object} eventMap - Map of event types to handlers
   */
  attachMultipleEvents(elements, eventMap) {
    elements.forEach(el => {
      if (!el) return;
      Object.entries(eventMap).forEach(([event, handler]) => {
        el.addEventListener(event, handler);
      });
    });
  }
};

window.OperatorLabels = (() => {
  const LABELS = Object.freeze({
    contains: 'Contains',
    starts: 'Starts with',
    starts_with: 'Starts with',
    equals: 'Equals',
    does_not_equal: 'Does not equal',
    greater: 'Greater than',
    greater_or_equal: 'Greater than or equal',
    less: 'Less than',
    less_or_equal: 'Less than or equal',
    between: 'Between',
    before: 'Before',
    after: 'After',
    doesnotcontain: 'Does not contain',
    does_not_contain: 'Does not contain',
    on_or_after: 'On or after',
    on_or_before: 'On or before',
    show: 'Show',
    hide: 'Hide'
  });

  function get(operator, fallback = 'Equals') {
    const normalized = String(operator || '').trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }

    if (LABELS[normalized]) {
      return LABELS[normalized];
    }

    return normalized
      .replace(/_/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  return {
    get
  };
})();

window.OperatorSelectUtils = (() => {
  function createSelect(operators, options = {}) {
    const {
      selected = '',
      className = '',
      id = '',
      ariaLabel = 'Select operator',
      onChange = null
    } = options;

    const select = document.createElement('select');
    if (id) {
      select.id = id;
    }
    if (className) {
      select.className = className;
    }
    if (ariaLabel) {
      select.setAttribute('aria-label', ariaLabel);
    }

    (Array.isArray(operators) ? operators : []).forEach(operator => {
      const option = document.createElement('option');
      option.value = operator;
      option.textContent = window.OperatorLabels.get(operator);
      if (operator === selected) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    if (typeof onChange === 'function') {
      select.addEventListener('change', event => {
        onChange(event, select);
      });
    }

    return select;
  }

  function createLabeledPicker(operators, options = {}) {
    const {
      label = 'Condition',
      wrapperClassName = 'condition-operator-picker',
      labelClassName = 'condition-operator-label',
      ...selectOptions
    } = options;

    const wrapper = document.createElement('label');
    if (wrapperClassName) {
      wrapper.className = wrapperClassName;
    }

    const labelEl = document.createElement('span');
    if (labelClassName) {
      labelEl.className = labelClassName;
    }
    labelEl.textContent = label;

    wrapper.appendChild(labelEl);
    wrapper.appendChild(createSelect(operators, selectOptions));
    return wrapper;
  }

  return {
    createSelect,
    createLabeledPicker
  };
})();

window.ClipboardUtils = (() => {
  async function copyWithFallback(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }

    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();
    document.execCommand('copy');
    scratch.remove();
  }

  async function resolveCopyText(source) {
    if (typeof source === 'function') {
      return source();
    }

    return source;
  }

  async function copy(text, options = {}) {
    const {
      successMessage = '',
      errorMessage = '',
      showToast = true,
      onSuccess = null,
      onError = null,
      logger = console.error
    } = options;

    const rawText = String(text || '');
    if (!rawText) {
      return false;
    }

    try {
      await copyWithFallback(rawText);
      if (showToast && successMessage && typeof window.showToastMessage === 'function') {
        window.showToastMessage(successMessage, 'success');
      }
      if (typeof onSuccess === 'function') {
        onSuccess();
      }
      return true;
    } catch (error) {
      if (showToast && errorMessage && typeof window.showToastMessage === 'function') {
        window.showToastMessage(errorMessage, 'error');
      }
      if (typeof onError === 'function') {
        onError(error);
      } else if (typeof logger === 'function') {
        logger('Clipboard copy failed:', error);
      }
      return false;
    }
  }

  async function copyFromSource(source, options = {}) {
    const {
      emptyMessage = '',
      emptyMessageType = 'warning'
    } = options;

    const resolvedText = await resolveCopyText(source);
    const rawText = String(resolvedText || '');

    if (!rawText) {
      if (emptyMessage && typeof window.showToastMessage === 'function') {
        window.showToastMessage(emptyMessage, emptyMessageType);
      }
      return false;
    }

    return copy(rawText, options);
  }

  function bindCopyButton(button, source, options = {}) {
    if (!(button instanceof HTMLElement)) {
      return () => {};
    }

    const handler = async event => {
      if (event) {
        event.preventDefault();
      }
      await copyFromSource(source, options);
    };

    button.addEventListener('click', handler);
    return () => button.removeEventListener('click', handler);
  }

  return {
    copy,
    copyWithFallback,
    copyFromSource,
    bindCopyButton
  };
})();

window.QueryStateSubscriptions = (() => {
  function subscribe(handler, options = {}) {
    if (!window.QueryChangeManager || typeof window.QueryChangeManager.subscribe !== 'function' || typeof handler !== 'function') {
      return () => {};
    }

    const {
      displayedFields = false,
      activeFilters = false,
      predicate = null
    } = options;

    const requireSpecificChanges = displayedFields || activeFilters;

    return window.QueryChangeManager.subscribe(event => {
      if (!event) {
        return;
      }

      if (requireSpecificChanges) {
        const matchesDisplayedFields = displayedFields && Boolean(event.changes?.displayedFields);
        const matchesActiveFilters = activeFilters && Boolean(event.changes?.activeFilters);
        if (!matchesDisplayedFields && !matchesActiveFilters) {
          return;
        }
      }

      if (typeof predicate === 'function' && !predicate(event)) {
        return;
      }

      handler(event);
    });
  }

  return {
    subscribe
  };
})();

window.VisibilityUtils = (() => {
  function normalizeTargets(targets) {
    if (!Array.isArray(targets)) {
      return [];
    }

    return targets.filter(Boolean);
  }

  function show(targets, options = {}) {
    const {
      bodyClass = '',
      ariaHidden = null
    } = options;

    normalizeTargets(targets).forEach(target => {
      target.classList.remove('hidden');
      if (ariaHidden !== null) {
        target.setAttribute('aria-hidden', String(ariaHidden));
      }
    });

    if (bodyClass) {
      document.body.classList.add(bodyClass);
    }
  }

  function hide(targets, options = {}) {
    const {
      bodyClass = '',
      ariaHidden = null
    } = options;

    normalizeTargets(targets).forEach(target => {
      target.classList.add('hidden');
      if (ariaHidden !== null) {
        target.setAttribute('aria-hidden', String(ariaHidden));
      }
    });

    if (bodyClass) {
      document.body.classList.remove(bodyClass);
    }
  }

  function isVisible(target) {
    return !!(target && !target.classList.contains('hidden'));
  }

  return {
    show,
    hide,
    isVisible
  };
})();

window.ValueFormatting = (() => {
  function getFieldDefinition(fieldName) {
    if (!window.fieldDefs) {
      return null;
    }

    const normalizedField = String(fieldName || '').trim();
    if (!normalizedField) {
      return null;
    }

    let fieldDef = window.fieldDefs.get(normalizedField);
    if (fieldDef) {
      return fieldDef;
    }

    const baseField = typeof window.getBaseFieldName === 'function'
      ? window.getBaseFieldName(normalizedField)
      : normalizedField.replace(/ \d+$/, '');

    fieldDef = window.fieldDefs.get(baseField);
    return fieldDef || null;
  }

  function getFieldType(fieldName, options = {}) {
    const { inferMoneyFromName = false } = options;
    const fieldDef = getFieldDefinition(fieldName);
    if (fieldDef?.type) {
      return fieldDef.type;
    }

    if (inferMoneyFromName) {
      const lower = String(fieldName || '').toLowerCase();
      if (lower.includes('price') || lower.includes('cost') || lower.includes('amount')) {
        return 'money';
      }
    }

    return 'string';
  }

  function formatDateDisplay(rawValue, options = {}) {
    const {
      invalidValue = 'Never',
      fallbackToRaw = false
    } = options;

    const textValue = String(rawValue || '').trim();
    const numericValue = typeof rawValue === 'string' ? Number.parseInt(rawValue, 10) : rawValue;
    const compactMatch = textValue.match(/^(\d{4})(\d{2})(\d{2})$/);

    if (!numericValue || Number.isNaN(numericValue)) {
      if (compactMatch) {
        return `${compactMatch[2]}/${compactMatch[3]}/${compactMatch[1]}`;
      }
      return fallbackToRaw ? textValue : invalidValue;
    }

    const year = Math.floor(numericValue / 10000);
    const month = Math.floor((numericValue % 10000) / 100) - 1;
    const day = numericValue % 100;
    const date = new Date(year, month, day);
    if (Number.isNaN(date.getTime())) {
      return fallbackToRaw ? textValue : invalidValue;
    }

    return `${(month + 1).toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
  }

  function parseStandardNumber(rawValue) {
    if (typeof rawValue === 'number') {
      return rawValue;
    }

    return Number.parseFloat(String(rawValue || '').replace(/,/g, ''));
  }

  function formatNumberDisplay(rawValue) {
    const numericValue = parseStandardNumber(rawValue);
    if (Number.isNaN(numericValue)) {
      return '';
    }

    return Number.isInteger(numericValue)
      ? String(numericValue)
      : numericValue.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
  }

  function formatDelimitedValue(rawValue, joiner = ' | ') {
    if (typeof rawValue !== 'string' || !rawValue.includes('\x1F')) {
      return String(rawValue ?? '');
    }

    return rawValue
      .split('\x1F')
      .map(value => value.trim())
      .filter(Boolean)
      .join(joiner);
  }

  function formatValueByType(rawValue, type, options = {}) {
    const normalizedType = String(type || 'string').toLowerCase();
    const {
      invalidDateValue = 'Never',
      dateFallbackToRaw = false,
      delimitedJoiner = ' | '
    } = options;

    if (rawValue === undefined || rawValue === null) {
      return '';
    }

    if (normalizedType === 'date') {
      return formatDateDisplay(rawValue, {
        invalidValue: invalidDateValue,
        fallbackToRaw: dateFallbackToRaw
      });
    }

    if (normalizedType === 'money') {
      const displayValue = window.MoneyUtils.formatDisplayValue(rawValue);
      return displayValue || String(rawValue);
    }

    if (normalizedType === 'number') {
      return formatNumberDisplay(rawValue);
    }

    return formatDelimitedValue(rawValue, delimitedJoiner);
  }

  return {
    getFieldDefinition,
    getFieldType,
    formatDateDisplay,
    formatNumberDisplay,
    formatDelimitedValue,
    formatValueByType
  };
})();

window.MoneyUtils = (() => {
  function sanitizeInputValue(rawValue) {
    const text = String(rawValue || '');
    const isNegative = text.trim().startsWith('-');
    const numeric = text.replace(/[^0-9.]/g, '');
    const firstDot = numeric.indexOf('.');
    const whole = firstDot >= 0 ? numeric.slice(0, firstDot) : numeric;
    const decimals = firstDot >= 0 ? numeric.slice(firstDot + 1).replace(/\./g, '').slice(0, 2) : '';
    const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
    const hasDot = firstDot >= 0;

    if (!normalizedWhole && !decimals && !hasDot) {
      return '';
    }

    const prefix = isNegative ? '-' : '';
    return hasDot
      ? `${prefix}${normalizedWhole || '0'}.${decimals}`
      : `${prefix}${normalizedWhole || '0'}`;
  }

  function formatInputValue(rawValue) {
    const text = String(rawValue || '');
    const sanitized = sanitizeInputValue(text);
    const hadDot = text.includes('.');

    if (!sanitized) {
      return '';
    }

    const isNegative = sanitized.startsWith('-');
    const unsignedValue = isNegative ? sanitized.slice(1) : sanitized;
    const parts = unsignedValue.split('.');
    const whole = parts[0] || '0';
    const decimals = parts[1] || '';
    const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const prefix = isNegative ? '-' : '';

    return hadDot
      ? `${prefix}${groupedWhole}.${decimals}`
      : `${prefix}${groupedWhole}`;
  }

  function parseNumber(rawValue) {
    if (typeof rawValue === 'number') {
      return rawValue;
    }

    const sanitized = sanitizeInputValue(rawValue);
    if (!sanitized) {
      return Number.NaN;
    }

    return Number.parseFloat(sanitized);
  }

  function formatDisplayValue(rawValue, options = {}) {
    const {
      currencySymbol = '$',
      minimumFractionDigits = 2,
      maximumFractionDigits = 2
    } = options;

    const numericValue = parseNumber(rawValue);
    if (Number.isNaN(numericValue)) {
      return '';
    }

    const absoluteDisplay = Math.abs(numericValue).toLocaleString('en-US', {
      minimumFractionDigits,
      maximumFractionDigits
    });
    const sign = numericValue < 0 ? '-' : '';
    return `${sign}${currencySymbol}${absoluteDisplay}`;
  }

  const AUTO_NUMERIC_OPTIONS = Object.freeze({
    currencySymbol: '',
    digitGroupSeparator: ',',
    digitalGroupSpacing: '3',
    decimalCharacter: '.',
    decimalCharacterAlternative: '.',
    decimalPlaces: 2,
    decimalPlacesRawValue: 2,
    allowDecimalPadding: 'floats',
    emptyInputBehavior: 'focus',
    leadingZero: 'deny',
    modifyValueOnWheel: false,
    modifyValueOnUpDownArrow: false,
    selectNumberOnly: true,
    showOnlyNumbersOnFocus: false,
    showWarnings: false,
    formatOnPageLoad: true
  });

  function destroyInputBehavior(input) {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    if (input._moneyAutoNumeric) {
      const rawValue = sanitizeInputValue(input._moneyAutoNumeric.getNumericString());
      input._moneyAutoNumeric.remove();
      delete input._moneyAutoNumeric;
      input.value = rawValue;
      if (rawValue) {
        input.dataset.moneyRaw = rawValue;
      } else {
        delete input.dataset.moneyRaw;
      }
    }

    if (input._moneyAutoNumericSync) {
      input.removeEventListener('autoNumeric:rawValueModified', input._moneyAutoNumericSync);
      delete input._moneyAutoNumericSync;
    }
  }

  function configureInputBehavior(input, isMoney) {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    input.classList.toggle('money-input-symbolized', Boolean(isMoney));

    destroyInputBehavior(input);

    if (!isMoney) {
      delete input.dataset.moneyRaw;
      return;
    }

    if (!window.AutoNumeric) {
      const rawValue = sanitizeInputValue(input.value);
      input.value = formatInputValue(rawValue);
      if (rawValue) {
        input.dataset.moneyRaw = rawValue;
      } else {
        delete input.dataset.moneyRaw;
      }
      return;
    }

    const initialRawValue = sanitizeInputValue(input.value);
    input.type = 'text';
    input.inputMode = 'decimal';
    input._moneyAutoNumeric = new window.AutoNumeric(input, initialRawValue || '', AUTO_NUMERIC_OPTIONS);
    input._moneyAutoNumericSync = () => {
      const rawValue = sanitizeInputValue(input._moneyAutoNumeric.getNumericString());
      if (rawValue) {
        input.dataset.moneyRaw = rawValue;
      } else {
        delete input.dataset.moneyRaw;
      }
    };
    input.addEventListener('autoNumeric:rawValueModified', input._moneyAutoNumericSync);
    input._moneyAutoNumericSync();
  }

  return {
    sanitizeInputValue,
    formatInputValue,
    parseNumber,
    formatDisplayValue,
    configureInputBehavior
  };
})();

window.getFieldOutputSegments = function(fieldName) {
  if (!window.fieldDefs) {
    return 1;
  }

  let fieldDef = window.fieldDefs.get(fieldName);
  if (!fieldDef && typeof fieldName === 'string') {
    const baseName = fieldName.replace(/ \d+$/, '');
    if (baseName !== fieldName) {
      fieldDef = window.fieldDefs.get(baseName);
    }
  }

  const parsed = Number.parseInt(fieldDef && fieldDef.parts, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

window.parsePipeDelimitedRow = function(line, columns) {
  const values = String(line || '').split('|');
  const row = {};
  let valueIndex = 0;

  columns.forEach(column => {
    const segmentCount = window.getFieldOutputSegments(column);
    row[column] = valueIndex < values.length
      ? values.slice(valueIndex, valueIndex + segmentCount).join('|')
      : '';
    valueIndex += segmentCount;
  });

  return row;
};

/**
 * Table Builder Utilities - Common table creation patterns
 * @namespace TableBuilder
 */
window.TableBuilder = {
  /**
   * Creates a table element with standard styling.
   * @param {string} [className] - CSS class for the table
   * @returns {HTMLTableElement} Table element
   */
  createTable(className = 'min-w-full divide-y divide-gray-200') {
    const table = document.createElement('table');
    table.className = className;
    return table;
  },
  
  /**
   * Creates a table header cell with standard styling.
   * @param {string} text - Header text
   * @param {string} [className] - CSS class for the header
   * @returns {HTMLTableHeaderCellElement} Header cell element
   */
  createHeader(text, className = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider') {
    const th = document.createElement('th');
    th.className = className;
    th.textContent = text;
    return th;
  },
  
  /**
   * Creates a table data cell with standard styling.
   * @param {string|HTMLElement} content - Cell content
   * @param {string} [className] - CSS class for the cell
   * @returns {HTMLTableDataCellElement} Data cell element
   */
  createCell(content, className = 'px-6 py-3 whitespace-nowrap text-sm text-gray-900') {
    const td = document.createElement('td');
    td.className = className;
    if (typeof content === 'string') {
      td.textContent = content;
    } else if (content instanceof HTMLElement) {
      td.appendChild(content);
    }
    return td;
  },
  
  /**
   * Creates a table row with hover effects.
   * @param {string} [className] - Additional CSS classes
   * @returns {HTMLTableRowElement} Row element
   */
  createRow(className = 'hover:bg-gray-50') {
    const tr = document.createElement('tr');
    tr.className = className;
    return tr;
  }
};