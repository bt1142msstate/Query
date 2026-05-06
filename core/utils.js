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

window.BackendApi = (() => {
  const API_URL = 'https://mlp.sirsi.net/uhtbin/query_api.pl';
  let lastRateLimitNoticeUntil = 0;

  function getRetryAfterSeconds(payload) {
    const rawValue = payload?.retry_after_seconds ?? payload?.retry_after ?? 0;
    const numericValue = Number(rawValue);
    return Number.isFinite(numericValue) && numericValue > 0 ? Math.ceil(numericValue) : 0;
  }

  function formatRetryDelay(seconds) {
    const safeSeconds = Number.isFinite(Number(seconds)) ? Math.max(0, Math.ceil(Number(seconds))) : 0;
    if (typeof window.formatDuration === 'function') {
      return window.formatDuration(safeSeconds);
    }
    return `${safeSeconds}s`;
  }

  function buildRateLimitMessage(payload = {}) {
    const retryAfterSeconds = getRetryAfterSeconds(payload);
    const waitMessage = retryAfterSeconds > 0
      ? `Try again in ${formatRetryDelay(retryAfterSeconds)}.`
      : 'Try again shortly.';
    return `${payload.error || 'Too many requests from this IP.'} ${waitMessage}`;
  }

  async function parseJsonResponse(response) {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (_) {
      return { error: text };
    }
  }

  async function assertNotRateLimited(response, options = {}) {
    if (!response || response.status !== 429) {
      return response;
    }

    const payload = await parseJsonResponse(response);
    const retryAfterSeconds = getRetryAfterSeconds(payload);
    const noticeUntil = Date.now() + (retryAfterSeconds * 1000);
    const message = buildRateLimitMessage(payload);

    if (options.notify !== false && typeof window.showToastMessage === 'function') {
      if (!lastRateLimitNoticeUntil || Date.now() >= (lastRateLimitNoticeUntil - 1000)) {
        window.showToastMessage(message, 'warning', Math.max(4000, Math.min(retryAfterSeconds * 1000, 15000) || 8000));
        lastRateLimitNoticeUntil = noticeUntil || (Date.now() + 8000);
      }
    }

    const error = new Error(message);
    error.name = 'RateLimitError';
    error.isRateLimited = true;
    error.retryAfterSeconds = retryAfterSeconds;
    error.payload = payload;
    throw error;
  }

  async function request(payload, options = {}) {
    const {
      method = 'POST',
      headers = {},
      keepalive = false,
      notifyOnRateLimit = true
    } = options;

    const response = await fetch(API_URL, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      keepalive,
      body: JSON.stringify(payload)
    });

    await assertNotRateLimited(response, { notify: notifyOnRateLimit });
    return response;
  }

  function buildHttpError(response, payload = {}) {
    const message = payload?.error || `Server error: ${response.status} ${response.statusText}`;
    const error = new Error(message);
    error.name = 'BackendApiError';
    error.status = response.status;
    error.payload = payload;
    return error;
  }

  async function postJson(payload, options = {}) {
    const response = await request(payload, options);
    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw buildHttpError(response, data);
    }

    return {
      response,
      data
    };
  }

  async function postText(payload, options = {}) {
    const {
      jsonErrorMessage = 'Results are not available yet.'
    } = options;

    const response = await request(payload, options);
    const contentType = response.headers.get('Content-Type') || '';

    if (contentType.includes('application/json')) {
      const data = await parseJsonResponse(response);
      throw buildHttpError(response, {
        ...data,
        error: data?.error || jsonErrorMessage
      });
    }

    if (!response.ok) {
      const text = await response.text();
      throw buildHttpError(response, { error: text });
    }

    const text = await response.text();
    return {
      response,
      text
    };
  }

  return {
    API_URL,
    assertNotRateLimited,
    buildRateLimitMessage,
    formatRetryDelay,
    parseJsonResponse,
    request,
    postJson,
    postText,
    buildHttpError
  };
})();

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
    if (!window.QueryStateReaders || typeof window.QueryStateReaders.subscribe !== 'function' || typeof handler !== 'function') {
      return () => {};
    }

    const {
      displayedFields = false,
      activeFilters = false,
      predicate = null
    } = options;

    const requireSpecificChanges = displayedFields || activeFilters;

    return window.QueryStateReaders.subscribe(event => {
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
  const raisedUiKeys = new Set();

  function normalizeTargets(targets) {
    if (!Array.isArray(targets)) {
      return [];
    }

    return targets.filter(Boolean);
  }

  function syncRaisedUiState() {
    document.body.classList.toggle('raised-ui-open', raisedUiKeys.size > 0);
  }

  function acquireRaisedUi(key = '') {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      return;
    }

    raisedUiKeys.add(normalizedKey);
    syncRaisedUiState();
  }

  function releaseRaisedUi(key = '') {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      return;
    }

    raisedUiKeys.delete(normalizedKey);
    syncRaisedUiState();
  }

  function show(targets, options = {}) {
    const {
      bodyClass = '',
      ariaHidden = null,
      raisedUiKey = ''
    } = options;

    normalizeTargets(targets).forEach(target => {
      target.classList.remove('hidden');
      target.hidden = false;
      target.removeAttribute('hidden');
      if (ariaHidden !== null) {
        target.setAttribute('aria-hidden', String(ariaHidden));
      }
    });

    if (bodyClass) {
      document.body.classList.add(bodyClass);
    }

    if (raisedUiKey) {
      acquireRaisedUi(raisedUiKey);
    }
  }

  function hide(targets, options = {}) {
    const {
      bodyClass = '',
      ariaHidden = null,
      raisedUiKey = ''
    } = options;

    normalizeTargets(targets).forEach(target => {
      target.classList.add('hidden');
      target.hidden = true;
      target.setAttribute('hidden', '');
      if (ariaHidden !== null) {
        target.setAttribute('aria-hidden', String(ariaHidden));
      }
    });

    if (bodyClass) {
      document.body.classList.remove(bodyClass);
    }

    if (raisedUiKey) {
      releaseRaisedUi(raisedUiKey);
    }
  }

  function isVisible(target) {
    return !!(
      target
      && !target.classList.contains('hidden')
      && !target.hidden
      && !target.hasAttribute('hidden')
    );
  }

  return {
    show,
    hide,
    isVisible,
    acquireRaisedUi,
    releaseRaisedUi
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

    if (window.CustomDatePicker && typeof window.CustomDatePicker.formatDisplayValue === 'function') {
      return window.CustomDatePicker.formatDisplayValue(rawValue, {
        invalidValue,
        fallbackToRaw
      });
    }

    const textValue = String(rawValue || '').trim();
    return fallbackToRaw ? textValue : invalidValue;
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
      const displayValue = window.MoneyUtils.formatDisplayValue(rawValue);
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

window.MoneyUtils = (() => {
  function resolveInputBehaviorOptions(modeOrIsMoney) {
    if (modeOrIsMoney && typeof modeOrIsMoney === 'object') {
      const kind = String(modeOrIsMoney.kind || 'plain').toLowerCase();
      return {
        kind,
        allowDecimal: kind === 'money' || kind === 'decimal',
        symbolized: kind === 'money'
      };
    }

    return {
      kind: modeOrIsMoney ? 'money' : 'plain',
      allowDecimal: Boolean(modeOrIsMoney),
      symbolized: Boolean(modeOrIsMoney)
    };
  }

  function sanitizeInputValue(rawValue, options = {}) {
    const { allowDecimal = true } = options;
    const text = String(rawValue || '');
    const isNegative = text.trim().startsWith('-');
    const numeric = text.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
    const firstDot = numeric.indexOf('.');
    const whole = firstDot >= 0 ? numeric.slice(0, firstDot) : numeric;
    const decimals = allowDecimal && firstDot >= 0
      ? numeric.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)
      : '';
    const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
    const hasDot = allowDecimal && firstDot >= 0;

    if (!normalizedWhole && !decimals && !hasDot) {
      return '';
    }

    const prefix = isNegative ? '-' : '';
    return hasDot
      ? `${prefix}${normalizedWhole || '0'}.${decimals}`
      : `${prefix}${normalizedWhole || '0'}`;
  }

  function formatInputValue(rawValue, options = {}) {
    const { allowDecimal = true } = options;
    const text = String(rawValue || '');
    const sanitized = sanitizeInputValue(text, { allowDecimal });
    const hadDot = allowDecimal && text.includes('.');

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

  function parseNumber(rawValue, options = {}) {
    if (typeof rawValue === 'number') {
      return rawValue;
    }

    const { allowDecimal = true } = options;
    const sanitized = sanitizeInputValue(rawValue, { allowDecimal });
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

  const AUTO_NUMERIC_INTEGER_OPTIONS = Object.freeze({
    currencySymbol: '',
    digitGroupSeparator: ',',
    digitalGroupSpacing: '3',
    decimalCharacter: '.',
    decimalCharacterAlternative: '.',
    decimalPlaces: 0,
    decimalPlacesRawValue: 0,
    allowDecimalPadding: false,
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
      const rawValue = sanitizeInputValue(input._moneyAutoNumeric.getNumericString(), {
        allowDecimal: input.dataset.numericAllowDecimal !== 'false'
      });
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

    const behavior = resolveInputBehaviorOptions(isMoney);
    const shouldFormat = behavior.kind === 'money' || behavior.kind === 'integer';
    input.classList.toggle('money-input-symbolized', behavior.symbolized);

    destroyInputBehavior(input);

    if (!shouldFormat) {
      delete input.dataset.moneyRaw;
      delete input.dataset.numericAllowDecimal;
      return;
    }

    input.dataset.numericAllowDecimal = behavior.allowDecimal ? 'true' : 'false';

    if (!window.AutoNumeric) {
      const rawValue = sanitizeInputValue(input.value, { allowDecimal: behavior.allowDecimal });
      input.value = formatInputValue(rawValue, { allowDecimal: behavior.allowDecimal });
      if (rawValue) {
        input.dataset.moneyRaw = rawValue;
      } else {
        delete input.dataset.moneyRaw;
      }
      return;
    }

    const initialRawValue = sanitizeInputValue(input.value, { allowDecimal: behavior.allowDecimal });
    input.type = 'text';
    input.inputMode = behavior.allowDecimal ? 'decimal' : 'numeric';
    input._moneyAutoNumeric = new window.AutoNumeric(
      input,
      initialRawValue || '',
      behavior.allowDecimal ? AUTO_NUMERIC_OPTIONS : AUTO_NUMERIC_INTEGER_OPTIONS
    );
    input._moneyAutoNumericSync = () => {
      const rawValue = sanitizeInputValue(input._moneyAutoNumeric.getNumericString(), {
        allowDecimal: behavior.allowDecimal
      });
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

window.escapeHtml = function(unsafe) {
  if (typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

window.escapeRegExp = function(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

window.DragUtils = {
  hasDragType(event, dragType) {
    const types = event?.dataTransfer?.types;
    return Boolean(types && Array.from(types).includes(dragType));
  }
};

window.Icons = {
  trashSVG(width, height) {
    const sizeAttrs = (width != null && height != null) ? ` width="${width}" height="${height}"` : '';
    return `<svg viewBox="0 0 16 16"${sizeAttrs} aria-hidden="true"><path fill="currentColor" d="M9.32 15.653a.812.812 0 0 1-.086-.855c.176-.342.245-.733.2-1.118a2.106 2.106 0 0 0-.267-.779 2.027 2.027 0 0 0-.541-.606 3.96 3.96 0 0 1-1.481-2.282c-1.708 2.239-1.053 3.51-.235 4.63a.748.748 0 0 1-.014.901.87.87 0 0 1-.394.283.838.838 0 0 1-.478.023c-1.105-.27-2.145-.784-2.85-1.603a4.686 4.686 0 0 1-.906-1.555 4.811 4.811 0 0 1-.263-1.797s-.133-2.463 2.837-4.876c0 0 3.51-2.978 2.292-5.18a.621.621 0 0 1 .112-.653.558.558 0 0 1 .623-.147l.146.058a7.63 7.63 0 0 1 2.96 3.5c.58 1.413.576 3.06.184 4.527.325-.292.596-.641.801-1.033l.029-.064c.198-.477.821-.325 1.055-.013.086.137 2.292 3.343 1.107 6.048a5.516 5.516 0 0 1-1.84 2.027 6.127 6.127 0 0 1-2.138.893.834.834 0 0 1-.472-.038.867.867 0 0 1-.381-.29zM7.554 7.892a.422.422 0 0 1 .55.146c.04.059.066.126.075.198l.045.349c.02.511.014 1.045.213 1.536.206.504.526.95.932 1.298a3.06 3.06 0 0 1 1.16 1.422c.22.564.25 1.19.084 1.773a4.123 4.123 0 0 0 1.39-.757l.103-.084c.336-.277.613-.623.813-1.017.201-.393.322-.825.354-1.269.065-1.025-.284-2.054-.827-2.972-.248.36-.59.639-.985.804-.247.105-.509.17-.776.19a.792.792 0 0 1-.439-.1.832.832 0 0 1-.321-.328.825.825 0 0 1-.035-.729c.412-.972.54-2.05.365-3.097a5.874 5.874 0 0 0-1.642-3.16c-.156 2.205-2.417 4.258-2.881 4.7a3.537 3.537 0 0 1-.224.194c-2.426 1.965-2.26 3.755-2.26 3.834a3.678 3.678 0 0 0 .459 2.043c.365.645.89 1.177 1.52 1.54C4.5 12.808 4.5 10.89 7.183 8.14l.372-.25z"/></svg>`;
  }
};

window.FormatUtils = {
  formatCellDisplay(raw, field) {
    if (raw == null) return '';
    if (typeof raw === 'string' && raw.includes('\x1F')) {
      return raw.split('\x1F').filter(s => s.trim()).join(', ');
    }
    const s = String(raw);
    if (s === '' || s === '\u2014') return s;
    const vf = window.ValueFormatting;
    if (!vf) return s;
    const type = vf.getFieldType?.(field, { inferMoneyFromName: true });
    if (!type) return s;
    if (type === 'date') return vf.formatValueByType(s, type, { invalidDateValue: 'Never' });
    if (type === 'money') {
      const n = window.MoneyUtils?.parseNumber?.(s);
      if (!isNaN(n)) return vf.formatValueByType(n, type, { fieldName: field });
    }
    if (type === 'number') {
      const n = parseFloat(s.replace(/,/g, ''));
      if (!isNaN(n)) return vf.formatValueByType(n, type, { fieldName: field });
    }
    return s;
  }
};

const BackendApi = window.BackendApi;
const ClipboardUtils = window.ClipboardUtils;
const DragUtils = window.DragUtils;
const EventUtils = window.EventUtils;
const FormatUtils = window.FormatUtils;
const Icons = window.Icons;
const MoneyUtils = window.MoneyUtils;
const OperatorLabels = window.OperatorLabels;
const OperatorSelectUtils = window.OperatorSelectUtils;
const QueryStateSubscriptions = window.QueryStateSubscriptions;
const TableBuilder = window.TableBuilder;
const TextMeasurement = window.TextMeasurement;
const ValueFormatting = window.ValueFormatting;
const VisibilityUtils = window.VisibilityUtils;
const escapeHtml = window.escapeHtml;
const escapeRegExp = window.escapeRegExp;
const formatDuration = window.formatDuration;
const getFieldOutputSegments = window.getFieldOutputSegments;
const onDOMReady = window.onDOMReady;
const parsePipeDelimitedRow = window.parsePipeDelimitedRow;

export {
  BackendApi,
  ClipboardUtils,
  DragUtils,
  EventUtils,
  FormatUtils,
  Icons,
  MoneyUtils,
  OperatorLabels,
  OperatorSelectUtils,
  QueryStateSubscriptions,
  TableBuilder,
  TextMeasurement,
  ValueFormatting,
  VisibilityUtils,
  escapeHtml,
  escapeRegExp,
  formatDuration,
  getFieldOutputSegments,
  onDOMReady,
  parsePipeDelimitedRow
};
