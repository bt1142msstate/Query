/**
 * Table-name input sizing and header layout helpers.
 */
import { appUiActions } from '../../core/appUiActions.js';
import { DOM } from '../../core/domCache.js';

let TableNameInput;

(function registerTableNameInput() {
  const dom = DOM;
  const uiActions = appUiActions;
  let initialized = false;

  function updateHeaderHeightVar() {
    const header = dom.headerBar;
    if (!header) {
      return;
    }

    document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
  }

  function bindTableNameInput() {
    const tableNameInput = dom.tableNameInput;
    if (!tableNameInput) {
      return;
    }

    tableNameInput.placeholder = 'No name';

    tableNameInput.addEventListener('input', () => {
      uiActions.updateQueryJson();
    });

    tableNameInput.addEventListener('blur', () => {
      uiActions.updateButtonStates();
    });

    tableNameInput.addEventListener('focus', () => {
      tableNameInput.classList.remove('error');
    });
  }

  function initialize() {
    if (initialized) {
      return;
    }

    initialized = true;
    updateHeaderHeightVar();
    bindTableNameInput();
    window.addEventListener('resize', updateHeaderHeightVar);
  }

  TableNameInput = Object.freeze({
    initialize
  });
})();

export { TableNameInput };
