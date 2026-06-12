import { appServices } from '../../../core/appServices.js';
import { appUiActions, registerAppUiActionDependencies } from '../../../core/appUiActions.js';
import { showToastMessage } from '../../../core/toast.js';

const DUPLICATE_ROW_COLLAPSE_STORAGE_KEY = 'query-project.duplicate-row-collapse';
const SHOW_ALL_VALUE = 'show-all';

function getPreferenceStorage() {
  try {
    return globalThis.window?.localStorage || globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readStoredDuplicateRowCollapsePreference() {
  return getPreferenceStorage()?.getItem?.(DUPLICATE_ROW_COLLAPSE_STORAGE_KEY) !== SHOW_ALL_VALUE;
}

function writeStoredDuplicateRowCollapsePreference(active) {
  try {
    getPreferenceStorage()?.setItem?.(
      DUPLICATE_ROW_COLLAPSE_STORAGE_KEY,
      active ? 'collapse' : SHOW_ALL_VALUE
    );
  } catch {
    // Storage may be blocked in private browsing or embedded contexts.
  }
}

function getToggleButtons() {
  return Array.from(document.querySelectorAll('[data-duplicate-rows-toggle]'));
}

function updateDuplicateRowsToggleVisualState(active) {
  const toggleButtons = getToggleButtons();
  if (!toggleButtons.length) return;

  const tooltip = active
    ? 'Duplicate visible rows collapse into one row. Click to show all rows.'
    : 'Showing duplicate visible rows. Click to collapse matching rows.';
  const label = active ? 'Show duplicate visible rows' : 'Collapse duplicate visible rows';

  toggleButtons.forEach(toggleBtn => {
    toggleBtn.classList.toggle('table-toolbar-btn-active', active);
    toggleBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    toggleBtn.setAttribute('aria-label', label);
    toggleBtn.setAttribute('data-tooltip', tooltip);
    toggleBtn.setAttribute('data-mobile-label', active ? 'Unique' : 'All Rows');
    const title = toggleBtn.querySelector('[data-duplicate-rows-toggle-title]');
    const detail = toggleBtn.querySelector('[data-duplicate-rows-toggle-detail]');
    if (title) title.textContent = active ? 'Unique rows' : 'All rows';
    if (detail) detail.textContent = active ? 'Collapsing matching visible rows' : 'Showing duplicate visible rows';
  });
}

function setDuplicateRowCollapsePreference(nextValue, options = {}) {
  const active = nextValue !== false;
  if (options.persist !== false) {
    writeStoredDuplicateRowCollapsePreference(active);
  }

  if (options.syncService !== false) {
    appServices.setDuplicateRowCollapseMode?.(active, {
      notify: options.notify !== false,
      refreshView: options.refreshView !== false,
      resetScroll: false,
      toast: options.toast !== false
    });
  }
  updateDuplicateRowsToggleVisualState(active);
  appUiActions.updateButtonStates();

  if (options.announce) {
    showToastMessage(
      active ? 'Duplicate visible rows will collapse' : 'Showing all visible duplicate rows',
      'info'
    );
  }

  return active;
}

function updateDuplicateRowsToggleState() {
  updateDuplicateRowsToggleVisualState(appServices.isDuplicateRowCollapseActive?.() !== false);
}

function attachDuplicateRowsToggleUi() {
  const toggleButtons = getToggleButtons();
  if (!toggleButtons.length) {
    return;
  }

  setDuplicateRowCollapsePreference(readStoredDuplicateRowCollapsePreference(), {
    announce: false,
    notify: false,
    persist: false,
    refreshView: false,
    toast: false
  });

  toggleButtons.forEach(toggleBtn => {
    if (toggleBtn.dataset.bound === 'true') return;
    toggleBtn.addEventListener('click', () => {
      const current = appServices.isDuplicateRowCollapseActive?.() !== false;
      setDuplicateRowCollapsePreference(!current, { announce: true });
    });
    toggleBtn.dataset.bound = 'true';
  });
}

const duplicateRowsToggleUi = Object.freeze({
  attach: attachDuplicateRowsToggleUi,
  isActive: () => appServices.isDuplicateRowCollapseActive?.() !== false,
  resetDuplicateRowsToggleUI() {
    setDuplicateRowCollapsePreference(false, { announce: false, syncService: false });
  },
  setDuplicateRowsToggleUIActive() {
    setDuplicateRowCollapsePreference(true, { announce: false, syncService: false });
  },
  updateDuplicateRowsToggleState
});

registerAppUiActionDependencies({ duplicateRowsUi: duplicateRowsToggleUi });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachDuplicateRowsToggleUi, { once: true });
} else {
  attachDuplicateRowsToggleUi();
}

export {
  DUPLICATE_ROW_COLLAPSE_STORAGE_KEY,
  attachDuplicateRowsToggleUi,
  duplicateRowsToggleUi,
  readStoredDuplicateRowCollapsePreference,
  setDuplicateRowCollapsePreference
};
