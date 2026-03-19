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

  function mapFormattedIndexToRawIndex(formattedValue, formattedIndex) {
    let rawIndex = 0;
    for (let i = 0; i < Math.min(formattedIndex, formattedValue.length); i += 1) {
      if (/[0-9.]/.test(formattedValue[i])) {
        rawIndex += 1;
      }
    }
    return rawIndex;
  }

  function mapRawIndexToFormattedIndex(formattedValue, rawIndex) {
    if (!formattedValue) {
      return 0;
    }

    let consumed = 0;
    for (let i = 0; i < formattedValue.length; i += 1) {
      if (/[0-9.]/.test(formattedValue[i])) {
        consumed += 1;
        if (consumed >= rawIndex) {
          return i + 1;
        }
      }
    }

    return formattedValue.length;
  }

  function getInputRawValue(input) {
    return input.dataset.moneyRaw || sanitizeInputValue(input.value);
  }

  function setInputDisplayValue(input, rawValue, caretRawIndex) {
    const formattedValue = formatInputValue(rawValue);
    input.dataset.moneyRaw = rawValue;
    input.value = formattedValue;

    const nextCaretRawIndex = typeof caretRawIndex === 'number' ? caretRawIndex : rawValue.length;
    const nextCaretPosition = mapRawIndexToFormattedIndex(formattedValue, nextCaretRawIndex);
    input.setSelectionRange(nextCaretPosition, nextCaretPosition);
  }

  function normalizeInputSelection(input, options = {}) {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const formattedValue = String(input.value || '');
    let selectionStart = input.selectionStart ?? 0;
    let selectionEnd = input.selectionEnd ?? selectionStart;

    if (options.collapseStaticSelection && selectionStart !== selectionEnd) {
      const selectedText = formattedValue.slice(selectionStart, selectionEnd);
      if (!/[0-9.]/.test(selectedText)) {
        selectionEnd = selectionStart;
      }
    }

    const nextSelectionStart = mapRawIndexToFormattedIndex(
      formattedValue,
      mapFormattedIndexToRawIndex(formattedValue, selectionStart)
    );
    const nextSelectionEnd = mapRawIndexToFormattedIndex(
      formattedValue,
      mapFormattedIndexToRawIndex(formattedValue, selectionEnd)
    );

    if (nextSelectionStart !== (input.selectionStart ?? 0) || nextSelectionEnd !== (input.selectionEnd ?? nextSelectionStart)) {
      input.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    }
  }

  function buildNextRawValue(currentRawValue, selectionStart, selectionEnd, insertedText) {
    const nextRawCandidate = `${currentRawValue.slice(0, selectionStart)}${insertedText}${currentRawValue.slice(selectionEnd)}`;
    return sanitizeInputValue(nextRawCandidate);
  }

  function configureInputBehavior(input, isMoney) {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    if (input._moneyInputHandlers) {
      const { beforeinput, paste, focus, input: inputHandler, mouseup, select, keyup } = input._moneyInputHandlers;
      input.removeEventListener('beforeinput', beforeinput);
      input.removeEventListener('paste', paste);
      input.removeEventListener('focus', focus);
      input.removeEventListener('input', inputHandler);
      input.removeEventListener('mouseup', mouseup);
      input.removeEventListener('select', select);
      input.removeEventListener('keyup', keyup);
      delete input._moneyInputHandlers;
    }

    if (!isMoney) {
      delete input.dataset.moneyRaw;
      return;
    }

    const handleBeforeInput = event => {
      const formattedValue = input.value;
      const rawValue = getInputRawValue(input);
      const selectionStart = mapFormattedIndexToRawIndex(formattedValue, input.selectionStart || 0);
      const selectionEnd = mapFormattedIndexToRawIndex(formattedValue, input.selectionEnd || 0);

      if (event.inputType === 'insertText') {
        const insertedText = String(event.data || '').replace(/[^0-9.]/g, '');
        if (!insertedText) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        const nextRawValue = buildNextRawValue(rawValue, selectionStart, selectionEnd, insertedText);
        const nextCaretRawIndex = Math.min(nextRawValue.length, selectionStart + sanitizeInputValue(insertedText).length);
        setInputDisplayValue(input, nextRawValue, nextCaretRawIndex);
        return;
      }

      if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') {
        event.preventDefault();

        let deleteStart = selectionStart;
        let deleteEnd = selectionEnd;

        if (deleteStart === deleteEnd) {
          if (event.inputType === 'deleteContentBackward' && deleteStart > 0) {
            deleteStart -= 1;
          } else if (event.inputType === 'deleteContentForward' && deleteEnd < rawValue.length) {
            deleteEnd += 1;
          }
        }

        const nextRawValue = buildNextRawValue(rawValue, deleteStart, deleteEnd, '');
        setInputDisplayValue(input, nextRawValue, deleteStart);
      }
    };

    const handlePaste = event => {
      event.preventDefault();
      const pastedText = event.clipboardData ? event.clipboardData.getData('text') : '';
      const formattedValue = input.value;
      const rawValue = getInputRawValue(input);
      const selectionStart = mapFormattedIndexToRawIndex(formattedValue, input.selectionStart || 0);
      const selectionEnd = mapFormattedIndexToRawIndex(formattedValue, input.selectionEnd || 0);
      const insertedText = String(pastedText || '').replace(/[^0-9.]/g, '');
      const nextRawValue = buildNextRawValue(rawValue, selectionStart, selectionEnd, insertedText);
      const nextCaretRawIndex = Math.min(nextRawValue.length, selectionStart + sanitizeInputValue(insertedText).length);
      setInputDisplayValue(input, nextRawValue, nextCaretRawIndex);
    };

    const handleFocus = () => {
      const rawValue = getInputRawValue(input);
      setInputDisplayValue(input, rawValue, rawValue.length);
    };

    const handleInput = () => {
      const rawValue = sanitizeInputValue(input.value);
      setInputDisplayValue(input, rawValue, rawValue.length);
    };

    const handleMouseUp = () => {
      window.requestAnimationFrame(() => {
        normalizeInputSelection(input, { collapseStaticSelection: true });
      });
    };

    const handleSelect = () => {
      normalizeInputSelection(input, { collapseStaticSelection: true });
    };

    const handleKeyUp = event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
        normalizeInputSelection(input, { collapseStaticSelection: true });
      }
    };

    input.addEventListener('beforeinput', handleBeforeInput);
    input.addEventListener('paste', handlePaste);
    input.addEventListener('focus', handleFocus);
    input.addEventListener('input', handleInput);
    input.addEventListener('mouseup', handleMouseUp);
    input.addEventListener('select', handleSelect);
    input.addEventListener('keyup', handleKeyUp);
    input._moneyInputHandlers = {
      beforeinput: handleBeforeInput,
      paste: handlePaste,
      focus: handleFocus,
      input: handleInput,
      mouseup: handleMouseUp,
      select: handleSelect,
      keyup: handleKeyUp
    };

    const initialRawValue = sanitizeInputValue(input.value);
    setInputDisplayValue(input, initialRawValue, initialRawValue.length);
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