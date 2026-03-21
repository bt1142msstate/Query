(function() {
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  let popup = null;
  let titleEl = null;
  let gridEl = null;
  let activeInput = null;
  let activeShell = null;
  let visibleMonth = null;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toIsoDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseIsoDate(value) {
    const normalized = String(value || '').trim();
    if (!ISO_DATE_PATTERN.test(normalized)) {
      return null;
    }

    const [yearValue, monthValue, dayValue] = normalized.split('-').map(Number);
    const date = new Date(yearValue, monthValue - 1, dayValue);
    if (
      date.getFullYear() !== yearValue
      || date.getMonth() !== monthValue - 1
      || date.getDate() !== dayValue
    ) {
      return null;
    }

    return date;
  }

  function isValidDateValue(value) {
    return Boolean(parseIsoDate(value));
  }

  function normalizeDateValue(value) {
    const parsed = parseIsoDate(value);
    return parsed ? toIsoDate(parsed) : '';
  }

  function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function shiftMonth(date, delta) {
    return new Date(date.getFullYear(), date.getMonth() + delta, 1);
  }

  function clampHorizontal(left, width) {
    const minLeft = 12;
    const maxLeft = Math.max(minLeft, window.innerWidth - width - 12);
    return Math.min(Math.max(left, minLeft), maxLeft);
  }

  function ensurePopup() {
    if (popup) {
      return popup;
    }

    popup = document.createElement('div');
    popup.className = 'custom-date-picker';
    popup.hidden = true;
    popup.innerHTML = `
      <div class="custom-date-picker__header">
        <button type="button" class="custom-date-picker__nav" data-date-nav="prev" aria-label="Previous month">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        </button>
        <div class="custom-date-picker__title" data-date-title></div>
        <button type="button" class="custom-date-picker__nav" data-date-nav="next" aria-label="Next month">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        </button>
      </div>
      <div class="custom-date-picker__weekdays"></div>
      <div class="custom-date-picker__grid" data-date-grid></div>
      <div class="custom-date-picker__footer">
        <button type="button" class="custom-date-picker__action" data-date-action="today">Today</button>
        <button type="button" class="custom-date-picker__action custom-date-picker__action--ghost" data-date-action="clear">Clear</button>
      </div>
    `;

    titleEl = popup.querySelector('[data-date-title]');
    gridEl = popup.querySelector('[data-date-grid]');

    const weekdaysEl = popup.querySelector('.custom-date-picker__weekdays');
    WEEKDAY_NAMES.forEach(name => {
      const cell = document.createElement('div');
      cell.className = 'custom-date-picker__weekday';
      cell.textContent = name;
      weekdaysEl.appendChild(cell);
    });

    popup.addEventListener('click', event => {
      const nav = event.target.closest('[data-date-nav]');
      if (nav) {
        visibleMonth = shiftMonth(visibleMonth || getMonthStart(new Date()), nav.dataset.dateNav === 'next' ? 1 : -1);
        renderCalendar();
        positionPopup();
        return;
      }

      const action = event.target.closest('[data-date-action]');
      if (action) {
        if (action.dataset.dateAction === 'today') {
          commitDateValue(toIsoDate(new Date()));
        } else if (action.dataset.dateAction === 'clear') {
          commitDateValue('');
        }
        return;
      }

      const dayButton = event.target.closest('[data-date-value]');
      if (dayButton) {
        commitDateValue(dayButton.dataset.dateValue || '');
      }
    });

    document.addEventListener('mousedown', event => {
      if (!popup || popup.hidden) return;
      if (popup.contains(event.target)) return;
      if (activeShell && activeShell.contains(event.target)) return;
      closePopup();
    });

    document.addEventListener('keydown', event => {
      if (!popup || popup.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closePopup({ restoreFocus: true });
      }
    });

    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);

    document.body.appendChild(popup);
    return popup;
  }

  function renderCalendar() {
    if (!popup || !titleEl || !gridEl || !visibleMonth) {
      return;
    }

    const selectedIso = activeInput ? normalizeDateValue(activeInput.value) : '';
    const todayIso = toIsoDate(new Date());
    titleEl.textContent = `${MONTH_NAMES[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`;

    gridEl.innerHTML = '';

    const firstOfMonth = getMonthStart(visibleMonth);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), 1 - startOffset);

    for (let index = 0; index < 42; index += 1) {
      const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      const cellIso = toIsoDate(cellDate);
      const dayButton = document.createElement('button');
      dayButton.type = 'button';
      dayButton.className = 'custom-date-picker__day';
      dayButton.dataset.dateValue = cellIso;
      dayButton.textContent = String(cellDate.getDate());

      if (cellDate.getMonth() !== visibleMonth.getMonth()) {
        dayButton.classList.add('is-outside-month');
      }
      if (cellIso === todayIso) {
        dayButton.classList.add('is-today');
      }
      if (cellIso === selectedIso) {
        dayButton.classList.add('is-selected');
        dayButton.setAttribute('aria-current', 'date');
      }

      gridEl.appendChild(dayButton);
    }
  }

  function positionPopup() {
    if (!popup || popup.hidden || !activeShell || !activeShell.isConnected) {
      return;
    }

    const rect = activeShell.getBoundingClientRect();
    const popupWidth = popup.offsetWidth || 320;
    const popupHeight = popup.offsetHeight || 360;
    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldPlaceAbove = spaceBelow < popupHeight + 16 && rect.top > popupHeight + 16;
    const top = shouldPlaceAbove
      ? rect.top + window.scrollY - popupHeight - 10
      : rect.bottom + window.scrollY + 10;
    const alignedLeft = clampHorizontal(rect.left + window.scrollX, popupWidth);

    popup.style.top = `${Math.max(12, top)}px`;
    popup.style.left = `${alignedLeft}px`;
  }

  function closePopup(options = {}) {
    if (!popup) {
      return;
    }

    popup.hidden = true;
    if (activeShell) {
      activeShell.classList.remove('is-open');
    }
    const nextFocusTarget = options.restoreFocus ? activeInput : null;
    activeInput = null;
    activeShell = null;
    if (nextFocusTarget && typeof nextFocusTarget.focus === 'function') {
      nextFocusTarget.focus();
    }
  }

  function commitDateValue(nextValue) {
    if (!activeInput) {
      closePopup();
      return;
    }

    activeInput.value = nextValue;
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    closePopup();
  }

  function openPopupForInput(input) {
    if (!input || !input.isConnected) {
      return;
    }

    ensurePopup();
    activeInput = input;
    activeShell = input._customDatePickerApi ? input._customDatePickerApi.shell : input;
    activeShell.classList.add('is-open');

    const selectedDate = parseIsoDate(input.value);
    visibleMonth = getMonthStart(selectedDate || new Date());
    popup.hidden = false;
    renderCalendar();
    positionPopup();
  }

  function setInputEnabled(api, enabled) {
    api.enabled = Boolean(enabled);
    api.shell.classList.toggle('is-disabled', !api.enabled);
    api.button.hidden = !api.enabled;
    api.input.classList.toggle('custom-date-input__field--with-trigger', api.enabled);
    if (!api.enabled && activeInput === api.input) {
      closePopup();
    }
  }

  function enhanceInput(input, options = {}) {
    if (!input) {
      return null;
    }

    let api = input._customDatePickerApi;
    if (!api) {
      const shell = document.createElement('div');
      shell.className = 'custom-date-input';
      const parent = input.parentNode;
      if (parent) {
        parent.insertBefore(shell, input);
        shell.appendChild(input);
      }

      input.classList.add('custom-date-input__field');

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'custom-date-input__trigger';
      button.setAttribute('aria-label', 'Open calendar');
      button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M7 3.5v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="M17 3.5v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="M3.5 9.5h17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';
      shell.appendChild(button);

      api = {
        input,
        shell,
        button,
        enabled: true,
        closeIfActive() {
          if (activeInput === input) {
            closePopup();
          }
        },
        destroy() {
          this.closeIfActive();
          if (this.button && this.button.parentNode) {
            this.button.parentNode.removeChild(this.button);
          }
          if (this.shell && this.shell.parentNode) {
            this.shell.parentNode.insertBefore(this.input, this.shell);
            this.shell.parentNode.removeChild(this.shell);
          }
          this.input.classList.remove('custom-date-input__field', 'custom-date-input__field--with-trigger');
          delete this.input._customDatePickerApi;
        }
      };

      const tryOpen = () => {
        if (!api.enabled || input.disabled || input.readOnly) {
          return;
        }
        openPopupForInput(input);
      };

      button.addEventListener('click', event => {
        event.preventDefault();
        tryOpen();
      });

      input.addEventListener('click', () => {
        if (api.enabled) {
          tryOpen();
        }
      });

      input.addEventListener('keydown', event => {
        if ((event.key === 'ArrowDown' || event.key === 'Enter') && api.enabled) {
          event.preventDefault();
          tryOpen();
          return;
        }

        if (event.key === 'Escape' && activeInput === input) {
          event.preventDefault();
          closePopup({ restoreFocus: true });
        }
      });

      input.addEventListener('blur', () => {
        const normalized = normalizeDateValue(input.value);
        if (!input.value) {
          return;
        }
        if (normalized) {
          input.value = normalized;
        }
      });

      input._customDatePickerApi = api;
    }

    const variant = options.variant || 'form';
    api.shell.classList.toggle('custom-date-input--filter', variant === 'filter');
    api.shell.classList.toggle('custom-date-input--form', variant === 'form');

    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = options.placeholder || input.placeholder || 'YYYY-MM-DD';
    input.setAttribute('pattern', '^\\d{4}-\\d{2}-\\d{2}$');
    if (!input.dataset.errorMsg) {
      input.dataset.errorMsg = 'Use YYYY-MM-DD';
    }

    setInputEnabled(api, options.enabled !== false);
    return api;
  }

  window.CustomDatePicker = {
    enhanceInput,
    isValidDateValue,
    normalizeDateValue,
    close: closePopup
  };
})();