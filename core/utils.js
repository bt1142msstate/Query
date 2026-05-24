import { DragUtils } from './dragUtils.js';
import { formatDisplayValue } from './dateValues.js';
import { escapeHtml } from './html.js';
import { Icons } from './icons.js';
import { MoneyUtils } from './moneyUtils.js';
import { OperatorLabels } from './operatorLabels.js';
import { fieldDefs } from '../filters/fieldDefs.js';
import { getBaseFieldName } from './queryState.js';

/**
 * Shared Utility Functions
 * Common utilities used across multiple modules to eliminate code duplication.
 * @module Utils
 */

/**
 * Text Measurement Utility - Measures text width using canvas
 * Shared canvas instance to avoid creating multiple canvas elements.
 * @namespace TextMeasurement
 */
const TextMeasurement = {
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
const EventUtils = {
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

const OperatorSelectUtils = (() => {
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
      option.textContent = OperatorLabels.get(operator);
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

const ValueFormatting = (() => {
  function getFieldDefinition(fieldName) {
    if (!fieldDefs) {
      return null;
    }

    const normalizedField = String(fieldName || '').trim();
    if (!normalizedField) {
      return null;
    }

    let fieldDef = fieldDefs.get(normalizedField);
    if (fieldDef) {
      return fieldDef;
    }

    const baseField = getBaseFieldName(normalizedField);
    fieldDef = fieldDefs.get(baseField);
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

  function getNumberFormat(fieldName) {
    const fieldDef = getFieldDefinition(fieldName);
    const explicitFormat = String(fieldDef?.numberFormat || fieldDef?.numericFormat || '').trim().toLowerCase();
    if (explicitFormat) {
      return explicitFormat;
    }

    if (fieldDef?.type === 'money') {
      return 'currency';
    }

    if (fieldDef?.type === 'number') {
      return 'integer';
    }

    return '';
  }

  function formatDateDisplay(rawValue, options = {}) {
    const {
      invalidValue = 'Never',
      fallbackToRaw = false
    } = options;

    return formatDisplayValue(rawValue, {
      invalidValue,
      fallbackToRaw
    });
  }

  function parseStandardNumber(rawValue) {
    if (typeof rawValue === 'number') {
      return rawValue;
    }

    return Number.parseFloat(String(rawValue || '').replace(/,/g, ''));
  }

  function formatNumberDisplay(rawValue, options = {}) {
    const numericValue = parseStandardNumber(rawValue);
    if (Number.isNaN(numericValue)) {
      return '';
    }

    const numberFormat = String(options.numberFormat || '').trim().toLowerCase();

    if (numberFormat === 'year') {
      return numericValue.toLocaleString('en-US', {
        useGrouping: false,
        maximumFractionDigits: 0
      });
    }

    if (numberFormat === 'integer' || (numberFormat !== 'decimal' && Number.isInteger(numericValue))) {
      return numericValue.toLocaleString('en-US', {
        maximumFractionDigits: 0
      });
    }

    return numericValue.toLocaleString('en-US', {
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
      fieldName = '',
      numberFormat = '',
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
      const displayValue = MoneyUtils.formatDisplayValue(rawValue);
      return displayValue || String(rawValue);
    }

    if (normalizedType === 'number') {
      return formatNumberDisplay(rawValue, {
        numberFormat: numberFormat || getNumberFormat(fieldName)
      });
    }

    return formatDelimitedValue(rawValue, delimitedJoiner);
  }

  return {
    getFieldDefinition,
    getFieldType,
    getNumberFormat,
    formatDateDisplay,
    formatNumberDisplay,
    formatDelimitedValue,
    formatValueByType
  };
})();

/**
 * Table Builder Utilities - Common table creation patterns
 * @namespace TableBuilder
 */
const TableBuilder = {
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

const FormatUtils = {
  formatCellDisplay(raw, field) {
    if (raw == null) return '';
    if (typeof raw === 'string' && raw.includes('\x1F')) {
      return raw.split('\x1F').filter(s => s.trim()).join(', ');
    }
    const s = String(raw);
    if (s === '' || s === '\u2014') return s;
    const vf = ValueFormatting;
    if (!vf) return s;
    const type = vf.getFieldType?.(field, { inferMoneyFromName: true });
    if (!type) return s;
    if (type === 'date') return vf.formatValueByType(s, type, { invalidDateValue: 'Never' });
    if (type === 'money') {
      const n = MoneyUtils.parseNumber(s);
      if (!isNaN(n)) return vf.formatValueByType(n, type, { fieldName: field });
    }
    if (type === 'number') {
      const n = parseFloat(s.replace(/,/g, ''));
      if (!isNaN(n)) return vf.formatValueByType(n, type, { fieldName: field });
    }
    return s;
  }
};

export {
  DragUtils,
  EventUtils,
  FormatUtils,
  Icons,
  MoneyUtils,
  OperatorLabels,
  OperatorSelectUtils,
  TableBuilder,
  TextMeasurement,
  ValueFormatting,
  escapeHtml
};
