/** Rebuild and render the query JSON preview. */
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

window.updateQueryJson = function() {
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
};

window.onDOMReady(() => {
  const jsonTree = document.getElementById('query-json-tree');
  if (jsonTree) {
    jsonTree.addEventListener('toggle', event => {
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
    window.ClipboardUtils.bindCopyButton(copyBtn, () => {
      const queryBox = window.DOM.queryBox;
      return queryBox instanceof HTMLTextAreaElement
        ? queryBox.value
        : (queryBox?.textContent || '');
    }, {
      successMessage: 'JSON copied to clipboard.',
      errorMessage: 'Failed to copy JSON.',
      emptyMessage: 'No JSON is available to copy.',
      onSuccess: () => {
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 1200);
      }
    });
  }
});

// Keep JSON preview in sync with query state changes reactively.
window.QueryStateSubscriptions.subscribe(() => {
  window.updateQueryJson();
}, { displayedFields: true, activeFilters: true });