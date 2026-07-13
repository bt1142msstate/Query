function getTemplateElement(documentRef, id) {
  return documentRef.getElementById(id);
}

function getQueryTemplateElements(documentRef = document) {
  const el = id => getTemplateElement(documentRef, id);
  return {
    panel: el('templates-panel'),
    modeNote: el('templates-mode-note'),
    listStatus: el('templates-list-status'),
    list: el('templates-list'),
    newBtn: el('templates-new-btn'),
    refreshBtn: el('templates-refresh-btn'),
    manageCategoriesBtn: el('templates-manage-categories-btn'),
    emptyState: el('templates-empty-state'),
    detailOverlay: el('templates-detail-overlay'),
    detailBackdrop: el('templates-detail-backdrop'),
    detail: el('templates-detail'),
    detailCloseBtn: el('templates-detail-close-btn'),
    detailMode: el('templates-detail-mode'),
    detailTitle: el('templates-detail-title'),
    nameInput: el('template-name-input'),
    descriptionInput: el('template-description-input'),
    validation: el('templates-validation'),
    meta: el('templates-meta'),
    useBtn: el('template-use-btn'),
    pinBtn: el('template-pin-btn'),
    saveBtn: el('template-save-btn'),
    deleteBtn: el('template-delete-btn'),
    categoryFilter: el('templates-category-filter'),
    searchInput: el('templates-search-input'),
    resultsSummary: el('templates-results-summary'),
    categoryList: el('templates-category-list'),
    categoriesOverlay: el('templates-categories-overlay'),
    categoriesBackdrop: el('templates-categories-backdrop'),
    categoriesCloseBtn: el('templates-categories-close-btn'),
    categoryNameLabel: el('template-category-name-label'),
    categoryNameInput: el('template-category-name-input'),
    categoryDescriptionInput: el('template-category-description-input'),
    categorySaveBtn: el('template-category-save-btn'),
    categoryCancelBtn: el('template-category-cancel-btn'),
    categoryAssignment: el('template-category-assignment'),
    pinnedStrip: el('pinned-templates-strip'),
    pinnedList: el('pinned-templates-list'),
    pinnedMoreBtn: el('pinned-templates-more-btn')
  };
}

export {
  getQueryTemplateElements,
  getTemplateElement
};
