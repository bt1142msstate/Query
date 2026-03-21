/**
 * Table-name input sizing and header layout helpers.
 */
(function initializeTableNameInput() {
  const dom = window.DOM;

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
      window.updateQueryJson?.();
    });

    tableNameInput.addEventListener('blur', () => {
      window.updateButtonStates?.();
    });

    tableNameInput.addEventListener('focus', () => {
      if (tableNameInput.value === 'Query Results') {
        tableNameInput.select();
      }
      tableNameInput.classList.remove('error');
    });

    window.addEventListener('resize', autoResizeInput);
  }

  window.onDOMReady(() => {
    updateHeaderHeightVar();
    bindTableNameInput();
  });
  window.addEventListener('resize', updateHeaderHeightVar);
})();
