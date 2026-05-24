function parseListInputValues(rawValue) {
  return String(rawValue || '')
    .split(/[\r\n,]+/)
    .map(value => value.trim())
    .filter(Boolean);
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

export {
  createListPasteInput,
  parseListInputValues
};
