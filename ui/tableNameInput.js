/**
 * Table-name input sizing and header layout helpers.
 */
import { appUiActions } from '../core/appUiActions.js';
import { DOM } from '../core/domCache.js';

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

  function measureInputWidth(input, maxWidth) {
    const temp = document.createElement('span');
    temp.style.visibility = 'hidden';
    temp.style.position = 'absolute';
    temp.style.fontSize = getComputedStyle(input).fontSize;
    temp.style.fontFamily = getComputedStyle(input).fontFamily;
    temp.style.fontWeight = getComputedStyle(input).fontWeight;
    temp.style.padding = getComputedStyle(input).padding;
    temp.textContent = input.value || input.placeholder;
    document.body.appendChild(temp);

    const textWidth = temp.offsetWidth + 20;
    document.body.removeChild(temp);
    return Math.max(200, Math.min(maxWidth, textWidth));
  }

  function bindTableNameInput() {
    const tableNameInput = dom.tableNameInput;
    if (!tableNameInput) {
      return;
    }

    tableNameInput.placeholder = 'No name';

    function autoResizeInput() {
      const toolbarWidth = dom.tableToolbar ? dom.tableToolbar.offsetWidth : 0;
      const maxWidth = dom.tableTopBar
        ? Math.max(240, dom.tableTopBar.offsetWidth - toolbarWidth - 64)
        : 400;
      tableNameInput.style.width = `${measureInputWidth(tableNameInput, maxWidth)}px`;
    }

    autoResizeInput();

    tableNameInput.addEventListener('input', () => {
      autoResizeInput();
      uiActions.updateQueryJson();
    });

    tableNameInput.addEventListener('blur', () => {
      uiActions.updateButtonStates();
    });

    tableNameInput.addEventListener('focus', () => {
      tableNameInput.classList.remove('error');
    });

    window.addEventListener('resize', autoResizeInput);
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
