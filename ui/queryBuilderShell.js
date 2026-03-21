/**
 * Query builder shell orchestration.
 * Handles category navigation, search, overlay coordination, and initial builder bootstrapping.
 */
(function registerQueryBuilderShell() {
  const dom = window.DOM;
  const appState = window.AppState;
  const services = window.AppServices;
  const uiActions = window.AppUiActions;
  const getDisplayedFields = window.QueryStateReaders.getDisplayedFields.bind(window.QueryStateReaders);
  const getActiveFilters = window.QueryStateReaders.getActiveFilters.bind(window.QueryStateReaders);
  let initialized = false;
  let queryStateSyncBound = false;

  function resetBubbleScrollState() {
    services.resetBubbleScroll();
  }

  function scrollBubbleRows(deltaRows) {
    return services.scrollBubblesByRows(deltaRows);
  }

  function syncCategoryControls(category) {
    dom.categoryBar?.querySelectorAll('.category-btn').forEach(button => {
      button.classList.toggle('active', button.dataset.category === category);
    });

    if (dom.mobileCategorySelector) {
      dom.mobileCategorySelector.value = category;
    }
  }

  function applyCategoryChange(nextCategory, options = {}) {
    appState.currentCategory = nextCategory;
    syncCategoryControls(nextCategory);

    if (options.resetScroll !== false) {
      resetBubbleScrollState();
    }

    if (options.renderBubbles !== false) {
      services.rerenderBubbles();
    }
  }

  function getVisibleCategoryButtons() {
    return Array.from(document.querySelectorAll('#category-bar .category-btn'));
  }

  function navigateCategory(direction) {
    if (dom.overlay.classList.contains('show') || document.querySelector('.active-bubble')) {
      return false;
    }

    const visibleButtons = getVisibleCategoryButtons();
    if (visibleButtons.length === 0) {
      return false;
    }

    const activeIndex = visibleButtons.findIndex(button => button.classList.contains('active'));
    let nextIndex = 0;

    if (activeIndex === -1) {
      nextIndex = direction > 0 ? 0 : visibleButtons.length - 1;
    } else {
      nextIndex = activeIndex + direction;
      if (nextIndex < 0) {
        nextIndex = visibleButtons.length - 1;
      }
      if (nextIndex >= visibleButtons.length) {
        nextIndex = 0;
      }
    }

    applyCategoryChange(visibleButtons[nextIndex].dataset.category);
    return true;
  }

  function updateSearchLabel(term) {
    const allButton = dom.categoryBar?.querySelector('.category-btn[data-category="All"]');
    if (!allButton) {
      return;
    }

    if (!term) {
      allButton.textContent = `All (${window.fieldDefs.size})`;
      return;
    }

    allButton.textContent = `Search (${window.filteredDefs.length})`;
  }

  function handleQuerySearchInput() {
    if (!document.querySelector('.active-bubble') && !dom.overlay.classList.contains('show')) {
      appState.currentCategory = 'All';
      syncCategoryControls('All');
    }

    const term = dom.queryInput.value.trim().toLowerCase();
    dom.clearSearchBtn?.classList.toggle('hidden', term === '');
    window.updateFilteredDefs(term);
    updateSearchLabel(term);
    resetBubbleScrollState();
    services.rerenderBubbles();
  }

  function updateCategoryCounts() {
    if (!window.hasLoadedFieldDefinitions || !window.hasLoadedFieldDefinitions()) {
      if (dom.categoryBar) {
        dom.categoryBar.innerHTML = '';
      }
      if (dom.mobileCategorySelector) {
        dom.mobileCategorySelector.innerHTML = '';
        dom.mobileCategorySelector.value = '';
      }
      return;
    }

    const categoryCounts = window.calculateCategoryCounts(getDisplayedFields(), getActiveFilters());
    window.renderCategorySelectors(categoryCounts, appState.currentCategory, nextCategory => {
      applyCategoryChange(nextCategory);
    });

    if (appState.currentCategory === 'Selected' && categoryCounts.Selected === 0) {
      applyCategoryChange('All');
    }
  }

  function handleGroupMethodChange() {
    const simpleTable = services.getSimpleTable();
    if (!simpleTable) {
      return;
    }

    const newGroupMethod = dom.groupMethodSelect.value;
    console.log('Changing GroupBy method to:', newGroupMethod);
    simpleTable.changeGroupMethod(newGroupMethod);

    const rawTable = simpleTable.getRawTable();
    if (rawTable.length === 0) {
      return;
    }

    const headers = rawTable[0];
    const dataRows = rawTable.slice(1);
    services.setVirtualTableData({
      headers,
      rows: dataRows,
      columnMap: new Map(headers.map((header, index) => [header, index]))
    });

    window.QueryChangeManager.replaceDisplayedFields(headers, { source: 'QueryBuilderShell.groupMethodChange' });
  }

  function handleOverlayClick() {
    services.closeAllModals();
    services.resetActiveBubbles();
    services.resetBubbleEditorUi();
    window.setTimeout(() => services.rerenderBubbles(), 0);
  }

  function handleBubbleKeyboardNavigation(event) {
    if (event.key === 'Escape' && dom.overlay.classList.contains('show')) {
      dom.overlay.click();
      return;
    }

    if (!appState.hoverScrollArea) {
      return;
    }

    const normalizedKey = event.key.toLowerCase();
    const rightPressed = event.key === 'ArrowRight' || normalizedKey === 'd';
    const leftPressed = event.key === 'ArrowLeft' || normalizedKey === 'a';
    if (rightPressed || leftPressed) {
      navigateCategory(rightPressed ? 1 : -1);
      return;
    }

    const downPressed = event.key === 'ArrowDown' || normalizedKey === 's';
    const upPressed = event.key === 'ArrowUp' || normalizedKey === 'w';
    if (downPressed || upPressed) {
      scrollBubbleRows(downPressed ? 1 : -1);
    }
  }

  function handleFocusedBubbleScroll(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    const focused = document.activeElement;
    const isBubble = focused?.classList && focused.classList.contains('bubble');
    const isThumb = focused?.id === 'bubble-scrollbar-thumb';
    if (!isBubble && !isThumb && !appState.hoverScrollArea) {
      return;
    }

    if (!scrollBubbleRows(event.key === 'ArrowDown' ? 1 : -1)) {
      return;
    }

    event.preventDefault();
  }

  async function initializeBuilderState() {
    const initialContainer = dom.tableContainer;
    if (initialContainer) {
      services.attachBubbleDropTarget(initialContainer);
    }

    try {
      console.log('Initializing application for live queries (test data disabled)');
      window.QueryChangeManager.replaceDisplayedFields([], { source: 'Query.initialization' });
      await uiActions.showExampleTable([]);
      uiActions.updateRunButtonIcon();
      updateCategoryCounts();
    } catch (error) {
      console.error('Error initializing application:', error);
    }
  }

  async function loadDynamicFields() {
    try {
      if (window.loadFieldDefinitions) {
        await window.loadFieldDefinitions();
      }
      updateCategoryCounts();
      services.rerenderBubbles();
    } catch (error) {
      console.error('Failed async initialization:', error);
    }
  }

  function bindConfirmEnterShortcut() {
    ['condition-input', 'condition-input-2', 'condition-select'].forEach(id => {
      const element = document.getElementById(id);
      if (!element) {
        return;
      }

      element.addEventListener('keydown', event => {
        if (event.key !== 'Enter') {
          return;
        }

        event.preventDefault();
        dom.confirmBtn?.click();
      });
    });
  }

  function initialize() {
    if (initialized) {
      return;
    }

    initialized = true;
    if (!queryStateSyncBound) {
      queryStateSyncBound = true;
      window.QueryStateSubscriptions.subscribe(() => {
        updateCategoryCounts();
      }, {
        displayedFields: true,
        activeFilters: true
      });
    }

    dom.pageBody?.classList.add('night');
    bindConfirmEnterShortcut();
    dom.overlay?.addEventListener('click', handleOverlayClick);
    dom.confirmBtn?.addEventListener('click', window.handleFilterConfirm);
    document.addEventListener('keydown', handleBubbleKeyboardNavigation);
    document.addEventListener('keydown', handleFocusedBubbleScroll);
    window.addEventListener('resize', window.positionInputWrapper);

    dom.queryInput?.addEventListener('input', handleQuerySearchInput);
    dom.clearSearchBtn?.addEventListener('click', () => {
      dom.queryInput.value = '';
      dom.queryInput.dispatchEvent(new Event('input'));
      dom.queryInput.focus();
    });

    dom.groupMethodSelect?.addEventListener('change', () => {
      try {
        handleGroupMethodChange();
      } catch (error) {
        console.error('Failed to change GroupBy method:', error);
      }
    });

    updateCategoryCounts();
    initializeBuilderState();
    loadDynamicFields();
    services.initializeBubbles();
  }

  window.updateCategoryCounts = updateCategoryCounts;
  window.QueryBuilderShell = Object.freeze({
    initialize,
    updateCategoryCounts
  });
})();
