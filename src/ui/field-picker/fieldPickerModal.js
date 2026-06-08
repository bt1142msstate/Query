function createFieldPickerModal({
  allowDisplay,
  allowFilter,
  autoAddFilterFromPreview,
  compactLayout,
  hasFilterPreview,
  labels,
  showDisplayChoice
}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'form-mode-field-picker-backdrop';
  backdrop.hidden = true;
  backdrop.classList.add('hidden');

  const modal = document.createElement('div');
  modal.className = 'form-mode-field-picker-modal';
  modal.hidden = true;
  modal.classList.add('hidden');
  if (compactLayout) {
    modal.classList.add('form-mode-field-picker-modal--compact');
  }

  modal.innerHTML = `
    <div class="form-mode-field-picker-header">
      <div>
        ${labels.kicker ? `<span class="form-mode-field-picker-kicker">${labels.kicker}</span>` : ''}
        <h3 class="form-mode-field-picker-title">${labels.title}</h3>
        <p class="form-mode-field-picker-description">${labels.description}</p>
      </div>
      <button type="button" class="form-mode-field-picker-close" aria-label="Close field picker">×</button>
    </div>
    <div class="form-mode-field-picker-body">
      <div class="form-mode-field-picker-list-panel">
        <div class="form-mode-field-picker-controls">
          <input type="search" class="form-mode-field-picker-search" placeholder="Search fields..." aria-label="Search fields" data-search-ui="enhanced" data-search-wrapper-class="form-mode-field-picker-search-field" data-search-clear-label="Clear field search" />
          <label class="form-mode-field-picker-category-wrap">
            <span class="form-mode-field-picker-category-label">Category</span>
            <select class="form-mode-field-picker-category-select" aria-label="Filter fields by category">
              <option value="">All categories</option>
            </select>
          </label>
        </div>
        <div class="form-mode-field-picker-list" role="listbox" aria-label="Available fields"></div>
      </div>
      ${compactLayout ? '' : `<div class="form-mode-field-picker-details">
        <p class="form-mode-field-picker-selected-label">${labels.selectedFieldLabel}</p>
        <div class="form-mode-field-picker-field-header">
          <h4 class="form-mode-field-picker-field-name"></h4>
          <button type="button" class="form-mode-field-picker-field-info hidden" aria-label="Show field details">i</button>
        </div>
        <p class="form-mode-field-picker-field-meta hidden"></p>
        <p class="form-mode-field-picker-warning hidden" data-field-picker-warning></p>
        <button type="button" class="form-mode-field-picker-remove-built hidden" data-field-picker-remove-built>Remove built field</button>
        ${allowDisplay && showDisplayChoice !== false ? `<label class="form-mode-field-picker-choice"><input type="checkbox" data-field-picker-choice="display" /><span>${labels.displayChoice}</span></label>` : ''}
        ${allowFilter && !autoAddFilterFromPreview ? `<label class="form-mode-field-picker-choice"><input type="checkbox" data-field-picker-choice="filter" /><span>${labels.filterChoice}</span></label>` : ''}
        ${allowFilter && hasFilterPreview ? `<div class="form-mode-field-picker-filter-preview hidden" data-field-picker-filter-preview>
          <p class="form-mode-field-picker-filter-preview-label">Filter preview</p>
          <div class="form-mode-field-picker-filter-preview-host"></div>
        </div>` : ''}
        <p class="form-mode-field-picker-status"></p>
      </div>`}
    </div>
    <div class="form-mode-field-picker-footer">
      <span class="form-mode-field-picker-footer-note">${labels.footerNote}</span>
    </div>
  `;

  return {
    backdrop,
    modal,
    categorySelect: modal.querySelector('.form-mode-field-picker-category-select'),
    closeButton: modal.querySelector('.form-mode-field-picker-close'),
    displayChoice: modal.querySelector('[data-field-picker-choice="display"]'),
    fieldInfoEl: modal.querySelector('.form-mode-field-picker-field-info'),
    fieldMetaEl: modal.querySelector('.form-mode-field-picker-field-meta'),
    fieldNameEl: modal.querySelector('.form-mode-field-picker-field-name'),
    fieldWarningEl: modal.querySelector('[data-field-picker-warning]'),
    filterChoice: modal.querySelector('[data-field-picker-choice="filter"]'),
    filterPreviewHost: modal.querySelector('.form-mode-field-picker-filter-preview-host'),
    filterPreviewLabelEl: modal.querySelector('.form-mode-field-picker-filter-preview-label'),
    filterPreviewWrap: modal.querySelector('[data-field-picker-filter-preview]'),
    listEl: modal.querySelector('.form-mode-field-picker-list'),
    removeBuiltFieldBtn: modal.querySelector('[data-field-picker-remove-built]'),
    searchInput: modal.querySelector('.form-mode-field-picker-search'),
    statusEl: modal.querySelector('.form-mode-field-picker-status')
  };
}

export {
  createFieldPickerModal
};
