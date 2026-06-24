function getPostFilterElements(document) {
  return {
    autoStatus: document.getElementById('post-filter-auto-status'),
    backdrop: document.getElementById('post-filter-overlay-backdrop'),
    betweenLabel: document.getElementById('post-filter-between-label'),
    button: document.getElementById('post-filter-btn'),
    clearBtn: document.getElementById('post-filter-clear-btn'),
    closeBtn: document.getElementById('post-filter-overlay-close'),
    doneBtn: document.getElementById('post-filter-done-btn'),
    empty: document.getElementById('post-filter-empty'),
    fieldSelect: document.getElementById('post-filter-field'),
    list: document.getElementById('post-filter-list'),
    logicSelect: document.getElementById('post-filter-logic'),
    operatorSelect: document.getElementById('post-filter-operator'),
    overlay: document.getElementById('post-filter-overlay'),
    summaryBaseRows: document.getElementById('post-filter-summary-base-rows'),
    summaryCount: document.getElementById('post-filter-summary-count'),
    summaryRows: document.getElementById('post-filter-summary-rows'),
    valueInput: document.getElementById('post-filter-value'),
    valueInput2: document.getElementById('post-filter-value-2'),
    valuePickerHost: document.getElementById('post-filter-value-picker-host')
  };
}

export { getPostFilterElements };
