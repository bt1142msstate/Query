/**
 * Shared DOM lookup cache.
 * Keeps repeated element queries in one place for the browser-script UI.
 */

function getCachedElement(cache, cacheKey, elementId) {
  if (typeof document === 'undefined') {
    return null;
  }

  const cached = cache[cacheKey];
  if (cached && cached.isConnected) {
    return cached;
  }

  const next = document.getElementById(elementId);
  cache[cacheKey] = next || null;
  return cache[cacheKey];
}

const DOM = {
  get overlay() { return getCachedElement(this, '_overlay', 'overlay'); },
  get pageBody() { return getCachedElement(this, '_pageBody', 'page-body'); },
  get conditionPanel() { return getCachedElement(this, '_conditionPanel', 'condition-panel'); },
  get inputWrapper() { return getCachedElement(this, '_inputWrapper', 'condition-input-wrapper'); },
  get conditionInput() { return getCachedElement(this, '_conditionInput', 'condition-input'); },
  get conditionInput2() { return getCachedElement(this, '_conditionInput2', 'condition-input-2'); },
  get betweenLabel() { return getCachedElement(this, '_betweenLabel', 'between-label'); },
  get confirmBtn() { return getCachedElement(this, '_confirmBtn', 'confirm-btn'); },
  get runBtn() { return getCachedElement(this, '_runBtn', 'run-query-btn'); },
  get runIcon() { return getCachedElement(this, '_runIcon', 'run-icon'); },
  get refreshIcon() { return getCachedElement(this, '_refreshIcon', 'refresh-icon'); },
  get stopIcon() { return getCachedElement(this, '_stopIcon', 'stop-icon'); },
  get downloadBtn() { return getCachedElement(this, '_downloadBtn', 'download-btn'); },
  get postFilterBtn() { return getCachedElement(this, '_postFilterBtn', 'post-filter-btn'); },
  get clearQueryBtn() { return getCachedElement(this, '_clearQueryBtn', 'clear-query-btn'); },
  get queryBox() { return getCachedElement(this, '_queryBox', 'query-json'); },
  get queryInput() { return getCachedElement(this, '_queryInput', 'query-input'); },
  get filterCard() { return getCachedElement(this, '_filterCard', 'filter-card'); },
  get filterCardTitle() { return getCachedElement(this, '_filterCardTitle', 'filter-card-title'); },
  get tableShell() { return getCachedElement(this, '_tableShell', 'table-shell'); },
  get tableContainer() { return getCachedElement(this, '_tableContainer', 'table-container'); },
  get tableTopBar() { return getCachedElement(this, '_tableTopBar', 'table-top-bar'); },
  get tableInfoBar() { return getCachedElement(this, '_tableInfoBar', 'table-info-bar'); },
  get tableToolbar() { return getCachedElement(this, '_tableToolbar', 'table-toolbar'); },
  get tableNameInput() { return getCachedElement(this, '_tableNameInput', 'table-name-input'); },
  get tableNameShell() { return getCachedElement(this, '_tableNameShell', 'table-name-shell'); },
  get tableResultsBadge() { return getCachedElement(this, '_tableResultsBadge', 'table-results-badge'); },
  get planningBadge() { return getCachedElement(this, '_planningBadge', 'planning-badge'); },
  get partialResultsBadge() { return getCachedElement(this, '_partialResultsBadge', 'partial-results-badge'); },
  get tableResultsCount() { return getCachedElement(this, '_tableResultsCount', 'table-results-count'); },
  get tableResultsLabel() { return getCachedElement(this, '_tableResultsLabel', 'table-results-label'); },
  get tableColumnsCount() { return getCachedElement(this, '_tableColumnsCount', 'table-columns-count'); },
  get tableColumnsLabel() { return getCachedElement(this, '_tableColumnsLabel', 'table-columns-label'); },
  get tableZoomControls() { return getCachedElement(this, '_tableZoomControls', 'table-zoom-controls'); },
  get tableZoomOutBtn() { return getCachedElement(this, '_tableZoomOutBtn', 'table-zoom-out-btn'); },
  get tableZoomInBtn() { return getCachedElement(this, '_tableZoomInBtn', 'table-zoom-in-btn'); },
  get tableZoomLabel() { return getCachedElement(this, '_tableZoomLabel', 'table-zoom-label'); },
  get tableExpandBtn() { return getCachedElement(this, '_tableExpandBtn', 'table-expand-btn'); },
  get clearSearchBtn() { return getCachedElement(this, '_clearSearchBtn', 'clear-search-btn'); },
  get groupMethodSelect() { return getCachedElement(this, '_groupMethodSelect', 'group-method-select'); },
  get filterError() { return getCachedElement(this, '_filterError', 'filter-error'); },
  get headerBar() { return getCachedElement(this, '_headerBar', 'header-bar'); },
  get headerOverlayTitle() { return getCachedElement(this, '_headerOverlayTitle', 'header-overlay-title'); },
  get categoryBar() { return getCachedElement(this, '_categoryBar', 'category-bar'); },
  get mobileCategorySelector() { return getCachedElement(this, '_mobileCategorySelector', 'mobile-category-selector'); },
  get mobileMenuToggle() { return getCachedElement(this, '_mobileMenuToggle', 'mobile-menu-toggle'); },
  get mobileRunQuery() { return getCachedElement(this, '_mobileRunQuery', 'mobile-run-query'); },
  get mobileDownload() { return getCachedElement(this, '_mobileDownload', 'mobile-download'); },
  get mobileClearQuery() { return getCachedElement(this, '_mobileClearQuery', 'mobile-clear-query'); },

  // Bubble area
  get bubbleContainer() { return getCachedElement(this, '_bubbleContainer', 'bubble-container'); },
  get bubbleList() { return getCachedElement(this, '_bubbleList', 'bubble-list'); },
  get bubbleScrollbar() { return getCachedElement(this, '_bubbleScrollbar', 'bubble-scrollbar'); },
  get bubbleScrollbarTrack() { return getCachedElement(this, '_bubbleScrollbarTrack', 'bubble-scrollbar-track'); },
  get bubbleScrollbarThumb() { return getCachedElement(this, '_bubbleScrollbarThumb', 'bubble-scrollbar-thumb'); },
  get bubbleCondList() { return getCachedElement(this, '_bubbleCondList', 'bubble-cond-list'); },

  // Filter side panel
  get filterSidePanel() { return getCachedElement(this, '_filterSidePanel', 'filter-side-panel'); },
  get filterPanelBody() { return getCachedElement(this, '_filterPanelBody', 'filter-panel-body'); },
  get filterPanelTitle() { return getCachedElement(this, '_filterPanelTitle', 'filter-panel-title'); },

  // Query history panel
  get queriesPanel() { return getCachedElement(this, '_queriesPanel', 'queries-panel'); },
  get queriesContainer() { return getCachedElement(this, '_queriesContainer', 'queries-container'); },
  get queriesList() { return getCachedElement(this, '_queriesList', 'queries-list'); },
  get queriesSearch() { return getCachedElement(this, '_queriesSearch', 'queries-search'); }
};

export { DOM };
